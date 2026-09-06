import Phaser from 'phaser';
import { WEAPON_CONFIG } from '../utils/constants.js';

export class WeaponSystem {
    constructor(scene) {
        this.scene = scene;
        this.currentWeapon = 'SCRAP_RIFLE';
        this.lastFired = 0;
        this.isReloading = false;
        this.reloadStart = 0;

        // Magazine ammo only (like Mini Militia). Reload replenishes from infinite reserve.
        this.mag = {};
        for (const [key, config] of Object.entries(WEAPON_CONFIG)) {
            this.mag[key] = config.ammo;
        }

        this.projectiles = scene.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 100,
        });
        // Remote bullets fired by OTHER online players. Simulated only on THIS
        // client so they can collide with the local player's real body.
        this.remoteProjectiles = scene.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 100,
        });
        // Guard against duplicate 'shot' fx events for the same remote weapon
        // arriving back-to-back (e.g. a server echo or a listener firing twice),
        // which would stack two bombs on the local client from a single shot.
        this.lastRemoteShot = {};
        // Debug counters surfaced on the in-game HUD (FIRE / REMOTE) so we can
        // tell whether the client is spawning extra bombs during testing.
        this.debugFire = 0;
        this.debugRemote = 0;
    }

    get config() {
        return WEAPON_CONFIG[this.currentWeapon];
    }

    switchWeapon(weaponKey) {
        if (WEAPON_CONFIG[weaponKey] && !this.isReloading) {
            this.currentWeapon = weaponKey;
            this.isReloading = false;
        }
    }

    get isReloadingWeapon() {
        return this.isReloading;
    }

    // Convenience accessor for the shared procedural sound manager.
    get audio() {
        if (!this._audio) this._audio = this.scene.registry.get('sound');
        return this._audio;
    }

    get reloadProgress() {
        if (!this.isReloading) return 1;
        const elapsed = this.scene.time.now - this.reloadStart;
        const dur = this.config.reloadTime || 1500;
        return Math.min(1, elapsed / dur);
    }

    reload(time) {
        const cfg = this.config;
        if (this.isReloading) return;
        if (this.mag[this.currentWeapon] >= cfg.ammo) return; // already full

        this.isReloading = true;
        this.reloadStart = time;
        if (this.audio) this.audio.reload();

        const dur = cfg.reloadTime || 1500;
        this.scene.time.delayedCall(dur, () => {
            this.mag[this.currentWeapon] = cfg.ammo;
            this.isReloading = false;
        });
    }

    canFire(time) {
        if (this.isReloading) return false;
        if (time - this.lastFired < this.config.fireRate) return false;
        if (this.mag[this.currentWeapon] <= 0) return false;
        return true;
    }

    fire(x, y, angle, time, shooter) {
        const cfg = this.config;
        if (!this.canFire(time)) return;

        this.lastFired = time;
        this.mag[this.currentWeapon]--;

        const spread = (Math.random() - 0.5) * cfg.spread * 2;
        const finalAngle = angle + spread;

        // Gunshot sound (procedural, tailored per weapon)
        if (this.audio) this.audio.shot(this.currentWeapon);

        // Spawn at the muzzle tip so the projectile visibly leaves the gun,
        // and inherit the shooter's velocity so shots stay accurate while
        // moving (running shots hit where you are aiming, not behind you).
        const muzzle = 22;
        const sx = x + Math.cos(finalAngle) * muzzle;
        const sy = y + Math.sin(finalAngle) * muzzle;

        let inheritX = 0;
        let inheritY = 0;
        if (shooter && shooter.sprite && shooter.sprite.body) {
            inheritX = shooter.sprite.body.velocity.x * 0.5;
            inheritY = shooter.sprite.body.velocity.y * 0.5;
        }

        const bullet = this.projectiles.get(sx, sy, 'bullet');
        if (bullet) {
            // Reusing a pooled bullet: cancel any stale despawn/explode timer
            // left over from a previous shot so it can't fire early on this one.
            if (bullet.despawnTimer) { bullet.despawnTimer.remove(false); bullet.despawnTimer = null; }
            bullet.setActive(true).setVisible(true);
            bullet.body.enable = true;
            bullet.setTint(cfg.color);
            bullet.setScale(cfg.explosive ? 1.5 : 1);

            const vx = Math.cos(finalAngle) * cfg.bulletSpeed + inheritX;
            const vy = Math.sin(finalAngle) * cfg.bulletSpeed + inheritY;
            bullet.body.setVelocity(vx, vy);
            bullet.setRotation(finalAngle);
            bullet.damage = cfg.damage;
            bullet.explosive = cfg.explosive || false;
            bullet.explosionRadius = cfg.explosionRadius || 0;
            // Birth stamp + spawn-grace ticks. The skip counter lets a projectile
            // (especially a Pipe Bomb) clear the launch position before any
            // surface/player contact can detonate it, so a bomb thrown right
            // next to a wall doesn't instantly pop at the thrower's feet. This
            // mirrors the server's skip grace (server.mjs).
            bullet.born = this.scene.time.now;
            bullet.skip = bullet.explosive ? 2 : 0;

            // Explosive projectiles (Pipe Bomb) now explode when their lifetime expires,
            // so they don't disappear mid-air. They also explode on contact with surfaces/players.
            this.debugFire++;
            bullet.despawnTimer = this.scene.time.delayedCall(cfg.bulletLifetime, () => {
                bullet.despawnTimer = null;
                if (bullet.active) {
                    // Online: the server detonates expiring bombs and broadcasts
                    // the single authoritative 'boom'. Only render locally when
                    // there is no server to do it (practice/ffa).
                    if (bullet.explosive && (!this.scene || this.scene.gameMode !== 'online')) {
                        this.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage, null);
                    }
                    this.deactivateBullet(bullet);
                }
            });
        }

        // Auto-reload when mag empties
        if (this.mag[this.currentWeapon] <= 0) {
            this.reload(time);
        }

        return -Math.cos(angle) * cfg.recoil;
    }

    // Fire a bullet on behalf of a remote online player. Does NOT touch local
    // ammo/reload state. The remote bullet stays in its own group so it can only
    // collide with the local player (see GameScene online wiring).
    fireRemote(x, y, angle, weaponKey) {
        const cfg = WEAPON_CONFIG[weaponKey] || WEAPON_CONFIG.SCRAP_RIFLE;

        // Deduplicate: ignore an immediate re-fire of the SAME weapon within a
        // fraction of its fire rate. The server only relays one 'shot' per real
        // fire, so two within this window means a duplicate event, not a
        // legitimate rapid shot (which can never beat the weapon's own fireRate).
        const now = this.scene ? this.scene.time.now : 0;
        if (this.lastRemoteShot) {
            const prev = this.lastRemoteShot[weaponKey] || 0;
            if (now - prev < cfg.fireRate * 0.5) return null;
            this.lastRemoteShot[weaponKey] = now;
        }

        const spread = (Math.random() - 0.5) * cfg.spread * 2;
        const finalAngle = angle + spread;

        // Match the local fire() muzzle offset so remote shots line up with
        // the opponent's gun sprite.
        const muzzle = 22;
        const sx = x + Math.cos(finalAngle) * muzzle;
        const sy = y + Math.sin(finalAngle) * muzzle;

        const bullet = this.remoteProjectiles.get(sx, sy, 'bullet');
        if (bullet) {
            bullet.setActive(true).setVisible(true);
            bullet.body.enable = true;
            bullet.setTint(cfg.color);
            bullet.setScale(cfg.explosive ? 1.5 : 1);

            const vx = Math.cos(finalAngle) * cfg.bulletSpeed;
            const vy = Math.sin(finalAngle) * cfg.bulletSpeed;
            bullet.body.setVelocity(vx, vy);
            bullet.setRotation(finalAngle);
            bullet.damage = cfg.damage;
            bullet.explosive = cfg.explosive || false;
            bullet.explosionRadius = cfg.explosionRadius || 0;
            bullet.weaponKey = weaponKey;
            bullet.born = this.scene.time.now;
            bullet.skip = bullet.explosive ? 2 : 0;

            // Explosive projectiles (Pipe Bomb) detonate when their lifetime
            // expires so they never vanish mid-air - same behavior as the
            // local fire() path (the remote bomb is client-simulated too).
            this.debugRemote++;
            bullet.despawnTimer = this.scene.time.delayedCall(cfg.bulletLifetime, () => {
                bullet.despawnTimer = null;
                if (bullet.active) {
                    if (bullet.explosive && (!this.scene || this.scene.gameMode !== 'online')) {
                        this.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage, null);
                    }
                    this.deactivateBullet(bullet, true);
                }
            });
        }
        return bullet;
    }

    createExplosion(x, y, radius, damage, sourceIdx) {
        // Note this blast as locally-rendered so the server's 'boom' echo for
        // the same explosion is suppressed (one bomb -> one blast, not two).
        if (this.scene && this.scene.recordLocalBlast) this.scene.recordLocalBlast(x, y);

        // Explosion sound
        if (this.audio) this.audio.explosion();

        const explosion = this.scene.add.image(x, y, 'explosion');
        explosion.setScale(radius / 16);
        explosion.setAlpha(0.8);
        explosion.setDepth(15);

        this.scene.tweens.add({
            targets: explosion,
            alpha: 0,
            scale: explosion.scale * 1.5,
            duration: 300,
            onComplete: () => explosion.destroy(),
        });

        for (let idx = 0; idx < this.scene.players.length; idx++) {
            const player = this.scene.players[idx];
            if (!player.isAlive) continue;
            // The launcher IS hurt by their own blast: a bomb lobbed into a wall
            // in front of you, or one that lands on / near you, damages you too.
            // So throw carefully, and don't stand on your own bomb.
            const dx = player.sprite.x - x;
            const dy = player.sprite.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius) {
                const falloff = 1 - (dist / radius);
                player.lastHitFrom = sourceIdx !== undefined ? sourceIdx : player.lastHitFrom;
                player.takeDamage(damage * falloff);
            }
        }
    }

    deactivateBullet(bullet) {
        if (bullet.despawnTimer) { bullet.despawnTimer.remove(false); bullet.despawnTimer = null; }
        bullet.setActive(false).setVisible(false);
        bullet.body.enable = false;
        bullet.body.setVelocity(0, 0);
    }

    addAmmo(weaponKey, amount) {
        if (this.mag[weaponKey] !== undefined) {
            this.mag[weaponKey] = Math.min(this.mag[weaponKey] + amount, WEAPON_CONFIG[weaponKey].ammo);
        }
    }
}
