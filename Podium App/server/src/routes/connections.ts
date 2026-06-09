const express = require('express');
const { queryOne, queryAll, runSql } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/connections/:userId/request - Send friend request
router.post('/:userId/request', authenticateToken, (req, res) => {
  try {
    const toUserId = parseInt(req.params.userId);

    if (toUserId === req.user.id) {
      return res.status(400).json({ error: 'Je kunt geen vriendschapsverzoek naar jezelf sturen.' });
    }

    // Check target user exists
    const targetUser = queryOne('SELECT id, name FROM users WHERE id = ?', [toUserId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    }

    // Check if request already exists (in either direction)
    const existing = queryOne(
      `SELECT id, status FROM friend_requests 
       WHERE (from_user_id = ? AND to_user_id = ?) 
       OR (from_user_id = ? AND to_user_id = ?)`,
      [req.user.id, toUserId, toUserId, req.user.id]
    );

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(409).json({ error: 'Jullie zijn al vrienden!' });
      }
      if (existing.status === 'pending') {
        return res.status(409).json({ error: 'Er staat al een vriendschapsverzoek open.' });
      }
      // If rejected, allow resending
      runSql(
        "UPDATE friend_requests SET status = 'pending', from_user_id = ?, to_user_id = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
        [req.user.id, toUserId, existing.id]
      );
      return res.json({ message: `Vriendschapsverzoek verstuurd naar ${targetUser.name}!` });
    }

    runSql(
      'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)',
      [req.user.id, toUserId]
    );

    res.status(201).json({ message: `Vriendschapsverzoek verstuurd naar ${targetUser.name}!` });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// PUT /api/connections/:requestId/accept - Accept friend request
router.put('/:requestId/accept', authenticateToken, (req, res) => {
  try {
    const request = queryOne(
      "SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'",
      [req.params.requestId, req.user.id]
    );

    if (!request) {
      return res.status(404).json({ error: 'Vriendschapsverzoek niet gevonden.' });
    }

    runSql(
      "UPDATE friend_requests SET status = 'accepted' WHERE id = ?",
      [req.params.requestId]
    );

    res.json({ message: 'Vriendschapsverzoek geaccepteerd! 🎉' });
  } catch (err) {
    console.error('Accept friend request error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// PUT /api/connections/:requestId/reject - Reject friend request
router.put('/:requestId/reject', authenticateToken, (req, res) => {
  try {
    const request = queryOne(
      "SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'",
      [req.params.requestId, req.user.id]
    );

    if (!request) {
      return res.status(404).json({ error: 'Vriendschapsverzoek niet gevonden.' });
    }

    runSql(
      "UPDATE friend_requests SET status = 'rejected' WHERE id = ?",
      [req.params.requestId]
    );

    res.json({ message: 'Vriendschapsverzoek afgewezen.' });
  } catch (err) {
    console.error('Reject friend request error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// DELETE /api/connections/:userId/unfriend - Remove friend
router.delete('/:userId/unfriend', authenticateToken, (req, res) => {
  try {
    const toUserId = parseInt(req.params.userId);

    runSql(
      `DELETE FROM friend_requests 
       WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
       AND status = 'accepted'`,
      [req.user.id, toUserId, toUserId, req.user.id]
    );

    res.json({ message: 'Vriend verwijderd.' });
  } catch (err) {
    console.error('Unfriend error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/connections/requests - Get pending friend requests for current user
router.get('/requests', authenticateToken, (req, res) => {
  try {
    const incoming = queryAll(
      `SELECT fr.id as request_id, fr.created_at, u.id, u.name, u.avatar, u.city
       FROM friend_requests fr
       JOIN users u ON fr.from_user_id = u.id
       WHERE fr.to_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [req.user.id]
    );

    const outgoing = queryAll(
      `SELECT fr.id as request_id, fr.created_at, u.id, u.name, u.avatar, u.city
       FROM friend_requests fr
       JOIN users u ON fr.to_user_id = u.id
       WHERE fr.from_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [req.user.id]
    );

    res.json({ incoming, outgoing });
  } catch (err) {
    console.error('Get friend requests error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/connections/:userId/friends - Get user's friends
router.get('/:userId/friends', (req, res) => {
  try {
    const friends = queryAll(
      `SELECT u.id, u.name, u.avatar, u.city, u.bio
       FROM friend_requests fr
       JOIN users u ON (
         CASE 
           WHEN fr.from_user_id = ? THEN fr.to_user_id = u.id
           ELSE fr.from_user_id = u.id
         END
       )
       WHERE (fr.from_user_id = ? OR fr.to_user_id = ?) 
       AND fr.status = 'accepted'
       AND u.id != ?`,
      [req.params.userId, req.params.userId, req.params.userId, req.params.userId]
    );

    res.json({ friends });
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

// GET /api/connections/:userId/status - Check friendship status with current user
router.get('/:userId/status', authenticateToken, (req, res) => {
  try {
    const toUserId = parseInt(req.params.userId);

    if (toUserId === req.user.id) {
      return res.json({ status: 'self' });
    }

    const request = queryOne(
      `SELECT id, status, from_user_id, to_user_id FROM friend_requests 
       WHERE (from_user_id = ? AND to_user_id = ?) 
       OR (from_user_id = ? AND to_user_id = ?)`,
      [req.user.id, toUserId, toUserId, req.user.id]
    );

    if (!request) {
      return res.json({ status: 'none' });
    }

    res.json({
      status: request.status,
      requestId: request.id,
      direction: request.from_user_id === req.user.id ? 'outgoing' : 'incoming'
    });
  } catch (err) {
    console.error('Get connection status error:', err);
    res.status(500).json({ error: 'Er is een fout opgetreden.' });
  }
});

module.exports = router;
