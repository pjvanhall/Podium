const express = require('express');
const { queryOne, queryAll } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { decodePerformanceText } = require('../utils/html');

const router = express.Router();

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

// GET /api/performances
router.get('/', optionalAuth, (req, res) => {
  try {
    const { theatre_id, genre, date_from, date_to, q, city, province } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    let whereSql = 'WHERE 1=1';
    const params = [];

    if (theatre_id) {
      whereSql += ' AND p.theatre_id = ?';
      params.push(parseInt(theatre_id));
    }
    if (genre) {
      whereSql += ' AND p.genre = ?';
      params.push(genre);
    }
    if (city) {
      whereSql += ' AND t.city = ?';
      params.push(city);
    }
    if (province) {
      whereSql += ' AND t.province = ?';
      params.push(province);
    }
    if (date_from) {
      whereSql += ' AND p.date_time >= ?';
      params.push(date_from);
    }
    if (date_to) {
      whereSql += ' AND p.date_time <= ?';
      params.push(date_to);
    }
    if (q) {
      whereSql += ' AND (p.title LIKE ? OR p.description LIKE ? OR t.name LIKE ? OR t.city LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    // Default: only future performances
    if (!date_from) {
      whereSql += " AND p.date_time >= datetime('now')";
    }

    const totalRow = queryOne(
      `SELECT COUNT(*) as total
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       ${whereSql}`,
      params
    );
    const total = totalRow?.total || 0;

    const sql = `
      SELECT p.*, t.name as theatre_name, t.city as theatre_city,
        (SELECT COUNT(*) FROM attendance a WHERE a.performance_id = p.id) as attendee_count
      FROM performances p
      JOIN theatres t ON p.theatre_id = t.id
      ${whereSql}
      ORDER BY p.date_time ASC
      LIMIT ? OFFSET ?
    `;

    const performances = queryAll(sql, [...params, limit, offset]).map(decodePerformanceText);

    // If user is logged in, mark which ones they're attending
    if (req.user) {
      const userAttendance = queryAll(
        'SELECT performance_id FROM attendance WHERE user_id = ?',
        [req.user.id]
      );
      const attendingIds = new Set(userAttendance.map(a => a.performance_id));
      performances.forEach(p => {
        p.is_attending = attendingIds.has(p.id);
      });
    }

    res.json({
      performances,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Get performances error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/performances/genres
router.get('/genres', (req, res) => {
  try {
    const genres = queryAll(
      "SELECT DISTINCT genre FROM performances WHERE genre != '' ORDER BY genre ASC"
    );
    res.json({ genres: genres.map(g => g.genre) });
  } catch (err) {
    console.error('Get genres error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/performances/:id
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const performance = decodePerformanceText(queryOne(
      `SELECT p.*, t.name as theatre_name, t.city as theatre_city, t.address as theatre_address,
        (SELECT COUNT(*) FROM attendance a WHERE a.performance_id = p.id) as attendee_count
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       WHERE p.id = ?`,
      [req.params.id]
    ));

    if (!performance) {
      return res.status(404).json({ error: 'Voorstelling niet gevonden.' });
    }

    // Get attendees
    const attendees = queryAll(
      `SELECT u.id, u.name, u.avatar, u.city
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.performance_id = ?
       ORDER BY a.created_at DESC`,
      [req.params.id]
    );

    // Check if current user is attending
    if (req.user) {
      const userAttending = queryOne(
        'SELECT id FROM attendance WHERE user_id = ? AND performance_id = ?',
        [req.user.id, req.params.id]
      );
      performance.is_attending = !!userAttending;
    }

    res.json({ performance, attendees });
  } catch (err) {
    console.error('Get performance error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
