const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const catalogRepository = require('../repositories/catalogRepository');
const socialRepository = require('../repositories/socialRepository');

const router = express.Router();

// POST /api/attendance
router.post('/', authenticateToken, async (req, res) => {
  try {
    const performanceId = req.body.performance_id || req.body.show_id;

    if (!performanceId) {
      return res.status(400).json({ error: 'Voorstelling-ID is vereist.' });
    }

    const performance = await catalogRepository.findPerformanceByPublicId(performanceId);
    if (!performance) {
      return res.status(404).json({ error: 'Voorstelling niet gevonden.' });
    }

    if (performance.removed) {
      return res.status(409).json({ error: 'Deze voorstelling staat niet meer in de agenda.' });
    }

    const existing = await socialRepository.isUserAttendingPerformance(req.user.id, performance);
    if (existing) {
      return res.status(409).json({ error: 'Je bent al aangemeld voor deze voorstelling.' });
    }

    await socialRepository.addAttendance(req.user.id, performance);

    res.status(201).json({ message: `Je gaat naar "${performance.title}"!` });
  } catch (err) {
    console.error('Add attendance error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// DELETE /api/attendance/:performanceId
router.delete('/:performanceId', authenticateToken, async (req, res) => {
  try {
    const performance = await catalogRepository.findPerformanceByPublicId(req.params.performanceId);
    const existing = performance
      ? await socialRepository.isUserAttendingPerformance(req.user.id, performance)
      : false;

    if (!existing) {
      return res.status(404).json({ error: 'Je bent niet aangemeld voor deze voorstelling.' });
    }

    await socialRepository.removeAttendance(req.user.id, req.params.performanceId, performance);

    res.json({ message: 'Aanmelding geannuleerd.' });
  } catch (err) {
    console.error('Remove attendance error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
