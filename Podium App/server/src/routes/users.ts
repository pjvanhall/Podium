const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const catalogRepository = require('../repositories/catalogRepository');
const socialRepository = require('../repositories/socialRepository');

const router = express.Router();

// GET /api/users/search?q=
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Zoekterm moet minimaal 2 tekens bevatten.' });
    }

    const users = await socialRepository.searchUsers(q, req.user.id);

    res.json({ users });
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het zoeken.' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const user = await socialRepository.getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    }

    const [friendCount, upcomingCount] = await Promise.all([
      socialRepository.countFriends(req.params.id),
      catalogRepository.countUpcomingForUser(req.params.id),
    ]);

    res.json({
      user: {
        ...user,
        friendCount,
        upcomingCount
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (parseInt(req.params.id) !== req.user.id) {
      return res.status(403).json({ error: 'Je kunt alleen je eigen profiel bewerken.' });
    }

    const { name, bio, city, avatar } = req.body;
    
    const updatedUser = await socialRepository.updateUser(req.user.id, { name, bio, city, avatar });

    res.json({ message: 'Profiel bijgewerkt!', user: updatedUser });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden bij het bijwerken.' });
  }
});

// GET /api/users/:id/attending
router.get('/:id/attending', async (req, res) => {
  try {
    const performances = await catalogRepository.getUserAttendingPerformances(req.params.id);

    res.json({ performances });
  } catch (err) {
    console.error('User attending error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
