import Phaser from 'phaser';
import { GAME_CONFIG, COLORS } from '../utils/constants.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        const cx = GAME_CONFIG.WIDTH / 2;
        const cy = GAME_CONFIG.HEIGHT / 2;

        // Title
        const titleStyle = {
            fontSize: '48px',
            fontFamily: 'monospace',
            color: '#ccaa44',
            stroke: '#1a0a00',
            strokeThickness: 4,
        };
        this.add.text(cx, cy - 160, 'WASTELAND', titleStyle).setOrigin(0.5);
        this.add.text(cx, cy - 100, 'SCRAMBLE', {
            ...titleStyle,
            fontSize: '56px',
            color: '#ff6600',
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(cx, cy - 40, 'Post-Apocalyptic Arena Combat', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#887755',
        }).setOrigin(0.5);

        // Buttons
        this.createButton(cx, cy + 40, 'LOCAL BATTLE', () => {
            this.scene.start('GameScene', { mode: 'ffa' });
        });

        this.createButton(cx, cy + 100, 'PRACTICE VS BOTS', () => {
            this.scene.start('GameScene', { mode: 'practice' });
        });

        // Controls info
        const controlsStyle = {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#665544',
            align: 'center',
        };
        this.add.text(cx, GAME_CONFIG.HEIGHT - 80, [
            'CONTROLS:',
            'WASD - Move    |    MOUSE - Aim & Shoot',
            'R - Reload    |    RIGHT CLICK - Grapple Hook    |    SPACE - Jump',
            'SHIFT - Slide    |    Q - Wall Cling    |    1-4 - Switch Weapons',
        ].join('\n'), controlsStyle).setOrigin(0.5);

        this.add.text(cx, GAME_CONFIG.HEIGHT - 20, 'v0.1.0 - Prototype', {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#443322',
        }).setOrigin(0.5);
    }

    createButton(x, y, text, callback) {
        const bg = this.add.rectangle(x, y, 280, 44, 0x3d2b1f, 1)
            .setStrokeStyle(2, 0xccaa44)
            .setInteractive({ useHandCursor: true });

        const label = this.add.text(x, y, text, {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: '#e0d0c0',
        }).setOrigin(0.5);

        bg.on('pointerover', () => {
            bg.setFillStyle(0x5c4033);
            label.setColor('#ffffff');
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x3d2b1f);
            label.setColor('#e0d0c0');
        });

        bg.on('pointerdown', callback);
    }
}
