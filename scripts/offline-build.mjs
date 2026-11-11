import {readFile, writeFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

async function files(directory) {
    const entries = await readdir(directory, {withFileTypes: true});
    const nested = await Promise.all(entries.map(entry => entry.isDirectory()
        ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
    return nested.flat();
}

export async function buildOffline(output, version) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
    const javascript = (await files(path.join(output, 'src'))).filter(file => file.endsWith('.js')).sort();
    for (const file of javascript) {
        const source = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
        const versioned = source.replace(/(from\s+['"])(\.[^'"]+\.js)(['"])/g, `$1$2?v=${version}$3`);
        await writeFile(file, versioned);
    }
    const index = path.join(output, 'index.html');
    const html = (await readFile(index, 'utf8')).replace(/\r\n/g, '\n').replace('data-offline="false"', 'data-offline="true"')
        .replace(/((?:src|href)="\.\/[^"?]+\.(?:js|css))"/g, `$1?v=${version}"`);
    await writeFile(index, html);
    const styles = (await files(path.join(output, 'styles'))).filter(file => file.endsWith('.css')).sort();
    for (const file of styles) await writeFile(file, (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'));
    const assets = await Promise.all([index, ...javascript, ...styles].map(async file => {
        const relative = path.relative(output, file).split(path.sep).join('/');
        return {url: relative + (file === index ? '' : `?v=${version}`),
            hash: createHash('sha256').update(await readFile(file)).digest('hex')};
    }));
    const template = (await readFile(new URL('../offline/service-worker.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
    const digest = createHash('sha256').update(JSON.stringify(assets)).update(template).digest('hex').slice(0, 12);
    const worker = template.replace('__APP_VERSION__', `${version}-${digest}`)
        .replace('/*__ASSETS__*/ []', JSON.stringify(assets));
    await writeFile(path.join(output, 'service-worker.js'), worker);
}
