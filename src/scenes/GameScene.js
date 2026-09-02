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
        this.initGameDuration = data.gameDuration || 0;
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
        this.scores = {}; // kills per playerId (practice/ffa local scoreboard)
        this.createPlayers();
        for (const p of this.players) this.scores[p.playerId] = 0;

        // --- COLLIDERS ---
        for (const player of this.players) {
            this.physics.add.collider(player.sprite, this.platforms);
            this.physics.add.collider(player.sprite, this.solidObstacles);
        }
        for (let i = 0; i < this.players.length; i++) {
            for (let j = i + 1; j < this.players.length; j++) {
                this.physics.add.collider(this.players[i].sprite, this.players[j].sprite);
            }
        }

        for (let wi = 0; wi < this.weapons.length; wi++) {
            const ws = this.weapons[wi];
            this.physics.add.collider(ws.projectiles, this.platforms, (bullet) => {
                if (bullet.explosive) {
                    ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage, wi);
                }
                ws.deactivateBullet(bullet);
            });
            this.physics.add.collider(ws.projectiles, this.solidObstacles, (bullet) => {
                if (bullet.explosive) {
                    ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage, wi);
                }
                ws.deactivateBullet(bullet);
            });
        }

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
            this.physics.add.overlap(ws0.remoteProjectiles, this.players[0].sprite, (bullet) => {
                if (!bullet.active) return;
                ws0.deactivateBullet(bullet);
            });
        }

        this.physics.add.overlap(this.players[0].sprite, this.pickups, (sprite, pickup) => {
            this.collectPickup(this.players[0], pickup);
        });

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

        // Touch / on-screen controls
        this.touchControls = new TouchControls(this);
        window.__ws = this.touchControls;
        this.touchControls.onExit = () => this.scene.start('MenuScene');

        // M key toggles all sound
        const muteKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
        muteKey.on('down', () => {
            const audio = this.registry.get('sound');
            if (audio) {
                this.setSoundEnabled(!audio.enabled);
                const msg = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
                if (this.killFeed) this.showKillFeedText(msg);
            }
        });

        this.events.on('playerDied', (player, cause) => {
            if (this.gameMode !== 'online') {
                this.showKillFeed(player, cause);
                // Credit the actual shooter when known (tracked via lastHitFrom
                // when a bullet/explosion lands). Falls back to the human player
                // so a bot death from any combat counts as a human kill.
                if (cause === 'combat') {
                    const killerIdx = player.lastHitFrom !== undefined ? player.lastHitFrom : 0;
                    this.scores[killerIdx] = (this.scores[killerIdx] || 0) + 1;
                    this.refreshScoreboard();
                }
            }
        });

        this.gameTime = 0;

        // Online mode time tracking
        this.matchEndTime = null;
        this.matchStartTime = null;
        this.gameDuration = 0;
        this.gameStartTime = null;

        // Local mode: set up countdown timer from scene data
        if (this.gameMode !== 'online' && this.initGameDuration > 0) {
            this.gameDuration = this.initGameDuration;
            this.gameStartTime = Date.now();
        }

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

        if (this.gameMode === 'online') {
            this.remotes = new Map();
            this.setupNet();
        }
    }

    setupNet() {
        const roomName = (this.initRoomName) || this.registry.get('roomName') || 'default';

        // Reuse existing NetClient from WaitingRoomScene if available
        const existingNet = this.registry.get('netClient');
        if (existingNet && existingNet.connected) {
            this.net = existingNet;
            this.registry.set('netClient', null); // consume it
        } else {
            this.net = new NetClient(this.registry.get('serverAddr'), roomName);
            this.net.connect();
        }

        this.netConnected = false;
        this.lastHitByRemote = null;
        this.matchOver = false;
        this.onlineScores = [];
        this.playerNames = {}; // socketId -> name

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
            if (data.gameDuration) this.gameDuration = data.gameDuration;
            // If the game already started (match already in "playing" state when we joined),
            // mark start time as now so the timer works.
            if (data.gameState === 'playing' && !this.gameStartTime) this.gameStartTime = Date.now();
            if (data.name) this.playerNames[this.net.socket.id] = data.name;
            this.netStatus.setText(`ROOM "${roomName}" - YOU ARE ${data.name || 'P' + (data.playerIndex + 1)}`);
            // Send our saved player name to the server
            const myName = this.registry.get('playerName') || 'Player';
            this.playerNames[this.net.socket.id] = myName;
            this.net.sendName(myName);
            this.net.sendState(this.buildLocalState());
            if (data.scores) this.updateScoreboard(data.scores);
        });

        this.net.on('world', (peers) => {
            const seen = new Set();
            for (const peer of peers) {
                seen.add(peer.id);
                if (peer.name) this.playerNames[peer.id] = peer.name;
                let rp = this.remotes.get(peer.id);
                if (!rp) {
                    rp = new RemotePlayer(this, peer.id, peer.playerIndex, peer.name);
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
            delete this.playerNames[id];
        });

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
            if (evt.type === 'weapon') {
                const rp = this.remotes.get(id);
                if (rp) rp.setWeapon(evt.weapon);
            } else if (evt.type === 'elim') {
                const snap = (peerId) => {
                    if (peerId === null) return 'environment';
                    if (this.net && this.net.socket && this.net.socket.id === peerId) return 'You';
                    if (this.playerNames[peerId]) return this.playerNames[peerId];
                    const rp = this.remotes.get(peerId);
                    return rp ? rp.displayName : '?';
                };
                const killer = snap(evt.killerId);
                const victim = snap(evt.victimId);
                this.showKillFeedText(`${killer} > ${victim}`);
                if (this.net && this.net.socket && this.net.socket.id === evt.victimId) {
                    this.handleLocalDeath();
                }
            }
        });

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

        this.net.on('fx', ({ type, x, y, angle, weapon, radius, ...rest }) => {
            if (type === 'shot' && typeof angle === 'number') {
                this.weapons[0].fireRemote(x, y, angle, weapon);
            } else if (type === 'boom' && x !== undefined && y !== undefined) {
                this.weapons[0].createExplosion(x, y, radius || 80, 0);
            }
        });

        this.events.on('playerRespawned', () => {
            const p = this.players[0];
            if (this.net && this.net.connected) {
                this.net.sendRespawn(p.sprite.x, p.sprite.y);
            }
        });

        this.net.on('scores', ({ scores }) => this.updateScoreboard(scores));

        this.net.on('room-players', (data) => {
            if (data.players) {
                for (const p of data.players) {
                    if (p.name) this.playerNames[p.id] = p.name;
                }
            }
        });

        this.net.on('match-end', ({ winnerId, rankings, scores }) => {
            this.matchOver = true;
            this.showRankingsScreen(winnerId, rankings || scores);
        });

        this.net.on('game-start', ({ gameDuration, killLimit, startTime }) => {
            // Time-based match tracking
            this.gameDuration = gameDuration || 0;
            this.gameStartTime = startTime || Date.now();
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            if (this.net) this.net.disconnect();
        });

        if (!this.net.connected) {
            this.net.join(roomName);
        } else {
            // Already connected (from WaitingRoomScene), just send state
            this.netConnected = true;
            this.net.playerIndex = this.net.playerIndex || 0;
            // Capture game timing stored by the waiting room
            if (this.net.gameDuration) this.gameDuration = this.net.gameDuration;
            if (this.net.gameStartTime) this.gameStartTime = this.net.gameStartTime;
            if (this.net.joinData) {
                const d = this.net.joinData;
                if (d.name) this.playerNames[this.net.socket.id] = d.name;
                if (!this.gameDuration && d.gameDuration) this.gameDuration = d.gameDuration;
                this.netStatus.setText(`ROOM "${roomName}" - YOU ARE ${d.name || 'P' + (this.net.playerIndex + 1)}`);
            }
            if (this.net.playerIndex !== undefined) {
                this.netStatus.setText(`ROOM "${roomName}" - YOU ARE ${this.playerNames[this.net.socket.id] || 'P' + (this.net.playerIndex + 1)}`);
            }
            this.net.sendState(this.buildLocalState());
        }
    }

    getPlayerName(socketId) {
        if (this.net && this.net.socket && socketId === this.net.socket.id) return 'You';
        if (this.playerNames[socketId]) return this.playerNames[socketId];
        // Fallback for remotes
        const rp = this.remotes && this.remotes.get(socketId);
        if (rp) return rp.displayName;
        return '?';
    }

    updateScoreboard(scores) {
        this.onlineScores = scores || [];
        // Update the detailed scoreboard (top-right)
        if (this.netScoreboard) {
            if (!this.onlineScores.length) { this.netScoreboard.setText(''); }
            else {
                const lines = [];
                const me = this.net ? this.net.playerIndex : 0;
                const sorted = this.onlineScores.slice().sort((a, b) => {
                    if (a.playerIndex === me) return -1;
                    if (b.playerIndex === me) return 1;
                    return b.kills - a.kills;
                });
                for (const s of sorted) {
                    const tag = s.playerIndex === me ? 'YOU' : (s.name || `P${s.playerIndex + 1}`);
                    lines.push(`${tag}: ${s.kills}`);
                }
                this.netScoreboard.setText('SCORE\n' + lines.join('\n'));
            }
        }
        // Refresh the compact top-bar scoreboard with the latest room scores.
        this.refreshScoreboard();
    }

    showRankingsScreen(winnerId, rankings) {
        const overlay = this.add.rectangle(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2,
            GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT, 0x000000, 0.82).setDepth(200);

        const iWon = winnerId && this.net && this.net.socket && winnerId === this.net.socket.id;
        const audio = this.registry.get('sound');
        if (audio) {
            if (iWon) audio.win(); else audio.lose();
        }

        const titleText = this.add.text(GAME_CONFIG.WIDTH / 2, 90,
            iWon ? 'YOU WIN!' : (winnerId ? 'YOU LOSE' : 'MATCH OVER'), {
                fontSize: iWon ? '52px' : '46px', fontFamily: 'monospace',
                color: iWon ? '#44ff44' : (winnerId ? '#ff4444' : '#ffcc44'),
                fontStyle: 'bold', backgroundColor: '#00000088',
            }).setOrigin(0.5).setDepth(201);

        // Build the ranked list. If the server payload is empty, fall back to
        // the scoreboard we already have so the screen NEVER shows only the
        // "tap to return" hint.
        let list = (rankings && rankings.length) ? rankings.slice() : [];
        if (!list.length && this.onlineScores && this.onlineScores.length) {
            list = this.onlineScores.slice()
                .sort((a, b) => b.kills - a.kills)
                .map((s, i) => ({
                    rank: i + 1,
                    id: s.id,
                    name: s.name || `P${(s.playerIndex || 0) + 1}`,
                    playerIndex: s.playerIndex,
                    kills: s.kills,
                    isWinner: i === 0,
                }));
        }

        // Rankings list with numbering, winner/loser marking.
        let y = 160;
        if (list.length) {
            const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32', '#e0d0c0', '#e0d0c0', '#e0d0c0'];
            for (const r of list) {
                const color = rankColors[(r.rank - 1)] || '#e0d0c0';
                const rankPrefix = r.rank === 1 ? '\u2605 ' : '';
                const nameStr = r.name || `P${(r.playerIndex || 0) + 1}`;
                const isMe = this.net && this.net.socket && r.id === this.net.socket.id;
                const meTag = isMe ? ' (YOU)' : '';
                const line = this.add.text(GAME_CONFIG.WIDTH / 2, y,
                    `#${r.rank}  ${rankPrefix}${nameStr}${meTag}  -  ${r.kills} kills`, {
                        fontSize: r.rank === 1 ? '24px' : '18px',
                        fontFamily: 'monospace',
                        color: r.rank === 1 ? '#ffd700' : color,
                        fontStyle: r.rank === 1 ? 'bold' : 'normal',
                        backgroundColor: '#00000000',
                    }).setOrigin(0.5).setDepth(201);
                y += 36;
            }
        } else {
            this.add.text(GAME_CONFIG.WIDTH / 2, y, 'NO SCORES YET - MATCH ENDED', {
                fontSize: '18px', fontFamily: 'monospace', color: '#cccccc',
            }).setOrigin(0.5).setDepth(201);
        }

        // Buttons: Play Again + Main Menu.
        this.createEndButton(GAME_CONFIG.WIDTH / 2 - 170, GAME_CONFIG.HEIGHT - 70, 'PLAY AGAIN', () => this.playAgain());
        this.createEndButton(GAME_CONFIG.WIDTH / 2 + 170, GAME_CONFIG.HEIGHT - 70, 'MAIN MENU', () => this.scene.start('MenuScene'));

        this.time.delayedCall(400, () => {
            if (this.cursors && this.cursors.esc) {
                this.cursors.esc.once('down', () => this.scene.start('MenuScene'));
            }
        });
    }

    createEndButton(x, y, text, callback) {
        const bg = this.add.rectangle(x, y, 300, 46, 0x3d2b1f, 1)
            .setStrokeStyle(2, 0xccaa44)
            .setInteractive({ useHandCursor: true })
            .setDepth(202);
        const label = this.add.text(x, y, text, {
            fontSize: '20px', fontFamily: 'monospace', color: '#e0d0c0',
            padding: { x: 10, y: 6 },
        }).setOrigin(0.5).setDepth(203);
        bg.on('pointerover', () => { bg.setFillStyle(0x5c4033, 1); label.setColor('#ffffff'); });
        bg.on('pointerout', () => { bg.setFillStyle(0x3d2b1f, 1); label.setColor('#e0d0c0'); });
        bg.on('pointerup', () => {
            const a = this.registry.get('sound');
            if (a) a.click();
            callback();
        });
        return { bg, label };
    }

    playAgain() {
        // Online: the old room is finished, go to the lobby to join/start a
        // fresh match. Local modes: instantly restart the same mode.
        if (this.gameMode === 'online') {
            if (this.net) this.net.disconnect();
            this.registry.set('netClient', null);
            this.scene.start('LobbyScene');
        } else {
            this.scene.start('GameScene', { mode: this.gameMode, gameDuration: this.gameDuration || this.initGameDuration });
        }
    }

    // Local mode (practice/ffa): time is up, freeze the match and show the
    // ranking screen built from the local scoreboard, mirroring online end-of-match.
    endLocalMatch() {
        if (this.matchOver) return;
        this.matchOver = true;
        const myName = this.registry.get('playerName') || 'YOU';
        const list = this.players
            .map((p, i) => ({
                rank: 0,
                id: `local-${i}`,
                name: p.isBot ? `Raider ${p.playerId}` : myName,
                playerIndex: i,
                kills: this.scores[i] || 0,
                isWinner: false,
            }))
            .sort((a, b) => b.kills - a.kills)
            .map((r, i) => ({ ...r, rank: i + 1, isWinner: i === 0 }));
        this.showRankingsScreen(null, list);
    }

    showWinScreen(winnerId) {
        this.showRankingsScreen(winnerId, this.onlineScores.map((s, i) => ({
            rank: i + 1,
            id: s.id,
            name: s.name || `P${s.playerIndex + 1}`,
            playerIndex: s.playerIndex,
            kills: s.kills,
            isWinner: s.id === winnerId,
        })));
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
        p.die('combat');
    }

    createBackground() {
        const w = this.mapData.width * 32;
        const h = this.mapData.height * 32;
        const GROUND_TOP = 28 * 32;

        const sky = this.add.graphics().setScrollFactor(0).setDepth(-1);
        const skyColors = [0x3a1a12, 0x5a2412, 0x7a3214, 0x94401a, 0xb04a18];
        const bandH = GAME_CONFIG.HEIGHT / skyColors.length;
        for (let i = 0; i < skyColors.length; i++) {
            sky.fillStyle(skyColors[i], 1);
            sky.fillRect(0, i * bandH, GAME_CONFIG.WIDTH, bandH + 1);
        }
        sky.fillStyle(0x241208, 0.55);
        sky.fillRect(0, GROUND_TOP - 60, GAME_CONFIG.WIDTH, 200);

        const sunX = GAME_CONFIG.WIDTH - 220;
        const sunY = 120;
        const sun = this.add.image(sunX, sunY, this.genSunTexture()).setScrollFactor(0).setDepth(-1);
        sun.setScale(1);

        this.groundWorldY = GROUND_TOP;
        this.farLayer = this.add.tileSprite(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT, GAME_CONFIG.WIDTH, 460, this.genSkylineTexture('far'))
            .setOrigin(0.5, 1).setScrollFactor(0).setDepth(0).setAlpha(0.9);
        this.nearLayer = this.add.tileSprite(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT, GAME_CONFIG.WIDTH, 290, this.genSkylineTexture('near'))
            .setOrigin(0.5, 1).setScrollFactor(0).setDepth(0).setAlpha(0.85);

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

        const bg = this.add.graphics();
        bg.setDepth(0);
        bg.fillStyle(0x180800, 1);
        bg.fillRect(0, GROUND_TOP, w, h - GROUND_TOP);

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

        this.topBar = this.add.rectangle(GAME_CONFIG.WIDTH / 2, 0, GAME_CONFIG.WIDTH, 44, 0x000000, 0.55)
            .setOrigin(0.5, 0);
        ui.add(this.topBar);

        // Sound toggle (top-right, next to the settings gear of the touch
        // controls). The rectangle is pushed into the shared `ui` container, and
        // because Phaser object-level hit-testing does not reliably fire for
        // container children here, we drive the toggle from a scene-level
        // pointerup handler with a manual bounds hit test (proven pattern used
        // by TouchControls).
        const soundOn = this.registry.get('soundEnabled') !== false;
        const soundBtnBg = this.add.rectangle(GAME_CONFIG.WIDTH - 170, 28, 96, 30, 0x2a1a10, 0.85)
            .setOrigin(0, 0.5)
            .setStrokeStyle(1, 0xccaa44);
        this.soundBtnLabel = this.add.text(GAME_CONFIG.WIDTH - 122, 28, soundOn ? 'SOUND: ON' : 'SOUND: OFF', {
            fontSize: '13px', fontFamily: 'monospace', color: soundOn ? '#aaffaa' : '#ff6666', fontStyle: 'bold'
        }).setOrigin(0.5);
        this.soundBtnBg = soundBtnBg;
        this.soundBtnRect = { x: soundBtnBg.x, y: soundBtnBg.y - 15, w: 96, h: 30 };
        ui.add([soundBtnBg, this.soundBtnLabel]);
        this.input.on('pointerup', (pointer) => {
            const s = this.soundBtnRect;
            const px = pointer.x, py = pointer.y;
            if (s && this.matchOver !== true &&
                px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) {
                const wasOn = (this.registry.get('sound') || {}).enabled !== false;
                this.setSoundEnabled(!wasOn);
                if (this.killFeed) this.showKillFeedText(wasOn ? 'SOUND OFF' : 'SOUND ON');
            }
        });

        // Health (top-left)
        this.healthBarBg = this.add.rectangle(210, 22, 180, 18, 0x222222, 1).setOrigin(0, 0.5);
        this.healthBarFill = this.add.rectangle(211, 22, 178, 16, 0x44cc44, 1).setOrigin(0, 0.5);
        this.healthText = this.add.text(318, 14, '100', {
            fontSize: '15px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        });
        ui.add([this.healthBarBg, this.healthBarFill, this.healthText]);

        // Scoreboard (BGMI-TDM style): a compact horizontal list INSIDE the top
        // bar showing EVERY player's name + kills. Works for practice/ffa (local
        // player + bots) and online (all room members). Rebuilt by
        // refreshScoreboard().
        this.boardContainer = this.add.container(GAME_CONFIG.WIDTH / 2, 22);
        ui.add(this.boardContainer);
        this.refreshScoreboard();

        // Timer display (top-left, left of the health bar)
        this.timerText = this.add.text(14, 6, '', {
            fontSize: '14px', fontFamily: 'monospace', color: '#ffcc44',
            backgroundColor: '#00000088',
        }).setOrigin(0, 0);
        ui.add(this.timerText);

        // --- WEAPON SLOTS ---
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

            const rect = this.add.rectangle(startX + idx * (slotW + slotGap) + slotW / 2, slotY + slotH / 2, slotW, slotH, 0xffffff, 0)
                .setInteractive({ useHandCursor: true });
            rect.on('pointerdown', () => this.selectWeapon(key));
            ui.add(rect);

            idx++;
        }

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

        // Ammo big display
        this.bigAmmo = this.add.text(startX - 30, slotY + slotH / 2, '30', {
            fontSize: '28px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(1, 0.5);
        ui.add(this.bigAmmo);

        // --- KILL FEED ---
        this.killFeed = this.add.text(GAME_CONFIG.WIDTH - 14, 74, '', {
            fontSize: '13px', fontFamily: 'monospace', color: '#ffcc66', align: 'right', backgroundColor: '#00000088'
        }).setOrigin(1, 0);
        ui.add(this.killFeed);

        // Grapple cooldown
        this.grappleCd = this.add.text(14, GAME_CONFIG.HEIGHT - 40, 'GRAPPLE READY', {
            fontSize: '12px', fontFamily: 'monospace', color: '#ccaa44'
        });
        ui.add(this.grappleCd);

        // Controls hint
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
        const audio = this.registry.get('sound');
        if (audio) audio.pickup();
        if (pickup.pickupType === 'health') {
            player.health = Math.min(player.health + 30, PLAYER_CONFIG.MAX_HEALTH);
        } else if (pickup.pickupType === 'boost' && player.activateBoost) {
            player.activateBoost(6000); // 6 seconds of jetpack flight
            if (this.killFeed) this.showKillFeedText('BOOST! JETPACK: 6s');
        } else if (pickup.pickupType === 'weapon' && pickup.weapon) {
            this.selectWeapon(pickup.weapon);
            this.weapons[0].addAmmo(pickup.weapon, WEAPON_CONFIG[pickup.weapon].ammo);
        }
        pickup.body.enable = false;
        pickup.setAlpha(0);
        // Health/heal respawns faster; weapon/boost slightly slower, with a
        // little randomness so spawned items don't all come back together.
        const base = pickup.pickupType === 'weapon' || pickup.pickupType === 'boost' ? 18000 : 12000;
        const respawn = base + Math.floor(Math.random() * 5000);
        this.time.delayedCall(respawn, () => {
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

    setSoundEnabled(on) {
        const audio = this.registry.get('sound');
        if (audio) {
            audio.enabled = on;
            audio.setMaster(on);
            // Also flip the per-stream flags the SFX/music guards actually
            // check, so muting reliably silences regardless of gain-node state.
            if (typeof audio.setSfx === 'function') audio.setSfx(on);
            if (typeof audio.setMusic === 'function') audio.setMusic(on);
            this.registry.set('soundEnabled', on);
        }
        if (this.soundBtnLabel) {
            this.soundBtnLabel.setText(on ? 'SOUND: ON' : 'SOUND: OFF');
            this.soundBtnLabel.setColor(on ? '#aaffaa' : '#ff6666');
        }
    }

// Top-bar scoreboard (BGMI-TDM style) for ALL modes: practice/ffa use the
    // local player + bots, online uses the room's score list. Sorted by kills,
    // the leader is gold and your row is highlighted.
    refreshScoreboard() {
        if (!this.boardContainer) return;
        this.boardContainer.removeAll(true);

        let entries = [];
        if (this.gameMode === 'online') {
            const me = this.net ? this.net.playerIndex : 0;
            entries = (this.onlineScores || []).map((s) => ({
                name: (s.playerIndex === me
                    ? (this.registry.get('playerName') || 'YOU')
                    : (s.name || `P${s.playerIndex + 1}`)).toUpperCase(),
                kills: s.kills,
                isYou: s.playerIndex === me,
            }));
        } else {
            const myName = (this.registry.get('playerName') || 'YOU').toUpperCase();
            entries = this.players.map((p, i) => ({
                name: p.isBot ? `RAIDER ${p.playerId}` : myName,
                kills: this.scores[i] || 0,
                isYou: i === 0,
            }));
        }
        if (!entries.length) return;

        entries.sort((a, b) => (b.kills - a.kills) || (a.isYou ? -1 : 1));
        const leaderKills = entries[0].kills;

        let x = 0;
        for (let e = 0; e < entries.length; e++) {
            const en = entries[e];
            const isLeader = en.kills === leaderKills && leaderKills > 0;
            const seg = this.add.text(0, 0, `${en.name} ${en.kills}`, {
                fontSize: '13px', fontFamily: 'monospace', fontStyle: en.isYou ? 'bold' : 'normal',
                color: en.isYou ? '#ffcc66' : (isLeader ? '#ffd700' : '#d8c8a8'),
            }).setOrigin(0, 0.5);
            seg.x = x;
            x += seg.width + 10;
            this.boardContainer.add(seg);
            if (e < entries.length - 1) {
                const sep = this.add.text(x, 0, '|', {
                    fontSize: '12px', fontFamily: 'monospace', color: '#6a5a4a',
                }).setOrigin(0, 0.5);
                this.boardContainer.add(sep);
                x += sep.width + 10;
            }
        }

        // Center the whole board horizontally in the top bar.
        this.boardContainer.x = GAME_CONFIG.WIDTH / 2 - this.boardContainer.width / 2;
        this.boardContainer.y = 22;
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
                    const recoil = this.weapons[i].fire(player.sprite.x, player.sprite.y - 8, angle, time, player);
                    if (recoil && player.sprite.body) {
                        player.sprite.body.setVelocityX(player.sprite.body.velocity.x + recoil);
                    }
                }
                if (this.weapons[i].mag[this.weapons[i].currentWeapon] === 0 && !this.weapons[i].isReloadingWeapon) {
                    this.weapons[i].reload(time);
                }
            } else {
                const ctl = {
                    left: this.touchControls.state.left,
                    right: this.touchControls.state.right,
                    jump: this.touchControls.state.jumpPressed,
                    jumpHeld: this.touchControls.state.jump,
                };
                player.update(this.cursors, this.input.activePointer, time, ctl);
                this.touchControls.updateDebug();

                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon1)) this.selectWeapon('SCRAP_RIFLE');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon2)) this.selectWeapon('NAIL_GUN');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon3)) this.selectWeapon('PIPE_BOMB');
                if (Phaser.Input.Keyboard.JustDown(this.cursors.weapon4)) this.selectWeapon('ACID_SPRAYER');

                if (Phaser.Input.Keyboard.JustDown(this.cursors.reload) || this.touchControls.state.reloadPressed) {
                    this.weapons[0].reload(time);
                }

                const touchDevice = this.sys.game.device.input.touch;

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

                const mouseShoot = !touchDevice && this.input.activePointer.pointerType === 'mouse' && this.input.activePointer.isDown;
                const touchShoot = this.touchControls.state.shoot;
                const wantsShoot = (mouseShoot || touchShoot);

                this.lastAimAngle = Phaser.Math.Angle.Between(
                    player.sprite.x, player.sprite.y - 8, aimX, aimY
                );

                const touchGrapple = this.touchControls.state.grapple;

                if (wantsShoot && player.isAlive && !this.weapons[0].isReloadingWeapon) {
                    const angle = Phaser.Math.Angle.Between(
                        player.sprite.x, player.sprite.y - 8, aimX, aimY
                    );
                    player.facingRight = angle > -Math.PI / 2 && angle < Math.PI / 2;
                    player.sprite.setFlipX(!player.facingRight);
                    const recoil = this.weapons[0].fire(player.sprite.x, player.sprite.y - 8, angle, time, player);
                    if (recoil && player.sprite.body) {
                        player.sprite.body.setVelocityX(player.sprite.body.velocity.x + recoil);
                    }
                    if (recoil && this.gameMode === 'online' && this.net) {
                        this.net.sendFire(
                            player.sprite.x, player.sprite.y - 8, angle,
                            this.weapons[0].currentWeapon
                        );
                    }
                }

                if ((touchGrapple || this.touchControls.state.grapplePressed) && player.canGrapple && !player.grappleActive) {
                    player.fireGrapple(player.sprite.x + (player.facingRight ? 1 : -1) * 150, player.sprite.y - 120);
                }
            }
        }

        this.touchControls.consumePressed();

        // --- BULLET HITS PLAYERS ---
        for (let i = 0; i < this.weapons.length; i++) {
            const ws = this.weapons[i];
            ws.projectiles.children.each((bullet) => {
                if (!bullet.active) return;
                // Tunneling-safe check: measure the distance from the segment
                // the bullet travelled this frame (prev -> current) to the
                // target, so very fast pellets don't skip past a player.
                const havBody = bullet.body && bullet.body.prev;
                const ax = havBody ? bullet.body.prev.x : bullet.x;
                const ay = havBody ? bullet.body.prev.y : bullet.y;
                const dx = bullet.x - ax;
                const dy = bullet.y - ay;
                const len2 = dx * dx + dy * dy;
                for (let j = 0; j < this.players.length; j++) {
                    if (j === i) continue;
                    const p = this.players[j];
                    if (!p.isAlive) continue;
                    const px = p.sprite.x;
                    const py = p.sprite.y - 8;
                    let t = 0;
                    if (len2 > 0) {
                        t = Phaser.Math.Clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
                    }
                    const cx = ax + t * dx;
                    const cy = ay + t * dy;
                    const ex = px - cx;
                    const ey = py - cy;
                    if ((ex * ex + ey * ey) < 22 * 22) {
                        p.lastHitFrom = i;
                        if (bullet.explosive) {
                            ws.createExplosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage, i);
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

            const ws = this.weapons[0];
            const mag = ws.mag[ws.currentWeapon];
            this.bigAmmo.setText(mag !== undefined ? mag + '' : '∞');
            if (ws.isReloadingWeapon) {
                this.bigAmmo.setColor('#ccaa44');
            } else if (mag === 0) {
                this.bigAmmo.setColor('#cc4444');
            } else {
                this.bigAmmo.setColor('#ffffff');
            }

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

        // --- MATCH TIMER (all modes): update the countdown and end the match
        // locally at 0 for practice/ffa so the ranking screen shows. Online is
        // authoritative for duration, so this is read-only there.
        if (this.gameStartTime && this.gameDuration && this.timerText && !this.matchOver) {
            const remaining = Math.max(0, Math.round((this.gameStartTime + this.gameDuration * 1000 - Date.now()) / 1000));
            const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
            const ss = String(remaining % 60).padStart(2, '0');
            this.timerText.setText(`${mm}:${ss}`);
            if (this.gameMode !== 'online' && remaining <= 0) {
                this.endLocalMatch();
            }
        }

        // ESC to menu (ignored while the match-end rankings screen is up -
        // the overlay's own ESC handler + explicit buttons take over)
        if (!this.matchOver && Phaser.Input.Keyboard.JustDown(this.cursors.esc)) {
            this.scene.start('MenuScene');
        }
    }
}