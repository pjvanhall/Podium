const express = require('express');
const catalogRepository = require('../repositories/catalogRepository');

const router = express.Router();

// GET /api/theatres
router.get('/', async (req, res) => {
  try {
    const theatres = await catalogRepository.listTheatres(req.query);
    res.json({ theatres });
  } catch (err) {
    console.error('Get theatres error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/theatres/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await catalogRepository.getTheatreWithPerformances(req.params.id, req.query);

    if (!result) {
      return res.status(404).json({ error: 'Theater niet gevonden.' });
    }

    res.json(result);
  } catch (err) {
    console.error('Get theatre error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
