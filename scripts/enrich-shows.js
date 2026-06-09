#!/usr/bin/env node
/**
 * enrich-shows.js
 *
 * Post-processing step that enriches theatre_shows.json:
 *
 * 1. Decodes HTML entities in titles (e.g., &amp; -> &)
 * 2. Normalises source_url (removes raw API endpoints)
 * 3. Normalises genre from Flint's _tagGenre field
 * 4. Carre: fetches individual show pages to get image_url and description
 *
 * Run AFTER scrape-shows.js but BEFORE import-shows.js:
 *   node scripts/enrich-shows.js
 *   node scripts/enrich-shows.js --verbose
 *   node scripts/enrich-shows.js --only-missing-images
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const cheerio = require('cheerio');

const args             = process.argv.slice(2);
const VERBOSE          = args.includes('--verbose');
const ONLY_MISSING_IMG = args.includes('--only-missing-images');

const SHOWS_FILE    = path.resolve(__dirname, '..', 'Podium App', 'server', 'theatre_shows.json');
const THEATRES_FILE = path.resolve(__dirname, '..', 'Podium App', 'server', 'dutch_theatres.json');
const FETCH_TIMEOUT = 10000;
const DELAY_MS      = 400;

function log(msg)   { console.log(`[${new Date().toISOString()}] ${msg}`); }
function debug(msg) { if (VERBOSE) console.log(`  ${msg}`); }
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&eacute;/g, 'e')
    .replace(/&egrave;/g, 'e')
    .replace(/&euml;/g, 'e')
    .replace(/&aacute;/g, 'a')
    .replace(/&oacute;/g, 'o')
    .replace(/&uuml;/g, 'u')
    .replace(/&#\d+;/g, '');
}

async function fetchHtml(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'PodiumApp/1.0 (Dutch theatre show enrichment)',
        'Accept-Language': 'nl-NL,nl;q=0.9',
      },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// Genre normalisation (Flint tags -> our genre names)
const FLINT_TAG_MAP = {
  'Cabaret':     'Cabaret',
  'Theater':     'Toneel',
  'Dans':        'Dans',
  'Opera':       'Opera',
  'Musical':     'Musical',
  'Muziek':      'Muziek',
  'Klassiek':    'Muziek',
  'Concert':     'Muziek',
  'Jeugd':       'Jeugd',
  'Film':        'Film',
  'Kinderen':    'Jeugd',
  'Comedy':      'Comedy',
  'Spoken word': 'Toneel',
  'Lezing':      'Toneel',
  'Spreker':     'Toneel',
};

function resolveGenre(show) {
  if (show._tagGenre) {
    for (const [key, val] of Object.entries(FLINT_TAG_MAP)) {
      if (show._tagGenre.toLowerCase().includes(key.toLowerCase())) return val;
    }
  }
  return show.genre || 'Toneel';
}

// Source URL cleanup - replace API endpoints with theatre websites
let theatreWebsites = null;
function getTheatreWebsite(name) {
  if (!theatreWebsites) {
    const t = JSON.parse(fs.readFileSync(THEATRES_FILE, 'utf8'));
    theatreWebsites = new Map(t.map(x => [x.name.toLowerCase(), x.website || '']));
  }
  return theatreWebsites.get(name.toLowerCase()) || '';
}

function cleanSourceUrl(show) {
  const u = show.source_url || '';
  if (!u || u.includes('/api/') || u.includes('_feed') || u.includes('event_feed') || u.includes('ticketmatic')) {
    return getTheatreWebsite(show.theatre_name) || show.ticket_url || '';
  }
  return u;
}

// Carre show page enrichment
const CARRE_CACHE = new Map();

async function enrichCarreShow(show) {
  const cacheKey = show.title.toLowerCase().trim();
  if (CARRE_CACHE.has(cacheKey)) {
    const cached = CARRE_CACHE.get(cacheKey);
    if (!show.image_url && cached.image) show.image_url = cached.image;
    if (!show.description && cached.desc) show.description = cached.desc;
    return;
  }

  const slug = show.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  const urls = [
    `https://carre.nl/voorstelling/${slug}`,
    `https://www.carre.nl/voorstelling/${slug}`,
  ];

  for (const url of urls) {
    const html = await fetchHtml(url);
    if (!html) continue;

    const $ = cheerio.load(html);
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDesc  = $('meta[property="og:description"]').attr('content') || '';

    let ldImage = '';
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const d = JSON.parse($(el).html());
        const img = d.image || (d.image && d.image.url) || (Array.isArray(d.image) && d.image[0]);
        if (img && typeof img === 'string') ldImage = img;
      } catch {}
    });

    const image = ldImage || ogImage || '';
    const desc  = ogDesc || '';

    CARRE_CACHE.set(cacheKey, { image, desc });
    if (image) show.image_url   = image;
    if (desc)  show.description = show.description || desc;
    debug(`Carre: ${show.title} -> img: ${!!image}`);
    await sleep(DELAY_MS);
    return;
  }

  CARRE_CACHE.set(cacheKey, { image: '', desc: '' });
}

// Main
async function main() {
  console.log('\nPodium Show Enricher');
  console.log('-'.repeat(50));

  const shows = JSON.parse(fs.readFileSync(SHOWS_FILE, 'utf8'));
  log(`Loaded ${shows.length} shows`);

  let enriched = 0;

  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];

    // 1. Decode HTML entities in title and description
    const cleanTitle = decodeHtml(show.title || '');
    if (cleanTitle !== show.title) { show.title = cleanTitle; enriched++; }
    show.description = decodeHtml(show.description || '');

    // 2. Fix source_url for API-sourced shows
    show.source_url = cleanSourceUrl(show);

    // 3. Normalise genre using _tagGenre if present
    const newGenre = resolveGenre(show);
    if (newGenre !== show.genre) { show.genre = newGenre; enriched++; }

    // 4. Remove internal _tagGenre property
    delete show._tagGenre;

    // 5. Enrich Carre shows with images (skip if already has image)
    if (show.theatre_name && show.theatre_name.toLowerCase().includes('carr')) {
      if (!ONLY_MISSING_IMG || !show.image_url) {
        await enrichCarreShow(show);
        enriched++;
      }
    }

    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${shows.length}\r`);
  }

  fs.writeFileSync(SHOWS_FILE, JSON.stringify(shows, null, 2), 'utf8');
  console.log('');
  log(`Enriched ${enriched} fields across ${shows.length} shows -> saved to theatre_shows.json`);
  log('Next: npm run import-shows');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
