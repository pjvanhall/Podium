const express = require('express');
const { queryOne, queryAll, runSql } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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
       WHERE a.user_id = ? AND p.date_time >= datetime('now')`,
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
      `SELECT p.*, t.name as theatre_name, t.city as theatre_city, a.created_at as registered_at
       FROM attendance a
       JOIN performances p ON a.performance_id = p.id
       JOIN theatres t ON p.theatre_id = t.id
       WHERE a.user_id = ?
       ORDER BY p.date_time ASC`,
      [req.params.id]
    );

    res.json({ performances });
  } catch (err) {
    console.error('User attending error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
