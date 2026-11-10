import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mimeTypes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8'};

export function createStaticServer(root = projectRoot) {
    const resolvedRoot = path.resolve(root);
    return createServer(async (request, response) => {
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, {Allow: 'GET, HEAD'}).end();
            return;
        }
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
            const entry = pathname === '/' ? 'index.html' : pathname.slice(1);
            const allowed = ['index.html', 'dot_and_crown_fixed.html', 'LICENSE.md', 'README.md', '.nojekyll'].includes(entry)
                || entry.startsWith('src/') || entry.startsWith('styles/');
            const target = path.resolve(resolvedRoot, entry);
            const relative = path.relative(resolvedRoot, target);
            if (!allowed || relative.startsWith('..') || path.isAbsolute(relative) || entry.split(/[\\/]/).some(part => part.startsWith('.') && part !== '.nojekyll')) {
                response.writeHead(404).end('Not found');
                return;
            }
            if (!(await stat(target)).isFile()) throw new Error('Not a file');
            const data = await readFile(target);
            response.writeHead(200, {'Content-Type': mimeTypes[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache'});
            response.end(request.method === 'HEAD' ? undefined : data);
        } catch {
            response.writeHead(404).end('Not found');
        }
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    const port = Number(args[args.indexOf('--port') + 1]) || 4173;
    const root = args.includes('--dir') ? path.resolve(projectRoot, args[args.indexOf('--dir') + 1]) : projectRoot;
    createStaticServer(root).listen(port, '127.0.0.1', () => console.log(`Game available at http://127.0.0.1:${port}`));
}
