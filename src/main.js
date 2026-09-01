import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { WaitingRoomScene } from './scenes/WaitingRoomScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GAME_CONFIG, COLORS } from './utils/constants.js';
import { resolveServerAddr } from './net/serverAddr.js';
import { SoundManager } from './audio/SoundManager.js';

const config = {
    type: Phaser.AUTO,
    width: GAME_CONFIG.WIDTH,
    height: GAME_CONFIG.HEIGHT,
    parent: 'game-container',
    backgroundColor: COLORS.BACKGROUND,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: GAME_CONFIG.GRAVITY },
            debug: false,
        },
    },
    scene: [BootScene, MenuScene, LobbyScene, WaitingRoomScene, GameScene],
    pixelArt: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
        activePointers: 2,
    },
};

const game = new Phaser.Game(config);

// Make the multiplayer server address available to scenes via the registry.
game.registry.set('serverAddr', resolveServerAddr());

// --- Global procedural audio ---
// A single SoundManager is shared across scenes. Scenes access it via
// `this.registry.get('sound')`. The audio context is created lazily on the
// first user gesture (browsers require a gesture to start audio).
const soundManager = new SoundManager();
game.registry.set('sound', soundManager);

// Unlock audio on the first interaction (pointer/keyboard).
const unlock = () => {
    soundManager.ensure();
    game.input.off('pointerdown', unlock);
    game.input.keyboard.off('keydown', unlock);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
};
game.input.on('pointerdown', unlock);
game.input.keyboard.on('keydown', unlock);
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

export default game;
