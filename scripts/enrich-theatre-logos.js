#!/usr/bin/env node
/**
 * enrich-theatre-logos.js
 *
 * Finds likely theatre logo URLs from each theatre website and stores them in
 * dutch_theatres.json as image_url. With --db, also updates podium.db.
 *
 * Usage:
 *   node scripts/enrich-theatre-logos.js
 *   node scripts/enrich-theatre-logos.js --db
 *   node scripts/enrich-theatre-logos.js --force --limit 50 --db
 *   node scripts/enrich-theatre-logos.js --theatre "Agnietenhof" --db
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const UPDATE_DB = args.includes('--db');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i !== -1 ? parseInt(args[i + 1], 10) : null;
})();
const FILTER_NAME = (() => {
  const i = args.indexOf('--theatre');
  return i !== -1 ? args[i + 1] : null;
})();

const THEATRES_FILE = path.resolve(__dirname, '..', 'Podium App', 'server', 'dutch_theatres.json');
const DB_FILE = path.resolve(__dirname, '..', 'Podium App', 'server', 'podium.db');
const SQL_JS_DIR = path.resolve(__dirname, '..', 'Podium App', 'server', 'node_modules', 'sql.js');

const FETCH_TIMEOUT_MS = 10000;
const CONCURRENCY = 6;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function theatreKey(theatre) {
  if (theatre.osm_type && theatre.osm_id) return `${theatre.osm_type}/${theatre.osm_id}`;
  return `${theatre.name || ''}/${theatre.city || ''}`.toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveUrl(href, base) {
  if (!href || href.startsWith('data:') || href.startsWith('blob:')) return null;
  try { return new URL(href, base).href; } catch { return null; }
}

function textTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 4 && !['theater', 'theatre', 'schouwburg', 'podium'].includes(token));
}

function parseSrcset(srcset) {
  if (!srcset) return '';
  const candidates = srcset.split(',')
    .map(part => part.trim().split(/\s+/))
    .filter(part => part[0])
    .map(part => ({
      src: part[0],
      width: parseInt((part[1] || '').replace(/\D/g, ''), 10) || 0,
    }));
  candidates.sort((a, b) => b.width - a.width);
  return candidates[0]?.src || '';
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'PodiumApp/1.0 (theatre logo enricher; educational project)',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;
    return { html: await res.text(), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function addCandidate(candidates, url, score, reason, context = '') {
  if (!url) return;
  const lower = url.toLowerCase();
  const noisyText = `${lower} ${String(context || '').toLowerCase()}`.replace(/[_-]+/g, ' ');
  if (!/^https?:\/\//.test(url)) return;
  if (/\.(pdf|zip|docx?|xlsx?)(?:[?#]|$)/i.test(lower)) return;
  if (/(?:no logo|american express|sint laurensfonds|portofrotterdam|logo carousel|shopping cart|menu open|darkride|delft fringe|video 200 jaar|slide welkom)/i.test(noisyText)) return;
  if (/\b(?:sponsor|partner|payment|mastercard|amex|mollie|paypal|ideal|bancontact|visa|gemeente|ministerie|provincie|cookie|webtoffee|translate|flag|placeholder|poster|hero|banner|agenda|event|voorstelling|production|stagebg|background|shopping|cart|instagram|facebook|youtube|search|footer|client|adverteerder|funder|subsidie|fonds|fondsen|jaarbeurs|stadsherstel|keimedia|huetink|scenefoto|scenefotos|publiek|studenten|carousel|swiper|spinner|loader|loading|prev|next|screenshot|scherm)\b/i.test(noisyText)) return;

  let finalScore = score;
  if (/\b(?:logo|brand|beeldmerk|wordmark|site-logo)\b/i.test(`${url} ${context}`)) finalScore += 40;
  if (/\.(svg)(?:[?#]|$)/i.test(lower)) finalScore += 16;
  if (/\.(png|webp)(?:[?#]|$)/i.test(lower)) finalScore += 10;
  if (/\.(ico)(?:[?#]|$)/i.test(lower)) finalScore -= 10;

  candidates.push({ url, score: finalScore, reason });
}

function findLogoUrl(html, pageUrl, theatre) {
  const $ = cheerio.load(html || '');
  const candidates = [];
  const nameTokens = textTokens(theatre.name);

  const scoreNameMatch = context => {
    const lower = String(context || '').toLowerCase();
    return nameTokens.some(token => lower.includes(token)) ? 18 : 0;
  };

  $('img[src], img[srcset]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || parseSrcset($el.attr('srcset'));
    const url = resolveUrl(src, pageUrl);
    const ancestors = $el.parents().slice(0, 5).map((_, parent) => {
      const $parent = $(parent);
      return [$parent[0]?.tagName, $parent.attr('class'), $parent.attr('id')].filter(Boolean).join(' ');
    }).get().join(' ');
    const context = [
      $el.attr('alt'),
      $el.attr('title'),
      $el.attr('class'),
      $el.attr('id'),
      $el.parent().attr('class'),
      $el.closest('a').attr('class'),
      ancestors,
    ].filter(Boolean).join(' ');
    const hasLogoTextContext = /\b(?:logo|brand|beeldmerk|wordmark|site-logo|navbar-brand)\b/i.test(context);
    const hasLogoUrl = /\b(?:logo|brand|beeldmerk|wordmark|site-logo|navbar-brand)\b/i.test(url);
    const hasHeaderContext = $el.closest('header, nav, [class*="header"], [class*="navbar"], [class*="navigation"], [class*="brand"]').length > 0;
    let urlPath = '';
    try {
      const parsedUrl = new URL(url);
      urlPath = `${parsedUrl.pathname} ${parsedUrl.search}`;
    } catch {}
    const hasNameMatch = scoreNameMatch(`${context} ${urlPath}`) > 0;
    const looksLikePhoto = /\.(?:jpe?g|webp)(?:[?#]|$)/i.test(url) && !/(?:logo|brand|beeldmerk|wordmark|favicon|apple-touch-icon)/i.test(url);
    if (looksLikePhoto) return;
    const isLikelySiteLogo = (
      (hasHeaderContext && (hasLogoTextContext || hasLogoUrl)) ||
      (hasLogoTextContext && hasNameMatch)
    );
    if (!isLikelySiteLogo) return;

    let score = 18 + scoreNameMatch(`${context} ${urlPath}`);
    if (hasHeaderContext) score += 35;
    if (hasLogoTextContext) score += 28;
    if (hasLogoUrl) score += 14;
    addCandidate(candidates, url, score, 'image', context);
  });

  $('link[rel]').each((_, el) => {
    const $el = $(el);
    const rel = ($el.attr('rel') || '').toLowerCase();
    const href = resolveUrl($el.attr('href'), pageUrl);
    if (!href) return;
    if (rel.includes('apple-touch-icon')) addCandidate(candidates, href, 34, 'apple-touch-icon', rel);
    else if (rel.includes('icon')) addCandidate(candidates, href, 24, 'icon', rel);
  });

  [
    'meta[property="og:logo"]',
    'meta[name="logo"]',
  ].forEach(selector => {
    const content = $(selector).attr('content');
    const url = resolveUrl(content, pageUrl);
    const score = selector.includes('logo') ? 70 : 18;
    addCandidate(candidates, url, score, selector);
  });

  const seen = new Set();
  const unique = candidates
    .filter(candidate => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    })
    .sort((a, b) => b.score - a.score);

  const best = unique[0];
  if (!best) return '';
  if (best.reason === 'image' && best.score < 70) return '';
  return best.url;
}

async function findTheatreLogo(theatre) {
  if (!theatre.website) return '';
  const res = await fetchHtml(theatre.website);
  if (!res) return '';
  return findLogoUrl(res.html, res.finalUrl, theatre);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function updateDatabase(theatres) {
  const initSqlJs = require(path.join(SQL_JS_DIR, 'dist', 'sql-asm.js'));
  const SQL = await Promise.resolve(initSqlJs({ locateFile: () => path.join(SQL_JS_DIR, 'dist', 'sql-asm-memory-growth.js') }));
  const db = new SQL.Database(fs.readFileSync(DB_FILE));

  const stmt = db.prepare('UPDATE theatres SET image_url = ? WHERE lower(name) = lower(?) AND lower(city) = lower(?)');
  let updated = 0;
  for (const theatre of theatres) {
    stmt.run([theatre.image_url || '', theatre.name, theatre.city]);
    updated++;
  }
  stmt.free();

  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
  return updated;
}

async function main() {
  console.log('\n🎭  Podium Theatre Logo Enricher');
  console.log('─'.repeat(50));

  const allTheatres = JSON.parse(fs.readFileSync(THEATRES_FILE, 'utf8'));
  let targets = allTheatres.filter(theatre => theatre.website && !theatre.blacklisted);

  if (!FORCE) targets = targets.filter(theatre => !theatre.image_url);
  if (FILTER_NAME) {
    const needle = FILTER_NAME.toLowerCase();
    targets = targets.filter(theatre => theatre.name.toLowerCase().includes(needle));
  }
  if (LIMIT) targets = targets.slice(0, LIMIT);

  log(`Scanning ${targets.length} theatre website(s)`);

  let found = 0;
  const updates = new Map();
  await mapLimit(targets, CONCURRENCY, async (theatre, index) => {
    const logoUrl = await findTheatreLogo(theatre);
    if (logoUrl) {
      found++;
      updates.set(theatreKey(theatre), logoUrl);
      log(`✅ ${index + 1}/${targets.length} ${theatre.name} → ${logoUrl}`);
    } else {
      log(`—  ${index + 1}/${targets.length} ${theatre.name}`);
    }
    await sleep(150);
  });

  const merged = allTheatres.map(theatre => {
    const key = theatreKey(theatre);
    if (updates.has(key)) return { ...theatre, image_url: updates.get(key) };
    if (FORCE && targets.some(target => theatreKey(target) === key)) {
      return { ...theatre, image_url: '' };
    }
    return theatre;
  });

  fs.writeFileSync(THEATRES_FILE, JSON.stringify(merged, null, 2), 'utf8');
  log(`💾 Updated ${found} logo URL(s) in ${THEATRES_FILE}`);

  if (UPDATE_DB) {
    const updatedDbRows = await updateDatabase(merged);
    log(`💾 Updated ${updatedDbRows} theatre row(s) in podium.db`);
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
