const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const {
  buildShowContentHash,
  buildShowStableId,
  buildTheatreStableId,
  extractEventIdFromUrl,
} = require('./utils/stableIds');
const { isSplitStoreEnabled } = require('./storage/config');
const { initSplitStore } = require('./storage/splitDb');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'podium.db');

let db = null;

async function initDb() {
  if (isSplitStoreEnabled()) {
    await initSplitStore();
    return null;
  }

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      city TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS theatres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stable_id TEXT,
      osm_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      province TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      website TEXT DEFAULT '',
      description TEXT DEFAULT '',
      latitude REAL,
      longitude REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS performances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id TEXT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      genre TEXT DEFAULT '',
      date_time DATETIME NOT NULL,
      theatre_id INTEGER NOT NULL,
      ticket_url TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      source_event_id TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      content_hash TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      removed INTEGER DEFAULT 0,
      removed_when DATETIME,
      changed_at DATETIME,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME,
      missing_since DATETIME,
      missing_count INTEGER DEFAULT 0,
      FOREIGN KEY (theatre_id) REFERENCES theatres(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      performance_id INTEGER NOT NULL,
      show_id TEXT,
      title_snapshot TEXT DEFAULT '',
      date_time_snapshot DATETIME,
      theatre_name_snapshot TEXT DEFAULT '',
      theatre_city_snapshot TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (performance_id) REFERENCES performances(id) ON DELETE CASCADE,
      UNIQUE(user_id, performance_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(from_user_id, to_user_id)
    )
  `);

  runMigrations();

  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_performances_theatre ON performances(theatre_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_performances_datetime ON performances(date_time)');
  db.run('CREATE INDEX IF NOT EXISTS idx_theatres_stable_id ON theatres(stable_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_theatres_osm_id ON theatres(osm_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_performances_show_id ON performances(show_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_performances_removed ON performances(removed)');
  db.run('CREATE INDEX IF NOT EXISTS idx_performances_status ON performances(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_attendance_performance ON attendance(performance_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_attendance_show ON attendance(show_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id)');

  saveDb();
  return db;
}

function tableHasColumn(tableName, columnName) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

function addColumnIfMissing(tableName, columnName, definition) {
  if (!tableHasColumn(tableName, columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function loadTheatreMetaByNameCity() {
  const theatresFile = path.resolve(__dirname, '..', 'dutch_theatres.json');
  if (!fs.existsSync(theatresFile)) return new Map();

  const theatres = JSON.parse(fs.readFileSync(theatresFile, 'utf8'));
  const lookup = new Map();
  for (const theatre of theatres) {
    const key = `${String(theatre.name || '').toLowerCase()}|${String(theatre.city || '').toLowerCase()}`;
    lookup.set(key, theatre);
  }
  return lookup;
}

function populateTheatreStableIds() {
  const metaByNameCity = loadTheatreMetaByNameCity();
  const theatres = queryAll('SELECT id, name, city, stable_id, osm_id FROM theatres');

  for (const theatre of theatres) {
    const key = `${String(theatre.name || '').toLowerCase()}|${String(theatre.city || '').toLowerCase()}`;
    const meta = metaByNameCity.get(key) || {};
    const stableId = theatre.stable_id || buildTheatreStableId(theatre);
    const osmId = theatre.osm_id || (meta.osm_id !== undefined && meta.osm_id !== null ? String(meta.osm_id) : '');

    if (stableId !== theatre.stable_id || osmId !== theatre.osm_id) {
      db.run(
        'UPDATE theatres SET stable_id = ?, osm_id = ? WHERE id = ?',
        [stableId, osmId, theatre.id]
      );
    }
  }
}

function populatePerformanceStableIds() {
  const performances = queryAll(
    `SELECT p.id, p.show_id, p.title, p.description, p.genre, p.date_time, p.ticket_url, p.image_url,
      p.source_event_id, p.source_url, p.content_hash, t.stable_id as theatre_stable_id
     FROM performances p
     JOIN theatres t ON p.theatre_id = t.id`
  );

  const seenShowIds = new Set(
    performances
      .map((performance) => performance.show_id)
      .filter((showId) => showId)
  );

  for (const performance of performances) {
    const sourceEventId = performance.source_event_id || extractEventIdFromUrl(performance.ticket_url) || '';
    const showForHash = {
      ...performance,
      source_event_id: sourceEventId,
    };
    let showId = performance.show_id || buildShowStableId(showForHash, performance.theatre_stable_id);

    if (!performance.show_id && seenShowIds.has(showId)) {
      showId = buildShowStableId(
        { ...showForHash, source_event_id: `${sourceEventId || 'legacy'}:${performance.id}` },
        performance.theatre_stable_id
      );
    }
    seenShowIds.add(showId);

    const contentHash = performance.content_hash || buildShowContentHash(showForHash);

    if (
      showId !== performance.show_id ||
      sourceEventId !== performance.source_event_id ||
      contentHash !== performance.content_hash
    ) {
      db.run(
        `UPDATE performances
         SET show_id = ?, source_event_id = ?, content_hash = ?, first_seen_at = COALESCE(first_seen_at, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [showId, sourceEventId, contentHash, performance.id]
      );
    }
  }
}

function populateAttendanceSnapshots() {
  const rows = queryAll(
    `SELECT a.id, a.show_id, a.title_snapshot, a.date_time_snapshot,
      a.theatre_name_snapshot, a.theatre_city_snapshot,
      p.show_id as performance_show_id, p.title, p.date_time,
      t.name as theatre_name, t.city as theatre_city
     FROM attendance a
     JOIN performances p ON a.performance_id = p.id
     JOIN theatres t ON p.theatre_id = t.id`
  );

  for (const row of rows) {
    const showId = row.show_id || row.performance_show_id || '';
    const titleSnapshot = row.title_snapshot || row.title || '';
    const dateTimeSnapshot = row.date_time_snapshot || row.date_time || null;
    const theatreNameSnapshot = row.theatre_name_snapshot || row.theatre_name || '';
    const theatreCitySnapshot = row.theatre_city_snapshot || row.theatre_city || '';

    if (
      showId !== row.show_id ||
      titleSnapshot !== row.title_snapshot ||
      dateTimeSnapshot !== row.date_time_snapshot ||
      theatreNameSnapshot !== row.theatre_name_snapshot ||
      theatreCitySnapshot !== row.theatre_city_snapshot
    ) {
      db.run(
        `UPDATE attendance
         SET show_id = ?, title_snapshot = ?, date_time_snapshot = ?,
           theatre_name_snapshot = ?, theatre_city_snapshot = ?
         WHERE id = ?`,
        [showId, titleSnapshot, dateTimeSnapshot, theatreNameSnapshot, theatreCitySnapshot, row.id]
      );
    }
  }
}

function runMigrations() {
  addColumnIfMissing('theatres', 'stable_id', 'TEXT');
  addColumnIfMissing('theatres', 'osm_id', "TEXT DEFAULT ''");

  addColumnIfMissing('performances', 'show_id', 'TEXT');
  addColumnIfMissing('performances', 'source_event_id', "TEXT DEFAULT ''");
  addColumnIfMissing('performances', 'source_url', "TEXT DEFAULT ''");
  addColumnIfMissing('performances', 'content_hash', "TEXT DEFAULT ''");
  addColumnIfMissing('performances', 'status', "TEXT DEFAULT 'active'");
  addColumnIfMissing('performances', 'removed', 'INTEGER DEFAULT 0');
  addColumnIfMissing('performances', 'removed_when', 'DATETIME');
  addColumnIfMissing('performances', 'changed_at', 'DATETIME');
  addColumnIfMissing('performances', 'first_seen_at', 'DATETIME');
  addColumnIfMissing('performances', 'last_seen_at', 'DATETIME');
  addColumnIfMissing('performances', 'missing_since', 'DATETIME');
  addColumnIfMissing('performances', 'missing_count', 'INTEGER DEFAULT 0');

  addColumnIfMissing('attendance', 'show_id', 'TEXT');
  addColumnIfMissing('attendance', 'title_snapshot', "TEXT DEFAULT ''");
  addColumnIfMissing('attendance', 'date_time_snapshot', 'DATETIME');
  addColumnIfMissing('attendance', 'theatre_name_snapshot', "TEXT DEFAULT ''");
  addColumnIfMissing('attendance', 'theatre_city_snapshot', "TEXT DEFAULT ''");

  populateTheatreStableIds();
  populatePerformanceStableIds();
  populateAttendanceSnapshots();
}

function saveDb() {
  if (isSplitStoreEnabled()) return;

  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  if (isSplitStoreEnabled()) {
    throw new Error('SQLite database is disabled while DATA_BACKEND=split.');
  }

  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// Helper to run a query and return all rows as objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to run a query and return the first row as an object
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper to run an insert/update/delete and return last insert id
function runSql(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  stmt.step();
  stmt.free();
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDb();
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0];
  }
  return null;
}

module.exports = { initDb, getDb, saveDb, queryAll, queryOne, runSql };
