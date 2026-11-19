# RooTicket translations

This repo holds the translations for [RooTicket](https://rooticket.app), the open ticket bot for Discord: the bot's messages, slash commands, the dashboard and the website.

| Language | Status |
|---|---|
| English (`en`) | source |
| Dansk (`da`) | stable |
| Norsk (`no`) | stable |

Run `node scripts/check.ts` to see the current coverage.

**Want to help?** See [CONTRIBUTING.md](CONTRIBUTING.md). You can fix a single word straight from the GitHub website. No setup needed.

## Layout

```
catalogs/en.json        English, the source text (maintained by the RooTicket team)
catalogs/<code>.json    one file per language, same keys as en.json; "" = not translated yet
templates/catalog.json  every key with an empty text - copy it to start a new language
locales.json            list of languages: name, flag, Discord locale IDs, status
scripts/check.ts        validates every catalog (runs on every pull request)
scripts/sync.ts         brings all catalogs in line with en.json
scripts/add-key.ts      adds a new English text everywhere at once
scripts/new-locale.ts   scaffolds a new language
```
