#!/usr/bin/env node
/**
 * update-theatres.js
 *
 * Fetches all Dutch theatres from OpenStreetMap via the Overpass API,
 * enriches the results with province data, diffs against the existing
 * dutch_theatres.json, and overwrites it with the latest data.
 *
 * Usage:
 *   node scripts/update-theatres.js
 *
 * No extra npm packages required — uses only Node.js built-ins (node 18+).
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OUTPUT_FILE = path.resolve(__dirname, '..', 'Podium App', 'server', 'dutch_theatres.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// ---------------------------------------------------------------------------
// Overpass query — fetches all amenity=theatre nodes/ways/relations in NL
// ---------------------------------------------------------------------------

const OVERPASS_QUERY = `
[out:json][timeout:90];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
(
  node["amenity"="theatre"](area.nl);
  way["amenity"="theatre"](area.nl);
  relation["amenity"="theatre"](area.nl);
);
out center tags;
`;

// ---------------------------------------------------------------------------
// City → Province lookup (all 12 Dutch provinces + Caribisch Nederland)
// ---------------------------------------------------------------------------

const CITY_TO_PROVINCE = {
  // Noord-Holland
  Amsterdam: 'Noord-Holland', Haarlem: 'Noord-Holland', Alkmaar: 'Noord-Holland',
  Zaandam: 'Noord-Holland', Amstelveen: 'Noord-Holland', Hilversum: 'Noord-Holland',
  Purmerend: 'Noord-Holland', Hoorn: 'Noord-Holland', Enkhuizen: 'Noord-Holland',
  Beverwijk: 'Noord-Holland', 'Den Helder': 'Noord-Holland', Heerhugowaard: 'Noord-Holland',
  Naarden: 'Noord-Holland', Bussum: 'Noord-Holland', Weesp: 'Noord-Holland',
  Diemen: 'Noord-Holland', Badhoevedorp: 'Noord-Holland', Aalsmeer: 'Noord-Holland',
  Ankeveen: 'Noord-Holland', Blaricum: 'Noord-Holland', Bovenkarspel: 'Noord-Holland',
  'Den Oever': 'Noord-Holland', Hoofddorp: 'Noord-Holland', Huizen: 'Noord-Holland',
  IJmuiden: 'Noord-Holland', Overveen: 'Noord-Holland', 'Santpoort-Noord': 'Noord-Holland',
  Schagen: 'Noord-Holland', Spanbroek: 'Noord-Holland',
  // Zuid-Holland
  Rotterdam: 'Zuid-Holland', Delft: 'Zuid-Holland', Leiden: 'Zuid-Holland',
  Dordrecht: 'Zuid-Holland', Zoetermeer: 'Zuid-Holland', Gouda: 'Zuid-Holland',
  'Alphen aan den Rijn': 'Zuid-Holland', Schiedam: 'Zuid-Holland',
  Spijkenisse: 'Zuid-Holland', Vlaardingen: 'Zuid-Holland', Waddinxveen: 'Zuid-Holland',
  Voorschoten: 'Zuid-Holland', Wassenaar: 'Zuid-Holland', Ridderkerk: 'Zuid-Holland',
  'Capelle aan den IJssel': 'Zuid-Holland', Voorburg: 'Zuid-Holland',
  Rijswijk: 'Zuid-Holland', Katwijk: 'Zuid-Holland', Barendrecht: 'Zuid-Holland',
  "'s-Gravenhage": 'Zuid-Holland', 'Den Haag': 'Zuid-Holland', Noordwijk: 'Zuid-Holland',
  Boskoop: 'Zuid-Holland', Leerdam: 'Zuid-Holland', Leidschendam: 'Zuid-Holland',
  Maassluis: 'Zuid-Holland', Naaldwijk: 'Zuid-Holland', 'Nieuwerbrug aan den Rijn': 'Zuid-Holland',
  Nootdorp: 'Zuid-Holland', Ouddorp: 'Zuid-Holland', Rozenburg: 'Zuid-Holland',
  Schoonhoven: 'Zuid-Holland',
  // Utrecht
  Utrecht: 'Utrecht', Amersfoort: 'Utrecht', Zeist: 'Utrecht',
  Nieuwegein: 'Utrecht', Veenendaal: 'Utrecht', 'Wijk bij Duurstede': 'Utrecht',
  IJsselstein: 'Utrecht', Houten: 'Utrecht', Soest: 'Utrecht',
  Woerden: 'Utrecht', 'De Bilt': 'Utrecht', Bilthoven: 'Utrecht', Achterveld: 'Utrecht',
  Austerlitz: 'Utrecht', Baarn: 'Utrecht', 'De Meern': 'Utrecht',
  Eemnes: 'Utrecht', Leusden: 'Utrecht', Renswoude: 'Utrecht',
  // Noord-Brabant
  Eindhoven: 'Noord-Brabant', Tilburg: 'Noord-Brabant', Breda: 'Noord-Brabant',
  "'s-Hertogenbosch": 'Noord-Brabant', Helmond: 'Noord-Brabant', Oss: 'Noord-Brabant',
  'Bergen op Zoom': 'Noord-Brabant', Roosendaal: 'Noord-Brabant',
  Waalwijk: 'Noord-Brabant', Vught: 'Noord-Brabant', Veghel: 'Noord-Brabant',
  Veldhoven: 'Noord-Brabant', Zundert: 'Noord-Brabant', Boxtel: 'Noord-Brabant',
  Cuijk: 'Noord-Brabant', Schijndel: 'Noord-Brabant', Bakel: 'Noord-Brabant',
  'Beek en Donk': 'Noord-Brabant', Bergeijk: 'Noord-Brabant', 'Berkel-Enschot': 'Noord-Brabant',
  Best: 'Noord-Brabant', Eersel: 'Noord-Brabant', Gemert: 'Noord-Brabant',
  Handel: 'Noord-Brabant', Haps: 'Noord-Brabant', 'Heeswijk-Dinther': 'Noord-Brabant',
  Heeze: 'Noord-Brabant', Kaatsheuvel: 'Noord-Brabant', Maarheeze: 'Noord-Brabant',
  Mariahout: 'Noord-Brabant', Nispen: 'Noord-Brabant', Nuenen: 'Noord-Brabant',
  Oisterwijk: 'Noord-Brabant', Oosterhout: 'Noord-Brabant', Oudenbosch: 'Noord-Brabant',
  Rijen: 'Noord-Brabant', Rosmalen: 'Noord-Brabant', 'Sint-Oedenrode': 'Noord-Brabant',
  Someren: 'Noord-Brabant', 'Son en Breugel': 'Noord-Brabant', Uden: 'Noord-Brabant',
  Alphen: 'Noord-Brabant',
  // Gelderland
  Arnhem: 'Gelderland', Nijmegen: 'Gelderland', Apeldoorn: 'Gelderland',
  Doetinchem: 'Gelderland', Harderwijk: 'Gelderland', Ede: 'Gelderland',
  Zutphen: 'Gelderland', Tiel: 'Gelderland', Zelhem: 'Gelderland',
  Winterswijk: 'Gelderland', Beuningen: 'Gelderland', Wageningen: 'Gelderland',
  Doesburg: 'Gelderland', Huissen: 'Gelderland', Culemborg: 'Gelderland',
  Druten: 'Gelderland', Eefde: 'Gelderland', Eibergen: 'Gelderland',
  Elst: 'Gelderland', Gennep: 'Gelderland', Lent: 'Gelderland',
  Lochem: 'Gelderland', Nunspeet: 'Gelderland', Oldebroek: 'Gelderland',
  Silvolde: 'Gelderland',
  // Groningen
  Groningen: 'Groningen', Winschoten: 'Groningen', Winsum: 'Groningen',
  Warffum: 'Groningen', Delfzijl: 'Groningen', Veendam: 'Groningen',
  Appingedam: 'Groningen', 'Den Andel': 'Groningen', Hoogezand: 'Groningen',
  Leek: 'Groningen', Stadskanaal: 'Groningen', Rottum: 'Groningen',
  // Limburg
  Maastricht: 'Limburg', Venlo: 'Limburg', Sittard: 'Limburg',
  Heerlen: 'Limburg', Roermond: 'Limburg', Weert: 'Limburg',
  Venray: 'Limburg', Valkenburg: 'Limburg', Geleen: 'Limburg',
  Beek: 'Limburg', Bocholtz: 'Limburg', Panningen: 'Limburg',
  Reuver: 'Limburg', Tegelen: 'Limburg',
  // Overijssel
  Enschede: 'Overijssel', Zwolle: 'Overijssel', Deventer: 'Overijssel',
  Almelo: 'Overijssel', Hengelo: 'Overijssel', Kampen: 'Overijssel',
  Oldenzaal: 'Overijssel', Borne: 'Overijssel', Dalfsen: 'Overijssel',
  Lemelerveld: 'Overijssel', Losser: 'Overijssel', Okkenbroek: 'Overijssel',
  Ommen: 'Overijssel', Rijssen: 'Overijssel', Steenwijk: 'Overijssel',
  Heino: 'Overijssel',
  // Friesland
  Leeuwarden: 'Friesland', Sneek: 'Friesland', Heerenveen: 'Friesland',
  Harlingen: 'Friesland', Franeker: 'Friesland', Drachten: 'Friesland',
  // Drenthe
  Assen: 'Drenthe', Emmen: 'Drenthe', Hoogeveen: 'Drenthe',
  Meppel: 'Drenthe', Coevorden: 'Drenthe', Anloo: 'Drenthe',
  Beilen: 'Drenthe', Borger: 'Drenthe', Bunne: 'Drenthe',
  Diever: 'Drenthe', Ekehaar: 'Drenthe', Rolde: 'Drenthe',
  Roden: 'Drenthe', Roswinkel: 'Drenthe', Ruinen: 'Drenthe',
  // Zeeland
  Middelburg: 'Zeeland', Vlissingen: 'Zeeland', Goes: 'Zeeland',
  Terneuzen: 'Zeeland', Hulst: 'Zeeland', Yerseke: 'Zeeland',
  'Nieuw- en Sint Joosland': 'Zeeland',
  // Flevoland
  Lelystad: 'Flevoland', Almere: 'Flevoland', Dronten: 'Flevoland',
  Emmeloord: 'Flevoland',
  // Caribisch Nederland
  Oranjestad: 'Caribisch Nederland', Otrobanda: 'Caribisch Nederland',
  'Seru di Otrobanda': 'Caribisch Nederland',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} — server-side issue`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      log(`⚠️  Attempt ${attempt} failed: ${err.message}. Retrying in ${RETRY_DELAY_MS / 1000}s…`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

function enrichProvince(city) {
  return CITY_TO_PROVINCE[city] || 'Onbekend';
}

function normaliseTheatre(el) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;
  const city = tags['addr:city'] || tags['addr:place'] || '';
  const name = tags.name || tags['name:nl'] || '';

  return {
    name,
    city,
    address: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
    province: enrichProvince(city),
    website: tags.website || tags['contact:website'] || '',
    phone: tags.phone || tags['contact:phone'] || '',
    image_url: '',
    description: tags.description || tags['description:nl'] || '',
    latitude: lat,
    longitude: lon,
    osm_type: el.type,
    osm_id: el.id,
  };
}

function diffTheatres(previous, current) {
  const prevByOsmId = new Map(previous.map(t => [`${t.osm_type}/${t.osm_id}`, t]));
  const currByOsmId = new Map(current.map(t => [`${t.osm_type}/${t.osm_id}`, t]));

  const added = current.filter(t => !prevByOsmId.has(`${t.osm_type}/${t.osm_id}`));
  const removed = previous.filter(t => !currByOsmId.has(`${t.osm_type}/${t.osm_id}`));
  const changed = current.filter(t => {
    const key = `${t.osm_type}/${t.osm_id}`;
    const prev = prevByOsmId.get(key);
    if (!prev) return false;
    return JSON.stringify(prev) !== JSON.stringify(t);
  });

  return { added, removed, changed };
}

function nameCityKey(theatre) {
  return `${(theatre.name || '').toLowerCase()}|${(theatre.city || '').toLowerCase()}`;
}

function preserveTheatreMetadata(theatres, previous, importedAt) {
  const previousByOsmId = new Map(previous.map(t => [`${t.osm_type}/${t.osm_id}`, t]));
  const previousByNameCity = new Map(previous.map(t => [nameCityKey(t), t]));

  return theatres.map(theatre => {
    const previousTheatre = previousByOsmId.get(`${theatre.osm_type}/${theatre.osm_id}`)
      || previousByNameCity.get(nameCityKey(theatre));

    const metadata = {
      openstreetmap_imported_at: previousTheatre?.openstreetmap_imported_at || importedAt,
      last_events_scraped_at: previousTheatre?.last_events_scraped_at || null,
    };

    if (!previousTheatre?.blacklisted) {
      return {
        ...theatre,
        ...metadata,
      };
    }

    return {
      ...theatre,
      ...metadata,
      blacklisted: true,
      blacklist_reason: previousTheatre.blacklist_reason || 'Blacklisted from seeding.',
    };
  });
}

function printSummaryTable(theatres) {
  const byProvince = {};
  theatres.forEach(t => { byProvince[t.province] = (byProvince[t.province] || 0) + 1; });
  const rows = Object.entries(byProvince).sort((a, b) => b[1] - a[1]);
  console.log('\n  Province breakdown:');
  rows.forEach(([province, count]) => {
    const bar = '█'.repeat(Math.round(count / 5));
    console.log(`    ${province.padEnd(22)} ${String(count).padStart(3)}  ${bar}`);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🎭  Podium Theatre Updater');
  console.log('─'.repeat(50));
  log('Starting update…\n');
  const importedAt = new Date().toISOString();

  // 1. Load existing data for diffing
  let previousData = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      previousData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      log(`📂 Loaded existing file: ${previousData.length} theatres`);
    } catch {
      log('⚠️  Could not parse existing file — will treat as empty');
    }
  } else {
    log('📂 No existing file found — this will be a fresh import');
  }

  // 2. Fetch from Overpass API
  log('🌍 Querying OpenStreetMap Overpass API…');
  const res = await fetchWithRetry(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PodiumApp/1.0 (Dutch theatre data updater; educational project)',
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });

  const json = await res.json();
  log(`✅ Received ${json.elements.length} raw OSM elements`);

  // 3. Normalise + filter
  const theatres = preserveTheatreMetadata(json.elements
    .map(normaliseTheatre)
    .filter(t => t.name && t.city)        // must have name AND city
    .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)), previousData, importedAt);

  log(`🏛️  ${theatres.length} theatres after filtering (name + city required)`);

  // 4. Province coverage report
  const unknown = theatres.filter(t => t.province === 'Onbekend');
  if (unknown.length > 0) {
    log(`⚠️  ${unknown.length} theatres with unknown province:`);
    const unknownCities = [...new Set(unknown.map(t => t.city))].sort();
    console.log('     Cities:', unknownCities.join(', '));
  } else {
    log('✅ All theatres have a recognised province');
  }

  // 5. Diff against previous
  if (previousData.length > 0) {
    const { added, removed, changed } = diffTheatres(previousData, theatres);
    console.log('\n  Changes since last run:');
    console.log(`    ➕ Added   : ${added.length}`);
    console.log(`    ➖ Removed : ${removed.length}`);
    console.log(`    ✏️  Changed : ${changed.length}`);

    if (added.length > 0 && added.length <= 20) {
      console.log('\n  New theatres:');
      added.forEach(t => console.log(`    + ${t.name} — ${t.city} (${t.province})`));
    }
    if (removed.length > 0 && removed.length <= 20) {
      console.log('\n  Removed theatres:');
      removed.forEach(t => console.log(`    - ${t.name} — ${t.city}`));
    }
  }

  // 6. Print province breakdown
  printSummaryTable(theatres);

  // 7. Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(theatres, null, 2), 'utf8');
  console.log('');
  log(`💾 Written ${theatres.length} theatres → ${OUTPUT_FILE}`);
  log('✅ Update complete!\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
