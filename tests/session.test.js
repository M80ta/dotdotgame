import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GAME_SESSION_KEY, HIGH_SCORE_KEY} from '../src/config.js';
import {GameA} from '../src/game/game-a.js';
import {GameSessionStore} from '../src/services/game-session.js';
import {createApp, createMemoryStorage} from './helpers/fake-dom.js';

const countBalls = app => app.controller.game.board.cells.flat().filter(color => color !== null).length;
const saved = storage => JSON.parse(storage.getItem(GAME_SESSION_KEY));
async function flushUntil(predicate) {
    for (let i = 0; i < 12 && !predicate(); i++) await Promise.resolve();
    assert.equal(predicate(), true);
}

function setupLine(app) {
    app.emptyBoard();
    const game = app.controller.game;
    for (let c = 0; c < 4; c++) game.board.cells[0][c] = 0;
    game.board.cells[1][4] = 0;
    game.preview = [1, 2, 3];
    app.view.render(game.board, null);
}

test('snapshot round trip preserves board, score, preview and selection without drawing new random colors', () => {
    const game = new GameA({boardSize: 9, batchSize: 4});
    const ball = game.board.cells.flatMap((row, r) => row.flatMap((color, c) => color === null ? [] : [{r, c}]))[0];
    game.selectCell(ball.r, ball.c);
    game.score = 18;
    const snapshot = game.toSnapshot();
    const restored = GameA.fromSnapshot(snapshot, {random() { throw new Error('Restore must not consume randomness'); }});
    assert.ok(restored instanceof GameA);
    assert.deepEqual(restored.toSnapshot(), snapshot);
    snapshot.cells[ball.r][ball.c] = null;
    snapshot.preview[0] = 99;
    snapshot.selectedBall.r = -1;
    assert.notEqual(restored.board.cells[ball.r][ball.c], null);
    assert.notEqual(restored.preview[0], 99);
    assert.deepEqual(restored.selectedBall, ball);
});

test('invalid board, preview, score and selection snapshots are rejected', () => {
    const valid = new GameA().toSnapshot();
    const corruptions = [
        data => { data.boardSize = 7; },
        data => { data.batchSize = 6; },
        data => { data.cells.pop(); },
        data => { data.cells[0].pop(); },
        data => { data.cells[0][0] = 9; },
        data => { data.preview = [1, 1, 2]; },
        data => { data.preview.pop(); },
        data => { data.score = -1; },
        data => { data.score = 1.5; },
        data => { data.selectedBall = {r: -1, c: 0}; },
        data => {
            data.cells = Array.from({length: 8}, (_, r) => Array.from({length: 8}, (_, c) => (r * 2 + c) % 5));
        },
        data => {
            data.cells = Array.from({length: 8}, () => Array(8).fill(null));
            data.cells[0].fill(0, 0, 5);
        }
    ];
    for (const corrupt of corruptions) {
        const snapshot = structuredClone(valid);
        corrupt(snapshot);
        assert.equal(GameA.fromSnapshot(snapshot), null);
    }
});

test('session storage round trips, clears, and rejects corrupt or unsupported formats', () => {
    const storage = createMemoryStorage();
    const store = new GameSessionStore(() => storage);
    const data = {game: new GameA().toSnapshot(), startingHighScore: 100, combo: 0, message: '請選球'};
    assert.equal(store.save(data), true);
    const result = store.read();
    assert.equal(result.version, 1);
    assert.equal(result.mode, 'A');
    assert.deepEqual(result.game, data.game);
    for (const invalid of ['broken json', 'null', JSON.stringify({...result, version: 99}),
        JSON.stringify({...result, mode: 'B'}), JSON.stringify({...result, combo: -1}),
        JSON.stringify({...result, startingHighScore: -1})]) {
        storage.setItem(GAME_SESSION_KEY, invalid);
        assert.equal(store.read(), null);
        assert.equal(storage.getItem(GAME_SESSION_KEY), null);
    }
    store.save(data);
    assert.equal(store.clear(), true);
    assert.equal(store.read(), null);
});

test('refresh restores the exact game and synchronizes size/batch settings, selected ball, combo and message', async () => {
    const storage = createMemoryStorage();
    const app = createApp({size: 9, batch: 4, storage});
    app.emptyBoard();
    app.controller.game.board.cells[2][2] = 4;
    app.controller.game.board.cells[3][3] = 1;
    app.controller.game.score = 18;
    app.controller.combo = 2;
    app.view.render(app.controller.game.board, null);
    await app.click(2, 2);
    const before = saved(storage);
    const reloaded = createApp({storage});
    assert.deepEqual(reloaded.controller.game.toSnapshot(), before.game);
    assert.equal(countBalls(reloaded), 2, 'Restore must not spawn initial balls again');
    assert.equal(reloaded.elements.boardSizeSelect.value, '9');
    assert.equal(reloaded.elements.queueSizeSelect.value, '4');
    assert.equal(reloaded.elements.gameBoard.children.length, 81);
    assert.equal(reloaded.elements.currentScore.textContent, '18');
    assert.equal(reloaded.elements.comboBadge.textContent, 'COMBO x2!');
    assert.equal(reloaded.elements.moveHint.textContent, before.message);
    assert.equal(reloaded.view.getCell(2, 2).classList.contains('selected'), true);
    await reloaded.click(2, 2);
    assert.equal(createApp({storage}).controller.game.selectedBall, null);
});

test('a completed move restores the same preview and ball positions without replaying the spawn', async () => {
    const storage = createMemoryStorage();
    const app = createApp({storage});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 4;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    await app.click(0, 1);
    const before = app.controller.game.toSnapshot();
    assert.equal(countBalls(app), 4);
    const reloaded = createApp({storage});
    assert.deepEqual(reloaded.controller.game.toSnapshot(), before);
    assert.equal(countBalls(reloaded), 4);
});

test('refresh during movement restores the already committed clear/score instead of losing or rerolling the turn', async () => {
    const storage = createMemoryStorage();
    const app = createApp({storage, reducedMotion: false, deferAnimation: true});
    setupLine(app);
    await app.click(1, 4);
    const turn = app.click(0, 4);
    assert.equal(app.controller.processing, true);
    const before = app.controller.game.toSnapshot();
    assert.equal(before.score, 5);
    const reloaded = createApp({storage});
    assert.deepEqual(reloaded.controller.game.toSnapshot(), before);
    assert.equal(reloaded.elements.currentScore.textContent, '5');
    assert.equal(countBalls(reloaded), 3);
    app.animations[0].resolve();
    await turn;
    assert.deepEqual(saved(storage).game, before);
});

test('refresh during the clearing animation restores the settled board with score applied once', async () => {
    const storage = createMemoryStorage();
    const app = createApp({storage, reducedMotion: false, deferWait: true});
    setupLine(app);
    await app.click(1, 4);
    const turn = app.click(0, 4);
    await flushUntil(() => app.waits.length === 1);
    app.waits.shift()();
    await flushUntil(() => app.waits.length === 1);
    const reloaded = createApp({storage});
    assert.equal(reloaded.controller.game.score, 5);
    assert.equal(countBalls(reloaded), 3);
    assert.equal(reloaded.controller.game.board.cells[0][4], null);
    app.waits.shift()();
    await turn;
    assert.equal(saved(storage).game.score, 5);
    assert.deepEqual(app.errors, []);
});

test('restart replaces the previous save and preserves the independent high score', async () => {
    const storage = createMemoryStorage({[HIGH_SCORE_KEY]: '250'});
    const app = createApp({storage});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 0;
    app.controller.game.score = 20;
    app.controller.combo = 2;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    const before = saved(storage);
    app.elements.restartBtn.listeners.click();
    const after = saved(storage);
    assert.notDeepEqual(after.game, before.game);
    assert.equal(after.game.score, 0);
    assert.equal(after.game.selectedBall, null);
    assert.equal(after.combo, 0);
    assert.equal(countBalls(app), 3);
    assert.equal(storage.getItem(HIGH_SCORE_KEY), '250');
    assert.deepEqual(createApp({storage}).controller.game.toSnapshot(), after.game);
});

test('changing either setting during an animation starts and saves a new game that the old turn cannot overwrite', async () => {
    for (const [id, value, expectedSize, expectedCount] of [
        ['boardSizeSelect', '10', 10, 3], ['queueSizeSelect', '5', 8, 5]
    ]) {
        const storage = createMemoryStorage();
        const app = createApp({storage, reducedMotion: false, deferAnimation: true});
        app.emptyBoard();
        app.controller.game.board.cells[0][0] = 4;
        app.view.render(app.controller.game.board, null);
        await app.click(0, 0);
        const turn = app.click(0, 1);
        app.elements[id].value = value;
        app.elements[id].listeners.change();
        const fresh = saved(storage);
        await turn;
        assert.equal(app.controller.game.board.size, expectedSize);
        assert.equal(countBalls(app), expectedCount);
        assert.equal(app.controller.game.score, 0);
        assert.equal(app.controller.game.selectedBall, null);
        assert.equal(app.controller.processing, false);
        assert.deepEqual(saved(storage), fresh);
        assert.deepEqual(createApp({storage}).controller.game.toSnapshot(), fresh.game);
        assert.deepEqual(app.errors, []);
    }
});

test('game-over clears the previous save; a later refresh starts a new game without restoring failure', async () => {
    const storage = createMemoryStorage({[HIGH_SCORE_KEY]: '250'});
    const app = createApp({storage});
    const game = app.controller.game;
    game.board.cells = Array.from({length: 8}, (_, r) => Array.from({length: 8}, (_, c) => (r * 2 + c) % 5));
    game.board.cells[7][7] = null;
    game.preview = [1, 2, 3];
    app.view.render(game.board, null);
    await app.click(7, 6);
    await app.click(7, 7);
    assert.equal(game.isOver, true);
    assert.equal(storage.getItem(GAME_SESSION_KEY), null);
    assert.equal(app.elements.gameOverModal.inert, false);
    const reloaded = createApp({storage});
    assert.equal(reloaded.controller.game.isOver, false);
    assert.equal(countBalls(reloaded), 3);
    assert.equal(reloaded.elements.currentScore.textContent, '0');
    assert.equal(reloaded.elements.gameOverModal.inert, true);
    assert.equal(storage.getItem(HIGH_SCORE_KEY), '250');
});

test('malformed game data falls back to a fresh, valid save instead of breaking startup', () => {
    const storage = createMemoryStorage();
    createApp({storage});
    const invalid = saved(storage);
    invalid.game.cells[0][0] = 999;
    storage.setItem(GAME_SESSION_KEY, JSON.stringify(invalid));
    const app = createApp({storage});
    assert.equal(countBalls(app), 3);
    assert.ok(GameA.fromSnapshot(saved(storage).game));
    assert.deepEqual(app.errors, []);
});

test('separate browser/device stores do not share game progress', () => {
    const first = createApp({size: 9, batch: 4});
    const second = createApp();
    assert.equal(first.controller.game.board.size, 9);
    assert.equal(second.controller.game.board.size, 8);
    assert.equal(second.controller.game.batchSize, 3);
});

test('blocked browser storage remains playable and reports that progress cannot be saved', async () => {
    const storage = {
        getItem() { throw new Error('Storage denied'); },
        setItem() { throw new Error('Storage denied'); },
        removeItem() { throw new Error('Storage denied'); }
    };
    const app = createApp({storage});
    assert.match(app.elements.moveHint.textContent, /無法儲存進度/);
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 0;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    await app.click(0, 1);
    assert.equal(countBalls(app), 4);
    assert.match(app.elements.moveHint.textContent, /無法儲存進度/);
    assert.deepEqual(app.errors, []);
    const store = new GameSessionStore(() => storage);
    assert.equal(store.read(), null);
    assert.equal(store.save({game: {}, startingHighScore: 100, combo: 0, message: ''}), false);
    assert.equal(store.clear(), false);
});
