import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = new URL('../lab/moon/', import.meta.url);
const hash = createHash('sha256');
for (const file of ['moon.js', 'moon.css', 'boot.js']) hash.update(await readFile(new URL(file, dir)));
const version = hash.digest('hex').slice(0, 12);
let html = await readFile(new URL('index.html', dir), 'utf8');
html = html.replace(/\.\/(moon\.css|moon\.js|boot\.js)(?:\?v=[a-f0-9]+)?/g, (_, file) => `./${file}?v=${version}`);
await writeFile(new URL('index.html', dir), html);
// Serve the experience itself at /, with asset URLs relative to their real directory.
const home = html.replaceAll('href="./moon.css', 'href="/lab/moon/moon.css').replaceAll('src="./boot.js', 'src="/lab/moon/boot.js');
await writeFile(new URL('../index.html', import.meta.url), home);
console.log(`Moon homepage prepared (${version})`);
