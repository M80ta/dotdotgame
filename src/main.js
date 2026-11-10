// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {BoardView} from './board/board-view.js';
import {GameController} from './game/controller.js';
import {HighScoreStore} from './services/high-score.js';
import {GameSessionStore} from './services/game-session.js';
import {BallAnimator} from './ui/ball-animator.js';
import {GameUI} from './ui/game-ui.js';
import {I18n} from './i18n/translator.js';

const i18n = new I18n({
    getStorage: () => window.localStorage,
    language: window.navigator.language?.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en'
});
const ui = new GameUI(document, i18n);
const boardView = new BoardView(document.getElementById('gameBoard'), document, i18n);
const controller = new GameController({
    ui, boardView,
    animator: new BallAnimator(boardView, window),
    store: new HighScoreStore(() => window.localStorage),
    sessionStore: new GameSessionStore(() => window.localStorage)
});
controller.start();
