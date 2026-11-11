// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {LEADERBOARD_CONFIG} from './leaderboard-config.js';

const CACHE_KEY = 'nini_doudou_rankings_v1';
const QUEUE_KEY = 'nini_doudou_pending_scores_v1';
const NAME_KEY = 'nini_doudou_player_name';
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const textLength = text => [...text].length;

export function validateScore(entry) {
    return Boolean(entry && typeof entry.id === 'string' && UUID.test(entry.id) && typeof entry.name === 'string'
        && entry.name.trim() && textLength(entry.name) <= 24
        && typeof entry.comment === 'string' && textLength(entry.comment) <= 160
        && !/[\u0000-\u001f\u007f]/.test(entry.name + entry.comment)
        && Number.isSafeInteger(entry.score) && entry.score >= 0 && entry.score <= 10000000
        && [8, 9, 10].includes(entry.boardSize) && [3, 4, 5].includes(entry.batchSize));
}

/** Shared scores with a last-known snapshot and an idempotent offline outbox. */
export class LeaderboardService {
    constructor({getStorage = () => window.localStorage, fetch = (...args) => window.fetch(...args),
        config = LEADERBOARD_CONFIG, timeout = 8000} = {}) {
        Object.assign(this, {getStorage, fetch, config, timeout});
        this.entries = [];
        this.known = false;
        this.state = 'loading';
        const cached = this.read(CACHE_KEY, null);
        if (cached?.version === 1 && Array.isArray(cached.entries) && cached.entries.every(validateScore)) {
            this.entries = cached.entries.slice(0, 50);
            this.known = true;
        }
        const queued = this.read(QUEUE_KEY, []);
        this.pending = Array.isArray(queued) ? queued.filter(validateScore).slice(0, 20) : [];
    }

    get configured() {
        return typeof this.config?.url === 'string' && /^https:\/\//.test(this.config.url)
            && typeof this.config.publishableKey === 'string' && Boolean(this.config.publishableKey);
    }
    get topScore() { return this.entries[0]?.score ?? 0; }
    get topName() { return this.entries[0]?.name ?? ''; }
    get playerName() { const value = this.read(NAME_KEY, ''); return typeof value === 'string' ? value.slice(0, 24) : ''; }

    read(key, fallback) {
        try { return JSON.parse(this.getStorage().getItem(key)) ?? fallback; } catch { return fallback; }
    }

    write(key, value) {
        try { this.getStorage().setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    }

    async request(method, body) {
        if (!this.configured) throw new Error('setup');
        const controller = new AbortController();
        let timer;
        try {
            const headers = {'Content-Type': 'application/json', apikey: this.config.publishableKey};
            if (this.config.publishableKey.startsWith('eyJ')) headers.Authorization = `Bearer ${this.config.publishableKey}`;
            return await Promise.race([
                (async () => {
                    const response = await this.fetch(`${this.config.url.replace(/\/$/, '')}/rest/v1/rpc/${method}`, {
                        method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, cache: 'no-store'
                    });
                    if (!response.ok) throw new Error('offline');
                    return response.json();
                })(),
                new Promise((resolve, reject) => {
                    timer = setTimeout(() => { controller.abort(); reject(new Error('offline')); }, this.timeout);
                })
            ]);
        } finally { clearTimeout(timer); }
    }

    async load() {
        if (!this.configured) { this.state = 'setup'; return; }
        try {
            const data = await this.request('get_leaderboard', {p_limit: 50});
            if (!Array.isArray(data.entries) || !data.entries.every(validateScore)) throw new Error('Invalid leaderboard');
            this.entries = data.entries.slice(0, 50);
            this.known = true;
            this.state = 'ready';
            this.write(CACHE_KEY, {version: 1, entries: this.entries});
        } catch { this.state = 'offline'; }
    }

    async send(entry) {
        const result = await this.request('submit_score', {
            p_id: entry.id, p_name: entry.name, p_comment: entry.comment, p_score: entry.score,
            p_board_size: entry.boardSize, p_batch_size: entry.batchSize
        });
        if (!Number.isSafeInteger(result.rank) || result.rank < 1) throw new Error('Invalid rank');
        return result.rank;
    }

    async submit(entry) {
        if (!validateScore(entry)) throw new Error('invalid');
        this.write(NAME_KEY, entry.name);
        if (!this.pending.some(item => item.id === entry.id) && this.pending.length >= 20) throw new Error('queue-full');
        this.pending = [...this.pending.filter(item => item.id !== entry.id), entry];
        const persisted = this.write(QUEUE_KEY, this.pending);
        try {
            const rank = await this.send(entry);
            this.pending = this.pending.filter(item => item.id !== entry.id);
            this.write(QUEUE_KEY, this.pending);
            await this.load();
            return {rank, queued: false};
        } catch {
            return {rank: null, queued: true, persisted};
        }
    }

    async flush() {
        const sent = [];
        if (!this.configured) return sent;
        for (const entry of [...this.pending]) {
            try { sent.push({id: entry.id, rank: await this.send(entry)}); } catch { break; }
            this.pending = this.pending.filter(item => item.id !== entry.id);
            this.write(QUEUE_KEY, this.pending);
        }
        return sent;
    }
}
