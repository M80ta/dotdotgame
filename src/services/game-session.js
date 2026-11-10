// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {GAME_SESSION_KEY, GAME_SESSION_VERSION} from '../config.js';
import {isValidStatus} from '../game/status.js';

/** A single device/browser-local Game A save, separate from the high score. */
export class GameSessionStore {
    constructor(getStorage) {
        this.getStorage = getStorage;
    }

    read() {
        try {
            const saved = this.getStorage().getItem(GAME_SESSION_KEY);
            if (saved === null) return null;
            const data = JSON.parse(saved);
            if (data?.version === GAME_SESSION_VERSION && data.mode === 'A'
                && data.game && Number.isSafeInteger(data.startingHighScore) && data.startingHighScore >= 0
                && Number.isSafeInteger(data.combo) && data.combo >= 0 && data.combo <= 400
                && typeof data.message === 'string' && data.message.length <= 280) return data;
        } catch {
            // Invalid JSON, denied storage and old save formats must not block playing.
        }
        this.clear();
        return null;
    }

    save({game, startingHighScore, combo, message, status}) {
        try {
            this.getStorage().setItem(GAME_SESSION_KEY, JSON.stringify({
                version: GAME_SESSION_VERSION, mode: 'A', game, startingHighScore, combo, message,
                ...(isValidStatus(status) ? {status} : {})
            }));
            return true;
        } catch {
            return false;
        }
    }

    clear() {
        try {
            this.getStorage().removeItem(GAME_SESSION_KEY);
            return true;
        } catch {
            return false;
        }
    }
}
