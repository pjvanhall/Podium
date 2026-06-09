const express = require('express');
const { queryOne, runSql } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/attendance
router.post('/', authenticateToken, (req, res) => {
  try {
    const { performance_id } = req.body;

    if (!performance_id) {
      return res.status(400).json({ error: 'Voorstelling-ID is vereist.' });
    }

    // Check performance exists
    const performance = queryOne('SELECT id, title FROM performances WHERE id = ?', [performance_id]);
    if (!performance) {
      return res.status(404).json({ error: 'Voorstelling niet gevonden.' });
    }

    // Check if already attending
    const existing = queryOne(
      'SELECT id FROM attendance WHERE user_id = ? AND performance_id = ?',
      [req.user.id, performance_id]
    );

    if (existing) {
      return res.status(409).json({ error: 'Je bent al aangemeld voor deze voorstelling.' });
    }

    runSql(
      'INSERT INTO attendance (user_id, performance_id) VALUES (?, ?)',
      [req.user.id, performance_id]
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
    const existing = queryOne(
      'SELECT id FROM attendance WHERE user_id = ? AND performance_id = ?',
      [req.user.id, req.params.performanceId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Je bent niet aangemeld voor deze voorstelling.' });
    }

    runSql(
      'DELETE FROM attendance WHERE user_id = ? AND performance_id = ?',
      [req.user.id, req.params.performanceId]
    );

    res.json({ message: 'Aanmelding geannuleerd.' });
  } catch (err) {
    console.error('Remove attendance error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
