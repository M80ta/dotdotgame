// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
(() => {
    const script = document.currentScript;
    const main = new URL('./main.js', script.src);
    main.search = new URL(script.src).search;
    const panel = document.getElementById('startupState');
    let loaded = false;
    let failed = false;
    let reloading = false;
    if (script.dataset.offline === 'true' && 'serviceWorker' in navigator) {
        try {
        const hadController = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if ((hadController || failed) && !reloading) {
                reloading = true;
                window.location.reload();
            }
        });
        void navigator.serviceWorker.register(new URL('../service-worker.js', script.src), {updateViaCache: 'none'})
            .catch(() => { /* First-load caching may fail; the retry UI remains available. */ });
        } catch { /* A browser policy blocking service workers must not block the game. */ }
    }
    void import(main.href).then(() => {
        if (![...document.querySelectorAll('link[rel="stylesheet"]')].every(link => link.sheet)) {
            throw new Error('Game styles did not load');
        }
        loaded = true;
        panel.hidden = true;
    }).catch(() => {
        failed = true;
        panel.hidden = false;
        document.getElementById('startupText').textContent =
            '網路暫時無法載入遊戲，請重新載入。 / The game could not load. Please retry.';
    });
    window.addEventListener('online', () => {
        if (!loaded && failed && !reloading) { reloading = true; window.location.reload(); }
    });
})();
