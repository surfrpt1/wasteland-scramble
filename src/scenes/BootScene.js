import Phaser from 'phaser';
import { COLORS } from '../utils/constants.js';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        this.generateAssets();
    }

    create() {
        this.scene.start('MenuScene');
    }

    generateAssets() {
        const g = this.make.graphics({ add: false });

        // ============ CHARACTER SPRITES ============
        // Each player has a distinct body color + hat/head marker
        const characters = [
            // Player 0: Green survivor - sturdy chestpiece, flat helmet
            {
                key: 'char_0',
                body: 0x44aa44,
                dark: 0x2d7a2d,
                light: 0x88cc88,
                accent: 0xccaa44,
                head: 0xe8e0d0,
                hat: 0x3a3a3a,
            },
            // Player 1: Red raider - spiked shoulder armor
            {
                key: 'char_1',
                body: 0xcc4444,
                dark: 0x992e2e,
                light: 0xee7777,
                accent: 0xaa8833,
                head: 0xd8c8b0,
                hat: 0x555555,
            },
            // Player 2: Blue medic - mask + medical pouch
            {
                key: 'char_2',
                body: 0x4488cc,
                dark: 0x2f5e8c,
                light: 0x77aadd,
                accent: 0xee4444,
                head: 0xd8ccb8,
                hat: 0x3a3a3a,
            },
            // Player 3: Purple scavenger - bandana
            {
                key: 'char_3',
                body: 0xaa44aa,
                dark: 0x6e2f6e,
                light: 0xcc77cc,
                accent: 0xcccc33,
                head: 0xe0d0c0,
                hat: 0x7a3a3a,
            },
            // Player 4: Cyan raider - mohawk
            {
                key: 'char_4',
                body: 0x44aaaa,
                dark: 0x2f7676,
                light: 0x77cccc,
                accent: 0xee8844,
                head: 0xd0c0b0,
                hat: 0x443322,
            },
            // Player 5: Yellow survivor - gas mask
            {
                key: 'char_5',
                body: 0xaaaa44,
                dark: 0x77772f,
                light: 0xcccc77,
                accent: 0x44aa44,
                head: 0xccccaa,
                hat: 0x222222,
            },
        ];

        characters.forEach((c) => {
            this.generateCharacter(g, c);
        });

        // ============ WEAPON SPRITES ============
        this.generateWeapons(g);

        // ============ MISC SPRITES ============
        this.generateMisc(g);

        // ============ DECORATION SPRITES ============
        this.generateDecorations(g);

        g.destroy();
    }

    generateCharacter(g, c) {
        // 40x56 pixel character
        g.clear();

        // Shadow
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(20, 54, 30, 6);

        // Legs
        g.fillStyle(c.dark, 1);
        g.fillRect(10, 40, 8, 12);
        g.fillRect(22, 40, 8, 12);
        // Boots
        g.fillStyle(0x2a2a2a, 1);
        g.fillRect(8, 50, 11, 4);
        g.fillRect(22, 50, 11, 4);

        // Body (torso)
        g.fillStyle(c.body, 1);
        g.fillRect(8, 20, 24, 22);
        // Chest light
        g.fillStyle(c.light, 1);
        g.fillRect(10, 20, 20, 6);
        // Belt
        g.fillStyle(c.dark, 1);
        g.fillRect(8, 38, 24, 5);
        // Belt buckle
        g.fillStyle(0xccaa44, 1);
        g.fillRect(18, 38, 4, 5);

        // Arm (right - visible)
        g.fillStyle(c.body, 1);
        g.fillRect(32, 20, 7, 16);
        // Shoulder pad
        g.fillStyle(c.dark, 1);
        g.fillRect(31, 18, 9, 4);

        // Left arm (slightly darker)
        g.fillStyle(c.dark, 1);
        g.fillRect(1, 20, 7, 16);

        // Neck
        g.fillStyle(c.head, 1);
        g.fillRect(16, 16, 8, 6);

        // Head
        g.fillStyle(c.head, 1);
        g.fillRect(12, 4, 16, 14);
        // Face detail
        g.fillStyle(0x222222, 1);
        g.fillRect(14, 10, 3, 2); // left eye
        g.fillRect(23, 10, 3, 2); // right eye
        g.fillStyle(0x333333, 1);
        g.fillRect(17, 14, 6, 2); // mouth

        // Headwear / distinguishing accessory
        if (c.hat) {
            g.fillStyle(c.hat, 1);
            g.fillRect(10, 2, 20, 5); // hat brim/top
        }
        if (c.accent) {
            // Headband or facial marker
            g.fillStyle(c.accent, 1);
            g.fillRect(12, 8, 16, 2);
        }

        g.generateTexture(c.key, 40, 56);
    }

    generateWeapons(g) {
        // SCRAP RIFLE - rusted long rifle
        g.clear();
        g.fillStyle(0x6a5a4a, 1);       // wooden stock
        g.fillRect(2, 2, 10, 5);
        g.fillStyle(0x8a8a8a, 1);       // metal body
        g.fillRect(10, 1, 22, 7);
        g.fillStyle(0x4a4a4a, 1);       // barrel
        g.fillRect(28, 3, 24, 4);
        // sights
        g.fillStyle(0xccaa44, 1);
        g.fillRect(16, 0, 2, 2);
        g.generateTexture('weapon_rifle', 46, 9);

        // NAIL GUN - boxy pneumatic
        g.clear();
        g.fillStyle(0x888888, 1);
        g.fillRect(1, 1, 20, 12);
        g.fillStyle(0x666666, 1);
        g.fillRect(19, 3, 16, 9);
        g.fillStyle(0x444444, 1);
        g.fillRect(24, 1, 4, 3); // top grip
        g.fillStyle(0xccaa33, 1);
        g.fillRect(3, 5, 8, 3);  // ammo window
        // nails visible
        g.fillStyle(0xeeeeee, 1);
        g.fillRect(7, 8, 2, 2);
        g.fillRect(11, 8, 2, 2);
        g.generateTexture('weapon_naigun', 36, 14);

        // PIPE BOMB - launcher tube
        g.clear();
        g.fillStyle(0x7a4a2a, 1);       // rusty pipe
        g.fillRect(1, 2, 30, 8);
        g.fillStyle(0x5a3a1a, 1);
        g.fillRect(28, 2, 8, 4);        // muzzle
        g.fillStyle(0x3a3a3a, 1);
        g.fillRect(0, 8, 12, 5);        // grip below
        g.fillStyle(0xffaa00, 1);
        g.fillRect(18, 5, 4, 4);        // warning stripe
        g.generateTexture('weapon_pipebomb', 38, 14);

        // ACID SPRAYER - tank with hose
        g.clear();
        g.fillStyle(0x44cc88, 1);       // tank
        g.fillRect(1, 1, 14, 16);
        g.fillStyle(0x88eecc, 1);
        g.fillRect(3, 3, 10, 12);       // liquid window
        g.fillStyle(0x666666, 1);
        g.fillRect(15, 6, 18, 5);       // nozzle pipe
        g.fillStyle(0x44ff44, 1);
        g.fillRect(30, 7, 4, 3);        // acid tip
        g.generateTexture('weapon_acid', 34, 18);

        // Weapon carried by player (smaller, 2D side view pointing right)
        g.clear();
        g.fillStyle(0x8a8a8a, 1);
        g.fillRect(0, 0, 24, 5);
        g.fillStyle(0x6a5a4a, 1);
        g.fillRect(0, 3, 8, 3);
        g.generateTexture('weapon_hand', 24, 6);
    }

    generateMisc(g) {
        // Bullet
        g.clear();
        g.fillStyle(COLORS.BULLET, 1);
        g.fillRect(0, 0, 6, 4);
        g.fillStyle(0xffee88, 1);
        g.fillRect(4, 0, 2, 4);
        g.generateTexture('bullet', 6, 4);

        // Grapple hook - hook shape
        g.clear();
        g.lineStyle(2, COLORS.GRAPPLE, 1);
        g.lineBetween(0, 8, 6, 8);
        g.lineBetween(6, 8, 6, 4);
        g.lineBetween(6, 4, 10, 4);
        g.lineBetween(10, 4, 10, 10);
        g.generateTexture('grapple_hook', 12, 12);

        // Ground tile
        g.clear();
        g.fillStyle(0x5c462f, 1);
        g.fillRect(0, 0, 32, 4);
        g.fillStyle(0x6a4f35, 1);
        g.fillRect(0, 4, 32, 28);
        // lighter top edge highlight so platform outlines read clearly
        g.fillStyle(0x8a6a45, 1);
        g.fillRect(0, 0, 32, 3);
        // rust spots
        g.fillStyle(0x9a7a4a, 0.4);
        for (let i = 0; i < 4; i++) {
            g.fillRect(Math.random() * 24, 6 + Math.random() * 20, 4 + Math.random() * 6, 3);
        }
        g.lineStyle(1, 0x241610, 0.4);
        g.lineBetween(0, 32, 32, 32);
        g.generateTexture('ground', 32, 32);

        // Wall tile - corrugated metal
        g.clear();
        g.fillStyle(COLORS.WALL, 1);
        g.fillRect(0, 0, 32, 32);
        g.lineStyle(1, 0x4a3a2a, 0.5);
        for (let x = 4; x < 32; x += 8) {
            g.lineBetween(x, 0, x, 32);
        }
        g.lineStyle(1, 0x1a0a00, 0.6);
        g.strokeRect(0, 0, 32, 32);
        // rivets
        g.fillStyle(0x7a6a5a, 1);
        for (let x = 2; x < 32; x += 8) {
            g.fillRect(x, 2, 2, 2);
            g.fillRect(x, 28, 2, 2);
        }
        g.generateTexture('wall', 32, 32);

        // Health pack - first aid box with cross
        g.clear();
        g.fillStyle(0xdddddd, 1);
        g.fillRect(0, 0, 18, 18);
        g.fillStyle(0x44cc44, 1);
        g.fillRect(0, 0, 18, 3);
        g.fillStyle(0x44cc44, 1);
        g.fillRect(6, 4, 6, 10);
        g.fillRect(3, 7, 12, 4);
        g.fillStyle(0xaaaaaa, 1);
        g.fillRect(0, 15, 18, 3);
        g.generateTexture('health_pack', 18, 18);

        // Weapon pickup - crate with weapon icon
        g.clear();
        g.fillStyle(0x8a6a4a, 1);
        g.fillRect(0, 0, 20, 14);
        g.fillStyle(0x6a4a2a, 1);
        g.fillRect(0, 0, 20, 3);
        g.fillStyle(0xccaa44, 1);
        g.fillRect(4, 6, 12, 4);
        g.fillStyle(0x4a3a2a, 1);
        g.lineBetween(0, 0, 20, 14);
        g.lineBetween(20, 0, 0, 14);
        g.generateTexture('weapon_pickup', 20, 14);

        // Jetpack / boost pickup - cyan canister with a flame base
        g.clear();
        g.fillStyle(0x1a3a4a, 1);
        g.fillRect(3, 0, 14, 16);
        g.fillStyle(0x33ccff, 1);
        g.fillRect(3, 0, 14, 4);
        g.fillRect(5, 5, 10, 7);
        g.fillStyle(0x77ddff, 1);
        g.fillRect(8, 6, 4, 5);
        g.fillStyle(0xffaa33, 1);
        g.fillTriangle(10, 16, 6, 22, 14, 22);
        g.generateTexture('boost_pickup', 20, 22);

        // Explosion
        g.clear();
        // outer
        g.fillStyle(0xff4400, 0.9);
        g.fillCircle(16, 16, 15);
        g.fillStyle(0xff8800, 0.9);
        g.fillCircle(16, 15, 11);
        g.fillStyle(0xffcc44, 0.9);
        g.fillCircle(16, 15, 7);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(16, 15, 3);
        // spiky edges
        g.fillStyle(0xff6600, 0.8);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.fillCircle(16 + Math.cos(a) * 13, 15 + Math.sin(a) * 13, 3);
        }
        g.generateTexture('explosion', 32, 32);

        // Rad zone tile
        g.clear();
        g.fillStyle(0x44ff00, 0.12);
        g.fillRect(0, 0, 32, 32);
        g.lineStyle(2, 0x44ff00, 0.5);
        g.strokeRect(0, 0, 32, 32);
        g.generateTexture('rad_zone_inner', 32, 32);

        // Scrap icon (HUD)
        g.clear();
        g.fillStyle(0xccaa44, 1);
        g.fillTriangle(8, 0, 12, 12, 4, 12);
        g.fillRect(5, 10, 6, 4);
        g.fillStyle(0xffee88, 1);
        g.fillTriangle(8, 2, 10, 9, 6, 9);
        g.generateTexture('scrap_icon', 11, 14);
    }

    generateDecorations(g) {
        // Grassy ground tile (different from dirt) - brown dirt with grass top
        g.clear();
        g.fillStyle(0x5a8a37, 1);         // grass top
        g.fillRect(0, 0, 32, 6);
        g.fillStyle(0x6f4a28, 1);         // dirt below
        g.fillRect(0, 6, 32, 26);
        // lighter top edge highlight for platform readability
        g.fillStyle(0x8ac24a, 1);
        g.fillRect(0, 0, 32, 3);
        // grass blades
        g.fillStyle(0x8abf54, 1);
        for (let x = 2; x < 32; x += 6) {
            g.fillRect(x, 0, 2, 4 + Math.random() * 3);
        }
        // small pebbles in dirt
        g.fillStyle(0x8a7a5a, 0.6);
        for (let i = 0; i < 4; i++) {
            g.fillCircle(3 + Math.random() * 26, 12 + Math.random() * 16, 1.5);
        }
        g.generateTexture('ground_grass', 32, 32);

        // Loose grass tuft (decor, walkable)
        g.clear();
        g.fillStyle(0x6f9a44, 1);
        g.fillTriangle(8, 16, 16, 0, 12, 16);
        g.fillTriangle(16, 16, 24, 2, 21, 16);
        g.fillTriangle(10, 16, 16, 6, 19, 16);
        g.fillStyle(0x4a6a2f, 1);
        g.fillRect(8, 14, 14, 3);
        g.generateTexture('grass_tuft', 30, 18);

        // Stone / rock (decor, walkable obstacle)
        // NOTE: texture is 40x30 and the physics body fills the whole texture,
        // so the visible rock must fill the same area (apex at very top) or
        // characters appear to stand on invisible geometry.
        g.clear();
        g.fillStyle(0x9a9a92, 1);
        g.fillEllipse(20, 16, 40, 30);   // main dome fills the whole footprint
        g.fillStyle(0x7d7d78, 1);
        g.fillEllipse(20, 22, 34, 18);
        g.fillStyle(0xb0b0a8, 1);
        g.fillEllipse(14, 13, 16, 10);
        // cracks
        g.lineStyle(1, 0x555550, 0.8);
        g.lineBetween(6, 22, 16, 18);
        g.lineBetween(16, 18, 22, 22);
        g.lineBetween(28, 16, 34, 22);
        g.lineBetween(10, 28, 20, 26);
        g.generateTexture('stone', 40, 30);

        // Small stone (decor)
        g.clear();
        g.fillStyle(0xa0a098, 1);
        g.fillEllipse(12, 6.5, 24, 13);   // fills footprint, apex near top
        g.fillStyle(0x7c7c76, 1);
        g.fillEllipse(12, 7.5, 18, 8);
        g.fillStyle(0xb8b8ae, 1);
        g.fillEllipse(9, 5, 10, 5);
        g.generateTexture('stone_small', 24, 13);

        // Broken crate (decor/cover)
        g.clear();
        g.fillStyle(0x7a5a3a, 1);
        g.fillRect(2, 2, 28, 28);
        g.fillStyle(0x5a3a1a, 1);
        g.fillRect(2, 2, 28, 5);
        g.lineStyle(2, 0x3a2a1a, 1);
        g.lineBetween(2, 2, 30, 30);
        g.lineBetween(30, 2, 2, 30);
        g.fillStyle(0x9a7a5a, 1);
        g.fillRect(16, 14, 12, 16); // broken opening
        g.generateTexture('crate', 32, 32);

        // Rusty barrel (decor/cover)
        g.clear();
        g.fillStyle(0x8a5a2a, 1);
        g.fillRect(8, 2, 24, 44);
        g.fillStyle(0x6a4a1a, 1);
        g.fillRect(8, 4, 24, 8);
        g.fillRect(8, 36, 24, 8);
        g.fillStyle(0xccaa44, 0.6);
        g.fillRect(12, 22, 8, 6); // hazard stripe
        g.lineStyle(1, 0x3a2a1a, 0.6);
        for (let y = 12; y < 46; y += 8) g.lineBetween(8, y, 32, y);
        g.generateTexture('barrel', 40, 48);
    }
}
