const T = 32;

const GROUND_TOP = 28 * T;

// Returns the world Y of the top surface of the tallest platform under x,
// referencing platforms by their tile rectangles. Falls back to ground.
function surfaceTopAt(mapData, x) {
    let best = GROUND_TOP;
    for (const p of mapData.platforms) {
        const x0 = p.x * T;
        const x1 = (p.x + p.w) * T;
        if (x >= x0 && x <= x1) {
            const top = p.y * T;
            if (top < best) best = top;
        }
    }
    return best;
}

export const JUNKYARD_MAP = {
    name: 'Ruined Fields',
    width: 80,
    height: 30,
    spawnPoints: [
        { x: 6 * T, y: 26 * T },
        { x: 40 * T, y: 26 * T },
        { x: 74 * T, y: 26 * T },
        { x: 20 * T, y: 16 * T },
        { x: 60 * T, y: 16 * T },
        { x: 40 * T, y: 5 * T },
    ],
    platforms: [
        { x: 0, y: 28, w: 80, h: 2, type: 'grass' },
        { x: 4, y: 25, w: 6, h: 1, type: 'grass' },
        { x: 22, y: 25, w: 5, h: 1, type: 'grass' },
        { x: 49, y: 25, w: 6, h: 1, type: 'grass' },
        { x: 66, y: 25, w: 6, h: 1, type: 'grass' },
        { x: 14, y: 19, w: 16, h: 1, type: 'stone' },
        { x: 48, y: 19, w: 16, h: 1, type: 'stone' },
        { x: 8, y: 13, w: 8, h: 1, type: 'stone' },
        { x: 30, y: 12, w: 22, h: 1, type: 'grass' },
        { x: 64, y: 13, w: 8, h: 1, type: 'stone' },
        { x: 20, y: 6, w: 10, h: 1, type: 'stone' },
        { x: 52, y: 6, w: 10, h: 1, type: 'stone' },
    ],
    // Each entry is an x (world px). Grounding y is computed automatically.
    obstacles: [
        { x: 10 * T, type: 'stone' },
        { x: 30 * T, type: 'stone_small' },
        { x: 46 * T, type: 'stone' },
        { x: 62 * T, type: 'stone_small' },
        { x: 18 * T, type: 'stone_small' },
        { x: 24 * T, type: 'stone' },
        { x: 55 * T, type: 'stone_small' },
        { x: 10 * T, type: 'stone' },
        { x: 40 * T, type: 'stone_small' },
        { x: 70 * T, type: 'stone' },
        { x: 14 * T, type: 'crate' },
        { x: 56 * T, type: 'crate' },
        { x: 26 * T, type: 'crate' },
        { x: 52 * T, type: 'crate' },
        { x: 28 * T, type: 'crate' },
        { x: 58 * T, type: 'crate' },
        { x: 20 * T, type: 'barrel' },
        { x: 44 * T, type: 'barrel' },
        { x: 40 * T, type: 'barrel' },
        { x: 8 * T, type: 'barrel' },
        { x: 72 * T, type: 'barrel' },
    ],
    decor: [
        { x: 3 * T, type: 'grass_tuft' },
        { x: 12 * T, type: 'grass_tuft' },
        { x: 25 * T, type: 'grass_tuft' },
        { x: 34 * T, type: 'grass_tuft' },
        { x: 50 * T, type: 'grass_tuft' },
        { x: 60 * T, type: 'grass_tuft' },
        { x: 70 * T, type: 'grass_tuft' },
        { x: 76 * T, type: 'grass_tuft' },
        { x: 7 * T, type: 'grass_tuft' },
        { x: 24 * T, type: 'grass_tuft' },
        { x: 68 * T, type: 'grass_tuft' },
        { x: 16 * T, type: 'grass_tuft' },
        { x: 50 * T, type: 'grass_tuft' },
        { x: 32 * T, type: 'grass_tuft' },
        { x: 44 * T, type: 'grass_tuft' },
    ],
    radZones: [
        { x: 36, y: 22, w: 8, h: 5 },
        { x: 60, y: 9, w: 6, h: 3 },
    ],
    pickups: [
        { x: 16 * T, type: 'health' },
        { x: 40 * T, type: 'weapon', weapon: 'PIPE_BOMB' },
        { x: 68 * T, type: 'weapon', weapon: 'ACID_SPRAYER' },
        { x: 24 * T, type: 'health' },
        { x: 25 * T, type: 'weapon', weapon: 'NAIL_GUN' },
        { x: 74 * T, type: 'health' },
    ],
    // Random pickup spawn spots: each is a world x; a random subset is active
    // at spawn. A mix of health kits and weapon crates is placed there.
    randomSpawns: [
        8 * T, 12 * T, 18 * T, 20 * T, 28 * T, 32 * T, 36 * T, 42 * T,
        46 * T, 52 * T, 56 * T, 60 * T, 64 * T, 70 * T, 72 * T, 76 * T,
        30 * T, 50 * T, 22 * T, 66 * T,
    ],
};

const TEXTURE_HALF_HEIGHTS = {
    stone: 15,
    stone_small: 7,
    crate: 16,
    barrel: 24,
    grass_tuft: 9,
    health_pack: 9,
    weapon_pickup: 7,
};

export function buildMap(scene, mapData) {
    const platforms = scene.physics.add.staticGroup();

    for (const p of mapData.platforms) {
        let tileKey = 'ground';
        if (p.type === 'grass') tileKey = 'ground_grass';
        else if (p.type === 'stone') tileKey = 'ground_grass';

        if (tileKey) {
            for (let dx = 0; dx < p.w; dx++) {
                for (let dy = 0; dy < p.h; dy++) {
                    const tile = platforms.create(
                        (p.x + dx) * T + T / 2,
                        (p.y + dy) * T + T / 2,
                        tileKey
                    );
                    tile.refreshBody();
                }
            }
        }
    }

    // Obstacles (stones, crates, barrels) - solid collision
    const obstacles = scene.physics.add.staticGroup();
    for (const o of mapData.obstacles) {
        const halfH = TEXTURE_HALF_HEIGHTS[o.type] || 8;
        const obj = obstacles.create(o.x, surfaceTopAt(mapData, o.x) - halfH, o.type);
        obj.refreshBody();
    }

    return { platforms, obstacles, surfaceTopAt };
}

export function buildDecor(scene, mapData) {
    for (const d of mapData.decor) {
        const halfH = TEXTURE_HALF_HEIGHTS[d.type] || 9;
        const img = scene.add.image(d.x, surfaceTopAt(mapData, d.x) - halfH, d.type);
        img.setDepth(2);
        scene.tweens.add({
            targets: img,
            scaleX: { from: 0.9, to: 1 },
            duration: 500 + Math.random() * 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }
}

export function buildRadZones(scene, mapData) {
    const zones = [];
    for (const z of mapData.radZones) {
        const zone = scene.add.rectangle(
            z.x * T + (z.w * T) / 2,
            z.y * T + (z.h * T) / 2,
            z.w * T,
            z.h * T,
            0x44ff00,
            0.08
        );
        zone.setStrokeStyle(1, 0x44ff00, 0.2);
        zone.setDepth(1);

        const glow = scene.add.rectangle(
            z.x * T + (z.w * T) / 2,
            z.y * T + (z.h * T) / 2,
            z.w * T,
            z.h * T,
            0x44ff00,
            0
        );
        glow.setDepth(1);

        scene.tweens.add({
            targets: glow,
            alpha: { from: 0, to: 0.05 },
            duration: 2000,
            yoyo: true,
            repeat: -1,
        });

        zones.push({
            rect: zone,
            bounds: new Phaser.Geom.Rectangle(
                z.x * T, z.y * T, z.w * T, z.h * T
            ),
        });
    }
    return zones;
}

export function buildPickups(scene, mapData) {
    const pickups = scene.physics.add.staticGroup();

    // Fixed pickups (health + weapon crates) always present.
    for (const p of mapData.pickups) {
        const tex = p.type === 'health' ? 'health_pack' : 'weapon_pickup';
        const halfH = TEXTURE_HALF_HEIGHTS[tex] || 7;
        const py = surfaceTopAt(mapData, p.x) - halfH;
        const pickup = pickups.create(p.x, py, tex);
        pickup.pickupType = p.type;
        pickup.weapon = p.weapon || null;
        pickup.refreshBody();
        bob(pickup, py);
    }

    // Random health + weapon pickups: pick a shuffled subset of the spawn spots,
    // then alternate health kits and weapon crates across them for variety.
    if (mapData.randomSpawns && mapData.randomSpawns.length) {
        const spots = mapData.randomSpawns.slice().sort(() => Math.random() - 0.5);
        const count = Math.min(spots.length, 8);
        const weaponPool = ['SCRAP_RIFLE', 'NAIL_GUN', 'PIPE_BOMB', 'ACID_SPRAYER'];
        for (let i = 0; i < count; i++) {
            const x = spots[i];
            const weapon = i % 2 === 1;
            const singleWeapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
            const tex = weapon ? 'weapon_pickup' : 'health_pack';
            const halfH = TEXTURE_HALF_HEIGHTS[tex] || 7;
            const py = surfaceTopAt(mapData, x) - halfH;
            const pickup = pickups.create(x, py, tex);
            pickup.pickupType = weapon ? 'weapon' : 'health';
            pickup.weapon = weapon ? singleWeapon : null;
            pickup.refreshBody();
            bob(pickup, py);
        }
    }

    return pickups;
}

function bob(pickup, py) {
    pickup.scene.tweens.add({
        targets: pickup,
        y: py - 4,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
    });
}
