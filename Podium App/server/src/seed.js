const { queryOne, runSql, queryAll } = require('./db');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  // Check if already seeded
  const theatreCount = queryOne('SELECT COUNT(*) as count FROM theatres');
  if (theatreCount && theatreCount.count > 0) {
    console.log('Database already seeded, skipping...');
    return;
  }

  console.log('🎭 Seeding database with Dutch theatres and performances...');

  // ========== THEATRES ==========
  const theatres = [
    {
      name: 'Koninklijk Theater Carré',
      city: 'Amsterdam',
      address: 'Amstel 115-125, 1018 EM Amsterdam',
      province: 'Noord-Holland',
      website: 'https://www.carre.nl',
      description: 'Een van de beroemdste theaters van Nederland, gelegen aan de Amstel. Bekend om musicals, cabaret en circusvoorstellingen.',
      latitude: 52.3628, longitude: 4.9046
    },
    {
      name: 'Nationale Opera & Ballet',
      city: 'Amsterdam',
      address: 'Amstel 3, 1011 PN Amsterdam',
      province: 'Noord-Holland',
      website: 'https://www.operaballet.nl',
      description: 'Het onderkomen van de Nationale Opera en Het Nationale Ballet aan het Waterlooplein.',
      latitude: 52.3667, longitude: 4.9025
    },
    {
      name: 'Internationaal Theater Amsterdam',
      city: 'Amsterdam',
      address: 'Leidseplein 26, 1017 PT Amsterdam',
      province: 'Noord-Holland',
      website: 'https://ita.nl',
      description: 'Voorheen Stadsschouwburg Amsterdam, een toonaangevend toneel- en danstheater.',
      latitude: 52.3641, longitude: 4.8828
    },
    {
      name: 'AFAS Live',
      city: 'Amsterdam',
      address: 'ArenA Boulevard 590, 1101 DS Amsterdam',
      province: 'Noord-Holland',
      website: 'https://www.afaslive.nl',
      description: 'De grootste zaalaccommodatie van Amsterdam voor muziek, comedy en shows.',
      latitude: 52.3133, longitude: 4.9396
    },
    {
      name: 'Het Nationale Theater',
      city: 'Den Haag',
      address: 'Schedeldoekshaven 60, 2511 EN Den Haag',
      province: 'Zuid-Holland',
      website: 'https://www.hnt.nl',
      description: 'Het grootste repertoiretheater van Nederland met een breed programma.',
      latitude: 52.0799, longitude: 4.3210
    },
    {
      name: 'Theater Rotterdam (Schouwburg)',
      city: 'Rotterdam',
      address: 'Schouwburgplein 25, 3012 CL Rotterdam',
      province: 'Zuid-Holland',
      website: 'https://www.theaterrotterdam.nl',
      description: 'Het belangrijkste theater van Rotterdam voor toneel, dans en muziektheater.',
      latitude: 52.9225, longitude: 4.4740
    },
    {
      name: 'Stadsschouwburg Utrecht',
      city: 'Utrecht',
      address: 'Lucas Bolwerk 24, 3512 EJ Utrecht',
      province: 'Utrecht',
      website: 'https://www.stadsschouwburg-utrecht.nl',
      description: 'Monumentaal theater in het hart van Utrecht met een divers programmaaanbod.',
      latitude: 52.0944, longitude: 5.1102
    },
    {
      name: 'Parktheater Eindhoven',
      city: 'Eindhoven',
      address: 'Elzentlaan 50, 5611 AH Eindhoven',
      province: 'Noord-Brabant',
      website: 'https://www.parktheater.nl',
      description: 'Het grootste theatercomplex van Zuid-Nederland met vier zalen.',
      latitude: 51.4356, longitude: 5.4809
    },
    {
      name: 'De Harmonie',
      city: 'Leeuwarden',
      address: 'Ruiterskwartier 4, 8911 BP Leeuwarden',
      province: 'Friesland',
      website: 'https://www.harmonie.nl',
      description: 'Het schouwburg- en congrescentrum van Leeuwarden.',
      latitude: 53.2014, longitude: 5.7936
    },
    {
      name: 'Theaters Tilburg',
      city: 'Tilburg',
      address: 'Louis Bouwmeesterplein 1, 5038 TN Tilburg',
      province: 'Noord-Brabant',
      website: 'https://www.theaterstilburg.nl',
      description: 'Het theater voor podiumkunsten in het hart van Tilburg.',
      latitude: 51.5563, longitude: 5.0845
    },
    {
      name: 'Chassé Theater',
      city: 'Breda',
      address: 'Claudius Prinsenlaan 8, 4811 DK Breda',
      province: 'Noord-Brabant',
      website: 'https://www.chassetheater.nl',
      description: 'Een modern theater met drie zalen in het centrum van Breda.',
      latitude: 51.5865, longitude: 4.7752
    },
    {
      name: 'Schouwburg Arnhem',
      city: 'Arnhem',
      address: 'Koningstraat 42, 6811 DG Arnhem',
      province: 'Gelderland',
      website: 'https://www.schouwburgarnhem.nl',
      description: 'Het stadstheater van Arnhem met een rijke geschiedenis.',
      latitude: 51.9844, longitude: 5.9082
    },
    {
      name: 'Wilminktheater & Muziekcentrum Enschede',
      city: 'Enschede',
      address: 'Zuiderhagen 41, 7511 GD Enschede',
      province: 'Overijssel',
      website: 'https://www.wilminktheater.nl',
      description: 'Het belangrijkste theater en muziekcentrum van Twente.',
      latitude: 52.2192, longitude: 6.8965
    },
    {
      name: 'De Oosterpoort',
      city: 'Groningen',
      address: 'Trompsingel 27, 9711 EC Groningen',
      province: 'Groningen',
      website: 'https://www.de-oosterpoort.nl',
      description: 'Pop- en theaterpodium in het centrum van Groningen.',
      latitude: 53.2153, longitude: 6.5726
    },
    {
      name: 'Theater aan het Vrijthof',
      city: 'Maastricht',
      address: 'Vrijthof 47, 6211 LE Maastricht',
      province: 'Limburg',
      website: 'https://www.theateraanhetvrijthof.nl',
      description: 'Sfeervolle schouwburg aan het beroemde Vrijthof in Maastricht.',
      latitude: 50.8492, longitude: 5.6890
    }
  ];

  const theatreIds = {};
  theatres.forEach(t => {
    const id = runSql(
      `INSERT INTO theatres (name, city, address, province, website, description, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [t.name, t.city, t.address, t.province, t.website, t.description, t.latitude, t.longitude]
    );
    theatreIds[t.name] = id;
  });

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
