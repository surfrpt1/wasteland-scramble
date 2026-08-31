const T = 32;

const GROUND_TOP = 28 * T;
const HILL_TOP = 25 * T;
const LEDGE_TOP = 19 * T;
const UPPER_TOP = 12 * T;
const HIGH_TOP = 6 * T;

function sit(surfaceY, halfH) { return surfaceY - halfH; }

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
    obstacles: [
        { x: 10 * T, y: sit(GROUND_TOP, 15), type: 'stone' },
        { x: 30 * T, y: sit(GROUND_TOP, 7), type: 'stone_small' },
        { x: 46 * T, y: sit(GROUND_TOP, 15), type: 'stone' },
        { x: 62 * T, y: sit(GROUND_TOP, 7), type: 'stone_small' },
        { x: 18 * T, y: sit(LEDGE_TOP, 7), type: 'stone_small' },
        { x: 36 * T, y: sit(LEDGE_TOP, 15), type: 'stone' },
        { x: 55 * T, y: sit(LEDGE_TOP, 7), type: 'stone_small' },
        { x: 10 * T, y: sit(UPPER_TOP, 15), type: 'stone' },
        { x: 40 * T, y: sit(UPPER_TOP, 7), type: 'stone_small' },
        { x: 70 * T, y: sit(UPPER_TOP, 15), type: 'stone' },
        { x: 14 * T, y: sit(GROUND_TOP, 16), type: 'crate' },
        { x: 56 * T, y: sit(GROUND_TOP, 16), type: 'crate' },
        { x: 26 * T, y: sit(HILL_TOP, 16), type: 'crate' },
        { x: 52 * T, y: sit(HILL_TOP, 16), type: 'crate' },
        { x: 34 * T, y: sit(LEDGE_TOP, 16), type: 'crate' },
        { x: 46 * T, y: sit(LEDGE_TOP, 16), type: 'crate' },
        { x: 20 * T, y: sit(GROUND_TOP, 24), type: 'barrel' },
        { x: 58 * T, y: sit(GROUND_TOP, 24), type: 'barrel' },
        { x: 40 * T, y: sit(HILL_TOP, 24), type: 'barrel' },
        { x: 8 * T, y: sit(HILL_TOP, 24), type: 'barrel' },
        { x: 72 * T, y: sit(HILL_TOP, 24), type: 'barrel' },
    ],
    decor: [
        { x: 3 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 12 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 25 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 34 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 50 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 60 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 70 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 76 * T, y: sit(GROUND_TOP, 9), type: 'grass_tuft' },
        { x: 7 * T, y: sit(HILL_TOP, 9), type: 'grass_tuft' },
        { x: 48 * T, y: sit(HILL_TOP, 9), type: 'grass_tuft' },
        { x: 68 * T, y: sit(HILL_TOP, 9), type: 'grass_tuft' },
        { x: 16 * T, y: sit(LEDGE_TOP, 9), type: 'grass_tuft' },
        { x: 50 * T, y: sit(LEDGE_TOP, 9), type: 'grass_tuft' },
        { x: 32 * T, y: sit(UPPER_TOP, 9), type: 'grass_tuft' },
        { x: 44 * T, y: sit(UPPER_TOP, 9), type: 'grass_tuft' },
    ],
    radZones: [
        { x: 36, y: 22, w: 8, h: 5 },
        { x: 60, y: 9, w: 6, h: 3 },
    ],
    pickups: [
        { x: 16 * T, y: sit(UPPER_TOP, 9), type: 'health' },
        { x: 40 * T, y: sit(HIGH_TOP, 9), type: 'weapon', weapon: 'PIPE_BOMB' },
        { x: 68 * T, y: sit(UPPER_TOP, 9), type: 'weapon', weapon: 'ACID_SPRAYER' },
        { x: 24 * T, y: sit(HILL_TOP, 9), type: 'health' },
        { x: 38 * T, y: sit(LEDGE_TOP, 9), type: 'weapon', weapon: 'NAIL_GUN' },
        { x: 74 * T, y: sit(GROUND_TOP, 9), type: 'health' },
    ],
};

export function buildMap(scene, mapData) {
    const platforms = scene.physics.add.staticGroup();

    // Platform tiles
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
        const obj = obstacles.create(o.x, o.y, o.type);
        obj.refreshBody();
    }

    return { platforms, obstacles };
}

export function buildDecor(scene, mapData) {
    for (const d of mapData.decor) {
        const img = scene.add.image(d.x, d.y, d.type);
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
    for (const p of mapData.pickups) {
        const tex = p.type === 'health' ? 'health_pack' : 'weapon_pickup';
        const pickup = pickups.create(p.x, p.y, tex);
        pickup.pickupType = p.type;
        pickup.weapon = p.weapon || null;
        pickup.refreshBody();

        scene.tweens.add({
            targets: pickup,
            y: p.y - 4,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }
    return pickups;
}
