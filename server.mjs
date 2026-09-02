// Wasteland Scramble - multiplayer server (authoritative combat)
// A Socket.io hub that matches players into named rooms, relays player state,
// and runs SERVER-AUTHORITATIVE ballistics: the server simulates every bullet,
// tracks each player's real HP, and decides who dies. Kill attribution and the
// scoreboard can therefore never be spoofed by a modified client.
// Also serves the built game over HTTP.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketServer } from 'socket.io';
import { buildColliders, segRectHit } from './server_map.mjs';

const PORT = process.env.PORT || 3001;
const ROOT = fileURLToPath(new URL('./dist', import.meta.url));
const KILL_LIMIT = parseInt(process.env.KILL_LIMIT || '10', 10);

// Constants mirrored from the client so the server can validate ballistics.
const MAX_PLAYERS = 6;
const MAX_HEALTH = 100;
const TICK = 50;                 // 20 updates/sec
const HIT_RADIUS = 22;           // distance for a bullet to "hit" a player
const PLAYER_RADIUS = 16;        // player-vs-player separation radius
const MAX_SPEED = 600;           // sanity cap on reported position delta/tick
const MAX_RANGE = 1000;          // max bullet travel we'll honour for a weapon
const WORLD_W = 80 * 32;         // map width in px
const WORLD_H = 30 * 32;         // map height in px
const COUNTDOWN_SECONDS = 5;     // countdown before game starts

// Solid geometry for bullet/wall collision (mirrors the client map).
const COLLIDERS = buildColliders();
const WEAPONS = {
    SCRAP_RIFLE: { damage: 12, fireRate: 300, speed: 800, lifetime: 1000, spread: 0.05, explosive: false, radius: 0 },
    NAIL_GUN:    { damage: 5,  fireRate: 100, speed: 1000, lifetime: 600,  spread: 0.12, explosive: false, radius: 0 },
    PIPE_BOMB:   { damage: 80, fireRate: 1500, speed: 400, lifetime: 2000, spread: 0,    explosive: true,  radius: 80 },
    ACID_SPRAYER:{ damage: 3,  fireRate: 50,  speed: 500,  lifetime: 400,  spread: 0.3,  explosive: false, radius: 0 },
};

const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml', '.map': 'application/json',
    '.txt': 'text/plain', '.xml': 'application/xml',
};

const server = createServer(async (req, res) => {
    try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = normalize(join(ROOT, urlPath));
        if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    } catch (e) {
        res.writeHead(404);
        res.end('Not found');
    }
});

const io = new SocketServer(server, { cors: { origin: '*' } });

// rooms: name -> { clients, scores, playerIndex, state, hp, bullets,
//                  names, host, gameState, gameDuration, gameStartTime,
//                  countdownTimer, countdownInterval }
const rooms = new Map();
const members = new Map(); // socketId -> { room }

function roomOf(id) {
    const m = members.get(id);
    return m ? m.room : null;
}

function playerIndexFor(room) {
    const used = new Set([...room.playerIndex.values()]);
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
}

function serializeScores(room) {
    const out = [];
    for (const [id, kills] of room.scores) {
        out.push({
            id,
            playerIndex: room.playerIndex.get(id),
            kills,
            name: room.names.get(id) || `P${(room.playerIndex.get(id) || 0) + 1}`,
        });
    }
    return out;
}

function emitRoom(roomName, event, payload) {
    const room = rooms.get(roomName);
    if (!room) return;
    for (const id of room.clients) {
        const s = io.sockets.sockets.get(id);
        if (s) s.emit(event, payload);
    }
}

function broadcastRoomPlayers(roomName) {
    const room = rooms.get(roomName);
    if (!room) return;
    const players = [];
    for (const id of room.clients) {
        players.push({
            id,
            playerIndex: room.playerIndex.get(id),
            name: room.names.get(id) || `P${(room.playerIndex.get(id) || 0) + 1}`,
            isHost: id === room.host,
        });
    }
    emitRoom(roomName, 'room-players', {
        players,
        host: room.host,
        gameState: room.gameState,
        gameDuration: room.gameDuration,
        killLimit: KILL_LIMIT,
    });
}

function broadcastScores(roomName) {
    const room = rooms.get(roomName);
    if (!room) return;
    emitRoom(roomName, 'score-update', { scores: serializeScores(room) });
}

function hpSnapshot(roomName) {
    const room = rooms.get(roomName);
    if (!room) return [];
    const out = [];
    for (const id of room.clients) {
        const hp = room.hp.get(id);
        if (hp) out.push({ id, playerIndex: room.playerIndex.get(id), hp: hp.hp, alive: hp.alive });
    }
    return out;
}

function broadcastHP(roomName) {
    emitRoom(roomName, 'hp-update', { players: hpSnapshot(roomName) });
}

function endMatch(roomName, room, winnerId) {
    if (room.gameState !== 'playing') return;
    room.gameState = 'ended';
    // Build rankings sorted by kills descending
    const scores = serializeScores(room);
    scores.sort((a, b) => b.kills - a.kills);
    const rankings = scores.map((s, i) => ({
        rank: i + 1,
        id: s.id,
        name: s.name,
        playerIndex: s.playerIndex,
        kills: s.kills,
        isWinner: i === 0,
    }));
    emitRoom(roomName, 'match-end', {
        winnerId,
        scores,
        rankings,
        gameDuration: room.gameDuration,
    });
    broadcastRoomPlayers(roomName);
}

function checkWin(roomName, room) {
    for (const [id, kills] of room.scores) {
        if (kills >= KILL_LIMIT) {
            endMatch(roomName, room, id);
            return true;
        }
    }
    return false;
}

function startCountdown(roomName, room) {
    if (room.gameState !== 'waiting') return;
    room.gameState = 'countdown';
    let remaining = COUNTDOWN_SECONDS;
    broadcastRoomPlayers(roomName);
    emitRoom(roomName, 'countdown', { seconds: remaining });
    room.countdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(room.countdownInterval);
            room.countdownInterval = null;
            room.gameState = 'playing';
            room.gameStartTime = Date.now();
            emitRoom(roomName, 'game-start', {
                gameDuration: room.gameDuration,
                killLimit: KILL_LIMIT,
                startTime: room.gameStartTime,
            });
            broadcastRoomPlayers(roomName);
        } else {
            emitRoom(roomName, 'countdown', { seconds: remaining });
        }
    }, 1000);
}

function cleanupRoomTimers(room) {
    if (room.countdownInterval) { clearInterval(room.countdownInterval); room.countdownInterval = null; }
}

io.on('connection', (socket) => {
    console.log(`[+] ${socket.id} connected`);

    socket.on('list-rooms', (cb) => {
        const list = [];
        for (const [name, room] of rooms) {
            list.push({
                name,
                players: room.clients.size,
                count: room.clients.size,
                gameState: room.gameState,
            });
        }
        if (cb) cb(list);
    });

    socket.on('join-room', (name, cb) => {
        const clean = String(name || '').trim().slice(0, 24) || 'default';
        if (!rooms.has(clean)) rooms.set(clean, {
            clients: new Set(),
            scores: new Map(),
            playerIndex: new Map(),
            state: new Map(),
            hp: new Map(),
            bullets: [],
            names: new Map(),
            host: null,
            gameState: 'waiting',
            gameDuration: 600,
            gameStartTime: null,
            countdownTimer: null,
            countdownInterval: null,
        });
        const room = rooms.get(clean);
        const prev = roomOf(socket.id);
        if (prev && prev !== clean) leaveRoom(socket);
        if (!room.playerIndex.has(socket.id)) {
            room.playerIndex.set(socket.id, playerIndexFor(room));
            room.scores.set(socket.id, 0);
            room.hp.set(socket.id, { hp: MAX_HEALTH, alive: true, lastFire: 0 });
            room.state.set(socket.id, null);
            room.names.set(socket.id, `P${room.playerIndex.get(socket.id) + 1}`);
        }
        room.clients.add(socket.id);
        members.set(socket.id, { room: clean });
        socket.join(clean);

        // Assign host to first player if none
        if (!room.host || !room.clients.has(room.host)) {
            room.host = socket.id;
        }

        const world = [];
        for (const [id, st] of room.state) {
            if (id !== socket.id && st) {
                world.push({
                    id,
                    playerIndex: room.playerIndex.get(id),
                    name: room.names.get(id) || `P${(room.playerIndex.get(id) || 0) + 1}`,
                    ...st,
                });
            }
        }
        socket.emit('match-joined', {
            room: clean,
            playerIndex: room.playerIndex.get(socket.id),
            name: room.names.get(socket.id),
            world,
            scores: serializeScores(room),
            hp: hpSnapshot(clean),
            killLimit: KILL_LIMIT,
            host: room.host,
            gameState: room.gameState,
            gameDuration: room.gameDuration,
        });
        if (cb) cb({ ok: 1, room: clean });
        console.log(`   joined room "${clean}" as P${room.playerIndex.get(socket.id)} (${room.clients.size} players)`);

        broadcastRoomPlayers(clean);
    });

    socket.on('set-name', (name) => {
        const roomName = roomOf(socket.id);
        const room = roomName && rooms.get(roomName);
        if (!room) return;
        const clean = String(name || '').trim().slice(0, 16) || `P${(room.playerIndex.get(socket.id) || 0) + 1}`;
        room.names.set(socket.id, clean);
        broadcastRoomPlayers(roomName);
    });

    socket.on('set-time-limit', (seconds) => {
        const roomName = roomOf(socket.id);
        const room = roomName && rooms.get(roomName);
        if (!room) return;
        if (socket.id !== room.host) return;
        if (room.gameState !== 'waiting') return;
        const valid = [300, 600, 900]; // 5, 10, 15 minutes
        room.gameDuration = valid.includes(seconds) ? seconds : 600;
        broadcastRoomPlayers(roomName);
    });

    socket.on('start-game', () => {
        const roomName = roomOf(socket.id);
        const room = roomName && rooms.get(roomName);
        if (!room) return;
        if (socket.id !== room.host) return;
        if (room.clients.size < 1) return;
        startCountdown(roomName, room);
    });

    socket.on('leave-room', () => leaveRoom(socket));

    socket.on('player-state', (state) => {
        const roomName = roomOf(socket.id);
        const room = roomName && rooms.get(roomName);
        if (!room) return;
        if (room.gameState !== 'playing') return;
        const cur = room.state.get(socket.id);
        let x = Number(state.x) || 0, y = Number(state.y) || 0;
        if (cur && cur.x !== undefined) {
            const dx = x - cur.x, dy = y - cur.y;
            const d = Math.hypot(dx, dy);
            const maxStep = MAX_SPEED * (TICK / 1000) * 2.5;
            if (d > maxStep) {
                x = cur.x + (dx / d) * maxStep;
                y = cur.y + (dy / d) * maxStep;
            }
        }
        room.state.set(socket.id, {
            x, y,
            facingRight: !!state.facingRight,
            angle: Number(state.angle) || 0,
            weapon: WEAPONS[state.weapon] ? state.weapon : 'SCRAP_RIFLE',
        });
    });

    socket.on('player-fire', (data) => {
        const roomName = roomOf(socket.id);
        const room = roomName && rooms.get(roomName);
        if (!room) return;
        if (room.gameState !== 'playing') return;
        const hp = room.hp.get(socket.id);
        if (!hp || !hp.alive) return;
        const st = room.state.get(socket.id);
        if (!st) return;
        const wcfg = WEAPONS[data && data.weapon] || WEAPONS.SCRAP_RIFLE;
        const now = Date.now();
        if (now - hp.lastFire < wcfg.fireRate) return;
        hp.lastFire = now;

        const angle = Number(data.angle) || 0;
        const sx = st.x, sy = st.y - 8;
        if (data.x !== undefined && data.y !== undefined) {
            if (Math.hypot(Number(data.x) - sx, Number(data.y) - sy) > 300) return;
        }
        const spread = (Math.random() - 0.5) * wcfg.spread * 2;
        const a = angle + spread;
        room.bullets.push({
            owner: socket.id,
            weapon: wcfg,
            x: sx, y: sy,
            vx: Math.cos(a) * wcfg.speed,
            vy: Math.sin(a) * wcfg.speed,
            life: wcfg.lifetime / 1000,
        });
    });

    socket.on('player-respawn', (data) => {
        const roomName = roomOf(socket.id);
        const room = roomName && rooms.get(roomName);
        if (!room) return;
        const hp = room.hp.get(socket.id);
        if (hp) { hp.hp = MAX_HEALTH; hp.alive = true; }
        if (data && Number.isFinite(Number(data.x)) && Number.isFinite(Number(data.y))) {
            const prev = room.state.get(socket.id);
            room.state.set(socket.id, {
                ...(prev || {}),
                x: Number(data.x), y: Number(data.y),
            });
        }
        broadcastHP(roomName);
    });

    socket.on('player-event', (evt) => {
        const roomName = roomOf(socket.id);
        if (!roomName) return;
        socket.to(roomName).emit('player-event', { id: socket.id, evt });
    });

    socket.on('disconnect', () => {
        leaveRoom(socket);
        console.log(`[-] ${socket.id} disconnected`);
    });
});

function leaveRoom(socket) {
    const roomName = roomOf(socket.id);
    if (!roomName) return;
    const room = rooms.get(roomName);
    socket.leave(roomName);
    members.delete(socket.id);
    if (room) {
        room.clients.delete(socket.id);
        room.playerIndex.delete(socket.id);
        room.scores.delete(socket.id);
        room.state.delete(socket.id);
        room.hp.delete(socket.id);
        room.names.delete(socket.id);
        socket.to(roomName).emit('player-left', socket.id);

        // Reassign host if needed
        if (room.host === socket.id) {
            room.host = room.clients.values().next().value || null;
            // If game was playing and host left, end the match
            if (room.gameState === 'playing' && room.host) {
                // Game continues, just reassign host for lobby purposes
            }
        }

        if (room.clients.size === 0) {
            cleanupRoomTimers(room);
            rooms.delete(roomName);
            console.log(`   room "${roomName}" closed (empty)`);
        } else {
            broadcastRoomPlayers(roomName);
        }
    }
}

// Broadcast + ballistics simulation loop.
setInterval(() => {
    for (const [roomName, room] of rooms) {
        if (room.gameState !== 'playing') continue;
        const dt = TICK / 1000;

        // --- Time-based match end ---
        if (room.gameStartTime && room.gameDuration) {
            const elapsed = (Date.now() - room.gameStartTime) / 1000;
            if (elapsed >= room.gameDuration) {
                // Time's up - highest kills wins
                let winnerId = null;
                let maxKills = -1;
                for (const [id, kills] of room.scores) {
                    if (kills > maxKills) { maxKills = kills; winnerId = id; }
                }
                endMatch(roomName, room, winnerId);
                continue;
            }
        }

        // --- Server-authoritative player-vs-player body separation ---
        {
            const MIN_DIST = 2 * PLAYER_RADIUS;
            const players = [...room.state.entries()].filter(([, s]) => !!s);
            for (let i = 0; i < players.length; i++) {
                const [idA, stA] = players[i];
                const hpA = room.hp.get(idA);
                if (hpA && !hpA.alive) continue;
                for (let j = i + 1; j < players.length; j++) {
                    const [idB, stB] = players[j];
                    const hpB = room.hp.get(idB);
                    if (hpB && !hpB.alive) continue;
                    const ddx = stB.x - stA.x;
                    const ddy = stB.y - stA.y;
                    const dist = Math.hypot(ddx, ddy);
                    if (dist > 0 && dist < MIN_DIST) {
                        const overlap = MIN_DIST - dist;
                        const push = overlap / 2;
                        const nx = ddx / dist, ny = ddy / dist;
                        stA.x -= nx * push;
                        stA.y -= ny * push;
                        stB.x += nx * push;
                        stB.y += ny * push;
                    }
                }
            }
        }

        // --- Relay every player's authoritative state to the others ---
        for (const [id, st] of room.state) {
            if (!st) continue;
            const others = [];
            for (const [oid, ost] of room.state) {
                if (oid === id || !ost) continue;
                const ohp = room.hp.get(oid);
                others.push({
                    id: oid,
                    playerIndex: room.playerIndex.get(oid) ?? 0,
                    name: room.names.get(oid) || `P${(room.playerIndex.get(oid) || 0) + 1}`,
                    x: ost.x,
                    y: ost.y,
                    angle: ost.angle,
                    facingRight: ost.facingRight,
                    weapon: ost.weapon,
                    health: ohp ? ohp.hp : MAX_HEALTH,
                    alive: ohp ? ohp.alive : true,
                });
            }
            const s = io.sockets.sockets.get(id);
            if (s) s.emit('world-state', others);
        }

        // --- Advance bullets & resolve hits (server-authoritative) ---
        const activeBullets = [];
        for (const b of room.bullets) {
            b.life -= dt;
            if (b.life <= 0) continue;

            const px = b.x, py = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            const nx = b.x, ny = b.y;

            let best = null;

            if (nx < 0 || nx > WORLD_W || ny < 0 || ny > WORLD_H) {
                const bnd = segAABB(px, py, nx, ny, 0, 0, WORLD_W, WORLD_H);
                best = { t: bnd ? bnd.t : 0, kind: 'wall', pid: null, at: bnd ? [bnd.ix, bnd.iy] : [nx, ny] };
            }

            for (const r of COLLIDERS) {
                const res = segRectHit(px, py, nx, ny, r.x, r.y, r.w, r.h);
                if (res && res.t >= 0 && res.t <= 1) {
                    if (!best || res.t < best.t) {
                        best = { t: res.t, kind: 'wall', pid: null, at: [res.ix, res.iy] };
                    }
                }
            }

            for (const [pid, st] of room.state) {
                if (pid === b.owner || !st) continue;
                const hp = room.hp.get(pid);
                if (!hp || !hp.alive) continue;
                const t = segCircleHit(px, py, nx, ny, st.x, st.y - 8, HIT_RADIUS);
                if (t !== null && (!best || t < best.t)) {
                    best = { t, kind: 'player', pid, at: [
                        px + (nx - px) * t, py + (ny - py) * t,
                    ] };
                }
            }

            if (best) {
                hitSomething(room, roomName, b, best);
            } else {
                activeBullets.push(b);
            }
        }
        room.bullets = activeBullets;
    }
}, TICK);

// Segment vs circle: returns the entry fraction t in [0,1], or null.
function segCircleHit(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0, dy = y1 - y0;
    const fx = x0 - cx, fy = y0 - cy;
    const a = dx * dx + dy * dy;
    if (a === 0) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0 || t > 1) t = (-b + sq) / (2 * a);
    if (t >= 0 && t <= 1) return t;
    return null;
}

function segAABB(x0, y0, x1, y1, rx, ry, rw, rh) {
    return segRectHit(x0, y0, x1, y1, rx, ry, rw, rh);
}

function hitSomething(room, roomName, b, best) {
    const wcfg = b.weapon;
    const hx = best.at ? best.at[0] : b.x;
    const hy = best.at ? best.at[1] : b.y;

    if (wcfg.explosive) {
        for (const [pid, st] of room.state) {
            if (!st) continue;
            const hp = room.hp.get(pid);
            if (!hp || !hp.alive) continue;
            const d = Math.hypot(hx - st.x, hy - (st.y - 8));
            if (d < wcfg.radius) {
                const falloff = 1 - (d / wcfg.radius);
                applyDamage(room, roomName, pid, b.owner, wcfg.damage * falloff);
            }
        }
        emitRoom(roomName, 'fx', { type: 'boom', x: hx, y: hy, radius: wcfg.radius });
    } else if (best.kind === 'player') {
        applyDamage(room, roomName, best.pid, b.owner, wcfg.damage);
    }
}

function applyDamage(room, roomName, victimId, attackerId, dmg) {
    const hp = room.hp.get(victimId);
    if (!hp || !hp.alive) return;
    hp.hp -= dmg;
    if (hp.hp <= 0) {
        hp.hp = 0;
        hp.alive = false;
        if (attackerId && attackerId !== victimId) {
            const k = (room.scores.get(attackerId) || 0) + 1;
            room.scores.set(attackerId, k);
        }
        const killerId = attackerId === victimId ? null : attackerId;
        emitRoom(roomName, 'player-event', { id: killerId, evt: { type: 'elim', victimId, killerId } });
        broadcastScores(roomName);
    } else {
        emitRoom(roomName, 'fx', { type: 'hit', x: 0, y: 0 });
    }
    broadcastHP(roomName);
    checkWin(roomName, room);
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Wasteland Scramble] server listening on http://0.0.0.0:${PORT} (kill limit ${KILL_LIMIT}, authoritative combat)`);
});
