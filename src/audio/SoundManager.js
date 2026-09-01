// SoundManager - procedurally synthesizes ALL game audio using the Web Audio API.
// No external audio files are used, so there are zero licensing/copyright concerns.
// Every sound (gun shots, grapple, explosions, pickups, UI clicks, footsteps,
// win/lose jingles and the main-menu theme) is generated from raw waveforms.
import Phaser from 'phaser';

export class SoundManager {
    constructor(scene) {
        this.scene = scene;
        this.ctx = null;
        this.master = null;
        this.enabled = true;
        this.musicEnabled = true;
        this.sfxEnabled = true;
        this.musicGain = null;
        this.sfxGain = null;
        this.musicRequested = false;

        // Per-weapon SFX presets (built once, reused)
        this.cache = {};
    }

    // Create/resume the audio context. Must be called from a user gesture
    // (Phaser guarantees a gesture happens on the first pointer/keyboard input).
    ensure() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();

            this.master = this.ctx.createGain();
            this.master.gain.value = 0.9;
            this.master.connect(this.ctx.destination);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.28;
            this.musicGain.connect(this.master);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 1.0;
            this.sfxGain.connect(this.master);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // If music was requested before the audio context existed (e.g. the menu
        // theme started at scene create), begin it now that we can make sound.
        if (this.musicRequested) this.startMusic();
    }

    // ---- Low-level helpers ----

    _noiseBuffer(seconds) {
        const sr = this.ctx.sampleRate;
        const len = Math.floor(sr * seconds);
        const buf = this.ctx.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return buf;
    }

    _env(gain, t0, attack, decay, peak = 1) {
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    }

    _osc(type, freq, t0, dur, peak = 0.5, freqEnd = null) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (freqEnd !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
        }
        gain.gain.value = peak;
        osc.connect(gain);
        return { osc, gain };
    }

    _play(src, gain, t0) {
        gain.connect(this.sfxGain);
        src.start(t0);
    }

    // ---- SFX ----

    shot(weaponKey) {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        if (weaponKey === 'SCRAP_RIFLE') {
            this._noiseShot(t0, 0.12, 320, 0.5);
            this._toneShot(t0, 0.06, 180, 0.3);
        } else if (weaponKey === 'NAIL_GUN') {
            this._noiseShot(t0, 0.04, 500, 0.35);
            this._toneShot(t0, 0.03, 280, 0.18);
        } else if (weaponKey === 'PIPE_BOMB') {
            this._noiseShot(t0, 0.18, 140, 0.6);
            this._toneShot(t0, 0.12, 90, 0.5);
        } else if (weaponKey === 'ACID_SPRAYER') {
            this._noiseShot(t0, 0.06, 900, 0.2);
            this._toneShot(t0, 0.04, 400, 0.12);
        }
    }

    _noiseShot(t0, dur, filterFreq, peak) {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer(dur);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        const gain = this.ctx.createGain();
        this._env(gain, t0, 0.001, dur, peak);
        src.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        src.start(t0); src.stop(t0 + dur);
    }

    _toneShot(t0, dur, freq, peak) {
        const { osc, gain } = this._osc('square', freq, t0, dur, peak, freq * 0.5);
        this._env(gain, t0, 0.001, dur, peak);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + dur);
    }

    reload() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const t = t0 + i * 0.09;
            const { osc, gain } = this._osc('square', 500 - i * 80, t, 0.05, 0.15, 300);
            this._env(gain, t, 0.001, 0.05, 0.15);
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.start(t); osc.stop(t + 0.06);
        }
    }

    stab() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const { osc, gain } = this._osc('sawtooth', 900, t0, 0.05, 0.2, 200);
        this._env(gain, t0, 0.001, 0.05, 0.2);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + 0.06);
    }

    grapple() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        // "zhzink" - quick upward frequency sweep + small noise burst
        const { osc, gain } = this._osc('sine', 300, t0, 0.25, 0.25, 1500);
        this._env(gain, t0, 0.01, 0.25, 0.25);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + 0.27);
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer(0.2);
        const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000;
        const ng = this.ctx.createGain();
        this._env(ng, t0, 0.005, 0.15, 0.15);
        src.connect(f); f.connect(ng); ng.connect(this.sfxGain);
        src.start(t0); src.stop(t0 + 0.2);
    }

    jump() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const { osc, gain } = this._osc('square', 220, t0, 0.1, 0.12, 300);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + 0.12);
    }

    explosion() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer(0.8);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, t0);
        filter.frequency.exponentialRampToValueAtTime(80, t0 + 0.6);
        const gain = this.ctx.createGain();
        this._env(gain, t0, 0.005, 0.7, 0.9);
        src.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        src.start(t0); src.stop(t0 + 0.8);
        // low boom
        const { osc, gain: bg } = this._osc('sine', 90, t0, 0.5, 0.7, 30);
        this._env(bg, t0, 0.01, 0.5, 0.7);
        osc.connect(bg); bg.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + 0.5);
    }

    hurt() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const { osc, gain } = this._osc('sawtooth', 400, t0, 0.15, 0.25, 120);
        this._env(gain, t0, 0.005, 0.15, 0.25);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + 0.16);
    }

    death() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        for (let i = 0; i < 4; i++) {
            const t = t0 + i * 0.1;
            const { osc, gain } = this._osc('sawtooth', 300 - i * 60, t, 0.12, 0.2, 100);
            this._env(gain, t, 0.005, 0.12, 0.2);
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.start(t); osc.stop(t + 0.13);
        }
    }

    pickup() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        [660, 880, 990].forEach((f, i) => {
            const t = t0 + i * 0.06;
            const { osc, gain } = this._osc('triangle', f, t, 0.08, 0.2);
            this._env(gain, t, 0.002, 0.08, 0.2);
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.start(t); osc.stop(t + 0.09);
        });
    }

    wallCling() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer(0.1);
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 8;
        const gain = this.ctx.createGain();
        this._env(gain, t0, 0.01, 0.08, 0.12);
        src.connect(f); f.connect(gain); gain.connect(this.sfxGain);
        src.start(t0); src.stop(t0 + 0.1);
    }

    click() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const { osc, gain } = this._osc('square', 700, t0, 0.05, 0.12, 300);
        this._env(gain, t0, 0.001, 0.05, 0.12);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + 0.06);
    }

    // ---- Jingle / theme (all original compositions) ----

    win() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => {
            const t = t0 + i * 0.14;
            const { osc, gain } = this._osc('triangle', f, t, 0.25, 0.3);
            this._env(gain, t, 0.01, 0.25, 0.3);
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.start(t); osc.stop(t + 0.27);
        });
    }

    lose() {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const notes = [440, 392, 330, 262];
        notes.forEach((f, i) => {
            const t = t0 + i * 0.18;
            const { osc, gain } = this._osc('sawtooth', f, t, 0.3, 0.2);
            this._env(gain, t, 0.02, 0.3, 0.2);
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.start(t); osc.stop(t + 0.32);
        });
    }

    countdownBeep(final = false) {
        if (!this.sfxEnabled || !this.ctx) return;
        const t0 = this.ctx.currentTime;
        const { osc, gain } = this._osc('square', final ? 880 : 440, t0, 0.15, 0.25);
        this._env(gain, t0, 0.005, 0.15, 0.25);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t0); osc.stop(t0 + 0.16);
    }

    // ---- Main menu theme music (looping, original) ----
    // A slow, moody post-apocalyptic drone: open-fifth bass line under a sparse
    // minor melody. Fully synthesized with oscillators - 100% original.
    startMusic() {
        this.musicRequested = true;
        if (!this.musicEnabled || !this.ctx || this.musicNodes) return;
        this.musicNodes = [];

        const t0 = this.ctx.currentTime;
        // Chord pad (Dm - F - Am - Bb, ~8.5s loop) using soft sines with slow
        // attacks so it feels ambient rather than aggressive.
        const chords = [
            [146.83, 174.61, 220.00],   // Dm
            [174.61, 220.00, 261.63],   // F
            [110.00, 164.81, 220.00],   // Am
            [116.54, 174.61, 233.08],   // Bb
        ];
        const barDur = 2.2;
        chords.forEach((chord, ci) => {
            const ct = t0 + ci * barDur;
            chord.forEach(f => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = f;
                gain.gain.setValueAtTime(0.0001, ct);
                gain.gain.linearRampToValueAtTime(0.16, ct + 1.0);
                gain.gain.linearRampToValueAtTime(0.0001, ct + barDur);
                osc.connect(gain); gain.connect(this.musicGain);
                osc.start(ct);
                osc.stop(ct + barDur + 0.05);
                this.musicNodes.push(osc);
            });
        });

        // Sparse melancholy melody (D minor pentatonic) over the top
        const melody = [
            [880, 0], [880, 0.4], [784, 0.9], [659, 1.3], [587, 1.7],
            [659, 2.2], [784, 2.6], [880, 3.0], [698, 3.5], [587, 4.0],
            [523, 4.4], [523, 4.9], [587, 5.3], [659, 5.8], [523, 6.3],
            [523, 6.7], [440, 7.1],
        ];
        melody.forEach(([f, off]) => {
            const mt = t0 + off;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.0001, mt);
            gain.gain.linearRampToValueAtTime(0.12, mt + 0.08);
            gain.gain.linearRampToValueAtTime(0.0001, mt + 0.5);
            osc.connect(gain); gain.connect(this.musicGain);
            osc.start(mt);
            osc.stop(mt + 0.55);
            this.musicNodes.push(osc);
        });

        // Schedule loop point and re-trigger
        const loopDur = chords.length * barDur;
        this.musicLoop = setTimeout(() => {
            this.stopMusic();
            this.startMusic();
        }, (loopDur + 0.1) * 1000);
    }

    stopMusic() {
        this.musicRequested = false;
        if (this.musicLoop) { clearTimeout(this.musicLoop); this.musicLoop = null; }
        if (this.musicNodes) {
            for (const n of this.musicNodes) {
                try { n.stop(); } catch (e) {}
            }
            this.musicNodes = null;
        }
    }

    setMaster(on) {
        this.enabled = on;
        if (this.master) this.master.gain.value = on ? 0.9 : 0;
    }

    setMusic(on) {
        this.musicEnabled = on;
        if (this.musicGain) this.musicGain.gain.value = on ? 0.28 : 0;
        if (on) this.startMusic(); else this.stopMusic();
    }

    setSfx(on) {
        this.sfxEnabled = on;
        if (this.sfxGain) this.sfxGain.gain.value = on ? 1.0 : 0;
    }

    destroy() {
        this.stopMusic();
        if (this.ctx) {
            try { this.ctx.close(); } catch (e) {}
            this.ctx = null;
        }
    }
}
