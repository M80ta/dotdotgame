// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {BATCH_SIZES, BOARD_SIZES, DEFAULT_BATCH_SIZE, DEFAULT_BOARD_SIZE} from '../config.js';
import {Board} from '../board/board.js';
import {COLORS, createColorBatch} from '../elements/ball.js';
import {findCompletedLines} from './lines.js';

/** Game A state and turn rules, independent from rendering and animation. */
export class GameA {
    constructor({boardSize = DEFAULT_BOARD_SIZE, batchSize = DEFAULT_BATCH_SIZE, random = Math.random} = {}) {
        this.random = random;
        this.board = new Board(BOARD_SIZES.includes(boardSize) ? boardSize : DEFAULT_BOARD_SIZE);
        this.batchSize = BATCH_SIZES.includes(batchSize) ? batchSize : DEFAULT_BATCH_SIZE;
        this.score = 0;
        this.selectedBall = null;
        this.isOver = false;
        this.initialBalls = this.board.spawn(createColorBatch(this.batchSize, [], random), random);
        this.preview = createColorBatch(this.batchSize, [], random);
    }

    /** Only complete turns are serialized; animation state is never persisted. */
    toSnapshot() {
        return {
            boardSize: this.board.size,
            batchSize: this.batchSize,
            cells: this.board.cells.map(row => [...row]),
            preview: [...this.preview],
            score: this.score,
            selectedBall: this.selectedBall ? {...this.selectedBall} : null
        };
    }

    /** Restore without generating initial balls or consuming any randomness. */
    static fromSnapshot(snapshot, {random = Math.random} = {}) {
        if (!snapshot || !BOARD_SIZES.includes(snapshot.boardSize) || !BATCH_SIZES.includes(snapshot.batchSize)) return null;
        const {boardSize, batchSize, cells, preview, score, selectedBall} = snapshot;
        const validColor = color => Number.isInteger(color) && color >= 0 && color < COLORS.length;
        if (!Array.isArray(cells) || cells.length !== boardSize
            || !cells.every(row => Array.isArray(row) && row.length === boardSize
                && row.every(color => color === null || validColor(color)))
            || !Array.isArray(preview) || preview.length !== batchSize
            || !preview.every(validColor) || new Set(preview).size !== batchSize
            || !Number.isSafeInteger(score) || score < 0) return null;

        const board = new Board(boardSize);
        board.cells = cells.map(row => [...row]);
        if (board.isFull || findCompletedLines(board).lineCount > 0) return null;
        if (selectedBall !== null && (!selectedBall || !board.contains(selectedBall.r, selectedBall.c)
            || board.cells[selectedBall.r][selectedBall.c] === null)) return null;

        const game = Object.create(GameA.prototype);
        Object.assign(game, {
            random, board, batchSize, score,
            preview: [...preview],
            selectedBall: selectedBall ? {r: selectedBall.r, c: selectedBall.c} : null,
            isOver: false,
            initialBalls: new Set()
        });
        return game;
    }

    selectCell(r, c) {
        if (this.isOver || !this.board.contains(r, c)) return {type: 'ignored'};
        if (this.board.cells[r][c] !== null) {
            this.selectedBall = this.selectedBall?.r === r && this.selectedBall?.c === c ? null : {r, c};
            return {type: this.selectedBall ? 'selected' : 'deselected'};
        }
        if (!this.selectedBall) return {type: 'selection-required'};
        const source = {...this.selectedBall};
        const target = {r, c};
        const path = this.board.findShortestPath(source, target);
        return path ? {type: 'move', source, target, path, color: this.board.cells[source.r][source.c]} : {type: 'blocked'};
    }

    moveAndSpawn(move) {
        this.board.move(move.source, move.target);
        this.selectedBall = null;
        const spawned = this.board.spawn(this.preview, this.random);
        this.preview = createColorBatch(this.batchSize, [], this.random);
        return {spawned, lines: findCompletedLines(this.board)};
    }

    finishTurn(lines) {
        this.board.clear(lines.cells);
        const earned = lines.cells.size * lines.lineCount;
        this.score += earned;
        this.isOver = this.board.isFull;
        return {earned, cleared: lines.cells.size, combo: lines.lineCount};
    }
}
