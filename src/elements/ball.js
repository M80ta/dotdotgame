// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
export const COLORS = Object.freeze(['紅色', '藍色', '綠色', '黃色', '紫色']);

/** A batch has distinct colors; resizing preserves its existing prefix. */
export function createColorBatch(count, existing = [], random = Math.random) {
    if (!Number.isInteger(count) || count < 0 || count > COLORS.length) {
        throw new RangeError('Ball count must be between 0 and 5.');
    }
    const batch = [...new Set(existing)].filter(color => Number.isInteger(color) && color >= 0 && color < COLORS.length).slice(0, count);
    const available = COLORS.map((_, color) => color).filter(color => !batch.includes(color));
    while (batch.length < count) {
        batch.push(available.splice(Math.floor(random() * available.length), 1)[0]);
    }
    return batch;
}

/** Shared ball element for the board, preview, and moving overlay. */
export function createBallElement(document, color, {preview = false, isNew = false} = {}) {
    const ball = document.createElement('div');
    ball.className = `${preview ? 'ball-preview-circle' : 'ball'} color-${color}`;
    ball.setAttribute('aria-hidden', 'true');
    if (isNew) ball.classList.add('new-ball');
    return ball;
}
