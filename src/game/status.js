// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Save semantic status codes so the same game can be displayed in any language.
const PARAMS = {
    default: ['count'], selected: [], deselected: [], 'selection-required': [], blocked: [],
    cleared: ['balls', 'lines', 'points'], spawned: ['count'], 'game-over': [], interrupted: []
};

export function isValidStatus(status) {
    return Boolean(status && Object.hasOwn(PARAMS, status.code) && status.params
        && typeof status.params === 'object' && !Array.isArray(status.params)
        && PARAMS[status.code].every(key => Number.isSafeInteger(status.params[key]) && status.params[key] >= 0));
}

/** Backward compatibility with v1 saves that contain Chinese-only status text. */
export function restoreStatus(status, message, game) {
    if (isValidStatus(status)) return {code: status.code, params: {...status.params}};
    const cleared = message?.match(/^消除 (\d+) 顆 × (\d+) 條連線，獲得 (\d+) 分/);
    if (cleared) return {code: 'cleared', params: {balls: Number(cleared[1]), lines: Number(cleared[2]), points: Number(cleared[3])}};
    const spawned = message?.match(/^已新增 (\d+) 顆球/);
    if (spawned) return {code: 'spawned', params: {count: Number(spawned[1])}};
    const legacy = {
        '先選擇一顆球，再點擊可到達的空格': 'deselected',
        '請先選擇棋盤上的一顆球': 'selection-required',
        '無法到達：路徑被球擋住了，請選擇其他空格': 'blocked',
        '動畫未完成，請繼續選球': 'interrupted'
    };
    if (Object.hasOwn(legacy, message)) return {code: legacy[message], params: {}};
    return game.selectedBall ? {code: 'selected', params: {}} : {code: 'default', params: {count: game.batchSize}};
}
