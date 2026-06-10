const express = require('express');
const { queryOne, queryAll } = require('../db');
const { decodePerformanceText } = require('../utils/html');

const router = express.Router();

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '24', 10) || 24));
  return { page, limit, offset: (page - 1) * limit };
}

// GET /api/theatres
router.get('/', (req, res) => {
  try {
    const { city, province, q } = req.query;
    let sql = 'SELECT * FROM theatres WHERE 1=1';
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
    const theatre = queryOne('SELECT * FROM theatres WHERE id = ?', [req.params.id]);

    if (!theatre) {
      return res.status(404).json({ error: 'Theater niet gevonden.' });
    }

    const { page, limit, offset } = parsePagination(req.query);

    // Get upcoming performances
    const totalRow = queryOne(
      `SELECT COUNT(*) as total
       FROM performances p
       WHERE p.theatre_id = ? AND p.date_time >= datetime('now')`,
      [req.params.id]
    );
    const total = totalRow?.total || 0;

    const performances = queryAll(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM attendance a WHERE a.performance_id = p.id) as attendee_count
       FROM performances p 
       WHERE p.theatre_id = ? AND p.date_time >= datetime('now')
       ORDER BY p.date_time ASC
       LIMIT ? OFFSET ?`,
      [req.params.id, limit, offset]
    ).map(decodePerformanceText);

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
