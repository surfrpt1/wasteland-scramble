import Phaser from 'phaser';
import { GAME_CONFIG } from '../utils/constants.js';
import { NetClient } from '../net/NetClient.js';

// LobbyScene - choose a room to join (or create one), then go to waiting room.
export class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });
    }

    create() {
        const cx = GAME_CONFIG.WIDTH / 2;
        this.net = new NetClient(this.registry.get('serverAddr'), '');
        this.net.connected = false;

        this.add.text(cx, 60, 'ONLINE LOBBY', {
            fontSize: '40px', fontFamily: 'monospace', color: '#ccaa44',
            stroke: '#1a0a00', strokeThickness: 3,
        }).setOrigin(0.5);

        this.statusText = this.add.text(cx, 110, 'Connecting to server...', {
            fontSize: '16px', fontFamily: 'monospace', color: '#ffcc44',
        }).setOrigin(0.5);

        // Rooms panel
        this.roomListTitle = this.add.text(cx, 170, 'OPEN ROOMS', {
            fontSize: '18px', fontFamily: 'monospace', color: '#e0d0c0',
        }).setOrigin(0.5);
        this.roomListText = this.add.text(cx, 200, 'Refreshing...', {
            fontSize: '16px', fontFamily: 'monospace', color: '#aaddff', align: 'center',
            lineSpacing: 6,
        }).setOrigin(0.5);

        // Back button
        this.createBut(cx, GAME_CONFIG.HEIGHT - 40, 'BACK TO MENU', () => this.scene.start('MenuScene'));
        // Refresh button
        this.createBut(cx - 160, 300, 'REFRESH ROOMS', () => this.refreshRooms());
        // Create room button
        this.createBut(cx + 160, 300, 'CREATE ROOM', () => this.createRoom());

        // Quick rooms
        this.add.text(cx, 360, 'QUICK JOIN', {
            fontSize: '16px', fontFamily: 'monospace', color: '#887755',
        }).setOrigin(0.5);
        const quick = ['room-a', 'room-b', 'room-c', 'room-d'];
        quick.forEach((q, i) => {
            const row = Math.floor(i / 2);
            const col = i % 2;
            this.createBut(
                cx + (col === 0 ? -160 : 160),
                410 + row * 55,
                q.toUpperCase(),
                () => this.joinRoom(q)
            );
        });

        this.net.connect();
        this.net.on('error', () => {
            this.statusText.setText('SERVER UNREACHABLE - start server, then refresh');
        });
        this.net.on('joined', () => {});
        this.refreshRooms();
    }

    async refreshRooms() {
        this.statusText.setText('Fetching rooms...');
        try {
            const rooms = await this.net.listRooms();
            if (!rooms.length) {
                this.roomListText.setText('(no rooms yet - create one or quick join)');
            } else {
                const lines = rooms.map((r, i) => `${i + 1}. ${r.name}  (${r.players} player${r.players === 1 ? '' : 's'})${r.gameState !== 'waiting' ? ' [' + r.gameState + ']' : ''}`);
                this.roomListText.setText(lines.join('\n'));
            }
            this.statusText.setText('Select a room to join.');
        } catch (e) {
            this.roomListText.setText('(could not reach server)');
            this.statusText.setText('SERVER UNREACHABLE');
        }
    }

    createRoom() {
        const name = window.prompt('New room name (letters/numbers):', 'room-' + Math.floor(Math.random() * 1000));
        if (!name) return;
        this.joinRoom(name.trim().slice(0, 24));
    }

    joinRoom(name) {
        if (!name) return;
        this.scene.start('WaitingRoomScene', { roomName: name });
    }

    createBut(x, y, text, cb) {
        const bg = this.add.rectangle(x, y, 300, 42, 0x3d2b1f, 1)
            .setStrokeStyle(2, 0xccaa44)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(x, y, text, {
            fontSize: '18px', fontFamily: 'monospace', color: '#e0d0c0',
        }).setOrigin(0.5);
        bg.on('pointerover', () => { bg.setFillStyle(0x5c4033); label.setColor('#ffffff'); });
        bg.on('pointerout', () => { bg.setFillStyle(0x3d2b1f); label.setColor('#e0d0c0'); });
        bg.on('pointerdown', () => { const a = this.registry.get('sound'); if (a) a.click(); cb(); });
        return { bg, label };
    }

    shutdown() {
        if (this.net) this.net.disconnect();
    }
}
