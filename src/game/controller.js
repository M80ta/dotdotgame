// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {GameA} from './game-a.js';
import {Board} from '../board/board.js';
import {restoreStatus} from './status.js';
import {findSuggestedMove} from './hints.js';

/** Coordinates model, UI, persistence and async animation; no board algorithms. */
export class GameController {
    constructor({ui, boardView, animator, store, sessionStore, audio = null, random = Math.random, onError = console.error}) {
        Object.assign(this, {ui, boardView, animator, store, sessionStore, audio, random, onError});
        this.i18n = ui.i18n;
        this.version = 0;
        this.processing = false;
        this.highScore = store.read();
        this.boardView.onCellClick = (r, c) => this.handleCellClick(r, c);
        ui.bind({
            restart: () => this.restart(), changeLanguage: language => this.changeLanguage(language),
            requestHint: () => this.requestHint(),
            toggleSound: () => {
                if (!this.audio) return;
                this.audio.setEnabled(!this.audio.enabled);
                this.ui.setSoundEnabled(this.audio.enabled);
            }
        });
        ui.setSoundEnabled(this.audio?.enabled ?? true);
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

    activateGame(game, {startingHighScore = this.highScore, combo = 0, message, status, newCells = new Set()} = {}) {
        this.version++;
        this.audio?.stopAll();
        this.animator.cancel();
        this.game = game;
        this.startingHighScore = startingHighScore;
        this.combo = combo;
        this.status = restoreStatus(status, message, game);
        this.message = this.i18n.t(`hint.${this.status.code}`, this.status.params);
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
        this.renderHint();
        this.boardView.render(game.board, game.selectedBall, newCells);
        if (game.isOver) this.ui.showGameOver(game.score, this.startingHighScore);
        else this.ui.hideGameOver();
    }

    setStatus(code, params = {}) {
        this.status = {code, params};
        this.message = this.i18n.t(`hint.${code}`, params);
    }

    renderHint() {
        const message = this.processing ? this.i18n.t('hint.moving') : this.message;
        this.ui.setHint(this.lastSaveSucceeded === false && !this.game.isOver
            ? this.i18n.t('hint.unsaved', {message}) : message);
    }

    changeLanguage(language) {
        if (!this.i18n.setLanguage(language)) return;
        this.ui.localize();
        this.boardView.localize();
        this.message = this.i18n.t(`hint.${this.status.code}`, this.status.params);
        this.renderHint();
        this.persistSession();
    }

    requestHint() {
        if (this.processing || this.game.isOver) return;
        const hint = findSuggestedMove(this.game.board);
        if (!hint) return;
        this.game.selectedBall = {...hint.source};
        this.setStatus('selected');
        this.boardView.render(this.game.board, this.game.selectedBall);
        this.persistSession();
        this.boardView.flashHintTarget(hint.target);
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
            combo: this.combo, message: this.message, status: this.status
        });
        this.lastSaveSucceeded = saved;
        this.renderHint();
        return saved;
    }

    finishProcessing() {
        this.processing = false;
        this.ui.setProcessing(false);
        this.renderHint();
    }

    async handleCellClick(r, c) {
        if (this.processing) return;
        const move = this.game.selectCell(r, c);
        if (move.type !== 'move') {
            if (move.type === 'selected' || move.type === 'deselected') this.audio?.playSelect();
            if (move.type !== 'ignored') {
                this.setStatus(move.type);
                this.renderHint();
            }
            if (move.type === 'selected' || move.type === 'deselected') this.boardView.render(this.game.board, this.game.selectedBall);
            if (move.type !== 'ignored') this.persistSession();
            return;
        }

        const game = this.game;
        const version = this.version;
        this.boardView.clearHint();
        this.processing = true;
        this.ui.setProcessing(true);
        this.ui.setCombo(0);
        this.renderHint();
        let stopMovement;
        try {
            // Commit one complete turn before any await. Refreshing during an
            // animation restores this result, without repeating random spawns.
            const {spawned, lines} = game.moveAndSpawn(move);
            const revealBoard = new Board(game.board.size);
            revealBoard.cells = game.board.cells.map(row => [...row]);
            const result = game.finishTurn(lines);
            this.updateHighScore();
            this.combo = result.combo;
            if (game.isOver) this.setStatus('game-over');
            else if (result.cleared > 0) this.setStatus('cleared', {balls: result.cleared, lines: result.combo, points: result.earned});
            else this.setStatus('spawned', {count: spawned.size});
            this.persistSession();

            stopMovement = this.audio?.startMove();
            await this.animator.move(move);
            stopMovement?.();
            if (version !== this.version) return;
            this.ui.renderPreview(game.preview);
            this.boardView.render(revealBoard, null, spawned);
            await this.animator.wait(200);
            if (version !== this.version) return;
            this.audio?.playClear(lines.cells.size);
            await this.animator.clear(lines.cells);
            if (version !== this.version) return;
            this.renderGame();
        } catch (error) {
            if (version === this.version) {
                this.onError(error);
                game.selectedBall = null;
                if (!game.isOver) this.setStatus('interrupted');
                this.renderGame();
                this.persistSession();
            }
        } finally {
            stopMovement?.();
            // Restarting makes every pending stage of the previous turn stale.
            if (version === this.version) {
                this.finishProcessing();
            }
        }
    }
}
