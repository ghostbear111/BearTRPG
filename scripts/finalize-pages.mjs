import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../artifacts/pages-editor/index.html', import.meta.url);
let html = await readFile(file, 'utf8');
html = html.replace('/brand/bear-mark.png', './brand/bear-mark.png');
await writeFile(file, html);
