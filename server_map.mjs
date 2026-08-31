// server_map.mjs - server-side collision geometry for Wasteland Scramble.
// Mirror of the client map/obstacle geometry so bullets (and later players)
// collide with walls exactly as they do locally. Keep in sync with
// src/maps/junkyard.js and src/scenes/BootScene.js texture sizes.
// Self-contained: does NOT import Phaser. All map data is inlined.

const T = 32;

// Obstacle texture physical dims (from BootScene generateDecorations).
// Physics bodies fill the full texture frame; obstacle is placed at
// (x, surfaceTop - halfH) and centered, so its rect is [x-w/2, surfaceTop-h, w, h].
const OBSTACLE_DIMS = {
    stone:       { w: 40, h: 30 },
    stone_small: { w: 24, h: 13 },
    crate:       { w: 32, h: 32 },
    barrel:      { w: 40, h: 48 },
};

// Inline collision-relevant map data (from src/maps/junkyard.js).
// Only platforms and obstacles matter for bullet collision.
const MAP_DATA = {
    platforms: [
        { x: 0, y: 28, w: 80, h: 2 },
        { x: 4, y: 25, w: 6, h: 1 },
        { x: 22, y: 25, w: 5, h: 1 },
        { x: 49, y: 25, w: 6, h: 1 },
        { x: 66, y: 25, w: 6, h: 1 },
        { x: 14, y: 19, w: 16, h: 1 },
        { x: 48, y: 19, w: 16, h: 1 },
        { x: 8, y: 13, w: 8, h: 1 },
        { x: 30, y: 12, w: 22, h: 1 },
        { x: 64, y: 13, w: 8, h: 1 },
        { x: 20, y: 6, w: 10, h: 1 },
        { x: 52, y: 6, w: 10, h: 1 },
    ],
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
};

function surfaceTopAt(x) {
    let best = 28 * T;
    for (const p of MAP_DATA.platforms) {
        const x0 = p.x * T;
        const x1 = (p.x + p.w) * T;
        if (x >= x0 && x <= x1) {
            const top = p.y * T;
            if (top < best) best = top;
        }
    }
    return best;
}

export function buildColliders() {
    const rects = [];

    for (const p of MAP_DATA.platforms) {
        for (let dx = 0; dx < p.w; dx++) {
            for (let dy = 0; dy < p.h; dy++) {
                rects.push({ x: (p.x + dx) * T, y: (p.y + dy) * T, w: T, h: T });
            }
        }
    }

    for (const o of MAP_DATA.obstacles) {
        const dim = OBSTACLE_DIMS[o.type];
        if (!dim) continue;
        const surf = surfaceTopAt(o.x);
        rects.push({ x: o.x - dim.w / 2, y: surf - dim.h, w: dim.w, h: dim.h });
    }

    return rects;
}

// Segment-AABB intersection: tests if the line segment from (x1,y1)->(x2,y2)
// intersects the rectangle [rx, ry, rw, rh]. Returns the entry point {ix, iy}
// or null if no intersection. Uses a slab-based ray clip.
export function segRectHit(x1, y1, x2, y2, rx, ry, rw, rh) {
    let tmin = 0;
    let tmax = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const eps = 0.001;

    if (Math.abs(dx) < eps) {
        if (x1 < rx || x1 > rx + rw) return null;
    } else {
        let t1 = (rx - x1) / dx;
        let t2 = (rx + rw - x1) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
    }

    if (Math.abs(dy) < eps) {
        if (y1 < ry || y1 > ry + rh) return null;
    } else {
        let t1 = (ry - y1) / dy;
        let t2 = (ry + rh - y1) / dy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
    }

    const t = tmin;
    return { ix: x1 + dx * t, iy: y1 + dy * t, t };
}