// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {GameA} from './game-a.js';
import {Board} from '../board/board.js';

/** Coordinates model, UI, persistence and async animation; no board algorithms. */
export class GameController {
    constructor({ui, boardView, animator, store, sessionStore, random = Math.random, onError = console.error}) {
        Object.assign(this, {ui, boardView, animator, store, sessionStore, random, onError});
        this.version = 0;
        this.processing = false;
        this.highScore = store.read();
        this.boardView.onCellClick = (r, c) => this.handleCellClick(r, c);
        ui.bind({restart: () => this.restart()});
    }

    start() {
        const session = this.sessionStore.read();
        const game = GameA.fromSnapshot(session?.game, {random: this.random});
        if (game) this.activateGame(game, session);
        else this.restart();
    }

    restart() {
        this.sessionStore.clear();
        const game = new GameA({...this.ui.settings, random: this.random});
        this.activateGame(game, {newCells: game.initialBalls});
    }

    activateGame(game, {startingHighScore = this.highScore, combo = 0, message, newCells = new Set()} = {}) {
        this.version++;
        this.animator.cancel();
        this.game = game;
        this.startingHighScore = startingHighScore;
        this.combo = combo;
        this.message = message ?? `先選球，再點可到達的空格；每次移動後隨機新增 ${game.batchSize} 顆球`;
        this.lastSaveSucceeded = true;
        this.processing = false;
        this.updateHighScore();
        this.ui.setSettings({boardSize: game.board.size, batchSize: game.batchSize});
        this.renderGame(newCells);
        this.persistSession();
    }

    renderGame(newCells = new Set()) {
        const game = this.game;
        this.ui.setProcessing(this.processing);
        this.ui.renderPreview(game.preview);
        this.ui.renderScores(game.score, this.highScore, this.startingHighScore);
        this.ui.setCombo(this.combo);
        this.ui.setHint(this.lastSaveSucceeded === false && !game.isOver
            ? `${this.message}（瀏覽器目前無法儲存進度）` : this.message);
        this.boardView.render(game.board, game.selectedBall, newCells);
        if (game.isOver) this.ui.showGameOver(game.score, this.startingHighScore);
        else this.ui.hideGameOver();
    }

    updateHighScore() {
        const highScore = Math.max(this.highScore, this.game.score, this.startingHighScore);
        if (highScore > this.highScore) {
            this.highScore = highScore;
            this.store.save(highScore);
        }
    }

    persistSession() {
        if (this.game.isOver) return this.sessionStore.clear();
        const saved = this.sessionStore.save({
            game: this.game.toSnapshot(), startingHighScore: this.startingHighScore,
            combo: this.combo, message: this.message
        });
        this.lastSaveSucceeded = saved;
        if (!saved) this.ui.setHint(`${this.message}（瀏覽器目前無法儲存進度）`);
        return saved;
    }

    finishProcessing() {
        this.processing = false;
        this.ui.setProcessing(false);
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
            if (messages[move.type]) {
                this.message = messages[move.type];
                this.ui.setHint(this.message);
            }
            if (move.type === 'selected' || move.type === 'deselected') this.boardView.render(this.game.board, this.game.selectedBall);
            if (move.type !== 'ignored') this.persistSession();
            return;
        }

        const game = this.game;
        const version = this.version;
        this.processing = true;
        this.ui.setProcessing(true);
        this.ui.setCombo(0);
        this.ui.setHint('球正在沿最短路徑移動…');
        try {
            // Commit one complete turn before any await. Refreshing during an
            // animation restores this result, without repeating random spawns.
            const {spawned, lines} = game.moveAndSpawn(move);
            const revealBoard = new Board(game.board.size);
            revealBoard.cells = game.board.cells.map(row => [...row]);
            const result = game.finishTurn(lines);
            this.updateHighScore();
            this.combo = result.combo;
            this.message = game.isOver ? '棋盤已滿，遊戲結束'
                : result.cleared > 0 ? `消除 ${result.cleared} 顆 × ${result.combo} 條連線，獲得 ${result.earned} 分`
                : `已新增 ${spawned.size} 顆球；請選球繼續移動`;
            this.persistSession();

            await this.animator.move(move);
            if (version !== this.version) return;
            this.ui.renderPreview(game.preview);
            this.boardView.render(revealBoard, null, spawned);
            await this.animator.wait(200);
            if (version !== this.version) return;
            await this.animator.clear(lines.cells);
            if (version !== this.version) return;
            this.renderGame();
        } catch (error) {
            if (version === this.version) {
                this.onError(error);
                game.selectedBall = null;
                if (!game.isOver) this.message = '動畫未完成，請繼續選球';
                this.renderGame();
                this.persistSession();
            }
        } finally {
            // Restarting makes every pending stage of the previous turn stale.
            if (version === this.version) {
                this.finishProcessing();
            }
        }
    }
}
