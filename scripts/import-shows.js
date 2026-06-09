#!/usr/bin/env node
/**
 * import-shows.js
 *
 * Reads theatre_shows.json and inserts the shows into podium.db as
 * Performance rows, matching theatres by osm_id (preferred) or name.
 * Duplicate shows (same title + date_time + theatre_id) are skipped.
 *
 * Usage:
 *   node scripts/import-shows.js
 *   node scripts/import-shows.js --dry-run   # preview without writing
 *   node scripts/import-shows.js --clear     # remove all existing seeded
 *                                             # performances first
 *
 * No extra npm packages required — uses Node.js built-ins + sql.js which
 * is already a server dependency.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CLEAR   = args.includes('--clear');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SHOWS_FILE = path.resolve(__dirname, '..', 'Podium App', 'server', 'theatre_shows.json');
const DB_FILE    = path.resolve(__dirname, '..', 'Podium App', 'server', 'podium.db');
const SQL_JS_DIR = path.resolve(__dirname, '..', 'Podium App', 'server', 'node_modules', 'sql.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg)  { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString()}] ⚠️  ${msg}`); }

// ---------------------------------------------------------------------------
// Database bootstrap (mirrors server/src/db.ts logic but in plain JS)
// ---------------------------------------------------------------------------

function openDb() {
  const initSqlJs = require(path.join(SQL_JS_DIR, 'dist', 'sql-asm.js'));
  const dbBuffer  = fs.readFileSync(DB_FILE);

  // initSqlJs is async in the browser build; handle both sync and async forms
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🎭  Podium Show Importer');
  console.log('─'.repeat(60));
  if (DRY_RUN) log('DRY-RUN mode — no changes will be written\n');

  // 1. Load shows
  if (!fs.existsSync(SHOWS_FILE)) {
    console.error(`\n❌ ${SHOWS_FILE} not found. Run npm run scrape-shows first.`);
    process.exit(1);
  }
  const shows = JSON.parse(fs.readFileSync(SHOWS_FILE, 'utf8'));
  log(`📂 Loaded ${shows.length} shows from theatre_shows.json`);

  // 2. Open DB
  log('📂 Opening podium.db…');
  const { db } = await openDb();

  // Helper wrappers
  const queryAll = (sql, params = []) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  };
  const queryOne = (sql, params = []) => queryAll(sql, params)[0] || null;
  const runSql   = (sql, params = []) => {
    db.run(sql, params);
    return queryOne('SELECT last_insert_rowid() as id')?.id ?? null;
  };

  // 3. Build theatre lookup map (osm_id → db id, and name → db id)
  const theatreRows = queryAll('SELECT id, name, city FROM theatres');
  const byName = new Map(theatreRows.map(r => [r.name.toLowerCase(), r.id]));

  // Build osm_id → db_id map from dutch_theatres.json cross-referenced with DB
  const THEATRES_FILE = path.resolve(__dirname, '..', 'Podium App', 'server', 'dutch_theatres.json');
  const theatresMeta  = JSON.parse(fs.readFileSync(THEATRES_FILE, 'utf8'));
  const byOsmId = new Map();
  for (const t of theatresMeta) {
    const dbRow = byName.get(t.name.toLowerCase());
    if (dbRow) byOsmId.set(t.osm_id, dbRow);
  }

  log(`🗺️  Theatre lookup: ${byOsmId.size} by OSM-ID, ${byName.size} by name`);

  // 4. Optionally clear seeded performances
  if (CLEAR && !DRY_RUN) {
    warn('--clear: removing all existing performances from database');
    db.run('DELETE FROM attendance');
    db.run('DELETE FROM performances');
    log('🗑️  Cleared performances + attendance tables');
  }

  // 5. Import loop
  let inserted = 0;
  let skipped  = 0;
  let noTheatre = 0;
  const stats = {};  // theatre_name → count

  for (const show of shows) {
    // Resolve theatre_id
    const theatreId = byOsmId.get(show.theatre_osm_id)
                   ?? byName.get(show.theatre_name?.toLowerCase());

    if (!theatreId) {
      warn(`No DB theatre found for "${show.theatre_name}" (osm_id: ${show.theatre_osm_id}) — skipping`);
      noTheatre++;
      continue;
    }

    // Check for duplicate (title + date_time + theatre_id)
    const existing = queryOne(
      'SELECT id FROM performances WHERE title = ? AND date_time = ? AND theatre_id = ?',
      [show.title, show.date_time, theatreId]
    );
    if (existing) { skipped++; continue; }

    if (!DRY_RUN) {
      runSql(
        `INSERT INTO performances (title, description, genre, date_time, theatre_id, ticket_url, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          show.title,
          show.description || '',
          show.genre || 'Toneel',
          show.date_time,
          theatreId,
          show.ticket_url || '',
          show.image_url  || '',
        ]
      );
    }

    inserted++;
    stats[show.theatre_name] = (stats[show.theatre_name] || 0) + 1;
  }

  // 6. Persist
  if (!DRY_RUN) {
    persistDb(db);
    log('💾 Database saved');
  }

  // 7. Summary
  console.log('\n  Shows per theatre:');
  Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      const bar = '█'.repeat(Math.min(count, 20));
      console.log(`    ${name.slice(0, 30).padEnd(30)} ${String(count).padStart(3)}  ${bar}`);
    });

  console.log('\n  Summary:');
  console.log(`    ✅ Inserted   : ${inserted}`);
  console.log(`    ⏭️  Skipped    : ${skipped} (already in DB)`);
  console.log(`    ❓ No theatre : ${noTheatre}`);
  console.log('');
  log(DRY_RUN ? '✅ Dry run complete — no changes written' : '✅ Import complete!\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
