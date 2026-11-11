import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {buildOffline} from '../scripts/offline-build.mjs';

const scope = 'https://example.com/dotdotgame/';
const prefix = `nini-doudou:${scope}:`;
const digest = text => createHash('sha256').update(text).digest('hex');
const core = [{'url': 'index.html', hash: digest('game page')}, {url: 'src/main.js?v=1.2.0', hash: digest('game code')}];

async function workerFixture({assets = core, content = {}, offline = false} = {}) {
    const events = {};
    const store = new Map();
    const key = request => typeof request === 'string' ? request : request.url;
    const caches = {
        async open(name) {
            if (!store.has(name)) store.set(name, new Map());
            const entries = store.get(name);
            return {
                async put(request, response) { entries.set(key(request), response.clone()); },
                async match(request) { return entries.get(key(request))?.clone(); }
            };
        },
        async keys() { return [...store.keys()]; },
        async delete(name) { return store.delete(name); }
    };
    const self = {
        registration: {scope},
        addEventListener(name, callback) { events[name] = callback; },
        async skipWaiting() { self.waitingSkipped = true; },
        clients: {async claim() { self.claimed = true; }}
    };
    const network = {offline, calls: []};
    const source = (await readFile(new URL('../offline/service-worker.js', import.meta.url), 'utf8'))
        .replace('__APP_VERSION__', 'test-release').replace('/*__ASSETS__*/ []', JSON.stringify(assets));
    vm.runInNewContext(source, {self, caches, URL, Request, crypto: webcrypto, AbortController, setTimeout, clearTimeout,
        fetch: async request => {
            network.calls.push(key(request));
            if (network.offline) throw new Error('Offline');
            const url = new URL(key(request));
            const body = content[url.pathname] ?? (url.pathname.endsWith('index.html') ? 'game page' : 'game code');
            return new Response(body);
        }
    });
    function lifecycle(name) {
        let pending;
        events[name]({waitUntil(promise) { pending = promise; }});
        return pending;
    }
    function request(url, {method = 'GET', mode = 'cors'} = {}) {
        let result;
        events.fetch({request: {url, method, mode}, respondWith(promise) { result = promise; }});
        return result;
    }
    return {self, caches, store, network, lifecycle, request};
}

test('a complete verified release can serve the game and its modules with the network unavailable', async () => {
    const worker = await workerFixture();
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    assert.equal(worker.self.claimed, true);
    worker.network.offline = true;
    assert.equal(await (await worker.request(scope, {mode: 'navigate'})).text(), 'game page');
    assert.equal(await (await worker.request(scope + '?refresh=1', {mode: 'navigate'})).text(), 'game page');
    assert.equal(await (await worker.request(scope + 'src/main.js?v=1.2.0')).text(), 'game code');
});

test('mixed or incomplete downloads reject the new snapshot and preserve the previous release', async () => {
    const worker = await workerFixture({content: {'/dotdotgame/src/main.js': 'outdated code'}});
    const old = await worker.caches.open(prefix + 'previous');
    await old.put(scope + 'index.html', new Response('previous working game'));
    await assert.rejects(worker.lifecycle('install'), /previous complete/);
    assert.deepEqual(await worker.caches.keys(), [prefix + 'previous']);
    assert.equal(await (await old.match(scope + 'index.html')).text(), 'previous working game');
    assert.equal(worker.self.waitingSkipped, undefined);
});

test('activation cleans only old caches belonging to this game scope', async () => {
    const worker = await workerFixture();
    await worker.caches.open(prefix + 'old');
    await worker.caches.open('nini-doudou:https://example.com/another-game/:old');
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    const names = await worker.caches.keys();
    assert.equal(names.includes(prefix + 'old'), false);
    assert.ok(names.includes(prefix + 'test-release'));
    assert.ok(names.includes('nini-doudou:https://example.com/another-game/:old'));
});

test('leaderboard API calls, score posts and other projects are never intercepted or cached', async () => {
    const worker = await workerFixture();
    assert.equal(worker.request('https://example.supabase.co/rest/v1/rpc/get_leaderboard'), undefined);
    assert.equal(worker.request(scope + 'api', {method: 'POST'}), undefined);
    assert.equal(worker.request('https://example.com/another-game/'), undefined);
    await worker.lifecycle('install');
    assert.equal(await (await worker.request(scope + 'README.md', {mode: 'navigate'})).text(), 'game code');
});

test('built HTML, dependencies and offline hashes consistently identify one release', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'nini-offline-'));
    try {
        await mkdir(path.join(directory, 'src'));
        await mkdir(path.join(directory, 'styles'));
        await writeFile(path.join(directory, 'index.html'), '<script src="./src/bootstrap.js" data-offline="false"></script><link href="./styles/base.css">');
        await writeFile(path.join(directory, 'src/bootstrap.js'), '/* bootstrap */');
        await writeFile(path.join(directory, 'src/main.js'), "import {x} from './config.js';");
        await writeFile(path.join(directory, 'src/config.js'), 'export const x = 1;');
        await writeFile(path.join(directory, 'styles/base.css'), 'body { color: white; }');
        await buildOffline(directory, '1.2.0');
        const html = await readFile(path.join(directory, 'index.html'), 'utf8');
        assert.match(html, /bootstrap\.js\?v=1\.2\.0/);
        assert.match(html, /base\.css\?v=1\.2\.0/);
        assert.match(html, /data-offline="true"/);
        assert.match(await readFile(path.join(directory, 'src/main.js'), 'utf8'), /config\.js\?v=1\.2\.0/);
        const worker = await readFile(path.join(directory, 'service-worker.js'), 'utf8');
        const manifest = JSON.parse(worker.match(/const ASSETS = (\[[^\n]+\]);/)[1]);
        for (const asset of manifest) {
            assert.equal(asset.hash, digest(await readFile(path.join(directory, asset.url.split('?')[0]))));
        }
        assert.ok(manifest.some(asset => asset.url === 'src/main.js?v=1.2.0'));
        assert.ok(manifest.some(asset => asset.url === 'index.html'));
    } finally {
        const resolved = path.resolve(directory);
        assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
        assert.ok(path.basename(resolved).startsWith('nini-offline-'));
        await rm(resolved, {recursive: true, force: true});
    }
});
