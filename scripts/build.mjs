import {cp, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, 'dist');
// Verify the absolute target before recursively replacing generated output.
if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') {
    throw new Error('Build output must be the project dist directory.');
}
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const entry of ['index.html', 'dot_and_crown_fixed.html', '.nojekyll', 'src', 'styles', 'assets', 'LICENSE.md', 'README.md']) {
    await cp(path.join(root, entry), path.join(output, entry), {recursive: true});
}
console.log('Static site built in dist/');
