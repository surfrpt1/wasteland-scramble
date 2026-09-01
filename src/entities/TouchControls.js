import Phaser from 'phaser';
import { GAME_CONFIG } from '../utils/constants.js';

const STORE_KEY = 'ws_touch_layout';

const DEFAULT_LAYOUT = {
    joyX: GAME_CONFIG.WIDTH * 0.16,
    joyY: GAME_CONFIG.HEIGHT * 0.82,
    joyR: 60,
    shootX: GAME_CONFIG.WIDTH * 0.87,
    shootY: GAME_CONFIG.HEIGHT * 0.80,
    shootR: 55,
    jumpX: GAME_CONFIG.WIDTH * 0.70,
    jumpY: GAME_CONFIG.HEIGHT * 0.60,
    jumpR: 46,
    hookX: GAME_CONFIG.WIDTH * 0.70,
    hookY: GAME_CONFIG.HEIGHT * 0.84,
    hookR: 42,
    reloadX: GAME_CONFIG.WIDTH * 0.90,
    reloadY: GAME_CONFIG.HEIGHT * 0.54,
    reloadR: 38,
    globalScale: 1,
};

function loadLayout() {
    let out;
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) out = Object.assign({}, DEFAULT_LAYOUT, JSON.parse(raw)); } catch (e) {}
    if (!out) out = Object.assign({}, DEFAULT_LAYOUT);
    // Clamp any persisted positions back on-screen (guards against a broken saved layout)
    for (const k of ['joyX', 'joyY', 'shootX', 'shootY', 'jumpX', 'jumpY', 'hookX', 'hookY', 'reloadX', 'reloadY']) {
        if (typeof out[k] !== 'number' || !isFinite(out[k])) out[k] = DEFAULT_LAYOUT[k];
    }
    out.joyX = Phaser.Math.Clamp(out.joyX, 40, GAME_CONFIG.WIDTH * 0.4);
    out.joyY = Phaser.Math.Clamp(out.joyY, GAME_CONFIG.HEIGHT * 0.4, GAME_CONFIG.HEIGHT - 40);
    for (const k of ['shootX', 'jumpX', 'hookX', 'reloadX']) out[k] = Phaser.Math.Clamp(out[k], GAME_CONFIG.WIDTH * 0.45, GAME_CONFIG.WIDTH - 40);
    for (const k of ['shootY', 'jumpY', 'hookY', 'reloadY']) out[k] = Phaser.Math.Clamp(out[k], GAME_CONFIG.HEIGHT * 0.25, GAME_CONFIG.HEIGHT - 40);
    if (typeof out.globalScale !== 'number' || !isFinite(out.globalScale)) out.globalScale = 1;
    out.globalScale = Phaser.Math.Clamp(out.globalScale, 0.5, 1.8);
    return out;
}

function resetLayoutOverride() {
    localStorage.removeItem(STORE_KEY);
    return Object.assign({}, DEFAULT_LAYOUT);
}

const BTN_KEYS = ['shoot', 'jump', 'hook', 'reload'];

// Controls that can each be resized separately via the settings slider.
const SIZABLE = [
    { key: 'shoot', label: 'FIRE' },
    { key: 'jump', label: 'JUMP' },
    { key: 'hook', label: 'HOOK' },
    { key: 'reload', label: 'RELOAD' },
    { key: 'joy', label: 'JOY' },
];
const SIZE_MIN = 26;
const SIZE_MAX = 92;

export class TouchControls {
    constructor(scene) {
        this.scene = scene;
        this.layout = loadLayout();
        this.settingsMode = false;
        this.joyPointer = null;
        this.joyOrigin = { x: 0, y: 0 };
        this.dragTarget = null;
        this.draggingSlider = false;
        // Gate touch on DEVICE capability, not per-pointer type. Some mobile
        // browsers report touch pointers with a non-'touch' type (e.g. 'mouse'),
        // which previously blocked every button/joystick except fire.
        this.touchDevice = !!(scene.sys && scene.sys.game && scene.sys.game.device && scene.sys.game.device.input && scene.sys.game.device.input.touch);

        this.state = {
            left: false, right: false, up: false,
            jump: false, jumpPressed: false,
            shoot: false, grapple: false, grapplePressed: false,
            reload: false, reloadPressed: false, anyTouch: false,
            fireAngle: undefined,
        };

        this.buildUI();
        this.applyLayout();

        scene.input.on('pointerdown', this.onDown, this);
        scene.input.on('pointermove', this.onMove, this);
        scene.input.on('pointerup', this.onUp, this);
        scene.input.on('pointercancel', this.onUp, this);
    }

    tmp() {}

    circle(x, y, r, color, alpha, stroke) {
        const c = this.scene.add.circle(x, y, r, color, alpha).setStrokeStyle(2, 0xffffff, stroke);
        this.ui.add(c); return c;
    }
    label(x, y, text, size = 13, color = '#ffffff') {
        const t = this.scene.add.text(x, y, text, { fontSize: size + 'px', fontFamily: 'monospace', color, fontStyle: 'bold' }).setOrigin(0.5);
        this.ui.add(t); return t;
    }

    buildUI() {
        this.ui = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(300);
        this.joyBase = this.circle(0, 0, 1, 0xffffff, 0.10, 0.35);
        this.joyKnob = this.circle(0, 0, 1, 0xffffff, 0.4, 0);
        this.btnShoot = this.makeButton('shoot', 'FIRE', 0xcc4444);
        // Fire-aim stick: a knob that shows where you're aiming while holding FIRE
        this.fireKnob = this.circle(0, 0, 14, 0xffeecc, 0.65, 0);
        this.fireKnob.setVisible(false);
        this.btnJump = this.makeButton('jump', 'JUMP', 0x44cc44);
        this.btnHook = this.makeButton('hook', 'HOOK', 0xccaa44);
        this.btnReload = this.makeButton('reload', 'RELOAD', 0x8888cc);

        this.btnSettings = this.circle(GAME_CONFIG.WIDTH - 28, 28, 26, 0x222222, 0.9, 0.6).setDepth(305);
        this.gearText = this.label(GAME_CONFIG.WIDTH - 28, 28, '\u2699', 24, '#ffffff').setDepth(305);

        // Debug HUD (top-left) - live readout of touch state
        this.debugText = this.label(90, 16, '', 12, '#aaffaa');
        this.debugText.setOrigin(0, 0.5);

        this.buildSettingsPanel();
    }

    setActive(b, on) {
        b.held = on;
        if (on) { b.circle.setFillStyle(b.color, 0.9); b.circle.setStrokeStyle(3, 0xffffff, 1); }
        else { b.circle.setFillStyle(b.color, 0.5); b.circle.setStrokeStyle(2, 0xffffff, 0.7); }
    }
    makeButton(key, label, color) {
        const c = this.circle(0, 0, 30, color, 0.5, 0.7);
        const t = this.label(0, 0, label, 13);
        return { key, label, color, circle: c, text: t, pointer: null, held: false };
    }

    buildSettingsPanel() {
        // Panel is a Container -> its children use CONTAINER-LOCAL coords
        // (rendered offset by the container's position). Keep every element
        // local here; hit tests convert local -> screen via panelX/panelY.
        this.panelX = GAME_CONFIG.WIDTH / 2;
        this.panelY = 150;
        this.panel = this.scene.add.container(this.panelX, this.panelY).setScrollFactor(0).setDepth(310).setVisible(false);
        // Taller panel so the SAVE / RESET buttons sit fully inside its background
        this.panelBg = this.scene.add.rectangle(0, 0, 720, 300, 0x111111, 0.82).setStrokeStyle(2, 0xccaa44);
        this.panel.add(this.panelBg);
        const title = this.scene.add.text(0, -130, 'CONTROL SETTINGS', { fontSize: '18px', fontFamily: 'monospace', color: '#ffcc66', fontStyle: 'bold' }).setOrigin(0.5);
        this.panel.add(title);

        // Selector chips: tap to choose which control the slider resizes
        this.controlChips = [];
        const chipW = 124;
        let cx = -((SIZABLE.length * chipW) / 2);
        this.selectedControl = 'shoot';
        for (const c of SIZABLE) {
            const cxx = cx + chipW / 2;
            const circle = this.scene.add.circle(cxx, -88, 26, c.key === this.selectedControl ? 0xccaa44 : 0x333333, 0.9)
                .setStrokeStyle(2, c.key === this.selectedControl ? 0xffdd66 : 0x8a6a4a, 0.8).setDepth(325);
            const t = this.scene.add.text(cxx, -88, c.label, { fontSize: '11px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(325);
            circle.chipKey = c.key;
            this.panel.add([circle, t]);
            this.controlChips.push({ key: c.key, label: c.label, circle, text: t });
            cx += chipW;
        }

        // Slider (resizes the selected control only)
        this.sizeTxt = this.scene.add.text(0, -46, 'FIRE SIZE: 55', { fontSize: '15px', fontFamily: 'monospace', color: '#ffe0b0', fontStyle: 'bold' }).setOrigin(0.5);
        this.panel.add(this.sizeTxt);

        // Slider stored in screen coords (container position + local offset)
        const slx = -200, sly = -20;
        this.sliderMinX = this.panelX + slx; this.sliderMaxX = this.panelX + slx + 300; this.sliderY = this.panelY + sly;
        this.sliderBg = this.scene.add.rectangle(slx, sly, 300, 16, 0x333333, 1).setOrigin(0, 0.5);
        this.sliderFill = this.scene.add.rectangle(slx, sly, 0, 16, 0xccaa44, 1).setOrigin(0, 0.5);
        this.sliderKnob = this.scene.add.circle(slx, sly, 22, 0xffdd66, 1).setDepth(325).setStrokeStyle(2, 0xffffff, 0.8);
        this.panel.add([this.sliderBg, this.sliderFill, this.sliderKnob]);

        const h1 = this.scene.add.text(0, 36, 'Tap FIRE / JUMP / HOOK / RELOAD / JOY, then drag the slider', { fontSize: '12px', fontFamily: 'monospace', color: '#ffe0b0' }).setOrigin(0.5);
        const h2 = this.scene.add.text(0, 56, 'Drag the controls themselves to move them, then tap SAVE.', { fontSize: '11px', fontFamily: 'monospace', color: '#ddccaa' }).setOrigin(0.5);
        this.panel.add([h1, h2]);

        this.resetCircle = this.scene.add.circle(-180, 98, 36, 0xcc4444, 0.9).setStrokeStyle(2, 0xffffff, 0.7).setDepth(325);
        this.resetText = this.scene.add.text(-180, 98, 'RESET', { fontSize: '12px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(325);
        this.panel.add([this.resetCircle, this.resetText]);

        this.doneCircle = this.scene.add.circle(180, 98, 38, 0x44aa44, 0.95).setStrokeStyle(3, 0xffffff, 0.9).setDepth(325);
        this.doneText = this.scene.add.text(180, 98, 'SAVE', { fontSize: '15px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(325);
        this.panel.add([this.doneCircle, this.doneText]);

        // Leave/exit button — returns to the main menu and (in online mode)
        // disconnects from the server. Positioned in the bottom row between RESET
        // and SAVE so it doesn't crowd either.
        this.exitRect = this.scene.add.rectangle(0, 98, 220, 56, 0xbb3333, 0.9).setStrokeStyle(2, 0xffffff, 0.8).setDepth(325);
        this.exitText = this.scene.add.text(0, 98, 'BACK TO MENU', { fontSize: '14px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(325);
        this.panel.add([this.exitRect, this.exitText]);
    }

    // Current radius of the selected control ('' -> default)
    currentRadius() {
        const key = this.selectedControl;
        const r = this.layout[key + 'R'];
        return typeof r === 'number' && isFinite(r) ? r : DEFAULT_LAYOUT[key + 'R'] || 50;
    }

    selectControl(key) {
        this.selectedControl = key;
        for (const c of this.controlChips) {
            const on = c.key === key;
            c.circle.setFillStyle(on ? 0xccaa44 : 0x333333, 0.9);
            c.circle.setStrokeStyle(2, on ? 0xffdd66 : 0x8a6a4a, 0.8);
        }
        this.positionSlider();
    }

    positionSlider() {
        const r = this.currentRadius();
        const pct = Phaser.Math.Clamp((r - SIZE_MIN) / (SIZE_MAX - SIZE_MIN), 0, 1);
        const knobX = this.sliderMinX + (this.sliderMaxX - this.sliderMinX) * pct;
        this.sliderKnob.x = knobX - this.panelX; // knob is panel-local
        this.sliderFill.displayWidth = knobX - this.sliderMinX;
        const label = SIZABLE.find(c => c.key === this.selectedControl);
        this.sizeTxt.setText((label ? label.label : '?') + ' SIZE: ' + Math.round(r));
    }

    setRadius(value) {
        const key = this.selectedControl;
        const r = Phaser.Math.Clamp(value, SIZE_MIN, SIZE_MAX);
        this.layout[key + 'R'] = r;
        this.applyLayout();
        this.positionSlider();
    }

    applyLayout() {
        const L = this.layout;
        const s = L.globalScale || 1;
        const setB = (b) => { b.circle.setPosition(L[b.key + 'X'], L[b.key + 'Y']); b.text.setPosition(L[b.key + 'X'], L[b.key + 'Y']); b.circle.setRadius(L[b.key + 'R'] * s); b.text.setFontSize('14px'); };
        setB(this.btnShoot); setB(this.btnJump); setB(this.btnHook); setB(this.btnReload);
        this.fireKnob.setPosition(L.shootX, L.shootY);
        this.joyBase.setPosition(L.joyX, L.joyY).setRadius(L.joyR * s);
        this.joyKnob.setPosition(L.joyX, L.joyY).setRadius(L.joyR * 0.5 * s);
    }

    hits(b, x, y) {
        const dx = x - b.circle.x, dy = y - b.circle.y;
        const r = b.circle.radius + 18;
        return dx * dx + dy * dy <= r * r;
    }
    near(c, x, y, tol) {
        const dx = x - c.x, dy = y - c.y;
        return dx * dx + dy * dy <= (c.radius + tol) * (c.radius + tol);
    }
    inJoyZone(x) { return x < this.layout.joyX + this.layout.joyR + 80; }

    onDown(pointer, currentlyOver) {
        const x = pointer.x, y = pointer.y;

        if (!this.settingsMode && this.near(this.btnSettings, x, y, 34)) { this.openSettings(); return; }

        if (this.settingsMode) { this.settingsDown(x, y, pointer); return; }

        if (!this.touchDevice) return;

        if (this.hits(this.btnShoot, x, y)) {
            this.state.shoot = true;
            this.btnShoot.pointer = pointer;
            this.setActive(this.btnShoot, true);
            this.fireOrigin = { x: this.btnShoot.circle.x, y: this.btnShoot.circle.y };
            this.fireKnob.setPosition(this.btnShoot.circle.x, this.btnShoot.circle.y);
            this.fireKnob.setVisible(true);
            this.fireMove(x, y);
            return;
        }
        if (this.hits(this.btnJump, x, y)) { if (!this.state.jump) this.state.jumpPressed = true; this.state.jump = true; this.btnJump.pointer = pointer; this.setActive(this.btnJump, true); return; }
        if (this.hits(this.btnHook, x, y)) { this.state.grapplePressed = true; this.state.grapple = true; this.btnHook.pointer = pointer; this.setActive(this.btnHook, true); return; }
        if (this.hits(this.btnReload, x, y)) { this.state.reloadPressed = true; this.state.reload = true; this.btnReload.pointer = pointer; this.setActive(this.btnReload, true); return; }

        if (this.joyPointer === null && this.inJoyZone(x)) {
            this.joyPointer = pointer;
            this.joyOrigin = { x, y };
            this.joyBase.setPosition(x, y);
            this.joyKnob.setPosition(x, y);
            this.state.anyTouch = true;
            this.joystickMove(x, y);
        }
    }

    onMove(pointer) {
        const x = pointer.x, y = pointer.y;

        if (this.settingsMode && this.draggingSlider) {
            const kx = Phaser.Math.Clamp(x, this.sliderMinX, this.sliderMaxX);
            this.sliderKnob.x = kx - this.panelX; // knob is panel-local
            this.sliderFill.displayWidth = kx - this.sliderMinX;
            const pct = (kx - this.sliderMinX) / (this.sliderMaxX - this.sliderMinX);
            const radius = SIZE_MIN + pct * (SIZE_MAX - SIZE_MIN);
            this.setRadius(radius);
            return;
        }
        if (this.settingsMode && this.dragTarget) {
            const key = this.dragTarget;
            this.layout[key + 'X'] = x;
            this.layout[key + 'Y'] = y;
            this.applyLayout();
            return;
        }

        // Fire-aim stick: while holding the FIRE button, dragging sets the aim direction
        if (this.btnShoot.pointer === pointer && this.state.shoot) {
            this.fireMove(x, y);
            return;
        }

        if (this.joyPointer !== null) {
            // Drive the joystick from any active pointer near the joystick's current
            // origin (robust even if Phaser hands us a different Pointer object).
            const nearJoy = pointer.x < this.joyOrigin.x + this.layout.joyR + 140 &&
                            pointer.y > this.joyOrigin.y - this.layout.joyR - 180;
            if (pointer === this.joyPointer || (pointer.isDown && nearJoy)) {
                this.joystickMove(x, y);
            }
        }
    }

    joystickMove(x, y) {
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
        this.state.left = nx < -0.3 && mag > 0.08;
        this.state.right = nx > 0.3 && mag > 0.08;
        this.state.up = ny < -0.5 && mag > 0.2;
        this.state.anyTouch = true;
    }

    fireMove(x, y) {
        if (!this.fireOrigin) return;
        const dx = x - this.fireOrigin.x;
        const dy = y - this.fireOrigin.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const max = this.layout.shootR * (this.layout.globalScale || 1);
        const dead = max * 0.15;
        const mag = Math.min(1, Math.max(0, (len - dead) / (max - dead)));

        // Aim direction = the direction the FIRE stick is pulled (radians).
        this.state.fireAngle = mag > 0.08 ? Math.atan2(dy, dx) : undefined;

        // Move the aim knob (clamped to the stick radius)
        if (len > 0) {
            const cl = Math.min(len, max);
            this.fireKnob.setPosition(this.fireOrigin.x + (dx / len) * cl, this.fireOrigin.y + (dy / len) * cl);
        }
    }

    onUp(pointer) {
        if (this.settingsMode) { this.dragTarget = null; this.draggingSlider = false; return; }

        if (this.joyPointer !== null && pointer === this.joyPointer) {
            this.joyPointer = null;
            this.joyBase.setPosition(this.layout.joyX, this.layout.joyY);
            this.joyKnob.setPosition(this.layout.joyX, this.layout.joyY);
            this.state.left = false; this.state.right = false; this.state.anyTouch = false;
        }
        if (this.btnShoot.pointer === pointer) {
            this.state.shoot = false; this.state.fireAngle = undefined;
            this.fireOrigin = null; this.fireKnob.setVisible(false);
            this.btnShoot.pointer = null; this.setActive(this.btnShoot, false);
        }
        if (this.btnJump.pointer === pointer) { this.state.jump = false; this.btnJump.pointer = null; this.setActive(this.btnJump, false); }
        if (this.btnHook.pointer === pointer) { this.state.grapple = false; this.btnHook.pointer = null; this.setActive(this.btnHook, false); }
        if (this.btnReload.pointer === pointer) { this.btnReload.pointer = null; this.setActive(this.btnReload, false); }
    }

    updateDebug() {
        if (!this.debugText) return;
        const s = this.state;
        this.debugText.setText(
            'L:' + (s.left ? 1 : 0) + ' R:' + (s.right ? 1 : 0) + ' U:' + (s.up ? 1 : 0) +
            '  JUMP:' + (s.jump ? 1 : 0) + ' FIRE:' + (s.shoot ? 1 : 0) +
            ' HOOK:' + (s.grapple ? 1 : 0) + ' RL:' + (s.reload ? 1 : 0) +
            this.settingsMode ? ' [SETTINGS]' : ''
        );
    }

    openSettings() {
        this.settingsMode = true;
        this.releaseAll();
        this.panel.setVisible(true);
        if (!this.selectedControl) this.selectedControl = 'shoot';
        this.positionSlider();
    }
    closeSettings() {
        this.settingsMode = false;
        this.dragTarget = null; this.draggingSlider = false;
        this.panel.setVisible(false);
        this.saveLayout();
    }

    // Leave the current match. Closes settings first (so the player returns to a
    // clean UI), then runs the scene-provided exit callback (defaults to MenuScene).
    triggerExit() {
        this.closeSettings();
        if (this.onExit) this.onExit();
        else this.scene.scene.start('MenuScene');
    }

    resetLayout() {
        this.layout = resetLayoutOverride();
        this.applyLayout();
        this.saveLayout();
        this.openSettings();
    }

    settingsDown(x, y, pointer) {
        if (this.near({ x: this.panelX + this.doneCircle.x, y: this.panelY + this.doneCircle.y, radius: this.doneCircle.radius }, x, y, 22)) { this.closeSettings(); return; }
        if (this.near({ x: this.panelX + this.resetCircle.x, y: this.panelY + this.resetCircle.y, radius: this.resetCircle.radius }, x, y, 24)) { this.resetLayout(); return; }

        // BACK TO MENU — leave the match. Forwards to a callback (set by GameScene)
        // so it can also disconnect from the server before navigating. The button is
        // a 220x56 rectangle at panel-local (0,98); hit-test its full bounds.
        if (x >= this.panelX - 110 && x <= this.panelX + 110 && y >= this.panelY + 98 - 34 && y <= this.panelY + 98 + 34) { this.triggerExit(); return; }

        // Select a control to resize. The chip circles live inside the panel
        // container, so their .x/.y are panel-local; convert to screen coords.
        for (const c of this.controlChips) {
            const sx = this.panel.x + c.circle.x;
            const sy = this.panel.y + c.circle.y;
            if (this.near({ x: sx, y: sy, radius: c.circle.radius }, x, y, 32)) { this.selectControl(c.key); return; }
        }

        // Slider resizes the selected control (slider stored in screen coords)
        if (x >= this.sliderMinX - 20 && x <= this.sliderMaxX + 20 && Math.abs(y - this.sliderY) < 40) {
            this.draggingSlider = true;
            const kx = Phaser.Math.Clamp(x, this.sliderMinX, this.sliderMaxX);
            this.sliderKnob.x = kx - this.panelX; // knob is panel-local
            const pct = (kx - this.sliderMinX) / (this.sliderMaxX - this.sliderMinX);
            this.setRadius(SIZE_MIN + pct * (SIZE_MAX - SIZE_MIN));
            return;
        }
        if (this.near(this.joyBase, x, y, 16 + this.joyBase.radius)) {
            this.dragTarget = 'joy';
            this.layout.joyX = x; this.layout.joyY = y; this.applyLayout();
            return;
        }
        for (const key of BTN_KEYS) {
            const b = this['btn' + key.charAt(0).toUpperCase() + key.slice(1)];
            if (this.hits(b, x, y)) { this.dragTarget = key; return; }
        }
    }

    applyTo(state) {
        if (this.settingsMode) {
            state.left.isDown = false; state.right.isDown = false;
            state.up.isDown = false; state.jump.isDown = false;
        } else {
            state.left.isDown = state.left.isDown || this.state.left;
            state.right.isDown = state.right.isDown || this.state.right;
            state.up.isDown = state.up.isDown || this.state.up || this.state.jump;
            state.jump.isDown = state.jump.isDown || this.state.jump;
        }
        return state;
    }

    releaseAll() {
        this.state.shoot = false; this.state.jump = false; this.state.grapple = false;
        this.state.left = false; this.state.right = false; this.state.reload = false;
        this.state.jumpPressed = false; this.state.reloadPressed = false; this.state.grapplePressed = false;
        this.state.fireAngle = undefined; this.fireOrigin = null;
        if (this.fireKnob) this.fireKnob.setVisible(false);
        this.btnShoot.pointer = null; this.btnJump.pointer = null;
        this.btnHook.pointer = null; this.btnReload.pointer = null;
        this.joyPointer = null;
    }

    saveLayout() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.layout)); } catch (e) {} }

    consumePressed() { this.state.jumpPressed = false; this.state.reloadPressed = false; this.state.grapplePressed = false; }
}
