// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export class RankingsController {
    constructor({service, view, createId = () => crypto.randomUUID()}) {
        Object.assign(this, {service, view, createId});
        view.bind({open: () => this.open(), refresh: () => this.refresh(), submit: values => this.submit(values)});
        this.view.render(this.service);
    }
    get known() { return this.service.known; }
    get topScore() { return this.service.topScore; }
    attach(game) { this.game = game; }
    onGameStart() {
        this.result = null;
        this.view.resetForm(this.service.playerName);
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
        if (this.refreshing) return this.refreshing;
        this.service.state = 'loading';
        this.view.render(this.service);
        this.refreshing = (async () => {
            const sent = await this.service.flush();
            await this.service.load();
            this.sync();
            const submitted = sent.find(entry => entry.id === this.result?.id);
            if (submitted) {
                this.result.submitted = true;
                this.view.setSubmission('rank', {rank: submitted.rank});
            }
        })().finally(() => { this.refreshing = null; });
        return this.refreshing;
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
