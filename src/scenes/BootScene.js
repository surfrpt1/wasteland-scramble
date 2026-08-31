import Phaser from 'phaser';
import { GAME_CONFIG, COLORS } from '../utils/constants.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        this.generateAssets();
    }

    create() {
        this.scene.start('MenuScene');
    }

    generateAssets() {
        const g = this.make.graphics({ add: false });

        // Player sprite
        g.clear();
        g.fillStyle(COLORS.PLAYER_1, 1);
        g.fillRect(2, 0, 24, 12);
        g.fillRect(6, 12, 16, 20);
        g.fillRect(4, 32, 8, 8);
        g.fillRect(16, 32, 8, 8);
        g.fillStyle(0xffffff, 1);
        g.fillRect(22, 2, 4, 4);
        g.generateTexture('player', 28, 40);

        // Bullet
        g.clear();
        g.fillStyle(COLORS.BULLET, 1);
        g.fillRect(0, 0, 6, 4);
        g.generateTexture('bullet', 6, 4);

        // Grapple hook
        g.clear();
        g.fillStyle(COLORS.GRAPPLE, 1);
        g.fillRect(0, 0, 8, 8);
        g.fillStyle(0xffffff, 1);
        g.fillRect(2, 2, 4, 4);
        g.generateTexture('grapple_hook', 8, 8);

        // Ground tile
        g.clear();
        g.fillStyle(COLORS.GROUND_TOP, 1);
        g.fillRect(0, 0, 32, 4);
        g.fillStyle(COLORS.GROUND, 1);
        g.fillRect(0, 4, 32, 28);
        g.lineStyle(1, 0x2a1a10, 0.3);
        for (let i = 0; i < 5; i++) {
            const x1 = Math.random() * 32;
            const y1 = 4 + Math.random() * 28;
            g.lineBetween(x1, y1, x1 + 4 + Math.random() * 8, y1 + Math.random() * 4);
        }
        g.generateTexture('ground', 32, 32);

        // Wall tile
        g.clear();
        g.fillStyle(COLORS.WALL, 1);
        g.fillRect(0, 0, 32, 32);
        g.lineStyle(1, 0x1a0a00, 0.5);
        g.strokeRect(1, 1, 30, 30);
        g.lineStyle(1, 0x4a3a2a, 0.3);
        g.lineBetween(0, 16, 32, 16);
        g.lineBetween(16, 0, 16, 32);
        g.generateTexture('wall', 32, 32);

        // Health pack
        g.clear();
        g.fillStyle(0x44cc44, 1);
        g.fillRect(0, 0, 16, 16);
        g.fillStyle(0xffffff, 1);
        g.fillRect(6, 2, 4, 12);
        g.fillRect(2, 6, 12, 4);
        g.generateTexture('health_pack', 16, 16);

        // Rad zone indicator
        g.clear();
        g.fillStyle(0x44ff00, 0.15);
        g.fillRect(0, 0, 32, 32);
        g.lineStyle(1, 0x44ff00, 0.3);
        g.strokeRect(0, 0, 32, 32);
        g.generateTexture('rad_zone', 32, 32);

        // Weapon pickup
        g.clear();
        g.fillStyle(0xccaa44, 1);
        g.fillRect(0, 4, 20, 8);
        g.fillRect(16, 0, 4, 16);
        g.generateTexture('weapon_pickup', 20, 16);

        // Explosion
        g.clear();
        g.fillStyle(0xff4400, 1);
        g.fillCircle(16, 16, 16);
        g.fillStyle(0xffaa00, 0.8);
        g.fillCircle(16, 16, 10);
        g.fillStyle(0xffff00, 0.6);
        g.fillCircle(16, 16, 5);
        g.generateTexture('explosion', 32, 32);

        g.destroy();
    }
}
