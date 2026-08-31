// RemotePlayer - a lightweight representation of another online player.
// It does NOT run arcade physics locally; it just renders the peer's synced
// position/aim/health with light interpolation so movement looks smooth.
import { PLAYER_CONFIG } from '../utils/constants.js';

export class RemotePlayer {
    constructor(scene, id, playerIndex) {
        this.scene = scene;
        this.id = id;
        this.playerIndex = playerIndex;
        this.isRemote = true;
        this.isAlive = true;
        this.health = PLAYER_CONFIG.MAX_HEALTH;
        this.radExposure = 0;

        // Non-physics static sprite (position set directly each frame).
        this.sprite = scene.add.image(0, 0, `char_${playerIndex}`);
        this.sprite.setDepth(10);
        this.sprite.playerRef = this;

        // Weapon "hand" that rotates with the peer's aim.
        this.weaponSprite = scene.add.image(0, 0, 'weapon_hand').setDepth(11);

        // Health bar above head.
        this.hpBar = scene.add.graphics().setDepth(20);

        // Name tag
        this.nametag = scene.add.text(0, 0, `P${playerIndex + 1}`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#ffffff',
            backgroundColor: '#00000088',
        }).setOrigin(0.5, 0).setDepth(21);
        this.nametag.setPadding(3, 1);

        // Dead overlay
        this.deadTint = 0x555555;

        // Interpolation targets
        this.targetX = 0; this.targetY = 0;
        this.facingRight = true;
        this.aimAngle = 0;
        this.lastUpdate = 0;
    }

    // Called on every world-state tick with this peer's latest snapshot.
    applyState(state) {
        this.targetX = state.x;
        this.targetY = state.y;
        this.facingRight = !!state.facingRight;
        if (typeof state.angle === 'number') this.aimAngle = state.angle;
        this.health = state.health;
        this.alive = !!state.alive;
        this.radExposure = state.rad || 0;
        if (state.weapon && state.weapon !== this.currentWeapon) {
            this.setWeapon(state.weapon);
        }
    }

    setWeapon(key) {
        this.currentWeapon = key;
        const configs = this.scene.weaponConfigs || {};
        const cfg = configs[key];
        const tex = cfg && cfg.sprite ? cfg.sprite : 'weapon_hand';
        if (this.weaponSprite) this.weaponSprite.setTexture(tex);
    }

    update(delta) {
        if (!this.alive) {
            this.sprite.setVisible(false);
            this.weaponSprite.setVisible(false);
            this.hpBar.clear();
            this.nametag.setVisible(false);
            return;
        }
        this.sprite.setVisible(true);
        this.weaponSprite.setVisible(true);
        this.nametag.setVisible(true);

        // Interpolate toward the latest target (smooth catch-up).
        const k = Math.min(1, (delta / 1000) * 12);
        const x = this.sprite.x + (this.targetX - this.sprite.x) * k;
        const y = this.sprite.y + (this.targetY - this.sprite.y) * k;
        this.sprite.setPosition(x, y);
        this.sprite.setFlipX(!this.facingRight);
        // If a physics body was attached (for local player-vs-remote collision),
        // keep it in sync with the interpolated visual position.
        if (this.sprite.body) {
            this.sprite.body.position.set(x - this.sprite.body.halfWidth, y - this.sprite.body.halfHeight);
            this.sprite.body.updateCenter();
        }

        this.weaponSprite.setPosition(x, y - 8);
        this.weaponSprite.setRotation(this.aimAngle);
        this.weaponSprite.setFlipY(Math.abs(this.aimAngle) > Math.PI / 2);

        // Health bar
        this.hpBar.clear();
        const hx = x - 18, hy = y - 34;
        this.hpBar.fillStyle(0x000000, 0.7);
        this.hpBar.fillRect(hx, hy, 36, 5);
        const pct = Math.max(0, this.health / PLAYER_CONFIG.MAX_HEALTH);
        const c = pct > 0.5 ? 0x44cc44 : (pct > 0.25 ? 0xccaa44 : 0xcc4444);
        this.hpBar.fillStyle(c, 1);
        this.hpBar.fillRect(hx, hy, 36 * pct, 5);

        this.nametag.setPosition(x, y - 30);
    }

    destroy() {
        this.sprite.destroy();
        this.weaponSprite.destroy();
        this.hpBar.destroy();
        this.nametag.destroy();
    }
}
