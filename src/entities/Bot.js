import { Player } from './Player.js';
import { PLAYER_CONFIG } from '../utils/constants.js';

export class Bot extends Player {
    constructor(scene, x, y, playerId) {
        super(scene, x, y, playerId);
        this.isBot = true;
        this.targetPlayer = null;
        this.moveDir = 1;
        this.jumpCooldown = 0;
        this.stuckTimer = 0;
        this.lastX = x;
        this.lastY = y;
        this.forceJump = false;
        this.strafeDir = 1;
        this.decisionTimer = 0;
        this.aim = { x: x + 100, y: y };
    }

    update(cursors, pointer, time) {
        if (!this.isAlive) return;
        this.aiUpdate(time);
        super.update(this.fakeCursors(time), this.fakePointer(), time);
    }

    aiUpdate(time) {
        // Bots always target the human player (player 0)
        const human = this.scene.players[0];
        if (!human || !human.isAlive) return;
        const target = human;

        const body = this.sprite.body;
        const onGround = body.blocked.down || body.touching.down;
        const dx = target.sprite.x - this.sprite.x;
        const dy = target.sprite.y - this.sprite.y;
        const nearestDist = Phaser.Math.Distance.Between(
            this.sprite.x, this.sprite.y, target.sprite.x, target.sprite.y
        );
        this.targetPlayer = target;

        // Aim at human player with small error
        this.aim = {
            x: target.sprite.x + (Math.random() - 0.5) * 40,
            y: target.sprite.y - 8,
        };

        // Stuck detection
        const moved = Math.abs(this.sprite.x - this.lastX) + Math.abs(this.sprite.y - this.lastY);
        this.stuckTimer = moved < 2 ? this.stuckTimer + 16 : 0;
        this.lastX = this.sprite.x;
        this.lastY = this.sprite.y;

        // Movement decision on a timer to avoid constant flicker
        this.decisionTimer -= 16;
        if (this.decisionTimer <= 0) {
            this.decisionTimer = 60 + Math.random() * 180;

            if (nearestDist > 360) {
                // Approach
                this.moveDir = dx > 0 ? 1 : -1;
                this.strafeDir = 0;
            } else if (nearestDist < 160) {
                // Retreat / strafe away
                this.moveDir = dx > 0 ? -1 : 1;
                this.strafeDir = 0;
            } else {
                // In combat band: strafe side to side
                if (Math.random() < 0.5) this.strafeDir = (Math.random() < 0.5 ? 1 : -1) * (dx >= 0 ? 1 : -1);
                this.moveDir = 0;
            }
        }

        // Effective horizontal : strafing means rock back and forth around target
        let effMove = this.moveDir;
        if (this.strafeDir !== 0 && nearestDist >= 160 && nearestDist <= 360) {
            effMove = this.strafeDir;
        }

        this.currentMove = effMove;

        // Jump: when target above, or stuck, or occasionally
        const targetAbove = dy < -45;
        const shouldJump = onGround && (
            (targetAbove && nearestDist < 400) ||
            this.stuckTimer > 300 ||
            (nearestDist > 200 && Math.random() < 0.05)
        );
        if (shouldJump && time > this.jumpCooldown) {
            this.jumpCooldown = time + 260;
            this.forceJump = true;
        }
    }

    fakeCursors(time) {
        const body = this.sprite.body;
        const shouldJump = this.forceJump;
        this.forceJump = false;

        const left = this.currentMove < 0;
        const right = this.currentMove > 0;

        return {
            left: { isDown: left },
            right: { isDown: right },
            up: { isDown: false },
            jump: { isDown: shouldJump },
            slide: { isDown: false },
            wallCling: { isDown: false },
        };
    }

    fakePointer() {
        return {
            worldX: this.aim.x,
            worldY: this.aim.y,
            rightButtonDown: () => false,
            rightButtonReleased: () => false,
        };
    }

    shouldShoot(time) {
        if (!this.targetPlayer || !this.isAlive) return false;
        const dist = Phaser.Math.Distance.Between(
            this.sprite.x, this.sprite.y,
            this.targetPlayer.sprite.x, this.targetPlayer.sprite.y
        );
        // Bots shoot more when closer, always trying to fight
        const baseProb = dist < 200 ? 0.22 : (dist < 400 ? 0.16 : 0.10);
        return Math.random() < baseProb;
    }

    getShootAngle() {
        if (!this.targetPlayer) return this.moveDir > 0 ? 0 : Math.PI;
        return Phaser.Math.Angle.Between(
            this.sprite.x, this.sprite.y - 8,
            this.aim.x, this.aim.y
        );
    }
}
