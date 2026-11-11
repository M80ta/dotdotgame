// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {COLORS, createBallElement} from '../elements/ball.js';

/** Settings, preview, score panels, towers, announcements, and modal. */
export class GameUI {
    constructor(document, i18n) {
        this.document = document;
        this.i18n = i18n;
        const ids = ['boardSizeSelect', 'queueSizeSelect', 'restartBtn', 'modalRestartBtn', 'gameOverModal',
            'modalTitle', 'modalMessage', 'ballQueuePreview', 'moveHint', 'comboBadge', 'currentScore',
            'currentScoreDisplay', 'highScoreDisplay', 'playerTowerFill', 'kingTowerFill', 'playerAvatar',
            'kingAvatar', 'kingStatusText', 'gameBoard', 'languageSelect', 'soundToggle', 'brandHintButton'];
        this.refs = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
        this.localize();
    }

    localize() {
        this.i18n.apply(this.document);
        this.refs.languageSelect.value = this.i18n.language;
        this.setSoundEnabled(this.soundEnabled ?? true);
        if (this.preview) this.renderPreview(this.preview);
        if (this.scoreState) this.renderScores(...this.scoreState);
        else this.refs.kingStatusText.textContent = this.i18n.t('player.challenge');
        if (this.comboCount !== undefined) this.setCombo(this.comboCount);
        if (this.modalState) this.showGameOver(...this.modalState, false);
        else {
            this.refs.modalTitle.textContent = this.i18n.t('modal.gameOver');
            this.refs.modalMessage.textContent = this.i18n.t('modal.full', {score: 0});
        }
    }

    get settings() {
        return {boardSize: Number(this.refs.boardSizeSelect.value), batchSize: Number(this.refs.queueSizeSelect.value)};
    }

    setSettings({boardSize, batchSize}) {
        this.refs.boardSizeSelect.value = String(boardSize);
        this.refs.queueSizeSelect.value = String(batchSize);
    }

    bind({restart, changeLanguage, toggleSound, requestHint}) {
        this.refs.restartBtn.addEventListener('click', restart);
        this.refs.modalRestartBtn.addEventListener('click', restart);
        this.refs.boardSizeSelect.addEventListener('change', restart);
        this.refs.queueSizeSelect.addEventListener('change', restart);
        this.refs.languageSelect.addEventListener('change', () => changeLanguage(this.refs.languageSelect.value));
        this.refs.soundToggle.addEventListener('click', toggleSound);
        this.refs.brandHintButton.addEventListener('click', requestHint);
    }

    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
        this.refs.soundToggle.textContent = this.i18n.t(enabled ? 'audio.on' : 'audio.off');
        this.refs.soundToggle.setAttribute('aria-pressed', String(enabled));
        this.refs.soundToggle.setAttribute('title', this.i18n.t(enabled ? 'audio.mute' : 'audio.unmute'));
    }

    setProcessing(processing) {
        // Settings remain usable: choosing either setting starts a new game.
        this.refs.gameBoard.setAttribute('aria-busy', String(processing));
    }

    setHint(message) {
        this.refs.moveHint.textContent = message;
    }

    renderPreview(colors) {
        this.preview = [...colors];
        this.refs.queueSizeSelect.value = String(colors.length);
        this.refs.ballQueuePreview.innerHTML = '';
        colors.forEach((color, index) => {
            const item = this.document.createElement('li');
            item.className = 'ball-queue-item';
            item.setAttribute('aria-label', this.i18n.t('preview.item', {index: index + 1, color: this.i18n.t(`color.${COLORS[color]}`)}));
            const position = this.document.createElement('span');
            position.className = 'queue-position';
            position.textContent = String(index + 1);
            position.setAttribute('aria-hidden', 'true');
            item.appendChild(createBallElement(this.document, color, {preview: true}));
            item.appendChild(position);
            this.refs.ballQueuePreview.appendChild(item);
        });
    }

    setCombo(count) {
        this.comboCount = count;
        this.refs.comboBadge.textContent = this.i18n.t('score.combo', {count});
        this.refs.comboBadge.style.display = count > 1 ? 'block' : 'none';
    }

    renderScores(score, highScore, startingHighScore) {
        this.scoreState = [score, highScore, startingHighScore];
        const refs = this.refs;
        refs.currentScore.textContent = String(score);
        refs.currentScoreDisplay.textContent = String(score);
        refs.highScoreDisplay.textContent = String(highScore);
        const maxTarget = Math.max(highScore, 500, score * 1.2);
        refs.playerTowerFill.parentElement.style.setProperty('--tower-level', `${Math.min(100, score / maxTarget * 100)}%`);
        refs.kingTowerFill.parentElement.style.setProperty('--tower-level', `${Math.min(100, highScore / maxTarget * 100)}%`);
        const newRecord = score > startingHighScore;
        refs.playerAvatar.textContent = newRecord ? '👑' : '🧘';
        refs.kingAvatar.textContent = newRecord ? '🤴' : '👑';
        refs.kingStatusText.textContent = this.i18n.t(newRecord ? 'player.record' : 'player.challenge');
        refs.kingStatusText.classList.toggle('new-record', newRecord);
    }

    hideGameOver() {
        this.modalState = null;
        this.refs.gameOverModal.classList.remove('show');
        this.refs.gameOverModal.setAttribute('aria-hidden', 'true');
        this.refs.gameOverModal.inert = true;
        if (this.document.activeElement === this.refs.modalRestartBtn) this.refs.restartBtn.focus({preventScroll: true});
    }

    showGameOver(score, startingHighScore, focus = true) {
        this.modalState = [score, startingHighScore];
        const newRecord = score > startingHighScore;
        this.refs.modalTitle.textContent = this.i18n.t(newRecord ? 'modal.newKing' : 'modal.gameOver');
        this.refs.modalMessage.textContent = this.i18n.t(newRecord ? 'modal.record' : 'modal.full', {score});
        this.refs.gameOverModal.inert = false;
        this.refs.gameOverModal.setAttribute('aria-hidden', 'false');
        this.refs.gameOverModal.classList.add('show');
        if (focus) this.refs.modalRestartBtn.focus({preventScroll: true});
    }
}
