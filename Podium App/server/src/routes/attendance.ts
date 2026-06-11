const express = require('express');
const { queryOne, runSql } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function isIntegerLike(value) {
  return /^\d+$/.test(String(value || ''));
}

function findPerformanceByPublicId(value) {
  if (isIntegerLike(value)) {
    return queryOne(
      `SELECT p.id, p.show_id, p.title, p.date_time, p.removed,
        t.name as theatre_name, t.city as theatre_city
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       WHERE p.show_id = ? OR p.id = ?`,
      [String(value), parseInt(value, 10)]
    );
  }

  return queryOne(
    `SELECT p.id, p.show_id, p.title, p.date_time, p.removed,
      t.name as theatre_name, t.city as theatre_city
     FROM performances p
     JOIN theatres t ON p.theatre_id = t.id
     WHERE p.show_id = ?`,
    [String(value)]
  );
}

// POST /api/attendance
router.post('/', authenticateToken, (req, res) => {
  try {
    const performance_id = req.body.performance_id || req.body.show_id;

    if (!performance_id) {
      return res.status(400).json({ error: 'Voorstelling-ID is vereist.' });
    }

    // Check performance exists
    const performance = findPerformanceByPublicId(performance_id);
    if (!performance) {
      return res.status(404).json({ error: 'Voorstelling niet gevonden.' });
    }

    if (performance.removed) {
      return res.status(409).json({ error: 'Deze voorstelling staat niet meer in de agenda.' });
    }

    // Check if already attending
    const existing = queryOne(
      'SELECT id FROM attendance WHERE user_id = ? AND (performance_id = ? OR (show_id IS NOT NULL AND show_id = ?))',
      [req.user.id, performance.id, performance.show_id]
    );

    if (existing) {
      return res.status(409).json({ error: 'Je bent al aangemeld voor deze voorstelling.' });
    }

    runSql(
      `INSERT INTO attendance (
        user_id, performance_id, show_id, title_snapshot, date_time_snapshot,
        theatre_name_snapshot, theatre_city_snapshot
      )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        performance.id,
        performance.show_id,
        performance.title,
        performance.date_time,
        performance.theatre_name,
        performance.theatre_city,
      ]
    );

    res.status(201).json({ message: `Je gaat naar "${performance.title}"! 🎭` });
  } catch (err) {
    console.error('Add attendance error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// DELETE /api/attendance/:performanceId
router.delete('/:performanceId', authenticateToken, (req, res) => {
  try {
    const performance = findPerformanceByPublicId(req.params.performanceId);
    const numericId = performance?.id || (isIntegerLike(req.params.performanceId) ? parseInt(req.params.performanceId, 10) : -1);
    const showId = performance?.show_id || String(req.params.performanceId);

    const existing = queryOne(
      'SELECT id FROM attendance WHERE user_id = ? AND (performance_id = ? OR (show_id IS NOT NULL AND show_id = ?))',
      [req.user.id, numericId, showId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Je bent niet aangemeld voor deze voorstelling.' });
    }

    runSql(
      'DELETE FROM attendance WHERE user_id = ? AND (performance_id = ? OR (show_id IS NOT NULL AND show_id = ?))',
      [req.user.id, numericId, showId]
    );

    res.json({ message: 'Aanmelding geannuleerd.' });
  } catch (err) {
    console.error('Remove attendance error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
