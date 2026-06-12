#!/usr/bin/env node
/**
 * scrape-shows.js
 *
 * Reads dutch_theatres.json, visits each theatre website, and collects
 * upcoming shows using a multi-strategy approach:
 *
 *   Strategy A — Background API interception (Puppeteer):
 *     Render the agenda page and intercept JSON API responses in the
 *     background (XHR/fetch calls that return event/production data).
 *     Works for SPAs like Carré, Stage Entertainment, etc.
 *
 *   Strategy B — Show link crawl (Puppeteer → static fetch):
 *     Render the agenda page, collect all show-detail hrefs, then
 *     fetch each detail page statically and extract JSON-LD Event data.
 *     Works for WordPress/Drupal/CraftCMS sites like Flint, Theater Rotterdam.
 *
 *   Strategy C — Direct JSON-LD on agenda/homepage (static fetch):
 *     Quick-win for small theatres that embed all events directly.
 *
 * Output: Podium App/server/theatre_shows.json
 *
 * Usage:
 *   node scripts/scrape-shows.js
 *   node scripts/scrape-shows.js --limit 10
 *   node scripts/scrape-shows.js --theatre "Carré"
 *   node scripts/scrape-shows.js --unscraped
 *   node scripts/scrape-shows.js --verbose
 *
 * Requires: cheerio puppeteer (in root devDependencies)
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const cheerio = require('cheerio');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args         = process.argv.slice(2);
const LIMIT        = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : null; })();
const FILTER_NAME  = (() => { const i = args.indexOf('--theatre'); return i !== -1 ? args[i + 1] : null; })();
const UNSCRAPED_ONLY = args.includes('--unscraped') || args.includes('--only-unscraped');
const INCLUDE_BLACKLISTED = args.includes('--include-blacklisted');
const VERBOSE      = args.includes('--verbose');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const THEATRES_FILE = path.resolve(__dirname, '..', 'Podium App', 'server', 'dutch_theatres.json');
const OUTPUT_FILE   = path.resolve(__dirname, '..', 'Podium App', 'server', 'theatre_shows.json');
const REPORT_FILE   = path.resolve(__dirname, '..', 'Podium App', 'server', 'scraper_report.json');
const RESCUE_FILE   = path.resolve(__dirname, '..', 'rescued_theatres.md');

const EVENT_TIME_ZONE     = 'Europe/Amsterdam';
const REQUEST_DELAY_MS     = 1500;
const FETCH_TIMEOUT_MS     = 12000;
const PUPPETEER_TIMEOUT_MS = 28000;
const PUPPETEER_WAIT_MS    = 3500;   // extra wait after networkidle for Vue/React hydration
const MAX_DETAIL_PAGES     = 80;     // max show detail pages to visit per theatre
const MAX_AGENDA_PAGES     = 30;     // max paginated agenda/listing pages to inspect per theatre

/** Agenda-page path segments to probe */
const AGENDA_PATHS = [
  '/agenda', '/programma', '/voorstellingen', '/shows',
  '/uitagenda', '/evenementen', '/speellijst',
  '/tickets', '/calendar', '/kalender',
  '/agenda/', '/programma/',
];

/** URL path segments that indicate a show detail page */
const SHOW_PATH_PATTERNS = [
  '/voorstelling/', '/show/', '/event/', '/evenement/',
  '/productie/', '/performance/', '/concert/', '/musical/',
  '/dans/', '/opera/', '/theater/', '/theatre/', '/programma/'
];

/** Path/href patterns to exclude */
const EXCLUDE_PATTERNS = [
  '/nieuws/', '/news/', '/blog/', '/over-', '/about',
  '/contact', '/privacy', '/cookie', '/zoek', '/search',
  '/login', '/account', '/winkelwagen', '/cart',
  '#', 'mailto:', 'tel:', 'javascript:',
  '/verhuur', '/zakelijk', '/sponsor', '/vacature', '/werken',
  '/route', '/bereik', '/bereikbaar', '/parkeer',
];

/** Genre keyword map */
const GENRE_KEYWORDS = {
  'Musical':  ['musical'],
  'Opera':    ['opera', 'operette'],
  'Dans':     ['dans', 'ballet', 'choreografie', 'danstheater'],
  'Muziek':   ['concert', 'muziek', 'orkest', 'filharmonie', 'symfonieorkest', 'koor'],
  'Cabaret':  ['cabaret', 'kleinkunst', 'chanson'],
  'Jeugd':    ['jeugd', 'kinderen', 'kids', 'familie'],
  'Comedy':   ['comedy', 'stand-up', 'humor', 'komedie'],
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function log(msg)   { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg)  { console.warn(`[${new Date().toISOString()}] ⚠️  ${msg}`); }
function debug(msg) { if (VERBOSE) console.log(`  🔍 ${msg}`); }
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }

function resolveUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).href; } catch { return null; }
}

function pad2(value) {
  return String(value || '0').padStart(2, '0');
}

function formatDateTime(year, month, day, hour = '00', minute = '00', second = '00') {
  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function formatDateTimeInEventZone(date) {
  const parts = new Intl.DateTimeFormat('nl-NL', {
    timeZone: EVENT_TIME_ZONE,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const value = type => parts.find(part => part.type === type)?.value || '';
  return formatDateTime(value('year'), value('month'), value('day'), value('hour'), value('minute'), value('second'));
}

function isWithinScrapeRange(date) {
  if (!date || isNaN(date.getTime())) return false;
  const now = new Date();
  const max = new Date();
  max.setFullYear(max.getFullYear() + 2);
  return date >= now && date <= max;
}

function normaliseDateTime(raw) {
  if (!raw) return null;
  try {
    const text = String(raw).trim();
    const isoLike = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text);

    if (isoLike && !hasExplicitTimezone) {
      const [, year, month, day, hour = '00', minute = '00', second = '00'] = isoLike;
      const localDate = new Date(`${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`);
      if (!isWithinScrapeRange(localDate)) return null;
      return formatDateTime(year, month, day, hour, minute, second);
    }

    const d = new Date(raw);
    if (!isWithinScrapeRange(d)) return null;
    return formatDateTimeInEventZone(d);
  } catch { return null; }
}

function detectGenre(text) {
  const lower = (text || '').toLowerCase();
  for (const [genre, kws] of Object.entries(GENRE_KEYWORDS)) {
    if (kws.some(k => lower.includes(k))) return genre;
  }
  return 'Toneel';
}

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&euml;/g, 'ë')
    .replace(/&aacute;/g, 'á')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uuml;/g, 'ü')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function stripHtml(str) {

  return (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function siteSpecificAgendaUrl(theatreName, origin) {
  try {
    const host = new URL(origin).hostname.replace(/^www\./, '');
    if (host === 'willem-twee.nl' && /concertzaal|toonzaal/i.test(theatreName || '')) {
      return `${origin}/agenda/toonzaal`;
    }
    if (host === 'theaterdenoorderbak.nl') { return 'https://noorderbak.nl/evenementen'; }
    if (host === 'deschoenendoos.nl') { return 'https://deschoenendoos.nl/'; }
    if (host === 'speeldoosbaarn.nl') { return 'https://www.speeldoosbaarn.nl/agenda'; }
    if (host === 'wilminktheater.nl') { return `${origin}/nl/agenda`; }
    if (host === 'eendracht-gemert.nl') { return `${origin}/`; }
    if (host === 'deflits.nl') { return 'https://microtheaterdeflits.weticket.io/'; }
    if (host === 'clubwicked.nl') { return `${origin}/shows`; }
    if (host === 'schuilkerkdehoop.nl') { return `${origin}/concerten/`; }
    if (host === 'andledon.nl') { return `${origin}/podium/`; }
    if (host === 'pietepaf.nl') { return `${origin}/programma/`; }
  } catch {}
  return null;
}

async function fetchHtml(url, timeoutMs = FETCH_TIMEOUT_MS) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res   = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) { debug(`HTTP ${res.status} for ${url}`); return null; }
    return { html: await res.text(), finalUrl: res.url || url };
  } catch (err) {
    debug(`Fetch error ${url}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Puppeteer
// ---------------------------------------------------------------------------

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const puppeteer = require('puppeteer');
  _browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return _browser;
}

/**
 * Render a page with Puppeteer.
 * - Intercepts JSON API responses (strategy A).
 * - Collects all rendered <a> hrefs (strategy B).
 * Returns { html, finalUrl, links, apiData }.
 */
async function renderPage(url) {
  try {
    const browser = await getBrowser();
    const page    = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'nl-NL,nl;q=0.9' });

    // Collect JSON API responses
    const apiData = [];
    page.on('response', async res => {
      try {
        const ct = res.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        const u = res.url();
        // Skip analytics/tag-manager/cookie-consent noise
        if (/google|facebook|twitter|hotjar|clarity|squeezely|gtm|cookiebot|cookieyes|cdn-cookie|typekit|segment\.io|intercom|hubspot|crisp\.chat|recaptcha|manifest\.json|webmanifest/i.test(u)) return;
        const text = await res.text().catch(() => '');
        if (!text || text.length < 50) return;
        let parsed;
        try { parsed = JSON.parse(text); } catch { return; }
        apiData.push({ url: u, data: parsed });
      } catch { /* ignore */ }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: PUPPETEER_TIMEOUT_MS });
    await sleep(PUPPETEER_WAIT_MS);
    if (url && url.includes('schuilkerkdehoop.nl/concerten/')) {
      const schuilkerkLinks = await page.evaluate(() => [...document.querySelectorAll('a')].map(a => a.href));
      let topSeason = '';
      for (const h of schuilkerkLinks) {
        if (h && h.includes('concertseizoen-')) {
          if (!topSeason) topSeason = h;
        }
      }
      if (topSeason) {
        debug(`[De Hoop] Redirecting to season page: ${topSeason}`);
        await page.goto(topSeason, { waitUntil: 'networkidle2', timeout: PUPPETEER_TIMEOUT_MS });
        await sleep(PUPPETEER_WAIT_MS);
      }
    }


    const html     = await page.content();
    const finalUrl = page.url();
    const links    = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map(a => a.href)
        .filter(h => h.startsWith('http'))
    );

    await page.close();
    return { html, finalUrl, links, apiData };
  } catch (err) {
    debug(`Puppeteer renderPage error for ${url}: ${err.message}`);
    return null;
  }
}

function urlWithoutHash(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url || '';
  }
}

function extractLinksFromHtml(html, baseUrl) {
  const $ = cheerio.load(html || '');
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const abs = resolveUrl(href, baseUrl);
    if (abs && abs.startsWith('http')) links.push(abs);
  });
  return links;
}

function isSameAgendaListingUrl(candidateUrl, agendaUrl) {
  try {
    const candidate = new URL(candidateUrl);
    const agenda = new URL(agendaUrl);
    if (candidate.hostname.replace(/^www\./, '') !== agenda.hostname.replace(/^www\./, '')) return false;
    const candidatePath = candidate.pathname.replace(/\/+$/, '') || '/';
    const agendaPath = agenda.pathname.replace(/\/+$/, '') || '/';
    if (candidatePath !== agendaPath) return false;
    return candidate.search !== agenda.search || candidate.href !== agenda.href;
  } catch {
    return false;
  }
}

function findNextAgendaPageUrl(html, currentUrl, agendaUrl) {
  const $ = cheerio.load(html || '');
  const currentKey = urlWithoutHash(currentUrl);
  const candidates = [];

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim().toLowerCase();
    const rel = ($el.attr('rel') || '').toLowerCase();
    const aria = ($el.attr('aria-label') || '').toLowerCase();
    const href = $el.attr('href') || '';
    const abs = resolveUrl(href, currentUrl);
    if (!abs) return;
    const targetKey = urlWithoutHash(abs);
    if (targetKey === currentKey) return;
    if (!isSameAgendaListingUrl(abs, agendaUrl)) return;

    const isNext =
      rel.split(/\s+/).includes('next') ||
      /\b(volgende|next|meer|older)\b/i.test(`${text} ${aria}`) ||
      /^›+$|^>+$|^»+$/.test(text);

    if (isNext) candidates.push(abs);
  });

  return candidates[0] || null;
}

async function fetchAgendaListingPage(url) {
  const res = await fetchHtml(url);
  if (!res) return null;
  return {
    html: res.html,
    finalUrl: res.finalUrl || url,
    links: extractLinksFromHtml(res.html, res.finalUrl || url),
    apiData: [],
  };
}

async function collectAgendaPages(firstPage, agendaUrl, theatreName) {
  const pages = [firstPage];
  const seen = new Set([urlWithoutHash(firstPage.finalUrl || agendaUrl), urlWithoutHash(agendaUrl)]);
  let current = firstPage;

  while (pages.length < MAX_AGENDA_PAGES) {
    const nextUrl = findNextAgendaPageUrl(current.html, current.finalUrl || agendaUrl, agendaUrl);
    if (!nextUrl) break;
    const key = urlWithoutHash(nextUrl);
    if (seen.has(key)) break;
    seen.add(key);

    debug(`${theatreName}: agenda pagination → ${nextUrl}`);
    const nextPage = await fetchAgendaListingPage(nextUrl);
    if (!nextPage) break;
    pages.push(nextPage);
    current = nextPage;
    await sleep(250);
  }

  if (pages.length > 1) {
    debug(`${theatreName}: agenda pagination pages → ${pages.length}`);
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Strategy A — API response interception
// ---------------------------------------------------------------------------

/**
 * Try to extract events from intercepted JSON API responses.
 * Looks for arrays of objects with date/title fields.
 */
function extractFromApiData(apiDataList) {
  const events = [];

  for (const { url: apiUrl, data } of apiDataList) {
    for (const html of collectHtmlStrings(data)) {
      events.push(...extractAgendaListingEvents(html, apiUrl));
    }

    // Recursively collect all arrays that look like event lists
    const candidates = collectEventArrays(data);
    if (process.env.DEBUG_PARSE) {
      console.log(`    [DEBUG] ${apiUrl.substring(0, 80)} → ${candidates.length} candidate arrays, first: ${candidates[0]?.length ?? 0} items`);
    }
    for (const arr of candidates) {
      for (const item of arr) {
        const result = parseApiEvent(item, apiUrl);
        if (!result) {
          if (process.env.DEBUG_PARSE) console.log(`    [DEBUG]   parseApiEvent rejected: ${JSON.stringify(item).substring(0, 100)}`);
          continue;
        }
        // parseApiEvent may return a single event or an array (Flint-style)
        if (Array.isArray(result)) events.push(...result);
        else events.push(result);
      }
    }
  }

  return events;

}

function collectEventArrays(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return [];
  const results = [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object') {
      const first = obj[0];
      if (hasDateField(first) || hasEventsLike(first)) results.push(obj);
    }
    for (const item of obj) results.push(...collectEventArrays(item, depth + 1));
  } else {
    // Handle object-of-objects (e.g. Flint: { events: { "slug": {...} } })
    const vals = Object.values(obj);
    if (vals.length > 0 && typeof vals[0] === 'object' && !Array.isArray(vals[0])) {
      if (hasDateField(vals[0]) || hasEventsLike(vals[0])) {
        // Treat values as an "array" of event-like objects
        results.push(vals);
      }
    }
    for (const val of vals) results.push(...collectEventArrays(val, depth + 1));
  }
  return results;
}

function hasDateField(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  return keys.some(k => ['start_date', 'startdate', 'date', 'datetime', 'start', 'start_time',
                          'date_time', 'begin', 'date_range', 'times', 'program_start_date',
                          'starttimestamp', 'event_date'].includes(k));
}

function hasEventsLike(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  return keys.some(k => ['events', 'performances', 'shows', 'productions', 'promos', 'items', 'results'].includes(k));
}

function collectHtmlStrings(obj, depth = 0) {
  if (depth > 5 || !obj) return [];
  if (typeof obj === 'string') {
    return obj.includes('<') && obj.includes('>') && obj.length > 80 ? [obj] : [];
  }
  if (Array.isArray(obj)) return obj.flatMap(item => collectHtmlStrings(item, depth + 1));
  if (typeof obj === 'object') return Object.values(obj).flatMap(val => collectHtmlStrings(val, depth + 1));
  return [];
}

function parseApiEvent(item, sourceUrl) {
  if (!item || typeof item !== 'object') return null;

  // -- Flint-style: { title, subtitle, times: [{program_start, ticket_link}], permalink, poster_mobile }
  if (item.times && Array.isArray(item.times) && (item.title || item.naam)) {
    const results = [];
    const name    = decodeHtml(item.title || item.naam || '');
    const desc    = stripHtml(decodeHtml(item.storyline || item.content || item.omschrijving || ''));
    const image   = item.poster_desktop || item.poster_mobile || '';
    const pageUrl = item.permalink || sourceUrl;
    // Detect genre from tags object
    const tagGenre = item.tags ? Object.values(item.tags)[0] : null;

    for (const t of item.times) {
      // program_start format: '202606092015' = YYYYMMDDHHMM
      const raw = t.program_start || t.program_start_date || '';
      let dateTime = null;
      if (raw && raw.length >= 8) {
        const y = raw.slice(0,4), mo = raw.slice(4,6), d = raw.slice(6,8);
        const h = raw.length >= 12 ? raw.slice(8,10) : '20';
        const mi = raw.length >= 12 ? raw.slice(10,12) : '00';
        dateTime = normaliseDateTime(`${y}-${mo}-${d}T${h}:${mi}:00`);
      }
      if (!dateTime || !name) continue;

      const ticketUrl = (typeof t.ticket_link === 'string' && t.ticket_link) ? t.ticket_link : pageUrl;
      results.push({
        name, description: desc, startDate: dateTime,
        url: pageUrl, image, ticketUrl,
        type: 'api', _tagGenre: tagGenre,
      });
    }
    return results.length > 0 ? results : null;
  }

  // -- Carré-style: { name/data.name, start_date, sales_url }
  // -- WordPress REST API style: { title: {rendered: "..."}, date, link, excerpt: {rendered:"..."} }
  const wpTitle = item.title && typeof item.title === 'object' ? item.title.rendered : null;
  const wpExcerpt = item.excerpt && typeof item.excerpt === 'object' ? item.excerpt.rendered : null;
  const wpContent = item.content && typeof item.content === 'object' ? item.content.rendered : null;

  const dateRaw = item.start_date || item.startDate || item.date_time || item.date ||
                  item.datetime || item.start || item.begin || item.start_time ||
                  item.starttimestamp || item.event_date ||
                  (item.data && (item.data.start_date || item.data.date));
  const dateTime = normaliseDateTime(dateRaw);
  if (!dateTime) return null;

  const name = decodeHtml(
    wpTitle ||
    (typeof item.name === 'string' ? item.name : '') ||
    (typeof item.title === 'string' ? item.title : '') ||
    item.naam ||
    (item.data && (item.data.name || item.data.title || item.data.naam)) || ''
  );
  if (!name || name.length < 2) return null;

  const desc      = stripHtml(decodeHtml(
    wpExcerpt || wpContent ||
    item.description || item.omschrijving ||
    (item.data && item.data.description) || ''
  ));
  const ticketUrl = item.sales_url || item.ticket_url || item.link || item.url || sourceUrl;
  const pageUrl   = item.link || item.url || sourceUrl;
  const image     = item.image || item.image_url || item.thumbnail ||
                    (item.data && item.data.image) || '';

  return {
    name, description: desc, startDate: dateTime,
    url: typeof pageUrl === 'string' ? pageUrl : sourceUrl,
    image: typeof image === 'string' ? image : '',
    ticketUrl: typeof ticketUrl === 'string' ? ticketUrl : sourceUrl,
    type: 'api',
  };
}


// ---------------------------------------------------------------------------
// Strategy B — JSON-LD extraction from HTML
// ---------------------------------------------------------------------------

function extractJsonLdEvents(html, sourceUrl) {
  const $ = cheerio.load(html);
  const events = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).html() || ''); } catch { return; }

    const candidates = Array.isArray(data) ? [...data] : [data];
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      if (!item) continue;
      if (item['@graph']) candidates.push(...(Array.isArray(item['@graph']) ? item['@graph'] : [item['@graph']]));
    }

    const EVENT_TYPES = new Set([
      'Event', 'MusicEvent', 'TheaterEvent', 'DanceEvent', 'ComedyEvent',
      'ScreeningEvent', 'SocialEvent', 'ChildrensEvent', 'Festival',
    ]);

    for (const item of candidates) {
      if (!item || typeof item !== 'object') continue;
      if (!EVENT_TYPES.has(item['@type'])) continue;

      const name      = item.name || item.headline || '';
      const desc      = stripHtml(item.description || '');
      const startDate = item.startDate || item.doorTime || '';
      const url       = item.url || sourceUrl;
      const image     = typeof item.image === 'string' ? item.image
                      : Array.isArray(item.image) ? item.image[0]
                      : (item.image?.url || '');
      const ticketUrl = item.offers?.url || item.offers?.[0]?.url || url;

      const dateTime = normaliseDateTime(startDate);
      if (!name || !dateTime) continue;
      events.push({ name, description: desc, startDate: dateTime, url, image, ticketUrl, type: 'jsonld' });
    }
  });

  return events;
}

// ---------------------------------------------------------------------------
// Show link filtering
// ---------------------------------------------------------------------------

function filterShowLinks(links, origin) {
  const seen = new Set();
  let baseHost = '';
  try { baseHost = new URL(origin).hostname.replace(/^www\./, ''); } catch {}

  return links
    .map(l => {
      // Strip /tickets suffix: /programma/show-name/tickets → /programma/show-name
      try {
        const u = new URL(l);
        if (u.pathname.endsWith('/tickets')) {
          u.pathname = u.pathname.replace(/\/tickets$/, '');
          return u.href;
        }
      } catch {}
      return l;
    })
    .filter(l => {
      try {
        const u = new URL(l);
        const host = u.hostname.replace(/^www\./, '');
        const isAllowedExternalTicket = host === 'tickets.voordemensen.nl' && /\/event\/\d+/.test(u.pathname);
        if (host !== baseHost && !isAllowedExternalTicket) return false;
        const p = u.pathname.toLowerCase();
        if (EXCLUDE_PATTERNS.some(pat => p.includes(pat))) return false;

        let isShow = isAllowedExternalTicket || SHOW_PATH_PATTERNS.some(pat => p.includes(pat));

        // Heuristic fallback: deep path + long slug with dashes
        const depth = p.replace(/\/+$/, '').split('/').length;
        const slug = p.split('/').filter(Boolean).pop() || '';
        if (!isShow && depth >= 2 && slug.length > 15 && slug.includes('-')) {
          isShow = true;
        }

        if (!isShow) return false;
        if (seen.has(u.pathname)) return false;
        seen.add(u.pathname);
        return true;
      } catch { return false; }
    });
}


// ---------------------------------------------------------------------------
// Strategy C+ — inline agenda-card extraction
// ---------------------------------------------------------------------------

const DUTCH_MONTHS = {
  jan: 1, januari: 1,
  feb: 2, februari: 2,
  mrt: 3, maart: 3, mar: 3,
  apr: 4, april: 4,
  mei: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  aug: 8, augustus: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7,
};

const DUTCH_DATE_RE = /(?:\b(?:ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\.?\s+)?(\d{1,2})\s+(jan(?:uari)?|feb(?:ruari)?|mrt|maa(?:rt)?|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sept?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:(?:['’]\s*)(\d{2})|(20\d{2}))(?:\s+(\d{1,2})[:.](\d{2}))?/gi;
const DUTCH_PARTIAL_DATE_RE = /(?:\b(?:ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\.?\s+)(\d{1,2})\s+(jan(?:uari)?|feb(?:ruari)?|mrt|maa(?:rt)?|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sept?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*[-–]?\s*(\d{1,2}[:.]\d{2})/gi;

function monthNumber(raw) {
  const key = (raw || '').toLowerCase().replace(/\.$/, '');
  if (key === 'maa') return 3;
  return DUTCH_MONTHS[key] || null;
}

function cleanInlineAgendaTitle(text, match) {
  let title = text.slice(match.index + match[0].length);
  title = title.replace(/^\s*(?:[-–]\s*)?(?:\d{1,2}[:.]\d{2})?/, '');
  title = title.replace(/^\s*[-–:|]\s*/, '');
  return title.replace(/\s+/g, ' ').trim();
}

function cleanInlineAgendaTitleBeforeDate(text, matchIndex) {
  let title = text.slice(0, matchIndex);
  title = title
    .replace(/\b(?:Poppodium|Toonzaal|Kunstruimte|Studios|Verkadefabriek|De Citadel)\b/gi, ' ')
    .replace(/€\s*[\d.,]+/g, ' ')
    .replace(/\b(?:Gratis|Tickets?|Bestel tickets?|Bestel|Uitverkocht)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title;
}

function extractInlineAgendaEvents(html, sourceUrl) {
  const $ = cheerio.load(html || '');
  const events = [];

  $('a[href]').each((_, el) => {
    const linkText = $(el).text().replace(/\s+/g, ' ').trim();
    if (linkText.length < 8) return;

    const href = resolveUrl($(el).attr('href'), sourceUrl);
    if (!href) return;

    const compact = linkText.match(/^(?:ma|di|wo|do|vr|za|zo)(\d{2})(\d{2})\s+(\d{1,2})[:.](\d{2})\s+(?:(?:€\s*[\d,.]+|gratis)\s*)?(.*)$/i);
    if (compact) {
      const startDate = normalisePartialNumericDate(compact[1], compact[2], `${compact[3]}:${compact[4]}`);
      const name = (compact[5] || '').replace(/\s+/g, ' ').trim();
      if (startDate && name.length >= 2) {
        const $card = $(el).closest('article, li, .card, .event, .agenda-item, .program-item, [class*="event"], [class*="agenda"], [class*="program"]');
        const image = resolveUrl($card.find('img[src]').first().attr('src'), sourceUrl) || '';
        events.push({
          name,
          description: '',
          startDate,
          url: href,
          image,
          ticketUrl: href,
          type: 'html',
        });
      }
    }

    DUTCH_DATE_RE.lastIndex = 0;
    let match;
    while ((match = DUTCH_DATE_RE.exec(linkText)) !== null) {
      const mo = monthNumber(match[2]);
      if (!mo) continue;

      const year = match[4] || `20${match[3]}`;
      const day = match[1].padStart(2, '0');
      const month = String(mo).padStart(2, '0');
      const hour = match[5] ? match[5].padStart(2, '0') : '20';
      const minute = match[6] ? match[6].padStart(2, '0') : '00';
      const startDate = normaliseDateTime(`${year}-${month}-${day}T${hour}:${minute}:00`);
      if (!startDate) continue;

      const attrTitle = ($(el).attr('title') || $(el).attr('aria-label') || '').replace(/\s+/g, ' ').trim();
      const name = cleanInlineAgendaTitle(linkText, match) || attrTitle;
      if (!name || name.length < 2 || /^\d{1,2}[:.]\d{2}$/.test(name)) continue;

      const $card = $(el).closest('article, li, .card, .event, .agenda-item, .program-item, [class*="event"], [class*="agenda"], [class*="program"]');
      const image = resolveUrl($card.find('img[src]').first().attr('src'), sourceUrl) || '';

      events.push({
        name,
        description: '',
        startDate,
        url: href,
        image,
        ticketUrl: href,
        type: 'html',
      });
    }

    DUTCH_PARTIAL_DATE_RE.lastIndex = 0;
    while ((match = DUTCH_PARTIAL_DATE_RE.exec(linkText)) !== null) {
      const startDate = normalisePartialDutchDate(match[1], match[2], match[3]);
      if (!startDate) continue;

      const attrTitle = ($(el).attr('title') || $(el).attr('aria-label') || '').replace(/\s+/g, ' ').trim();
      const name = cleanInlineAgendaTitleBeforeDate(linkText, match.index) || attrTitle;
      if (!name || name.length < 2) continue;

      const $card = $(el).closest('article, li, .card, .event, .agenda-item, .program-item, [class*="event"], [class*="agenda"], [class*="program"]');
      const image = resolveUrl($card.find('img[src]').first().attr('src'), sourceUrl) || '';

      events.push({
        name,
        description: '',
        startDate,
        url: href,
        image,
        ticketUrl: href,
        type: 'html',
      });
    }
  });

  return events;
}

function normalisePartialDutchDate(dayRaw, monthRaw, timeRaw) {
  const mo = monthNumber(monthRaw);
  if (!mo) return null;

  const now = new Date();
  const day = String(dayRaw || '').trim().padStart(2, '0');
  const month = String(mo).padStart(2, '0');
  const timeMatch = String(timeRaw || '').match(/(\d{1,2})[:.](\d{2})/);
  const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '20';
  const minute = timeMatch ? timeMatch[2] : '00';

  const currentYearCandidate = new Date(now.getFullYear(), mo - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10));
  if (currentYearCandidate >= now) {
    return normaliseDateTime(`${now.getFullYear()}-${month}-${day}T${hour}:${minute}:00`);
  }

  const daysPast = (now - currentYearCandidate) / (24 * 60 * 60 * 1000);
  if (daysPast > 180) {
    return normaliseDateTime(`${now.getFullYear() + 1}-${month}-${day}T${hour}:${minute}:00`);
  }

  return null;
}

function normaliseDutchDateWithOptionalYear(dayRaw, monthRaw, timeRaw, yearRaw) {
  const mo = monthNumber(monthRaw);
  if (!mo) return null;

  const timeMatch = String(timeRaw || '').match(/(\d{1,2})[:.](\d{2})/);
  const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '20';
  const minute = timeMatch ? timeMatch[2] : '00';

  if (yearRaw) {
    const year = String(yearRaw).length === 2 ? `20${yearRaw}` : String(yearRaw);
    return normaliseDateTime(
      `${year}-${String(mo).padStart(2, '0')}-${String(dayRaw || '').trim().padStart(2, '0')}T${hour}:${minute}:00`
    );
  }

  return normalisePartialDutchDate(dayRaw, monthRaw, `${hour}:${minute}`);
}

function findExplicitYearForDutchDate(text, dayRaw, monthRaw) {
  const day = parseInt(dayRaw, 10);
  const mo = monthNumber(monthRaw);
  if (!day || !mo) return null;

  const monthPattern = 'jan(?:uari)?|feb(?:ruari)?|mrt|maa(?:rt)?|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sept?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const explicitYearRe = new RegExp(`\\b(?:ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\\.?\\s+(\\d{1,2})\\s+(${monthPattern})\\.?\\s+(?:(?:['’]\\s*)(\\d{2})|(20\\d{2}))\\b`, 'gi');

  let match;
  while ((match = explicitYearRe.exec(text || '')) !== null) {
    if (parseInt(match[1], 10) !== day) continue;
    if (monthNumber(match[2]) !== mo) continue;
    return match[4] || `20${match[3]}`;
  }

  return null;
}

function normalisePartialNumericDate(dayRaw, monthRaw, timeRaw) {
  const mo = parseInt(monthRaw, 10);
  if (!mo || mo < 1 || mo > 12) return null;
  return normalisePartialDutchDate(dayRaw, Object.keys(DUTCH_MONTHS).find(k => DUTCH_MONTHS[k] === mo) || String(monthRaw), timeRaw);
}

function extractTextAgendaEvents(html, sourceUrl) {
  const $ = cheerio.load(html || '');
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const monthPattern = 'jan(?:uari)?|feb(?:ruari)?|mrt|maa(?:rt)?|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sept?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const tokenRe = new RegExp(`(?:\\b(?:ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\\.?\\s+)(\\d{1,2})\\s+(${monthPattern})\\.?\\s+(\\d{1,2})[.:](\\d{2})(?:\\s*[–-]\\s*\\d{1,2}[.:]\\d{2})?`, 'gi');
  const yearTokenRe = new RegExp(`\\b(?:ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)?\\.?\\s*(\\d{1,2})\\s+(${monthPattern})\\.?\\s+(20\\d{2})\\s*[–-]\\s*(\\d{1,2})[.:](\\d{2})(?:\\s*uur)?`, 'gi');
  const tokens = [
    ...[...bodyText.matchAll(tokenRe)].map(m => ({
      raw: m[0], index: m.index, day: m[1], month: m[2], time: `${m[3]}:${m[4]}`,
      startDate: normalisePartialDutchDate(m[1], m[2], `${m[3]}:${m[4]}`),
    })),
    ...[...bodyText.matchAll(yearTokenRe)].map(m => {
      const mo = monthNumber(m[2]);
      const startDate = mo
        ? normaliseDateTime(`${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:00`)
        : null;
      return { raw: m[0], index: m.index, day: m[1], month: m[2], time: `${m[4]}:${m[5]}`, startDate };
    }),
  ].sort((a, b) => a.index - b.index);
  if (tokens.length === 0) return [];

  const pageTitle = $('h1').first().text().trim() || $('title').text().replace(/\s*[-|].*$/, '').trim();
  const image = $('meta[property="og:image"]').attr('content') || '';
  const events = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startDate) continue;

    const nextIndex = tokens[i + 1]?.index ?? bodyText.length;
    let name = bodyText.slice(token.index + token.raw.length, nextIndex);
    name = name
      .replace(/\b(?:Info|Tickets?|Wachtlijst|Free)\b.*$/i, '')
      .replace(/\b(?:en verder|Als eerste|NIEUWSBRIEF).*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || /zomersluiting|zaalverhuur|nieuwsbrief/i.test(name)) continue;
    if (name.length > 120) name = name.slice(0, 120).replace(/\s+\S*$/, '').trim();
    if (!name || name === pageTitle) continue;

    events.push({
      name,
      description: '',
      startDate: token.startDate,
      url: sourceUrl,
      image,
      ticketUrl: sourceUrl,
      type: 'html',
    });
  }

  return events;
}

function extractCardTextBeforeDateEvents(html, sourceUrl) {
  const $ = cheerio.load(html || '');
  const monthPattern = 'jan(?:uari)?|feb(?:ruari)?|mrt|maa(?:rt)?|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sept?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const cardDateRe = new RegExp(`\\b(?:ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\\.?\\s+(\\d{1,2})\\s+(${monthPattern})\\b(?:\\s+(?:(?:['’]\\s*)(\\d{2})|(20\\d{2})))?(?:\\s+(\\d{1,2})[.:](\\d{2}))?`, 'i');
  const events = [];
  const seen = new Set();

  $('.jet-listing-grid__item, [class*="listing-grid__item"], article, li, .event-card, [class*="event-card"]').each((_, card) => {
    const $card = $(card);
    const text = $card.text().replace(/\s+/g, ' ').trim();
    const match = text.match(cardDateRe);
    if (!match || match.index == null) return;

    let name = text.slice(0, match.index)
      .replace(/\b(?:Uitverkocht|Laatste kaarten|Gratis|Tickets?)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || name.length < 2 || name.length > 140) return;

    const explicitYear = match[4] || (match[3] ? `20${match[3]}` : findExplicitYearForDutchDate(text, match[1], match[2]));
    const timeRaw = match[5] ? `${match[5]}:${match[6]}` : '20:00';
    const startDate = normaliseDutchDateWithOptionalYear(match[1], match[2], timeRaw, explicitYear);
    if (!startDate) return;

    const href = resolveUrl($card.find('a[href]').first().attr('href'), sourceUrl) || sourceUrl;
    const image = resolveUrl($card.find('img[src]').first().attr('src'), sourceUrl) || '';
    const key = `${name}|${startDate}|${href}`;
    if (seen.has(key)) return;
    seen.add(key);

    events.push({
      name,
      description: '',
      startDate,
      url: href,
      image,
      ticketUrl: href,
      type: 'html',
    });
  });

  return events;
}

function extractAgendaListingEvents(html, sourceUrl) {
  const customEvents = [];

  // weticket.io custom parser
  if (sourceUrl.includes('weticket.io')) {
    const $ = cheerio.load(html || '');
    $('a').each((_, el) => {
      const title = $(el).find('h5').first().text().trim();
      const rawDate = $(el).find('.MuiTypography-overline').first().text().trim();
      let ticketUrl = $(el).attr('href');
      if (!title || !rawDate || !ticketUrl) return;
      if (ticketUrl === '#' || ticketUrl.includes('?')) return;
      
      const urlObj = new URL(ticketUrl, sourceUrl);
      ticketUrl = urlObj.href;

      const dateMatch = rawDate.match(/([a-zA-Z]+)\s+(\d{1,2}),\s+(\d{2}:\d{2})/i);
      let startDate = '';
      if (dateMatch) {
          const m = dateMatch[1];
          const d = dateMatch[2];
          const t = dateMatch[3];
          const currentYear = new Date().getFullYear();
          let parsed = new Date(`${m} ${d} ${currentYear} ${t}`);
          if (parsed.getTime() < Date.now() - 30*24*3600*1000) {
              parsed = new Date(`${m} ${d} ${currentYear + 1} ${t}`);
          }
          startDate = parsed.toISOString();
      }

      customEvents.push({
        name: decodeHtml(title),
        startDate,
        url: ticketUrl,
        ticketUrl: ticketUrl,
        image: '',
        description: '',
        type: 'inline_weticket',
      });
    });
  }

  // De Hoop custom parser
  if (sourceUrl.includes('schuilkerkdehoop.nl/concerten/')) {
    const $ = cheerio.load(html || '');
    $('.event-text').each((_, el) => {
      const pStrong = $(el).find('p strong').text().trim();
      if (!pStrong) return;
      const dateMatch = pStrong.match(/(\d{1,2})\s+([a-zA-Z]{3,})\s+(20\d{2})\s+(\d{1,2}[:.]\d{2})/);
      let startDate = null;
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const monthMap = { 'januari':'01','februari':'02','maart':'03','april':'04','mei':'05','juni':'06','juli':'07','augustus':'08','september':'09','oktober':'10','november':'11','december':'12' };
        const monthStr = dateMatch[2].toLowerCase();
        const month = monthMap[monthStr] || '01';
        const year = dateMatch[3];
        let time = dateMatch[4].replace('.', ':');
        if (time.length === 4) time = '0' + time;
        startDate = `${year}-${month}-${day}T${time}:00`;
      }
      if (!startDate) return;
      const titleA = $(el).find('h4 a');
      const title = titleA.text().trim();
      const url = resolveUrl(titleA.attr('href'), sourceUrl) || sourceUrl;
      const image = $(el).prev('.event-image').find('img').attr('src') || '';
      customEvents.push({ name: title, startDate, url: url, ticketUrl: url, image, description: '', type: 'inline_dehoop' });
    });
  }

  // De Schoenendoos custom parser
  if (sourceUrl === 'https://deschoenendoos.nl/') {
    const $ = cheerio.load(html || '');
    $('a').each((_, el) => {
      const text = $(el).text().trim();
      // Match: za. 20 juni - David Cornelissen
      // Or: zo 27 sept - Hein Augustijn
      const m = text.match(/^(?:[a-z]{2}\.?\s+)?(\d{1,2})\s+([a-z]+)\s*[-–]\s*(.+)$/i);
      if (m) {
        const day = m[1].padStart(2, '0');
        const monthStr = m[2].toLowerCase();
        const title = m[3].trim();
        const url = resolveUrl($(el).attr('href'), sourceUrl);
        if (!url || url === sourceUrl) return;

        const monthMap = { 
            'jan':'01', 'januari':'01', 
            'feb':'02', 'februari':'02', 
            'mrt':'03', 'maart':'03', 
            'apr':'04', 'april':'04', 
            'mei':'05', 
            'jun':'06', 'juni':'06', 
            'jul':'07', 'juli':'07', 
            'aug':'08', 'augustus':'08', 
            'sep':'09', 'sept':'09', 'september':'09', 
            'okt':'10', 'oktober':'10', 
            'nov':'11', 'november':'11', 
            'dec':'12', 'december':'12' 
        };
        const month = monthMap[monthStr];
        if (month) {
            let year = new Date().getFullYear();
            let parsed = new Date(`${year}-${month}-${day}T20:00:00Z`);
            if (parsed.getTime() < Date.now() - 30*24*3600*1000) {
                year++;
            }
            customEvents.push({
                name: decodeHtml(title),
                startDate: `${year}-${month}-${day}T20:00:00`,
                url,
                ticketUrl: url,
                image: '',
                description: '',
                type: 'inline_deschoenendoos'
            });
        }
      }
    });
  }

  // De Noorderbak custom parser
  if (sourceUrl.includes('noorderbak.nl/evenementen')) {
    const $ = cheerio.load(html || '');
    $('.ee-post').each((_, el) => {
      const title = $(el).find('h3').text().trim();
      const dateText = $(el).find('.bde-icon-list__text').filter((_, e) => $(e).text().toLowerCase().includes('datum:')).text().trim();
      const link = $(el).find('a.bde-button__button').attr('href');
      const img = $(el).find('img').attr('src') || '';
      
      if (!title || !dateText || !link) return;
      
      const dateMatch = dateText.match(/Datum:\s*(?:\d+,\s*)*(\d{1,2})\s+([a-zA-Z]+)(?:\s+(\d{4}))?/i);
      let startDate = null;
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const monthStr = dateMatch[2].toLowerCase();
        let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : new Date().getFullYear();
        const monthMap = { 'januari':'01','februari':'02','maart':'03','april':'04','mei':'05','juni':'06','juli':'07','augustus':'08','september':'09','oktober':'10','november':'11','december':'12' };
        const month = monthMap[monthStr];
        if (month) {
            let parsed = new Date(`${year}-${month}-${day}T20:00:00Z`);
            if (parsed.getTime() < Date.now() - 30*24*3600*1000 && !dateMatch[3]) {
                year++;
            }
            startDate = `${year}-${month}-${day}T20:00:00`;
        }
      }
      
      if (startDate) {
        customEvents.push({
            name: decodeHtml(title),
            startDate,
            url: link,
            ticketUrl: link,
            image: img,
            description: '',
            type: 'inline_noorderbak'
        });
      }
    });
  }

  // Club Wicked custom parser
  if (sourceUrl.includes('clubwicked.nl/shows')) {
    const $ = cheerio.load(html || '');
    $('.show-card').each((_, el) => {
      const title = $(el).find('h3').first().text().trim();
      let ticketUrl = $(el).find('a[href*="weeztix"]').attr('href');
      if (!title || !ticketUrl) return;
      let startDate = null;
      try {
        const urlObj = new URL(ticketUrl);
        const dateParam = urlObj.searchParams.get('date');
        const timeParam = urlObj.searchParams.get('time');
        if (dateParam && timeParam) {
           startDate = `${dateParam}T${timeParam}:00`;
        }
      } catch {}
      
      if (startDate) {
        customEvents.push({
          name: decodeHtml(title),
          startDate,
          url: ticketUrl,
          ticketUrl: ticketUrl,
          image: '',
          description: '',
          type: 'inline_clubwicked',
        });
      }
    });
  }

  if (customEvents.length > 0) return customEvents;

  const structuredEvents = [
    ...extractInlineAgendaEvents(html, sourceUrl),
    ...extractCardTextBeforeDateEvents(html, sourceUrl),
  ];
  if (structuredEvents.length > 0) return structuredEvents;
  return extractTextAgendaEvents(html, sourceUrl);
}

function normaliseEuropeanDate(raw) {
  const m = String(raw || '').match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:\s+(\d{1,2})[:.](\d{2}))?/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const hour = m[4] ? m[4].padStart(2, '0') : '20';
  const minute = m[5] || '00';
  return normaliseDateTime(`${m[3]}-${month}-${day}T${hour}:${minute}:00`);
}

function parseDutchExceptionDates(text, defaultYear) {
  const excluded = new Set();
  const exceptionMatch = (text || '').match(/m\.?\s*u\.?\s*v\.?\s*\.?\s*([^)]{1,120})/i);
  if (!exceptionMatch) return excluded;

  const MONTH_NAME_RE = /(jan(?:uari)?|feb(?:ruari)?|mrt|maa(?:rt)?|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sept?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i;
  const monthMatch = exceptionMatch[1].match(MONTH_NAME_RE);
  const mo = monthMatch ? monthNumber(monthMatch[1]) : null;
  if (!mo) return excluded;

  const month = String(mo).padStart(2, '0');
  const dayMatches = exceptionMatch[1].match(/\d{1,2}/g) || [];
  for (const dayRaw of dayMatches) {
    const day = dayRaw.padStart(2, '0');
    excluded.add(`${defaultYear}-${month}-${day}`);
  }
  return excluded;
}

function extractRecurringDutchEvents(html, url, fallbackName, image, desc) {
  const $ = cheerio.load(html || '');
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const monthPattern = 'jan(?:uari)?|feb(?:ruari)?|mrt|maa(?:rt)?|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sept?|sep(?:tember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const rangeRe = new RegExp(`(\\d{1,2})\\s+(${monthPattern})\\s+t\\/m\\s+(\\d{1,2})\\s+(${monthPattern})(?:\\s+(20\\d{2}))?`, 'i');
  const range = bodyText.match(rangeRe);
  if (!range) return [];

  const startMonth = monthNumber(range[2]);
  const endMonth = monthNumber(range[4]);
  if (!startMonth || !endMonth) return [];

  const now = new Date();
  let year = range[5] ? parseInt(range[5], 10) : now.getFullYear();
  let start = new Date(year, startMonth - 1, parseInt(range[1], 10));
  let end = new Date(year, endMonth - 1, parseInt(range[3], 10));
  if (end < start) end = new Date(year + 1, endMonth - 1, parseInt(range[3], 10));
  if (end < now) {
    year++;
    start = new Date(year, startMonth - 1, parseInt(range[1], 10));
    end = new Date(year, endMonth - 1, parseInt(range[3], 10));
    if (end < start) end = new Date(year + 1, endMonth - 1, parseInt(range[3], 10));
  }

  const weekdays = [];
  if (/elke\s+zaterdag\s+en\s+zondag/i.test(bodyText)) weekdays.push(6, 0);
  else {
    if (/elke\s+zaterdag/i.test(bodyText)) weekdays.push(6);
    if (/elke\s+zondag/i.test(bodyText)) weekdays.push(0);
    if (/elke\s+vrijdag/i.test(bodyText)) weekdays.push(5);
  }
  if (weekdays.length === 0) return [];

  const afterRange = bodyText.slice(range.index, range.index + 300);
  const timeMatch = afterRange.match(/om\s+((?:\d{1,2}[:.]\d{2})(?:\s*(?:en|,|\/)\s*\d{1,2}[:.]\d{2})*)/i);
  const times = timeMatch ? (timeMatch[1].match(/\d{1,2}[:.]\d{2}/g) || []) : [];
  if (times.length === 0) return [];

  const titleMatch = bodyText.match(/'([^']{3,90})'\s*\(\d/) || bodyText.match(/Reserveren voor\s+(.{3,90}?)(?:'|\s+\d{1,2}\s+[A-Z])/);
  const name = (titleMatch ? titleMatch[1] : fallbackName).replace(/\s+/g, ' ').trim();
  if (!name || name.length < 2) return [];

  const excluded = parseDutchExceptionDates(bodyText, year);
  const events = [];
  const cursor = new Date(Math.max(start.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()));
  while (cursor <= end && events.length < 80) {
    if (weekdays.includes(cursor.getDay())) {
      const dayKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (!excluded.has(dayKey)) {
        for (const t of times) {
          const [hour, minute] = t.split(/[:.]/);
          const startDate = normaliseDateTime(`${dayKey}T${hour.padStart(2, '0')}:${minute}:00`);
          if (startDate) {
            events.push({
              name,
              description: stripHtml(desc),
              startDate,
              url,
              image,
              ticketUrl: url,
              type: 'html',
            });
          }
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return events;
}


// ---------------------------------------------------------------------------
// Strategy D — HTML heuristic extraction (for detail pages without JSON-LD)
// ---------------------------------------------------------------------------

/**
 * Extract event data from a show detail page using HTML heuristics:
 * - Title from h1 or og:title
 * - Dates from <time datetime>, microdata, or Dutch date text patterns
 * - Image from og:image
 * Falls back gracefully if no date can be found.
 */
function extractFromHtml(html, url) {
  const $ = cheerio.load(html);
  const results = [];

  // ── Title ─────────────────────────────────────────────────────────────────
  const h1 = $('h1').first().text().trim();
  const h2 = $('h2').first().text().trim();
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const metaTitle = $('title').text().replace(/\s*[-|].*$/, '').trim();
  const name = h1 || h2 || ogTitle.split('|')[0].split('-')[0].trim() || metaTitle;
  if (!name || name.length < 2) return [];

  // ── Image ─────────────────────────────────────────────────────────────────
  const image = $('meta[property="og:image"]').attr('content') || '';

  // ── Description ───────────────────────────────────────────────────────────
  const desc = $('meta[name="description"], meta[property="og:description"]').first().attr('content') || '';

  // ── Dates — multiple strategies ───────────────────────────────────────────
  const dateTimes = new Set();

  // 0. Detail-page programme rows, e.g. Dakota:
  //    <span class="daynum">9</span><span class="month">Jun</span><span class="time">16:00</span>
  const programRows = [];
  $('.program-line, .program-item, .program-row, .programme-line').each((_, row) => {
    const $row = $(row);
    const day = $row.find('.daynum, .day-number, [class*="daynum"]').first().text().trim();
    const month = $row.find('.month, [class*="month"]').first().text().trim();
    const time = $row.find('.time, [class*="time"]').first().text().trim();
    const dt = normalisePartialDutchDate(day, month, time);
    if (!dt) return;
    const rowTicket = resolveUrl($row.find('a[href]').first().attr('href'), url) || url;
    programRows.push({
      name,
      description: stripHtml(desc),
      startDate: dt,
      url,
      image,
      ticketUrl: rowTicket,
      type: 'html',
    });
  });
  if (programRows.length > 0) return programRows.slice(0, 15);

  const recurringEvents = extractRecurringDutchEvents(html, url, name, image, desc);
  if (recurringEvents.length > 0) return recurringEvents;

  // 0b. European numeric date fields: "09/04/2026 20:00"
  $('.schedule-date-time, .event-details .event-date, [class*="schedule-date"]').each((_, el) => {
    const norm = normaliseEuropeanDate($(el).text().trim());
    if (norm) dateTimes.add(norm);
  });

  // 1. <time datetime="..."> elements
  $('time[datetime]').each((_, el) => {
    const dt = $(el).attr('datetime');
    const norm = normaliseDateTime(dt);
    if (norm) dateTimes.add(norm);
  });

  // 2. Schema.org microdata
  $('[itemprop="startDate"], [itemprop="datePublished"]').each((_, el) => {
    const dt = $(el).attr('datetime') || $(el).attr('content') || $(el).text().trim();
    const norm = normaliseDateTime(dt);
    if (norm) dateTimes.add(norm);
  });

  // 3. Dutch date text patterns: "9 juni 2026", "09-06-2026", "2026-06-09"
  if (dateTimes.size === 0) {
    const MONTHS = { jan:1,feb:2,mrt:3,mar:3,apr:4,mei:5,jun:6,jul:7,aug:8,sep:9,okt:10,oct:10,nov:11,dec:12 };
    const bodyText = $('main, article, .content, body').first().text();
    // "9 juni 2026 20:00" or "9 juni 2026"
    const dutchPattern = /(\d{1,2})\s+(jan|feb|mrt|mar|apr|mei|jun|jul|aug|sep|okt|oct|nov|dec)\w*\s+(20\d{2})(?:\s+(\d{1,2})[:.](\d{2}))?/gi;
    let m;
    while ((m = dutchPattern.exec(bodyText)) !== null) {
      const day = m[1].padStart(2,'0');
      const mo  = String(MONTHS[m[2].toLowerCase().slice(0,3)]).padStart(2,'0');
      const yr  = m[3];
      const hr  = m[4] ? m[4].padStart(2,'0') : '20';
      const mn  = m[5] ? m[5].padStart(2,'0') : '00';
      const norm = normaliseDateTime(`${yr}-${mo}-${day}T${hr}:${mn}:00`);
      if (norm) dateTimes.add(norm);
    }
    // English "November 4, 2026" or "June 26 2026"
    const englishPattern = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})/gi;
    while ((m = englishPattern.exec(bodyText)) !== null) {
      const moNum = monthNumber(m[1]);
      if (!moNum) continue;
      const after = bodyText.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const time = after.match(/\b(?:at|doors|show|starts?|film)?\s*(\d{1,2})[:.](\d{2})\s*(AM|PM)?\b/i);
      let hr = time ? parseInt(time[1], 10) : 20;
      if (time?.[3]?.toUpperCase() === 'PM' && hr < 12) hr += 12;
      if (time?.[3]?.toUpperCase() === 'AM' && hr === 12) hr = 0;
      const mn = time ? time[2] : '00';
      const norm = normaliseDateTime(`${m[3]}-${String(moNum).padStart(2, '0')}-${m[2].padStart(2, '0')}T${String(hr).padStart(2, '0')}:${mn}:00`);
      if (norm) dateTimes.add(norm);
    }
    // ISO "2026-06-09" or "09-06-2026"
    const isoPattern = /(20\d{2})-(\d{2})-(\d{2})/g;
    while ((m = isoPattern.exec(bodyText)) !== null) {
      const norm = normaliseDateTime(`${m[1]}-${m[2]}-${m[3]}`);
      if (norm) dateTimes.add(norm);
    }
    const europeanPattern = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:\s+(\d{1,2})[:.](\d{2}))?/g;
    while ((m = europeanPattern.exec(bodyText)) !== null) {
      const norm = normaliseEuropeanDate(m[0]);
      if (norm) dateTimes.add(norm);
    }
  }

  // 4. Fallback: try to extract date from the URL (e.g. -09-06-2026)
  if (dateTimes.size === 0 && url) {
    const m = url.match(/-(\d{2})-(\d{2})-(20\d{2})/);
    if (m) {
      const norm = normaliseDateTime(`${m[3]}-${m[2]}-${m[1]}T20:00:00`);
      if (norm) dateTimes.add(norm);
    }
  }

  // 5. LLM Fallback (Stub)
  if (dateTimes.size === 0) {
    // TODO: Implement LLM Fallback here
    // const extracted = await askLLM(bodyText);
    // if (extracted.date) dateTimes.add(normaliseDateTime(extracted.date));
    // console.log(`[LLM Fallback] Tried to extract from ${url}`);
  }

  if (dateTimes.size === 0) return [];

  // One result per date found on this page
  for (const dt of dateTimes) {
    results.push({
      name,
      description: stripHtml(desc),
      startDate: dt,
      url,
      image,
      ticketUrl: url,
      type: 'html',
    });
  }

  // Cap at 15 performances per show page (avoids false positives from text)
  return results.slice(0, 15);
}

function extractArticleEvents(html, sourceUrl) {
  const $ = cheerio.load(html || '');
  const events = [];
  const seen = new Set();

  $('article').each((_, article) => {
    const $article = $(article);
    const articleHtml = $.html(article);
    const href = resolveUrl($article.find('a[href]').first().attr('href'), sourceUrl) || sourceUrl;
    const articleEvents = extractFromHtml(articleHtml, href);
    for (const ev of articleEvents) {
      const key = `${ev.name}|${ev.startDate}|${ev.url}`;
      if (!seen.has(key)) { seen.add(key); events.push(ev); }
    }
  });

  return events;
}

function extractVoordemensenEvents(html, sourceUrl) {
  if (!/tickets\.voordemensen\.nl/i.test(sourceUrl || '')) return [];

  const $ = cheerio.load(html || '');
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const marker = bodyText.indexOf(' more_vert ');
  if (marker === -1) return [];

  let name = bodyText.slice(Math.max(0, marker - 180), marker)
    .replace(/.*[;}]\s*/, '')
    .replace(/\s+(?:Toneelmakerij, De Krakeling, )?Likeminds$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.length < 2) return [];

  const image = $('meta[property="og:image"]').attr('content') || '';
  const events = [];
  const dateRe = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2}),\s+(20\d{2})\s+(\d{1,2})[:.](\d{2})\s*(AM|PM)?/gi;
  let match;
  while ((match = dateRe.exec(bodyText)) !== null) {
    const mo = monthNumber(match[1]);
    if (!mo) continue;
    let hour = parseInt(match[4], 10);
    if (match[6]?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (match[6]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    const dt = normaliseDateTime(`${match[3]}-${String(mo).padStart(2, '0')}-${match[2].padStart(2, '0')}T${String(hour).padStart(2, '0')}:${match[5]}:00`);
    if (!dt) continue;
    events.push({
      name,
      description: '',
      startDate: dt,
      url: sourceUrl,
      image,
      ticketUrl: sourceUrl,
      type: 'html',
    });
  }

  return events;
}

async function extractFareHarborEvents(html, sourceUrl) {
  const $ = cheerio.load(html || '');
  const primaryHrefs = $('[data-mixpanel="first-row-cta"][href*="fareharbor.com"]')
    .map((_, el) => $(el).attr('href'))
    .get();
  const decodedHtml = decodeHtml(primaryHrefs.length > 0 ? primaryHrefs.join('\n') : (html || ''));
  const matches = [...decodedHtml.matchAll(/fareharbor\.com\/embeds\/book\/([^/"'?]+)\/items\/(\d+)/gi)];
  if (matches.length === 0) return [];

  const name = $('h1').first().text().trim()
    || $('meta[property="og:title"]').attr('content')?.split('|')[0].trim()
    || $('title').text().replace(/\s*[-|].*$/, '').trim();
  if (!name) return [];

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const timeMatch = bodyText.match(/\b(?:at|om)\s+(\d{1,2})[:.](\d{2})\b/i)
    || bodyText.match(/\b(\d{1,2})[:.](\d{2})\b/);
  const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '20';
  const minute = timeMatch ? timeMatch[2] : '00';
  const image = $('meta[property="og:image"]').attr('content') || '';
  const desc = $('meta[name="description"], meta[property="og:description"]').first().attr('content') || '';

  const now = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 3);
  const startDate = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const endDate = `${end.getFullYear()}-${end.getMonth() + 1}-${end.getDate()}`;

  const seenItems = new Set();
  const events = [];
  for (const match of matches) {
    const company = match[1];
    const itemPk = match[2];
    if (seenItems.has(`${company}:${itemPk}`)) continue;
    seenItems.add(`${company}:${itemPk}`);

    const apiUrl = `https://fareharbor.com/api/embed/${company}/bookability/v1/?start_date=${startDate}&end_date=${endDate}&item_pks=${itemPk}`;
    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PodiumBot/1.0)',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const availability of data.availabilities || []) {
        if (availability.status && availability.status !== 'bookable') continue;
        const dt = normaliseDateTime(`${availability.date}T${hour}:${minute}:00`);
        if (!dt) continue;
        events.push({
          name,
          description: stripHtml(desc),
          startDate: dt,
          url: sourceUrl,
          image,
          ticketUrl: sourceUrl,
          type: 'api',
        });
      }
    } catch {
      // Ignore FareHarbor fallback failures; other strategies may still work.
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// WordPress REST API paginated fetcher
// ---------------------------------------------------------------------------

/**
 * When Puppeteer intercepts a wp-json URL, we know the site is WordPress.
 * Instead of waiting for partial data, hit the REST API directly with
 * pagination to get all events/posts.
 *
 * Tries common post-type slugs used by Dutch theatre WP plugins.
 */
async function fetchWordPressEvents(interceptedWpUrl, theatreName) {
  const events = [];
  const base = interceptedWpUrl.replace(/\/wp-json\/.*$/, '');

  // Common WP post type slugs for events in Dutch theatre world
  const postTypes = [
    'events', 'event', 'vo-programme', 'performance', 'performances',
    'voorstelling', 'voorstellingen', 'show', 'shows', 'concert', 'concerts',
    'agenda-item', 'programme', 'programma',
  ];

  for (const postType of postTypes) {
    const apiBase = `${base}/wp-json/wp/v2/${postType}`;
    let page = 1;
    let found = 0;

    while (page <= 10) {  // max 10 pages = 1000 events
      const url = `${apiBase}?per_page=100&page=${page}&_fields=id,title,date,link,excerpt,content,acf,meta`;
      let data;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PodiumBot/1.0)',
            'Accept': 'application/json',
          },
        });
        clearTimeout(t);
        if (res.status === 404) break;  // post type doesn't exist
        if (!res.ok) break;
        const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1', 10);
        data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;

        for (const item of data) {
          const ev = parseApiEvent(item, item.link || url);
          if (!ev) continue;
          if (Array.isArray(ev)) events.push(...ev);
          else events.push(ev);
          found++;
        }

        if (page >= totalPages) break;
        page++;
        await sleep(250);
      } catch { break; }
    }

    if (found > 0) {
      debug(`${theatreName}: WP REST /${postType} → ${found} events`);
      break;  // Found events from this post type, stop trying others
    }
  }

  return events;
}

async function scrapeTheatre(theatre) {

  const { name, website } = theatre;
  const origin = (() => { try { return new URL(website).origin; } catch { return null; } })();
  if (!origin) return [];

  // De Smeltkroes custom parser
  if (name === 'De Smeltkroes') {
    const customEvents = [];
    const categories = [
      'https://www.akdesmeltkroes.nl/producten/cabaret--en--muziek',
      'https://www.akdesmeltkroes.nl/producten/jeugd',
      'https://www.akdesmeltkroes.nl/producten/zomaar-op-zondag',
      'https://www.akdesmeltkroes.nl/producten/exposities'
    ];
    for (const catUrl of categories) {
      const res = await globalThis.fetch(catUrl);
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      
      const productLinks = [];
      $('a[href*="product/"]').each((_, el) => {
         const rawHref = $(el).attr('href');
         if (rawHref) {
             const href = rawHref.startsWith('http') ? rawHref : `https://www.akdesmeltkroes.nl/${rawHref.replace(/^\//, '')}`;
             if (!productLinks.includes(href)) productLinks.push(href);
         }
      });
      
      for (const link of productLinks) {
          const detailRes = await globalThis.fetch(link);
          if (!detailRes.ok) continue;
          const detailHtml = await detailRes.text();
          const _$ = cheerio.load(detailHtml);
          const titleText = _$('h1').text().replace(/\s+/g, ' ').trim();
          
          const dateMatch = titleText.match(/(?:MA|DI|WO|DO|VR|ZA|ZO)?\s*(\d{1,2})\s+(JAN|FEB|MRT|APR|MEI|JUN|JUL|AUG|SEP|OKT|NOV|DEC)\s+(\d{4})\s+(\d{1,2}:\d{2})/i);
          if (dateMatch) {
             const day = dateMatch[1].padStart(2, '0');
             const monthStr = dateMatch[2].toLowerCase();
             const monthMap = {'jan':'01','feb':'02','mrt':'03','apr':'04','mei':'05','jun':'06','jul':'07','aug':'08','sep':'09','okt':'10','nov':'11','dec':'12'};
             const month = monthMap[monthStr];
             const year = dateMatch[3];
             const time = dateMatch[4].padStart(5, '0');
             
             const cleanTitle = titleText.substring(0, dateMatch.index).trim();
             
             customEvents.push({
                 name: decodeHtml(cleanTitle),
                 startDate: `${year}-${month}-${day}T${time}:00`,
                 url: link,
                 ticketUrl: link,
                 image: '',
                 description: '',
                 type: 'inline_desmeltkroes'
             });
          }
      }
    }
    debug(`${name}: inline_desmeltkroes → ${customEvents.length} events`);
    if (customEvents.length >= 1) return customEvents;
  }


  // ── Strategy C quick-win: static fetch of homepage for JSON-LD ─────────
  const homeRes = await fetchHtml(website);
  let homeArticleEvents = [];
  if (homeRes) {
    const homeEvents = extractJsonLdEvents(homeRes.html, homeRes.finalUrl);
    debug(`${name}: homepage JSON-LD → ${homeEvents.length} events`);
    if (homeEvents.length >= 5) return homeEvents;
    homeArticleEvents = extractArticleEvents(homeRes.html, homeRes.finalUrl);
    debug(`${name}: homepage article fallback → ${homeArticleEvents.length} events`);
  }

  // ── Find the best agenda URL ────────────────────────────────────────────
  // First try to find it from nav links
  let agendaUrl = null;
  if (homeRes) {
    const $ = cheerio.load(homeRes.html);
    const candidates = [];
    const originHost = new URL(origin).hostname.replace(/^www\./, '');
    const cityToken = (theatre.city || '').toLowerCase().replace(/^'s-/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // Paths to skip (login/account areas that contain "agenda" or "programma")
    const skipPaths = ['/my/', '/login', '/account', '/profiel', '/signin', '/bestelling', '/verlanglijst'];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().toLowerCase().trim();
      const abs  = resolveUrl(href, homeRes.finalUrl);
      if (!abs) return;
      try {
        const candidateHost = new URL(abs).hostname.replace(/^www\./, '');
        if (candidateHost !== originHost) return;
      } catch { return; }
      // Skip auth/member areas
      if (skipPaths.some(p => href.toLowerCase().includes(p))) return;
      const words = ['programma', 'program', 'programme', 'agenda', 'voorstellingen', 'uitagenda', 'shows', 'evenementen', 'events', 'calendar'];
      const hrefLower = href.toLowerCase();
      const score = (words.some(w => hrefLower.includes(w)) ? 2 : 0)
                  + (words.some(w => text.includes(w)) ? 1 : 0)
                  + (/\/agenda\/?$/.test(hrefLower) || hrefLower.includes('/agenda/') ? 2 : 0)
                  + (/\/events\/?$/.test(hrefLower) || hrefLower.includes('/events/') ? 2 : 0)
                  + (cityToken && hrefLower.includes(cityToken) ? 3 : 0);
      if (score > 0) candidates.push({ abs, score });
    });
    candidates.sort((a, b) => b.score - a.score);
    agendaUrl = candidates[0]?.abs || null;
  }
  if (!agendaUrl) agendaUrl = origin + '/agenda';
  agendaUrl = siteSpecificAgendaUrl(name, origin) || agendaUrl;

  debug(`${name}: agenda URL → ${agendaUrl}`);

  // ── Render agenda page with Puppeteer ───────────────────────────────────
  const rendered = await renderPage(agendaUrl);
  if (!rendered) {
    debug(`${name}: Puppeteer failed for ${agendaUrl}`);
    return homeRes ? extractJsonLdEvents(homeRes.html, homeRes.finalUrl) : [];
  }
  const agendaPages = await collectAgendaPages(rendered, agendaUrl, name);
  const allApiData = agendaPages.flatMap(page => page.apiData || []);

  // ── Strategy A: extract from intercepted API responses ─────────────────
  const apiEvents = extractFromApiData(allApiData);
  debug(`${name}: API interception → ${apiEvents.length} events (from ${allApiData.length} JSON responses)`);
  if (apiEvents.length >= 3 && agendaPages.length === 1) return apiEvents;

  // ── Strategy A+: WordPress REST API — paginate if we saw a wp-json URL ──
  const wpApiUrl = allApiData.find(d => d.url.includes('/wp-json/'))?.url;
  if (wpApiUrl && apiEvents.length === 0) {
    const wpEvents = await fetchWordPressEvents(wpApiUrl, name);
    debug(`${name}: WordPress REST API → ${wpEvents.length} events`);
    if (wpEvents.length >= 1) return wpEvents;
  }

  // ── Strategy C+: agenda cards with inline Dutch dates and titles ───────
  const inlineEvents = [];
  const inlineSeen = new Set(apiEvents.map(ev => `${ev.name}|${ev.startDate}`));
  for (const ev of [
    ...(homeRes ? extractInlineAgendaEvents(homeRes.html, homeRes.finalUrl) : []),
    ...agendaPages.flatMap(page => extractAgendaListingEvents(page.html, page.finalUrl)),
  ]) {
    const key = `${ev.name}|${ev.startDate}`;
    if (!inlineSeen.has(key)) { inlineSeen.add(key); inlineEvents.push(ev); }
  }
  debug(`${name}: inline agenda cards → ${inlineEvents.length} events`);
  if (inlineEvents.length >= 1) return [...apiEvents, ...inlineEvents];

  // ── Strategy B: collect show links → visit detail pages ────────────────
  const showLinks = filterShowLinks(agendaPages.flatMap(page => page.links || []), rendered.finalUrl || origin);
  debug(`${name}: show detail links → ${showLinks.length}`);

  const events  = [...(homeRes ? extractJsonLdEvents(homeRes.html, homeRes.finalUrl) : []), ...apiEvents];
  const seen    = new Set(events.map(e => `${e.name}|${e.startDate}`));
  const toVisit = showLinks.slice(0, MAX_DETAIL_PAGES);

  for (const detailUrl of toVisit) {
    const res = await fetchHtml(detailUrl, 8000);
    if (!res) { await sleep(300); continue; }

    // First try JSON-LD Event schema
    let detailEvents = extractJsonLdEvents(res.html, res.finalUrl);

    // Ticketing fallback with event names/dates rendered in page text
    if (detailEvents.length === 0) {
      detailEvents = extractVoordemensenEvents(res.html, res.finalUrl);
    }

    // Fallback: HTML heuristic for pages with WebPage/Article JSON-LD
    if (detailEvents.length === 0) {
      detailEvents = extractFromHtml(res.html, res.finalUrl);
    }

    // Fallback: FareHarbor item calendars embedded on detail pages
    if (detailEvents.length === 0) {
      detailEvents = await extractFareHarborEvents(res.html, res.finalUrl);
    }

    for (const ev of detailEvents) {
      const key = `${ev.name}|${ev.startDate}`;
      if (!seen.has(key)) { seen.add(key); events.push(ev); }
    }
    await sleep(350);
  }

  if (events.length === 0 && homeArticleEvents.length > 0) {
    events.push(...homeArticleEvents);
  }

  debug(`${name}: total after detail pages → ${events.length}`);
  return events;
}

// ---------------------------------------------------------------------------
// Normalise to Podium Performance shape
// ---------------------------------------------------------------------------

function normalise(ev, theatre) {
  const title = decodeHtml(ev.name || '');
  const description = decodeHtml(ev.description || '');

  // For API-sourced events, source_url is the raw API endpoint — use theatre website instead
  const sourceUrl = (() => {
    const u = ev.url || '';
    if (!u || u.includes('/api/') || u.includes('_feed') || u.includes('event_feed')) {
      return theatre.website || '';
    }
    return u;
  })();

  return {
    theatre_name:   theatre.name,
    theatre_osm_id: theatre.osm_id,
    theatre_city:   theatre.city,
    title,
    description,
    genre:          detectGenre(title + ' ' + description + ' ' + decodeHtml(ev._tagGenre || '')),
    date_time:      ev.startDate,
    ticket_url:     ev.ticketUrl || ev.url || '',
    image_url:      ev.image || '',
    source_url:     sourceUrl,
    scraped_at:     new Date().toISOString(),
    scrape_technique: ev.type || 'unknown',
  };
}

function theatreIdentity(theatre) {
  return `${theatre.osm_type || ''}/${theatre.osm_id}`;
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function updatePendingRescueQueue(rows, attemptedAt) {
  const pending = rows.filter(r => r.count === 0);
  if (pending.length === 0) return;

  const section = [
    '## Pending rescue queue',
    '',
    `Generated from \`node scripts/scrape-shows.js --unscraped\` on ${attemptedAt}. Known blacklisted theatres are excluded unless \`--include-blacklisted\` is used.`,
    '',
    '| Theatre | City | Website | Status | Last attempted |',
    '| --- | --- | --- | --- | --- |',
    ...pending
      .sort((a, b) => a.name.localeCompare(b.name) || (a.city || '').localeCompare(b.city || ''))
      .map(r => {
        const status = r.status === '❌' ? 'error' : 'no shows';
        return `| ${markdownCell(r.name)} | ${markdownCell(r.city)} | ${markdownCell(r.website)} | ${status} | ${attemptedAt} |`;
      }),
    '',
  ].join('\n');

  let doc = fs.existsSync(RESCUE_FILE)
    ? fs.readFileSync(RESCUE_FILE, 'utf8')
    : '# Rescued Theatres\n\n';

  const sectionPattern = /\n?## Pending rescue queue\n[\s\S]*?(?=\n## |\s*$)/;
  if (sectionPattern.test(doc)) {
    doc = doc.replace(sectionPattern, `\n${section}`);
  } else if (doc.includes('\n## Blacklisted from seeding')) {
    doc = doc.replace('\n## Blacklisted from seeding', `\n${section}\n## Blacklisted from seeding`);
  } else {
    doc = `${doc.replace(/\s*$/, '')}\n\n${section}`;
  }

  fs.writeFileSync(RESCUE_FILE, `${doc.replace(/\s*$/, '')}\n`, 'utf8');
  log(`🛟 Added ${pending.length} theatres to pending rescue queue → ${RESCUE_FILE}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🎭  Podium Show Scraper  v2  (API intercept + link crawl + JSON-LD)');
  console.log('─'.repeat(70));
  log('Loading dutch_theatres.json…\n');

  const allTheatres = JSON.parse(fs.readFileSync(THEATRES_FILE, 'utf8'));
  let theatres = allTheatres.filter(t => t.website && t.website.startsWith('http'));

  if (UNSCRAPED_ONLY) {
    theatres = theatres.filter(t => !t.last_events_scraped_at);
    log(`🕵️  Filtered to ${theatres.length} theatres with no previous event scrape timestamp`);

    if (!INCLUDE_BLACKLISTED) {
      const beforeBlacklistFilter = theatres.length;
      theatres = theatres.filter(t => !t.blacklisted);
      const skippedBlacklisted = beforeBlacklistFilter - theatres.length;
      if (skippedBlacklisted > 0) {
        log(`🚫 Skipping ${skippedBlacklisted} already-blacklisted theatres`);
      }
    }
  }

  if (FILTER_NAME) {
    const filterLower = FILTER_NAME.toLowerCase();
    const exactMatches = theatres.filter(t => t.name.toLowerCase() === filterLower);
    theatres = exactMatches.length > 0
      ? exactMatches
      : theatres.filter(t => t.name.toLowerCase().includes(filterLower));
    log(`🔍 Filtered to ${theatres.length} theatre(s) matching "${FILTER_NAME}"`);
  }
  if (LIMIT) {
    theatres = theatres.slice(0, LIMIT);
    log(`🔢 Limiting to first ${LIMIT} theatres`);
  }
  log(`📂 ${allTheatres.length} total → ${theatres.length} with websites\n`);

  let existingShows = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try { existingShows = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')); } catch {}
    if (existingShows.length) log(`📂 Loaded ${existingShows.length} existing shows\n`);
  }

  const allShows = [];
  const stats    = { found: 0, skipped: 0, failed: 0 };
  const rows     = [];
  const theatreScrapeTimes = new Map();

  for (let i = 0; i < theatres.length; i++) {
    const theatre = theatres[i];
    process.stdout.write(`[${i + 1}/${theatres.length}] ${theatre.name.slice(0, 40).padEnd(40)} `);

    let rawEvents = [];
    try {
      rawEvents = await scrapeTheatre(theatre);
    } catch (err) {
      warn(`${theatre.name}: ${err.message}`);
      stats.failed++;
      console.log('❌ error');
      rows.push({
        name: theatre.name,
        city: theatre.city,
        website: theatre.website,
        osm_id: theatre.osm_id,
        count: 0,
        status: '❌',
        technique: 'error',
      });
      theatreScrapeTimes.set(theatreIdentity(theatre), new Date().toISOString());
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    // Deduplicate
    const seen    = new Set();
    const deduped = rawEvents.filter(e => {
      const k = `${e.name}|${e.startDate}`;
      return seen.has(k) ? false : !!seen.add(k);
    });

    if (deduped.length === 0) {
      stats.skipped++;
      console.log('— no shows found');
      rows.push({
        name: theatre.name,
        city: theatre.city,
        website: theatre.website,
        osm_id: theatre.osm_id,
        count: 0,
        status: '—',
        technique: 'none',
      });
    } else {
      const techniqueCount = {};
      deduped.forEach(e => { techniqueCount[e.type] = (techniqueCount[e.type] || 0) + 1; });
      const dominantTechnique = Object.keys(techniqueCount).sort((a,b) => techniqueCount[b]-techniqueCount[a])[0] || 'unknown';

      const normalised = deduped.map(e => normalise(e, theatre));
      allShows.push(...normalised);
      stats.found += normalised.length;
      console.log(`✅ ${normalised.length} shows (${dominantTechnique})`);
      rows.push({
        name: theatre.name,
        city: theatre.city,
        website: theatre.website,
        osm_id: theatre.osm_id,
        count: normalised.length,
        status: '✅',
        technique: dominantTechnique,
      });
    }

    theatreScrapeTimes.set(theatreIdentity(theatre), new Date().toISOString());
    await sleep(REQUEST_DELAY_MS);
  }

  if (_browser) { await _browser.close(); _browser = null; }

  // Merge + global dedup
  const currentTheatreIds = new Set(theatres.map(t => t.osm_id));
  const baseShows = FILTER_NAME
    ? existingShows.filter(s => !currentTheatreIds.has(s.theatre_osm_id))
    : existingShows;
  const merged     = [...baseShows, ...allShows];
  const globalSeen = new Set();
  const final      = merged.filter(s => {
    const k = `${s.theatre_osm_id}|${s.title}|${s.date_time}`;
    return globalSeen.has(k) ? false : !!globalSeen.add(k);
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(final, null, 2), 'utf8');
  fs.writeFileSync(REPORT_FILE, JSON.stringify(rows, null, 2), 'utf8');
  if (UNSCRAPED_ONLY) {
    updatePendingRescueQueue(rows, new Date().toISOString());
  }
  if (theatreScrapeTimes.size > 0) {
    const updatedTheatres = allTheatres.map(theatre => {
      const scrapedAt = theatreScrapeTimes.get(theatreIdentity(theatre));
      return scrapedAt ? { ...theatre, last_events_scraped_at: scrapedAt } : theatre;
    });
    fs.writeFileSync(THEATRES_FILE, JSON.stringify(updatedTheatres, null, 2), 'utf8');
  }

  console.log('\n' + '─'.repeat(70));
  console.log('  Theatre breakdown:');
  rows.filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .forEach(r => {
      const bar = '█'.repeat(Math.min(Math.round(r.count / 2), 25));
      console.log(`    ${r.name.slice(0, 32).padEnd(32)} ${String(r.count).padStart(3)}  ${bar}`);
    });

  console.log(`\n  ✅ With shows : ${rows.filter(r => r.count > 0).length}`);
  console.log(`  — No shows   : ${stats.skipped}`);
  console.log(`  ❌ Errors    : ${stats.failed}`);
  console.log(`  🎭 Total     : ${stats.found} shows scraped`);
  console.log(`  💾 Output    : ${final.length} shows (merged + deduped)\n`);
  log(`💾 Written → ${OUTPUT_FILE}`);
  log('✅ Done!  Run: npm run import-shows\n');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  if (_browser) _browser.close();
  process.exit(1);
});
