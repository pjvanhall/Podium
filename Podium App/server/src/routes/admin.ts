const express = require('express');
const { resetPerformancesFromSeed } = require('../services/performanceSeed');

const router = express.Router();

function getAdminToken(req) {
  const explicitHeader = req.headers['x-admin-task-token'];
  if (Array.isArray(explicitHeader)) return explicitHeader[0];
  if (explicitHeader) return explicitHeader;

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  return '';
}

function requireAdminTaskToken(req, res, next) {
  const expectedToken = process.env.ADMIN_TASK_TOKEN;

  if (!expectedToken) {
    return res.status(404).json({ error: 'Niet gevonden.' });
  }

  if (getAdminToken(req) !== expectedToken) {
    return res.status(403).json({ error: 'Toegang geweigerd.' });
  }

  next();
}

router.post('/reset-performances', requireAdminTaskToken, (req, res) => {
  try {
    const result = resetPerformancesFromSeed();
    res.json({
      message: 'Voorstellingen zijn opnieuw geladen.',
      ...result,
    });
  } catch (err) {
    console.error('Reset performances error:', err);
    res.status(500).json({ error: 'Voorstellingen konden niet opnieuw worden geladen.' });
  }
});

module.exports = router;
