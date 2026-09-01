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

    fire(x, y, angle, time) {
        const cfg = this.config;
        if (!this.canFire(time)) return;

        this.lastFired = time;
        this.mag[this.currentWeapon]--;

        const spread = (Math.random() - 0.5) * cfg.spread * 2;
        const finalAngle = angle + spread;

        // Gunshot sound (procedural, tailored per weapon)
        if (this.audio) this.audio.shot(this.currentWeapon);

        const bullet = this.projectiles.get(x, y, 'bullet');
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

            this.scene.time.delayedCall(cfg.bulletLifetime, () => {
                if (bullet.active) {
                    if (bullet.explosive) {
                        this.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
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
        const spread = (Math.random() - 0.5) * cfg.spread * 2;
        const finalAngle = angle + spread;

        const bullet = this.remoteProjectiles.get(x, y, 'bullet');
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

            this.scene.time.delayedCall(cfg.bulletLifetime, () => {
                if (bullet.active) {
                    if (bullet.explosive) {
                        this.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                    }
                    this.deactivateBullet(bullet, true);
                }
            });
        }
        return bullet;
    }

    createExplosion(x, y, radius, damage) {
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

        for (const player of this.scene.players) {
            if (!player.isAlive) continue;
            const dx = player.sprite.x - x;
            const dy = player.sprite.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < radius) {
                const falloff = 1 - (dist / radius);
                player.takeDamage(damage * falloff);
            }
        }
    }

    deactivateBullet(bullet) {
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
