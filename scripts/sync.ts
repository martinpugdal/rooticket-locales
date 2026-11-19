// Brings every catalog and templates/catalog.json in line with catalogs/en.json:
// new English keys are added as "" (untranslated), removed keys are dropped,
// and keys are put in the same order as English. Existing translations are kept.
//
//   node scripts/sync.ts          rewrite files
//   node scripts/sync.ts --check  only report; exit 1 if anything is out of sync (CI)
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import {
  blank,
  catalogCodes,
  catalogPath,
  formatJson,
  readJson,
  ROOT,
  syncTo,
  TEMPLATE_PATH,
  writeJson,
  type Json,
} from './lib.ts';

export function syncAll(checkOnly: boolean): number {
  const en = readJson(catalogPath('en'));
  let outOfSync = 0;

  const apply = (path: string, next: Json, label: string, added: string[] = [], removed: string[] = []) => {
    const current = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current === formatJson(next)) return;
    outOfSync += 1;
    const rel = relative(ROOT, path).replace(/\\/g, '/');
    console.log(`${checkOnly ? 'out of sync' : 'updated'}: ${rel}${label}`);
    for (const k of added) console.log(`  + ${k}`);
    for (const k of removed) console.log(`  - ${k}`);
    if (!checkOnly) {
      mkdirSync(dirname(path), { recursive: true });
      writeJson(path, next);
    }
  };

  apply(catalogPath('en'), en, ' (formatting)');
  for (const code of catalogCodes()) {
    if (code === 'en') continue;
    const result = syncTo(en, readJson(catalogPath(code)));
    apply(catalogPath(code), result.value, '', result.added, result.removed);
  }
  apply(TEMPLATE_PATH, blank(en), '');

  if (checkOnly && outOfSync > 0) {
    console.log('\nRun `node scripts/sync.ts` to fix.');
  } else if (outOfSync === 0) {
    console.log('All catalogs are in sync with en.json.');
  }
  return outOfSync;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const checkOnly = process.argv.includes('--check');
  const n = syncAll(checkOnly);
  process.exit(checkOnly && n > 0 ? 1 : 0);
}
