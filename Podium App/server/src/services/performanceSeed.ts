const fs = require('fs');
const path = require('path');
const { getDb, queryAll, saveDb } = require('../db');
const { decodeHtmlEntities } = require('../utils/html');
const { isSplitStoreEnabled } = require('../storage/config');
const {
  buildShowContentHash,
  buildShowStableId,
  extractEventIdFromUrl,
} = require('../utils/stableIds');

function loadJsonFromServerRoot(fileName) {
  const filePath = path.resolve(__dirname, '..', '..', fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildTheatreLookup() {
  const theatreRows = queryAll('SELECT id, stable_id, name FROM theatres');
  const byName = new Map(theatreRows.map((row) => [String(row.name).toLowerCase(), row.id]));
  const stableById = new Map(theatreRows.map((row) => [row.id, row.stable_id]));
  const byOsmId = new Map();

  const theatresMeta = loadJsonFromServerRoot('dutch_theatres.json');
  for (const theatre of theatresMeta) {
    const dbId = byName.get(String(theatre.name).toLowerCase());
    if (dbId && theatre.osm_id !== undefined && theatre.osm_id !== null) {
      byOsmId.set(String(theatre.osm_id), dbId);
    }
  }

  return { byName, byOsmId, stableById, theatreCount: theatreRows.length };
}

function resetPerformancesFromSeed() {
  if (isSplitStoreEnabled()) {
    throw new Error('resetPerformancesFromSeed is SQLite-only. Use scripts/import-shows.js to refresh the NoSQL show catalog.');
  }

  const db = getDb();
  const shows = loadJsonFromServerRoot('theatre_shows.json');
  const { byName, byOsmId, stableById, theatreCount } = buildTheatreLookup();

  if (!theatreCount) {
    throw new Error('No theatres found. Seed theatres before importing performances.');
  }

  let inserted = 0;
  let noTheatre = 0;
  const stats = {};

  try {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM attendance');
    db.run('DELETE FROM performances');

    for (const show of shows) {
      const theatreId =
        byOsmId.get(String(show.theatre_osm_id)) ||
        byName.get(String(show.theatre_name || '').toLowerCase());

      if (!theatreId) {
        noTheatre++;
        continue;
      }

      const normalizedShow = {
        title: decodeHtmlEntities(show.title || ''),
        description: decodeHtmlEntities(show.description || ''),
        genre: decodeHtmlEntities(show.genre || 'Toneel'),
        date_time: show.date_time,
        ticket_url: show.ticket_url || '',
        image_url: show.image_url || '',
        source_url: show.source_url || '',
        source_event_id: show.source_event_id || extractEventIdFromUrl(show.ticket_url) || '',
      };
      const showId = buildShowStableId(normalizedShow, stableById.get(theatreId));
      const contentHash = buildShowContentHash(normalizedShow);

      db.run(
        `INSERT INTO performances (
          show_id, title, description, genre, date_time, theatre_id, ticket_url, image_url,
          source_event_id, source_url, content_hash, status, removed, first_seen_at, last_seen_at
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
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
        ]
      );

      inserted++;
      stats[show.theatre_name] = (stats[show.theatre_name] || 0) + 1;
    }

    db.run('COMMIT');
    saveDb();
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch (_rollbackErr) {
      // Ignore rollback errors; the original import error is more useful.
    }
    throw err;
  }

  return {
    loaded: shows.length,
    inserted,
    noTheatre,
    theatresMatched: Object.keys(stats).length,
  };
}

module.exports = { resetPerformancesFromSeed };
