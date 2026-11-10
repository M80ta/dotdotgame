// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {COLORS, createBallElement} from '../elements/ball.js';

/** Only draws cells and forwards input; it does not decide whether a move is legal. */
export class BoardView {
    constructor(root, document) {
        this.root = root;
        this.document = document;
        this.onCellClick = () => {};
    }

    render(board, selectedBall, newCells = new Set()) {
        const focused = this.document.activeElement;
        const focus = this.root.contains(focused) && focused?.dataset.row !== undefined
            ? {r: Number(focused.dataset.row), c: Number(focused.dataset.col)} : null;
        this.root.style.setProperty('--board-size', board.size);
        this.root.innerHTML = '';
        for (let r = 0; r < board.size; r++) {
            for (let c = 0; c < board.size; c++) {
                const cell = this.document.createElement('div');
                const color = board.cells[r][c];
                const selected = selectedBall?.r === r && selectedBall?.c === c;
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.tabIndex = 0;
                cell.setAttribute('role', 'button');
                cell.setAttribute('aria-pressed', String(selected));
                cell.setAttribute('aria-label', `第 ${r + 1} 列第 ${c + 1} 格，${color === null ? '空格' : COLORS[color] + '球'}`);
                cell.classList.toggle('selected', selected);
                if (color === null) cell.classList.add('active-hover');
                else cell.appendChild(createBallElement(this.document, color, {isNew: newCells.has(`${r},${c}`)}));
                cell.addEventListener('click', () => this.onCellClick(r, c));
                cell.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        this.onCellClick(r, c);
                    } else {
                        const directions = {ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowDown: [1, 0], ArrowLeft: [0, -1]};
                        const direction = directions[event.key];
                        if (direction && board.contains(r + direction[0], c + direction[1])) {
                            event.preventDefault();
                            this.getCell(r + direction[0], c + direction[1]).focus({preventScroll: true});
                        }
                    }
                });
                this.root.appendChild(cell);
            }
        }
        if (focus && board.contains(focus.r, focus.c)) this.getCell(focus.r, focus.c).focus({preventScroll: true});
    }

    getCell(r, c) {
        return this.root.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    }

    markClearing(cells) {
        for (const key of cells) {
            const [r, c] = key.split(',').map(Number);
            this.getCell(r, c).querySelector('.ball').classList.add('clearing');
        }
    }
}
