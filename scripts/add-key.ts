// Adds (or updates) an English text and inserts it as "" in every other catalog.
//
//   node scripts/add-key.ts ticket.reopened "Ticket reopened by {user}"
//   node scripts/add-key.ts ticket.reopened "Ticket reopened by {user}" --da "Ticket genåbnet af {user}"
//   node scripts/add-key.ts ticket.reopened "..." --after closedBy     place it after ticket.closedBy
//
// Any --<code> "text" option fills in that language right away.
// Changing the English text of an existing key needs --update; the other
// languages are then reset to "" for that key unless you pass their new text.
import { catalogCodes, catalogPath, getPath, readJson, setPath, writeJson } from './lib.ts';
import { syncAll } from './sync.ts';

const usage = 'Usage: node scripts/add-key.ts <dotted.key> "<English text>" [--<code> "<text>"]... [--after <sibling>] [--update]';

const args = process.argv.slice(2);
const key = args.shift();
const text = args.shift();
if (!key || text === undefined || key.startsWith('--') || !/^[\w-]+(\.[\w-]+)*$/.test(key)) {
  console.error(usage);
  process.exit(1);
}

let after: string | undefined;
let update = false;
const translations: Record<string, string> = {};
const codes = new Set(catalogCodes());
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--update') update = true;
  else if (arg === '--after') after = args[++i];
  else if (arg.startsWith('--') && codes.has(arg.slice(2)) && args[i + 1] !== undefined) translations[arg.slice(2)] = args[++i]!;
  else {
    console.error(`Unknown option "${arg}" (languages: ${[...codes].filter((c) => c !== 'en').join(', ')})\n${usage}`);
    process.exit(1);
  }
}

const en = readJson(catalogPath('en'));
const existing = getPath(en, key);
if (existing !== undefined && typeof existing !== 'string') {
  console.error(`${key} is a group of keys, not a text.`);
  process.exit(1);
}
if (existing !== undefined && !update) {
  console.error(`${key} already exists: ${JSON.stringify(existing)}\nPass --update to change the English text.`);
  process.exit(1);
}

try {
  setPath(en, key, text, after);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
writeJson(catalogPath('en'), en);

for (const code of codes) {
  if (code === 'en') continue;
  const cat = readJson(catalogPath(code));
  const value = translations[code] ?? (update ? '' : undefined);
  if (value === undefined) continue;
  setPath(cat, key, value, after);
  writeJson(catalogPath(code), cat);
}

console.log(`${existing === undefined ? 'Added' : 'Updated'} ${key}: ${JSON.stringify(text)}`);
syncAll(false);
