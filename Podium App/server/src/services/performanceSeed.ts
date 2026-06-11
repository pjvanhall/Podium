const fs = require('fs');
const path = require('path');
const { getDb, queryAll, saveDb } = require('../db');
const { decodeHtmlEntities } = require('../utils/html');

function loadJsonFromServerRoot(fileName) {
  const filePath = path.resolve(__dirname, '..', '..', fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildTheatreLookup() {
  const theatreRows = queryAll('SELECT id, name FROM theatres');
  const byName = new Map(theatreRows.map((row) => [String(row.name).toLowerCase(), row.id]));
  const byOsmId = new Map();

  const theatresMeta = loadJsonFromServerRoot('dutch_theatres.json');
  for (const theatre of theatresMeta) {
    const dbId = byName.get(String(theatre.name).toLowerCase());
    if (dbId && theatre.osm_id !== undefined && theatre.osm_id !== null) {
      byOsmId.set(String(theatre.osm_id), dbId);
    }
  }

  return { byName, byOsmId, theatreCount: theatreRows.length };
}

function resetPerformancesFromSeed() {
  const db = getDb();
  const shows = loadJsonFromServerRoot('theatre_shows.json');
  const { byName, byOsmId, theatreCount } = buildTheatreLookup();

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

      db.run(
        `INSERT INTO performances (title, description, genre, date_time, theatre_id, ticket_url, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          decodeHtmlEntities(show.title || ''),
          decodeHtmlEntities(show.description || ''),
          decodeHtmlEntities(show.genre || 'Toneel'),
          show.date_time,
          theatreId,
          show.ticket_url || '',
          show.image_url || '',
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
