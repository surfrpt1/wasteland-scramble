import Phaser from 'phaser';
import { PLAYER_CONFIG, GRAPPLE_CONFIG, COLORS } from '../utils/constants.js';

export class Player {
    constructor(scene, x, y, playerId = 0) {
        this.scene = scene;
        this.playerId = playerId;
        this.health = PLAYER_CONFIG.MAX_HEALTH;
        this.radExposure = 0;
        this.isAlive = true;
        this.canGrapple = true;
        this.grappleActive = false;
        this.grapplePoint = null;
        this.isWallClinging = false;
        this.wallClingTimer = 0;
        this.isSliding = false;
        this.facingRight = true;
        this.lastJumpState = false;
        this.hp = PLAYER_CONFIG.MAX_HEALTH;

        // Character sprite - generated per player
        this.sprite = scene.physics.add.sprite(x, y, `char_${playerId}`);
        this.sprite.setSize(PLAYER_CONFIG.WIDTH, PLAYER_CONFIG.HEIGHT);
        this.sprite.setOffset((40 - PLAYER_CONFIG.WIDTH) / 2, 56 - PLAYER_CONFIG.HEIGHT);
        this.sprite.setBounce(0);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setDepth(10);
        this.sprite.playerRef = this;

        // Weapon visible on player (attached, rotates with aim)
        this.weaponSprite = scene.add.image(x, y, 'weapon_hand');
        this.weaponSprite.setDepth(11);
        this.currentWeaponKey = 'SCRAP_RIFLE';

        // Grapple line
        this.grappleLine = scene.add.graphics();
        this.grappleLine.setDepth(9);

        // Health bar above head
        this.hpBar = scene.add.graphics();
        this.hpBar.setDepth(20);

        // Dead overlay
        this.deadTint = 0x555555;
    }

    update(cursors, pointer, time) {
        if (!this.isAlive) return;

        this.handleMovement(cursors, time);
        this.handleGrapple(pointer);
        this.handleWallCling(cursors);
        this.handleSlide(cursors, time);
        this.updateWeapon(pointer);
        this.updateBars();
        this.updateGrappleLine();
    }

    handleMovement(cursors, time) {
        if (this.isSliding) return;

        const body = this.sprite.body;
        const onGround = body.blocked.down || body.touching.down;
        const speed = PLAYER_CONFIG.SPEED * (onGround ? 1 : 0.85);

        if (this.grappleActive && this.grapplePoint) {
            // Grapple pulls toward point
            const dx = this.grapplePoint.x - this.sprite.x;
            const dy = this.grapplePoint.y - this.sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 16) {
                const nx = dx / dist;
                const ny = dy / dist;
                body.setVelocity(
                    nx * GRAPPLE_CONFIG.PULL_FORCE,
                    Math.min(ny * GRAPPLE_CONFIG.PULL_FORCE, 900)
                );
            } else {
                this.releaseGrapple();
            }
            this.facingRight = dx > 0;
            this.sprite.setFlipX(!this.facingRight);
            return;
        }

        // Horizontal
        if (cursors.left.isDown) {
            body.setVelocityX(-speed);
            this.facingRight = false;
            this.sprite.setFlipX(true);
        } else if (cursors.right.isDown) {
            body.setVelocityX(speed);
            this.facingRight = true;
            this.sprite.setFlipX(false);
        } else if (!this.isWallClinging) {
            body.setVelocityX(body.velocity.x * 0.8);
        }

        // Jump - supports Phaser keys + plain bot objects
        const jumpIsDown = cursors.jump ? cursors.jump.isDown : false;
        const jumpPressed = Phaser.Input.Keyboard.JustDown(cursors.up) ||
            Phaser.Input.Keyboard.JustDown(cursors.jump) ||
            (jumpIsDown && !this.lastJumpState);
        this.lastJumpState = jumpIsDown;

        if (jumpPressed) {
            if (onGround || this.isWallClinging) {
                let jf = PLAYER_CONFIG.JUMP_FORCE;
                if (this.isWallClinging) {
                    const wallDir = body.blocked.left ? 1 : -1;
                    body.setVelocityX(wallDir * PLAYER_CONFIG.SPEED * 1.5);
                    body.setAllowGravity(true);
                    this.isWallClinging = false;
                }
                body.setVelocityY(jf);
            }
        }
    }

    handleGrapple(pointer) {
        if (!this.isAlive || !pointer) return;

        // Detect right-click PRESS edge (not held) to fire grapple once
        const rbd = (typeof pointer.rightButtonDown === 'function') ? pointer.rightButtonDown() : false;

        if (rbd && this.canGrapple && !this.grappleActive) {
            const targetX = pointer.worldX;
            const targetY = pointer.worldY;
            const dx = targetX - this.sprite.x;
            const dy = targetY - this.sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= GRAPPLE_CONFIG.MAX_DISTANCE) {
                this.grappleActive = true;
                this.canGrapple = false;
                this.grapplePoint = { x: targetX, y: targetY };
                this.grappleTimeout = this.scene.time.delayedCall(1200, () => {
                    this.releaseGrapple();
                });
                this.scene.time.delayedCall(GRAPPLE_CONFIG.COOLDOWN, () => {
                    this.canGrapple = true;
                });
                return;
            }
        }

        // Release grapple on right-click release OR when arrived/out of range is handled in movement
    }

    releaseGrapple() {
        this.grappleActive = false;
        this.grapplePoint = null;
        this.grappleLine.clear();
        if (this.grappleTimeout) { this.grappleTimeout.remove(); this.grappleTimeout = null; }
    }

    fireGrapple(targetX, targetY) {
        if (!this.isAlive || !this.canGrapple || this.grappleActive) return;
        const dx = targetX - this.sprite.x;
        const dy = targetY - this.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > GRAPPLE_CONFIG.MAX_DISTANCE) return;
        this.grappleActive = true;
        this.canGrapple = false;
        this.grapplePoint = { x: targetX, y: targetY };
        this.grappleTimeout = this.scene.time.delayedCall(1200, () => {
            this.releaseGrapple();
        });
        this.scene.time.delayedCall(GRAPPLE_CONFIG.COOLDOWN, () => {
            this.canGrapple = true;
        });
    }

    handleWallCling(cursors) {
        const body = this.sprite.body;
        const againstWall = body.blocked.left || body.blocked.right;
        const inAir = !body.blocked.down && !body.touching.down;
        const wallClingPressed = cursors.wallCling && cursors.wallCling.isDown;

        if (wallClingPressed && againstWall && inAir && !this.isWallClinging) {
            this.isWallClinging = true;
            body.setVelocityY(PLAYER_CONFIG.WALL_CLING_FALL_SPEED);
            body.setAllowGravity(false);
            this.wallClingTimer = this.scene.time.delayedCall(
                PLAYER_CONFIG.WALL_CLING_DURATION,
                () => { if (this.isWallClinging) { this.isWallClinging = false; body.setAllowGravity(true); } }
            );
        }

        if (this.isWallClinging && (!againstWall || body.blocked.down || !wallClingPressed)) {
            this.isWallClinging = false;
            body.setAllowGravity(true);
            if (this.wallClingTimer) { this.wallClingTimer.remove(); this.wallClingTimer = 0; }
        }
    }

    handleSlide(cursors, time) {
        const body = this.sprite.body;
        const onGround = body.blocked.down || body.touching.down;
        const slideKey = cursors.slide && cursors.slide.isDown;

        if (slideKey && onGround && !this.isSliding) {
            this.isSliding = true;
            const dir = this.facingRight ? 1 : -1;
            body.setVelocityX(dir * PLAYER_CONFIG.SLIDE_SPEED);
            this.sprite.setAlpha(0.7);
            this.scene.time.delayedCall(PLAYER_CONFIG.SLIDE_DURATION, () => {
                this.isSliding = false;
                this.sprite.setAlpha(1);
            });
        }
    }

    setWeapon(key) {
        this.currentWeaponKey = key;
        const configs = this.scene.weaponConfigs || {};
        const cfg = configs[key];
        const tex = cfg && cfg.sprite ? cfg.sprite : 'weapon_hand';
        this.weaponSprite.setTexture(tex);
    }

    updateWeapon(pointer) {
        if (!this.weaponSprite) return;
        const wx = this.sprite.x;
        const wy = this.sprite.y - 8;

        this.weaponSprite.setPosition(wx, wy);

        if (pointer && pointer.worldX !== undefined) {
            const angle = Phaser.Math.Angle.Between(
                wx, wy, pointer.worldX, pointer.worldY
            );
            this.weaponSprite.setRotation(angle);
            this.weaponSprite.setFlipY(Math.abs(angle) > Math.PI / 2);
        } else {
            this.weaponSprite.setRotation(this.facingRight ? 0 : Math.PI);
        }
        this.weaponSprite.setVisible(this.isAlive);
    }

    updateGrappleLine() {
        this.grappleLine.clear();
        if (!this.grappleActive || !this.grapplePoint) return;
        this.grappleLine.lineStyle(GRAPPLE_CONFIG.WIDTH, COLORS.GRAPPLE, 0.85);
        this.grappleLine.lineBetween(
            this.sprite.x, this.sprite.y - 10,
            this.grapplePoint.x, this.grapplePoint.y
        );
        this.grappleLine.fillStyle(COLORS.GRAPPLE, 1);
        this.grappleLine.fillCircle(this.grapplePoint.x, this.grapplePoint.y, 4);
    }

    updateBars() {
        this.hpBar.clear();
        const x = this.sprite.x - 18;
        const yTop = this.sprite.y - 34;

        // Health
        this.hpBar.fillStyle(0x000000, 0.7);
        this.hpBar.fillRect(x, yTop, 36, 5);
        const hpPct = Math.max(0, this.health / PLAYER_CONFIG.MAX_HEALTH);
        const hpColor = hpPct > 0.5 ? 0x44cc44 : (hpPct > 0.25 ? 0xccaa44 : 0xcc4444);
        this.hpBar.fillStyle(hpColor, 1);
        this.hpBar.fillRect(x, yTop, 36 * hpPct, 5);
    }

    takeDamage(amount) {
        if (!this.isAlive) return;
        this.health -= amount;
        this.sprite.setTint(0xff5555);
        this.scene.time.delayedCall(100, () => {
            if (this.sprite.active) this.sprite.clearTint();
        });
        if (this.health <= 0) this.die('combat');
    }

    die(cause) {
        if (!this.isAlive) return;
        this.isAlive = false;
        this.sprite.setTint(0x666666);
        this.sprite.body.enable = false;
        this.weaponSprite.setVisible(false);
        this.grappleLine.clear();
        this.hpBar.clear();
        this.scene.events.emit('playerDied', this, cause);
        this.scene.time.delayedCall(3000, () => this.respawn());
    }

    respawn() {
        const spawns = this.scene.mapData.spawnPoints;
        const s = spawns[Math.floor(Math.random() * spawns.length)];
        this.health = PLAYER_CONFIG.MAX_HEALTH;
        this.radExposure = 0;
        this.isAlive = true;
        this.sprite.body.enable = true;
        this.sprite.clearTint();
        this.sprite.setPosition(s.x, s.y);
        this.sprite.body.setVelocity(0, 0);
        this.weaponSprite.setVisible(true);
        this.releaseGrapple();
    }

    destroy() {
        if (this.sprite) this.sprite.destroy();
        if (this.weaponSprite) this.weaponSprite.destroy();
        if (this.grappleLine) this.grappleLine.destroy();
        if (this.hpBar) this.hpBar.destroy();
    }
}
