// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {LINE_DIRECTIONS, WIN_COUNT} from '../config.js';

/** Count maximal runs; intersecting balls enter the score only once. */
export function findCompletedLines(board) {
    const cells = new Set();
    let lineCount = 0;
    for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
            const color = board.cells[r][c];
            if (color === null) continue;
            for (const [dr, dc] of LINE_DIRECTIONS) {
                const previousR = r - dr;
                const previousC = c - dc;
                if (board.contains(previousR, previousC) && board.cells[previousR][previousC] === color) continue;
                const run = [];
                let row = r;
                let col = c;
                while (board.contains(row, col) && board.cells[row][col] === color) {
                    run.push(`${row},${col}`);
                    row += dr;
                    col += dc;
                }
                if (run.length >= WIN_COUNT) {
                    lineCount++;
                    run.forEach(key => cells.add(key));
                }
            }
        }
    }
    return {cells, lineCount};
}
