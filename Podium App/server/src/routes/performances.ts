const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const catalogRepository = require('../repositories/catalogRepository');

const router = express.Router();

// GET /api/performances
router.get('/', optionalAuth, async (req, res) => {
  try {
    const result = await catalogRepository.listPerformances(req.query, req.user?.id || null);
    res.json(result);
  } catch (err) {
    console.error('Get performances error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/performances/genres
router.get('/genres', async (req, res) => {
  try {
    const genres = await catalogRepository.getGenres();
    res.json({ genres });
  } catch (err) {
    console.error('Get genres error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/performances/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await catalogRepository.getPerformanceWithAttendees(req.params.id, req.user?.id || null);

    if (!result) {
      return res.status(404).json({ error: 'Voorstelling niet gevonden.' });
    }

    res.json(result);
  } catch (err) {
    console.error('Get performance error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
