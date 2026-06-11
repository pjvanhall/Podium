const { queryAll, queryOne } = require('../db');
const { isSplitStoreEnabled } = require('../storage/config');
const { getCollections } = require('../storage/splitDb');
const { decodeHtmlEntities, decodePerformanceText } = require('../utils/html');
const socialRepository = require('./socialRepository');

function isIntegerLike(value) {
  return /^\d+$/.test(String(value || ''));
}

function parsePagination(query, defaultLimit = 50) {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function nowSqlString() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dateValue(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toPublicTheatre(row) {
  if (!row) return null;
  return {
    id: row.stable_id || row.id,
    numeric_id: row.numeric_id || row.id,
    stable_id: row.stable_id || row.id,
    osm_id: row.osm_id || '',
    name: row.name,
    city: row.city,
    address: row.address,
    province: row.province,
    image_url: row.image_url || '',
    website: row.website || '',
    description: row.description || '',
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function toPublicPerformance(row) {
  const performance = decodePerformanceText(row);
  if (!performance) return performance;
  return {
    id: performance.show_id || performance.id,
    numeric_id: performance.numeric_id || performance.id,
    show_id: performance.show_id || String(performance.id),
    title: performance.title,
    description: performance.description || '',
    genre: performance.genre || '',
    date_time: dateValue(performance.date_time),
    theatre_id: performance.theatre_id,
    theatre_numeric_id: performance.theatre_numeric_id,
    theatre_name: performance.theatre_name,
    theatre_city: performance.theatre_city,
    theatre_address: performance.theatre_address,
    ticket_url: performance.ticket_url || '',
    image_url: performance.image_url || '',
    source_event_id: performance.source_event_id || '',
    source_url: performance.source_url || '',
    status: performance.status || 'active',
    removed: !!performance.removed,
    removed_when: dateValue(performance.removed_when),
    changed_at: dateValue(performance.changed_at),
    first_seen_at: dateValue(performance.first_seen_at),
    last_seen_at: dateValue(performance.last_seen_at),
    missing_since: dateValue(performance.missing_since),
    missing_count: performance.missing_count || 0,
    attendee_count: performance.attendee_count || 0,
    is_attending: !!performance.is_attending,
    performance_id: performance.performance_id || performance.show_id || performance.id,
    registered_at: dateValue(performance.registered_at),
  };
}

function mongoTheatreDoc(doc) {
  if (!doc) return null;
  return toPublicTheatre({
    ...doc,
    id: doc.numeric_id,
    stable_id: doc.stable_id || doc._id,
  });
}

function mongoShowDoc(doc) {
  if (!doc) return null;
  return toPublicPerformance({
    ...doc,
    id: doc.show_id || doc._id,
    show_id: doc.show_id || doc._id,
    theatre_id: doc.theatre_id,
  });
}

function publicPerformanceSelect(extraColumns = '') {
  return `
    COALESCE(NULLIF(p.show_id, ''), CAST(p.id AS TEXT)) as id,
    p.id as numeric_id,
    p.show_id,
    p.title,
    p.description,
    p.genre,
    p.date_time,
    COALESCE(NULLIF(t.stable_id, ''), CAST(t.id AS TEXT)) as theatre_id,
    t.id as theatre_numeric_id,
    p.ticket_url,
    p.image_url,
    p.source_event_id,
    p.source_url,
    p.status,
    p.removed,
    p.removed_when,
    p.changed_at,
    p.first_seen_at,
    p.last_seen_at,
    p.missing_since,
    p.missing_count,
    t.name as theatre_name,
    t.city as theatre_city
    ${extraColumns}
  `;
}

function performanceIdentityWhere(value) {
  if (isIntegerLike(value)) {
    return { sql: '(p.show_id = ? OR p.id = ?)', params: [String(value), parseInt(value, 10)] };
  }

  return { sql: 'p.show_id = ?', params: [String(value)] };
}

function theatreIdentityWhere(value) {
  if (isIntegerLike(value)) {
    return { sql: '(stable_id = ? OR id = ?)', params: [String(value), parseInt(value, 10)] };
  }

  return { sql: 'stable_id = ?', params: [String(value)] };
}

async function attachAttendanceMetadata(performances, userId) {
  if (!performances.length) return performances;

  const counts = await socialRepository.getAttendanceCounts(performances);
  performances.forEach((performance) => {
    performance.attendee_count = counts.get(performance.show_id || String(performance.id)) || 0;
  });

  if (userId) {
    const userAttendance = await socialRepository.getUserAttendingIds(userId);
    const attendingIds = new Set(userAttendance.map((row) => row.performance_id));
    const attendingShowIds = new Set(userAttendance.map((row) => row.show_id).filter(Boolean));

    performances.forEach((performance) => {
      performance.is_attending =
        attendingShowIds.has(performance.show_id) ||
        attendingIds.has(performance.numeric_id);
    });
  }

  return performances;
}

async function listTheatres(query: any = {}) {
  if (!isSplitStoreEnabled()) {
    const { city, province, q } = query;
    let sql = `
      SELECT
        COALESCE(NULLIF(stable_id, ''), CAST(id AS TEXT)) as id,
        id as numeric_id,
        stable_id,
        osm_id,
        name,
        city,
        address,
        province,
        image_url,
        website,
        description,
        latitude,
        longitude
      FROM theatres
      WHERE 1=1`;
    const params = [];

    if (city) {
      sql += ' AND city LIKE ?';
      params.push(`%${city}%`);
    }
    if (province) {
      sql += ' AND province = ?';
      params.push(province);
    }
    if (q) {
      sql += ' AND (name LIKE ? OR city LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    sql += ' ORDER BY name ASC';
    return queryAll(sql, params).map(toPublicTheatre);
  }

  const { theatres } = getCollections();
  const filter: any = {};
  if (query.city) filter.city = { $regex: escapeRegex(query.city), $options: 'i' };
  if (query.province) filter.province = query.province;
  if (query.q) {
    const regex = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$or = [{ name: regex }, { city: regex }];
  }

  const rows = await theatres.find(filter).sort({ name: 1 }).toArray();
  return rows.map(mongoTheatreDoc);
}

async function getTheatreById(id) {
  if (!isSplitStoreEnabled()) {
    const identity = theatreIdentityWhere(id);
    return toPublicTheatre(queryOne(
      `SELECT
        COALESCE(NULLIF(stable_id, ''), CAST(id AS TEXT)) as id,
        id as numeric_id,
        stable_id,
        osm_id,
        name,
        city,
        address,
        province,
        image_url,
        website,
        description,
        latitude,
        longitude
       FROM theatres
       WHERE ${identity.sql}`,
      identity.params
    ));
  }

  const { theatres } = getCollections();
  const filter = isIntegerLike(id)
    ? { $or: [{ stable_id: String(id) }, { numeric_id: parseInt(id, 10) }] }
    : { stable_id: String(id) };
  return mongoTheatreDoc(await theatres.findOne(filter));
}

async function getTheatreWithPerformances(id, query: any = {}) {
  const theatre = await getTheatreById(id);
  if (!theatre) return null;

  const { page, limit, offset } = parsePagination(query, 24);

  if (!isSplitStoreEnabled()) {
    const total = queryOne(
      `SELECT COUNT(*) as total
       FROM performances p
       WHERE p.theatre_id = ? AND p.date_time >= datetime('now') AND COALESCE(p.removed, 0) = 0`,
      [theatre.numeric_id]
    )?.total || 0;

    const performances = queryAll(
      `SELECT ${publicPerformanceSelect(`,
        (SELECT COUNT(*) FROM attendance a WHERE a.performance_id = p.id OR (a.show_id IS NOT NULL AND a.show_id = p.show_id)) as attendee_count
      `)}
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       WHERE p.theatre_id = ? AND p.date_time >= datetime('now') AND COALESCE(p.removed, 0) = 0
       ORDER BY p.date_time ASC
       LIMIT ? OFFSET ?`,
      [theatre.numeric_id, limit, offset]
    ).map(toPublicPerformance);

    return {
      theatre,
      performances,
      performancePagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  const { shows } = getCollections();
  const filter: any = {
    theatre_id: theatre.stable_id || theatre.id,
    removed: { $ne: true },
    date_time: { $gte: nowSqlString() },
  };
  const total = await shows.countDocuments(filter);
  const performances = (await shows.find(filter).sort({ date_time: 1 }).skip(offset).limit(limit).toArray())
    .map(mongoShowDoc);
  await attachAttendanceMetadata(performances, null);

  return {
    theatre,
    performances,
    performancePagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function listPerformances(query: any = {}, userId = null) {
  const { theatre_id, genre, date_from, date_to, q, city, province } = query;
  const { page, limit, offset } = parsePagination(query, 50);

  if (!isSplitStoreEnabled()) {
    let whereSql = 'WHERE COALESCE(p.removed, 0) = 0';
    const params = [];

    if (theatre_id) {
      if (isIntegerLike(theatre_id)) {
        whereSql += ' AND (p.theatre_id = ? OR t.stable_id = ?)';
        params.push(parseInt(theatre_id), String(theatre_id));
      } else {
        whereSql += ' AND t.stable_id = ?';
        params.push(String(theatre_id));
      }
    }
    if (genre) {
      whereSql += ' AND p.genre = ?';
      params.push(genre);
    }
    if (city) {
      whereSql += ' AND t.city = ?';
      params.push(city);
    }
    if (province) {
      whereSql += ' AND t.province = ?';
      params.push(province);
    }
    if (date_from) {
      whereSql += ' AND p.date_time >= ?';
      params.push(date_from);
    }
    if (date_to) {
      whereSql += ' AND p.date_time <= ?';
      params.push(date_to);
    }
    if (q) {
      whereSql += ' AND (p.title LIKE ? OR p.description LIKE ? OR t.name LIKE ? OR t.city LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (!date_from) {
      whereSql += " AND p.date_time >= datetime('now')";
    }

    const total = queryOne(
      `SELECT COUNT(*) as total
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       ${whereSql}`,
      params
    )?.total || 0;

    const performances = queryAll(
      `SELECT ${publicPerformanceSelect(`,
        (SELECT COUNT(*) FROM attendance a WHERE a.performance_id = p.id OR (a.show_id IS NOT NULL AND a.show_id = p.show_id)) as attendee_count
      `)}
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       ${whereSql}
       ORDER BY p.date_time ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ).map(toPublicPerformance);

    await attachAttendanceMetadata(performances, userId);
    return { performances, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  const { shows } = getCollections();
  const filter: any = { removed: { $ne: true } };

  if (theatre_id) {
    filter.theatre_id = String(theatre_id);
    if (isIntegerLike(theatre_id)) {
      filter.$or = [{ theatre_id: String(theatre_id) }, { theatre_numeric_id: parseInt(theatre_id, 10) }];
      delete filter.theatre_id;
    }
  }
  if (genre) filter.genre = genre;
  if (city) filter.theatre_city = city;
  if (province) filter.theatre_province = province;
  if (date_from || !date_from) {
    filter.date_time = { ...(filter.date_time || {}), $gte: date_from || nowSqlString() };
  }
  if (date_to) {
    filter.date_time = { ...(filter.date_time || {}), $lte: date_to };
  }
  if (q) {
    const regex = { $regex: escapeRegex(q), $options: 'i' };
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ title: regex }, { description: regex }, { theatre_name: regex }, { theatre_city: regex }] },
    ];
  }

  const total = await shows.countDocuments(filter);
  const performances = (await shows.find(filter).sort({ date_time: 1 }).skip(offset).limit(limit).toArray())
    .map(mongoShowDoc);
  await attachAttendanceMetadata(performances, userId);

  return { performances, page, limit, total, totalPages: Math.ceil(total / limit) };
}

async function getGenres() {
  if (!isSplitStoreEnabled()) {
    return queryAll(
      "SELECT DISTINCT genre FROM performances WHERE genre != '' AND COALESCE(removed, 0) = 0 ORDER BY genre ASC"
    ).map((row) => row.genre);
  }

  const { shows } = getCollections();
  const genres = await shows.distinct('genre', { genre: { $ne: '' }, removed: { $ne: true } });
  return genres.sort();
}

async function findPerformanceByPublicId(id) {
  if (!isSplitStoreEnabled()) {
    const identity = performanceIdentityWhere(id);
    return toPublicPerformance(queryOne(
      `SELECT ${publicPerformanceSelect(', t.address as theatre_address')}
       FROM performances p
       JOIN theatres t ON p.theatre_id = t.id
       WHERE ${identity.sql}`,
      identity.params
    ));
  }

  const { shows } = getCollections();
  const filter = isIntegerLike(id)
    ? { $or: [{ show_id: String(id) }, { numeric_id: parseInt(id, 10) }] }
    : { show_id: String(id) };
  return mongoShowDoc(await shows.findOne(filter));
}

async function getPerformanceWithAttendees(id, userId = null) {
  const performance = await findPerformanceByPublicId(id);
  if (!performance) return null;

  const attendees = await socialRepository.getAttendeesForPerformance(performance);
  performance.attendee_count = attendees.length;
  if (userId) {
    performance.is_attending = await socialRepository.isUserAttendingPerformance(userId, performance);
  }

  return { performance, attendees };
}

async function getUserAttendingPerformances(userId) {
  if (!isSplitStoreEnabled()) {
    const performances = queryAll(
      `SELECT
        COALESCE(NULLIF(p.show_id, ''), NULLIF(a.show_id, ''), CAST(p.id AS TEXT)) as id,
        COALESCE(NULLIF(p.show_id, ''), NULLIF(a.show_id, ''), CAST(p.id AS TEXT)) as performance_id,
        p.id as numeric_id,
        p.show_id,
        COALESCE(p.title, a.title_snapshot) as title,
        COALESCE(p.description, '') as description,
        COALESCE(p.genre, '') as genre,
        COALESCE(p.date_time, a.date_time_snapshot) as date_time,
        COALESCE(NULLIF(t.stable_id, ''), CAST(t.id AS TEXT)) as theatre_id,
        t.id as theatre_numeric_id,
        p.ticket_url,
        p.image_url,
        p.source_event_id,
        p.source_url,
        COALESCE(p.status, 'removed') as status,
        COALESCE(p.removed, 1) as removed,
        p.removed_when,
        p.changed_at,
        p.first_seen_at,
        p.last_seen_at,
        p.missing_since,
        p.missing_count,
        COALESCE(t.name, a.theatre_name_snapshot) as theatre_name,
        COALESCE(t.city, a.theatre_city_snapshot) as theatre_city,
        a.created_at as registered_at
       FROM attendance a
       LEFT JOIN performances p ON a.performance_id = p.id OR (a.show_id IS NOT NULL AND a.show_id = p.show_id)
       LEFT JOIN theatres t ON p.theatre_id = t.id
       WHERE a.user_id = ?
       ORDER BY COALESCE(p.date_time, a.date_time_snapshot) ASC`,
      [userId]
    ).map(toPublicPerformance);

    return performances;
  }

  const rows = await socialRepository.getUserAttendanceRows(userId);
  if (!rows.length) return [];

  const showIds = rows.map((row) => row.show_id).filter(Boolean);
  const { shows } = getCollections();
  const showDocs = await shows.find({ show_id: { $in: showIds } }).toArray();
  const byShowId: Map<string, any> = new Map(showDocs.map((show: any) => [show.show_id, mongoShowDoc(show)]));

  return rows.map((row) => {
    const show = byShowId.get(row.show_id);
    if (show) {
      return {
        ...show,
        performance_id: show.show_id,
        registered_at: dateValue(row.created_at),
      };
    }

    return toPublicPerformance({
      id: row.show_id,
      performance_id: row.show_id,
      show_id: row.show_id,
      title: row.title_snapshot,
      date_time: row.date_time_snapshot,
      theatre_name: row.theatre_name_snapshot,
      theatre_city: row.theatre_city_snapshot,
      status: 'removed',
      removed: true,
      registered_at: row.created_at,
    });
  }).sort((a, b) => String(a.date_time || '').localeCompare(String(b.date_time || '')));
}

async function countUpcomingForUser(userId) {
  const performances = await getUserAttendingPerformances(userId);
  return performances.filter((performance) => (
    !performance.removed &&
    String(performance.date_time || '') >= nowSqlString()
  )).length;
}

async function getFeed(userId, page = 1, limit = 20) {
  const safePage = Math.max(1, parseInt(String(page), 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  if (!isSplitStoreEnabled()) {
    const feed = await socialRepository.getFeedAttendanceRows(userId, offset + safeLimit);
    return feed.slice(offset, offset + safeLimit).map((item) => ({
      ...item,
      performance_title: decodeHtmlEntities(item.performance_title),
      performance_genre: decodeHtmlEntities(item.performance_genre),
    }));
  }

  const baseRows = await socialRepository.getFeedAttendanceRows(userId, Math.max(500, offset + safeLimit * 3));
  if (!baseRows.length) return [];

  const showIds = [...new Set(baseRows.map((row) => row.show_id).filter(Boolean))];
  const { shows } = getCollections();
  const showDocs = await shows.find({ show_id: { $in: showIds }, removed: { $ne: true } }).toArray();
  const byShowId: Map<string, any> = new Map(showDocs.map((show: any) => [show.show_id, mongoShowDoc(show)]));

  const feed = baseRows.flatMap((row) => {
    const show = byShowId.get(row.show_id);
    if (!show) return [];

    return [{
      activity_date: dateValue(row.activity_date),
      user_id: row.user_id,
      user_name: row.user_name,
      user_avatar: row.user_avatar,
      performance_id: show.show_id,
      performance_title: show.title,
      performance_date: show.date_time,
      performance_genre: show.genre,
      theatre_id: show.theatre_id,
      theatre_name: show.theatre_name,
      theatre_city: show.theatre_city,
    }];
  });

  return feed.slice(offset, offset + safeLimit);
}

module.exports = {
  countUpcomingForUser,
  findPerformanceByPublicId,
  getFeed,
  getGenres,
  getPerformanceWithAttendees,
  getTheatreById,
  getTheatreWithPerformances,
  getUserAttendingPerformances,
  listPerformances,
  listTheatres,
  parsePagination,
};
