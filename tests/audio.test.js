import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {AUDIO_KEY} from '../src/config.js';
import {createDragSamples, createPopSamples} from '../src/audio/sound-effects.js';
import {GameAudio} from '../src/services/game-audio.js';
import {createApp, createMemoryStorage} from './helpers/fake-dom.js';
import {createAudioEnvironment, flushAudio} from './helpers/fake-audio.js';

test('audio waits for user input, then plays a short recorded dou and reuses its context', async () => {
    const environment = createAudioEnvironment();
    const audio = new GameAudio(environment.window);
    await flushAudio();
    assert.equal(environment.contexts.length, 0);
    assert.equal(environment.sources.length, 0);
    assert.match(environment.fetches[0], /assets\/audio\/dou\.wav$/);
    audio.playSelect();
    assert.equal(environment.contexts.length, 1);
    assert.equal(environment.contexts[0].resumes, 1);
    await flushAudio();
    assert.equal(environment.sources.length, 1);
    assert.equal(environment.sources[0].buffer.name, 'dou');
    audio.playSelect();
    await flushAudio();
    assert.equal(environment.contexts.length, 1);
    assert.equal(environment.sources.length, 2);
    assert.equal(environment.sources[0].stops.at(-1), 1.025);
    audio.stopAll();
    assert.equal(audio.voices.size, 0);
});

test('movement loops softly until its own stop handle is called; newer sounds stay active', async () => {
    const environment = createAudioEnvironment();
    const audio = new GameAudio(environment.window);
    const stopOld = audio.startMove();
    await flushAudio();
    const oldSource = environment.sources[0];
    assert.equal(oldSource.loop, true);
    assert.ok(oldSource.target.gain.events.some(event => event[0] === 'ramp' && event[1] <= 0.35));
    assert.equal(oldSource.stops[0], 5);
    audio.stopAll();
    const stopNew = audio.startMove();
    await flushAudio();
    const newSource = environment.sources[1];
    stopOld();
    assert.equal(newSource.stops.length, 1);
    stopNew();
    assert.equal(newSource.stops.at(-1), 1.025);
    assert.equal(audio.voices.size, 0);
});

test('clearing schedules a bounded, staggered bubble cluster and cleans ended sources', async () => {
    const environment = createAudioEnvironment();
    const audio = new GameAudio(environment.window);
    audio.playClear(0);
    assert.equal(environment.contexts.length, 0);
    audio.playClear(100);
    await flushAudio();
    assert.equal(environment.sources.length, 6);
    assert.equal(environment.sources[0].started, 1);
    assert.ok(environment.sources.at(-1).started < 1.12);
    for (const source of environment.sources) {
        assert.equal(Boolean(source.loop), false);
        assert.ok(source.stops[0] < 1.25);
        source.onended();
        assert.equal(source.disconnected, true);
        assert.equal(source.target.disconnected, true);
    }
    assert.equal(audio.voices.size, 0);
});

test('muting immediately disconnects active audio, preserves the preference, and blocks pending speech', async () => {
    let resolveFetch;
    const environment = createAudioEnvironment({fetchSound: () => new Promise(resolve => { resolveFetch = resolve; })});
    const audio = new GameAudio(environment.window);
    audio.playSelect();
    audio.startMove();
    await flushAudio();
    audio.setEnabled(false);
    const sourceCount = environment.sources.length;
    assert.equal(environment.sources[0].target.disconnected, true);
    resolveFetch({ok: true, arrayBuffer: async () => new ArrayBuffer(4)});
    await flushAudio();
    audio.playClear(5);
    await flushAudio();
    assert.equal(environment.sources.length, sourceCount);
    assert.equal(environment.storage.getItem(AUDIO_KEY), 'false');
    assert.equal(new GameAudio(environment.window).enabled, false);
    audio.setEnabled(true);
    audio.playSelect();
    await flushAudio();
    assert.equal(environment.sources.at(-1).buffer.name, 'dou');
});

test('backgrounding or leaving stops sounds; returning requires new input instead of replaying', async () => {
    const environment = createAudioEnvironment();
    const audio = new GameAudio(environment.window);
    audio.startMove();
    await flushAudio();
    environment.window.document.hidden = true;
    environment.visibilityListeners.visibilitychange();
    await flushAudio();
    assert.equal(audio.voices.size, 0);
    assert.equal(environment.contexts[0].state, 'suspended');
    audio.playSelect();
    await flushAudio();
    assert.equal(environment.sources.length, 1);
    environment.window.document.hidden = false;
    environment.visibilityListeners.visibilitychange();
    await flushAudio();
    assert.equal(environment.sources.length, 1);
    audio.playSelect();
    await flushAudio();
    assert.equal(environment.sources.at(-1).buffer.name, 'dou');
    environment.listeners.pagehide();
    assert.equal(audio.voices.size, 0);
});

test('blocked storage, unsupported audio, rejected autoplay, and missing recordings do not break play', async () => {
    const blockedStorage = {getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); }};
    for (const options of [
        {unsupported: true}, {failResume: true}, {storage: blockedStorage},
        {fetchSound: async () => { throw new Error('Unavailable'); }}
    ]) {
        const environment = createAudioEnvironment(options);
        const audio = new GameAudio(environment.window);
        audio.playSelect();
        const stop = audio.startMove();
        audio.playClear(5);
        await flushAudio();
        stop();
        audio.setEnabled(false);
        await flushAudio();
        assert.equal(audio.voices.size, 0);
    }
});

test('generated effects have bounded samples and soft loop/pop boundaries at common sample rates', () => {
    for (const rate of [22050, 44100, 48000]) {
        for (const samples of [createDragSamples(rate), createPopSamples(rate)]) {
            assert.ok(samples.length > rate * 0.05 && samples.length <= rate * 0.6);
            assert.ok(samples.every(sample => Number.isFinite(sample) && Math.abs(sample) < 0.7));
            assert.ok(Math.abs(samples[0]) < 0.005);
            assert.ok(Math.abs(samples.at(-1)) < 0.005);
            assert.ok(samples.some(sample => Math.abs(sample) > 0.03));
        }
    }
});

test('the spoken dou asset is a small nonempty mono PCM WAV with headroom', () => {
    const wav = readFileSync(new URL('../assets/audio/dou.wav', import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    const rate = wav.readUInt32LE(24);
    const duration = (wav.length - 44) / 2 / rate;
    assert.ok(duration >= 0.1 && duration <= 0.45);
    const values = Array.from({length: (wav.length - 44) / 2}, (_, index) => wav.readInt16LE(44 + index * 2));
    assert.ok(Math.max(...values.map(Math.abs)) < 32767 * 0.85);
    assert.ok(values.some(value => Math.abs(value) > 1000));
});

test('controller sounds follow bean clicks, successful movement and actual clears without changing rules', async () => {
    const app = createApp();
    app.emptyBoard();
    app.audio.calls.length = 0;
    await app.click(0, 0);
    assert.deepEqual(app.audio.calls, []);
    for (let c = 0; c < 4; c++) app.controller.game.board.cells[0][c] = 0;
    app.controller.game.board.cells[1][4] = 0;
    app.controller.game.preview = [1, 2, 3];
    app.view.render(app.controller.game.board, null);
    await app.click(1, 4);
    await app.click(1, 4);
    await app.click(1, 4);
    await app.click(0, 4);
    assert.deepEqual(app.audio.calls, [['select'], ['select'], ['select'], ['move', true], ['clear', 5]]);
    assert.equal(app.controller.game.score, 5);
    assert.deepEqual(app.errors, []);
});

test('restarting interrupts movement audio and old turns cannot emit clear sounds', async () => {
    const app = createApp({reducedMotion: false, deferAnimation: true});
    app.emptyBoard();
    for (let c = 0; c < 4; c++) app.controller.game.board.cells[0][c] = 0;
    app.controller.game.board.cells[1][4] = 0;
    app.controller.game.preview = [1, 2, 3];
    app.view.render(app.controller.game.board, null);
    await app.click(1, 4);
    const turn = app.click(0, 4);
    app.elements.restartBtn.listeners.click();
    await turn;
    assert.ok(app.audio.calls.some(call => call[0] === 'move' && call[1]));
    assert.equal(app.audio.calls.at(-1)[0], 'stop-all');
    assert.ok(!app.audio.calls.some(call => call[0] === 'clear'));
    assert.equal(app.controller.game.score, 0);
});

test('bilingual sound controls retain the game and reflect a saved mute preference after reload', () => {
    const storage = createMemoryStorage();
    const environment = createAudioEnvironment({storage});
    const audio = new GameAudio(environment.window);
    const app = createApp({storage, audio});
    const before = app.controller.game.toSnapshot();
    app.elements.soundToggle.listeners.click();
    assert.equal(app.elements.soundToggle.textContent, '🔇 音效關閉');
    assert.equal(app.elements.soundToggle.attributes['aria-pressed'], 'false');
    app.elements.languageSelect.value = 'en';
    app.elements.languageSelect.listeners.change();
    assert.equal(app.elements.soundToggle.textContent, '🔇 Sound off');
    assert.equal(app.elements.soundToggle.attributes.title, 'Enable sound effects');
    assert.deepEqual(app.controller.game.toSnapshot(), before);
    const restored = createApp({storage, audio: new GameAudio(createAudioEnvironment({storage}).window)});
    assert.equal(restored.elements.soundToggle.textContent, '🔇 Sound off');
    restored.elements.restartBtn.listeners.click();
    assert.equal(restored.elements.soundToggle.attributes['aria-pressed'], 'false');
});
