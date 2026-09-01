import Phaser from 'phaser';
import { GAME_CONFIG } from '../utils/constants.js';
import { NetClient } from '../net/NetClient.js';

// WaitingRoomScene - room dashboard where players wait for the host to start.
export class WaitingRoomScene extends Phaser.Scene {
    constructor() {
        super({ key: 'WaitingRoomScene' });
    }

    init(data) {
        this.roomName = data.roomName || 'default';
    }

    create() {
        const cx = GAME_CONFIG.WIDTH / 2;
        this.playerName = this.registry.get('playerName') || 'Player';

        // Connect to server
        this.net = new NetClient(this.registry.get('serverAddr'), this.roomName);
        this.net.connect();
        this.isHost = false;
        this.gameState = 'waiting';
        this.gameDuration = 600;
        this.playerList = [];
        this.countdownSec = 0;

        // --- UI ---
        this.add.text(cx, 40, 'ROOM: ' + this.roomName.toUpperCase(), {
            fontSize: '32px', fontFamily: 'monospace', color: '#ccaa44',
            stroke: '#1a0a00', strokeThickness: 3,
        }).setOrigin(0.5);

        // Status
        this.statusText = this.add.text(cx, 80, 'Connecting...', {
            fontSize: '16px', fontFamily: 'monospace', color: '#ffcc44',
        }).setOrigin(0.5);

        // --- Players panel ---
        this.add.rectangle(cx, 260, 500, 320, 0x1a0a00, 0.8)
            .setStrokeStyle(2, 0x5c4033);
        this.add.text(cx, 120, 'PLAYERS IN ROOM', {
            fontSize: '18px', fontFamily: 'monospace', color: '#e0d0c0',
        }).setOrigin(0.5);
        this.playersText = this.add.text(cx, 155, '', {
            fontSize: '16px', fontFamily: 'monospace', color: '#aaddff',
            align: 'center', lineSpacing: 8,
        }).setOrigin(0.5, 0);

        // --- Game time selection (host only) ---
        this.timeLabel = this.add.text(cx, 430, 'GAME TIME: 10 min', {
            fontSize: '18px', fontFamily: 'monospace', color: '#ccaa44',
        }).setOrigin(0.5).setVisible(false);

        this.timeButtons = [];
        const times = [
            { label: '5 MIN', value: 300 },
            { label: '10 MIN', value: 600 },
            { label: '15 MIN', value: 900 },
        ];
        times.forEach((t, i) => {
            const bx = cx + (i - 1) * 130;
            const btn = this.createBut(bx, 470, t.label, () => {
                if (this.isHost && this.gameState === 'waiting') {
                    this.net.sendTimeLimit(t.value);
                }
            });
            btn.bg.setVisible(false);
            btn.label.setVisible(false);
            this.timeButtons.push(btn);
        });

        // --- Start button (host only) ---
        this.startBtn = this.createBut(cx, 540, 'START GAME', () => {
            if (this.isHost && this.gameState === 'waiting') {
                this.net.sendStartGame();
            }
        });
        this.startBtn.bg.setVisible(false);
        this.startBtn.label.setVisible(false);

        // --- Countdown display ---
        this.countdownText = this.add.text(cx, 300, '', {
            fontSize: '64px', fontFamily: 'monospace', color: '#ff6600',
            fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setVisible(false);

        // --- Game starting overlay ---
        this.gameStartingText = this.add.text(cx, 360, '', {
            fontSize: '20px', fontFamily: 'monospace', color: '#ffcc44',
        }).setOrigin(0.5).setVisible(false);

        // Kill limit display
        this.killLimitText = this.add.text(cx, 600, '', {
            fontSize: '14px', fontFamily: 'monospace', color: '#665544',
        }).setOrigin(0.5);

        // Back button
        this.createBut(cx, GAME_CONFIG.HEIGHT - 40, 'LEAVE ROOM', () => {
            if (this.net) this.net.disconnect();
            this.scene.start('LobbyScene');
        });

        // --- Network events ---
        this.netCleanup = [];
        const listen = (name, fn) => this.netCleanup.push(this.net.on(name, fn));

        listen('error', () => {
            this.statusText.setText('SERVER UNREACHABLE - check server is running');
        });

        listen('joined', (data) => {
            this.net.playerIndex = data.playerIndex;
            this.mySocketId = this.net.socket.id;
            this.joinData = data;
            this.statusText.setText(`Connected as "${this.playerName}"`);
            this.net.sendName(this.playerName);
            if (data.gameState) this.gameState = data.gameState;
            if (data.gameDuration) this.gameDuration = data.gameDuration;
        });

        listen('room-players', (data) => {
            this.playerList = data.players || [];
            this.isHost = data.host === this.mySocketId;
            this.gameState = data.gameState || 'waiting';
            this.gameDuration = data.gameDuration || 600;
            this.updatePlayerDisplay();
            this.updateHostControls();
            if (data.killLimit) {
                this.killLimitText.setText(`First to ${data.killLimit} kills or time runs out`);
            }
        });

        listen('countdown', (data) => {
            this.countdownSec = data.seconds || 0;
            this.countdownText.setText(this.countdownSec).setVisible(true);
            this.gameStartingText.setText('Game starting...').setVisible(true);
            this.statusText.setText('Get ready!');
            const audio = this.registry.get('sound');
            if (audio) audio.countdownBeep(this.countdownSec === 1);
        });

        listen('game-start', (data) => {
            // Store game timing for GameScene to consume when reusing this client
            this.net.gameDuration = (data && data.gameDuration) || 600;
            this.net.gameStartTime = (data && data.startTime) || Date.now();
            // Transition to GameScene
            this.goingToGame = true;
            this.registry.set('netClient', this.net);
            // Store the join data so GameScene can use it without re-"joined"
            this.net.joinData = this.joinData || { playerIndex: this.net.playerIndex, room: this.roomName };
            if (this.net.playerIndex !== undefined) this.net.joinData.playerIndex = this.net.playerIndex;
            this.scene.start('GameScene', { mode: 'online', roomName: this.roomName });
        });

        listen('match-joined', () => {});

        this.net.join(this.roomName);
    }

    updatePlayerDisplay() {
        if (!this.playerList.length) {
            this.playersText.setText('Waiting for players...');
            return;
        }
        const lines = this.playerList.map((p, i) => {
            const hostTag = p.isHost ? ' [HOST]' : '';
            const youTag = p.id === this.mySocketId ? ' (YOU)' : '';
            return `${i + 1}. ${p.name}${youTag}${hostTag}`;
        });
        this.playersText.setText(lines.join('\n'));
    }

    updateHostControls() {
        const showHost = this.isHost && this.gameState === 'waiting';

        // Time buttons
        for (const btn of this.timeButtons) {
            btn.bg.setVisible(showHost);
            btn.label.setVisible(showHost);
        }
        this.timeLabel.setVisible(showHost);

        // Start button
        this.startBtn.bg.setVisible(showHost);
        this.startBtn.label.setVisible(showHost);

        // Highlight selected time
        if (showHost) {
            const times = [300, 600, 900];
            const labels = ['5 MIN', '10 MIN', '15 MIN'];
            const idx = times.indexOf(this.gameDuration);
            this.timeLabel.setText('GAME TIME: ' + (idx >= 0 ? labels[idx].replace(' MIN', ' min') : '10 min'));

            for (let i = 0; i < this.timeButtons.length; i++) {
                const selected = times[i] === this.gameDuration;
                this.timeButtons[i].bg.setFillStyle(selected ? 0x5c4033 : 0x3d2b1f);
                this.timeButtons[i].bg.setStrokeStyle(2, selected ? 0xffdd66 : 0xccaa44);
            }
        }

        if (this.gameState === 'countdown') {
            this.statusText.setText('Game starting soon...');
        } else if (this.gameState === 'playing') {
            this.statusText.setText('Game in progress');
        } else if (!this.isHost) {
            this.statusText.setText('Waiting for host to start...');
        } else {
            this.statusText.setText('You are the host - configure and start!');
        }
    }

    createBut(x, y, text, cb) {
        const bg = this.add.rectangle(x, y, 200, 40, 0x3d2b1f, 1)
            .setStrokeStyle(2, 0xccaa44)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(x, y, text, {
            fontSize: '16px', fontFamily: 'monospace', color: '#e0d0c0',
        }).setOrigin(0.5);
        bg.on('pointerover', () => { bg.setFillStyle(0x5c4033); label.setColor('#ffffff'); });
        bg.on('pointerout', () => { bg.setFillStyle(0x3d2b1f); label.setColor('#e0d0c0'); });
        bg.on('pointerdown', () => { const a = this.registry.get('sound'); if (a) a.click(); cb(); });
        return { bg, label };
    }

    shutdown() {
        // Remove this scene's net listeners so stale handlers don't fire after
        // the socket is reused by GameScene.
        if (this.netCleanup) {
            for (const off of this.netCleanup) { if (typeof off === 'function') off(); }
            this.netCleanup = [];
        }
        // Don't disconnect if transitioning to GameScene (netClient passed via registry)
        if (this.goingToGame) return;
        if (this.net) this.net.disconnect();
    }
}
