const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const catalogRepository = require('../repositories/catalogRepository');

const router = express.Router();

// GET /api/feed - Get activity feed for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const feed = await catalogRepository.getFeed(req.user.id, page, limit);
    res.json({ feed });
  } catch (err) {
    console.error('Get feed error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het laden van de feed.' });
  }
});

module.exports = router;
