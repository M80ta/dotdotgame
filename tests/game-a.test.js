import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Board} from '../src/board/board.js';
import {LINE_DIRECTIONS} from '../src/config.js';
import {createColorBatch} from '../src/elements/ball.js';
import {GameA} from '../src/game/game-a.js';
import {findCompletedLines} from '../src/game/lines.js';

function fixture(options = {}) {
    let values = [];
    const game = new GameA({...options, random: () => values.length ? values.shift() : 0.37});
    game.board = new Board(game.board.size);
    return {game, setRandom: next => { values = next.slice(); }};
}
const countBalls = game => game.board.cells.flat().filter(color => color !== null).length;
const snapshot = game => structuredClone({cells: game.board.cells, preview: game.preview, score: game.score, selectedBall: game.selectedBall});
function completeMove(game, source, target) {
    game.selectCell(source.r, source.c);
    const move = game.selectCell(target.r, target.c);
    assert.equal(move.type, 'move');
    const turn = game.moveAndSpawn(move);
    return {...game.finishTurn(turn.lines), ...turn};
}

test('all board and batch settings start with n distinct balls and a distinct preview', () => {
    for (const boardSize of [8, 9, 10]) {
        for (const batchSize of [3, 4, 5]) {
            const game = new GameA({boardSize, batchSize});
            assert.equal(countBalls(game), batchSize);
            assert.equal(game.board.size, boardSize);
            assert.equal(new Set(game.board.cells.flat().filter(color => color !== null)).size, batchSize);
            assert.equal(game.preview.length, batchSize);
            assert.equal(new Set(game.preview).size, batchSize);
        }
    }
});

test('batch generation preserves prefix, rejects invalid counts and never repeats a color', () => {
    for (const count of [3, 4, 5]) {
        const colors = createColorBatch(count, [2, 4], () => 0);
        assert.deepEqual(colors.slice(0, 2), [2, 4]);
        assert.equal(new Set(colors).size, count);
    }
    assert.throws(() => createColorBatch(6), RangeError);
    assert.equal(new GameA({boardSize: 0, batchSize: 10}).batchSize, 3);
});

test('clicking empty cells without selection does not consume balls or preview', () => {
    const {game} = fixture();
    const before = snapshot(game);
    assert.equal(game.selectCell(0, 0).type, 'selection-required');
    assert.deepEqual(snapshot(game), before);
    assert.equal(game.selectCell(-1, 0).type, 'ignored');
});

test('select, switch selection and deselect do not advance a turn', () => {
    const {game} = fixture();
    game.board.cells[0][0] = 0;
    game.board.cells[0][1] = 1;
    assert.equal(game.selectCell(0, 0).type, 'selected');
    assert.equal(game.selectCell(0, 1).type, 'selected');
    assert.deepEqual(game.selectedBall, {r: 0, c: 1});
    assert.equal(game.selectCell(0, 1).type, 'deselected');
    assert.equal(countBalls(game), 2);
});

test('BFS takes a shortest four-way detour without crossing occupied cells', () => {
    const board = new Board(8);
    board.cells[1][0] = 0;
    board.cells[1][1] = 1;
    const route = board.findShortestPath({r: 1, c: 0}, {r: 1, c: 2});
    assert.equal(route.length, 5);
    assert.deepEqual(route[0], {r: 1, c: 0});
    assert.deepEqual(route.at(-1), {r: 1, c: 2});
    route.slice(1).forEach((cell, i) => {
        assert.equal(Math.abs(cell.r - route[i].r) + Math.abs(cell.c - route[i].c), 1);
        assert.equal(board.cells[cell.r][cell.c], null);
    });
    board.cells[0][0] = 2;
    board.cells[2][0] = 3;
    assert.equal(board.findShortestPath({r: 1, c: 0}, {r: 2, c: 1}), null);
    assert.throws(() => board.move({r: 1, c: 0}, {r: 2, c: 1}), /unreachable/);
});

test('a blocked move retains selection and does not advance the turn', () => {
    const {game} = fixture();
    game.board.cells[0][0] = 0;
    game.board.cells[0][1] = 1;
    game.board.cells[1][0] = 2;
    game.selectCell(0, 0);
    const before = snapshot(game);
    assert.equal(game.selectCell(1, 1).type, 'blocked');
    assert.deepEqual(snapshot(game), before);
});

test('valid moves preserve color, consume the entire preview and add exactly n balls', () => {
    for (const batchSize of [3, 4, 5]) {
        const {game} = fixture({batchSize});
        game.board.cells[0][0] = 4;
        const preview = [...game.preview];
        completeMove(game, {r: 0, c: 0}, {r: 0, c: 1});
        assert.equal(game.board.cells[0][1], 4);
        assert.equal(countBalls(game), batchSize + 1);
        const spawned = game.board.cells.flatMap((row, r) => row.filter((color, c) => color !== null && !(r === 0 && c === 1)));
        assert.deepEqual(spawned.sort(), preview.sort());
        assert.equal(game.preview.length, batchSize);
    }
});

test('five qualifies in all four line directions, but four/mixed colors do not', () => {
    for (const [r, c, dr, dc] of [[0, 0, 0, 1], [0, 0, 1, 0], [0, 0, 1, 1], [0, 4, 1, -1]]) {
        const board = new Board(8);
        for (let i = 0; i < 5; i++) board.cells[r + i * dr][c + i * dc] = 0;
        const lines = findCompletedLines(board);
        assert.equal(lines.lineCount, 1);
        assert.equal(lines.cells.size, 5);
        board.cells[r][c] = 1;
        assert.equal(findCompletedLines(board).lineCount, 0);
    }
});

test('an eight-ball run counts once; four crossing runs count 17 unique balls', () => {
    const board = new Board(8);
    board.cells[0].fill(0);
    assert.equal(findCompletedLines(board).lineCount, 1);
    assert.equal(findCompletedLines(board).cells.size, 8);
    const cross = new Board(8);
    for (const [dr, dc] of LINE_DIRECTIONS) {
        for (let i = -2; i <= 2; i++) cross.cells[3 + i * dr][3 + i * dc] = 0;
    }
    const lines = findCompletedLines(cross);
    assert.equal(lines.lineCount, 4);
    assert.equal(lines.cells.size, 17);
});

test('a move completing a line still spawns n balls, scores ball count and has no gravity', () => {
    const {game} = fixture();
    for (let c = 0; c < 4; c++) game.board.cells[0][c] = 0;
    game.board.cells[1][4] = 0;
    game.board.cells[1][0] = 4;
    game.preview = [1, 2, 3];
    completeMove(game, {r: 1, c: 4}, {r: 0, c: 4});
    assert.equal(game.score, 5);
    assert.equal(countBalls(game), 4);
    assert.equal(game.board.cells[1][0], 4);
});

test('movement and spawn can finish two intersecting lines: 9 x 2 = 18 points', () => {
    const {game, setRandom} = fixture();
    for (let i = 0; i < 4; i++) {
        game.board.cells[2][i] = 0;
        game.board.cells[i][2] = 0;
    }
    game.board.cells[7][7] = 0;
    game.preview = [0, 1, 2];
    game.selectCell(7, 7);
    const move = game.selectCell(2, 4);
    const empties = game.board.cells.flatMap((row, r) => row.flatMap((color, c) => ((color === null && !(r === 2 && c === 4)) || (r === 7 && c === 7)) ? [{r, c}] : []));
    const index = empties.findIndex(({r, c}) => r === 4 && c === 2);
    setRandom([(index + 0.1) / empties.length, 0, 0]);
    const turn = game.moveAndSpawn(move);
    const result = game.finishTurn(turn.lines);
    assert.deepEqual(result, {earned: 18, cleared: 9, combo: 2});
    assert.equal(countBalls(game), 2);
});

test('insufficient space fills the remaining cells and game-over prevents more input', () => {
    const {game} = fixture();
    game.board.cells = Array.from({length: 8}, (_, r) => Array.from({length: 8}, (_, c) => (r * 2 + c) % 5));
    game.board.cells[7][7] = null;
    game.preview = [1, 2, 3];
    const turn = completeMove(game, {r: 7, c: 6}, {r: 7, c: 7});
    assert.equal(turn.spawned.size, 1);
    assert.equal(countBalls(game), 64);
    assert.equal(game.isOver, true);
    assert.equal(game.selectCell(0, 0).type, 'ignored');
});

test('clearing the last vacant cell is processed before deciding game-over', () => {
    const {game} = fixture();
    game.board.cells = Array.from({length: 8}, (_, r) => Array.from({length: 8}, (_, c) => (r * 2 + c) % 5));
    for (let c = 0; c < 4; c++) game.board.cells[0][c] = 0;
    game.board.cells[0][4] = null;
    game.board.cells[0][5] = 1;
    game.board.cells[1][4] = 0;
    game.preview = [1, 2, 3];
    completeMove(game, {r: 1, c: 4}, {r: 0, c: 4});
    assert.equal(game.score, 5);
    assert.equal(countBalls(game), 59);
    assert.equal(game.isOver, false);
});

test('batch resizing preserves board, score, selection and preview prefix', () => {
    const game = new GameA();
    const before = snapshot(game);
    for (const count of [5, 4, 3]) {
        game.setBatchSize(count);
        assert.equal(game.preview.length, count);
        assert.deepEqual(game.preview.slice(0, 3), before.preview);
        assert.deepEqual(game.board.cells, before.cells);
        assert.equal(game.score, before.score);
    }
});
