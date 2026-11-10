// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {GameA} from './game-a.js';

/** Coordinates model, UI, persistence and async animation; no board algorithms. */
export class GameController {
    constructor({ui, boardView, animator, store, random = Math.random, onError = console.error}) {
        Object.assign(this, {ui, boardView, animator, store, random, onError});
        this.version = 0;
        this.processing = false;
        this.highScore = store.read();
        this.boardView.onCellClick = (r, c) => this.handleCellClick(r, c);
        ui.bind({restart: () => this.restart(), changeBatchSize: count => this.changeBatchSize(count)});
    }

    restart() {
        this.version++;
        this.animator.cancel();
        this.game = new GameA({...this.ui.settings, random: this.random});
        this.startingHighScore = this.highScore;
        this.processing = false;
        this.ui.setProcessing(false);
        this.ui.hideGameOver();
        this.ui.setCombo(0);
        this.ui.renderPreview(this.game.preview);
        this.ui.renderScores(0, this.highScore, this.startingHighScore);
        this.boardView.render(this.game.board, null, this.game.initialBalls);
        this.setDefaultHint();
    }

    setDefaultHint() {
        this.ui.setHint(`先選球，再點可到達的空格；每次移動後隨機新增 ${this.game.batchSize} 顆球`);
    }

    changeBatchSize(count) {
        if (!this.processing) this.game.setBatchSize(count);
        this.ui.renderPreview(this.game.preview);
        if (!this.game.isOver) this.setDefaultHint();
    }

    async handleCellClick(r, c) {
        if (this.processing) return;
        const move = this.game.selectCell(r, c);
        const messages = {
            selected: '已選取球，請點擊可到達的空格；再次點選可取消',
            deselected: '先選擇一顆球，再點擊可到達的空格',
            'selection-required': '請先選擇棋盤上的一顆球',
            blocked: '無法到達：路徑被球擋住了，請選擇其他空格'
        };
        if (move.type !== 'move') {
            if (messages[move.type]) this.ui.setHint(messages[move.type]);
            if (move.type === 'selected' || move.type === 'deselected') this.boardView.render(this.game.board, this.game.selectedBall);
            return;
        }

        const game = this.game;
        const version = this.version;
        this.processing = true;
        this.ui.setProcessing(true);
        this.ui.setCombo(0);
        this.ui.setHint('球正在沿最短路徑移動…');
        try {
            await this.animator.move(move);
            if (version !== this.version) return;
            const {spawned, lines} = game.moveAndSpawn(move);
            this.ui.renderPreview(game.preview);
            this.boardView.render(game.board, null, spawned);
            await this.animator.wait(200);
            if (version !== this.version) return;
            await this.animator.clear(lines.cells);
            if (version !== this.version) return;
            const result = game.finishTurn(lines);
            if (game.score > this.highScore) {
                this.highScore = game.score;
                this.store.save(this.highScore);
            }
            this.ui.setCombo(result.combo);
            this.ui.renderScores(game.score, this.highScore, this.startingHighScore);
            if (result.cleared > 0) {
                this.boardView.render(game.board, null);
                this.ui.setHint(`消除 ${result.cleared} 顆 × ${result.combo} 條連線，獲得 ${result.earned} 分`);
            } else {
                this.ui.setHint(`已新增 ${spawned.size} 顆球；請選球繼續移動`);
            }
            if (game.isOver) {
                this.ui.setHint('棋盤已滿，遊戲結束');
                this.ui.showGameOver(game.score, this.startingHighScore);
            }
        } catch (error) {
            if (version === this.version) {
                this.onError(error);
                game.selectedBall = null;
                this.boardView.render(game.board, null);
                this.ui.setHint('移動未完成，請重新選球');
            }
        } finally {
            // Restarting makes every pending stage of the previous turn stale.
            if (version === this.version) {
                this.processing = false;
                this.ui.setProcessing(false);
            }
        }
    }
}
