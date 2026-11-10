// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {MOVE_DIRECTIONS} from '../config.js';

/** Board data and spatial operations. This module never accesses the DOM. */
export class Board {
    constructor(size) {
        if (!Number.isInteger(size) || size < 1) throw new RangeError('Invalid board size.');
        this.size = size;
        this.cells = Array.from({length: size}, () => Array(size).fill(null));
    }

    contains(r, c) {
        return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < this.size && c >= 0 && c < this.size;
    }

    getEmptyCells() {
        const cells = [];
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.cells[r][c] === null) cells.push({r, c});
            }
        }
        return cells;
    }

    spawn(colors, random = Math.random) {
        const empty = this.getEmptyCells();
        const spawned = new Set();
        // Sample empty cells without replacement; never overwrite a ball.
        for (const color of colors) {
            if (empty.length === 0) break;
            const {r, c} = empty.splice(Math.floor(random() * empty.length), 1)[0];
            this.cells[r][c] = color;
            spawned.add(`${r},${c}`);
        }
        return spawned;
    }

    findShortestPath(source, target) {
        if (!this.contains(source.r, source.c) || !this.contains(target.r, target.c)
            || this.cells[source.r][source.c] === null || this.cells[target.r][target.c] !== null) return null;
        const parents = Array.from({length: this.size}, () => Array(this.size).fill(null));
        const queue = [source];
        parents[source.r][source.c] = source;
        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            if (current.r === target.r && current.c === target.c) {
                const path = [];
                let step = current;
                while (step.r !== source.r || step.c !== source.c) {
                    path.push(step);
                    step = parents[step.r][step.c];
                }
                return [...path, source].reverse();
            }
            for (const [dr, dc] of MOVE_DIRECTIONS) {
                const r = current.r + dr;
                const c = current.c + dc;
                if (!this.contains(r, c) || this.cells[r][c] !== null || parents[r][c] !== null) continue;
                parents[r][c] = current;
                queue.push({r, c});
            }
        }
        return null;
    }

    move(source, target) {
        if (!this.findShortestPath(source, target)) throw new Error('Destination is unreachable.');
        this.cells[target.r][target.c] = this.cells[source.r][source.c];
        this.cells[source.r][source.c] = null;
    }

    clear(cells) {
        for (const key of cells) {
            const [r, c] = key.split(',').map(Number);
            this.cells[r][c] = null;
        }
    }

    get isFull() {
        return this.cells.every(row => row.every(color => color !== null));
    }
}
