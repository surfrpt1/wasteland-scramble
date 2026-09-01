import Phaser from 'phaser';
import { GAME_CONFIG, COLORS } from '../utils/constants.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create() {
        const cx = GAME_CONFIG.WIDTH / 2;
        const cy = GAME_CONFIG.HEIGHT / 2;

        this.sound = this.registry.get('sound');
        // Start the theme music on the menu (lazy: no-op until audio unlocked).
        if (this.sound) this.sound.startMusic();

        // Title
        const titleStyle = {
            fontSize: '48px',
            fontFamily: 'monospace',
            color: '#ccaa44',
            stroke: '#1a0a00',
            strokeThickness: 4,
        };
        this.add.text(cx, cy - 180, 'WASTELAND', titleStyle).setOrigin(0.5);
        this.add.text(cx, cy - 120, 'SCRAMBLE', {
            ...titleStyle,
            fontSize: '56px',
            color: '#ff6600',
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(cx, cy - 60, 'Post-Apocalyptic Arena Combat', {
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#887755',
        }).setOrigin(0.5);

        // --- NAME INPUT ---
        this.add.text(cx, cy + 10, 'ENTER YOUR NAME:', {
            fontSize: '14px', fontFamily: 'monospace', color: '#ccaa44',
        }).setOrigin(0.5);

        const savedName = localStorage.getItem('ws_player_name') || 'Player';

        // Create DOM input element
        const canvas = this.sys.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / GAME_CONFIG.WIDTH;
        const scaleY = rect.height / GAME_CONFIG.HEIGHT;

        this.nameInputElement = document.createElement('input');
        this.nameInputElement.type = 'text';
        this.nameInputElement.value = savedName;
        this.nameInputElement.maxLength = 16;
        this.nameInputElement.placeholder = 'Player';
        this.nameInputElement.style.cssText = `
            position: absolute;
            width: 260px;
            height: 36px;
            font-size: 20px;
            font-family: monospace;
            text-align: center;
            color: #ffffff;
            background: #1a0a00;
            border: 2px solid #ccaa44;
            border-radius: 4px;
            outline: none;
            z-index: 10;
        `;
        document.body.appendChild(this.nameInputElement);

        // Position it over the canvas
        this.positionNameInput();

        // Re-position on resize
        this.resizeHandler = () => this.positionNameInput();
        window.addEventListener('resize', this.resizeHandler);
        this.scale.on('resize', this.resizeHandler);

        // Buttons
        this.createButton(cx, cy + 110, 'LOCAL BATTLE', () => {
            this.saveName();
            this.scene.start('GameScene', { mode: 'ffa' });
        });

        this.createButton(cx, cy + 170, 'PRACTICE VS BOTS', () => {
            this.saveName();
            this.scene.start('GameScene', { mode: 'practice' });
        });

        this.createButton(cx, cy + 230, 'ONLINE (EXPERIMENTAL)', () => {
            this.saveName();
            this.scene.start('LobbyScene');
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
            'SHIFT - Slide    |    Q - Wall Cling    |    1-4 - Switch Weapons    |    M - Sound',
        ].join('\n'), controlsStyle).setOrigin(0.5);

        this.add.text(cx, GAME_CONFIG.HEIGHT - 20, 'v0.1.0 - Prototype', {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#443322',
        }).setOrigin(0.5);

        // Sound toggle button (top-left; persists across the session via registry)
        this.soundOn = this.registry.get('soundEnabled') !== false;
        if (this.sound) { this.sound.enabled = this.soundOn; this.sound.setMaster(this.soundOn); }
        this.createToggleButton(24, 24, this.soundOn, (label, isOn) => {
            this.soundOn = isOn;
            this.registry.set('soundEnabled', isOn);
            if (this.sound) { this.sound.enabled = isOn; this.sound.setMaster(isOn); }
            label.setText(isOn ? 'SOUND: ON' : 'SOUND: OFF');
            label.setColor(isOn ? '#aaffaa' : '#ff6666');
        });

        // Store initial name in registry
        this.registry.set('playerName', savedName);
    }

    positionNameInput() {
        if (!this.nameInputElement) return;
        const canvas = this.sys.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / GAME_CONFIG.WIDTH;
        const scaleY = rect.height / GAME_CONFIG.HEIGHT;
        const cx = GAME_CONFIG.WIDTH / 2;
        const cy = GAME_CONFIG.HEIGHT / 2;
        this.nameInputElement.style.left = (rect.left + (cx - 130) * scaleX) + 'px';
        this.nameInputElement.style.top = (rect.top + (cy + 22) * scaleY) + 'px';
        this.nameInputElement.style.transform = `scale(${scaleX}, ${scaleY})`;
        this.nameInputElement.style.transformOrigin = 'top left';
    }

    saveName() {
        const name = (this.nameInputElement ? this.nameInputElement.value : '').trim().slice(0, 16) || 'Player';
        localStorage.setItem('ws_player_name', name);
        this.registry.set('playerName', name);
        // Clean up DOM element
        if (this.nameInputElement && this.nameInputElement.parentNode) {
            this.nameInputElement.parentNode.removeChild(this.nameInputElement);
            this.nameInputElement = null;
        }
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

        bg.on('pointerdown', () => { if (this.sound) this.sound.click(); callback(); });
        return { bg, label };
    }

    createToggleButton(x, y, initialOn, onToggle) {
        const bg = this.add.rectangle(x, y, 116, 32, 0x2a1a10, 0.85)
            .setStrokeStyle(1, 0xccaa44)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(x, y, initialOn ? 'SOUND: ON' : 'SOUND: OFF', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: initialOn ? '#aaffaa' : '#ff6666',
        }).setOrigin(0.5);

        bg.on('pointerover', () => {
            bg.setFillStyle(0x3d2b1f);
            const c = label.color;
            label.setColor(c === '#aaffaa' ? '#ccffcc' : '#ff8888');
        });
        bg.on('pointerout', () => { bg.setFillStyle(0x2a1a10); });
        bg.on('pointerdown', () => {
            if (this.sound) this.sound.click();
            onToggle(label, !initialOn);
            initialOn = !initialOn;
        });
        return { bg, label };
    }

    shutdown() {
        // Stop the theme music when leaving the menu.
        if (this.sound) this.sound.stopMusic();
        // Clean up DOM element on scene exit
        if (this.nameInputElement && this.nameInputElement.parentNode) {
            this.nameInputElement.parentNode.removeChild(this.nameInputElement);
            this.nameInputElement = null;
        }
        window.removeEventListener('resize', this.resizeHandler);
        this.scale.off('resize', this.resizeHandler);
    }
}
