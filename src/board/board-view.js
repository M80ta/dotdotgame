// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {COLORS, createBallElement} from '../elements/ball.js';

/** Only draws cells and forwards input; it does not decide whether a move is legal. */
export class BoardView {
    constructor(root, document, i18n) {
        this.root = root;
        this.document = document;
        this.i18n = i18n;
        this.onCellClick = () => {};
        this.hintAnimation = null;
    }

    render(board, selectedBall, newCells = new Set()) {
        this.clearHint();
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
                cell.dataset.color = color === null ? '' : String(color);
                cell.tabIndex = 0;
                cell.setAttribute('role', 'button');
                cell.setAttribute('aria-pressed', String(selected));
                this.setCellLabel(cell, r, c, color);
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

    flashHintTarget({r, c}) {
        this.clearHint();
        const cell = this.getCell(r, c);
        const dim = {boxShadow: 'inset 0 0 0 0 rgb(255 215 0 / 0%), 0 0 0 rgb(255 215 0 / 0%)'};
        const bright = {boxShadow: 'inset 0 0 0 3px #ffd700, 0 0 14px rgb(255 215 0 / 85%)'};
        const animation = cell.animate([dim, bright, dim], {duration: 480, iterations: 2, easing: 'ease-in-out'});
        this.hintAnimation = animation;
        const finish = () => {
            if (this.hintAnimation === animation) this.hintAnimation = null;
        };
        void animation.finished.then(finish, finish);
    }

    clearHint() {
        const animation = this.hintAnimation;
        this.hintAnimation = null;
        animation?.cancel();
    }

    setCellLabel(cell, r, c, color) {
        const contents = color === null ? this.i18n.t('board.empty')
            : this.i18n.t('board.ball', {color: this.i18n.t(`color.${COLORS[color]}`)});
        cell.setAttribute('aria-label', this.i18n.t('board.cell', {row: r + 1, col: c + 1, contents}));
    }

    localize() {
        // Update the displayed cells in place, including during a move animation.
        // The model may already contain the committed result of the next frame.
        for (const cell of this.root.children) {
            if (cell.dataset.row === undefined) continue;
            this.setCellLabel(cell, Number(cell.dataset.row), Number(cell.dataset.col),
                cell.dataset.color === '' ? null : Number(cell.dataset.color));
        }
    }

    markClearing(cells) {
        for (const key of cells) {
            const [r, c] = key.split(',').map(Number);
            this.getCell(r, c).querySelector('.ball').classList.add('clearing');
        }
    }
}
