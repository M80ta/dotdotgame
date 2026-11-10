import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HighScoreStore} from '../src/services/high-score.js';
import {createMoveKeyframes} from '../src/ui/ball-animator.js';
import {createApp, html} from './helpers/fake-dom.js';

const countBalls = app => app.controller.game.board.cells.flat().filter(color => color !== null).length;

test('UI renders every size/batch and keeps Game B unavailable', () => {
    for (const size of [8, 9, 10]) {
        for (const batch of [3, 4, 5]) {
            const app = createApp({size, batch});
            assert.equal(app.elements.gameBoard.children.length, size * size);
            assert.equal(app.elements.ballQueuePreview.children.length, batch);
            assert.equal(app.elements.currentScore.textContent, '0');
            assert.equal(app.elements.gameOverModal.inert, true);
            assert.deepEqual(app.errors, []);
        }
    }
    assert.match(html, /<option value="B" disabled>/);
    assert.match(html, /viewport-fit=cover/);
});

test('input goes through board view and controller without spawning on an empty click', async () => {
    const app = createApp();
    app.emptyBoard();
    await app.click(0, 0);
    assert.equal(countBalls(app), 0);
    app.controller.game.board.cells[0][0] = 4;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    assert.equal(app.view.getCell(0, 0).classList.contains('selected'), true);
    await app.click(0, 1);
    assert.equal(app.controller.game.board.cells[0][1], 4);
    assert.equal(countBalls(app), 4);
    assert.equal(app.elements.queueSizeSelect.disabled, false);
    assert.deepEqual(app.errors, []);
});

test('keyboard selection and arrow navigation retain focus after rendering', () => {
    const app = createApp();
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 0;
    app.view.render(app.controller.game.board, null);
    let prevented = 0;
    app.view.getCell(0, 0).focus();
    app.view.getCell(0, 0).listeners.keydown({key: 'Enter', preventDefault() { prevented++; }});
    assert.equal(app.view.getCell(0, 0).classList.contains('selected'), true);
    assert.equal(app.document.activeElement, app.view.getCell(0, 0));
    app.view.getCell(0, 0).listeners.keydown({key: 'ArrowRight', preventDefault() { prevented++; }});
    assert.equal(app.document.activeElement, app.view.getCell(0, 1));
    assert.equal(prevented, 2);
});

test('resizing the batch and board updates the matching UI without stale state', () => {
    const app = createApp();
    const cells = structuredClone(app.controller.game.board.cells);
    app.elements.queueSizeSelect.value = '5';
    app.elements.queueSizeSelect.listeners.change();
    assert.equal(app.elements.ballQueuePreview.children.length, 5);
    assert.deepEqual(app.controller.game.board.cells, cells);
    app.elements.boardSizeSelect.value = '10';
    app.elements.boardSizeSelect.listeners.change();
    assert.equal(app.elements.gameBoard.children.length, 100);
    assert.equal(countBalls(app), 5);
    assert.equal(app.elements.currentScore.textContent, '0');
});

test('slime keyframes follow turns with both stretch directions and animation completes', async () => {
    const frames = createMoveKeyframes([{x: 0, y: 0}, {x: 0, y: 50}, {x: 50, y: 50}]);
    assert.equal(frames.length, 5);
    assert.equal(frames[0].offset, 0);
    assert.equal(frames.at(-1).offset, 1);
    assert.ok(frames.some(frame => frame.transform.includes('scale(1.3, 0.76)')));
    assert.ok(frames.some(frame => frame.transform.includes('scale(0.76, 1.3)')));
    const app = createApp({reducedMotion: false});
    app.emptyBoard();
    app.controller.game.board.cells[1][0] = 0;
    app.controller.game.board.cells[1][1] = 1;
    app.view.render(app.controller.game.board, null);
    await app.click(1, 0);
    await app.click(1, 2);
    assert.equal(app.animations[0].keyframes.length, 9);
    assert.equal(app.controller.game.board.cells[1][2], 0);
    assert.deepEqual(app.errors, []);
});

test('rapid clicks are ignored and an old animation cannot change or unlock a new turn', async () => {
    const app = createApp({reducedMotion: false, deferAnimation: true});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 0;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    const oldTurn = app.click(0, 1);
    const before = structuredClone(app.controller.game.board.cells);
    await app.click(0, 2);
    assert.deepEqual(app.controller.game.board.cells, before);
    assert.equal(app.elements.queueSizeSelect.disabled, true);
    app.elements.restartBtn.listeners.click();
    assert.equal(countBalls(app), 3);
    const source = app.controller.game.board.cells.flatMap((row, r) => row.flatMap((color, c) => color === null ? [] : [{r, c}]))[0];
    const target = app.controller.game.board.getEmptyCells().find(cell => app.controller.game.board.findShortestPath(source, cell));
    await app.click(source.r, source.c);
    const newTurn = app.click(target.r, target.c);
    await oldTurn;
    assert.equal(app.controller.processing, true);
    app.animations.at(-1).resolve();
    await newTurn;
    assert.equal(countBalls(app), 6);
    assert.equal(app.controller.processing, false);
    assert.deepEqual(app.errors, []);
});

test('restarting during spawn delay prevents the old turn from changing the new board', async () => {
    const app = createApp({reducedMotion: false, deferWait: true});
    app.emptyBoard();
    app.controller.game.board.cells[0][0] = 0;
    app.view.render(app.controller.game.board, null);
    await app.click(0, 0);
    const oldTurn = app.click(0, 1);
    for (let i = 0; i < 5 && app.waits.length === 0; i++) await Promise.resolve();
    assert.equal(app.waits.length, 1);
    app.elements.restartBtn.listeners.click();
    const before = structuredClone(app.controller.game.board.cells);
    app.waits.shift()();
    await oldTurn;
    assert.deepEqual(app.controller.game.board.cells, before);
    assert.equal(app.elements.currentScore.textContent, '0');
});

test('high-score storage handles invalid data, read/write errors, and valid values', () => {
    for (const value of [null, 'NaN', '-1', 'Infinity', 'not-a-score']) {
        assert.equal(new HighScoreStore(() => ({getItem: () => value})).read(), 100);
    }
    assert.equal(new HighScoreStore(() => ({getItem: () => '321'})).read(), 321);
    const blocked = new HighScoreStore(() => { throw new Error('Blocked storage'); });
    assert.equal(blocked.read(), 100);
    assert.doesNotThrow(() => blocked.save(123));
});

test('tower data serves both orientations and the modal becomes accessible on game-over', () => {
    const app = createApp();
    app.ui.renderScores(600, 600, 100);
    assert.match(app.elements.playerTowerFill.parentElement.style['--tower-level'], /%$/);
    assert.equal(app.elements.playerAvatar.textContent, '👑');
    app.ui.showGameOver(600, 100);
    assert.equal(app.elements.gameOverModal.inert, false);
    assert.equal(app.elements.gameOverModal.attributes['aria-hidden'], 'false');
    assert.equal(app.document.activeElement, app.elements.modalRestartBtn);
    app.ui.hideGameOver();
    assert.equal(app.elements.gameOverModal.inert, true);
});
