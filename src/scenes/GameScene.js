import Phaser from 'phaser';
import { GAME_CONFIG, PLAYER_CONFIG, COLORS, WEAPON_CONFIG } from '../utils/constants.js';
import { Player } from '../entities/Player.js';
import { Bot } from '../entities/Bot.js';
import { RemotePlayer } from '../entities/RemotePlayer.js';
import { WeaponSystem } from '../entities/Weapon.js';
import { TouchControls } from '../entities/TouchControls.js';
import { NetClient } from '../net/NetClient.js';
import { JUNKYARD_MAP, buildMap, buildRadZones, buildPickups, buildDecor } from '../maps/junkyard.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    init(data) {
        this.gameMode = data.mode || 'practice';
        this.initRoomName = data.roomName || null;
    }

    create() {
        this.weaponConfigs = WEAPON_CONFIG;
        this.mapData = JUNKYARD_MAP;
        this.cameras.main.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);
        this.physics.world.setBounds(0, 0, this.mapData.width * 32, this.mapData.height * 32);
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

        // Online: remote bullets colliding with walls, and hitting the local player.
        if (this.gameMode === 'online') {
            const ws0 = this.weapons[0];
            this.physics.add.collider(ws0.remoteProjectiles, this.platforms, (bullet) => {
                if (bullet.explosive) {
                    ws0.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                }
                ws0.deactivateBullet(bullet);
            });
            this.physics.add.collider(ws0.remoteProjectiles, this.solidObstacles, (bullet) => {
                if (bullet.explosive) {
                    ws0.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
                }
                ws0.deactivateBullet(bullet);
            });
            // Remote bullets that reach the local player. HP/damage is decided by
            // the SERVER (authoritative); here we only stop the visual projectile.
            this.physics.add.overlap(ws0.remoteProjectiles, this.players[0].sprite, (bullet) => {
                if (!bullet.active) return;
                ws0.deactivateBullet(bullet);
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
        window.__ws = this.touchControls;

        // "BACK TO MENU" inside the settings panel leaves the current match.
        // In online mode the scene SHUTDOWN handler disconnects from the server.
        this.touchControls.onExit = () => this.scene.start('MenuScene');

        this.events.on('playerDied', (player, cause) => {
            // In online mode the server-driven elim event already shows the feed.
            if (this.gameMode !== 'online') {
                this.showKillFeed(player, cause);
            }
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

        // Online mode: no bots; real players connect from other devices.
        const bots = this.gameMode === 'practice' ? 3 : 0;
        for (let i = 0; i < bots; i++) {
            const sp = spawns[(i + 1) % spawns.length];
            this.players.push(new Bot(this, sp.x, sp.y, i + 1));
            this.weapons.push(new WeaponSystem(this));
        }

        if (this.gameMode === 'online') {
            this.remotes = new Map(); // peer socket id -> RemotePlayer
            this.setupNet();
        }
    }

    setupNet() {
        // NetClient connects to the server; we join the room named in init data.
        const roomName = (this.initRoomName) || this.registry.get('roomName') || 'default';
        this.net = new NetClient(this.registry.get('serverAddr'), roomName);
        this.net.connect();
        this.netConnected = false;
        this.lastHitByRemote = null;
        this.matchOver = false;
        this.onlineScores = [];

        // Status banner
        this.netStatus = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT - 56,
            'CONNECTING...', {
                fontSize: '16px', fontFamily: 'monospace', color: '#ffcc44',
                backgroundColor: '#000000aa',
            }).setOrigin(0.5).setDepth(50);

        // Scoreboard (top-right, below the kill feed)
        this.netScoreboard = this.add.text(GAME_CONFIG.WIDTH - 14, 96, '', {
            fontSize: '13px', fontFamily: 'monospace', color: '#aaddff',
            align: 'right', backgroundColor: '#00000088',
        }).setOrigin(1, 0).setDepth(50);

        this.net.on('error', () => {
            if (this.netStatus) this.netStatus.setText('SERVER UNREACHABLE - check the server is running');
        });

        this.net.on('joined', (data) => {
            this.netConnected = true;
            this.net.playerIndex = data.playerIndex;
            this.netStatus.setText(`ROOM "${roomName}" - YOU ARE P${data.playerIndex + 1}`);
            this.net.sendState(this.buildLocalState());
            if (data.scores) this.updateScoreboard(data.scores);
        });

        this.net.on('world', (peers) => {
            const seen = new Set();
            for (const peer of peers) {
                seen.add(peer.id);
                let rp = this.remotes.get(peer.id);
                if (!rp) {
                    rp = new RemotePlayer(this, peer.id, peer.playerIndex);
                    this.remotes.set(peer.id, rp);
                    this.attachRemoteBody(rp);
                }
                rp.applyState(peer);
            }
            for (const [id, rp] of this.remotes) {
                if (!seen.has(id)) {
                    this.detachRemoteBody(rp);
                    rp.destroy();
                    this.remotes.delete(id);
                }
            }
        });

        this.net.on('peer-left', (id) => {
            const rp = this.remotes.get(id);
            if (rp) {
                this.detachRemoteBody(rp);
                rp.destroy();
                this.remotes.delete(id);
            }
        });

        // Give each remote a physics body so the LOCAL player collides with
        // (and is pushed back by) other players instead of passing through them.
        // The remote body is immovable; the server relays authoritative positions.
        this.attachRemoteBody = (rp) => {
            if (!rp.sprite || rp.sprite.body) return;
            this.physics.add.existing(rp.sprite);
            const body = rp.sprite.body;
            body.setImmovable(true);
            body.setAllowGravity(false);
            body.setSize(26, 26);
            if (this.players[0] && this.players[0].sprite) {
                this.physics.add.collider(this.players[0].sprite, rp.sprite);
            }
        };

        this.detachRemoteBody = (rp) => {
            if (!rp.sprite || !rp.sprite.body) return;
            this.physics.world.disableBody(rp.sprite.body);
        };

        this.net.on('peer-event', ({ id, evt }) => {
            if (!this.remotes.has(id)) return;
            if (evt.type === 'weapon') {
                const rp = this.remotes.get(id);
                if (rp) rp.setWeapon(evt.weapon);
            } else if (evt.type === 'elim') {
                // { victimId, killerId } - show an elimination in the kill feed.
                const snap = (peerId) => {
                    if (peerId === null) return 'environment';
                    if (this.net && this.net.socket && this.net.socket.id === peerId) return 'You';
                    const rp = this.remotes.get(peerId);
                    return rp ? `P${rp.playerIndex + 1}` : '?';
                };
                const killer = snap(evt.killerId);
                const victim = snap(evt.victimId);
                this.showKillFeedText(`${killer} > ${victim}`);
                // If the victim is us, trigger our own death visuals.
                if (this.net && this.net.socket && this.net.socket.id === evt.victimId) {
                    this.handleLocalDeath();
                }
            }
        });

        // Server-authoritative HP (both our own and remote players').
        this.net.on('hp', ({ players }) => {
            for (const p of players) {
                if (this.net && this.net.socket && p.id === this.net.socket.id) {
                    this.applyLocalHP(p.hp, p.alive);
                } else {
                    const rp = this.remotes.get(p.id);
                    if (rp) { rp.health = p.hp; rp.alive = p.alive; }
                }
            }
        });

        // Server FX: server-driven bullet/boom visuals (cosmetic only).
        this.net.on('fx', ({ type, x, y, angle, weapon, radius, ...rest }) => {
            if (type === 'shot' && typeof angle === 'number') {
                this.weapons[0].fireRemote(x, y, angle, weapon);
            } else if (type === 'boom' && x !== undefined && y !== undefined) {
                this.weapons[0].createExplosion(x, y, radius || 80, 0);
            }
        });

        // When the local player respawns (its own 3s timer), tell the server.
        this.events.on('playerRespawned', () => {
            const p = this.players[0];
            if (this.net && this.net.connected) {
                this.net.sendRespawn(p.sprite.x, p.sprite.y);
            }
        });

        this.net.on('scores', ({ scores }) => this.updateScoreboard(scores));

        this.net.on('match-end', ({ winnerId }) => {
            this.matchOver = true;
            this.showWinScreen(winnerId);
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            if (this.net) this.net.disconnect();
        });

        this.net.join(roomName);
    }

    updateScoreboard(scores) {
        if (!this.netScoreboard) return;
        this.onlineScores = scores || [];
        if (!this.onlineScores.length) { this.netScoreboard.setText(''); return; }
        const lines = [];
        // Sort: me first, then by kills desc.
        const me = this.net ? this.net.playerIndex : 0;
        const sorted = this.onlineScores.slice().sort((a, b) => {
            if (a.playerIndex === me) return -1;
            if (b.playerIndex === me) return 1;
            return b.kills - a.kills;
        });
        for (const s of sorted) {
            const tag = s.playerIndex === me ? 'YOU' : `P${s.playerIndex + 1}`;
            lines.push(`${tag}: ${s.kills}`);
        }
        this.netScoreboard.setText('SCORE\n' + lines.join('\n'));
    }

    showWinScreen(winnerId) {
        const me = this.net ? this.net.playerIndex : 0;
        const iWon = winnerId === me;
        const overlay = this.add.rectangle(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2,
            GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT, 0x000000, 0.78).setDepth(200);
        const text = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 40,
            iWon ? 'YOU WIN!' : 'YOU LOSE', {
                fontSize: '56px', fontFamily: 'monospace', color: iWon ? '#44ff44' : '#ff4444',
                fontStyle: 'bold', backgroundColor: '#00000088',
            }).setOrigin(0.5).setDepth(201);
        this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 20,
            'TAP TO RETURN TO MENU', {
                fontSize: '20px', fontFamily: 'monospace', color: '#cccccc',
            }).setOrigin(0.5).setDepth(201);
        overlay.setInteractive({ useHandCursor: true });
        overlay.once('pointerdown', () => {
            this.scene.start('MenuScene');
        });
        text.setInteractive({ useHandCursor: true });
        text.once('pointerdown', () => {
            this.scene.start('MenuScene');
        });
        // Also allow ESC.
        this.time.delayedCall(400, () => {
            if (this.cursors && this.cursors.esc) {
                this.cursors.esc.once('down', () => this.scene.start('MenuScene'));
            }
        });
    }

    buildLocalState() {
        const p = this.players[0];
        return {
            x: p.sprite.x,
            y: p.sprite.y,
            facingRight: p.facingRight,
            angle: this.lastAimAngle || (p.facingRight ? 0 : Math.PI),
            health: p.health,
            alive: !!p.isAlive,
            rad: p.radExposure,
            weapon: this.weapons[0].currentWeapon,
        };
    }

    // Server-authoritative HP for the LOCAL player. When the server says you're
    // dead, trigger death visuals; respawn is handled by Player.die's timer +
    // a player-respawn notice to the server.
    applyLocalHP(hp, alive) {
        const p = this.players[0];
        p.health = hp;
        if (p.isAlive && !alive) {
            this.handleLocalDeath();
        }
    }

    handleLocalDeath() {
        const p = this.players[0];
        if (!p.isAlive) return;
        // Player.die triggers death visuals and schedules a local respawn after
        // 3s; the playerRespawned listener tells the server the new position.
        p.die('combat');
    }

    createBackground() {
        const w = this.mapData.width * 32;
        const h = this.mapData.height * 32;
        const GROUND_TOP = 28 * 32;

        // --- Sky gradient (screen-fixed, no parallax) ---
        const sky = this.add.graphics().setScrollFactor(0).setDepth(-1);
        const skyColors = [0x3a1a12, 0x5a2412, 0x7a3214, 0x94401a, 0xb04a18];
        const bandH = GAME_CONFIG.HEIGHT / skyColors.length;
        for (let i = 0; i < skyColors.length; i++) {
            sky.fillStyle(skyColors[i], 1);
            sky.fillRect(0, i * bandH, GAME_CONFIG.WIDTH, bandH + 1);
        }
        // Fade to the ground haze at the bottom
        sky.fillStyle(0x241208, 0.55);
        sky.fillRect(0, GROUND_TOP - 60, GAME_CONFIG.WIDTH, 200);

        // --- Sun + glow (screen-fixed) ---
        const sunX = GAME_CONFIG.WIDTH - 220;
        const sunY = 120;
        const sun = this.add.image(sunX, sunY, this.genSunTexture()).setScrollFactor(0).setDepth(-1);
        sun.setScale(1);

        // --- Parallax layers (screen-anchored to the ground line, synced each frame) ---
        this.groundWorldY = GROUND_TOP; // world Y of the main ground surface
        this.farLayer = this.add.tileSprite(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT, GAME_CONFIG.WIDTH, 460, this.genSkylineTexture('far'))
            .setOrigin(0.5, 1).setScrollFactor(0).setDepth(0).setAlpha(0.9);
        this.nearLayer = this.add.tileSprite(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT, GAME_CONFIG.WIDTH, 290, this.genSkylineTexture('near'))
            .setOrigin(0.5, 1).setScrollFactor(0).setDepth(0).setAlpha(0.85);

        // --- Drifting dust / clouds ---
        this.clouds = [];
        for (let i = 0; i < 6; i++) {
            const c = this.add.image(
                Math.random() * GAME_CONFIG.WIDTH,
                40 + Math.random() * 180,
                this.genCloudTexture()
            ).setScrollFactor(0).setDepth(-1).setAlpha(0.25 + Math.random() * 0.15);
            c.setScale(0.6 + Math.random() * 0.9);
            this.clouds.push({ img: c, speed: 6 + Math.random() * 12 });
        }

        // --- Distant ruined skyline (world-backed, drawn once) via a tiled tint ---
        const bg = this.add.graphics();
        bg.setDepth(0);
        bg.fillStyle(0x180800, 1);
        bg.fillRect(0, GROUND_TOP, w, h - GROUND_TOP);

        // Ground atmosphere / old road patches
        for (let i = 0; i < 40; i++) {
            const rx = Math.random() * w;
            bg.fillStyle([0x2a1608, 0x1f0f06, 0x33200e][Math.floor(Math.random() * 3)], 0.5);
            bg.fillRect(rx, GROUND_TOP + Math.random() * 30, 30 + Math.random() * 90, 4 + Math.random() * 8);
        }
    }

    genSunTexture() {
        const key = 'bg_sun';
        if (this.textures.exists(key)) return key;
        const s = 256;
        const g = this.add.graphics();
        // concentric halo (faint outer rings)
        g.fillStyle(0xffcc66, 0.10); g.fillCircle(s / 2, s / 2, 120);
        g.fillStyle(0xffcc66, 0.16); g.fillCircle(s / 2, s / 2, 92);
        g.fillStyle(0xffdd88, 1);    g.fillCircle(s / 2, s / 2, 52);
        g.fillStyle(0xfff2c0, 1);    g.fillCircle(s / 2, s / 2, 34);
        g.generateTexture(key, s, s);
        g.destroy();
        return key;
    }

    genSkylineTexture(kind) {
        const key = 'skyline_' + kind;
        if (this.textures.exists(key)) return key;
        const w = 512, hT = kind === 'far' ? 480 : 300;
        const g = this.add.graphics();
        g.fillStyle(0x000000, 1);
        if (kind === 'far') {
            for (let i = 0; i < 18; i++) {
                const bw = 24 + Math.random() * 42;
                const bh = 60 + Math.random() * 180;
                g.fillRect(i * (w / 18) - 10, hT - bh, bw, bh);
            }
            for (let i = 0; i < 5; i++) {
                const bx = Math.random() * w;
                const bh = 120 + Math.random() * 140;
                g.fillRect(bx, hT - bh, 16, bh);
                g.fillRect(bx + 10, hT - bh - 40, 14, 40);
            }
        } else {
            for (let i = 0; i < 12; i++) {
                const bw = 30 + Math.random() * 60;
                const bh = 50 + Math.random() * 140;
                g.fillRect(i * (w / 12) - 10, hT - bh, bw, bh);
                if (Math.random() > 0.5) g.fillRect(i * (w / 12) + 8, hT - bh - 26, 8, 26);
            }
        }
        g.generateTexture(key, w, hT);
        g.destroy();
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        return key;
    }

    genCloudTexture() {
        const key = 'bg_cloud';
        if (this.textures.exists(key)) return key;
        const g = this.add.graphics();
        g.fillStyle(0xffe8d0, 1);
        g.fillEllipse(48, 40, 50, 26);
        g.fillEllipse(72, 34, 44, 30);
        g.fillEllipse(96, 42, 40, 22);
        g.generateTexture(key, 160, 64);
        g.destroy();
        return key;
    }

    updateParallax() {
        const cam = this.cameras.main;
        // The ground's on-screen Y = groundWorldY - camera.scrollY. Anchor the
        // skyline layers to that line so they always sit right above the ground
        // (handles vertical camera scroll) while tilePositionX gives horizontal parallax.
        const groundScreenY = this.groundWorldY - cam.scrollY;
        if (this.farLayer) {
            this.farLayer.y = groundScreenY;
            this.farLayer.tilePositionX = cam.scrollX * 0.2;
        }
        if (this.nearLayer) {
            this.nearLayer.y = groundScreenY + 2;
            this.nearLayer.tilePositionX = cam.scrollX * 0.45;
        }
        if (this.clouds) {
            for (const c of this.clouds) {
                c.img.x += c.speed * 0.016;
                if (c.img.x > GAME_CONFIG.WIDTH + 80) c.img.x = -80;
            }
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

        // Score / kills (top-center, clear of the settings gear top-right)
        this.scoreText = this.add.text(GAME_CONFIG.WIDTH / 2, 14, 'KILLS: 0', {
            fontSize: '18px', fontFamily: 'monospace', color: '#e0d0c0', fontStyle: 'bold',
            backgroundColor: '#00000088'
        }).setOrigin(0.5, 0);
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

        // Robust tap-to-switch for the weapon slots. Uses a global pointerdown hit
        // test (the same mechanism as the touch buttons) rather than relying on the
        // per-rect interactive hit zones, which can be blocked on touch devices.
        this.input.on('pointerdown', (pointer) => {
            if (!this.weaponSlots || !this.weaponSlots.length) return;
            if (this.touchControls && this.touchControls.settingsMode) return;
            const px = pointer.x, py = pointer.y;
            for (let s = 0; s < this.weaponSlots.length; s++) {
                const b = this.weaponSlots[s].module.bg;
                if (Math.abs(px - b.x) < slotW / 2 + 4 && Math.abs(py - b.y) < slotH / 2 + 4) {
                    this.selectWeapon(this.weaponSlots[s].module.key);
                    return;
                }
            }
        });

        // Ammo big display (right of slots)
        this.bigAmmo = this.add.text(startX - 30, slotY + slotH / 2, '30', {
            fontSize: '28px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(1, 0.5);
        ui.add(this.bigAmmo);

        // --- KILL FEED (top-right, below the settings gear) ---
        this.killFeed = this.add.text(GAME_CONFIG.WIDTH - 14, 74, '', {
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
            if (this.gameMode === 'online' && this.net) {
                this.net.sendEvent({ type: 'weapon', weapon: key });
            }
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

    showKillFeedText(msg) {
        this.killFeed.setText(msg);
        this.time.delayedCall(2500, () => this.killFeed.setText(''));
    }

    update(time, delta) {
        this.gameTime += delta;

        this.updateParallax();

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
                // Build a clean, immutable per-frame control object (touch + keyboard
                // merge is handled inside Player.update). Never mutate Phaser Keys.
                const ctl = {
                    left: this.touchControls.state.left,
                    right: this.touchControls.state.right,
                    jump: this.touchControls.state.jumpPressed,
                    jumpHeld: this.touchControls.state.jump,
                };
                player.update(this.cursors, this.input.activePointer, time, ctl);
                this.touchControls.updateDebug();

                // Weapon switch (keyboard)
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon1)) this.selectWeapon('SCRAP_RIFLE');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon2)) this.selectWeapon('NAIL_GUN');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon3)) this.selectWeapon('PIPE_BOMB');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon4)) this.selectWeapon('ACID_SPRAYER');

                // Reload (keyboard R or touch)
                if (Phaser.Input.Keyboard.JustDown(this.cursors.reload) || this.touchControls.state.reloadPressed) {
                    this.weapons[0].reload(time);
                }

                // On a touch device, do NOT treat an arbitrary touch as a mouse click,
                // or the whole screen would fire and overlap the other on-screen buttons.
                const touchDevice = this.sys.game.device.input.touch;

                // Determine aim direction.
                // - Touch: aim wherever the FIRE stick is pulled (a separate mini-stick
                //   on the FIRE button). If the stick is centred, fall back to facing.
                // - Mouse: aim at the cursor.
                const stick = this.touchControls.state.fireAngle;
                const mousePointer = this.input.activePointer;
                let aimX, aimY;
                if (typeof stick === 'number') {
                    aimX = player.sprite.x + Math.cos(stick) * 200;
                    aimY = (player.sprite.y - 8) + Math.sin(stick) * 200;
                } else if (!touchDevice) {
                    aimX = mousePointer.worldX;
                    aimY = mousePointer.worldY;
                } else {
                    aimX = player.sprite.x + (player.facingRight ? 1 : -1) * 100;
                    aimY = player.sprite.y;
                }

                // Shooting: mouse left-click OR touch FIRE button.
                const mouseShoot = !touchDevice && this.input.activePointer.pointerType === 'mouse' && this.input.activePointer.isDown;
                const touchShoot = this.touchControls.state.shoot;
                const wantsShoot = (mouseShoot || touchShoot);

                // Record local aim angle for network broadcast.
                this.lastAimAngle = Phaser.Math.Angle.Between(
                    player.sprite.x, player.sprite.y - 8, aimX, aimY
                );

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
                    if (recoil && this.gameMode === 'online' && this.net) {
                        // Tell the SERVER to simulate this shot authoritatively.
                        this.net.sendFire(
                            player.sprite.x, player.sprite.y - 8, angle,
                            this.weapons[0].currentWeapon
                        );
                    }
                }

                // Touch grapple button
                if ((touchGrapple || this.touchControls.state.grapplePressed) && player.canGrapple && !player.grappleActive) {
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
                    // In online mode HP is server-authoritative, so only bump the
                    // visual rad meter here (server doesn't sim rad yet).
                    if (this.gameMode === 'online' && player === this.players[0]) {
                        player.radExposure = Math.min(player.radExposure + 0.5, PLAYER_CONFIG.MAX_RAD);
                    } else {
                        player.health -= 1.5;
                        if (player.health <= 0) player.die('radiation');
                    }
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

        // --- ONLINE: update remote players + broadcast local state ---
        if (this.gameMode === 'online' && this.net) {
            if (this.netConnected) {
                this.net.sendState(this.buildLocalState());
            }
            for (const [, rp] of this.remotes) {
                rp.update(delta);
            }
            if (this.netStatus && this.netStatus.active) {
                this.netStatus.setPosition(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT - 66);
            }
        }

        // ESC to menu
        if (Phaser.Input.Keyboard.JustDown(this.cursors.esc)) {
            this.scene.start('MenuScene');
        }
    }
}
