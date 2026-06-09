const express = require('express');
const { queryAll } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/feed - Get activity feed for current user
router.get('/', authenticateToken, (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get attendance activity from friends
    const feed = queryAll(
      `SELECT 
        a.created_at as activity_date,
        u.id as user_id, u.name as user_name, u.avatar as user_avatar,
        p.id as performance_id, p.title as performance_title, p.date_time as performance_date,
        p.genre as performance_genre,
        t.id as theatre_id, t.name as theatre_name, t.city as theatre_city
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       JOIN performances p ON a.performance_id = p.id
       JOIN theatres t ON p.theatre_id = t.id
       WHERE a.user_id IN (
         SELECT CASE 
           WHEN fr.from_user_id = ? THEN fr.to_user_id
           ELSE fr.from_user_id
         END
         FROM friend_requests fr
         WHERE (fr.from_user_id = ? OR fr.to_user_id = ?)
         AND fr.status = 'accepted'
       )
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, req.user.id, req.user.id, parseInt(limit), offset]
    );

    res.json({ feed });
  } catch (err) {
    console.error('Get feed error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het laden van de feed.' });
  }
});

module.exports = router;
