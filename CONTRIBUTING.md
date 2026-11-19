# Contributing translations

Thanks for helping translate RooTicket! There are two kinds of contributions:

- **Fixing a text** in a language we already have.
- **Adding a new language.**

You never need to touch any code. Everything is plain JSON.

## How the files work

Every language file in [`catalogs/`](catalogs) has exactly the same keys, in the same order, as `catalogs/en.json`. A text that is `""` (empty) is **not translated yet**. RooTicket shows the English text there until someone translates it.

```json
"closedBy": "Ticket lukket af {user}",   <- translated
"reopened": "",                          <- not translated yet, shows English
```

(A few English texts are empty on purpose. Those stay empty in every language.)

## Fixing or filling in a text

1. Open the language file in [`catalogs/`](catalogs), e.g. `catalogs/da.json`.
2. Find the text. Press `Ctrl+F` / `Cmd+F` and search for a few words you saw in RooTicket, or search for `""` to find texts that still need translating.
3. Click the pencil icon ("Edit this file"), change the text, and choose **Propose changes**. GitHub forks the repo and opens a pull request for you.

Not sure about the right wording? Open a [Translation fix](../../issues/new?template=translation-fix.yml) issue instead.

## Adding a new language

First open a [New language](../../issues/new?template=new-language.yml) issue so nobody else starts on the same one. Then use one of these two options.

**Option A: on the GitHub website (no setup)**

1. Open [`templates/catalog.json`](templates/catalog.json). It has every key with an empty text. Copy all of it.
2. In `catalogs/`, choose **Add file → Create new file**, name it after the language code (e.g. `de.json`) and paste.
3. In `locales.json`, add an entry for your language at the end:
   ```json
   "de": { "label": "Deutsch", "country": "DE", "discord": ["de"], "status": "beta" }
   ```
   `label` is the language's own name, `country` is the flag, and `discord` holds the [Discord locale IDs](https://discord.com/developers/docs/reference#locales).
4. Translate as much as you like and open a pull request. The check runs automatically and tells you if something needs fixing.

**Option B: locally** (Node 22.18 or newer)

```sh
node scripts/new-locale.ts de                 # copies the template, adds a beta entry to locales.json
node scripts/check.ts --locale de             # shows progress and anything that needs fixing
```

**You don't have to finish everything.** Starting with `common`, `ticket` and `commands` gives the most value.

New languages start as **beta** (marked "(beta)" in the language picker). A language becomes **stable** once it is 100% translated and has been reviewed by a second native speaker.

## Rules

The check runs on every pull request and fails on these:

- **Keep `{placeholders}` exactly as they are.** `{user}`, `{count}`, `{close.relative}` and so on are replaced with real values. You can move them around in the sentence, but don't translate, rename or remove them.
- **Only translate the values, never the keys.** In `"save": "Save"`, change only `"Save"`. Don't add, remove, rename or reorder keys, and don't add the same key twice.
- **Slash-command names** (`commands.*.name` and `commands.*.options.*.name`) must be lowercase, with no spaces and at most 32 characters. This is a Discord rule. Descriptions can be at most 100 characters.
- **Lists** must have the same number of items as in English.

These give a warning only:

- Keep Markdown such as `**bold**` and `` `code` `` and line breaks (`\n`) where the English text has them.

## Plurals

Texts with `one` / `other` variants are plurals. If your language has more plural forms (for example Polish `few` and `many`), you can add them using the [CLDR category names](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html): `zero`, `one`, `two`, `few`, `many`, `other`.

## Style

- Write the way people actually talk on Discord: friendly, short and clear. Avoid stiff, formal language.
- Keep product terms consistent within your language. Our Danish and Norwegian translations keep **ticket** and **staff** in English, because that is what Discord communities use. Follow what is natural in your language, but choose one term and use it everywhere.
- Don't translate **RooTicket**, **Discord** or other product names.

## How translations reach RooTicket

When a pull request here is merged, the RooTicket team pulls the update into the bot and dashboard with the next release.

New English texts are added by the RooTicket team when a feature ships. They appear as `""` in every language file, ready to translate. `node scripts/check.ts --locale <code>` lists what is missing in your language.

## For maintainers

```sh
node scripts/add-key.ts ticket.reopened "Ticket reopened by {user}" --da "Ticket genåbnet af {user}"
#   adds the key to en.json (and da), inserts "" in every other language + the template
#   --after closedBy   place it after a sibling key     --update   change an existing English text

node scripts/sync.ts
#   after editing en.json by hand (new, renamed or deleted keys): updates every catalog + the template
```
