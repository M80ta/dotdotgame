// Required Notice: Copyright (c) 2026 M80ta
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Build substitutes a release manifest, including SHA-256 for every core file.
const VERSION = '__APP_VERSION__';
const ASSETS = /*__ASSETS__*/ [];
const PREFIX = `nini-doudou:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const absolute = path => new URL(path, self.registration.scope).href;
const optional = ['assets/doudou-icon-180.png', 'assets/doudou-icon-32.png', 'assets/audio/dou.wav'];

async function download(cache, path, hash, milliseconds) {
    const controller = new AbortController();
    let timer;
    try {
        await Promise.race([
            (async () => {
                const response = await fetch(new Request(absolute(path), {cache: 'reload', signal: controller.signal}));
                if (!response.ok) throw new Error('Incomplete offline release');
                if (hash) {
                    const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
                    const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
                    if (actual !== hash) throw new Error('Mixed offline release');
                }
                await cache.put(absolute(path), response);
            })(),
            new Promise((resolve, reject) => {
                timer = setTimeout(() => { controller.abort(); reject(new Error('Offline download timed out')); }, milliseconds);
            })
        ]);
    } finally { clearTimeout(timer); }
}

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        const results = await Promise.allSettled(ASSETS.map(({url, hash}) => download(cache, url, hash, 12000)));
        if (results.some(result => result.status === 'rejected')) {
            await caches.delete(CACHE);
            throw new Error('Keep the previous complete offline release');
        }
        await Promise.allSettled(optional.map(path => download(cache, path, null, 2000)));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const scope = new URL(self.registration.scope);
    if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const appNavigation = event.request.mode === 'navigate' && [scope.pathname, scope.pathname + 'index.html',
            scope.pathname + 'dot_and_crown_fixed.html'].includes(url.pathname);
        const key = appNavigation ? absolute('index.html') : event.request;
        const cached = await cache.match(key);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && url.pathname.startsWith(scope.pathname + 'assets/')) {
            await cache.put(event.request, response.clone());
        }
        return response;
    })());
});
