// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {AUDIO_KEY} from '../config.js';
import {createDragSamples, createPopSamples} from '../audio/sound-effects.js';

const SELECT_SOUND = new URL('../../assets/audio/dou.wav', import.meta.url);

/** Optional sound presentation. Never delays or changes a game turn. */
export class GameAudio {
    constructor(window) {
        this.window = window;
        this.enabled = true;
        this.context = null;
        this.voices = new Set();
        try {
            this.enabled = window.localStorage.getItem(AUDIO_KEY) !== 'false';
        } catch { /* Storage is optional. */ }
        // Download only; AudioContext is created/resumed from a user gesture.
        try {
            this.selectionData = Promise.resolve(window.fetch(SELECT_SOUND))
                .then(response => response.ok ? response.arrayBuffer() : null).catch(() => null);
        } catch {
            this.selectionData = Promise.resolve(null);
        }
        const pause = () => {
            this.stopAll();
            try { this.context?.suspend().catch(() => {}); } catch { /* Optional audio. */ }
        };
        window.document.addEventListener('visibilitychange', () => {
            if (window.document.hidden) pause();
        });
        window.addEventListener('pagehide', pause);
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        try { this.window.localStorage.setItem(AUDIO_KEY, String(this.enabled)); } catch { /* Optional preference. */ }
        if (this.enabled) void this.unlock();
        else this.stopAll();
    }

    unlock() {
        if (!this.enabled || this.window.document.hidden) return Promise.resolve(null);
        try {
            if (!this.context || this.context.state === 'closed') {
                const AudioContext = this.window.AudioContext ?? this.window.webkitAudioContext;
                if (!AudioContext) return Promise.resolve(null);
                this.context = new AudioContext({latencyHint: 'interactive'});
                this.master = this.context.createGain();
                this.master.gain.value = 0.45;
                this.master.connect(this.context.destination);
                this.drag = this.makeBuffer(createDragSamples(this.context.sampleRate));
                this.pop = this.makeBuffer(createPopSamples(this.context.sampleRate));
            }
            const context = this.context;
            return (context.state === 'running' ? Promise.resolve() : context.resume())
                .then(() => context.state === 'running' ? context : null).catch(() => null);
        } catch {
            return Promise.resolve(null);
        }
    }

    makeBuffer(samples) {
        const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
        buffer.copyToChannel(samples, 0);
        return buffer;
    }

    isActive(voice) {
        return !voice.stopped && this.enabled && !this.window.document.hidden;
    }

    play(action) {
        const voice = {
            stopped: false, sources: new Set(),
            stop: (immediate = false) => {
                if (voice.stopped) return;
                voice.stopped = true;
                this.voices.delete(voice);
                for (const {source, gain} of voice.sources) {
                    try {
                        const now = this.context.currentTime;
                        if (immediate) {
                            gain.disconnect();
                            source.stop(now);
                            continue;
                        }
                        gain.gain.cancelScheduledValues(now);
                        gain.gain.setTargetAtTime(0, now, 0.006);
                        source.stop(now + 0.025);
                    } catch {
                        source.disconnect();
                        gain.disconnect();
                    }
                }
            }
        };
        this.voices.add(voice);
        // unlock() runs synchronously until resume(), inside the input handler.
        void this.unlock().then(context => {
            if (!context || !this.isActive(voice)) return voice.stop();
            return action(context, voice);
        }).catch(() => voice.stop());
        return voice;
    }

    startBuffer(voice, buffer, {volume, loop = false, rate = 1, delay = 0} = {}) {
        if (!this.isActive(voice)) return;
        const context = this.context;
        const source = context.createBufferSource();
        const gain = context.createGain();
        const entry = {source, gain};
        voice.sources.add(entry);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            voice.sources.delete(entry);
            if (voice.sources.size === 0) this.voices.delete(voice);
        };
        source.buffer = buffer;
        source.loop = loop;
        source.playbackRate.value = rate;
        source.connect(gain);
        gain.connect(this.master);
        const when = context.currentTime + delay;
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(volume, when + 0.008);
        source.start(when);
        // A safety limit also stops movement if a browser loses an animation callback.
        source.stop(when + (loop ? 4 : buffer.duration / rate + 0.01));
    }

    playSelect() {
        this.selection?.stop();
        this.selection = this.play(async (context, voice) => {
            if (!this.selectionBuffer) {
                this.selectionBuffer = this.selectionData.then(data => data
                    ? context.decodeAudioData(data.slice(0)) : null).catch(() => null);
            }
            const buffer = await this.selectionBuffer;
            if (!buffer) return voice.stop();
            this.startBuffer(voice, buffer, {volume: 0.6});
        });
    }

    startMove() {
        this.selection?.stop();
        const voice = this.play((context, voice) => {
            this.startBuffer(voice, this.drag, {volume: 0.35, loop: true});
        });
        return voice.stop;
    }

    playClear(count) {
        if (!(count > 0)) return;
        const bubbles = Math.min(6, count);
        this.play((context, voice) => {
            for (let i = 0; i < bubbles; i++) {
                this.startBuffer(voice, this.pop, {
                    volume: 0.5 / Math.sqrt(bubbles), rate: 0.88 + i * 0.075, delay: i * 0.022
                });
            }
        });
    }

    stopAll() {
        for (const voice of [...this.voices]) voice.stop(true);
    }
}
