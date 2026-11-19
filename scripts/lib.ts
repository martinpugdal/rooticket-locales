// Shared helpers for the catalog scripts. Plain Node 22.18+ TypeScript, no deps.
//
// Convention: every catalog mirrors the shape of catalogs/en.json. A value of
// "" means "not translated yet" (it falls back to English), unless the English
// text itself is "" (an intentionally empty field).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Obj = { [key: string]: Json };

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOGS_DIR = join(ROOT, 'catalogs');
export const TEMPLATE_PATH = join(ROOT, 'templates', 'catalog.json');
export const REGISTRY_PATH = join(ROOT, 'locales.json');

export const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

export const isObj = (v: Json | undefined): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// A plural object such as { one: '{count} day', other: '{count} days' }.
// Translations may add extra CLDR categories (few, many, ...) for their language.
export const isPluralObj = (v: Json | undefined): v is Obj =>
  isObj(v) && 'other' in v && Object.keys(v).every((k) => PLURAL_CATEGORIES.has(k));

export function readJson(path: string): Obj {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Obj;
  } catch (err) {
    console.error(`Could not read ${path}: ${(err as Error).message}`);
    process.exit(1);
  }
}

export const formatJson = (value: Json) => JSON.stringify(value, null, 2) + '\n';

export function writeJson(path: string, value: Json) {
  writeFileSync(path, formatJson(value));
}

export const catalogPath = (code: string) => join(CATALOGS_DIR, `${code}.json`);

export function catalogCodes(): string[] {
  return readdirSync(CATALOGS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5));
}

// Same shape as `en`, every text replaced by "".
export function blank(en: Json): Json {
  if (typeof en === 'string') return '';
  if (Array.isArray(en)) return en.map(blank);
  if (isObj(en)) return Object.fromEntries(Object.entries(en).map(([k, v]) => [k, blank(v)]));
  return en;
}

export interface SyncResult {
  value: Json;
  added: string[];
  removed: string[];
}

// Rebuild `tr` in the shape and key order of `en`: missing keys become "",
// keys that no longer exist in English are dropped, existing translations kept.
export function syncTo(en: Json, tr: Json | undefined): SyncResult {
  const added: string[] = [];
  const removed: string[] = [];

  const walk = (key: string, src: Json, dst: Json | undefined): Json => {
    if (typeof src === 'string') {
      if (typeof dst === 'string') return dst;
      if (dst !== undefined) removed.push(`${key} (was not text)`);
      added.push(key);
      return '';
    }
    if (Array.isArray(src)) {
      if (Array.isArray(dst) && dst.length === src.length) {
        return src.map((item, i) => walk(`${key}[${i}]`, item, dst[i]));
      }
      if (dst !== undefined) removed.push(`${key} (list did not match English)`);
      added.push(key);
      return blank(src);
    }
    if (isObj(src)) {
      const d = isObj(dst) ? dst : undefined;
      if (dst !== undefined && !d) removed.push(`${key} (was not a group)`);
      if (dst === undefined) added.push(key);
      const out: Obj = {};
      for (const [k, v] of Object.entries(src)) {
        out[k] = walk(key ? `${key}.${k}` : k, v, dst === undefined ? undefined : d?.[k] ?? undefined);
      }
      if (d) {
        const plural = isPluralObj(src);
        for (const [k, v] of Object.entries(d)) {
          if (k in src) continue;
          if (plural && PLURAL_CATEGORIES.has(k) && typeof v === 'string') out[k] = v;
          else removed.push(key ? `${key}.${k}` : k);
        }
      }
      return out;
    }
    return src;
  };

  // Report only the topmost newly added path, not every leaf below it.
  const value = walk('', en, tr);
  const top = added.filter((k) => !added.some((p) => p !== k && (k.startsWith(`${p}.`) || k.startsWith(`${p}[`))));
  return { value, added: top.filter(Boolean), removed };
}

// Insert `value` at a dotted path ("ticket.newThing"), creating groups as needed.
// New keys are appended at the end of their group, or placed after `after`.
export function setPath(root: Obj, dotted: string, value: Json, after?: string): void {
  const parts = dotted.split('.');
  const leaf = parts.pop()!;
  let cur: Obj = root;
  for (const part of parts) {
    const next = cur[part];
    if (next === undefined) cur[part] = {};
    else if (!isObj(next)) throw new Error(`"${part}" in ${dotted} is text, not a group`);
    cur = cur[part] as Obj;
  }
  if (after === undefined || leaf in cur) {
    cur[leaf] = value;
    return;
  }
  if (!(after in cur)) throw new Error(`--after: "${after}" does not exist next to ${dotted}`);
  const entries = Object.entries(cur);
  for (const k of Object.keys(cur)) delete cur[k];
  for (const [k, v] of entries) {
    cur[k] = v;
    if (k === after) cur[leaf] = value;
  }
}

export function getPath(root: Json, dotted: string): Json | undefined {
  let cur: Json | undefined = root;
  for (const part of dotted.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

// JSON.parse silently keeps the last of two identical keys, so scan the raw
// text to find duplicates. Returns their dotted paths.
export function findDuplicateKeys(text: string): string[] {
  type Frame =
    | { kind: 'obj'; keys: Set<string>; path: string; pendingKey: string }
    | { kind: 'arr'; index: number; path: string };
  const dups: string[] = [];
  const stack: Frame[] = [];
  let expectKey = false;

  const childPath = (): string => {
    const top = stack.at(-1);
    if (!top) return '';
    if (top.kind === 'arr') return `${top.path}[${top.index}]`;
    return top.path ? `${top.path}.${top.pendingKey}` : top.pendingKey;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const top = stack.at(-1);
      if (top?.kind === 'obj' && expectKey) {
        const key = JSON.parse(text.slice(i, j + 1)) as string;
        if (top.keys.has(key)) dups.push(top.path ? `${top.path}.${key}` : key);
        top.keys.add(key);
        top.pendingKey = key;
        expectKey = false;
      }
      i = j;
    } else if (c === '{') {
      stack.push({ kind: 'obj', keys: new Set(), path: childPath(), pendingKey: '' });
      expectKey = true;
    } else if (c === '[') {
      stack.push({ kind: 'arr', index: 0, path: childPath() });
    } else if (c === '}' || c === ']') {
      stack.pop();
    } else if (c === ',') {
      const top = stack.at(-1);
      if (top?.kind === 'obj') expectKey = true;
      else if (top) top.index += 1;
    }
  }
  return dups;
}
