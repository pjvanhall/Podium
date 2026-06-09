const { queryOne, runSql, queryAll } = require('./db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function seedDatabase() {
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


  // Insert all theatres — OSM fields like osm_id/phone are ignored; we only write what the schema defines.
  const theatreIds: Record<string, number> = {};
  theatres.forEach((t: any) => {
    const id = runSql(
      `INSERT INTO theatres (name, city, address, province, website, description, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [t.name, t.city, t.address, t.province, t.website || '', t.description || '', t.latitude, t.longitude]
    );
    theatreIds[t.name] = id;
  });
  console.log(`✅ Inserted ${theatres.length} theatres`);



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

      runSql(
        `INSERT INTO performances (title, description, genre, date_time, theatre_id, ticket_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          perf.title,
          perf.description,
          perf.genre,
          dateStr,
          theatreIds[theatreName],
          `https://tickets.example.com/${i}`
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
      runSql(
        'INSERT OR IGNORE INTO attendance (user_id, performance_id) VALUES (?, ?)',
        [userIds[i], shuffledPerfs[j].id]
      );
    }
  }

  console.log(`✅ Seeded: ${theatres.length} theaters, ${performanceTemplates.length * 3} voorstellingen, ${demoUsers.length} gebruikers`);
  console.log('📧 Demo login: lisa@example.com / welkom123');
}

module.exports = { seedDatabase };
