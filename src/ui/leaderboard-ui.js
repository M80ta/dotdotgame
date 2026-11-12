// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export class LeaderboardUI {
    constructor(document, i18n) {
        Object.assign(this, {document, i18n});
        const ids = ['leaderboardBtn', 'modalLeaderboardBtn', 'leaderboardModal', 'leaderboardClose', 'leaderboardRefresh',
            'leaderboardRows', 'leaderboardState', 'leaderboardDifficulty', 'kingName', 'scoreForm', 'playerName', 'playerComment', 'submitScoreBtn', 'submissionState'];
        this.refs = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
        this.submission = {code: 'prompt', params: {}};
    }
    bind({open, refresh, submit}) {
        for (const key of ['leaderboardBtn', 'modalLeaderboardBtn']) this.refs[key].addEventListener('click', open);
        this.refs.leaderboardClose.addEventListener('click', () => this.close());
        this.refs.leaderboardRefresh.addEventListener('click', refresh);
        this.refs.leaderboardModal.addEventListener('click', event => {
            if (event.target === this.refs.leaderboardModal) this.close();
        });
        this.refs.leaderboardModal.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); this.close(); }
            if (event.key === 'Tab') {
                const edge = event.shiftKey ? this.refs.leaderboardClose : this.refs.leaderboardRefresh;
                if (this.document.activeElement === edge) {
                    event.preventDefault();
                    (event.shiftKey ? this.refs.leaderboardRefresh : this.refs.leaderboardClose).focus();
                }
            }
        });
        this.refs.scoreForm.addEventListener('submit', event => {
            event.preventDefault();
            void submit({name: this.refs.playerName.value, comment: this.refs.playerComment.value});
        });
    }
    open() {
        this.previousFocus = this.document.activeElement;
        this.refs.leaderboardModal.inert = false;
        this.refs.leaderboardModal.classList.add('show');
        this.refs.leaderboardModal.setAttribute('aria-hidden', 'false');
        this.refs.leaderboardClose.focus();
    }
    close() {
        this.refs.leaderboardModal.inert = true;
        this.refs.leaderboardModal.classList.remove('show');
        this.refs.leaderboardModal.setAttribute('aria-hidden', 'true');
        (this.previousFocus ?? this.refs.leaderboardBtn).focus({preventScroll: true});
    }
    resetForm(name) {
        this.refs.playerName.value = name;
        this.refs.playerComment.value = '';
        this.setSubmission(this.service?.configured ? 'prompt' : 'setup');
    }
    focusName() { this.refs.playerName.focus({preventScroll: true}); }
    setSubmission(code, params = {}) {
        this.submission = {code, params};
        this.refs.submissionState.textContent = this.i18n.t(`ranking.${code}`, params);
        this.refs.submitScoreBtn.disabled = ['sending', 'rank', 'queued', 'queuedSetup'].includes(code);
        const locked = ['sending', 'rank', 'queued', 'queuedSetup', 'unsaved'].includes(code);
        this.refs.playerName.disabled = this.refs.playerComment.disabled = locked;
    }
    render(service) {
        this.service = service;
        this.refs.leaderboardDifficulty.textContent = this.i18n.t('ranking.difficulty', {size: service.boardSize, count: service.batchSize});
        this.refs.leaderboardState.textContent = this.i18n.t(`ranking.${service.state}`);
        this.refs.kingName.textContent = service.topName || this.i18n.t(service.known ? 'ranking.noKing' : 'ranking.unknownKing');
        this.refs.leaderboardRows.innerHTML = '';
        let rank = 0;
        let previousScore = null;
        service.entries.forEach((entry, index) => {
            rank = entry.score === previousScore ? rank : index + 1;
            previousScore = entry.score;
            const row = this.document.createElement('tr');
            for (const text of [String(rank), entry.name, String(entry.score), entry.comment]) {
                const cell = this.document.createElement('td');
                cell.textContent = text;
                row.appendChild(cell);
            }
            this.refs.leaderboardRows.appendChild(row);
        });
        if (!service.entries.length) {
            const row = this.document.createElement('tr');
            const cell = this.document.createElement('td');
            cell.setAttribute('colspan', '4');
            cell.textContent = this.i18n.t(service.known ? 'ranking.empty' : 'ranking.noSnapshot');
            row.appendChild(cell);
            this.refs.leaderboardRows.appendChild(row);
        }
    }
    localize() {
        if (this.service) this.render(this.service);
        this.setSubmission(this.submission.code, this.submission.params);
    }
}
