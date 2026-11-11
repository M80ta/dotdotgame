import {createMemoryStorage} from './fake-dom.js';

export function createAudioEnvironment({storage = createMemoryStorage(), unsupported = false, failResume = false, fetchSound} = {}) {
    const sources = [];
    const contexts = [];
    const fetches = [];
    const listeners = {};
    const visibilityListeners = {};
    class AudioNode {
        constructor() {
            this.disconnected = false;
            this.gain = {
                value: 1, events: [],
                setValueAtTime(...args) { this.events.push(['set', ...args]); },
                linearRampToValueAtTime(...args) { this.events.push(['ramp', ...args]); },
                cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); },
                setTargetAtTime(...args) { this.events.push(['target', ...args]); }
            };
            this.playbackRate = {value: 1};
            this.stops = [];
        }
        connect(node) { this.target = node; }
        disconnect() { this.disconnected = true; }
        start(time) { this.started = time; }
        stop(time) { this.stops.push(time); }
    }
    class AudioContext {
        constructor() {
            this.state = 'suspended';
            this.currentTime = 1;
            this.sampleRate = 24000;
            this.destination = new AudioNode();
            this.resumes = 0;
            contexts.push(this);
        }
        createGain() { return new AudioNode(); }
        createBufferSource() {
            const source = new AudioNode();
            sources.push(source);
            return source;
        }
        createBuffer(channels, length, sampleRate) {
            return {duration: length / sampleRate, copyToChannel(samples) { this.samples = samples.slice(); }};
        }
        async decodeAudioData() { return {duration: 0.18, name: 'dou'}; }
        async resume() {
            this.resumes++;
            if (failResume) throw new Error('Autoplay denied');
            this.state = 'running';
        }
        async suspend() { this.state = 'suspended'; }
    }
    const window = {
        AudioContext: unsupported ? undefined : AudioContext,
        localStorage: storage,
        fetch(url) {
            fetches.push(String(url));
            return fetchSound ? fetchSound(url) : Promise.resolve({ok: true, arrayBuffer: async () => new ArrayBuffer(4)});
        },
        document: {hidden: false, addEventListener(name, callback) { visibilityListeners[name] = callback; }},
        addEventListener(name, callback) { listeners[name] = callback; }
    };
    return {window, sources, contexts, fetches, storage, listeners, visibilityListeners};
}

export async function flushAudio() {
    for (let i = 0; i < 16; i++) await Promise.resolve();
}
