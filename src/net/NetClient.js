// NetClient - thin wrapper around socket.io for the browser client.
// Handles connecting, joining named rooms, sending local state + events, and
// receiving world state, score updates, and match-end.
import { io } from 'socket.io-client';
import { resolveServerAddr } from './serverAddr.js';

export class NetClient {
    constructor(url, roomName) {
        this.socket = null;
        // Server address resolution (see resolveServerAddr): explicit url,
        // VITE_SERVER_URL, local :3001, or same-origin when deployed on Railway.
        this.url = url ? String(url) : resolveServerAddr();
        this.roomName = roomName || 'default';
        this.playerIndex = 0;
        this.connected = false;
        this.listeners = {};
    }

    connect() {
        this.socket = io(this.url, { transports: ['websocket', 'polling'] });
        this.socket.on('connect', () => this.connected = true);
        this.socket.on('disconnect', () => this.connected = false);
        this.socket.on('connect_error', (e) => this.emit('error', e));

        this.socket.on('match-joined', (data) => this.emit('joined', data));
        this.socket.on('world-state', (peers) => this.emit('world', peers));
        this.socket.on('player-event', (data) => this.emit('peer-event', data));
        this.socket.on('player-left', (id) => this.emit('peer-left', id));
        this.socket.on('score-update', (data) => this.emit('scores', data));
        this.socket.on('match-end', (data) => this.emit('match-end', data));
        this.socket.on('hp-update', (data) => this.emit('hp', data));
        this.socket.on('fx', (data) => this.emit('fx', data));
    }

    on(name, fn) {
        (this.listeners[name] = this.listeners[name] || []).push(fn);
    }

    emit(name, payload) {
        (this.listeners[name] || []).forEach((fn) => fn(payload));
    }

    join(roomName) {
        this.roomName = roomName || this.roomName;
        this.socket.emit('join-room', this.roomName);
    }

    listRooms() {
        return new Promise((resolve) => {
            this.socket.emit('list-rooms', resolve);
        });
    }

    leave() {
        if (this.connected) this.socket.emit('leave-room');
    }

    sendState(state) {
        if (this.connected) this.socket.emit('player-state', state);
    }

    sendEvent(evt) {
        if (this.connected) this.socket.emit('player-event', evt);
    }

    // Fire a shot server-side. The server simulates the bullet and decides hits.
    sendFire(x, y, angle, weapon) {
        if (this.connected) this.socket.emit('player-fire', { x, y, angle, weapon });
    }

    // Tell the server the local player respawned back to full health, with the
    // new position so the server can reset its movement baseline.
    sendRespawn(x, y) {
        if (this.connected) this.socket.emit('player-respawn', { x, y });
    }

    reportDeath(killerId) {
        if (this.connected) this.socket.emit('player-death', { killerId: killerId || null });
    }

    disconnect() {
        this.leave();
        if (this.socket) this.socket.close();
    }
}
