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
        this.slideTimer = 0;
        this.facingRight = true;

        this.sprite = scene.physics.add.sprite(x, y, 'player');
        this.sprite.setSize(PLAYER_CONFIG.WIDTH, PLAYER_CONFIG.HEIGHT);
        this.sprite.setBounce(0);
        this.sprite.setCollideWorldBounds(true);
        this.sprite.setDepth(10);
        this.sprite.playerRef = this;

        this.grappleLine = scene.add.graphics();
        this.grappleLine.setDepth(9);

        this.hpBar = scene.add.graphics();
        this.hpBar.setDepth(20);
        this.radBar = scene.add.graphics();
        this.radBar.setDepth(20);
    }

    update(cursors, pointer) {
        if (!this.isAlive) return;

        this.handleMovement(cursors, pointer);
        this.handleGrapple(pointer);
        this.handleWallCling(cursors);
        this.handleSlide(cursors);
        this.updateBars();
        this.updateGrappleLine();
        this.checkRadDamage();
    }

    handleMovement(cursors, pointer) {
        if (this.isSliding) return;

        const body = this.sprite.body;
        const onGround = body.blocked.down || body.touching.down;

        // Horizontal
        if (cursors.left.isDown) {
            body.setVelocityX(-PLAYER_CONFIG.SPEED);
            this.facingRight = false;
            this.sprite.setFlipX(true);
        } else if (cursors.right.isDown) {
            body.setVelocityX(PLAYER_CONFIG.SPEED);
            this.facingRight = true;
            this.sprite.setFlipX(false);
        } else {
            if (!this.grappleActive && !this.isWallClinging) {
                body.setVelocityX(0);
            }
        }

        // Jump
        if (Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(cursors.jump)) {
            if (onGround || this.isWallClinging) {
                let jumpForce = PLAYER_CONFIG.JUMP_FORCE;
                if (this.isWallClinging) {
                    const wallDir = body.blocked.left ? 1 : -1;
                    body.setVelocityX(wallDir * PLAYER_CONFIG.SPEED * 1.5);
                    this.isWallClinging = false;
                }
                body.setVelocityY(jumpForce);
            }
        }

        // Grapple pull
        if (this.grappleActive && this.grapplePoint) {
            const dx = this.grapplePoint.x - this.sprite.x;
            const dy = this.grapplePoint.y - this.sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 20) {
                const nx = dx / dist;
                const ny = dy / dist;
                body.setVelocity(
                    nx * GRAPPLE_CONFIG.PULL_FORCE,
                    ny * GRAPPLE_CONFIG.PULL_FORCE
                );
            } else {
                this.releaseGrapple();
            }
        }
    }

    handleGrapple(pointer) {
        if (!this.isAlive) return;

        if (pointer.rightButtonDown() && this.canGrapple && !this.grappleActive) {
            this.fireGrapple(pointer.worldX, pointer.worldY);
        }

        if (pointer.rightButtonReleased()) {
            this.releaseGrapple();
        }
    }

    fireGrapple(targetX, targetY) {
        const dx = targetX - this.sprite.x;
        const dy = targetY - this.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > GRAPPLE_CONFIG.MAX_DISTANCE) return;

        this.grappleActive = true;
        this.canGrapple = false;
        this.grapplePoint = { x: targetX, y: targetY };

        this.scene.time.delayedCall(GRAPPLE_CONFIG.COOLDOWN, () => {
            this.canGrapple = true;
        });
    }

    releaseGrapple() {
        this.grappleActive = false;
        this.grapplePoint = null;
        this.grappleLine.clear();
    }

    handleWallCling(cursors) {
        const body = this.sprite.body;
        const againstWall = body.blocked.left || body.blocked.right;
        const inAir = !body.blocked.down && !body.touching.down;

        if (cursors.wallCling.isDown && againstWall && inAir && !this.isWallClinging) {
            this.isWallClinging = true;
            body.setVelocityY(PLAYER_CONFIG.WALL_CLING_FALL_SPEED);
            body.setAllowGravity(false);

            this.wallClingTimer = this.scene.time.delayedCall(
                PLAYER_CONFIG.WALL_CLING_DURATION,
                () => {
                    this.isWallClinging = false;
                    body.setAllowGravity(true);
                }
            );
        }

        if (this.isWallClinging && (!againstWall || body.blocked.down)) {
            this.isWallClinging = false;
            body.setAllowGravity(true);
            if (this.wallClingTimer) this.wallClingTimer.remove();
        }
    }

    handleSlide(cursors) {
        if (this.isSliding) return;
        const body = this.sprite.body;
        const onGround = body.blocked.down || body.touching.down;

        if (Phaser.Input.Keyboard.JustDown(cursors.slide) && onGround) {
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

    updateGrappleLine() {
        this.grappleLine.clear();
        if (!this.grappleActive || !this.grapplePoint) return;

        this.grappleLine.lineStyle(GRAPPLE_CONFIG.WIDTH, COLORS.GRAPPLE, 0.8);
        this.grappleLine.lineBetween(
            this.sprite.x, this.sprite.y,
            this.grapplePoint.x, this.grapplePoint.y
        );
        this.grappleLine.fillStyle(COLORS.GRAPPLE, 1);
        this.grappleLine.fillCircle(this.grapplePoint.x, this.grapplePoint.y, 5);
    }

    updateBars() {
        const x = this.sprite.x - 20;
        const y = this.sprite.y - 30;

        // Health bar
        this.hpBar.clear();
        this.hpBar.fillStyle(0x000000, 0.6);
        this.hpBar.fillRect(x, y, 40, 5);
        const hpPct = this.health / PLAYER_CONFIG.MAX_HEALTH;
        const hpColor = hpPct > 0.5 ? COLORS.HEALTH_BAR : (hpPct > 0.25 ? 0xccaa44 : 0xcc4444);
        this.hpBar.fillStyle(hpColor, 1);
        this.hpBar.fillRect(x, y, 40 * hpPct, 5);

        // Rad bar
        this.radBar.clear();
        this.radBar.fillStyle(0x000000, 0.6);
        this.radBar.fillRect(x, y + 6, 40, 3);
        const radPct = this.radExposure / PLAYER_CONFIG.MAX_RAD;
        this.radBar.fillStyle(COLORS.RAD_BAR, 0.7);
        this.radBar.fillRect(x, y + 6, 40 * radPct, 3);
    }

    checkRadDamage() {
        if (this.radExposure > 0) {
            this.health -= 2 * (1 + this.radExposure / PLAYER_CONFIG.MAX_RAD);
            if (this.health <= 0) {
                this.die('radiation');
            }
        }
    }

    takeDamage(amount) {
        if (!this.isAlive) return;
        this.health -= amount;
        this.sprite.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
            if (this.sprite) this.sprite.clearTint();
        });
        if (this.health <= 0) {
            this.die('combat');
        }
    }

    die(cause) {
        this.isAlive = false;
        this.sprite.setTint(0x666666);
        this.sprite.body.enable = false;
        this.grappleLine.clear();
        this.hpBar.clear();
        this.radBar.clear();

        this.scene.events.emit('playerDied', this, cause);

        this.scene.time.delayedCall(3000, () => {
            this.respawn();
        });
    }

    respawn() {
        const spawnPoints = this.scene.mapData.spawnPoints;
        const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        this.health = PLAYER_CONFIG.MAX_HEALTH;
        this.radExposure = 0;
        this.isAlive = true;
        this.sprite.body.enable = true;
        this.sprite.clearTint();
        this.sprite.setPosition(spawn.x, spawn.y);
        this.sprite.body.setVelocity(0, 0);
        this.releaseGrapple();
    }

    destroy() {
        this.sprite.destroy();
        this.grappleLine.destroy();
        this.hpBar.destroy();
        this.radBar.destroy();
    }
}
