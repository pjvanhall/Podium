const express = require('express');
const { queryOne, queryAll, runSql } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { decodePerformanceText } = require('../utils/html');

const router = express.Router();

function toPublicPerformance(row) {
  const performance = decodePerformanceText(row);
  if (!performance) return performance;
  performance.removed = !!performance.removed;
  return performance;
}

// GET /api/users/search?q=
router.get('/search', authenticateToken, (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Zoekterm moet minimaal 2 tekens bevatten.' });
    }

    const users = queryAll(
      `SELECT id, name, avatar, city, bio FROM users 
       WHERE (name LIKE ? OR city LIKE ?) AND id != ?
       LIMIT 20`,
      [`%${q}%`, `%${q}%`, req.user.id]
    );

    res.json({ users });
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het zoeken.' });
  }
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  try {
    const user = queryOne(
      'SELECT id, name, avatar, bio, city, created_at FROM users WHERE id = ?',
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    }

    // Count friends
    const friendCount = queryOne(
      `SELECT COUNT(*) as count FROM friend_requests 
       WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'`,
      [req.params.id, req.params.id]
    );

    // Count upcoming performances
    const attendanceCount = queryOne(
      `SELECT COUNT(*) as count FROM attendance a
       JOIN performances p ON a.performance_id = p.id
       WHERE a.user_id = ? AND p.date_time >= datetime('now') AND COALESCE(p.removed, 0) = 0`,
      [req.params.id]
    );

    res.json({
      user: {
        ...user,
        friendCount: friendCount?.count || 0,
        upcomingCount: attendanceCount?.count || 0
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticateToken, (req, res) => {
  try {
    if (parseInt(req.params.id) !== req.user.id) {
      return res.status(403).json({ error: 'Je kunt alleen je eigen profiel bewerken.' });
    }

    const { name, bio, city, avatar } = req.body;
    
    runSql(
      'UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), city = COALESCE(?, city), avatar = COALESCE(?, avatar) WHERE id = ?',
      [name, bio, city, avatar, req.user.id]
    );

    const updatedUser = queryOne(
      'SELECT id, email, name, avatar, bio, city, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({ message: 'Profiel bijgewerkt!', user: updatedUser });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het bijwerken.' });
  }
});

// GET /api/users/:id/attending
router.get('/:id/attending', (req, res) => {
  try {
    const performances = queryAll(
      `SELECT
        COALESCE(NULLIF(p.show_id, ''), NULLIF(a.show_id, ''), CAST(p.id AS TEXT)) as id,
        COALESCE(NULLIF(p.show_id, ''), NULLIF(a.show_id, ''), CAST(p.id AS TEXT)) as performance_id,
        p.id as numeric_id,
        p.show_id,
        COALESCE(p.title, a.title_snapshot) as title,
        COALESCE(p.description, '') as description,
        COALESCE(p.genre, '') as genre,
        COALESCE(p.date_time, a.date_time_snapshot) as date_time,
        COALESCE(NULLIF(t.stable_id, ''), CAST(t.id AS TEXT)) as theatre_id,
        t.id as theatre_numeric_id,
        p.ticket_url,
        p.image_url,
        p.source_event_id,
        p.source_url,
        COALESCE(p.status, 'removed') as status,
        COALESCE(p.removed, 1) as removed,
        p.removed_when,
        p.changed_at,
        p.first_seen_at,
        p.last_seen_at,
        p.missing_since,
        p.missing_count,
        COALESCE(t.name, a.theatre_name_snapshot) as theatre_name,
        COALESCE(t.city, a.theatre_city_snapshot) as theatre_city,
        a.created_at as registered_at
       FROM attendance a
       LEFT JOIN performances p ON a.performance_id = p.id OR (a.show_id IS NOT NULL AND a.show_id = p.show_id)
       LEFT JOIN theatres t ON p.theatre_id = t.id
       WHERE a.user_id = ?
       ORDER BY COALESCE(p.date_time, a.date_time_snapshot) ASC`,
      [req.params.id]
    ).map(toPublicPerformance);

    res.json({ performances });
  } catch (err) {
    console.error('User attending error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
