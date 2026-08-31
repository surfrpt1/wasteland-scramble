import { GAME_CONFIG, PLAYER_CONFIG } from '../utils/constants.js';

const T = 32;

export const JUNKYARD_MAP = {
    name: 'Junkyard',
    width: 80,
    height: 30,
    spawnPoints: [
        { x: 5 * T, y: 25 * T },
        { x: 40 * T, y: 25 * T },
        { x: 75 * T, y: 25 * T },
        { x: 20 * T, y: 15 * T },
        { x: 60 * T, y: 15 * T },
        { x: 40 * T, y: 5 * T },
    ],
    platforms: [
        // Ground
        { x: 0, y: 28, w: 80, h: 2, type: 'ground' },

        // Bottom platforms
        { x: 8, y: 25, w: 6, h: 1, type: 'ground' },
        { x: 22, y: 25, w: 5, h: 1, type: 'ground' },
        { x: 50, y: 25, w: 6, h: 1, type: 'ground' },
        { x: 65, y: 25, w: 5, h: 1, type: 'ground' },

        // Mid platforms
        { x: 15, y: 20, w: 8, h: 1, type: 'wall' },
        { x: 35, y: 20, w: 10, h: 1, type: 'ground' },
        { x: 55, y: 20, w: 8, h: 1, type: 'wall' },
        { x: 4, y: 18, w: 4, h: 4, type: 'wall' },
        { x: 72, y: 18, w: 4, h: 4, type: 'wall' },

        // Upper platforms
        { x: 10, y: 14, w: 6, h: 1, type: 'ground' },
        { x: 30, y: 13, w: 8, h: 1, type: 'wall' },
        { x: 50, y: 14, w: 6, h: 1, type: 'ground' },
        { x: 68, y: 13, w: 6, h: 1, type: 'wall' },

        // High platforms
        { x: 20, y: 8, w: 5, h: 1, type: 'ground' },
        { x: 40, y: 6, w: 6, h: 1, type: 'wall' },
        { x: 58, y: 8, w: 5, h: 1, type: 'ground' },

        // Walls
        { x: 0, y: 0, w: 1, h: 28, type: 'wall' },
        { x: 79, y: 0, w: 1, h: 28, type: 'wall' },

        // Pipe structures
        { x: 28, y: 16, w: 2, h: 6, type: 'wall' },
        { x: 52, y: 16, w: 2, h: 6, type: 'wall' },
    ],
    radZones: [
        { x: 38, y: 22, w: 8, h: 6 },
        { x: 60, y: 10, w: 6, h: 4 },
    ],
    pickups: [
        { x: 12 * T, y: 13 * T, type: 'health' },
        { x: 40 * T, y: 5 * T, type: 'weapon', weapon: 'PIPE_BOMB' },
        { x: 68 * T, y: 12 * T, type: 'weapon', weapon: 'ACID_SPRAYER' },
        { x: 25 * T, y: 19 * T, type: 'health' },
        { x: 55 * T, y: 19 * T, type: 'weapon', weapon: 'NAIL_GUN' },
        { x: 75 * T, y: 24 * T, type: 'health' },
    ],
};

export function buildMap(scene, mapData) {
    const platforms = scene.physics.add.staticGroup();

    for (const p of mapData.platforms) {
        for (let dx = 0; dx < p.w; dx++) {
            for (let dy = 0; dy < p.h; dy++) {
                const tileKey = p.type === 'wall' ? 'wall' : 'ground';
                const tile = platforms.create(
                    (p.x + dx) * T + T / 2,
                    (p.y + dy) * T + T / 2,
                    tileKey
                );
                tile.refreshBody();
            }
        }
    }

    return platforms;
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
