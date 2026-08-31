import Phaser from 'phaser';
import { GAME_CONFIG, PLAYER_CONFIG, COLORS, WEAPON_CONFIG } from '../utils/constants.js';
import { Player } from '../entities/Player.js';
import { Bot } from '../entities/Bot.js';
import { WeaponSystem } from '../entities/Weapon.js';
import { TouchControls } from '../entities/TouchControls.js';
import { JUNKYARD_MAP, buildMap, buildRadZones, buildPickups, buildDecor } from '../maps/junkyard.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    init(data) {
        this.gameMode = data.mode || 'practice';
    }

    create() {
        this.weaponConfigs = WEAPON_CONFIG;
        this.mapData = JUNKYARD_MAP;
        this.cameras.main.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);
        this.cameras.main.setBackgroundColor(COLORS.BACKGROUND);

        // Build world
        const built = buildMap(this, this.mapData);
        this.platforms = built.platforms;
        this.solidObstacles = built.obstacles;
        this.radZones = buildRadZones(this, this.mapData);
        this.pickups = buildPickups(this, this.mapData);
        buildDecor(this, this.mapData);

        this.createBackground();

        // Players
        this.players = [];
        this.weapons = [];
        this.createPlayers();

        // --- COLLIDERS ---
        // Player vs platforms & obstacles (prevent passing through walls/cover)
        for (const player of this.players) {
            this.physics.add.collider(player.sprite, this.platforms);
            this.physics.add.collider(player.sprite, this.solidObstacles);
        }
        // Player vs player (prevent stacking/overlap)
        for (let i = 0; i < this.players.length; i++) {
            for (let j = i + 1; j < this.players.length; j++) {
                this.physics.add.collider(this.players[i].sprite, this.players[j].sprite);
            }
        }

        // Bullets vs platforms & obstacles
        for (const ws of this.weapons) {
            this.physics.add.collider(ws.projectiles, this.platforms, (bullet) => {
                if (bullet.explosive) {
                    ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                }
                ws.deactivateBullet(bullet);
            });
            this.physics.add.collider(ws.projectiles, this.solidObstacles, (bullet) => {
                if (bullet.explosive) {
                    ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                }
                ws.deactivateBullet(bullet);
            });
        }

        // Human player pickups
        this.physics.add.overlap(this.players[0].sprite, this.pickups, (sprite, pickup) => {
            this.collectPickup(this.players[0], pickup);
        });

        // Rad zone overlap
        for (const player of this.players) {
            for (const zone of this.radZones) {
                this.physics.add.overlap(player.sprite, zone.rect, () => {
                    if (player.isAlive) {
                        player.radExposure = Math.min(player.radExposure + 0.5, PLAYER_CONFIG.MAX_RAD);
                    }
                });
            }
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
            reload: Phaser.Input.Keyboard.KeyCodes.R,
            esc: Phaser.Input.Keyboard.KeyCodes.ESC,
        });

        // UI
        this.createUI();

        // Touch / on-screen controls (works on both touch & desktop)
        this.touchControls = new TouchControls(this);

        this.events.on('playerDied', (player, cause) => {
            this.showKillFeed(player, cause);
        });

        this.scores = {};
        for (const p of this.players) this.scores[p.playerId] = 0;
        this.gameTime = 0;

        // Camera follow player 0
        this.cameras.main.startFollow(this.players[0].sprite, true, 0.08, 0.08);
    }

    createPlayers() {
        const spawns = this.mapData.spawnPoints;

        this.players.push(new Player(this, spawns[0].x, spawns[0].y, 0));
        this.weapons.push(new WeaponSystem(this));

        const bots = this.gameMode === 'practice' ? 3 : 0;
        for (let i = 0; i < bots; i++) {
            const sp = spawns[(i + 1) % spawns.length];
            this.players.push(new Bot(this, sp.x, sp.y, i + 1));
            this.weapons.push(new WeaponSystem(this));
        }
    }

    createBackground() {
        const bg = this.add.graphics();
        bg.setDepth(0);

        const w = this.mapData.width * 32;
        const h = this.mapData.height * 32;
        bg.fillStyle(0x1a0a00, 1);
        bg.fillRect(0, 0, w, h);

        // Distant ruined skyline
        bg.fillStyle(0x241208, 1);
        this.addSkyline(bg, w, h, 0.15, 40);

        // Ground haze
        bg.fillStyle(0x44ff00, 0.02);
        bg.fillRect(0, 0, w, h);
    }

    addSkyline(g, w, h, alpha, baseH) {
        g.fillStyle(0x241208, alpha * 6);
        for (let i = 0; i < 14; i++) {
            const bw = 50 + Math.random() * 70;
            const bh = baseH + Math.random() * 160;
            const bx = i * (w / 14);
            g.fillRect(bx, h - bh, bw, bh);
        }
    }

    createUI() {
        const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
        this.ui = ui;

        // Top bar panel
        this.topBar = this.add.rectangle(GAME_CONFIG.WIDTH / 2, 0, GAME_CONFIG.WIDTH, 44, 0x000000, 0.55)
            .setOrigin(0.5, 0);
        ui.add(this.topBar);

        // Health (top-left)
        this.healthBarBg = this.add.rectangle(130, 22, 180, 18, 0x222222, 1).setOrigin(0, 0.5);
        this.healthBarFill = this.add.rectangle(131, 22, 178, 16, 0x44cc44, 1).setOrigin(0, 0.5);
        this.healthText = this.add.text(318, 14, '100', {
            fontSize: '15px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        });
        ui.add([this.healthBarBg, this.healthBarFill, this.healthText]);

        // Rad bar (top center-left)
        this.radBarBg = this.add.rectangle(380, 22, 120, 10, 0x222222, 1).setOrigin(0, 0.5);
        this.radBarFill = this.add.rectangle(381, 22, 118, 8, 0x44ff44, 1).setOrigin(0, 0.5);
        this.radText = this.add.text(506, 14, 'RAD 0', {
            fontSize: '12px', fontFamily: 'monospace', color: '#88ff88'
        });
        ui.add([this.radBarBg, this.radBarFill, this.radText]);

        // Score / kills (top-right)
        this.scoreText = this.add.text(GAME_CONFIG.WIDTH - 14, 14, 'KILLS: 0', {
            fontSize: '16px', fontFamily: 'monospace', color: '#e0d0c0', fontStyle: 'bold'
        }).setOrigin(1, 0);
        ui.add(this.scoreText);

        // --- WEAPON SLOTS (bottom-center, Mini-Militia style) ---
        this.weaponSlots = [];
        const slotW = 64;
        const slotH = 56;
        const slotGap = 10;
        const startX = GAME_CONFIG.WIDTH / 2 - (slotW * Object.keys(WEAPON_CONFIG).length + slotGap * (Object.keys(WEAPON_CONFIG).length - 1)) / 2;
        const slotY = GAME_CONFIG.HEIGHT - slotH - 14;

        let idx = 0;
        for (const [key, cfg] of Object.entries(WEAPON_CONFIG)) {
            const slot = this.add.container(0, 0);
            const bg = this.add.rectangle(startX + idx * (slotW + slotGap) + slotW / 2, slotY + slotH / 2, slotW, slotH, idx === 0 ? 0xccaa44 : 0x2a1a10, idx === 0 ? 0.8 : 0.6)
                .setStrokeStyle(2, idx === 0 ? 0xffdd66 : 0x8a6a4a);
            const icon = this.add.image(startX + idx * (slotW + slotGap) + slotW / 2, slotY + 10, cfg.sprite);
            icon.setScale(0.8);
            const keyLabel = this.add.text(startX + idx * (slotW + slotGap) + slotW / 2, slotY + slotH - 22, (idx + 1).toString(), {
                fontSize: '12px', fontFamily: 'monospace', color: '#ccaa44'
            }).setOrigin(0.5, 0);
            const ammoLabel = this.add.text(startX + idx * (slotW + slotGap) + slotW / 2, slotY + slotH - 8, cfg.ammo.toString(), {
                fontSize: '12px', fontFamily: 'monospace', color: '#e0d0c0'
            }).setOrigin(0.5, 0.5);
            slot.add([bg, icon, keyLabel, ammoLabel]);
            slot.module = { bg, icon, keyLabel, ammoLabel, key };
            ui.add(slot);
            this.weaponSlots.push(slot);

            // Click to select
            const rect = this.add.rectangle(startX + idx * (slotW + slotGap) + slotW / 2, slotY + slotH / 2, slotW, slotH, 0xffffff, 0)
                .setInteractive({ useHandCursor: true });
            rect.on('pointerdown', () => this.selectWeapon(key));
            ui.add(rect);

            idx++;
        }

        // Ammo big display (right of slots)
        this.bigAmmo = this.add.text(startX - 30, slotY + slotH / 2, '30', {
            fontSize: '28px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(1, 0.5);
        ui.add(this.bigAmmo);

        // --- KILL FEED (top center) ---
        this.killFeed = this.add.text(GAME_CONFIG.WIDTH - 14, 52, '', {
            fontSize: '13px', fontFamily: 'monospace', color: '#ffcc66', align: 'right', backgroundColor: '#00000088'
        }).setOrigin(1, 0);
        ui.add(this.killFeed);

        // Grapple cooldown indicator (bottom-left)
        this.grappleCd = this.add.text(14, GAME_CONFIG.HEIGHT - 40, 'GRAPPLE READY', {
            fontSize: '12px', fontFamily: 'monospace', color: '#ccaa44'
        });
        ui.add(this.grappleCd);

        // Controls hint (very bottom)
        this.controlsHint = this.add.text(14, GAME_CONFIG.HEIGHT - 18,
            'CLICK: Shoot | R: Reload | R-CLICK: Grapple | WASD: Move | SPACE: Jump | 1-4: Weapons | Q: Wall Cling', {
            fontSize: '11px', fontFamily: 'monospace', color: '#665544'
        });
        ui.add(this.controlsHint);
    }

    selectWeapon(key) {
        if (WEAPON_CONFIG[key]) {
            this.weapons[0].switchWeapon(key);
            this.players[0].setWeapon(key);
        }
    }

    collectPickup(player, pickup) {
        if (!player.isAlive) return;
        if (pickup.pickupType === 'health') {
            player.health = Math.min(player.health + 30, PLAYER_CONFIG.MAX_HEALTH);
        } else if (pickup.pickupType === 'weapon' && pickup.weapon) {
            this.selectWeapon(pickup.weapon);
            this.weapons[0].addAmmo(pickup.weapon, WEAPON_CONFIG[pickup.weapon].ammo);
        }
        pickup.body.enable = false;
        pickup.setAlpha(0);
        this.time.delayedCall(15000, () => {
            if (pickup && pickup.scene) { pickup.body.enable = true; pickup.setAlpha(1); }
        });
    }

    showKillFeed(player, cause) {
        const name = player.isBot ? `Raider ${player.playerId}` : 'You';
        const msg = cause === 'radiation' ? `${name}~ radiation` : `${name} eliminated`;
        this.killFeed.setText(msg);
        this.time.delayedCall(2500, () => this.killFeed.setText(''));
    }

    update(time, delta) {
        this.gameTime += delta;

        // --- UPDATE PLAYERS ---
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (player.isBot) {
                player.update(null, null, time);
                if (player.isAlive && player.shouldShoot(time)) {
                    const angle = player.getShootAngle();
                    const recoil = this.weapons[i].fire(player.sprite.x, player.sprite.y - 8, angle, time);
                    if (recoil && player.sprite.body) {
                        player.sprite.body.setVelocityX(player.sprite.body.velocity.x + recoil);
                    }
                }
                // Bots auto-reload when empty
                if (this.weapons[i].mag[this.weapons[i].currentWeapon] === 0 && !this.weapons[i].isReloadingWeapon) {
                    this.weapons[i].reload(time);
                }
            } else {
                // Merge virtual touch input into keyboard state
                const mergedCursors = this.touchControls.applyTo(this.cursors);
                player.update(mergedCursors, this.input.activePointer);

                // Weapon switch (keyboard)
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon1)) this.selectWeapon('SCRAP_RIFLE');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon2)) this.selectWeapon('NAIL_GUN');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon3)) this.selectWeapon('PIPE_BOMB');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon4)) this.selectWeapon('ACID_SPRAYER');

                // Reload (keyboard R or touch)
                if (Phaser.Input.Keyboard.JustDown(this.cursors.reload) || this.touchControls.state.reloadPressed) {
                    this.weapons[0].reload(time);
                }

                // Determine aim point: mouse if mouse used, else nearest enemy (touch)
                let aimX = this.input.activePointer.worldX;
                let aimY = this.input.activePointer.worldY;

                // If touch shooting, aim at nearest enemy (world coords)
                if (this.touchControls.state.shoot) {
                    const nearest = this.players
                        .filter(p => p !== player && p.isAlive)
                        .sort((a, b) =>
                            Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, a.sprite.x, a.sprite.y) -
                            Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, b.sprite.x, b.sprite.y)
                        )[0];
                    if (nearest) {
                        aimX = nearest.sprite.x;
                        aimY = nearest.sprite.y - 8;
                    } else {
                        aimX = player.sprite.x + (player.facingRight ? 1 : -1) * 100;
                        aimY = player.sprite.y;
                    }
                }

                // Shooting: mouse click OR touch fire button
                const mouseShoot = this.input.activePointer.isDown;
                const touchShoot = this.touchControls.state.shoot;
                const wantsShoot = (mouseShoot || touchShoot);

                // Grapple: touch button OR right click
                const touchGrapple = this.touchControls.state.grapple;

                if (wantsShoot && player.isAlive && !this.weapons[0].isReloadingWeapon) {
                    const angle = Phaser.Math.Angle.Between(
                        player.sprite.x, player.sprite.y - 8, aimX, aimY
                    );
                    player.facingRight = angle > -Math.PI / 2 && angle < Math.PI / 2;
                    player.sprite.setFlipX(!player.facingRight);
                    const recoil = this.weapons[0].fire(player.sprite.x, player.sprite.y - 8, angle, time);
                    if (recoil && player.sprite.body) {
                        player.sprite.body.setVelocityX(player.sprite.body.velocity.x + recoil);
                    }
                }

                // Touch grapple button
                if (touchGrapple && player.canGrapple && !player.grappleActive) {
                    player.fireGrapple(player.sprite.x + (player.facingRight ? 1 : -1) * 150, player.sprite.y - 120);
                }
            }
        }

        // Consume one-frame touch presses after handling
        this.touchControls.consumePressed();

        // --- BULLET HITS PLAYERS ---
        for (let i = 0; i < this.weapons.length; i++) {
            const ws = this.weapons[i];
            ws.projectiles.children.each((bullet) => {
                if (!bullet.active) return;
                for (let j = 0; j < this.players.length; j++) {
                    if (j === i) continue;
                    const p = this.players[j];
                    if (!p.isAlive) continue;
                    const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, p.sprite.x, p.sprite.y - 8);
                    if (dist < 22) {
                        if (bullet.explosive) {
                            ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                        } else {
                            p.takeDamage(bullet.damage);
                        }
                        ws.deactivateBullet(bullet);
                        break;
                    }
                }
            });
        }

        // --- RAD DECAY ---
        for (const player of this.players) {
            if (player.isAlive && player.radExposure > 0) {
                let inZone = false;
                for (const zone of this.radZones) {
                    if (zone.bounds.contains(player.sprite.x, player.sprite.y)) { inZone = true; break; }
                }
                if (inZone) {
                    player.health -= 1.5;
                    if (player.health <= 0) player.die('radiation');
                } else {
                    player.radExposure = Math.max(0, player.radExposure - 0.3);
                }
            }
        }

        // --- UPDATE UI ---
        if (this.players[0]) {
            const p = this.players[0];
            const hp = Math.max(0, Math.ceil(p.health));
            this.healthBarFill.displayWidth = (hp / PLAYER_CONFIG.MAX_HEALTH) * 178;
            const hpColor = hp > 50 ? 0x44cc44 : (hp > 25 ? 0xccaa44 : 0xcc4444);
            this.healthBarFill.setFillStyle(hpColor);
            this.healthText.setText(hp);

            this.radBarFill.displayWidth = (Math.min(100, p.radExposure) / 100) * 118;
            this.radText.setText('RAD ' + Math.ceil(p.radExposure));

            const ws = this.weapons[0];
            const mag = ws.mag[ws.currentWeapon];
            this.bigAmmo.setText(mag !== undefined ? mag + '' : '∞');
            // Reload indicator / color
            if (ws.isReloadingWeapon) {
                this.bigAmmo.setColor('#ccaa44');
            } else if (mag === 0) {
                this.bigAmmo.setColor('#cc4444');
            } else {
                this.bigAmmo.setColor('#ffffff');
            }

            // Reload progress bar above ammo
            if (!this.reloadBarBg) {
                this.reloadBarBg = this.add.rectangle(this.bigAmmo.x + 15, this.bigAmmo.y - 16, 60, 6, 0x333333, 1).setOrigin(0, 0.5);
                this.reloadBarFill = this.add.rectangle(this.bigAmmo.x + 15, this.bigAmmo.y - 16, 58, 4, 0xccaa44, 1).setOrigin(0, 0.5).setVisible(false);
                this.reloadText = this.add.text(this.bigAmmo.x + 15, this.bigAmmo.y - 26, 'RELOADING', {
                    fontSize: '10px', fontFamily: 'monospace', color: '#ccaa44'
                }).setOrigin(0, 0.5).setVisible(false);
                this.ui.add([this.reloadBarBg, this.reloadBarFill, this.reloadText]);
                this.reloadBarBg.setVisible(false);
            }
            this.reloadBarBg.setVisible(ws.isReloadingWeapon);
            this.reloadBarFill.setVisible(ws.isReloadingWeapon);
            this.reloadText.setVisible(ws.isReloadingWeapon);
            if (ws.isReloadingWeapon) {
                this.reloadBarFill.displayWidth = 58 * ws.reloadProgress;
            }

            // Highlight selected slot
            for (let s = 0; s < this.weaponSlots.length; s++) {
                const slot = this.weaponSlots[s];
                const active = slot.module.key === ws.currentWeapon;
                slot.module.bg.setFillStyle(active ? 0xccaa44 : 0x2a1a10, active ? 0.8 : 0.6);
                slot.module.bg.setStrokeStyle(2, active ? 0xffdd66 : 0x8a6a4a);
                const m = ws.mag[slot.module.key];
                slot.module.ammoLabel.setText(m !== undefined ? m + '' : '∞');
                if (active) {
                    const cfg = WEAPON_CONFIG[ws.currentWeapon];
                    p.currentWeaponKey = ws.currentWeapon;
                    p.weaponSprite.setTexture(cfg && cfg.sprite ? cfg.sprite : 'weapon_hand');
                }
            }

            // Grapple cooldown
            const gReady = p.canGrapple;
            this.grappleCd.setText(gReady ? 'GRAPPLE READY' : 'GRAPPLE CD');
            this.grappleCd.setColor(gReady ? '#ccaa44' : '#664422');
        }

        // ESC to menu
        if (Phaser.Input.Keyboard.JustDown(this.cursors.esc)) {
            this.scene.start('MenuScene');
        }
    }
}
