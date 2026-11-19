// Validates every catalog against catalogs/en.json and the locales.json registry.
//
//   node scripts/check.ts              all locales
//   node scripts/check.ts --locale da  one locale (also lists every missing key)
//   node scripts/check.ts --json       machine-readable output
//
// Errors (exit code 1): duplicate keys, catalogs out of sync with en.json
// (missing/extra/reordered keys - fix with scripts/sync.ts), unknown keys,
// wrong value types, placeholder mismatch,
// invalid Discord command names, array length mismatch, registry problems.
// Warnings: a "stable" locale with untranslated texts, and Markdown /
// line-break counts that differ from English.
//
// Requires Node 22.18+ (runs TypeScript natively, no dependencies).
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findDuplicateKeys, isObj, isPluralObj, PLURAL_CATEGORIES, readJson, ROOT, type Json, type Obj } from './lib.ts';
import { syncAll } from './sync.ts';

export interface Issue {
  level: 'error' | 'warning';
  key: string;
  message: string;
}

export interface LocaleReport {
  code: string;
  status: string;
  total: number;
  translated: number;
  coverage: number;
  missing: string[];
  issues: Issue[];
}

// https://discord.com/developers/docs/reference#locales
export const DISCORD_LOCALES = new Set([
  'id', 'da', 'de', 'en-GB', 'en-US', 'es-ES', 'es-419', 'fr', 'hr', 'it', 'lt', 'hu',
  'nl', 'no', 'pl', 'pt-BR', 'ro', 'fi', 'sv-SE', 'vi', 'tr', 'cs', 'el', 'bg', 'ru',
  'uk', 'hi', 'th', 'zh-CN', 'ja', 'zh-TW', 'ko',
]);

// Discord slash-command / option names: lowercase, no spaces, 1-32 chars.
const COMMAND_NAME_RE = /^[-_\p{Ll}\p{Lo}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

export function placeholders(s: string): string[] {
  return [...new Set([...s.matchAll(/\{([\w.]+)\}/g)].map((m) => m[1]!))].sort();
}

const count = (s: string, needle: string) => s.split(needle).length - 1;

export function compareLocale(en: Obj, tr: Obj): Omit<LocaleReport, 'code' | 'status' | 'coverage'> {
  const issues: Issue[] = [];
  const missing: string[] = [];
  let total = 0;
  let translated = 0;

  const countLeaves = (v: Json): number =>
    typeof v === 'string' ? (v === '' ? 0 : 1) : Array.isArray(v) ? v.reduce<number>((n, x) => n + countLeaves(x), 0)
      : isObj(v) ? Object.values(v).reduce<number>((n, x) => n + countLeaves(x), 0) : 0;

  const checkString = (key: string, src: string, dst: string) => {
    const a = placeholders(src).join(', ');
    const b = placeholders(dst).join(', ');
    if (a !== b) {
      issues.push({ level: 'error', key, message: `placeholders differ: English has {${a}}, translation has {${b}}` });
    }
    const path = key.split('.');
    if (path[0] === 'commands' && path.at(-1) === 'name' && !COMMAND_NAME_RE.test(dst)) {
      issues.push({ level: 'error', key, message: `"${dst}" is not a valid Discord command name (lowercase, no spaces, max 32 chars)` });
    }
    if (path[0] === 'commands' && path.at(-1) === 'description' && dst.length > 100) {
      issues.push({ level: 'error', key, message: `Discord descriptions are max 100 characters (has ${dst.length})` });
    }
    for (const [needle, label] of [['**', 'bold markers (**)'], ['`', 'backticks'], ['\n', 'line breaks']] as const) {
      if (count(src, needle) !== count(dst, needle)) {
        issues.push({ level: 'warning', key, message: `number of ${label} differs from English` });
      }
    }
  };

  const walk = (key: string, src: Json, dst: Json | undefined) => {
    if (dst === undefined) {
      const n = countLeaves(src);
      total += n;
      missing.push(key);
      return;
    }
    if (typeof src === 'string') {
      if (src === '') return; // intentionally empty in English, nothing to translate
      total += 1;
      if (typeof dst !== 'string') {
        issues.push({ level: 'error', key, message: 'expected a text value' });
        return;
      }
      if (dst === '') {
        missing.push(key); // "" = not translated yet
        return;
      }
      translated += 1;
      checkString(key, src, dst);
      return;
    }
    if (Array.isArray(src)) {
      if (!Array.isArray(dst)) {
        total += countLeaves(src);
        issues.push({ level: 'error', key, message: 'expected a list' });
        return;
      }
      if (dst.length !== src.length) {
        issues.push({ level: 'error', key, message: `list has ${dst.length} items, English has ${src.length}` });
      }
      src.forEach((item, i) => walk(`${key}[${i}]`, item, dst[i]));
      return;
    }
    if (isObj(src)) {
      if (!isObj(dst)) {
        total += countLeaves(src);
        issues.push({ level: 'error', key, message: 'expected a group of keys' });
        return;
      }
      for (const k of Object.keys(src)) walk(key ? `${key}.${k}` : k, src[k]!, dst[k]);
      const plural = isPluralObj(src);
      for (const k of Object.keys(dst)) {
        if (k in src) continue;
        const full = key ? `${key}.${k}` : k;
        if (plural && PLURAL_CATEGORIES.has(k) && typeof dst[k] === 'string') {
          checkString(full, src.other as string, dst[k] as string);
          continue;
        }
        issues.push({ level: 'error', key: full, message: 'key does not exist in English (typo or removed?)' });
      }
    }
  };

  walk('', en, tr);
  return { total, translated, missing, issues };
}

function main() {
  const root = ROOT;
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const only = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : undefined;

  const registry = readJson(join(root, 'locales.json')).locales as Obj;
  const en = readJson(join(root, 'catalogs', 'en.json'));
  const globalIssues: Issue[] = [];
  const rawFiles = ['locales.json', ...readdirSync(join(root, 'catalogs')).filter((f) => f.endsWith('.json')).map((f) => `catalogs/${f}`)];
  for (const file of rawFiles) {
    for (const key of findDuplicateKeys(readFileSync(join(root, file), 'utf8'))) {
      globalIssues.push({ level: 'error', key: `${file}: ${key}`, message: 'key appears twice (only the last one is used)' });
    }
  }
  if (!asJson && syncAll(true) > 0) {
    globalIssues.push({ level: 'error', key: 'sync', message: 'catalogs are out of sync with en.json - run `node scripts/sync.ts`' });
  }

  const files = readdirSync(join(root, 'catalogs')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  for (const code of files) {
    if (!(code in registry)) globalIssues.push({ level: 'error', key: code, message: `catalogs/${code}.json has no entry in locales.json` });
  }
  if (Object.keys(registry)[0] !== 'en') globalIssues.push({ level: 'error', key: 'locales.json', message: '"en" must be the first entry' });

  const reports: LocaleReport[] = [];
  for (const [code, defJson] of Object.entries(registry)) {
    if (code === 'en' || (only && code !== only)) continue;
    const def = defJson as Obj;
    const regIssues: Issue[] = [];
    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(code)) regIssues.push({ level: 'error', key: 'locales.json', message: `"${code}" should be a language code like "de" or "pt-BR"` });
    if (typeof def.label !== 'string' || !def.label || def.label.startsWith('TODO')) regIssues.push({ level: 'error', key: 'locales.json', message: 'label must be the language name in that language, e.g. "Deutsch"' });
    if (typeof def.country !== 'string' || !/^[A-Z]{2}$/.test(def.country)) regIssues.push({ level: 'error', key: 'locales.json', message: 'country must be a 2-letter ISO country code, e.g. "DE"' });
    const discord = Array.isArray(def.discord) ? def.discord : [];
    if (discord.length === 0) regIssues.push({ level: 'error', key: 'locales.json', message: 'discord must list at least one Discord locale ID' });
    for (const id of discord) {
      if (typeof id !== 'string' || !DISCORD_LOCALES.has(id)) regIssues.push({ level: 'error', key: 'locales.json', message: `"${String(id)}" is not a Discord locale ID` });
    }
    if (def.status !== 'stable' && def.status !== 'beta') regIssues.push({ level: 'error', key: 'locales.json', message: 'status must be "stable" or "beta"' });

    const path = join(root, 'catalogs', `${code}.json`);
    if (!existsSync(path)) {
      reports.push({ code, status: String(def.status), total: 0, translated: 0, coverage: 0, missing: [], issues: [...regIssues, { level: 'error', key: code, message: `catalogs/${code}.json is missing` }] });
      continue;
    }
    const result = compareLocale(en, readJson(path));
    const coverage = result.total === 0 ? 100 : Math.floor((result.translated / result.total) * 1000) / 10;
    if (def.status === 'stable' && result.translated < result.total) {
      regIssues.push({ level: 'warning', key: code, message: `"stable" locale is missing ${result.total - result.translated} text(s) (${coverage}%) - new English texts need translating` });
    }
    reports.push({ code, status: String(def.status), coverage, ...result, issues: [...regIssues, ...result.issues] });
  }

  const allIssues = [...globalIssues, ...reports.flatMap((r) => r.issues)];
  const errors = allIssues.filter((i) => i.level === 'error').length;

  if (asJson) {
    console.log(JSON.stringify({ errors, issues: globalIssues, locales: reports }, null, 2));
  } else {
    for (const i of globalIssues) console.log(`${i.level === 'error' ? 'ERROR' : 'warn '}  ${i.key}: ${i.message}`);
    for (const r of reports) {
      console.log(`\n${r.code} (${r.status}) - ${r.coverage}% (${r.translated}/${r.total})`);
      for (const i of r.issues) console.log(`  ${i.level === 'error' ? 'ERROR' : 'warn '}  ${i.key}: ${i.message}`);
      if (r.missing.length) {
        const shown = only ? r.missing : r.missing.slice(0, 10);
        console.log(`  missing (${r.missing.length}):`);
        for (const k of shown) console.log(`    - ${k}`);
        if (shown.length < r.missing.length) console.log(`    ... run with --locale ${r.code} to see all`);
      }
    }
    console.log(`\n${errors} error(s), ${allIssues.length - errors} warning(s)`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    let md = '## Translation coverage\n\n| Language | Status | Coverage | Errors | Warnings |\n|---|---|---|---|---|\n';
    for (const r of reports) {
      const e = r.issues.filter((i) => i.level === 'error').length;
      md += `| ${String((registry[r.code] as Obj).label)} (\`${r.code}\`) | ${r.status} | ${r.coverage}% | ${e} | ${r.issues.length - e} |\n`;
    }
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  }

  process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
