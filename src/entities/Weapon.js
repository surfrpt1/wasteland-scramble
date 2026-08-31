import Phaser from 'phaser';
import { WEAPON_CONFIG } from '../utils/constants.js';

export class WeaponSystem {
    constructor(scene) {
        this.scene = scene;
        this.currentWeapon = 'SCRAP_RIFLE';
        this.lastFired = 0;
        this.ammo = {};
        this.projectiles = scene.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 100,
        });

        for (const [key, config] of Object.entries(WEAPON_CONFIG)) {
            this.ammo[key] = config.ammo;
        }
    }

    get config() {
        return WEAPON_CONFIG[this.currentWeapon];
    }

    switchWeapon(weaponKey) {
        if (WEAPON_CONFIG[weaponKey]) {
            this.currentWeapon = weaponKey;
        }
    }

    fire(x, y, angle, time) {
        const cfg = this.config;
        if (time - this.lastFired < cfg.fireRate) return;
        if (this.ammo[this.currentWeapon] <= 0) return;

        this.lastFired = time;
        this.ammo[this.currentWeapon]--;

        const spread = (Math.random() - 0.5) * cfg.spread * 2;
        const finalAngle = angle + spread;

        const bullet = this.projectiles.get(x, y, 'bullet');
        if (!bullet) return;

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
        bullet.firedBy = null;

        this.scene.time.delayedCall(cfg.bulletLifetime, () => {
            if (bullet.active) {
                if (bullet.explosive) {
                    this.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                }
                this.deactivateBullet(bullet);
            }
        });

        // Recoil
        return -Math.cos(angle) * cfg.recoil;
    }

    createExplosion(x, y, radius, damage) {
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

        // Damage nearby players
        const players = this.scene.players;
        for (const player of players) {
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
        if (this.ammo[weaponKey] !== undefined) {
            this.ammo[weaponKey] = Math.min(
                this.ammo[weaponKey] + amount,
                WEAPON_CONFIG[weaponKey].ammo * 2
            );
        }
    }

    getAmmoDisplay() {
        return `${this.config.name}: ${this.ammo[this.currentWeapon]}`;
    }
}
