import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GAME_SESSION_KEY, LANGUAGE_KEY} from '../src/config.js';
import {MESSAGES} from '../src/i18n/messages.js';
import {I18n} from '../src/i18n/translator.js';
import {createApp, createMemoryStorage, html} from './helpers/fake-dom.js';

function changeLanguage(app, language) {
    app.elements.languageSelect.value = language;
    app.elements.languageSelect.listeners.change();
}

test('both language catalogs cover every HTML translation and have matching placeholders', () => {
    assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES['zh-TW']).sort());
    for (const key of Object.keys(MESSAGES.en)) {
        const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
        assert.deepEqual(placeholders(MESSAGES.en[key]), placeholders(MESSAGES['zh-TW'][key]), key);
    }
    for (const [, key] of html.matchAll(/data-i18n(?:-aria-label|-content)?="([^"]+)"/g)) {
        assert.equal(typeof MESSAGES.en[key], 'string', key);
        assert.equal(typeof MESSAGES['zh-TW'][key], 'string', key);
    }
});

test('saved language overrides the browser default, invalid choices are ignored, and formatting uses parameters', () => {
    const storage = createMemoryStorage({[LANGUAGE_KEY]: 'en'});
    const i18n = new I18n({getStorage: () => storage, language: 'zh-TW'});
    assert.equal(i18n.language, 'en');
    assert.equal(i18n.t('hint.spawned', {count: 5}), 'Added 5 beans. Select a bean to keep playing.');
    assert.equal(i18n.setLanguage('de'), false);
    assert.equal(i18n.setLanguage('toString'), false);
    assert.equal(i18n.language, 'en');
    assert.equal(i18n.setLanguage('zh-TW'), true);
    assert.equal(storage.getItem(LANGUAGE_KEY), 'zh-TW');
    storage.setItem(LANGUAGE_KEY, 'unknown');
    assert.equal(new I18n({getStorage: () => storage, language: 'en'}).language, 'en');
});

test('English startup translates the title, controls, metadata, board accessibility and preview', () => {
    const app = createApp({language: 'en'});
    assert.equal(app.document.title, "Nini's Bean Battle");
    assert.equal(app.document.documentElement.lang, 'en');
    assert.equal(app.elements.gameTitle.textContent, "Nini's Bean Battle");
    assert.equal(app.elements.restartBtn.textContent, 'Restart game');
    assert.equal(app.elements.modalRestartBtn.textContent, 'Play again');
    assert.equal(app.elements.queueLabel.textContent, 'Next turn:');
    assert.equal(app.elements.gameBoard.attributes['aria-label'], 'Game A board');
    assert.match(app.elements.moveHint.textContent, /Each move adds 3 new beans/);
    assert.match(app.view.getCell(0, 0).attributes['aria-label'], /^Row 1, column 1, /);
    assert.match(app.elements.ballQueuePreview.children[0].attributes['aria-label'], /^Bean 1: /);
    for (const element of app.document.querySelectorAll('[data-i18n-content]')) {
        assert.doesNotMatch(element.getAttribute('content'), /\p{Script=Han}/u);
    }
});

test('switching languages preserves the same game, score, settings, selection, preview, and board DOM', async () => {
    const app = createApp({size: 9, batch: 4});
    app.emptyBoard();
    app.controller.game.board.cells[2][2] = 4;
    app.controller.game.score = 18;
    app.controller.renderGame();
    await app.click(2, 2);
    const game = app.controller.game;
    const before = game.toSnapshot();
    const version = app.controller.version;
    const cell = app.view.getCell(2, 2);
    changeLanguage(app, 'en');
    assert.equal(app.controller.game, game);
    assert.equal(app.controller.version, version);
    assert.deepEqual(game.toSnapshot(), before);
    assert.equal(app.view.getCell(2, 2), cell);
    assert.equal(cell.classList.contains('selected'), true);
    assert.match(cell.attributes['aria-label'], /purple bean/);
    assert.equal(app.elements.boardSizeSelect.value, '9');
    assert.equal(app.elements.queueSizeSelect.value, '4');
    assert.equal(app.elements.currentScore.textContent, '18');
    assert.match(app.elements.moveHint.textContent, /^Bean selected/);
    assert.deepEqual(JSON.parse(app.storage.getItem(GAME_SESSION_KEY)).game, before);
    changeLanguage(app, 'zh-TW');
    assert.deepEqual(game.toSnapshot(), before);
    assert.match(app.elements.moveHint.textContent, /^已選取球/);
    assert.match(cell.attributes['aria-label'], /紫色球/);
});

test('English preference and the translated selected-state save survive refresh and restart', async () => {
    const storage = createMemoryStorage();
    const app = createApp({storage});
    app.emptyBoard();
    app.controller.game.board.cells[1][1] = 0;
    app.view.render(app.controller.game.board, null);
    await app.click(1, 1);
    changeLanguage(app, 'en');
    const before = app.controller.game.toSnapshot();
    const reloaded = createApp({storage});
    assert.equal(reloaded.i18n.language, 'en');
    assert.deepEqual(reloaded.controller.game.toSnapshot(), before);
    assert.match(reloaded.elements.moveHint.textContent, /^Bean selected/);
    reloaded.elements.restartBtn.listeners.click();
    assert.equal(reloaded.i18n.language, 'en');
    assert.match(reloaded.elements.moveHint.textContent, /Select a bean/);
    assert.equal(storage.getItem(LANGUAGE_KEY), 'en');
});

test('English selection and blocked-path hints are translated without consuming a turn', async () => {
    const app = createApp({language: 'en'});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 0;
    app.controller.game.board.cells[0][1] = 1;
    app.controller.game.board.cells[1][0] = 2;
    app.view.render(app.controller.game.board, null);
    await app.click(1, 1);
    assert.equal(app.elements.moveHint.textContent, 'Select a bean on the board first.');
    await app.click(0, 0);
    const before = app.controller.game.toSnapshot();
    await app.click(1, 1);
    assert.match(app.elements.moveHint.textContent, /^No path/);
    assert.deepEqual(app.controller.game.toSnapshot(), before);
    changeLanguage(app, 'zh-TW');
    assert.match(app.elements.moveHint.textContent, /^無法到達/);
});

test('English clear and score feedback can be switched back to Chinese after the turn', async () => {
    const app = createApp({language: 'en'});
    app.emptyBoard();
    for (let c = 0; c < 4; c++) app.controller.game.board.cells[0][c] = 0;
    app.controller.game.board.cells[1][4] = 0;
    app.controller.game.preview = [1, 2, 3];
    app.view.render(app.controller.game.board, null);
    await app.click(1, 4);
    await app.click(0, 4);
    assert.equal(app.controller.game.score, 5);
    assert.equal(app.elements.moveHint.textContent, 'Cleared 5 beans × 1 = 5 points.');
    changeLanguage(app, 'zh-TW');
    assert.equal(app.elements.moveHint.textContent, '消除 5 顆 × 1 條連線，獲得 5 分');
});

test('changing language during movement keeps the animation and committed turn intact', async () => {
    const app = createApp({reducedMotion: false, deferAnimation: true});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 4;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    const turn = app.click(0, 1);
    const before = app.controller.game.toSnapshot();
    const animation = app.animations[0];
    const source = app.view.getCell(0, 0);
    changeLanguage(app, 'en');
    assert.equal(app.controller.processing, true);
    assert.equal(app.animator.activeAnimation, animation);
    assert.equal(app.view.getCell(0, 0), source);
    assert.match(source.attributes['aria-label'], /purple bean/);
    assert.match(app.elements.moveHint.textContent, /^Moving along/);
    assert.deepEqual(app.controller.game.toSnapshot(), before);
    animation.resolve();
    await turn;
    assert.deepEqual(app.controller.game.toSnapshot(), before);
    assert.equal(app.controller.processing, false);
    assert.match(app.elements.moveHint.textContent, /^Added 3 beans/);
    assert.match(app.view.getCell(0, 1).attributes['aria-label'], /purple bean/);
    assert.deepEqual(app.errors, []);
});

test('Chinese-only legacy saves are restored in English without discarding progress', async () => {
    const storage = createMemoryStorage();
    const app = createApp({storage});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 4;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    await app.click(0, 1);
    const legacy = JSON.parse(storage.getItem(GAME_SESSION_KEY));
    delete legacy.status;
    storage.setItem(GAME_SESSION_KEY, JSON.stringify(legacy));
    storage.setItem(LANGUAGE_KEY, 'en');
    const reloaded = createApp({storage});
    assert.deepEqual(reloaded.controller.game.toSnapshot(), legacy.game);
    assert.match(reloaded.elements.moveHint.textContent, /^Added 3 beans/);
    assert.equal(JSON.parse(storage.getItem(GAME_SESSION_KEY)).status.code, 'spawned');
});

test('unknown or invalid saved status metadata falls back without losing a valid game', () => {
    const storage = createMemoryStorage();
    const app = createApp({storage});
    const saved = JSON.parse(storage.getItem(GAME_SESSION_KEY));
    saved.message = 'toString';
    saved.status = {code: 'cleared', params: {balls: -1, lines: 1, points: 5}};
    storage.setItem(GAME_SESSION_KEY, JSON.stringify(saved));
    const reloaded = createApp({storage, language: 'en'});
    assert.deepEqual(reloaded.controller.game.toSnapshot(), saved.game);
    assert.equal(reloaded.controller.status.code, 'default');
    assert.match(reloaded.elements.moveHint.textContent, /Each move adds 3 new beans/);
});

test('game-over and new-record dialogs, crown text, and buttons use the chosen language', () => {
    const app = createApp({language: 'en'});
    app.ui.renderScores(120, 120, 100);
    app.ui.showGameOver(120, 100);
    assert.equal(app.elements.modalTitle.textContent, '🏆 A new king!');
    assert.match(app.elements.modalMessage.textContent, /new high score of 120/);
    assert.match(app.elements.kingStatusText.textContent, /claimed the crown/);
    changeLanguage(app, 'zh-TW');
    assert.equal(app.elements.modalTitle.textContent, '🏆 恭迎新國王！');
    assert.match(app.elements.modalMessage.textContent, /120 分/);
    app.ui.showGameOver(15, 100);
    changeLanguage(app, 'en');
    assert.equal(app.elements.modalTitle.textContent, 'Game over');
    assert.equal(app.elements.modalMessage.textContent, 'The board is full! Final score: 15');
    assert.equal(app.elements.modalRestartBtn.textContent, 'Play again');
});

test('language switching still works with blocked storage and translates the save-failure message', () => {
    const storage = {
        getItem() { throw new Error('Storage denied'); },
        setItem() { throw new Error('Storage denied'); },
        removeItem() { throw new Error('Storage denied'); }
    };
    const app = createApp({storage});
    const before = app.controller.game.toSnapshot();
    changeLanguage(app, 'en');
    assert.equal(app.document.title, "Nini's Bean Battle");
    assert.match(app.elements.moveHint.textContent, /Progress cannot be saved in this browser/);
    assert.deepEqual(app.controller.game.toSnapshot(), before);
    assert.deepEqual(app.errors, []);
});
