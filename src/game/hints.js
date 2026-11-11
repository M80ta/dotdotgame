// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {Board} from '../board/board.js';
import {LINE_DIRECTIONS, WIN_COUNT} from '../config.js';
import {findCompletedLines} from './lines.js';

/** Prefer open five-cell windows with more matching beans, including gaps. */
function linePotential(board, target, color) {
    let potential = 0;
    for (const [dr, dc] of LINE_DIRECTIONS) {
        for (let offset = 0; offset < WIN_COUNT; offset++) {
            const r = target.r - offset * dr;
            const c = target.c - offset * dc;
            if (!board.contains(r, c) || !board.contains(r + (WIN_COUNT - 1) * dr, c + (WIN_COUNT - 1) * dc)) continue;
            let matches = 0;
            for (let step = 0; step < WIN_COUNT; step++) {
                const cell = board.cells[r + step * dr][c + step * dc];
                if (cell !== null && cell !== color) {
                    matches = 0;
                    break;
                }
                if (cell === color) matches++;
            }
            potential += matches ** 3;
        }
    }
    return potential;
}

/** Prefer clears, then line-building moves, then shorter reachable paths. No randomness. */
export function findSuggestedMove(board) {
    const simulation = new Board(board.size);
    simulation.cells = board.cells.map(row => [...row]);
    const empty = board.getEmptyCells();
    let best = null;
    for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
            const color = board.cells[r][c];
            if (color === null) continue;
            const source = {r, c};
            for (const target of empty) {
                simulation.cells[r][c] = null;
                simulation.cells[target.r][target.c] = color;
                const lines = findCompletedLines(simulation);
                const points = lines.cells.has(`${target.r},${target.c}`) ? lines.cells.size * lines.lineCount : 0;
                const potential = points > 0 ? 0 : linePotential(simulation, target, color);
                simulation.cells[r][c] = color;
                simulation.cells[target.r][target.c] = null;
                if (best && (points < best.points || (points === best.points && potential < best.potential))) continue;
                const path = board.findShortestPath(source, target);
                if (!path) continue;
                if (!best || points > best.points || potential > best.potential || path.length < best.path.length) {
                    best = {source, target: {...target}, path, color, points, potential};
                }
            }
        }
    }
    return best;
}
