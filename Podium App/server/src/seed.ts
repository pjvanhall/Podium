const { queryOne, runSql, queryAll } = require('./db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const {
  buildShowContentHash,
  buildShowStableId,
  buildTheatreStableId,
} = require('./utils/stableIds');
const { isSplitStoreEnabled } = require('./storage/config');

async function seedDatabase() {
  if (isSplitStoreEnabled()) {
    const { getCollections } = require('./storage/splitDb');
    const collections = getCollections();
    const showsCount = await collections.shows.countDocuments();

    if (showsCount === 0) {
      if (process.env.NODE_ENV === 'production') {
        console.log('🌍 Split backend: No shows found in DB. Seeding from theatre_shows.json...');
        const { execSync } = require('child_process');
        const importScript = path.resolve(__dirname, '..', '..', '..', 'scripts', 'import-shows.js');
        if (fs.existsSync(importScript)) {
          try {
            execSync(`node "${importScript}"`, { stdio: 'inherit' });
          } catch (err) {
            console.error('⚠️ Failed to run import-shows.js:', err);
          }
        } else {
          console.log('⚠️ import-shows.js not found.');
        }
      } else {
        console.log('🎭 Split backend: Development mode. Seeding demo data...');
        const { getPgPool } = require('./storage/splitDb');
        const pgPool = getPgPool();
        await seedSplitDemoData(collections, pgPool);
      }
    } else {
      console.log('Split data backend enabled and database already seeded, skipping.');
    }
    return;
  }

  // Check if already seeded
  const theatreCount = queryOne('SELECT COUNT(*) as count FROM theatres');
  if (theatreCount && theatreCount.count > 0) {
    console.log('Database already seeded, skipping...');
    return;
  }

  console.log('🎭 Seeding database with Dutch theatres and performances...');

  // ========== THEATRES ==========
  // Load from dutch_theatres.json (kept up-to-date by `npm run update-theatres`)
  const theatresFile = path.resolve(__dirname, '..', 'dutch_theatres.json');
  const allTheatres = JSON.parse(fs.readFileSync(theatresFile, 'utf8'));
  const theatres = allTheatres.filter((t: any) => !t.blacklisted);
  const blacklistedCount = allTheatres.length - theatres.length;
  console.log(`📂 Loaded ${allTheatres.length} theatres from dutch_theatres.json`);
  if (blacklistedCount > 0) {
    console.log(`🚫 Skipping ${blacklistedCount} blacklisted theatres`);
  }


  const theatreIds: Record<string, number> = {};
  const theatreStableIds: Record<string, string> = {};
  theatres.forEach((t: any) => {
    const stableId = buildTheatreStableId(t);
    const id = runSql(
      `INSERT INTO theatres (stable_id, osm_id, name, city, address, province, image_url, website, description, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stableId,
        t.osm_id !== undefined && t.osm_id !== null ? String(t.osm_id) : '',
        t.name,
        t.city,
        t.address,
        t.province,
        t.image_url || '',
        t.website || '',
        t.description || '',
        t.latitude,
        t.longitude,
      ]
    );
    theatreIds[t.name] = id;
    theatreStableIds[t.name] = stableId;
  });
  console.log(`✅ Inserted ${theatres.length} theatres`);

  if (process.env.NODE_ENV === 'production') {
    console.log('🌍 Running in production mode: seeding performances from theatre_shows.json...');
    const showsFile = path.resolve(__dirname, '..', 'theatre_shows.json');
    if (!fs.existsSync(showsFile)) {
      console.log('⚠️ theatre_shows.json not found, skipping performance seeding.');
      return;
    }

    const shows = JSON.parse(fs.readFileSync(showsFile, 'utf8'));
    let insertedShows = 0;

    shows.forEach((show: any) => {
      let theatreId = theatreIds[show.theatre_name];
      let theatreStableId = theatreStableIds[show.theatre_name];

      if (!theatreId) {
        const nameLower = String(show.theatre_name || '').toLowerCase();
        const matchName = Object.keys(theatreIds).find(k => k.toLowerCase() === nameLower);
        if (matchName) {
          theatreId = theatreIds[matchName];
          theatreStableId = theatreStableIds[matchName];
        }
      }

      if (!theatreId) return;

      const showStableId = buildShowStableId(show, theatreStableId);
      const contentHash = buildShowContentHash(show);

      runSql(
        `INSERT INTO performances (
          show_id, title, description, genre, date_time, theatre_id, ticket_url,
          image_url, source_event_id, source_url, content_hash, status, removed,
          first_seen_at, last_seen_at, missing_count
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
        [
          showStableId,
          show.title || '',
          show.description || '',
          show.genre || 'Toneel',
          show.date_time,
          theatreId,
          show.ticket_url || '',
          show.image_url || '',
          show.source_event_id || '',
          show.source_url || '',
          contentHash,
        ]
      );
      insertedShows++;
    });

    console.log(`✅ Seeded ${insertedShows} production performances from theatre_shows.json`);
    return;
  }

  // ========== PERFORMANCES ==========
  const genres = ['Toneel', 'Musical', 'Cabaret', 'Opera', 'Dans', 'Muziek', 'Jeugd', 'Comedy'];

  const performanceTemplates = [
    { title: 'De Verleiders - Macho\'s', genre: 'Toneel', description: 'Een prikkelende voorstelling over mannelijkheid en kwetsbaarheid in de moderne samenleving.' },
    { title: 'Soldaat van Oranje', genre: 'Musical', description: 'De indrukwekkende musical over het waargebeurde verhaal van Erik Hazelhoff Roelfzema.' },
    { title: 'Youp van \'t Hek - Oudejaarsconference', genre: 'Cabaret', description: 'De meester van het Nederlandse cabaret met zijn jaarlijkse terugblik.' },
    { title: 'Carmen - Bizet', genre: 'Opera', description: 'De tijdloze opera van Bizet over passie, jaloezie en vrijheid.' },
    { title: 'Het Zwanenmeer', genre: 'Dans', description: 'Het iconische ballet van Tsjaikovski, uitgevoerd door Het Nationale Ballet.' },
    { title: 'Beethoven\'s Negende', genre: 'Muziek', description: 'Het Koninklijk Concertgebouworkest speelt Beethovens meest geliefde symfonie.' },
    { title: 'Matilda de Musical', genre: 'Jeugd', description: 'De betoverende familiemusical gebaseerd op het boek van Roald Dahl.' },
    { title: 'Jochem Myjer - Adem In, Adem Uit', genre: 'Comedy', description: 'De energieke Jochem Myjer met zijn nieuwste avondvullende show.' },
    { title: 'Turks Fruit', genre: 'Toneel', description: 'Een nieuwe bewerking van het beroemde boek van Jan Wolkers.' },
    { title: 'Les Misérables', genre: 'Musical', description: 'De legendarische musical over liefde, revolutie en verlossing in het 19e-eeuwse Frankrijk.' },
    { title: 'Peter Pannekoek - Later Was Alles Beter', genre: 'Cabaret', description: 'Scherp en grappig cabaret over nostalgie en de toekomst.' },
    { title: 'Coppélia', genre: 'Dans', description: 'Een charmant en humoristisch ballet over een levensechte pop.' },
    { title: 'Najib Amhali - Druk', genre: 'Comedy', description: 'Najib Amhali over de dagelijkse druk van het moderne leven.' },
    { title: 'De Tweeling', genre: 'Toneel', description: 'Het aangrijpende verhaal van twee zusjes gescheiden door de Tweede Wereldoorlog.' },
    { title: 'The Phantom of the Opera', genre: 'Musical', description: 'Andrew Lloyd Webbers meesterwerk keert terug naar Nederland.' },
    { title: 'Bach: Matthäus-Passion', genre: 'Muziek', description: 'Het Nederlands Kamerkoor voert Bachs magistrale passie-oratorium uit.' },
    { title: 'Claudia de Breij - Mag Ik Dan Bij Jou', genre: 'Cabaret', description: 'Een warme en ontroerende voorstelling over verbinding.' },
    { title: 'Roodkapje', genre: 'Jeugd', description: 'Een moderne, interactieve bewerking van het klassieke sprookje voor de hele familie.' },
    { title: 'Giselle', genre: 'Dans', description: 'Het romantische ballet over een boerenmeisje dat sterft van verdriet.' },
    { title: 'Guido Weijers - Boerenverstand', genre: 'Comedy', description: 'Guido Weijers met zijn nuchtere kijk op het leven en de maatschappij.' },
  ];

  // Generate performances for the next 3 months across all theatres
  const now = new Date();
  const theatreNames = Object.keys(theatreIds);

  performanceTemplates.forEach((perf, i) => {
    // Assign to 2-4 random theatres
    const numTheatres = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...theatreNames].sort(() => Math.random() - 0.5);
    const selectedTheatres = shuffled.slice(0, numTheatres);

    selectedTheatres.forEach(theatreName => {
      // Random date in next 3 months
      const daysAhead = 1 + Math.floor(Math.random() * 90);
      const performanceDate = new Date(now);
      performanceDate.setDate(performanceDate.getDate() + daysAhead);
      // Set time to 19:30 or 20:00
      performanceDate.setHours(Math.random() > 0.5 ? 19 : 20, Math.random() > 0.5 ? 0 : 30, 0, 0);

      const dateStr = performanceDate.toISOString().slice(0, 19).replace('T', ' ');
      const ticketUrl = `https://tickets.example.com/${i}`;
      const show = {
        title: perf.title,
        description: perf.description,
        genre: perf.genre,
        date_time: dateStr,
        ticket_url: ticketUrl,
        image_url: '',
        source_url: '',
      };
      const showId = buildShowStableId(show, theatreStableIds[theatreName]);
      const contentHash = buildShowContentHash(show);

      runSql(
        `INSERT INTO performances (
          show_id, title, description, genre, date_time, theatre_id, ticket_url,
          content_hash, status, removed, first_seen_at, last_seen_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          showId,
          perf.title,
          perf.description,
          perf.genre,
          dateStr,
          theatreIds[theatreName],
          ticketUrl,
          contentHash,
        ]
      );
    });
  });

  // ========== DEMO USERS ==========
  const salt = await bcrypt.genSalt(10);
  const demoPassword = await bcrypt.hash('welkom123', salt);

  const demoUsers = [
    { email: 'lisa@example.com', name: 'Lisa de Vries', city: 'Amsterdam', bio: 'Theaterliefhebber en opera-fan. Altijd op zoek naar de mooiste voorstellingen!' },
    { email: 'mark@example.com', name: 'Mark Jansen', city: 'Rotterdam', bio: 'Musical-addict en cabaretfan. Samen naar het theater is leuker!' },
    { email: 'sophie@example.com', name: 'Sophie Bakker', city: 'Utrecht', bio: 'Danser en theatermaker. Ik ga naar alles wat beweegt op het podium.' },
    { email: 'jan@example.com', name: 'Jan van den Berg', city: 'Den Haag', bio: 'Gepensioneerd docent, nu fulltime theaterganger. Classica en modern toneel.' },
    { email: 'eva@example.com', name: 'Eva Mulder', city: 'Groningen', bio: 'Student en cultuurliefhebber. Comedy en cabaret zijn mijn guilty pleasures.' },
  ];

  const userIds = [];
  for (const u of demoUsers) {
    const id = runSql(
      'INSERT INTO users (email, password_hash, name, city, bio) VALUES (?, ?, ?, ?, ?)',
      [u.email, demoPassword, u.name, u.city, u.bio]
    );
    userIds.push(id);
  }

  // Create some friendships
  runSql("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (?, ?, 'accepted')", [userIds[0], userIds[1]]);
  runSql("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (?, ?, 'accepted')", [userIds[0], userIds[2]]);
  runSql("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (?, ?, 'accepted')", [userIds[1], userIds[3]]);
  runSql("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (?, ?, 'pending')", [userIds[4], userIds[0]]);

  // Add some attendance
  const allPerformances = queryAll('SELECT id FROM performances LIMIT 20');
  for (let i = 0; i < userIds.length; i++) {
    const numAttending = 2 + Math.floor(Math.random() * 4);
    const shuffledPerfs = [...allPerformances].sort(() => Math.random() - 0.5);
    for (let j = 0; j < numAttending && j < shuffledPerfs.length; j++) {
      const performance = queryOne(
        `SELECT p.id, p.show_id, p.title, p.date_time, t.name as theatre_name, t.city as theatre_city
         FROM performances p
         JOIN theatres t ON p.theatre_id = t.id
         WHERE p.id = ?`,
        [shuffledPerfs[j].id]
      );
      runSql(
        `INSERT OR IGNORE INTO attendance (
          user_id, performance_id, show_id, title_snapshot, date_time_snapshot,
          theatre_name_snapshot, theatre_city_snapshot
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userIds[i],
          performance.id,
          performance.show_id,
          performance.title,
          performance.date_time,
          performance.theatre_name,
          performance.theatre_city,
        ]
      );
    }
  }

  console.log(`✅ Seeded: ${theatres.length} theaters, ${performanceTemplates.length * 3} voorstellingen, ${demoUsers.length} gebruikers`);
  console.log('📧 Demo login: lisa@example.com / welkom123');
}

module.exports = { seedDatabase };

async function seedSplitDemoData(collections: any, pgPool: any) {
  // Clear existing postgres data
  await pgPool.query('TRUNCATE users, friend_requests, attendance RESTART IDENTITY CASCADE');

  // Clear existing mongo data
  await collections.shows.deleteMany({});
  await collections.theatres.deleteMany({});

  // Read theatres
  const theatresFile = path.resolve(__dirname, '..', 'dutch_theatres.json');
  const allTheatres = JSON.parse(fs.readFileSync(theatresFile, 'utf8'));
  const theatres = allTheatres.filter((t: any) => !t.blacklisted);

  const theatreDocs = theatres.map((t: any) => {
    const stableId = buildTheatreStableId(t);
    return {
      _id: stableId,
      id: stableId,
      stable_id: stableId,
      osm_id: t.osm_id !== undefined && t.osm_id !== null ? String(t.osm_id) : '',
      name: t.name,
      city: t.city,
      address: t.address || '',
      province: t.province || '',
      image_url: t.image_url || '',
      website: t.website || '',
      description: t.description || '',
      latitude: t.latitude,
      longitude: t.longitude,
      updated_at: new Date().toISOString()
    };
  });

  const uniqueTheatreDocs = [];
  const seenTheatreIds = new Set();
  for (const doc of theatreDocs) {
    if (!seenTheatreIds.has(doc._id)) {
      seenTheatreIds.add(doc._id);
      uniqueTheatreDocs.push(doc);
    }
  }

  if (uniqueTheatreDocs.length > 0) {
    await collections.theatres.insertMany(uniqueTheatreDocs);
    console.log(`✅ Inserted ${uniqueTheatreDocs.length} theatres to Mongo`);
  }

  // Performances
  const genres = ['Toneel', 'Musical', 'Cabaret', 'Opera', 'Dans', 'Muziek', 'Jeugd', 'Comedy'];
  const performanceTemplates = [
    { title: 'De Verleiders - Macho\'s', genre: 'Toneel', description: 'Een prikkelende voorstelling over mannelijkheid en kwetsbaarheid in de moderne samenleving.' },
    { title: 'Soldaat van Oranje', genre: 'Musical', description: 'De indrukwekkende musical over het waargebeurde verhaal van Erik Hazelhoff Roelfzema.' },
    { title: 'Youp van \'t Hek - Oudejaarsconference', genre: 'Cabaret', description: 'De meester van het Nederlandse cabaret met zijn jaarlijkse terugblik.' },
    { title: 'Carmen - Bizet', genre: 'Opera', description: 'De tijdloze opera van Bizet over passie, jaloezie en vrijheid.' },
    { title: 'Het Zwanenmeer', genre: 'Dans', description: 'Het iconische ballet van Tsjaikovski, uitgevoerd door Het Nationale Ballet.' },
    { title: 'Beethoven\'s Negende', genre: 'Muziek', description: 'Het Koninklijk Concertgebouworkest speelt Beethovens meest geliefde symfonie.' },
    { title: 'Matilda de Musical', genre: 'Jeugd', description: 'De betoverende familiemusical gebaseerd op het boek van Roald Dahl.' },
    { title: 'Jochem Myjer - Adem In, Adem Uit', genre: 'Comedy', description: 'De energieke Jochem Myjer met zijn nieuwste avondvullende show.' },
    { title: 'Turks Fruit', genre: 'Toneel', description: 'Een nieuwe bewerking van het beroemde boek van Jan Wolkers.' },
    { title: 'Les Misérables', genre: 'Musical', description: 'De legendarische musical over liefde, revolutie en verlossing in het 19e-eeuwse Frankrijk.' },
    { title: 'Peter Pannekoek - Later Was Alles Beter', genre: 'Cabaret', description: 'Scherp en grappig cabaret over nostalgie en de toekomst.' },
    { title: 'Coppélia', genre: 'Dans', description: 'Een charmant en humoristisch ballet over een levensechte pop.' },
    { title: 'Najib Amhali - Druk', genre: 'Comedy', description: 'Najib Amhali over de dagelijkse druk van het moderne leven.' },
    { title: 'De Tweeling', genre: 'Toneel', description: 'Het aangrijpende verhaal van twee zusjes gescheiden door de Tweede Wereldoorlog.' },
    { title: 'The Phantom of the Opera', genre: 'Musical', description: 'Andrew Lloyd Webbers meesterwerk keert terug naar Nederland.' },
    { title: 'Bach: Matthäus-Passion', genre: 'Muziek', description: 'Het Nederlands Kamerkoor voert Bachs magistrale passie-oratorium uit.' },
    { title: 'Claudia de Breij - Mag Ik Dan Bij Jou', genre: 'Cabaret', description: 'Een warme en ontroerende voorstelling over verbinding.' },
    { title: 'Roodkapje', genre: 'Jeugd', description: 'Een moderne, interactieve bewerking van het klassieke sprookje voor de hele familie.' },
    { title: 'Giselle', genre: 'Dans', description: 'Het romantische ballet over een boerenmeisje dat sterft van verdriet.' },
    { title: 'Guido Weijers - Boerenverstand', genre: 'Comedy', description: 'Guido Weijers met zijn nuchtere kijk op het leven en de maatschappij.' },
  ];

  const showDocs: any[] = [];
  const now = new Date();

  performanceTemplates.forEach((perf, i) => {
    const numTheatres = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...theatreDocs].sort(() => Math.random() - 0.5);
    const selectedTheatres = shuffled.slice(0, numTheatres);

    selectedTheatres.forEach(t => {
      const daysAhead = 1 + Math.floor(Math.random() * 90);
      const performanceDate = new Date(now);
      performanceDate.setDate(performanceDate.getDate() + daysAhead);
      performanceDate.setHours(Math.random() > 0.5 ? 19 : 20, Math.random() > 0.5 ? 0 : 30, 0, 0);

      const dateStr = performanceDate.toISOString().slice(0, 19).replace('T', ' ');
      const ticketUrl = `https://tickets.example.com/${i}`;

      const showInfo = {
        title: perf.title,
        description: perf.description,
        genre: perf.genre,
        date_time: dateStr,
        ticket_url: ticketUrl,
        image_url: '',
        source_url: '',
      };

      const showId = buildShowStableId(showInfo, t.stable_id);
      const contentHash = buildShowContentHash(showInfo);

      showDocs.push({
        _id: showId,
        id: showId,
        show_id: showId,
        title: perf.title,
        description: perf.description,
        genre: perf.genre,
        date_time: dateStr,
        theatre_id: t.stable_id,
        theatre_name: t.name,
        theatre_city: t.city,
        theatre_address: t.address,
        theatre_province: t.province,
        ticket_url: ticketUrl,
        image_url: '',
        source_event_id: '',
        source_url: '',
        content_hash: contentHash,
        status: 'active',
        removed: false,
        removed_when: null,
        missing_since: null,
        missing_count: 0,
        first_seen_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        updated_at: now.toISOString()
      });
    });
  });

  const uniqueShowDocs = [];
  const seenShowIds = new Set();
  for (const doc of showDocs) {
    if (!seenShowIds.has(doc._id)) {
      seenShowIds.add(doc._id);
      uniqueShowDocs.push(doc);
    }
  }

  if (uniqueShowDocs.length > 0) {
    await collections.shows.insertMany(uniqueShowDocs);
    console.log(`✅ Inserted ${uniqueShowDocs.length} shows to Mongo`);
  }

  // Users
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  const demoPassword = await bcrypt.hash('welkom123', salt);
  const demoUsers = [
    { email: 'lisa@example.com', name: 'Lisa de Vries', city: 'Amsterdam', bio: 'Theaterliefhebber en opera-fan. Altijd op zoek naar de mooiste voorstellingen!' },
    { email: 'mark@example.com', name: 'Mark Jansen', city: 'Rotterdam', bio: 'Musical-addict en cabaretfan. Samen naar het theater is leuker!' },
    { email: 'sophie@example.com', name: 'Sophie Bakker', city: 'Utrecht', bio: 'Danser en theatermaker. Ik ga naar alles wat beweegt op het podium.' },
    { email: 'jan@example.com', name: 'Jan van den Berg', city: 'Den Haag', bio: 'Gepensioneerd docent, nu fulltime theaterganger. Classica en modern toneel.' },
    { email: 'eva@example.com', name: 'Eva Mulder', city: 'Groningen', bio: 'Student en cultuurliefhebber. Comedy en cabaret zijn mijn guilty pleasures.' },
  ];

  const userIds = [];
  for (const u of demoUsers) {
    const res = await pgPool.query(
      'INSERT INTO users (email, password_hash, name, city, bio) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [u.email, demoPassword, u.name, u.city, u.bio]
    );
    userIds.push(res.rows[0].id);
  }

  // Friendships
  await pgPool.query("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES ($1, $2, 'accepted')", [userIds[0], userIds[1]]);
  await pgPool.query("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES ($1, $2, 'accepted')", [userIds[0], userIds[2]]);
  await pgPool.query("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES ($1, $2, 'accepted')", [userIds[1], userIds[3]]);
  await pgPool.query("INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES ($1, $2, 'pending')", [userIds[4], userIds[0]]);

  // Attendance
  for (let i = 0; i < userIds.length; i++) {
    const numAttending = 2 + Math.floor(Math.random() * 4);
    const shuffledShows = [...showDocs].sort(() => Math.random() - 0.5);
    for (let j = 0; j < numAttending && j < shuffledShows.length; j++) {
      const show = shuffledShows[j];
      await pgPool.query(
        `INSERT INTO attendance (
          user_id, show_id, title_snapshot, date_time_snapshot,
          theatre_name_snapshot, theatre_city_snapshot
         )
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [
          userIds[i],
          show.show_id,
          show.title,
          show.date_time,
          show.theatre_name,
          show.theatre_city
        ]
      );
    }
  }

  console.log('✅ Demo data seeded successfully for Split DB.');
  console.log('📧 Demo login: lisa@example.com / welkom123');
}
