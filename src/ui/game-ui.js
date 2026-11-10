// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {COLORS, createBallElement} from '../elements/ball.js';

/** Settings, preview, score panels, towers, announcements, and modal. */
export class GameUI {
    constructor(document) {
        this.document = document;
        const ids = ['boardSizeSelect', 'queueSizeSelect', 'restartBtn', 'modalRestartBtn', 'gameOverModal',
            'modalTitle', 'modalMessage', 'ballQueuePreview', 'moveHint', 'comboBadge', 'currentScore',
            'currentScoreDisplay', 'highScoreDisplay', 'playerTowerFill', 'kingTowerFill', 'playerAvatar',
            'kingAvatar', 'kingStatusText'];
        this.refs = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    }

    get settings() {
        return {boardSize: Number(this.refs.boardSizeSelect.value), batchSize: Number(this.refs.queueSizeSelect.value)};
    }

    bind({restart, changeBatchSize}) {
        this.refs.restartBtn.addEventListener('click', restart);
        this.refs.modalRestartBtn.addEventListener('click', restart);
        this.refs.boardSizeSelect.addEventListener('change', restart);
        this.refs.queueSizeSelect.addEventListener('change', () => changeBatchSize(Number(this.refs.queueSizeSelect.value)));
    }

    setProcessing(processing) {
        this.refs.queueSizeSelect.disabled = processing;
    }

    setHint(message) {
        this.refs.moveHint.textContent = message;
    }

    renderPreview(colors) {
        this.refs.queueSizeSelect.value = String(colors.length);
        this.refs.ballQueuePreview.innerHTML = '';
        colors.forEach((color, index) => {
            const item = this.document.createElement('li');
            item.className = 'ball-queue-item';
            item.setAttribute('aria-label', `第 ${index + 1} 個：${COLORS[color]}`);
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
        this.refs.comboBadge.textContent = `COMBO x${count}!`;
        this.refs.comboBadge.style.display = count > 1 ? 'block' : 'none';
    }

    renderScores(score, highScore, startingHighScore) {
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
        refs.kingStatusText.textContent = newRecord ? '🔥 你已登上國王寶座！' : '超越國王即登基！';
        refs.kingStatusText.classList.toggle('new-record', newRecord);
    }

    hideGameOver() {
        this.refs.gameOverModal.classList.remove('show');
        this.refs.gameOverModal.setAttribute('aria-hidden', 'true');
        this.refs.gameOverModal.inert = true;
        if (this.document.activeElement === this.refs.modalRestartBtn) this.refs.restartBtn.focus({preventScroll: true});
    }

    showGameOver(score, startingHighScore) {
        const newRecord = score > startingHighScore;
        this.refs.modalTitle.textContent = newRecord ? '🏆 恭迎新國王！' : '遊戲結束';
        this.refs.modalMessage.textContent = newRecord
            ? `太神啦！你以 ${score} 分刷新了最高紀錄！` : `棋盤已滿！最終得分：${score} 分`;
        this.refs.gameOverModal.inert = false;
        this.refs.gameOverModal.setAttribute('aria-hidden', 'false');
        this.refs.gameOverModal.classList.add('show');
        this.refs.modalRestartBtn.focus({preventScroll: true});
    }
}
