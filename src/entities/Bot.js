import { Player } from './Player.js';
import { PLAYER_CONFIG } from '../utils/constants.js';

export class Bot extends Player {
    constructor(scene, x, y, playerId) {
        super(scene, x, y, playerId);
        this.isBot = true;
        this.targetPlayer = null;
        this.actionTimer = 0;
        this.moveDir = 1;
        this.shootCooldown = 0;
        this.jumpCooldown = 0;

        this.sprite.setTint(0xcc6644);
    }

    update(cursors, pointer, time) {
        if (!this.isAlive) return;

        this.aiUpdate(time);
        super.update(this.fakeCursors(), this.fakePointer());
    }

    aiUpdate(time) {
        const scene = this.scene;
        const players = scene.players.filter(p => p !== this && p.isAlive);

        if (players.length === 0) return;

        // Find nearest player
        let nearest = null;
        let nearestDist = Infinity;
        for (const p of players) {
            const d = Phaser.Math.Distance.Between(
                this.sprite.x, this.sprite.y,
                p.sprite.x, p.sprite.y
            );
            if (d < nearestDist) {
                nearestDist = d;
                nearest = p;
            }
        }

        this.targetPlayer = nearest;
        if (!nearest) return;

        const dx = nearest.sprite.x - this.sprite.x;
        const dy = nearest.sprite.y - this.sprite.y;

        // Move towards or away
        if (nearestDist > 300) {
            this.moveDir = dx > 0 ? 1 : -1;
        } else if (nearestDist < 100) {
            this.moveDir = dx > 0 ? -1 : 1;
        } else {
            this.moveDir = Math.random() > 0.02 ? this.moveDir : -this.moveDir;
        }

        // Shoot
        this.shootCooldown = time;

        // Jump occasionally
        if (this.sprite.body.blocked.down && Math.random() < 0.03) {
            this.jumpCooldown = time;
        }
    }

    fakeCursors() {
        const f = this.targetPlayer;
        const aiLeft = this.moveDir < 0;
        const aiRight = this.moveDir > 0;
        const body = this.sprite.body;
        const now = this.scene.time.now;

        return {
            left: { isDown: aiLeft },
            right: { isDown: aiRight },
            up: { isDown: false },
            jump: { isDown: now - this.jumpCooldown < 50 },
            slide: { isDown: false },
            wallCling: { isDown: false },
        };
    }

    fakePointer() {
        if (!this.targetPlayer) {
            return {
                x: this.sprite.x + this.moveDir * 100,
                y: this.sprite.y,
                rightButtonDown: () => false,
                rightButtonReleased: () => true,
                worldX: this.sprite.x + this.moveDir * 100,
                worldY: this.sprite.y,
            };
        }

        const tx = this.targetPlayer.sprite.x;
        const ty = this.targetPlayer.sprite.y;

        return {
            x: tx,
            y: ty,
            rightButtonDown: () => Math.random() < 0.05 && this.canGrapple,
            rightButtonReleased: () => true,
            worldX: tx + (Math.random() - 0.5) * 100,
            worldY: ty + (Math.random() - 0.5) * 100,
        };
    }

    shouldShoot(time) {
        if (!this.targetPlayer || !this.isAlive) return false;
        const dist = Phaser.Math.Distance.Between(
            this.sprite.x, this.sprite.y,
            this.targetPlayer.sprite.x, this.targetPlayer.sprite.y
        );
        return dist < 400 && Math.random() < 0.08;
    }

    getShootAngle() {
        if (!this.targetPlayer) return this.moveDir > 0 ? 0 : Math.PI;
        return Phaser.Math.Angle.Between(
            this.sprite.x, this.sprite.y,
            this.targetPlayer.sprite.x, this.targetPlayer.sprite.y
        );
    }
}
