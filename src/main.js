// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {BoardView} from './board/board-view.js';
import {GameController} from './game/controller.js';
import {HighScoreStore} from './services/high-score.js';
import {BallAnimator} from './ui/ball-animator.js';
import {GameUI} from './ui/game-ui.js';

const ui = new GameUI(document);
const boardView = new BoardView(document.getElementById('gameBoard'), document);
const controller = new GameController({
    ui, boardView,
    animator: new BallAnimator(boardView, window),
    store: new HighScoreStore(() => window.localStorage)
});
controller.restart();
