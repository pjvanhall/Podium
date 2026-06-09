# Theatre Shows Scraper — Tasks

## Phase 1: Dependencies
- [x] Install `cheerio` + `puppeteer` as root devDependencies

## Phase 2: scrape-shows.js
- [x] Create `scripts/scrape-shows.js`
  - [x] Read `dutch_theatres.json`, filter theatres with a website
  - [x] Per-theatre: fetch homepage → look for `/programma`-style agenda link
  - [x] Pass 1: extract JSON-LD `Event` structured data via cheerio
  - [x] Pass 2: Puppeteer background API interception (Ticketmatic, ActiveTickets)
  - [x] Pass 3: Heuristic link discovery and deep HTML parsing fallback
  - [x] Normalize to Podium Performance shape
  - [x] Throttle (1–2 s between requests)
  - [x] Write `theatre_shows.json`
  - [x] Save `scraper_report.json` with per-theatre metrics
  - [x] Print per-theatre summary table

## Phase 3: import-shows.js
- [ ] Create `scripts/import-shows.js`
  - [ ] Read `theatre_shows.json`
  - [ ] Match theatres by osm_id or name
  - [ ] Insert into `performances`, skip duplicates

## Phase 4: package.json
- [x] Add `scrape-shows` and `import-shows` npm scripts to root `package.json`

## Phase 5: Verify
- [x] Run `npm run scrape-shows` and confirm `theatre_shows.json` created
- [ ] Run `npm run import-shows` and verify data is correctly ingested
