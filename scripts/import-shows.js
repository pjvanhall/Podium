#!/usr/bin/env node
/**
 * import-shows.js
 *
 * Reads theatre_shows.json and upserts scraped shows into podium.db.
 *
 * Identity model:
 * - theatres get stable IDs from hash(name + city), with OSM stored as metadata
 * - shows get stable IDs from theatre + source event ID when possible
 * - fallback show identity is theatre + title + date_time
 *
 * Lifecycle model:
 * - seen shows are inserted or updated, with last_seen_at refreshed
 * - changed content sets status='changed' and changed_at
 * - missing future shows are soft-removed after --missing-threshold misses
 *
 * Usage:
 *   node scripts/import-shows.js
 *   node scripts/import-shows.js --dry-run
 *   node scripts/import-shows.js --missing-threshold=1
 *   node scripts/import-shows.js --clear
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CLEAR = args.includes('--clear');
const missingThresholdArg = args.find(arg => arg.startsWith('--missing-threshold='));
const MISSING_THRESHOLD = Math.max(
  1,
  parseInt(
    missingThresholdArg?.split('=')[1] || process.env.SCRAPER_MISSING_THRESHOLD || '2',
    10
  ) || 2
);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVER_DIR = path.resolve(__dirname, '..', 'Podium App', 'server');
const SHOWS_FILE = path.join(SERVER_DIR, 'theatre_shows.json');
const THEATRES_FILE = path.join(SERVER_DIR, 'dutch_theatres.json');
const DB_FILE = path.join(SERVER_DIR, 'podium.db');
const SQL_JS_DIR = path.join(SERVER_DIR, 'node_modules', 'sql.js');
const DATA_BACKEND = String(process.env.DATA_BACKEND || '').toLowerCase().trim();
const SPLIT_BACKEND =
  DATA_BACKEND === 'split' ||
  (!DATA_BACKEND && process.env.DATABASE_URL && (process.env.NOSQL_CONNECTION_STRING || process.env.MONGODB_URI));
const NOSQL_CONNECTION_STRING = process.env.NOSQL_CONNECTION_STRING || process.env.MONGODB_URI || '';
const NOSQL_DB_NAME = process.env.NOSQL_DB_NAME || process.env.MONGODB_DB_NAME || 'podium';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString()}] ${msg}`); }

function decodeHtmlEntities(value) {
  if (typeof value !== 'string' || !value.includes('&')) return value;

  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  let decoded = value;
  for (let i = 0; i < 2; i++) {
    decoded = decoded
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
      .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
  }

  return decoded;
}

function normalizeIdentifierPart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:/.-]/g, '');
}

function hashParts(prefix, parts) {
  const normalized = parts.map(normalizeIdentifierPart).join('|');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return `${prefix}_${hash}`;
}

function buildTheatreStableId(theatre) {
  return hashParts('theatre', [theatre.name, theatre.city]);
}

function extractEventIdFromUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
    const eventParams = ['event', 'event_id', 'eventId', 'production', 'production_id', 'id'];
    for (const key of eventParams) {
      const paramValue = url.searchParams.get(key);
      if (paramValue) return `${key}:${paramValue}`;
    }

    const fromEvent = url.searchParams.get('returnurl') || url.searchParams.get('returnUrl');
    if (fromEvent) {
      const nested = decodeURIComponent(fromEvent);
      const match = nested.match(/[?&](?:from_event|event|event_id)=([^&]+)/i);
      if (match) return `returnurl:${match[1]}`;
    }
  } catch (_err) {
    const match = String(value).match(/[?&](?:event|event_id|eventId|from_event)=([^&]+)/i);
    if (match) return `url:${match[1]}`;
  }

  return '';
}

function canonicalSourceUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch (_err) {
    return String(value).split('#')[0].split('?')[0].replace(/\/$/, '');
  }
}

function buildShowStableId(show, theatreStableId) {
  const sourceEventId =
    show.source_event_id ||
    show.sourceEventId ||
    extractEventIdFromUrl(show.ticket_url) ||
    '';

  if (sourceEventId) {
    return hashParts('show', [theatreStableId, sourceEventId]);
  }

  const canonicalUrl = canonicalSourceUrl(show.source_url);
  const sourceUrlLooksSpecific =
    canonicalUrl &&
    !/\/api\/|\/graphql|\/json|\/feed|\/agenda\/?$|\/events\/?$|\/calendar\/?$/i.test(canonicalUrl);

  if (sourceUrlLooksSpecific) {
    return hashParts('show', [theatreStableId, canonicalUrl]);
  }

  return hashParts('show', [theatreStableId, show.title, show.date_time]);
}

function buildShowContentHash(show) {
  return hashParts('content', [
    show.title,
    show.description,
    show.genre,
    show.date_time,
    show.image_url,
    show.source_url,
    show.source_event_id,
  ]);
}

// ---------------------------------------------------------------------------
// Database bootstrap
// ---------------------------------------------------------------------------

function openDb() {
  const initSqlJs = require(path.join(SQL_JS_DIR, 'dist', 'sql-asm.js'));
  const dbBuffer = fs.readFileSync(DB_FILE);

  return new Promise((resolve, reject) => {
    const result = initSqlJs({ locateFile: () => path.join(SQL_JS_DIR, 'dist', 'sql-asm-memory-growth.js') });
    const init = result && typeof result.then === 'function' ? result : Promise.resolve(result);
    init.then(SQL => {
      const db = new SQL.Database(dbBuffer);
      resolve({ db, SQL });
    }).catch(reject);
  });
}

function persistDb(db) {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function createDbHelpers(db) {
  const queryAll = (sql, params = []) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  };
  const queryOne = (sql, params = []) => queryAll(sql, params)[0] || null;
  const runSql = (sql, params = []) => {
    db.run(sql, params);
    return queryOne('SELECT last_insert_rowid() as id')?.id ?? null;
  };

  return { queryAll, queryOne, runSql };
}

function ensureColumn(db, queryAll, tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (!columns.some(column => column.name === columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureScrapeSchema(db, helpers) {
  const { queryAll } = helpers;

  ensureColumn(db, queryAll, 'theatres', 'stable_id', 'TEXT');
  ensureColumn(db, queryAll, 'theatres', 'osm_id', "TEXT DEFAULT ''");

  ensureColumn(db, queryAll, 'performances', 'show_id', 'TEXT');
  ensureColumn(db, queryAll, 'performances', 'source_event_id', "TEXT DEFAULT ''");
  ensureColumn(db, queryAll, 'performances', 'source_url', "TEXT DEFAULT ''");
  ensureColumn(db, queryAll, 'performances', 'content_hash', "TEXT DEFAULT ''");
  ensureColumn(db, queryAll, 'performances', 'status', "TEXT DEFAULT 'active'");
  ensureColumn(db, queryAll, 'performances', 'removed', 'INTEGER DEFAULT 0');
  ensureColumn(db, queryAll, 'performances', 'removed_when', 'DATETIME');
  ensureColumn(db, queryAll, 'performances', 'changed_at', 'DATETIME');
  ensureColumn(db, queryAll, 'performances', 'first_seen_at', 'DATETIME');
  ensureColumn(db, queryAll, 'performances', 'last_seen_at', 'DATETIME');
  ensureColumn(db, queryAll, 'performances', 'missing_since', 'DATETIME');
  ensureColumn(db, queryAll, 'performances', 'missing_count', 'INTEGER DEFAULT 0');

  ensureColumn(db, queryAll, 'attendance', 'show_id', 'TEXT');
  ensureColumn(db, queryAll, 'attendance', 'title_snapshot', "TEXT DEFAULT ''");
  ensureColumn(db, queryAll, 'attendance', 'date_time_snapshot', 'DATETIME');
  ensureColumn(db, queryAll, 'attendance', 'theatre_name_snapshot', "TEXT DEFAULT ''");
  ensureColumn(db, queryAll, 'attendance', 'theatre_city_snapshot', "TEXT DEFAULT ''");

  db.run('CREATE INDEX IF NOT EXISTS idx_theatres_stable_id ON theatres(stable_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_theatres_osm_id ON theatres(osm_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_performances_show_id ON performances(show_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_performances_removed ON performances(removed)');
  db.run('CREATE INDEX IF NOT EXISTS idx_attendance_show ON attendance(show_id)');
}

function loadTheatresMeta() {
  return JSON.parse(fs.readFileSync(THEATRES_FILE, 'utf8'));
}

function buildTheatreLookup(helpers) {
  const { queryAll } = helpers;
  const theatreRows = queryAll('SELECT id, stable_id, osm_id, name, city FROM theatres');
  const theatresMeta = loadTheatresMeta();
  const metaByNameCity = new Map(
    theatresMeta.map(theatre => [
      `${String(theatre.name || '').toLowerCase()}|${String(theatre.city || '').toLowerCase()}`,
      theatre,
    ])
  );

  const byName = new Map();
  const byNameCity = new Map();
  const byOsmId = new Map();
  const stableById = new Map();
  const osmById = new Map();

  for (const row of theatreRows) {
    const key = `${String(row.name || '').toLowerCase()}|${String(row.city || '').toLowerCase()}`;
    const meta = metaByNameCity.get(key) || {};
    const stableId = row.stable_id || buildTheatreStableId(row);
    const osmId = row.osm_id || (meta.osm_id !== undefined && meta.osm_id !== null ? String(meta.osm_id) : '');

    byName.set(String(row.name || '').toLowerCase(), row.id);
    byNameCity.set(key, row.id);
    stableById.set(row.id, stableId);
    osmById.set(row.id, osmId);
    if (osmId) byOsmId.set(String(osmId), row.id);
  }

  return { byName, byNameCity, byOsmId, stableById, osmById, theatreRows };
}

function syncTheatreStableIds(helpers, theatreLookup) {
  const { runSql } = helpers;

  for (const row of theatreLookup.theatreRows) {
    const stableId = theatreLookup.stableById.get(row.id);
    const osmId = theatreLookup.osmById.get(row.id) || '';

    if (row.stable_id !== stableId || row.osm_id !== osmId) {
      runSql(
        'UPDATE theatres SET stable_id = ?, osm_id = ? WHERE id = ?',
        [stableId, osmId, row.id]
      );
    }
  }
}

function resolveTheatreId(show, theatreLookup) {
  if (show.theatre_osm_id !== undefined && show.theatre_osm_id !== null) {
    const byOsm = theatreLookup.byOsmId.get(String(show.theatre_osm_id));
    if (byOsm) return byOsm;
  }

  const nameCityKey = `${String(show.theatre_name || '').toLowerCase()}|${String(show.theatre_city || '').toLowerCase()}`;
  return theatreLookup.byNameCity.get(nameCityKey)
    ?? theatreLookup.byName.get(String(show.theatre_name || '').toLowerCase())
    ?? null;
}

function normalizeShow(show) {
  return {
    title: decodeHtmlEntities(show.title || ''),
    description: decodeHtmlEntities(show.description || ''),
    genre: decodeHtmlEntities(show.genre || 'Toneel'),
    date_time: show.date_time,
    ticket_url: show.ticket_url || '',
    image_url: show.image_url || '',
    source_url: show.source_url || '',
    source_event_id: show.source_event_id || extractEventIdFromUrl(show.ticket_url) || '',
  };
}

function updateAttendanceSnapshotsForPerformance(helpers, performanceId, show) {
  const { runSql } = helpers;
  runSql(
    `UPDATE attendance
     SET show_id = COALESCE(NULLIF(show_id, ''), ?),
       title_snapshot = COALESCE(NULLIF(title_snapshot, ''), ?),
       date_time_snapshot = COALESCE(date_time_snapshot, ?),
       theatre_name_snapshot = COALESCE(NULLIF(theatre_name_snapshot, ''), ?),
       theatre_city_snapshot = COALESCE(NULLIF(theatre_city_snapshot, ''), ?)
     WHERE performance_id = ?`,
    [
      show.show_id,
      show.title,
      show.date_time,
      show.theatre_name,
      show.theatre_city,
      performanceId,
    ]
  );
}

function loadTheatresForSplit() {
  return JSON.parse(fs.readFileSync(THEATRES_FILE, 'utf8'))
    .filter(theatre => !theatre.blacklisted);
}

function splitTheatreDoc(theatre) {
  const stableId = buildTheatreStableId(theatre);
  return {
    _id: stableId,
    id: stableId,
    stable_id: stableId,
    osm_id: theatre.osm_id !== undefined && theatre.osm_id !== null ? String(theatre.osm_id) : '',
    osm_type: theatre.osm_type || '',
    name: theatre.name,
    city: theatre.city,
    address: theatre.address || '',
    province: theatre.province || '',
    image_url: theatre.image_url || '',
    website: theatre.website || '',
    description: theatre.description || '',
    latitude: theatre.latitude,
    longitude: theatre.longitude,
    phone: theatre.phone || '',
    openstreetmap_imported_at: theatre.openstreetmap_imported_at || null,
    last_events_scraped_at: theatre.last_events_scraped_at || null,
    updated_at: new Date().toISOString(),
  };
}

function buildSplitTheatreLookup(theatreDocs) {
  const byName = new Map();
  const byNameCity = new Map();
  const byOsmId = new Map();

  for (const theatre of theatreDocs) {
    byName.set(String(theatre.name || '').toLowerCase(), theatre);
    byNameCity.set(`${String(theatre.name || '').toLowerCase()}|${String(theatre.city || '').toLowerCase()}`, theatre);
    if (theatre.osm_id) byOsmId.set(String(theatre.osm_id), theatre);
  }

  return { byName, byNameCity, byOsmId };
}

function resolveSplitTheatre(show, theatreLookup) {
  if (show.theatre_osm_id !== undefined && show.theatre_osm_id !== null) {
    const byOsm = theatreLookup.byOsmId.get(String(show.theatre_osm_id));
    if (byOsm) return byOsm;
  }

  const nameCityKey = `${String(show.theatre_name || '').toLowerCase()}|${String(show.theatre_city || '').toLowerCase()}`;
  return theatreLookup.byNameCity.get(nameCityKey)
    ?? theatreLookup.byName.get(String(show.theatre_name || '').toLowerCase())
    ?? null;
}

async function ensureNoSqlIndexes(db) {
  await db.collection('theatres').createIndex({ stable_id: 1 }, { unique: true });
  await db.collection('theatres').createIndex({ osm_id: 1 });
  await db.collection('shows').createIndex({ show_id: 1 }, { unique: true });
  await db.collection('shows').createIndex({ theatre_id: 1 });
  await db.collection('shows').createIndex({ date_time: 1 });
  await db.collection('shows').createIndex({ removed: 1 });
  await db.collection('shows').createIndex({ status: 1 });
  await db.collection('scrape_runs').createIndex({ started_at: -1 });
  await db.collection('show_change_events').createIndex({ show_id: 1, created_at: -1 });
}

async function importShowsToNoSql(shows) {
  if (!NOSQL_CONNECTION_STRING) {
    throw new Error('DATA_BACKEND=split requires NOSQL_CONNECTION_STRING or MONGODB_URI.');
  }

  const { MongoClient } = require('mongodb');
  const client = new MongoClient(NOSQL_CONNECTION_STRING);
  await client.connect();

  try {
    const db = client.db(NOSQL_DB_NAME);
    await ensureNoSqlIndexes(db);

    const theatres = db.collection('theatres');
    const showCollection = db.collection('shows');
    const scrapeRuns = db.collection('scrape_runs');
    const showChangeEvents = db.collection('show_change_events');
    const now = new Date().toISOString();
    const startedAt = now;

    const theatreDocs = loadTheatresForSplit().map(splitTheatreDoc);
    const theatreLookup = buildSplitTheatreLookup(theatreDocs);

    if (!DRY_RUN) {
      for (const theatre of theatreDocs) {
        await theatres.updateOne(
          { stable_id: theatre.stable_id },
          {
            $set: theatre,
            $setOnInsert: { created_at: now },
          },
          { upsert: true }
        );
      }
    }

    let inserted = 0;
    let updated = 0;
    let changed = 0;
    let reactivated = 0;
    let noTheatre = 0;
    let markedMissing = 0;
    let markedRemoved = 0;
    const stats = {};
    const seenShowIds = new Set();
    const processedTheatreIds = new Set();

    for (const show of shows) {
      const theatre = resolveSplitTheatre(show, theatreLookup);
      if (!theatre) {
        warn(`No theatre found for "${show.theatre_name}" (osm_id: ${show.theatre_osm_id}) - skipping`);
        noTheatre++;
        continue;
      }

      const normalizedShow = normalizeShow(show);
      const showId = buildShowStableId(normalizedShow, theatre.stable_id);
      const contentHash = buildShowContentHash(normalizedShow);
      seenShowIds.add(showId);
      processedTheatreIds.add(theatre.stable_id);

      const existing = await showCollection.findOne({ show_id: showId });
      const contentChanged = !!existing?.content_hash && existing.content_hash !== contentHash;
      const nextStatus = contentChanged ? 'changed' : 'active';

      const showDoc = {
        _id: showId,
        id: showId,
        show_id: showId,
        title: normalizedShow.title,
        description: normalizedShow.description,
        genre: normalizedShow.genre,
        date_time: normalizedShow.date_time,
        theatre_id: theatre.stable_id,
        theatre_name: theatre.name,
        theatre_city: theatre.city,
        theatre_address: theatre.address || '',
        theatre_province: theatre.province || '',
        ticket_url: normalizedShow.ticket_url,
        image_url: normalizedShow.image_url,
        source_event_id: normalizedShow.source_event_id,
        source_url: normalizedShow.source_url,
        content_hash: contentHash,
        status: nextStatus,
        removed: false,
        removed_when: null,
        missing_since: null,
        missing_count: 0,
        last_seen_at: now,
        updated_at: now,
      };

      if (!DRY_RUN) {
        await showCollection.updateOne(
          { show_id: showId },
          {
            $set: showDoc,
            $setOnInsert: {
              first_seen_at: now,
            },
            ...(contentChanged ? { $currentDate: { changed_at: true } } : {}),
          },
          { upsert: true }
        );

        if (contentChanged) {
          await showChangeEvents.insertOne({
            show_id: showId,
            type: 'changed',
            previous_content_hash: existing.content_hash,
            content_hash: contentHash,
            created_at: now,
          });
        }
      }

      if (existing) {
        updated++;
        if (contentChanged) changed++;
        if (existing.removed) reactivated++;
      } else {
        inserted++;
      }

      stats[show.theatre_name] = (stats[show.theatre_name] || 0) + 1;
    }

    if (processedTheatreIds.size > 0) {
      const candidates = await showCollection.find({
        theatre_id: { $in: [...processedTheatreIds] },
        removed: { $ne: true },
        date_time: { $gte: new Date().toISOString().slice(0, 19).replace('T', ' ') },
      }).toArray();

      for (const candidate of candidates) {
        if (candidate.show_id && seenShowIds.has(candidate.show_id)) continue;

        const nextMissingCount = (candidate.missing_count || 0) + 1;
        const shouldRemove = nextMissingCount >= MISSING_THRESHOLD;

        if (!DRY_RUN) {
          await showCollection.updateOne(
            { show_id: candidate.show_id },
            {
              $set: {
                missing_count: nextMissingCount,
                missing_since: candidate.missing_since || now,
                removed: shouldRemove,
                removed_when: shouldRemove ? (candidate.removed_when || now) : candidate.removed_when || null,
                status: shouldRemove ? 'removed' : candidate.status || 'active',
                updated_at: now,
              },
            }
          );

          if (shouldRemove) {
            await showChangeEvents.insertOne({
              show_id: candidate.show_id,
              type: 'removed',
              created_at: now,
            });
          }
        }

        markedMissing++;
        if (shouldRemove) markedRemoved++;
      }
    }

    if (!DRY_RUN) {
      await scrapeRuns.insertOne({
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        source_file: SHOWS_FILE,
        loaded: shows.length,
        inserted,
        updated,
        changed,
        reactivated,
        missing_signals: markedMissing,
        soft_removed: markedRemoved,
        no_theatre: noTheatre,
      });
    }

    console.log('\nShows per theatre:');
    Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => {
        const bar = '#'.repeat(Math.min(count, 20));
        console.log(`  ${name.slice(0, 30).padEnd(30)} ${String(count).padStart(3)}  ${bar}`);
      });

    console.log('\nSummary:');
    console.log(`  Backend        : NoSQL (${NOSQL_DB_NAME})`);
    console.log(`  Theatres synced: ${DRY_RUN ? 0 : theatreDocs.length}`);
    console.log(`  Inserted       : ${inserted}`);
    console.log(`  Updated        : ${updated}`);
    console.log(`  Changed        : ${changed}`);
    console.log(`  Reactivated    : ${reactivated}`);
    console.log(`  Missing signals: ${markedMissing}`);
    console.log(`  Soft removed   : ${markedRemoved}`);
    console.log(`  No theatre     : ${noTheatre}`);
    console.log('');
    log(DRY_RUN ? 'NoSQL dry run complete - no changes written' : 'NoSQL import complete');
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\nPodium Show Importer');
  console.log('-'.repeat(60));
  if (DRY_RUN) log('DRY-RUN mode - no changes will be written');
  log(`Missing threshold: ${MISSING_THRESHOLD} scrape run(s)`);

  if (!fs.existsSync(SHOWS_FILE)) {
    console.error(`\n${SHOWS_FILE} not found. Run npm run scrape-shows first.`);
    process.exit(1);
  }

  const shows = JSON.parse(fs.readFileSync(SHOWS_FILE, 'utf8'));
  log(`Loaded ${shows.length} shows from theatre_shows.json`);

  if (SPLIT_BACKEND) {
    log(`Using split backend: importing theatre/show catalog to NoSQL database "${NOSQL_DB_NAME}"`);
    await importShowsToNoSql(shows);
    return;
  }

  log('Opening podium.db...');
  const { db } = await openDb();
  const helpers = createDbHelpers(db);
  const { queryAll, queryOne, runSql } = helpers;
  const now = new Date().toISOString();

  ensureScrapeSchema(db, helpers);
  const theatreLookup = buildTheatreLookup(helpers);
  syncTheatreStableIds(helpers, theatreLookup);

  log(`Theatre lookup: ${theatreLookup.byOsmId.size} by OSM-ID, ${theatreLookup.byName.size} by name`);

  if (CLEAR && !DRY_RUN) {
    warn('--clear: removing all existing performances from database');
    db.run('DELETE FROM attendance');
    db.run('DELETE FROM performances');
    log('Cleared performances + attendance tables');
  }

  let inserted = 0;
  let updated = 0;
  let changed = 0;
  let reactivated = 0;
  let noTheatre = 0;
  const stats = {};
  const seenShowIds = new Set();
  const processedTheatreIds = new Set();

  db.run('BEGIN TRANSACTION');

  try {
    for (const show of shows) {
      const theatreId = resolveTheatreId(show, theatreLookup);

      if (!theatreId) {
        warn(`No DB theatre found for "${show.theatre_name}" (osm_id: ${show.theatre_osm_id}) - skipping`);
        noTheatre++;
        continue;
      }

      const theatreStableId = theatreLookup.stableById.get(theatreId);
      const normalizedShow = normalizeShow(show);
      const showId = buildShowStableId(normalizedShow, theatreStableId);
      const contentHash = buildShowContentHash(normalizedShow);
      seenShowIds.add(showId);
      processedTheatreIds.add(theatreId);

      const existing = queryOne(
        `SELECT id, show_id, content_hash, removed, status
         FROM performances
         WHERE show_id = ?
            OR ((show_id IS NULL OR show_id = '') AND title = ? AND date_time = ? AND theatre_id = ?)`,
        [showId, normalizedShow.title, normalizedShow.date_time, theatreId]
      );

      const contentChanged = !!existing?.content_hash && existing.content_hash !== contentHash;
      const nextStatus = contentChanged ? 'changed' : 'active';

      if (existing) {
        if (!DRY_RUN) {
          runSql(
            `UPDATE performances
             SET show_id = ?, title = ?, description = ?, genre = ?, date_time = ?,
               theatre_id = ?, ticket_url = ?, image_url = ?, source_event_id = ?,
               source_url = ?, content_hash = ?, status = ?, removed = 0,
               removed_when = NULL, missing_since = NULL, missing_count = 0,
               last_seen_at = ?, changed_at = CASE WHEN ? THEN ? ELSE changed_at END,
               first_seen_at = COALESCE(first_seen_at, ?)
             WHERE id = ?`,
            [
              showId,
              normalizedShow.title,
              normalizedShow.description,
              normalizedShow.genre,
              normalizedShow.date_time,
              theatreId,
              normalizedShow.ticket_url,
              normalizedShow.image_url,
              normalizedShow.source_event_id,
              normalizedShow.source_url,
              contentHash,
              nextStatus,
              now,
              contentChanged ? 1 : 0,
              now,
              now,
              existing.id,
            ]
          );
          updateAttendanceSnapshotsForPerformance(helpers, existing.id, {
            ...normalizedShow,
            show_id: showId,
            theatre_name: show.theatre_name || '',
            theatre_city: show.theatre_city || '',
          });
        }

        updated++;
        if (contentChanged) changed++;
        if (existing.removed) reactivated++;
      } else {
        if (!DRY_RUN) {
          runSql(
            `INSERT INTO performances (
              show_id, title, description, genre, date_time, theatre_id, ticket_url,
              image_url, source_event_id, source_url, content_hash, status, removed,
              first_seen_at, last_seen_at, missing_count
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, 0)`,
            [
              showId,
              normalizedShow.title,
              normalizedShow.description,
              normalizedShow.genre,
              normalizedShow.date_time,
              theatreId,
              normalizedShow.ticket_url,
              normalizedShow.image_url,
              normalizedShow.source_event_id,
              normalizedShow.source_url,
              contentHash,
              now,
              now,
            ]
          );
        }

        inserted++;
      }

      stats[show.theatre_name] = (stats[show.theatre_name] || 0) + 1;
    }

    let markedMissing = 0;
    let markedRemoved = 0;

    if (processedTheatreIds.size > 0) {
      const placeholders = [...processedTheatreIds].map(() => '?').join(', ');
      const candidates = queryAll(
        `SELECT id, show_id, missing_count
         FROM performances
         WHERE theatre_id IN (${placeholders})
           AND COALESCE(removed, 0) = 0
           AND date_time >= datetime('now')`,
        [...processedTheatreIds]
      );

      for (const candidate of candidates) {
        if (candidate.show_id && seenShowIds.has(candidate.show_id)) continue;

        const nextMissingCount = (candidate.missing_count || 0) + 1;
        const shouldRemove = nextMissingCount >= MISSING_THRESHOLD;

        if (!DRY_RUN) {
          runSql(
            `UPDATE performances
             SET missing_count = ?, missing_since = COALESCE(missing_since, ?),
               removed = ?, removed_when = CASE WHEN ? THEN COALESCE(removed_when, ?) ELSE removed_when END,
               status = CASE WHEN ? THEN 'removed' ELSE status END
             WHERE id = ?`,
            [
              nextMissingCount,
              now,
              shouldRemove ? 1 : 0,
              shouldRemove ? 1 : 0,
              now,
              shouldRemove ? 1 : 0,
              candidate.id,
            ]
          );
        }

        markedMissing++;
        if (shouldRemove) markedRemoved++;
      }
    }

    if (DRY_RUN) {
      db.run('ROLLBACK');
    } else {
      db.run('COMMIT');
      persistDb(db);
      log('Database saved');
    }

    console.log('\nShows per theatre:');
    Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => {
        const bar = '#'.repeat(Math.min(count, 20));
        console.log(`  ${name.slice(0, 30).padEnd(30)} ${String(count).padStart(3)}  ${bar}`);
      });

    console.log('\nSummary:');
    console.log(`  Inserted       : ${inserted}`);
    console.log(`  Updated        : ${updated}`);
    console.log(`  Changed        : ${changed}`);
    console.log(`  Reactivated    : ${reactivated}`);
    console.log(`  Missing signals: ${markedMissing}`);
    console.log(`  Soft removed   : ${markedRemoved}`);
    console.log(`  No theatre     : ${noTheatre}`);
    console.log('');
    log(DRY_RUN ? 'Dry run complete - no changes written' : 'Import complete');
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch (_rollbackErr) {
      // Keep the original error as the useful one.
    }
    throw err;
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
