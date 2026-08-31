export const GAME_CONFIG = {
    WIDTH: 1280,
    HEIGHT: 720,
    BACKGROUND_COLOR: '#1a0a00',
    TILE_SIZE: 32,
    GRAVITY: 800,
};

export const PLAYER_CONFIG = {
    SPEED: 250,
    JUMP_FORCE: -420,
    MAX_HEALTH: 100,
    MAX_RAD: 100,
    WIDTH: 28,
    HEIGHT: 40,
    COLOR: 0x44aa44,
    WALL_CLING_DURATION: 1500,
    WALL_CLING_FALL_SPEED: 50,
    SLIDE_SPEED: 400,
    SLIDE_DURATION: 300,
};

export const GRAPPLE_CONFIG = {
    SPEED: 1200,
    MAX_DISTANCE: 350,
    PULL_FORCE: 600,
    COOLDOWN: 500,
    COLOR: 0xccaa44,
    WIDTH: 3,
};

export const WEAPON_CONFIG = {
    SCRAP_RIFLE: {
        name: 'Scrap Rifle',
        damage: 15,
        fireRate: 300,
        bulletSpeed: 800,
        bulletLifetime: 1000,
        spread: 0.05,
        ammo: 30,
        recoil: 80,
        color: 0xffaa00,
    },
    NAIL_GUN: {
        name: 'Nail Gun',
        damage: 8,
        fireRate: 100,
        bulletSpeed: 1000,
        bulletLifetime: 600,
        spread: 0.12,
        ammo: 60,
        recoil: 30,
        color: 0xcccccc,
    },
    PIPE_BOMB: {
        name: 'Pipe Bomb',
        damage: 50,
        fireRate: 1500,
        bulletSpeed: 400,
        bulletLifetime: 2000,
        spread: 0,
        ammo: 5,
        recoil: 200,
        color: 0xff4400,
        explosive: true,
        explosionRadius: 80,
    },
    ACID_SPRAYER: {
        name: 'Acid Sprayer',
        damage: 5,
        fireRate: 50,
        bulletSpeed: 500,
        bulletLifetime: 400,
        spread: 0.3,
        ammo: 100,
        recoil: 10,
        color: 0x44ff44,
    },
};

export const RAD_CONFIG = {
    DAMAGE_PER_SECOND: 5,
    STORM_INTERVAL: 30000,
    STORM_DURATION: 10000,
    SAFE_ZONE_SHRINK: 0.8,
};

export const COLORS = {
    BACKGROUND: 0x1a0a00,
    GROUND: 0x3d2b1f,
    GROUND_TOP: 0x5c4033,
    WALL: 0x2a1a10,
    RAD_ZONE: 0x44ff0033,
    RAD_GLOW: 0x44ff00,
    PLAYER_1: 0x44aa44,
    PLAYER_2: 0xaa4444,
    PLAYER_3: 0x4444aa,
    PLAYER_4: 0xaaaa44,
    PLAYER_5: 0xaa44aa,
    PLAYER_6: 0x44aaaa,
    BULLET: 0xffaa00,
    GRAPPLE: 0xccaa44,
    HEALTH_BAR: 0x44cc44,
    RAD_BAR: 0x44ff44,
    UI_BG: 0x000000,
    UI_TEXT: '#e0d0c0',
};
