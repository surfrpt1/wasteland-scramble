import Phaser from 'phaser';
import { GAME_CONFIG } from '../utils/constants.js';

const STORE_KEY = 'ws_touch_layout';

const DEFAULT_LAYOUT = {
    joyX: GAME_CONFIG.WIDTH * 0.15,
    joyY: GAME_CONFIG.HEIGHT * 0.82,
    joyR: 55,
    shootX: GAME_CONFIG.WIDTH * 0.87,
    shootY: GAME_CONFIG.HEIGHT * 0.80,
    shootR: 52,
    jumpX: GAME_CONFIG.WIDTH * 0.70,
    jumpY: GAME_CONFIG.HEIGHT * 0.62,
    jumpR: 44,
    hookX: GAME_CONFIG.WIDTH * 0.70,
    hookY: GAME_CONFIG.HEIGHT * 0.84,
    hookR: 40,
    reloadX: GAME_CONFIG.WIDTH * 0.90,
    reloadY: GAME_CONFIG.HEIGHT * 0.56,
    reloadR: 36,
    globalScale: 1,
};

function loadLayout() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) return Object.assign({}, DEFAULT_LAYOUT, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return Object.assign({}, DEFAULT_LAYOUT);
}

const BTN_KEYS = ['shoot', 'jump', 'hook', 'reload'];

export class TouchControls {
    constructor(scene) {
        this.scene = scene;
        this.layout = loadLayout();
        this.settingsMode = false;

        this.state = {
            left: false,
            right: false,
            up: false,
            jump: false,
            jumpPressed: false,
            shoot: false,
            grapple: false,
            reload: false,
            reloadPressed: false,
            anyTouch: false,
        };

        this.joystickTouch = null;
        this.dragTarget = null;
        this.draggingSlider = false;
        this.joyOrigin = { x: 0, y: 0 };

        this.buildUI();
        this.applyLayout();

        scene.input.on('pointerdown', this.onDown, this);
        scene.input.on('pointermove', this.onMove, this);
        scene.input.on('pointerup', this.onUp, this);
        scene.input.on('pointercancel', this.onUp, this);
    }

    circle(x, y, r, color, alpha, stroke) {
        const c = this.scene.add.circle(x, y, r, color, alpha)
            .setStrokeStyle(2, 0xffffff, stroke);
        this.ui.add(c);
        return c;
    }
    label(x, y, text, size = 13, color = '#ffffff') {
        const t = this.scene.add.text(x, y, text, {
            fontSize: size + 'px', fontFamily: 'monospace', color, fontStyle: 'bold',
        }).setOrigin(0.5);
        this.ui.add(t);
        return t;
    }

    buildUI() {
        this.ui = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(300);

        this.joyBase = this.circle(0, 0, 1, 0xffffff, 0.10, 0.35);
        this.joyKnob = this.circle(0, 0, 1, 0xffffff, 0.4, 0);

        this.btnShoot = this.makeButton('shoot', 'FIRE', 0xcc4444);
        this.btnJump = this.makeButton('jump', 'JUMP', 0x44cc44);
        this.btnHook = this.makeButton('hook', 'HOOK', 0xccaa44);
        this.btnReload = this.makeButton('reload', 'RELOAD', 0x8888cc);

        // Gear / settings button, top-right corner (never moves)
        this.btnSettings = this.circle(GAME_CONFIG.WIDTH - 28, 28, 24, 0x222222, 0.85, 0.6);
        this.btnSettings.setDepth(305);
        this.gearText = this.label(GAME_CONFIG.WIDTH - 28, 28, '\u2699', 22, '#ffffff');
        this.gearText.setDepth(305);

        this.buildSettingsPanel();
    }

    makeButton(key, label, color) {
        const c = this.circle(0, 0, 30, color, 0.5, 0.7);
        const t = this.label(0, 0, label, 13);
        return { key, label, color, circle: c, text: t, touchId: null };
    }

    buildSettingsPanel() {
        this.panel = this.scene.add.container(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2).setScrollFactor(0).setDepth(310).setVisible(false);
        this.panelBg = this.scene.add.rectangle(0, 0, 600, 420, 0x111111, 0.94).setStrokeStyle(2, 0xccaa44);
        this.panel.add(this.panelBg);

        const title = this.scene.add.text(0, -175, 'CONTROL SETTINGS', { fontSize: '18px', fontFamily: 'monospace', color: '#ffcc66', fontStyle: 'bold' }).setOrigin(0.5);
        this.panel.add(title);

        this.sizeTxt = this.scene.add.text(0, -120, 'GLOBAL SIZE: 100%', { fontSize: '14px', fontFamily: 'monospace', color: '#e0d0c0' }).setOrigin(0.5);
        this.panel.add(this.sizeTxt);

        // size slider
        this.sliderBg = this.scene.add.rectangle(-180, -85, 360, 8, 0x333333, 1).setOrigin(0, 0.5);
        this.sliderFill = this.scene.add.rectangle(-180, -85, 0, 8, 0xccaa44, 1).setOrigin(0, 0.5);
        this.sliderKnob = this.scene.add.circle(-180, -85, 12, 0xffdd66, 1);
        this.panel.add([this.sliderBg, this.sliderFill, this.sliderKnob]);
        this.sliderKnob.setDepth(315);

        const help1 = this.scene.add.text(0, -45, 'Drag the buttons below to reposition them.', { fontSize: '12px', fontFamily: 'monospace', color: '#998866' }).setOrigin(0.5);
        const help2 = this.scene.add.text(0, -25, 'The joystick base can be dragged too.', { fontSize: '12px', fontFamily: 'monospace', color: '#665544' }).setOrigin(0.5);
        this.panel.add([help1, help2]);

        // Done button
        this.doneCircle = this.scene.add.circle(0, 150, 40, 0x44aa44, 0.9).setStrokeStyle(3, 0xffffff, 0.8);
        this.doneCircle.setDepth(315);
        this.doneText = this.scene.add.text(0, 150, 'DONE', { fontSize: '15px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(315);
        this.panel.add([this.doneCircle, this.doneText]);
    }

    applyLayout() {
        const L = this.layout;
        const rv = 'R';
        this.setButtonPos(this.btnShoot, L.shootX, L.shootY, L.shootR);
        this.setButtonPos(this.btnJump, L.jumpX, L.jumpY, L.jumpR);
        this.setButtonPos(this.btnHook, L.hookX, L.hookY, L.hookR);
        this.setButtonPos(this.btnReload, L.reloadX, L.reloadY, L.reloadR);
        const scale = L.globalScale || 1;
        this.btnShoot.circle.setRadius(L.shootR * scale); this.btnShoot.text.setFontSize('14px');
        this.btnJump.circle.setRadius(L.jumpR * scale); this.btnJump.text.setFontSize('14px');
        this.btnHook.circle.setRadius(L.hookR * scale); this.btnHook.text.setFontSize('14px');
        this.btnReload.circle.setRadius(L.reloadR * scale); this.btnReload.text.setFontSize('14px');
        this.joyBase.setRadius(L.joyR * scale);
        this.joyKnob.setRadius(L.joyR * 0.5 * scale);
        this.joyBase.setPosition(L.joyX, L.joyY);
        this.joyKnob.setPosition(L.joyX, L.joyY);
        this.panelBg.setVisible(true);
    }

    setButtonPos(btn, x, y, r) {
        btn.circle.setPosition(x, y);
        btn.text.setPosition(x, y);
        btn.circle.setRadius(r * (this.layout.globalScale || 1));
        btn.text.setFontSize('14px');
    }

    // ---- hit testing ----
    buttonRadius(b) { return b.circle.radius + 18; }
    hits(b, x, y) {
        const dx = x - b.circle.x, dy = y - b.circle.y;
        const r = this.buttonRadius(b);
        return dx * dx + dy * dy <= r * r;
    }

    onDown(pointer, currentlyOver) {
        const x = pointer.x, y = pointer.y;
        const pid = pointer.id || 1;
        const isTouch = pointer.pointerType === 'touch';

        // Gear toggle works with mouse OR touch
        if (!this.settingsMode && this.near(this.btnSettings, x, y, 30)) {
            this.openSettings();
            return;
        }

        if (this.settingsMode) {
            this.settingsDown(x, y, pid);
            return;
        }

        // Play mode: on-screen controls activate with touch only
        if (!isTouch) return;

        if (this.hits(this.btnShoot, x, y)) { this.state.shoot = true; this.btnShoot.touchId = pid; return; }
        if (this.hits(this.btnJump, x, y)) { if (!this.state.jump) this.state.jumpPressed = true; this.state.jump = true; this.btnJump.touchId = pid; return; }
        if (this.hits(this.btnHook, x, y)) { this.state.grapple = true; this.btnHook.touchId = pid; return; }
        if (this.hits(this.btnReload, x, y)) { this.state.reloadPressed = true; this.state.reload = true; this.btnReload.touchId = pid; return; }

        // Joystick: left portion of the screen
        if (x < this.joyBase.x + this.joyBase.radius + 60) {
            this.joystickTouch = pid;
            this.joyBase.setPosition(x, y);
            this.joyKnob.setPosition(x, y);
            this.joyOrigin = { x, y };
            this.state.anyTouch = true;
        }
    }

    onMove(pointer) {
        const pid = pointer.id || 1;
        const x = pointer.x, y = pointer.y;

        if (this.settingsMode && this.draggingSlider) {
            this.sliderKnob.x = Phaser.Math.Clamp(x, this.sliderBg.x, this.sliderBg.x + this.sliderBg.width);
            const pct = (this.sliderKnob.x - this.sliderBg.x) / this.sliderBg.width;
            this.layout.globalScale = Phaser.Math.Clamp(pct * 2, 0.5, 1.8);
            this.sliderFill.displayWidth = (this.sliderKnob.x - this.sliderBg.x);
            this.sizeTxt.setText('GLOBAL SIZE: ' + Math.round(this.layout.globalScale * 100) + '%');
            this.applyLayout();
            this.saveLayout();
            return;
        }

        if (this.settingsMode && this.dragTarget) {
            const key = this.dragTarget;
            this.layout[key + 'X'] = x;
            this.layout[key + 'Y'] = y;
            this.applyLayout();
            this.saveLayout();
            return;
        }

        if (this.joystickTouch !== null && pid === this.joystickTouch) {
            const dx = x - this.joyOrigin.x;
            const dy = y - this.joyOrigin.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const max = this.layout.joyR * (this.layout.globalScale || 1);
            const clamp = Math.min(len, max);
            const nx = len > 0 ? dx / len : 0;
            const ny = len > 0 ? dy / len : 0;
            this.joyKnob.setPosition(this.joyOrigin.x + nx * clamp, this.joyOrigin.y + ny * clamp);

            const dead = max * 0.2;
            const mag = Math.min(1, Math.max(0, (len - dead) / (max - dead)));
            this.state.left = nx < -0.3 && mag > 0.12;
            this.state.right = nx > 0.3 && mag > 0.12;
            this.state.up = ny < -0.5 && mag > 0.25;
        }
    }

    onUp(pointer) {
        const pid = pointer.id || 1;

        if (this.settingsMode) {
            this.dragTarget = null;
            this.draggingSlider = false;
            return;
        }

        if (this.joystickTouch !== null && pid === this.joystickTouch) {
            this.joystickTouch = null;
            this.joyBase.setPosition(this.layout.joyX, this.layout.joyY);
            this.joyKnob.setPosition(this.layout.joyX, this.layout.joyY);
            this.state.left = false;
            this.state.right = false;
            this.state.anyTouch = false;
        }
        if (this.btnShoot.touchId === pid) { this.state.shoot = false; this.btnShoot.touchId = null; }
        if (this.btnJump.touchId === pid) { this.state.jump = false; this.btnJump.touchId = null; }
        if (this.btnHook.touchId === pid) { this.state.grapple = false; this.btnHook.touchId = null; }
        if (this.btnReload.touchId === pid) { this.btnReload.touchId = null; }
    }

    near(c, x, y, tol) {
        const dx = x - c.x, dy = y - c.y;
        return dx * dx + dy * dy <= (c.radius + tol) * (c.radius + tol);
    }

    // ---- settings ----
    openSettings() {
        this.settingsMode = true;
        this.releaseAll();
        this.panel.setVisible(true);
        // scale slider position reflects current global scale
        const s = this.layout.globalScale || 1;
        const knobX = this.sliderBg.x + this.sliderBg.width * Math.min(1, s / 2);
        this.sliderKnob.x = knobX;
        this.sliderFill.displayWidth = knobX - this.sliderBg.x;
        this.sizeTxt.setText('GLOBAL SIZE: ' + Math.round(s * 100) + '%');
    }

    closeSettings() {
        this.settingsMode = false;
        this.dragTarget = null;
        this.draggingSlider = false;
        this.panel.setVisible(false);
        this.saveLayout();
    }

    settingsDown(x, y, pid) {
        // Done button
        if (this.near(this.doneCircle, x, y, 20)) { this.closeSettings(); return; }
        // slider
        if (this.near(this.sliderKnob, x, y, 24)) { this.draggingSlider = true; return; }
        // joystick base drag
        if (this.near(this.joyBase, x, y, 24 + this.joyBase.radius)) {
            this.dragTarget = 'joy';
            this.layout.joyX = x; this.layout.joyY = y; this.applyLayout(); this.saveLayout(); return;
        }
        // buttons drag
        for (const key of BTN_KEYS) {
            const b = this['btn' + key.charAt(0).toUpperCase() + key.slice(1)];
            if (this.hits(b, x, y)) { this.dragTarget = key; return; }
        }
    }

    applyTo(state) {
        if (this.settingsMode) {
            state.left.isDown = false;
            state.right.isDown = false;
            state.up.isDown = false;
            state.jump.isDown = false;
        } else {
            state.left.isDown = state.left.isDown || this.state.left;
            state.right.isDown = state.right.isDown || this.state.right;
            state.up.isDown = state.up.isDown || this.state.up || this.state.jump;
            state.jump.isDown = state.jump.isDown || this.state.jump;
        }
        return state;
    }

    releaseAll() {
        this.state.shoot = false;
        this.state.jump = false;
        this.state.grapple = false;
        this.state.left = false;
        this.state.right = false;
        this.state.reload = false;
        this.btnShoot.touchId = null;
        this.btnJump.touchId = null;
        this.btnHook.touchId = null;
        this.btnReload.touchId = null;
        this.joystickTouch = null;
    }

    saveLayout() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.layout)); } catch (e) { /* ignore */ }
    }

    consumePressed() {
        this.state.jumpPressed = false;
        this.state.reloadPressed = false;
    }
}
