// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {DEFAULT_HIGH_SCORE, HIGH_SCORE_KEY} from '../config.js';

export class HighScoreStore {
    constructor(getStorage) {
        this.getStorage = getStorage;
    }

    read() {
        try {
            const saved = this.getStorage().getItem(HIGH_SCORE_KEY);
            const score = Number(saved);
            if (saved !== null && Number.isFinite(score) && score >= 0) return Math.floor(score);
        } catch {
            // Private browsing or blocked storage must not prevent playing.
        }
        return DEFAULT_HIGH_SCORE;
    }

    save(score) {
        try {
            this.getStorage().setItem(HIGH_SCORE_KEY, String(score));
        } catch {
            // The current session still keeps its high score in memory.
        }
    }
}
