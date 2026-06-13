# FIFA World Cup 2026 Roster Tracker

Static bilingual World Cup site for GitHub Pages. It shows groups, teams, merged rosters, player cards, standings, and fixtures in English plus Hong Kong Traditional Chinese.

## What the app uses

- `index.html`, `styles.css`, `app.js`: the frontend.
- `data.js`: manual team scaffold plus manual overrides for player names, club names, photos, and profile links.
- `data/official-rosters.json`: generated from FIFA's official squad PDF.
- `data/team-metadata.json`: generated from FIFA rankings plus the repo's zh-HK coach mapping.
- `data/live-matches.json`, `data/live-standings.json`, `data/live-teams-api.json`, `data/live-meta.json`: generated from football-data.org.

The frontend merges generated roster data with manual overrides from `data.js`, so you can keep curated zh-HK names and photo/profile fixes without editing the generated JSON by hand.

## Data flow

### Manual data

Use `data.js` for:

- Team English and zh-HK names
- Team flags and FIFA codes
- Manual player fixes or additions
- zh-HK player names
- zh-HK club names
- `photo_url`
- `profile_url`
- Any override you want to win over imported roster data

The placeholder `Example Player` entry in `data.js` is ignored by the app and is only there as a template.

### Generated data

Scripts write into `data/`:

- `official-rosters.json`: FIFA squad PDF, with optional Wikipedia/Wikidata enrichment
- `team-metadata.json`: FIFA ranking data and coach metadata
- `live-*.json`: fixtures, standings, team API payload, and update metadata

Temporary files such as the downloaded FIFA PDF or imported HTML snapshots go in `.tmp/`.

## Local preview

This repo has no runtime dependencies, so for a basic preview you do not need `npm install`.

### Requirements

- Node.js 18 or newer
- Optional: `pdftotext` from Poppler if you want to run `npm run update:rosters`

### Start the site

```bash
npm start
```

Then open:

```text
http://localhost:5173
```

You can also change the port with `PORT` in `.env`.

## GitHub Pages deployment

This repo now includes a GitHub Pages deployment workflow at `.github/workflows/deploy-pages.yml`.

### One-time GitHub setup

1. Push this repo to GitHub on the `main` branch
2. Open `Settings -> Pages`
3. Set `Source` to `GitHub Actions`

After that, every push to `main` will publish the site automatically. Manual runs are also available from the `Actions` tab.

### What gets deployed

Run this locally if you want to verify the publish output:

```bash
npm run build:pages
```

That command creates `dist/` and copies only the static site files that GitHub Pages should serve:

- `index.html`
- `styles.css`
- `app.js`
- `data.js`
- `data/*.json`

The deploy workflow uploads `dist/` to GitHub Pages, so generated project files like scripts and repo metadata are not published with the website.

## Environment variables

Create a local `.env` file yourself if you want script configuration. There is currently no `.env.example` in this repo.

Example:

```env
FOOTBALL_DATA_TOKEN=your_token_here
FOOTBALL_DATA_COMPETITION=WC
FOOTBALL_DATA_SEASON=2026
ENABLE_PROFILE_ENRICHMENT=true
PORT=5173
```

Useful variables:

- `FOOTBALL_DATA_TOKEN`: required for `npm run update:football-data`
- `FOOTBALL_DATA_COMPETITION`: defaults to `WC`
- `FOOTBALL_DATA_SEASON`: defaults to `2026`
- `ENABLE_PROFILE_ENRICHMENT`: defaults to `true`
- `FIFA_SQUAD_PDF_URL`: override the official squad PDF URL
- `PDFTOTEXT_BIN`: full path to `pdftotext` if it is not on your PATH
- `PORT`: local preview port
- `WIKI_REQUEST_DELAY_MS`, `WIKI_MAX_RETRIES`, `WIKI_MAX_PLAYERS_PER_RUN`, `WIKI_SAVE_EVERY`: optional tuning for the repair script

## Scripts

- `npm start`: local static preview server
- `npm run preview`: same as `npm start`
- `npm run update:rosters`: download the FIFA squad PDF, parse rosters, optionally enrich players from Wikipedia/Wikidata, write `data/official-rosters.json`
- `npm run update:team-metadata`: build `data/team-metadata.json` from FIFA rankings and coach mappings
- `npm run update:football-data`: fetch fixtures, standings, and teams from football-data.org into `data/live-*.json`
- `npm run update:sportsroad-zh`: merge zh-HK player and club names from `.tmp/sportsroad.html` into `data/official-rosters.json`
- `npm run repair:player-links`: retry and improve player profile matching in `data/official-rosters.json`
- `npm run normalize:wiki-search-links`: normalize Wikipedia search URLs in `data/official-rosters.json`

## Recommended update workflow

If you are refreshing project data locally, this is the cleanest order:

1. Run `npm run update:rosters`
2. Optional: place a Sportsroad HTML snapshot at `.tmp/sportsroad.html`, then run `npm run update:sportsroad-zh`
3. Run `npm run update:team-metadata`
4. Run `npm run update:football-data`
5. Review `data.js` for any manual zh-HK, photo, or profile overrides
6. Run `npm start` and check the site in the browser

If you skip football-data setup, the site still works for manual/generated roster content, but live standings and fixtures depend on the `data/live-*.json` files being present.

## GitHub Actions

The workflow at `.github/workflows/update-worldcup-data.yml`:

- runs daily at `09:00 UTC`
- can also be started manually
- installs `poppler-utils`
- updates rosters from the FIFA PDF
- updates fixtures and standings from football-data.org
- commits refreshed `data/*.json`

### Required GitHub secret

Add this repository secret for the workflow:

- `FOOTBALL_DATA_TOKEN`

### Optional GitHub variables

- `FOOTBALL_DATA_COMPETITION` with default `WC`
- `FOOTBALL_DATA_SEASON` with default `2026`

When running the workflow manually, you can set `enrich_profiles` to `false` to skip Wikipedia/Wikidata enrichment and make the roster step faster.

## Notes

- Do not put the football-data.org token in frontend files.
- Prefer Hong Kong Traditional Chinese wording for all zh fields.
- `data.js` is the best place for manual corrections that should survive future imports.
- `data/official-rosters.json` and the `live-*.json` files are generated artifacts and may be overwritten by scripts or GitHub Actions.
