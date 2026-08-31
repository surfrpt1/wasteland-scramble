import Phaser from 'phaser';
import { GAME_CONFIG } from '../utils/constants.js';

export class TouchControls {
    constructor(scene) {
        this.scene = scene;

        // Virtual input state - merged with keyboard
        this.state = {
            left: false,
            right: false,
            jump: false,
            jumpPressed: false,
            shoot: false,
            shootPressed: false,
            grapple: false,
            grapplePressed: false,
            reload: false,
            reloadPressed: false,
            aimX: GAME_CONFIG.WIDTH / 2,
            aimY: GAME_CONFIG.HEIGHT / 2,
            anyTouch: false,
        };

        // Touch tracking
        this.joystickTouch = null;
        this.buttonTouches = {};

        this.buildUI();

        // Listen to pointer events on the game canvas
        scene.input.on('pointerdown', this.onDown, this);
        scene.input.on('pointermove', this.onMove, this);
        scene.input.on('pointerup', this.onUp, this);
        scene.input.on('pointercancel', this.onUp, this);
    }

    buildUI() {
        const scene = this.scene;
        const ui = scene.add.container(0, 0).setScrollFactor(0).setDepth(300);
        this.ui = ui;

        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const pad = 60;

        // ===== MOVEMENT JOYSTICK (bottom-left) =====
        const joyRadius = 55;
        this.joyBase = scene.add.circle(pad + joyRadius, H - pad - joyRadius, joyRadius, 0xffffff, 0.15)
            .setStrokeStyle(3, 0xffffff, 0.4);
        this.joyKnob = scene.add.circle(pad + joyRadius, H - pad - joyRadius, 28, 0xffffff, 0.5);
        ui.add([this.joyBase, this.joyKnob]);
        this.joyBase.setVisible(false);
        this.joyKnob.setVisible(false);

        // ===== ACTION BUTTONS (bottom-right) =====
        const btnR = 32;
        // Shoot (big right button)
        this.btnShoot = this.makeButton(W - pad - btnR - 60, H - pad - btnR - 30, btnR + 8, 'FIRE', 0xcc4444);
        // Jump (smaller, above-left of shoot)
        this.btnJump = this.makeButton(W - pad - btnR - 60 - 80, H - pad - btnR - 70, btnR - 2, 'JUMP', 0x44cc44);
        // Grapple (left of fire)
        this.btnGrapple = this.makeButton(W - pad - btnR - 60 - 150, H - pad - btnR, btnR - 4, 'HOOK', 0xccaa44);
        // Reload (top-left of fire)
        this.btnReload = this.makeButton(W - pad - btnR - 60 - 150, H - pad - btnR - 140, btnR - 6, 'RELOAD', 0x8888cc);

        // Weapon switch (middle-right, small)
        this.weaponButtons = [];
        const weaponLabels = ['1', '2', '3', '4'];
        const startX = W - 60 - 4 * 44;
        for (let i = 0; i < 4; i++) {
            const b = this.makeButton(startX + i * 44 + 22, H / 2 - 20, 18, weaponLabels[i], 0x2a2a2a, true);
            this.weaponButtons.push(b);
        }
    }

    makeButton(x, y, r, label, color, small = false) {
        const scene = this.scene;
        const circle = scene.add.circle(x, y, r, color, 0.45)
            .setStrokeStyle(3, 0xffffff, 0.6);
        const text = scene.add.text(x, y, label, {
            fontSize: small ? '12px' : '13px',
            fontFamily: 'monospace',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.ui.add([circle, text]);
        const btn = { x, y, r, circle, text, touchId: null };
        return btn;
    }

    onDown(pointer, currentlyOver) {
        // Only respond to touch pointers (mouse clicks go to normal aim/shoot)
        if (pointer.pointerType !== 'touch') {
            return;
        }

        const x = pointer.x;
        const y = pointer.y;

        // Check weapon buttons first
        for (let i = 0; i < this.weaponButtons.length; i++) {
            const b = this.weaponButtons[i];
            if (this.hitCircle(b, x, y)) {
                this.scene.selectWeapon(['SCRAP_RIFLE', 'NAIL_GUN', 'PIPE_BOMB', 'ACID_SPRAYER'][i]);
                return;
            }
        }

        // Check action buttons
        if (this.hitCircle(this.btnShoot, x, y)) {
            this.state.shoot = true;
            this.state.shootPressed = true;
            this.setAimForButton(this.btnShoot);
            return;
        }
        if (this.hitCircle(this.btnJump, x, y)) {
            if (!this.state.jump) this.state.jumpPressed = true;
            this.state.jump = true;
            return;
        }
        if (this.hitCircle(this.btnGrapple, x, y)) {
            this.state.grapple = true;
            this.state.grapplePressed = true;
            return;
        }
        if (this.hitCircle(this.btnReload, x, y)) {
            this.state.reloadPressed = true;
            return;
        }

        // Otherwise, joystick (movement)
        this.joystickTouch = pointer.id || 1;
        this.joyBase.setVisible(true).setPosition(x, y);
        this.joyKnob.setVisible(true).setPosition(x, y);
        this.joyOrigin = { x, y };
        this.state.anyTouch = true;
    }

    onMove(pointer) {
        if (this.joystickTouch !== null && (pointer.id || 1) === this.joystickTouch) {
            const dx = pointer.x - this.joyOrigin.x;
            const dy = pointer.y - this.joyOrigin.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const max = 55;
            const clamp = Math.min(len, max);

            const nx = len > 0 ? dx / len : 0;
            const ny = len > 0 ? dy / len : 0;

            this.joyKnob.setPosition(this.joyOrigin.x + nx * clamp, this.joyOrigin.y + ny * clamp);

            // Dead zone
            const dead = 10;
            const magnitude = Math.min(1, Math.max(0, (len - dead) / (max - dead)));
            this.state.left = nx < -0.3 && magnitude > 0.15;
            this.state.right = nx > 0.3 && magnitude > 0.15;
        }
    }

    onUp(pointer) {
        if (this.joystickTouch !== null && (pointer.id || 1) === this.joystickTouch) {
            this.joystickTouch = null;
            this.joyBase.setVisible(false);
            this.joyKnob.setVisible(false);
            this.state.left = false;
            this.state.right = false;
            this.state.anyTouch = false;
        }
        // Release buttons
        this.state.shoot = false;
        this.state.jump = false;
        this.state.grapple = false;
    }

    setAimForButton() {
        // Aim horizontally toward the enemy? For touch, aim toward nearest enemy
        const player = this.scene.players[0];
        let tx = this.state.aimX;
        let ty = this.state.aimY;
        if (player) {
            const nearest = this.scene.players
                .filter(p => p !== player && p.isAlive)
                .sort((a, b) =>
                    Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, a.sprite.x, a.sprite.y) -
                    Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, b.sprite.x, b.sprite.y)
                )[0];
            if (nearest) {
                const dxCam = player.sprite.x - this.scene.cameras.main.scrollX;
                const dyCam = player.sprite.y - this.scene.cameras.main.scrollY;
                const ndx = nearest.sprite.x - player.sprite.x;
                const ndy = nearest.sprite.y - player.sprite.y;
                tx = dxCam + ndx;
                ty = dyCam + ndy;
            }
        }
        this.state.aimX = tx;
        this.state.aimY = ty;
    }

    hitCircle(btn, x, y) {
        const dx = x - btn.x;
        const dy = y - btn.y;
        return (dx * dx + dy * dy) <= (btn.r + 10) * (btn.r + 10);
    }

    // Merge touch state into the keyboard cursors state passed to Player
    applyTo(state) {
        // state is the cursors object passed to player.update
        state.left.isDown = state.left.isDown || this.state.left;
        state.right.isDown = state.right.isDown || this.state.right;
        state.up.isDown = state.up.isDown || this.state.jump;
        state.jump.isDown = state.jump.isDown || this.state.jump;
        state.slide.isDown = false;
        state.wallCling.isDown = false;

        // Store shoot/grapple flags for GameScene to read
        state._virtualShoot = this.state.shoot;
        state._virtualGrapple = this.state.grapple;
        return state;
    }

    consumePressed() {
        this.state.shootPressed = false;
        this.state.jumpPressed = false;
        this.state.grapplePressed = false;
        this.state.reloadPressed = false;
    }
}
