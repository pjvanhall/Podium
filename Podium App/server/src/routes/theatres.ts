const express = require('express');
const { queryOne, queryAll } = require('../db');
const { decodePerformanceText } = require('../utils/html');

const router = express.Router();

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '24', 10) || 24));
  return { page, limit, offset: (page - 1) * limit };
}

function isIntegerLike(value) {
  return /^\d+$/.test(String(value || ''));
}

function publicTheatreSelect() {
  return `
    COALESCE(NULLIF(stable_id, ''), CAST(id AS TEXT)) as id,
    id as numeric_id,
    stable_id,
    osm_id,
    name,
    city,
    address,
    province,
    image_url,
    website,
    description,
    latitude,
    longitude
  `;
}

function publicPerformanceSelect(extraColumns = '') {
  return `
    COALESCE(NULLIF(p.show_id, ''), CAST(p.id AS TEXT)) as id,
    p.id as numeric_id,
    p.show_id,
    p.title,
    p.description,
    p.genre,
    p.date_time,
    COALESCE(NULLIF(t.stable_id, ''), CAST(t.id AS TEXT)) as theatre_id,
    t.id as theatre_numeric_id,
    p.ticket_url,
    p.image_url,
    p.source_event_id,
    p.source_url,
    p.status,
    p.removed,
    p.removed_when,
    p.changed_at,
    p.first_seen_at,
    p.last_seen_at,
    p.missing_since,
    p.missing_count,
    t.name as theatre_name,
    t.city as theatre_city
    ${extraColumns}
  `;
}

function toPublicPerformance(row) {
  const performance = decodePerformanceText(row);
  if (!performance) return performance;
  performance.removed = !!performance.removed;
  return performance;
}

function theatreIdentityWhere(value) {
  if (isIntegerLike(value)) {
    return { sql: '(stable_id = ? OR id = ?)', params: [String(value), parseInt(value, 10)] };
  }

  return { sql: 'stable_id = ?', params: [String(value)] };
}

// GET /api/theatres
router.get('/', (req, res) => {
  try {
    const { city, province, q } = req.query;
    let sql = `SELECT ${publicTheatreSelect()} FROM theatres WHERE 1=1`;
    const params = [];

    if (city) {
      sql += ' AND city LIKE ?';
      params.push(`%${city}%`);
    }
    if (province) {
      sql += ' AND province = ?';
      params.push(province);
    }
    if (q) {
      sql += ' AND (name LIKE ? OR city LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    sql += ' ORDER BY name ASC';

    const theatres = queryAll(sql, params);
    res.json({ theatres });
  } catch (err) {
    console.error('Get theatres error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/theatres/:id
router.get('/:id', (req, res) => {
  try {
    const identity = theatreIdentityWhere(req.params.id);
    const theatre = queryOne(
      `SELECT ${publicTheatreSelect()} FROM theatres WHERE ${identity.sql}`,
      identity.params
    );

    if (!theatre) {
      return res.status(404).json({ error: 'Theater niet gevonden.' });
    }

    const { page, limit, offset } = parsePagination(req.query);

    // Get upcoming performances
    const totalRow = queryOne(
      `SELECT COUNT(*) as total
       FROM performances p
       WHERE p.theatre_id = ? AND p.date_time >= datetime('now') AND COALESCE(p.removed, 0) = 0`,
      [theatre.numeric_id]
    );
    const total = totalRow?.total || 0;

    const performances = queryAll(
      `SELECT ${publicPerformanceSelect(`,
        (SELECT COUNT(*) FROM attendance a WHERE a.performance_id = p.id OR (a.show_id IS NOT NULL AND a.show_id = p.show_id)) as attendee_count
      `)}
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       WHERE p.theatre_id = ? AND p.date_time >= datetime('now') AND COALESCE(p.removed, 0) = 0
       ORDER BY p.date_time ASC
       LIMIT ? OFFSET ?`,
      [theatre.numeric_id, limit, offset]
    ).map(toPublicPerformance);

    res.json({
      theatre,
      performances,
      performancePagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Get theatre error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
