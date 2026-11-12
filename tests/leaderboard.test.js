import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LeaderboardService, validateScore} from '../src/services/leaderboard.js';
import {LeaderboardUI} from '../src/ui/leaderboard-ui.js';
import {RankingsController} from '../src/game/rankings-controller.js';
import {createApp, createMemoryStorage} from './helpers/fake-dom.js';

const config = {url: 'https://example.supabase.co', publishableKey: 'sb_publishable_example'};
const entry = {id: '00000000-0000-4000-8000-000000000001', name: '妮妮', comment: '好玩！', score: 250, boardSize: 8, batchSize: 3};
const response = data => ({ok: true, json: async () => data});
function serviceFixture(options = {}) {
    const storage = options.storage ?? createMemoryStorage();
    const calls = [];
    const service = new LeaderboardService({getStorage: () => storage, config, fetch: async (url, init) => {
        calls.push({url, init});
        return response(url.endsWith('submit_score') ? {rank: 1} : {entries: [entry]});
    }, ...options});
    return {service, storage, calls};
}
function rankedApp(service, options = {}) {
    return createApp({...options, rankingsFactory: ({document, i18n}) => new RankingsController({
        service, view: new LeaderboardUI(document, i18n), createId: () => entry.id
    })});
}

test('server leaderboard replaces the king target and local game points never replace the published king', async () => {
    const {service} = serviceFixture();
    const app = rankedApp(service);
    assert.equal(app.elements.gameBoard.children.length, 64);
    assert.equal(app.elements.highScoreDisplay.textContent, '—');
    await app.rankings.refresh();
    assert.equal(app.elements.highScoreDisplay.textContent, '250');
    assert.equal(app.elements.kingName.textContent, '妮妮');
    app.controller.game.score = 900;
    app.controller.updateHighScore();
    app.controller.renderScorePanels();
    assert.equal(app.elements.highScoreDisplay.textContent, '250');
    assert.equal(app.elements.currentScore.textContent, '900');
});

test('successful submissions return server rank, use public-key headers, and leave no pending duplicate', async () => {
    const {service, calls} = serviceFixture();
    assert.deepEqual(await service.submit(entry), {rank: 1, queued: false});
    assert.equal(service.pending.length, 0);
    assert.equal(service.playerName, entry.name);
    assert.equal(service.topScore, 250);
    assert.equal(calls[0].init.headers.apikey, config.publishableKey);
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.equal(JSON.parse(calls[0].init.body).p_id, entry.id);
});

test('offline scores persist across reload and retry with the same id exactly once', async () => {
    const storage = createMemoryStorage();
    const {service} = serviceFixture({storage, fetch: async () => { throw new Error('Offline'); }});
    assert.deepEqual(await service.submit(entry), {rank: null, queued: true, persisted: true});
    const restored = serviceFixture({storage});
    assert.equal(restored.service.pending.length, 1);
    await restored.service.flush();
    await restored.service.flush();
    assert.equal(restored.calls.length, 1);
    assert.equal(JSON.parse(restored.calls[0].init.body).p_id, entry.id);
    assert.equal(restored.service.pending.length, 0);
    assert.equal(serviceFixture({storage}).service.pending.length, 0);
});

test('a missing backend never invents global ranks and clearly keeps scores pending', async () => {
    const {service, calls} = serviceFixture({config: {url: '', publishableKey: ''}});
    await service.load();
    assert.equal(service.state, 'setup');
    assert.equal(service.known, false);
    assert.equal(service.topScore, 0);
    const result = await service.submit(entry);
    assert.equal(result.rank, null);
    assert.equal(result.queued, true);
    assert.equal(calls.length, 0);
});

test('offline and invalid responses preserve the last downloaded leaderboard for this difficulty', async () => {
    const initial = serviceFixture();
    await initial.service.load();
    for (const fetch of [async () => { throw new Error('Offline'); }, async () => response({entries: [{score: -1}]})]) {
        const {service} = serviceFixture({storage: initial.storage, fetch});
        await service.load();
        assert.equal(service.state, 'offline');
        assert.equal(service.known, true);
        assert.equal(service.topScore, 250);
    }
});

test('all nine difficulties request and restore independent rankings, including empty boards', async () => {
    const storage = createMemoryStorage();
    storage.setItem('nini_doudou_rankings_v1', JSON.stringify({version: 1, entries: [entry]}));
    const calls = [];
    const {service} = serviceFixture({storage, fetch: async (url, init) => {
        const {p_board_size: boardSize, p_batch_size: batchSize, p_limit} = JSON.parse(init.body);
        calls.push([boardSize, batchSize, p_limit]);
        return response({entries: batchSize === 5 ? [] : [{...entry, boardSize, batchSize, score: boardSize * 10 + batchSize}]});
    }});
    assert.equal(service.known, false, 'the old mixed snapshot is not reused');
    for (const size of [8, 9, 10]) for (const batch of [3, 4, 5]) {
        service.selectDifficulty(size, batch);
        assert.equal(service.known, false);
        assert.equal(service.topScore, 0);
        await service.load();
        assert.equal(service.known, true);
        assert.equal(service.topScore, batch === 5 ? 0 : size * 10 + batch);
    }
    assert.equal(calls.length, 9);
    assert.deepEqual(calls[8], [10, 5, 50]);
    const restored = serviceFixture({storage, fetch: async () => { throw new Error('Offline'); }}).service;
    for (const size of [8, 9, 10]) for (const batch of [3, 4, 5]) {
        restored.selectDifficulty(size, batch);
        await restored.load();
        assert.equal(restored.state, 'offline');
        assert.equal(restored.known, true);
        assert.equal(restored.topScore, batch === 5 ? 0 : size * 10 + batch);
    }
});

test('late responses cannot overwrite another difficulty or a newer response for the same difficulty', async () => {
    const requests = [];
    const {service} = serviceFixture({fetch: (url, init) => new Promise(resolve => requests.push({resolve, body: JSON.parse(init.body)}))});
    const old = service.load();
    service.selectDifficulty(10, 4);
    const current = service.load();
    requests[1].resolve(response({entries: [{...entry, score: 100, boardSize: 10, batchSize: 4}]}));
    await current;
    requests[0].resolve(response({entries: [entry]}));
    await old;
    assert.equal(service.topScore, 100);
    assert.equal(service.state, 'ready');
    const earlier = service.load();
    const newer = service.load();
    requests[3].resolve(response({entries: []}));
    await newer;
    requests[2].resolve(response({entries: [{...entry, boardSize: 10, batchSize: 4}]}));
    await earlier;
    assert.equal(service.known, true);
    assert.deepEqual(service.entries, []);
});

test('mixed server results and wrongly labelled caches never become the selected king', async () => {
    const storage = createMemoryStorage();
    storage.setItem('nini_doudou_rankings_v2_10_3', JSON.stringify({version: 2, entries: [entry]}));
    const {service} = serviceFixture({storage});
    service.selectDifficulty(10, 3);
    await service.load();
    assert.equal(service.known, false);
    assert.equal(service.topName, '');
    assert.equal(service.state, 'offline');
});

test('changing either game setting immediately switches the king and scoped bilingual ranking label', async () => {
    const requests = [];
    const {service} = serviceFixture({fetch: (url, init) => new Promise(resolve => requests.push({resolve, body: JSON.parse(init.body)}))});
    const app = rankedApp(service);
    const first = app.rankings.refresh();
    await new Promise(setImmediate);
    requests[0].resolve(response({entries: [entry]}));
    await first;
    assert.equal(app.elements.highScoreDisplay.textContent, '250');
    app.elements.boardSizeSelect.value = '10';
    app.elements.boardSizeSelect.listeners.change();
    assert.equal(app.elements.highScoreDisplay.textContent, '—');
    assert.match(app.elements.leaderboardDifficulty.textContent, /10 × 10.*3/);
    const second = app.rankings.refresh();
    await new Promise(setImmediate);
    app.elements.queueSizeSelect.value = '5';
    app.elements.queueSizeSelect.listeners.change();
    const third = app.rankings.refresh();
    await new Promise(setImmediate);
    requests[2].resolve(response({entries: [{...entry, boardSize: 10, batchSize: 5, score: 15}]}));
    await third;
    requests[1].resolve(response({entries: [{...entry, boardSize: 10, score: 259}]}));
    await second;
    assert.equal(app.elements.highScoreDisplay.textContent, '15');
    const game = app.controller.game;
    app.elements.languageSelect.value = 'en';
    app.elements.languageSelect.listeners.change();
    assert.match(app.elements.leaderboardDifficulty.textContent, /10 × 10 board · 5 beans per turn/);
    assert.equal(app.controller.game, game);
});

test('a restored game reads the saved difficulty before downloading its ranking', async () => {
    const saved = createApp({size: 10, batch: 4});
    const calls = [];
    const {service} = serviceFixture({fetch: async (url, init) => {
        calls.push(JSON.parse(init.body));
        return response({entries: []});
    }});
    const app = rankedApp(service, {storage: saved.storage});
    await app.rankings.refresh();
    assert.deepEqual(calls, [{p_board_size: 10, p_batch_size: 4, p_limit: 50}]);
    assert.equal(service.known, true);
    assert.equal(app.elements.highScoreDisplay.textContent, '0');
});

test('offline scores keep their original difficulty while concurrent refreshes share one flush', async () => {
    const storage = createMemoryStorage();
    const offline = serviceFixture({storage, fetch: async () => { throw new Error('Offline'); }}).service;
    await offline.submit(entry);
    await offline.submit({...entry, id: '00000000-0000-4000-8000-000000000002', boardSize: 10, batchSize: 5});
    const calls = [];
    const {service} = serviceFixture({storage, fetch: async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({url, body});
        return response(url.endsWith('submit_score') ? {rank: body.p_batch_size === 5 ? 2 : 1} : {entries: []});
    }});
    service.selectDifficulty(9, 4);
    const [sent, shared] = await Promise.all([service.flush(), service.flush()]);
    await service.load();
    assert.deepEqual(shared, sent);
    assert.deepEqual(sent.map(item => item.rank), [1, 2]);
    assert.deepEqual(calls.slice(0, 2).map(call => [call.body.p_board_size, call.body.p_batch_size]), [[8, 3], [10, 5]]);
    assert.deepEqual(calls[2].body, {p_board_size: 9, p_batch_size: 4, p_limit: 50});
    assert.equal(service.pending.length, 0);
    assert.deepEqual(service.entries, []);
});

test('a stalled response body is bounded by the request timeout', async () => {
    const {service} = serviceFixture({timeout: 10, fetch: async () => ({ok: true, json: () => new Promise(() => {})})});
    await service.load();
    assert.equal(service.state, 'offline');
});

test('validation rejects invalid names, scores, settings, control characters and oversized comments', async () => {
    for (const patch of [{name: ''}, {name: 'x'.repeat(25)}, {name: 'x\ny'}, {comment: 'x'.repeat(161)},
        {score: -1}, {score: 10000001}, {score: 1.5}, {boardSize: 11}, {batchSize: 6}, {id: 'x'}]) {
        assert.equal(validateScore({...entry, ...patch}), false);
    }
    assert.equal(validateScore({...entry, name: '🟢'.repeat(24)}), true);
    const {service, calls} = serviceFixture();
    await assert.rejects(service.submit({...entry, name: ''}), /invalid/);
    assert.equal(calls.length, 0);
});

test('storage failure is not presented as a safely queued score', async () => {
    const storage = {getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Denied'); }};
    const {service} = serviceFixture({getStorage: () => storage, fetch: async () => { throw new Error('Offline'); }});
    const result = await service.submit(entry);
    assert.equal(result.queued, true);
    assert.equal(result.persisted, false);
});

test('glass leaderboard renders tied ranks and untrusted names/comments as text', async () => {
    const {service} = serviceFixture();
    service.entries = [entry, {...entry, id: '00000000-0000-4000-8000-000000000002', name: '<img src=x onerror=alert(1)>'.slice(0, 24), comment: '<script>alert(1)</script>'},
        {...entry, id: '00000000-0000-4000-8000-000000000003', score: 100}];
    service.known = true;
    service.state = 'ready';
    const app = rankedApp(service);
    const rows = app.elements.leaderboardRows.children;
    assert.deepEqual(rows.map(row => row.children[0].textContent), ['1', '1', '3']);
    assert.equal(rows[1].children[3].textContent, '<script>alert(1)</script>');
    assert.equal(rows[1].children[3].children.length, 0);
    app.rankings.view.open();
    assert.equal(app.elements.leaderboardModal.inert, false);
    assert.equal(app.document.activeElement, app.elements.leaderboardClose);
    app.elements.leaderboardModal.listeners.keydown({key: 'Escape', preventDefault() {}});
    assert.equal(app.elements.leaderboardModal.inert, true);
});

test('refreshing rankings during movement updates only the score panels and preserves the animation', async () => {
    const {service} = serviceFixture();
    const app = rankedApp(service, {reducedMotion: false, deferAnimation: true});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 0;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    const turn = app.click(0, 1);
    const cell = app.view.getCell(0, 0);
    await app.rankings.refresh();
    assert.equal(app.view.getCell(0, 0), cell);
    assert.equal(app.controller.processing, true);
    app.animations[0].resolve();
    await turn;
    assert.deepEqual(app.errors, []);
});

test('end-of-game entry preserves names and comments through language changes and shows the actual rank', async () => {
    const {service} = serviceFixture();
    const app = rankedApp(service);
    app.controller.game.isOver = true;
    app.controller.game.score = 250;
    app.controller.renderGame();
    app.elements.playerName.value = entry.name;
    app.elements.playerComment.value = entry.comment;
    app.elements.languageSelect.value = 'en';
    app.elements.languageSelect.listeners.change();
    assert.equal(app.elements.playerName.value, entry.name);
    assert.equal(app.elements.playerComment.value, entry.comment);
    await app.rankings.submit({name: entry.name, comment: entry.comment});
    assert.match(app.elements.submissionState.textContent, /current rank is 1/);
    assert.equal(app.elements.submitScoreBtn.disabled, true);
    assert.equal(app.elements.highScoreDisplay.textContent, '250');
});

test('a previous game submission cannot replace the next game form', async () => {
    let finish;
    const {service} = serviceFixture({fetch: (url) => url.endsWith('submit_score')
        ? new Promise(resolve => { finish = () => resolve(response({rank: 2})); }) : Promise.resolve(response({entries: [entry]}))});
    const app = rankedApp(service);
    app.controller.game.isOver = true;
    app.controller.renderGame();
    const submitting = app.rankings.submit({name: entry.name, comment: entry.comment});
    app.elements.restartBtn.listeners.click();
    finish();
    await submitting;
    assert.match(app.elements.submissionState.textContent, /留下名稱/);
    assert.equal(app.elements.submitScoreBtn.disabled, false);
    assert.equal(app.controller.game.isOver, false);
});

test('reconnecting submits the queued completed game and replaces its pending message with a rank', async () => {
    let online = false;
    const {service} = serviceFixture({fetch: async url => {
        if (!online) throw new Error('Offline');
        return response(url.endsWith('submit_score') ? {rank: 1} : {entries: [entry]});
    }});
    const app = rankedApp(service);
    app.controller.game.isOver = true;
    app.controller.game.score = 250;
    app.controller.renderGame();
    await app.rankings.submit({name: entry.name, comment: entry.comment});
    assert.match(app.elements.submissionState.textContent, /已暫存/);
    online = true;
    await app.rankings.refresh();
    assert.equal(service.pending.length, 0);
    assert.match(app.elements.submissionState.textContent, /第 1 名/);
});

test('a full outbox rejects a new result without dropping previously retained scores', async () => {
    const {service} = serviceFixture({config: {url: '', publishableKey: ''}});
    for (let i = 1; i <= 20; i++) {
        await service.submit({...entry, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`});
    }
    await assert.rejects(service.submit({...entry, id: '00000000-0000-4000-8000-000000000021'}), /queue-full/);
    assert.equal(service.pending.length, 20);
});

test('corrupt leaderboard snapshots and outboxes cannot prevent game startup', () => {
    const storage = createMemoryStorage();
    const corrupt = {...entry, id: {toString: null}};
    storage.setItem('nini_doudou_rankings_v1', JSON.stringify({version: 1, entries: [corrupt]}));
    storage.setItem('nini_doudou_pending_scores_v1', JSON.stringify([corrupt]));
    const {service} = serviceFixture({storage});
    const app = rankedApp(service);
    assert.equal(app.elements.gameBoard.children.length, 64);
    assert.equal(service.pending.length, 0);
    assert.equal(service.known, false);
});
