// Scaffolds a new language:  node scripts/new-locale.ts de
// Creates catalogs/<code>.json from templates/catalog.json (every text "",
// i.e. untranslated - it falls back to English) and adds a "beta" entry to
// locales.json that you then fill in.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT as root, TEMPLATE_PATH } from './lib.ts';
import { syncAll } from './sync.ts';
const code = process.argv[2];

if (!code || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(code)) {
  console.error('Usage: node scripts/new-locale.ts <code>   e.g. de, sv, pt-BR');
  process.exit(1);
}

const catalogPath = join(root, 'catalogs', `${code}.json`);
if (existsSync(catalogPath)) {
  console.error(`catalogs/${code}.json already exists.`);
  process.exit(1);
}

const registryPath = join(root, 'locales.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
registry.locales[code] = {
  label: 'TODO: language name in that language, e.g. Deutsch',
  country: 'TODO: 2-letter country code for the flag, e.g. DE',
  discord: [code],
  status: 'beta',
};

syncAll(false); // make sure the template matches en.json
copyFileSync(TEMPLATE_PATH, catalogPath);
writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

console.log(`Created catalogs/${code}.json and added "${code}" to locales.json.

Next:
  1. Fill in label, country and discord in locales.json
     (Discord IDs: https://discord.com/developers/docs/reference#locales)
  2. Translate the "" values in catalogs/${code}.json (catalogs/en.json has the English).
     You do not have to translate everything - "" falls back to English.
  3. Run: node scripts/check.ts --locale ${code}`);
