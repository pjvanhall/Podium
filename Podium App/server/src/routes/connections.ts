const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const socialRepository = require('../repositories/socialRepository');

const router = express.Router();

// POST /api/connections/:userId/request - Send friend request
router.post('/:userId/request', authenticateToken, async (req, res) => {
  try {
    const toUserId = parseInt(req.params.userId);

    if (toUserId === req.user.id) {
      return res.status(400).json({ error: 'Je kunt geen vriendschapsverzoek naar jezelf sturen.' });
    }

    const result = await socialRepository.sendFriendRequest(req.user.id, toUserId);
    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    }
    if (result.error === 'accepted') {
      return res.status(409).json({ error: 'Jullie zijn al vrienden!' });
    }
    if (result.error === 'pending') {
      return res.status(409).json({ error: 'Er staat al een vriendschapsverzoek open.' });
    }

    const statusCode = result.resent ? 200 : 201;
    res.status(statusCode).json({ message: `Vriendschapsverzoek verstuurd naar ${result.targetUser.name}!` });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// PUT /api/connections/:requestId/accept - Accept friend request
router.put('/:requestId/accept', authenticateToken, async (req, res) => {
  try {
    const updated = await socialRepository.updateFriendRequestStatus(req.params.requestId, req.user.id, 'accepted');
    if (!updated) {
      return res.status(404).json({ error: 'Vriendschapsverzoek niet gevonden.' });
    }

    res.json({ message: 'Vriendschapsverzoek geaccepteerd! 🎉' });
  } catch (err) {
    console.error('Accept friend request error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// PUT /api/connections/:requestId/reject - Reject friend request
router.put('/:requestId/reject', authenticateToken, async (req, res) => {
  try {
    const updated = await socialRepository.updateFriendRequestStatus(req.params.requestId, req.user.id, 'rejected');
    if (!updated) {
      return res.status(404).json({ error: 'Vriendschapsverzoek niet gevonden.' });
    }

    res.json({ message: 'Vriendschapsverzoek afgewezen.' });
  } catch (err) {
    console.error('Reject friend request error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// DELETE /api/connections/:userId/unfriend - Remove friend
router.delete('/:userId/unfriend', authenticateToken, async (req, res) => {
  try {
    const toUserId = parseInt(req.params.userId);
    await socialRepository.unfriend(req.user.id, toUserId);

    res.json({ message: 'Vriend verwijderd.' });
  } catch (err) {
    console.error('Unfriend error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/connections/requests - Get pending friend requests for current user
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const { incoming, outgoing } = await socialRepository.getPendingRequests(req.user.id);

    res.json({ incoming, outgoing });
  } catch (err) {
    console.error('Get friend requests error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/connections/:userId/friends - Get user's friends
router.get('/:userId/friends', async (req, res) => {
  try {
    const friends = await socialRepository.getFriends(req.params.userId);

    res.json({ friends });
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/connections/:userId/status - Check friendship status with current user
router.get('/:userId/status', authenticateToken, async (req, res) => {
  try {
    const toUserId = parseInt(req.params.userId);
    const status = await socialRepository.getConnectionStatus(req.user.id, toUserId);
    res.json(status);
  } catch (err) {
    console.error('Get connection status error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
