import Phaser from 'phaser';
import { GAME_CONFIG, PLAYER_CONFIG, COLORS, WEAPON_CONFIG } from '../utils/constants.js';
import { Player } from '../entities/Player.js';
import { Bot } from '../entities/Bot.js';
import { WeaponSystem } from '../entities/Weapon.js';
import { JUNKYARD_MAP, buildMap, buildRadZones, buildPickups } from '../maps/junkyard.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    init(data) {
        this.gameMode = data.mode || 'practice';
    }

    create() {
        this.mapData = JUNKYARD_MAP;
        this.cameras.main.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);

        // Build world
        this.platforms = buildMap(this, this.mapData);
        this.radZones = buildRadZones(this, this.mapData);
        this.pickups = buildPickups(this, this.mapData);

        // Background details
        this.createBackground();

        // Players
        this.players = [];
        this.weapons = [];
        this.createPlayers();

        // Weapon projectiles collision
        for (const ws of this.weapons) {
            this.physics.add.collider(ws.projectiles, this.platforms, (bullet) => {
                if (bullet.explosive) {
                    ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                }
                ws.deactivateBullet(bullet);
            });
        }

        // Pickup collisions
        for (const player of this.players) {
            if (player.isBot) continue;
            this.physics.add.overlap(player.sprite, this.pickups, (sprite, pickup) => {
                this.collectPickup(player, pickup);
            });
        }

        // Rad zone overlap for players
        for (const player of this.players) {
            for (const zone of this.radZones) {
                this.physics.add.overlap(player.sprite, zone.rect, () => {
                    if (player.isAlive) {
                        player.radExposure = Math.min(player.radExposure + 0.5, PLAYER_CONFIG.MAX_RAD);
                    }
                });
            }
        }

        // Platform collisions for players
        for (const player of this.players) {
            this.physics.add.collider(player.sprite, this.platforms);
        }

        // Input
        this.cursors = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
            slide: Phaser.Input.Keyboard.KeyCodes.SHIFT,
            wallCling: Phaser.Input.Keyboard.KeyCodes.Q,
            weapon1: Phaser.Input.Keyboard.KeyCodes.ONE,
            weapon2: Phaser.Input.Keyboard.KeyCodes.TWO,
            weapon3: Phaser.Input.Keyboard.KeyCodes.THREE,
            weapon4: Phaser.Input.Keyboard.KeyCodes.FOUR,
        });

        // UI
        this.createUI();

        // Event listeners
        this.events.on('playerDied', (player, cause) => {
            this.showKillFeed(player, cause);
        });

        // Score
        this.scores = {};
        for (const p of this.players) {
            this.scores[p.playerId] = 0;
        }

        this.gameTime = 0;
        this.kills = {};

        // Camera follow player 0
        if (this.players[0]) {
            this.cameras.main.startFollow(this.players[0].sprite, true, 0.08, 0.08);
        }
    }

    createPlayers() {
        const spawns = this.mapData.spawnPoints;

        // Human player
        const p0 = new Player(this, spawns[0].x, spawns[0].y, 0);
        this.players.push(p0);
        this.weapons.push(new WeaponSystem(this));

        // Bots
        const botCount = this.gameMode === 'practice' ? 3 : 0;
        for (let i = 0; i < botCount; i++) {
            const sp = spawns[(i + 1) % spawns.length];
            const bot = new Bot(this, sp.x, sp.y, i + 1);
            this.players.push(bot);
            this.weapons.push(new WeaponSystem(this));
        }
    }

    createBackground() {
        // Parallax background layers
        const bg = this.add.graphics();
        bg.setDepth(0);
        bg.setScrollFactor(0.2);

        // Distant ruined buildings
        bg.fillStyle(0x1a0a00, 1);
        bg.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);

        bg.fillStyle(0x2a1510, 1);
        for (let i = 0; i < 12; i++) {
            const x = i * 120 + Math.random() * 40;
            const h = 80 + Math.random() * 200;
            bg.fillRect(x, GAME_CONFIG.HEIGHT - h - 60, 40 + Math.random() * 60, h);
        }

        // Stars / particles
        bg.fillStyle(0xccaa44, 0.3);
        for (let i = 0; i < 30; i++) {
            bg.fillCircle(
                Math.random() * GAME_CONFIG.WIDTH,
                Math.random() * GAME_CONFIG.HEIGHT * 0.6,
                1
            );
        }

        // Rad fog at bottom
        const fog = this.add.graphics();
        fog.setDepth(0);
        fog.fillStyle(0x44ff00, 0.03);
        fog.fillRect(0, 0, this.mapData.width * 32, this.mapData.height * 32);
    }

    createUI() {
        this.uiContainer = this.add.container(0, 0);
        this.uiContainer.setScrollFactor(0);
        this.uiContainer.setDepth(100);

        // Background panel
        const panel = this.add.rectangle(0, 0, GAME_CONFIG.WIDTH, 40, 0x000000, 0.5);
        panel.setOrigin(0, 0);
        this.uiContainer.add(panel);

        // Health text
        this.healthText = this.add.text(10, 10, 'HP: 100', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#44cc44',
        });
        this.uiContainer.add(this.healthText);

        // Weapon text
        this.weaponText = this.add.text(150, 10, '', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#ccaa44',
        });
        this.uiContainer.add(this.weaponText);

        // Rad text
        this.radText = this.add.text(400, 10, 'RAD: 0', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#44ff44',
        });
        this.uiContainer.add(this.radText);

        // Score text
        this.scoreText = this.add.text(GAME_CONFIG.WIDTH - 10, 10, 'KILLS: 0', {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#e0d0c0',
        }).setOrigin(1, 0);
        this.uiContainer.add(this.scoreText);

        // Kill feed
        this.killFeed = this.add.text(GAME_CONFIG.WIDTH - 10, 50, '', {
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#aa8866',
            align: 'right',
        }).setOrigin(1, 0);
        this.uiContainer.add(this.killFeed);

        // Controls hint
        this.controlsHint = this.add.text(10, GAME_CONFIG.HEIGHT - 25, 'WASD Move | MOUSE Shoot | RClick Grapple | SPACE Jump | Q Wall | SHIFT Slide | 1-4 Weapons', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#554433',
        });
        this.controlsHint.setScrollFactor(0);
        this.controlsHint.setDepth(100);
    }

    collectPickup(player, pickup) {
        if (!player.isAlive || player.isBot) return;

        if (pickup.pickupType === 'health') {
            player.health = Math.min(player.health + 30, PLAYER_CONFIG.MAX_HEALTH);
        } else if (pickup.pickupType === 'weapon' && pickup.weapon) {
            const ws = this.weapons[0];
            ws.switchWeapon(pickup.weapon);
            ws.addAmmo(pickup.weapon, WEAPON_CONFIG[pickup.weapon].ammo);
        }

        // Respawn pickup after delay
        pickup.body.enable = false;
        pickup.setAlpha(0);
        this.time.delayedCall(15000, () => {
            if (pickup && pickup.scene) {
                pickup.body.enable = true;
                pickup.setAlpha(1);
            }
        });
    }

    showKillFeed(player, cause) {
        const name = player.isBot ? `Bot ${player.playerId}` : 'You';
        const msg = cause === 'radiation' ? `${name} died to radiation` : `${name} was eliminated`;
        this.killFeed.setText(msg);

        if (!player.isBot) {
            const weaponNames = Object.keys(WEAPON_CONFIG);
            const randomWeapon = weaponNames[Math.floor(Math.random() * weaponNames.length)];
            this.weapons[0].switchWeapon('SCRAP_RIFLE');
        }
    }

    update(time, delta) {
        this.gameTime += delta;

        // Update players
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (player.isBot) {
                player.update(null, null, time);
                if (player.isAlive && player.shouldShoot(time)) {
                    const angle = player.getShootAngle();
                    const recoil = this.weapons[i].fire(
                        player.sprite.x, player.sprite.y, angle, time
                    );
                    if (recoil && player.sprite.body) {
                        player.sprite.body.setVelocityX(
                            player.sprite.body.velocity.x + recoil
                        );
                    }
                }
            } else {
                player.update(this.cursors, this.input.activePointer);

                // Weapon switch
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon1)) {
                    this.weapons[0].switchWeapon('SCRAP_RIFLE');
                } else if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon2)) {
                    this.weapons[0].switchWeapon('NAIL_GUN');
                } else if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon3)) {
                    this.weapons[0].switchWeapon('PIPE_BOMB');
                } else if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon4)) {
                    this.weapons[0].switchWeapon('ACID_SPRAYER');
                }

                // Shoot
                if (this.input.activePointer.isDown && player.isAlive) {
                    const angle = Phaser.Math.Angle.Between(
                        player.sprite.x,
                        player.sprite.y,
                        this.input.activePointer.worldX,
                        this.input.activePointer.worldY
                    );
                    player.facingRight = angle > -Math.PI / 2 && angle < Math.PI / 2;
                    player.sprite.setFlipX(!player.facingRight);

                    const recoil = this.weapons[0].fire(
                        player.sprite.x,
                        player.sprite.y,
                        angle,
                        time
                    );
                    if (recoil && player.sprite.body) {
                        player.sprite.body.setVelocityX(
                            player.sprite.body.velocity.x + recoil
                        );
                    }
                }
            }
        }

        // Bullet vs player collision
        for (let i = 0; i < this.weapons.length; i++) {
            const ws = this.weapons[i];
            ws.projectiles.children.each((bullet) => {
                if (!bullet.active) return;
                for (let j = 0; j < this.players.length; j++) {
                    if (j === i) continue; // Don't hit self
                    const player = this.players[j];
                    if (!player.isAlive) continue;
                    const dist = Phaser.Math.Distance.Between(
                        bullet.x, bullet.y,
                        player.sprite.x, player.sprite.y
                    );
                    if (dist < 20) {
                        if (bullet.explosive) {
                            ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                        } else {
                            player.takeDamage(bullet.damage);
                        }
                        ws.deactivateBullet(bullet);

                        if (!player.isAlive) {
                            if (!this.players[i].isBot) {
                                this.scores[0]++;
                            }
                        }
                        break;
                    }
                }
            });
        }

        // Rad decay over time
        for (const player of this.players) {
            if (player.isAlive && player.radExposure > 0) {
                let inZone = false;
                for (const zone of this.radZones) {
                    if (zone.bounds.contains(player.sprite.x, player.sprite.y)) {
                        inZone = true;
                        break;
                    }
                }
                if (!inZone) {
                    player.radExposure = Math.max(0, player.radExposure - 0.3);
                }
            }
        }

        // Update UI
        if (this.players[0]) {
            const p = this.players[0];
            this.healthText.setText(`HP: ${Math.ceil(p.health)}`);
            this.healthText.setColor(p.health > 50 ? '#44cc44' : (p.health > 25 ? '#ccaa44' : '#cc4444'));
            this.weaponText.setText(this.weapons[0].getAmmoDisplay());
            this.radText.setText(`RAD: ${Math.ceil(p.radExposure)}`);
            this.radText.setVisible(p.radExposure > 0);
            this.scoreText.setText(`KILLS: ${this.scores[0]}`);
        }

        // ESC to menu
        if (Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey('ESC'))) {
            this.scene.start('MenuScene');
        }
    }
}
