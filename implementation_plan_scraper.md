# Theatre Shows Scraper — Implementation Plan

## Goal

Build `scripts/scrape-shows.js` — a robust Node.js script that reads every theatre from `dutch_theatres.json`, visits each theatre's website, and collects upcoming shows. Results are written to `Podium App/server/theatre_shows.json` for later import into the database.

---

## Strategy (v1 & v2 combined)

There is no single Dutch theatre API covering all venues. The scraper uses a **multi-pass approach** per theatre, leveraging both static HTML parsing and headless browser interception:

### Pass 1 — JSON-LD structured data (schema.org `Event`)
Most modern Dutch theatre websites embed machine-readable event data inside `<script type="application/ld+json">` tags. This is the cleanest, most reliable signal. We extract `Event` (and `EventSeries`) objects directly from these tags.

### Pass 2 — API Interception (Puppeteer)
Many modern ticketing systems (e.g., Ticketmatic, ActiveTickets) fetch their event data asynchronously via API calls. We use `puppeteer` to intercept background JSON requests looking for arrays containing fields like `starttimestamp`, `event_date`, `items`, or `results`. 
*Note: This effectively handles single-page applications (SPAs) like Koninklijk Theater Carré.*

### Pass 3 — Heuristic HTML Fallback & Link Discovery
For sites without JSON-LD or standard APIs, we fall back to scraping raw HTML:
- **Heuristic Link Discovery**: We collect all internal links from the agenda page. Links that match known patterns (`/voorstelling/`, `/show/`) OR match a deep-slug heuristic (e.g., length > 15 characters, contains dashes) are queued.
- **Date Extraction**: We parse `<time>` elements, check heading + date combinations, and finally fall back to attempting to extract dates directly from the URL slug (e.g. `-09-06-2026`).

### HTTP-first, Puppeteer fallback
- **Round 1**: Plain `fetch` + `cheerio` (fast, no Chrome needed).
- **Round 2**: `puppeteer` headless Chrome for SPAs / JS-rendered sites.

### LLM-Assisted Fallback (Stubbed)
For the final ~36% of theatres whose dates are buried in unstructured text, a stub for an LLM fallback is prepared. When implemented with a key, it will parse the raw detail page text to pull the event date.

## Failure Diagnosis & Metrics

To continuously monitor and diagnose failures, the scraper explicitly tracks the successful extraction `technique` used for each theatre (`jsonld`, `api`, `html`, or `none`). 
If a theatre is processed but returns 0 events, it is logged with a `—` (skipped/failed) status. At the end of the run, a detailed `scraper_report.json` is generated containing these metrics per theatre. 

This diagnosis report is critical for identifying exactly *why* a theatre failed (e.g., if it failed with `technique: none`, it means the agenda links weren't found or standard JSON-LD/APIs were missing) so we can iteratively improve the heuristics or decide to invoke the LLM fallback.

---

## Current Status (Up to Date)

> [!NOTE]
> **Implementation Complete**
> All code changes (v1 base scraper + v2 heuristic link discovery and expanded API extraction) have been implemented and verified. The LLM fallback remains a stub as requested.

### Verification Results
- Verified against a **100-theatre sample run**.
- Success rate sits at **64%** (64 out of 100 theatres successfully returned shows).
- Extracted a total of **2,419 shows**.
- *By technique:* 44 via HTML heuristic, 14 via JSON-LD, and 6 via API interception.

---

## Proposed Changes (Now Implemented)

### Root scripts directory

#### [NEW/MODIFY] [scrape-shows.js](file:///c:/Code/CodeClan/scripts/scrape-shows.js)
Main scraper script. Responsibilities:
- Read `dutch_theatres.json`
- For each theatre with a `website`:
  - Fetch the homepage and any `/programma`-style sub-pages
  - Extract JSON-LD `Event` objects (Pass 1)
  - Intercept ticketing APIs (Pass 2)
  - Fall back to Heuristic HTML parsing and smart link discovery (Pass 3)
  - Throttle to 1–2 s between requests
- Write results to `Podium App/server/theatre_shows.json`
- Print a per-theatre summary table and save a detailed `scraper_report.json`.

#### [NEW] [import-shows.js](file:///c:/Code/CodeClan/scripts/import-shows.js)
Companion script that reads `theatre_shows.json` and upserts shows by stable `show_id`. In SQLite mode it writes to `performances` in `podium.db`; in split mode (`DATA_BACKEND=split`) it writes theatres/shows to MongoDB/Cosmos and keeps the soft-removal lifecycle metadata current.

### Root package.json
#### [MODIFY] [package.json](file:///c:/Code/CodeClan/package.json)
Added two new npm scripts:
```json
"scrape-shows": "node scripts/scrape-shows.js",
"import-shows": "node scripts/import-shows.js"
```

---

## How to Test and Improve the Scraper (Agent Instructions)

When you want to improve the scraping hit rate (currently at ~64%), you will encounter theatres that return 0 events (logged with a `—` status in `scraper_report.json`). 

**💡 AI Agent Prompt (Single Theatre):** *You can simply tell an AI Assistant (like me): "Please follow the Agent Instructions in `implementation_plan_scraper.md` to fix the scraper for [Theatre Name]."*

**💡 AI Agent Prompt (Batch of Theatres):** *If you want to fix multiple theatres at once, say: "Please follow the Agent Instructions to fix the scraper for [Theatre A], [Theatre B], and [Theatre C]." The agent should process them **one by one**, applying steps 1-6 to the first theatre before moving to the next. Do not try to debug multiple theatres simultaneously.*

**💡 AI Agent Prompt (Autonomous Loop):** *If you want an agent to continuously fix failures while you sleep, use the `/goal` slash command: "`/goal` Read the 36 failing theatres from `scraper_report.json`. Iterate over them one by one. For each failure, use the Agent Instructions to diagnose and fix it. Maintain a `rescued_theatres.md` artifact documenting exactly which theatres you successfully unblocked, the number of shows rescued, and a brief description of the fix."*

Here is the recommended workflow to debug and fix them:

### 1. Identify a Failing Theatre
Run a sample scrape using `npm run scrape-shows` (or look at an existing `scraper_report.json`). Pick a failing theatre, for example, "Theater De Regentes". 

### 2. Isolate with the `--theatre` Flag
Don't run the entire 400+ theatre loop while debugging. Use the `--theatre` flag to target exactly one theatre:
```bash
node scripts/scrape-shows.js --theatre "Theater De Regentes" --verbose
```
This isolates the log output, showing you exactly what links the scraper evaluated, if it intercepted any JSON APIs, and whether it found JSON-LD.

### 3. Diagnose the Failure
Read the verbose output to find the exact bottleneck:
- **0 detail links found:** The agenda URL path is probably missing from `SHOW_PATH_PATTERNS`, or the links are hidden behind React/Vue interactions and not in the DOM.
- **Links found, but 0 events:** The scraper found the show pages, but both JSON-LD and the HTML date heuristics failed. This means the date is likely buried in unstructured text or the HTML is too custom.

### 4. Use Temporary "Scratch" Scripts
When a theatre is stubborn, create a temporary `.cjs` file in the `scripts` folder (e.g., `_test-regentes.cjs`) to poke at it:
- Use Cheerio to dump all `<a>` tags to see what the actual `href` attributes look like.
- Write a quick Puppeteer script to fetch the page and dump `page.content()` to see what the DOM looks like *after* JS execution.
- Intercept and log network requests manually to look for hidden ticketing APIs.

### 5. Apply the Fix
Depending on your findings, you have three options to improve `scrape-shows.js`:
- **Heuristics:** Loosen the rules in `filterShowLinks` or add new URL patterns to `SHOW_PATH_PATTERNS`.
- **API Extraction:** Add new target keys to `hasDateField` or `hasEventsLike` if you discovered a new ticketing system payload structure.
- **LLM Fallback:** For impossible unstructured HTML, enable the LLM fallback stub by dropping your API key in.

### 6. Verify
Re-run the targeted `--theatre` command. If the count goes from 0 to something like `15 shows`, your fix worked! You can then safely remove your temporary `.cjs` scratch scripts.
