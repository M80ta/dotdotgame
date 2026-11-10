// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {BATCH_SIZES, BOARD_SIZES, DEFAULT_BATCH_SIZE, DEFAULT_BOARD_SIZE} from '../config.js';
import {Board} from '../board/board.js';
import {createColorBatch} from '../elements/ball.js';
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

    setBatchSize(count) {
        this.batchSize = BATCH_SIZES.includes(count) ? count : DEFAULT_BATCH_SIZE;
        this.preview = createColorBatch(this.batchSize, this.preview, this.random);
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
