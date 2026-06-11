const { queryAll, queryOne, runSql } = require('../db');
const { isSplitStoreEnabled } = require('../storage/config');
const { getPgPool } = require('../storage/splitDb');

function asInt(value) {
  return parseInt(value, 10);
}

function mapPgUser(row) {
  if (!row) return null;
  return {
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function pgOne(sql, params = []) {
  const result = await getPgPool().query(sql, params);
  return result.rows[0] || null;
}

async function pgAll(sql, params = []) {
  const result = await getPgPool().query(sql, params);
  return result.rows;
}

async function getUserByEmail(email) {
  if (!isSplitStoreEnabled()) {
    return queryOne('SELECT * FROM users WHERE email = ?', [email]);
  }

  return mapPgUser(await pgOne('SELECT * FROM users WHERE email = $1', [email]));
}

async function getUserById(id, includeEmail = false) {
  if (!isSplitStoreEnabled()) {
    const fields = includeEmail
      ? 'id, email, name, avatar, bio, city, created_at'
      : 'id, name, avatar, bio, city, created_at';
    return queryOne(`SELECT ${fields} FROM users WHERE id = ?`, [id]);
  }

  const fields = includeEmail
    ? 'id, email, name, avatar, bio, city, created_at'
    : 'id, name, avatar, bio, city, created_at';
  return mapPgUser(await pgOne(`SELECT ${fields} FROM users WHERE id = $1`, [asInt(id)]));
}

async function createUser(email, passwordHash, name) {
  if (!isSplitStoreEnabled()) {
    return runSql(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
      [email, passwordHash, name]
    );
  }

  const row = await pgOne(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
    [email, passwordHash, name]
  );
  return row.id;
}

async function updateUser(id, data) {
  if (!isSplitStoreEnabled()) {
    runSql(
      'UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), city = COALESCE(?, city), avatar = COALESCE(?, avatar) WHERE id = ?',
      [data.name, data.bio, data.city, data.avatar, id]
    );
    return getUserById(id, true);
  }

  const row = await pgOne(
    `UPDATE users
     SET name = COALESCE($1, name),
       bio = COALESCE($2, bio),
       city = COALESCE($3, city),
       avatar = COALESCE($4, avatar)
     WHERE id = $5
     RETURNING id, email, name, avatar, bio, city, created_at`,
    [data.name, data.bio, data.city, data.avatar, asInt(id)]
  );
  return mapPgUser(row);
}

async function searchUsers(q, excludeId) {
  if (!isSplitStoreEnabled()) {
    return queryAll(
      `SELECT id, name, avatar, city, bio FROM users
       WHERE (name LIKE ? OR city LIKE ?) AND id != ?
       LIMIT 20`,
      [`%${q}%`, `%${q}%`, excludeId]
    );
  }

  return pgAll(
    `SELECT id, name, avatar, city, bio FROM users
     WHERE (name ILIKE $1 OR city ILIKE $1) AND id <> $2
     LIMIT 20`,
    [`%${q}%`, asInt(excludeId)]
  );
}

async function countFriends(userId) {
  if (!isSplitStoreEnabled()) {
    return queryOne(
      `SELECT COUNT(*) as count FROM friend_requests
       WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'`,
      [userId, userId]
    )?.count || 0;
  }

  const row = await pgOne(
    `SELECT COUNT(*)::int as count FROM friend_requests
     WHERE (from_user_id = $1 OR to_user_id = $1) AND status = 'accepted'`,
    [asInt(userId)]
  );
  return row?.count || 0;
}

async function getFriendRequestBetween(userA, userB) {
  if (!isSplitStoreEnabled()) {
    return queryOne(
      `SELECT id, status, from_user_id, to_user_id FROM friend_requests
       WHERE (from_user_id = ? AND to_user_id = ?)
       OR (from_user_id = ? AND to_user_id = ?)`,
      [userA, userB, userB, userA]
    );
  }

  return pgOne(
    `SELECT id, status, from_user_id, to_user_id FROM friend_requests
     WHERE (from_user_id = $1 AND to_user_id = $2)
     OR (from_user_id = $2 AND to_user_id = $1)`,
    [asInt(userA), asInt(userB)]
  );
}

async function sendFriendRequest(fromUserId, toUserId) {
  const targetUser = await getUserById(toUserId);
  if (!targetUser) return { error: 'not_found' };

  const existing = await getFriendRequestBetween(fromUserId, toUserId);

  if (existing) {
    if (existing.status === 'accepted') return { error: 'accepted', targetUser };
    if (existing.status === 'pending') return { error: 'pending', targetUser };

    if (!isSplitStoreEnabled()) {
      runSql(
        "UPDATE friend_requests SET status = 'pending', from_user_id = ?, to_user_id = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
        [fromUserId, toUserId, existing.id]
      );
    } else {
      await pgOne(
        `UPDATE friend_requests
         SET status = 'pending', from_user_id = $1, to_user_id = $2, created_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id`,
        [asInt(fromUserId), asInt(toUserId), existing.id]
      );
    }
    return { targetUser, resent: true };
  }

  if (!isSplitStoreEnabled()) {
    runSql('INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)', [fromUserId, toUserId]);
  } else {
    await pgOne(
      'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2) RETURNING id',
      [asInt(fromUserId), asInt(toUserId)]
    );
  }

  return { targetUser };
}

async function updateFriendRequestStatus(requestId, userId, status) {
  if (!isSplitStoreEnabled()) {
    const request = queryOne(
      "SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'",
      [requestId, userId]
    );
    if (!request) return false;
    runSql('UPDATE friend_requests SET status = ? WHERE id = ?', [status, requestId]);
    return true;
  }

  const row = await pgOne(
    `UPDATE friend_requests
     SET status = $1
     WHERE id = $2 AND to_user_id = $3 AND status = 'pending'
     RETURNING id`,
    [status, asInt(requestId), asInt(userId)]
  );
  return !!row;
}

async function unfriend(userId, friendId) {
  if (!isSplitStoreEnabled()) {
    runSql(
      `DELETE FROM friend_requests
       WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
       AND status = 'accepted'`,
      [userId, friendId, friendId, userId]
    );
    return;
  }

  await getPgPool().query(
    `DELETE FROM friend_requests
     WHERE ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
     AND status = 'accepted'`,
    [asInt(userId), asInt(friendId)]
  );
}

async function getPendingRequests(userId) {
  if (!isSplitStoreEnabled()) {
    const incoming = queryAll(
      `SELECT fr.id as request_id, fr.created_at, u.id, u.name, u.avatar, u.city
       FROM friend_requests fr
       JOIN users u ON fr.from_user_id = u.id
       WHERE fr.to_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    const outgoing = queryAll(
      `SELECT fr.id as request_id, fr.created_at, u.id, u.name, u.avatar, u.city
       FROM friend_requests fr
       JOIN users u ON fr.to_user_id = u.id
       WHERE fr.from_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId]
    );

    return { incoming, outgoing };
  }

  const incoming = await pgAll(
    `SELECT fr.id as request_id, fr.created_at, u.id, u.name, u.avatar, u.city
     FROM friend_requests fr
     JOIN users u ON fr.from_user_id = u.id
     WHERE fr.to_user_id = $1 AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [asInt(userId)]
  );
  const outgoing = await pgAll(
    `SELECT fr.id as request_id, fr.created_at, u.id, u.name, u.avatar, u.city
     FROM friend_requests fr
     JOIN users u ON fr.to_user_id = u.id
     WHERE fr.from_user_id = $1 AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [asInt(userId)]
  );

  return { incoming, outgoing };
}

async function getFriends(userId) {
  if (!isSplitStoreEnabled()) {
    return queryAll(
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
      [userId, userId, userId, userId]
    );
  }

  return pgAll(
    `SELECT u.id, u.name, u.avatar, u.city, u.bio
     FROM friend_requests fr
     JOIN users u ON (
       CASE
         WHEN fr.from_user_id = $1 THEN fr.to_user_id = u.id
         ELSE fr.from_user_id = u.id
       END
     )
     WHERE (fr.from_user_id = $1 OR fr.to_user_id = $1)
     AND fr.status = 'accepted'
     AND u.id <> $1`,
    [asInt(userId)]
  );
}

async function getConnectionStatus(currentUserId, otherUserId) {
  if (asInt(otherUserId) === asInt(currentUserId)) {
    return { status: 'self' };
  }

  const request = await getFriendRequestBetween(currentUserId, otherUserId);
  if (!request) return { status: 'none' };

  return {
    status: request.status,
    requestId: request.id,
    direction: request.from_user_id === asInt(currentUserId) ? 'outgoing' : 'incoming',
  };
}

async function getUserAttendanceRows(userId) {
  if (!isSplitStoreEnabled()) {
    return queryAll('SELECT * FROM attendance WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  return pgAll(
    `SELECT id, user_id, performance_id, show_id, title_snapshot, date_time_snapshot,
      theatre_name_snapshot, theatre_city_snapshot, created_at
     FROM attendance
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [asInt(userId)]
  );
}

async function getUserAttendingIds(userId) {
  if (!isSplitStoreEnabled()) {
    return queryAll('SELECT performance_id, show_id FROM attendance WHERE user_id = ?', [userId]);
  }

  return pgAll('SELECT performance_id, show_id FROM attendance WHERE user_id = $1', [asInt(userId)]);
}

async function getAttendanceCounts(performances) {
  const counts = new Map();
  if (!performances.length) return counts;

  if (!isSplitStoreEnabled()) {
    for (const performance of performances) {
      const count = queryOne(
        'SELECT COUNT(*) as count FROM attendance WHERE performance_id = ? OR (show_id IS NOT NULL AND show_id = ?)',
        [performance.numeric_id || performance.id, performance.show_id]
      )?.count || 0;
      counts.set(performance.show_id || String(performance.id), count);
    }
    return counts;
  }

  const showIds = performances.map((performance) => performance.show_id).filter(Boolean);
  if (!showIds.length) return counts;

  const rows = await pgAll(
    'SELECT show_id, COUNT(*)::int as count FROM attendance WHERE show_id = ANY($1) GROUP BY show_id',
    [showIds]
  );
  rows.forEach((row) => counts.set(row.show_id, row.count));
  return counts;
}

async function getAttendeesForPerformance(performance) {
  if (!isSplitStoreEnabled()) {
    return queryAll(
      `SELECT u.id, u.name, u.avatar, u.city
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.performance_id = ? OR (a.show_id IS NOT NULL AND a.show_id = ?)
       ORDER BY a.created_at DESC`,
      [performance.numeric_id, performance.show_id]
    );
  }

  return pgAll(
    `SELECT u.id, u.name, u.avatar, u.city
     FROM attendance a
     JOIN users u ON a.user_id = u.id
     WHERE a.show_id = $1
     ORDER BY a.created_at DESC`,
    [performance.show_id]
  );
}

async function isUserAttendingPerformance(userId, performance) {
  if (!isSplitStoreEnabled()) {
    return !!queryOne(
      'SELECT id FROM attendance WHERE user_id = ? AND (performance_id = ? OR (show_id IS NOT NULL AND show_id = ?))',
      [userId, performance.numeric_id, performance.show_id]
    );
  }

  const row = await pgOne(
    'SELECT id FROM attendance WHERE user_id = $1 AND show_id = $2',
    [asInt(userId), performance.show_id]
  );
  return !!row;
}

async function addAttendance(userId, performance) {
  if (!isSplitStoreEnabled()) {
    runSql(
      `INSERT INTO attendance (
        user_id, performance_id, show_id, title_snapshot, date_time_snapshot,
        theatre_name_snapshot, theatre_city_snapshot
      )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        performance.numeric_id,
        performance.show_id,
        performance.title,
        performance.date_time,
        performance.theatre_name,
        performance.theatre_city,
      ]
    );
    return;
  }

  await pgOne(
    `INSERT INTO attendance (
      user_id, performance_id, show_id, title_snapshot, date_time_snapshot,
      theatre_name_snapshot, theatre_city_snapshot
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      asInt(userId),
      performance.numeric_id || null,
      performance.show_id,
      performance.title,
      performance.date_time,
      performance.theatre_name,
      performance.theatre_city,
    ]
  );
}

async function removeAttendance(userId, performanceId, performance) {
  if (!isSplitStoreEnabled()) {
    runSql(
      'DELETE FROM attendance WHERE user_id = ? AND (performance_id = ? OR (show_id IS NOT NULL AND show_id = ?))',
      [
        userId,
        performance?.numeric_id || (/^\d+$/.test(String(performanceId)) ? parseInt(performanceId, 10) : -1),
        performance?.show_id || String(performanceId),
      ]
    );
    return;
  }

  await getPgPool().query(
    'DELETE FROM attendance WHERE user_id = $1 AND show_id = $2',
    [asInt(userId), performance?.show_id || String(performanceId)]
  );
}

async function getFriendIds(userId) {
  if (!isSplitStoreEnabled()) {
    return queryAll(
      `SELECT CASE
         WHEN from_user_id = ? THEN to_user_id
         ELSE from_user_id
       END as friend_id
       FROM friend_requests
       WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'`,
      [userId, userId, userId]
    ).map((row) => row.friend_id);
  }

  const rows = await pgAll(
    `SELECT CASE
       WHEN from_user_id = $1 THEN to_user_id
       ELSE from_user_id
     END as friend_id
     FROM friend_requests
     WHERE (from_user_id = $1 OR to_user_id = $1) AND status = 'accepted'`,
    [asInt(userId)]
  );
  return rows.map((row) => row.friend_id);
}

async function getFeedAttendanceRows(userId, maxRows = 500) {
  if (!isSplitStoreEnabled()) {
    return queryAll(
      `SELECT
        a.created_at as activity_date,
        u.id as user_id, u.name as user_name, u.avatar as user_avatar,
        COALESCE(NULLIF(p.show_id, ''), CAST(p.id AS TEXT)) as performance_id,
        p.title as performance_title, p.date_time as performance_date,
        p.genre as performance_genre,
        COALESCE(NULLIF(t.stable_id, ''), CAST(t.id AS TEXT)) as theatre_id,
        t.name as theatre_name, t.city as theatre_city
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       JOIN performances p ON a.performance_id = p.id
       JOIN theatres t ON p.theatre_id = t.id
       WHERE a.user_id IN (
         SELECT CASE
           WHEN fr.from_user_id = ? THEN fr.to_user_id
           ELSE fr.from_user_id
         END
         FROM friend_requests fr
         WHERE (fr.from_user_id = ? OR fr.to_user_id = ?)
         AND fr.status = 'accepted'
       )
       AND COALESCE(p.removed, 0) = 0
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [userId, userId, userId, maxRows]
    );
  }

  const friendIds = await getFriendIds(userId);
  if (!friendIds.length) return [];

  return pgAll(
    `SELECT
      a.created_at as activity_date,
      a.performance_id,
      a.show_id,
      a.title_snapshot,
      a.date_time_snapshot,
      a.theatre_name_snapshot,
      a.theatre_city_snapshot,
      u.id as user_id,
      u.name as user_name,
      u.avatar as user_avatar
     FROM attendance a
     JOIN users u ON a.user_id = u.id
     WHERE a.user_id = ANY($1)
     ORDER BY a.created_at DESC
     LIMIT $2`,
    [friendIds, maxRows]
  );
}

module.exports = {
  addAttendance,
  countFriends,
  createUser,
  getAttendanceCounts,
  getAttendeesForPerformance,
  getConnectionStatus,
  getFeedAttendanceRows,
  getFriends,
  getPendingRequests,
  getUserAttendanceRows,
  getUserAttendingIds,
  getUserByEmail,
  getUserById,
  isUserAttendingPerformance,
  removeAttendance,
  searchUsers,
  sendFriendRequest,
  unfriend,
  updateFriendRequestStatus,
  updateUser,
};
