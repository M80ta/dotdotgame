import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Board} from '../src/board/board.js';
import {LINE_DIRECTIONS, GAME_SESSION_KEY} from '../src/config.js';
import {findSuggestedMove} from '../src/game/hints.js';
import {findCompletedLines} from '../src/game/lines.js';
import {createApp} from './helpers/fake-dom.js';

function clearingBoard(size = 8) {
    const board = new Board(size);
    for (let c = 0; c < 4; c++) board.cells[0][c] = 0;
    board.cells[1][4] = 0;
    return board;
}

function applySuggestion(board, hint) {
    assert.ok(hint);
    assert.equal(board.cells[hint.source.r][hint.source.c], hint.color);
    assert.equal(board.cells[hint.target.r][hint.target.c], null);
    assert.deepEqual(hint.path, board.findShortestPath(hint.source, hint.target));
    const result = new Board(board.size);
    result.cells = board.cells.map(row => [...row]);
    result.move(hint.source, hint.target);
    return findCompletedLines(result);
}

function prepareApp(options = {}) {
    const app = createApp(options);
    app.controller.game.board.cells = clearingBoard(app.controller.game.board.size).cells;
    app.controller.game.preview = [1, 2, 3];
    app.controller.game.score = 17;
    app.controller.renderGame();
    app.controller.persistSession();
    return app;
}

test('hints prefer immediate clears in all four directions without changing the board', () => {
    for (const [dr, dc] of LINE_DIRECTIONS) {
        const board = new Board(8);
        const start = {r: 1, c: dc < 0 ? 5 : 1};
        for (let step = 0; step < 4; step++) board.cells[start.r + step * dr][start.c + step * dc] = 0;
        board.cells[7][7] = 0;
        const before = structuredClone(board.cells);
        const hint = findSuggestedMove(board);
        const lines = applySuggestion(board, hint);
        assert.ok(lines.cells.size >= 5);
        assert.equal(hint.points, lines.cells.size * lines.lineCount);
        assert.deepEqual(board.cells, before);
    }
});

test('simultaneous clears take priority over a simpler five-bean clear', () => {
    const board = new Board(10);
    for (let step = 5; step <= 8; step++) {
        board.cells[4][step] = 0;
        board.cells[step][4] = 0;
    }
    board.cells[9][9] = 0;
    for (let c = 0; c < 4; c++) board.cells[0][c] = 1;
    board.cells[1][4] = 1;
    const hint = findSuggestedMove(board);
    assert.equal(hint.points, 18);
    assert.deepEqual(hint.source, {r: 9, c: 9});
    assert.deepEqual(hint.target, {r: 4, c: 4});
    assert.equal(applySuggestion(board, hint).lineCount, 2);
});

test('an unreachable clearing move is rejected in favor of a reachable fallback', () => {
    const board = new Board(8);
    for (let c = 1; c <= 4; c++) board.cells[3][c] = 0;
    board.cells[7][7] = 0;
    board.cells[6][7] = 1;
    board.cells[7][6] = 2;
    const hint = findSuggestedMove(board);
    assert.equal(hint.points, 0);
    assert.equal(applySuggestion(board, hint).cells.size, 0);
    assert.notDeepEqual(hint.source, {r: 7, c: 7});
});

test('fallback moves are legal for every board size and cannot double-count the source bean', () => {
    for (const size of [8, 9, 10]) {
        const board = new Board(size);
        for (let c = 0; c < 4; c++) board.cells[0][c] = 0;
        const before = structuredClone(board.cells);
        const hint = findSuggestedMove(board);
        assert.equal(hint.points, 0);
        assert.equal(applySuggestion(board, hint).lineCount, 0);
        assert.deepEqual(board.cells, before);
        assert.deepEqual(findSuggestedMove(board), hint);
    }
});

test('empty and full boards have no suggested move', () => {
    const board = new Board(8);
    assert.equal(findSuggestedMove(board), null);
    board.cells = board.cells.map((row, r) => row.map((cell, c) => (r + c * 2) % 5));
    assert.equal(findSuggestedMove(board), null);
});

test('the icon selects the suggested bean and flashes the empty destination exactly twice', async () => {
    const app = prepareApp({deferAnimation: true});
    const before = app.controller.game.toSnapshot();
    const calls = structuredClone(app.audio.calls);
    app.controller.random = app.controller.game.random = () => { throw new Error('Hint must not consume randomness'); };
    app.elements.brandHintButton.focus();
    app.elements.brandHintButton.listeners.click();
    assert.deepEqual(app.controller.game.toSnapshot(), {...before, selectedBall: {r: 1, c: 4}});
    assert.equal(app.view.getCell(1, 4).classList.contains('selected'), true);
    const flash = app.animations[0];
    assert.equal(flash.element, app.view.getCell(0, 4));
    assert.equal(flash.options.iterations, 2);
    assert.match(flash.keyframes[1].boxShadow, /#ffd700/);
    assert.equal(app.controller.processing, false);
    assert.equal(app.document.activeElement, app.elements.brandHintButton);
    assert.deepEqual(app.audio.calls, calls);
    const saved = JSON.parse(app.storage.getItem(GAME_SESSION_KEY));
    assert.deepEqual(saved.game.selectedBall, {r: 1, c: 4});
    assert.deepEqual(saved.game.cells, before.cells);
    flash.resolve();
    await flash.finished;
    await Promise.resolve();
    assert.equal(app.view.hintAnimation, null);
});

test('the suggested destination can be clicked to play the ordinary turn', async () => {
    const app = prepareApp();
    app.elements.brandHintButton.listeners.click();
    await app.click(0, 4);
    assert.equal(app.controller.game.score, 22);
    assert.equal(app.controller.game.selectedBall, null);
    assert.equal(app.controller.game.board.cells.flat().filter(color => color !== null).length, 3);
    assert.deepEqual(app.errors, []);
});

test('when no move exists the icon changes no state, save, DOM, message or sound', () => {
    const app = createApp();
    app.emptyBoard();
    app.controller.persistSession();
    const before = app.controller.game.toSnapshot();
    const saved = app.storage.getItem(GAME_SESSION_KEY);
    const cell = app.view.getCell(0, 0);
    const message = app.elements.moveHint.textContent;
    const calls = structuredClone(app.audio.calls);
    app.elements.brandHintButton.listeners.click();
    assert.deepEqual(app.controller.game.toSnapshot(), before);
    assert.equal(app.storage.getItem(GAME_SESSION_KEY), saved);
    assert.equal(app.view.getCell(0, 0), cell);
    assert.equal(app.elements.moveHint.textContent, message);
    assert.deepEqual(app.audio.calls, calls);
    assert.equal(app.animations.length, 0);
});

test('repeated hints replace their old flash and retain the same selected bean', async () => {
    const app = prepareApp({deferAnimation: true});
    app.elements.brandHintButton.listeners.click();
    const oldFlash = app.animations[0];
    app.elements.brandHintButton.listeners.click();
    await assert.rejects(oldFlash.finished, /cancelled/i);
    assert.equal(app.view.hintAnimation, app.animations[1]);
    assert.deepEqual(app.controller.game.selectedBall, {r: 1, c: 4});
    app.animations[1].resolve();
});

test('language changes retain the hint flash; restarting clears it without stale selection', async () => {
    const app = prepareApp({deferAnimation: true});
    app.elements.brandHintButton.listeners.click();
    const flash = app.animations[0];
    app.elements.languageSelect.value = 'en';
    app.elements.languageSelect.listeners.change();
    assert.equal(app.view.hintAnimation, flash);
    assert.equal(app.elements.brandHintButton.attributes['aria-label'], "Nini's Bean Battle");
    app.elements.restartBtn.listeners.click();
    await assert.rejects(flash.finished, /cancelled/i);
    assert.equal(app.view.hintAnimation, null);
    assert.equal(app.controller.game.selectedBall, null);
    assert.deepEqual(app.errors, []);
});

test('hints do nothing during movement or after game over', async () => {
    const app = prepareApp({reducedMotion: false, deferAnimation: true});
    await app.click(1, 4);
    const turn = app.click(0, 4);
    const before = app.controller.game.toSnapshot();
    app.elements.brandHintButton.listeners.click();
    assert.deepEqual(app.controller.game.toSnapshot(), before);
    assert.equal(app.animations.length, 1);
    app.animations[0].resolve();
    await turn;
    app.controller.game.isOver = true;
    const cell = app.view.getCell(0, 0);
    app.elements.brandHintButton.listeners.click();
    assert.equal(app.view.getCell(0, 0), cell);
    assert.equal(app.animations.length, 1);
    assert.deepEqual(app.errors, []);
});
