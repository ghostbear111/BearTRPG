import { writeFile } from 'node:fs/promises';
import { kitLibraryDrafts } from '../src/lib/play-kit.ts';

const drafts = kitLibraryDrafts();
await writeFile(new URL('../server/library-play-kit.json', import.meta.url), JSON.stringify(drafts, null, 2) + '\n');
