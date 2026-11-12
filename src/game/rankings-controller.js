// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export class RankingsController {
    constructor({service, view, createId = () => crypto.randomUUID()}) {
        Object.assign(this, {service, view, createId});
        this.refreshes = new Map();
        view.bind({open: () => this.open(), refresh: () => this.refresh(), submit: values => this.submit(values)});
        this.view.render(this.service);
    }
    get known() { return this.service.known; }
    get topScore() { return this.service.topScore; }
    attach(game) { this.game = game; }
    onGameStart(game) {
        this.result = null;
        const changed = this.service.selectDifficulty(game.board.size, game.batchSize);
        this.view.render(this.service);
        this.view.resetForm(this.service.playerName);
        if (changed) void this.refresh();
    }
    onGameOver(game) {
        if (this.result?.game === game) return;
        this.result = {game, id: this.createId(), score: game.score, boardSize: game.board.size, batchSize: game.batchSize};
        this.view.resetForm(this.service.playerName);
        this.view.focusName();
    }
    sync() {
        this.view.render(this.service);
        this.game?.renderScorePanels();
    }
    open() {
        this.view.open();
        void this.refresh();
    }
    refresh() {
        const key = this.service.difficultyKey;
        if (this.refreshes.has(key)) return this.refreshes.get(key);
        const difficulty = {boardSize: this.service.boardSize, batchSize: this.service.batchSize};
        this.service.state = 'loading';
        this.view.render(this.service);
        const refreshing = (async () => {
            const sent = await this.service.flush();
            await this.service.load(difficulty);
            this.sync();
            const submitted = sent.find(entry => entry.id === this.result?.id);
            if (submitted) {
                this.result.submitted = true;
                this.view.setSubmission('rank', {rank: submitted.rank});
            }
        })().finally(() => { this.refreshes.delete(key); });
        this.refreshes.set(key, refreshing);
        return refreshing;
    }
    async submit({name, comment}) {
        if (!this.result || this.submitting || this.result.submitted) return;
        this.submitting = true;
        const result = this.result;
        this.view.setSubmission('sending');
        try {
            const entry = {id: result.id, score: result.score, boardSize: result.boardSize, batchSize: result.batchSize,
                name: name.trim(), comment: comment.trim()};
            const saved = await this.service.submit(entry);
            this.sync();
            if (result !== this.result) return;
            result.submitted = !saved.queued || saved.persisted;
            this.view.setSubmission(saved.queued
                ? (saved.persisted ? (this.service.configured ? 'queued' : 'queuedSetup') : 'unsaved')
                : 'rank', {rank: saved.rank});
        } catch (error) {
            if (result === this.result) this.view.setSubmission(error.message === 'queue-full' ? 'queueFull' : 'invalid');
        } finally {
            this.submitting = false;
        }
    }
    localize() { this.view.localize(); }
}
