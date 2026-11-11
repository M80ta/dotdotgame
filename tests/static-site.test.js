import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {test} from 'node:test';
import {createStaticServer} from '../scripts/serve.mjs';

test('HTML assets and every ES module import resolve with relative project-site paths', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const entries = [...html.matchAll(/(?:href|src)="(\.\/[^"#]+)"/g)].map(match => new URL('../' + match[1], import.meta.url));
    entries.push(new URL('../src/main.js', import.meta.url));
    const visited = new Set();
    async function visit(url) {
        if (visited.has(url.href)) return;
        visited.add(url.href);
        assert.equal((await stat(url)).isFile(), true, url.href);
        if (!url.pathname.endsWith('.js')) return;
        const source = await readFile(url, 'utf8');
        for (const [, dependency] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            assert.ok(dependency.startsWith('.'), `Browser import must be relative: ${dependency}`);
            await visit(new URL(dependency, url));
        }
    }
    for (const entry of entries) await visit(entry);
    assert.ok(visited.size >= 16);
});

test('static server serves modules with JavaScript MIME and excludes Git/config/test files', async () => {
    const server = createStaticServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const route of ['/', '/index.html', '/src/main.js', '/styles/responsive.css', '/assets/doudou-icon-32.png', '/assets/doudou.ico', '/assets/audio/dou.wav', '/dot_and_crown_fixed.html', '/README.md', '/README.zh-TW.md']) {
            const response = await fetch(base + route);
            assert.equal(response.status, 200, route);
            if (route.endsWith('.js')) assert.match(response.headers.get('content-type'), /text\/javascript/);
            if (route.endsWith('.png')) assert.match(response.headers.get('content-type'), /image\/png/);
            if (route.endsWith('.ico')) assert.match(response.headers.get('content-type'), /image\/vnd.microsoft.icon/);
            if (route.endsWith('.wav')) assert.match(response.headers.get('content-type'), /audio\/wav/);
            await response.text();
        }
        for (const route of ['/.git/config', '/.env', '/tests/game-a.test.js', '/package.json', '/src/%2e%2e/%2e%2e/.git/config']) {
            const response = await fetch(base + route);
            assert.equal(response.status, 404, route);
            await response.text();
        }
        const legacy = await (await fetch(base + '/dot_and_crown_fixed.html')).text();
        assert.match(legacy, /url=\.\/index.html/);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
