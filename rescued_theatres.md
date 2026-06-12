# Rescued Theatres

Source queue: `Podium App/server/scraper_report.json` zero-count theatres from the current report.


## Current Workflow
1. Pick a theatre from the **Pending rescue queue** below.
2. Visit the theatre's website and locate their agenda/programme page.
3. Check the HTML source and network tab to identify how they serve their events (e.g. JSON API, TicketUnie, JSON-LD, custom HTML).
4. Run `node scripts/scrape-shows.js --theatre "Theatre Name" --verbose` to diagnose what the current scraper sees.
5. If the layout is unsupported, write a custom extraction rule in `scripts/scrape-shows.js` (in one of the fallback parsers like `extractAgendaListingEvents`, `extractFromApiData`, or add a specific adapter).
6. Verify the fix by running the scraper again to ensure events are successfully scraped.
7. Update this document: Move the theatre from **Pending rescue queue** to **Verified rescues**, detailing the number of shows and the specific fix applied.
8. If a venue cannot be rescued (e.g. site is dead, no public agenda, or cannot be scraped), it should be blacklisted:\n   - Set lacklisted: true and provide a lacklist_reason in Podium App/server/dutch_theatres.json\n   - Move it from **Pending rescue queue** to the **Blacklisted from seeding** table at the bottom of this document, noting the reason.

## Verified rescues

| Theatre | Shows rescued | Fix |
| --- | ---: | --- |
| Calypso Theater | 85 | Fixed by extracting data from the dynamically loaded TicketUnie widget (`fetchTicketUnieEvents` supports `.activity-item` layouts and pagination, with improved date rollover). |
| City of Wesopa | 82 | Automatically rescued by the improved `fetchTicketUnieEvents` parser added for Calypso Theater, which successfully paginated through 4 pages of the widget. |
| Cool kunst en cultuur | 298 | Automatically rescued by the improved etchTicketUnieEvents parser which successfully paginated through 10 pages of the widget. |
| Cultureel Centrum de Boodschap | 47 | Automatically rescued by routing the scraper to their iframe ticket shop (https://tickets.ccgr.nl/) instead of the main agenda page, allowing the default ActiveTickets detail parser to crawl the shows. |
| Cultuurschip Thor | 1 | Forced scraper to use https://cultuurschipthor.nl/agenda/ as the listing page and wrote a custom inline parser to read .pageheader-concert-featured blocks because its default DUTCH_DATE_RE anchor text crawler failed to match the structure. |
| De Buurvrouw | 29 | The theatre changed their domain from .nl to .org. Updated the dutch_theatres.json configuration with the new domain https://buurvrouwrotterdam.org/, allowing the default jsonld detail page scraper to successfully extract all shows. |
| De Eendracht | 43 | The default agenda page was defaulting to a 500 error page (/programma/). Forced siteSpecificAgendaUrl to use the root domain / which successfully exposed all detail links. The default detail text scraper handled the rest successfully. |
| De Flits Microtheater | 1 | Discovered that their agenda is loaded via a weticket iframe. Configured siteSpecificAgendaUrl to point directly to https://microtheaterdeflits.weticket.com/ and built a custom inline_weticket parser that correctly identifies the single unique event (resolving an issue where the generic detail parser would extract redundant times for the same event). |
| Club Wicked | 6 | Redirected the default scraper URL to /shows, and added a custom inline .show-card extraction rule that parses the event dates directly out of the weeztix.com ticket query parameters. |
| Vestzaktheater | 54 | Automatically rescued due to improved redirect extraction (redirects to Concordia). |
| Circus Hakim | 9 | Fixed API interception by tuning the Puppeteer network noise filter, allowing the background `eventscalendar.co` JSON API requests to be intercepted and parsed as Google Calendar events. |
| Nieuwe Kerk | 75 | Added inline agenda-card extraction for anchors containing Dutch date text and titles; this captures the theatre-owned agenda entries whose ticket/detail URLs point to `amare.nl`. |
| Theater en Filmhuis Dakota | 55 | Added a detail-page program-row parser for `.program-line` date spans (`daynum`, `month`, `time`) and adjacent ticket links. |
| Theater De Regentes | 23 | Corrected theatre URL now reaches the live agenda; the existing detail-page JSON-LD extraction finds upcoming events from the agenda detail links, so the seeding blacklist was removed. |
| Zaal 3 | 66 | Updated detail-link filtering to use the rendered final URL host after redirects, allowing `zaal3.nl` to scrape its redirected `hnt.nl` programme links. |
| Pietepaf | 10 | Added a bounded Dutch recurring-schedule parser for pages with date ranges like `11 April t/m 5 juli`, weekly day rules, showtimes, and `M.U.V.` exception dates. |
| Willem Twee Concertzaal | 20 | Added compact no-year Dutch agenda-card parsing (`za 13 jun. - 20:30`) and routed this venue to Willem Twee's `toonzaal` agenda section. |
| Puncher Comedy Club | 17 | Added city-aware agenda-link scoring so the Alkmaar theatre row selects `/alkmaar/shows/` instead of the first Haarlem shows link. |
| Podium De Meester | 20 | Benefited from redirect-aware detail-link filtering; the agenda resolves to `poppodiumdemeester.nl`, so rendered-host filtering now keeps and parses the show pages. |
| Amsterdams Marionetten Theater | 11 | Added plain-text agenda extraction for pages listing rows like `wo. 17 juni 20.30 Underground Cinema`, and prevented recent past no-year dates from rolling into next year. |
| Astaro Theatro | 1 | Added a conservative homepage article fallback for blog-style programme sites where an article title plus body date is the only upcoming-event signal. |
| Boom Chicago | 109 | Added a FareHarbor detail fallback that reads each show page's primary booking CTA, queries bookability dates, and uses explicit English page dates for one-off shows. |
| De Sloot | 21 | Benefited from the inline/plain-text agenda parsers, which can now read dated rows directly from the rendered agenda page without detail-page JSON-LD. |
| Likeminds | 2 | Boosted exact `/agenda` links over production archives and added a narrow Voordemensen ticket-page parser for English date rows. |
| Mascini | 42 | Benefited from the inline agenda-card parser, which extracts dated rows directly from the rendered Mascini programme page. |
| OCCII | 6 | Expanded agenda discovery for English `Program`/`events` links so OCCII uses `/events/` instead of the thin `/agenda/` page. |
| Stichting Theaterstraat | 5 | Extended plain-text agenda parsing to Dutch rows with explicit year and dash time, e.g. `18 juni 2026 - 15:30 uur`. |
| Teatro Munganga | 5 | Benefited from the homepage article and inline agenda fallback paths, which detect dated programme entries without JSON-LD. |
| Theater Amsterdam | 7 | Benefited from expanded HTML detail-date parsing; also tightened `--theatre` filtering to prefer exact-name matches and avoid matching ITA. |
| Theater De Richel | 10 | Added rendered card text parsing for listing cards where the title precedes a compact Dutch date like `wo 10 jun`. |
| VU Griffioen | 24 | Added API embedded-HTML extraction and support for rows like `di 09 jun. 2026- 20.00 uur` inside JSON payloads. |
| Zaal 100 | 19 | Added compact numeric agenda-row parsing for anchors like `di0906 21:00 € 5,00 Jazzcafé!`. |
| Arto Theater | 98 | Re-ran standard scraper; successfully crawled detail links and extracted shows automatically. |
| 't Raodhoes | 13 | Updated database URL. Added a generic parser for "The Events Calendar" (`.type-tribe_events`) to `scrape-shows.js` to extract dates from inline WordPress cards. |
| 't Mosterdzaadje | 0 | Implemented custom dropdown navigator in `processTheatre` (to load multiple `?cat=` URLs) and custom blog post extractor in `extractAgendaListingEvents` to grab the dates and titles; shows are currently post-dated and correctly ignored. |
| Andledon | 11 | Bypassed PDF auto-detection by hardcoding `/podium/` in `siteSpecificAgendaUrl` and added a custom parser to iterate elements matching dates to preceding elements and extracted exactly 11 shows. |
| De Toneelmakerij | 130 | Fixed a fatal error in the scraper by updating `decodeHtml` to safely handle WordPress REST API objects (like `{ rendered: "Title" }`), successfully extracting 130 shows via API interception. |
| De Hoop | 6 | Fixed by dynamically grabbing the latest season link using Puppeteer page.evaluate, injecting `/concerten/` as the siteSpecificAgendaUrl, and implementing a custom inline_dehoop parser to map their Dutch date descriptions into ISO strings. |
| De Kleine Willem | 515 | Fixed by patching `siteSpecificAgendaUrl` to point to the parent venue's agenda (`https://www.wilminktheater.nl/nl/agenda`), successfully extracting 515 shows (all Wilminktheater venues combined). |
| De Noorderbak | 7 | Fixed by overriding the agenda URL to `https://noorderbak.nl/evenementen` in `siteSpecificAgendaUrl` and creating a custom `inline_noorderbak` parser for their Breakdance builder layout. |
| De Schoenendoos | 2 | Fixed by overriding `siteSpecificAgendaUrl` to use the root URL `https://deschoenendoos.nl/` and writing an `inline_deschoenendoos` parser for its custom inline text elements (`za. 20 juni - David Cornelissen`). |
| De Smeltkroes | 12 | Fixed by creating a custom `inline_desmeltkroes` parser to crawl the product pages for each category (jeugd, cabaret, zondag) and extract date/title pairs from the raw HTML content. |
| De Speeldoos Baarn | 79 | Fixed by overriding `siteSpecificAgendaUrl` to point to `/agenda` directly since the crawler found a specific sub-agenda page first. |
| De Steenakker | 0 | Scraper works correctly but legitimately found 0 upcoming shows as the 2025-2026 season has concluded. |
| De Theaterboerderij | 0 | Scraper works correctly but legitimately found 0 upcoming shows as the agenda contains no active events (only a 404 link). |

## Pending rescue queue

Generated from `node scripts/scrape-shows.js --unscraped` on 2026-06-09T16:44:55.217Z. Known blacklisted theatres are excluded unless `--include-blacklisted` is used.

| Theatre | City | Website | Status | Last attempted | Agenda Link | Paginated? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| De Theaterstraat | Lent | http://www.de-theaterstraat.nl | no shows | 2026-06-09T16:44:55.217Z | ||no https, does not exist|
| De Verhalenboot | Zwolle | https://www.deverhalenboot.nl/ | no shows | 2026-06-09T16:44:55.217Z | https://deverhalenboot.nl/agenda/ |
| De Vorstin | Hilversum | https://www.vorstin.nl | no shows | 2026-06-09T16:44:55.217Z | https://vorstin.nl/agenda/ |
| Domani | Venlo | https://www.domani-venlo.nl | no shows | 2026-06-09T16:44:55.217Z | https://www.domani-venlo.nl/ |
| Energiehuis | Dordrecht | https://www.energiehuis.nl/ | no shows | 2026-06-09T16:44:55.217Z | ||there is no agenda here, energiehuis contains several venues with their own agendas, so you can blacklist enegerhuis as venue |
| ESTV Doppio | Eindhoven | https://doppio.nl/ | no shows | 2026-06-09T16:44:55.217Z | https://www.doppio.nl/tickets/ |
| Etalagetheater | Leeuwarden | http://www.hayebijlstra.nl/ | no shows | 2026-06-09T16:44:55.217Z | https://www.hayebijlstra.nl/theater.html ||the agenda is vert old, you can blacklist this venue|
| Eva's Theatertuin | Nijmegen | https://evastheatertuin.nl/ | no shows | 2026-06-09T16:44:55.217Z | ||you can blacklist this one. the agenda is a jpeg|
| Fazant | Deventer | https://theaterfazant.nl/ | no shows | 2026-06-09T16:44:55.217Z | https://theaterfazant.nl/programma/ |
| Fidei et Arti | Oudenbosch | https://www.fideietarti.nl/ | no shows | 2026-06-09T16:44:55.217Z | https://fideietarti.nl/?page_id=199 |
 | Hal015 | Delft | https://www.hal015.nl/ | no shows | 2026-06-09T16:44:55.217Z |https://www.hal015.nl/tickets/ |
| Haventheater IJmuiden | IJmuiden | https://haventheaterijmuiden.nl/ | no shows | 2026-06-09T16:44:55.217Z |https://haventheaterijmuiden.nl/programma |
| Hedon | Zwolle | https://www.hedon-zwolle.nl/ | no shows | 2026-06-09T16:44:55.217Z | https://www.hedon-zwolle.nl/#programma |
| Het Filiaaltheater | Utrecht | https://www.hetfiliaal.nl/ | no shows | 2026-06-09T16:44:55.217Z | https://hetfiliaal.nl/agenda/ |yes | the events listed are ate different venues, they have their own venue: Filiaaltheater|
| Het Parochiehuis | Bakel | https://www.parochiehuisbakel.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Het Theater | Blaricum | https://hettheater.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Het Verhalenhuis | Zutphen | https://verhalenhuis.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Houten Kaap | Ouddorp | https://houtenkaap.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Imperium | Leiden | https://www.imperiumtheater.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Jansstheater | Lochem | https://www.jansstheater.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Jeugdcircus Santelli | Groningen | https://www.jeugdcircus.nl/cms/index.php | no shows | 2026-06-09T16:44:55.217Z | |
| Kulturhus de Talter | Oldebroek | https://www.detalter.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Musketon Theater | Utrecht | https://www.demusketon.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Muziektheater De Ontmoeting | Rozenburg | https://www.mtdo.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Nationaal Muziekkwartier | Enschede | https://www.muziekkwartier.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Nieuw Capels Toneel | Capelle aan den IJssel | https://nieuwcapelstoneel.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Ons Pakhuus | Silvolde | http://www.onspakhuussilvolde.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Op Maarhuizen | Winsum | https://opmaarhuizen.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Openluchttheater Brilmansdennen | Losser | https://www.openluchttheaterbrilmansdennen.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Openluchttheater Cabrio | Soest | https://www.openluchttheatersoest.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Openluchttheater Kersouwe | Heeswijk-Dinther | https://kersouwe.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Openluchttheater Leek | Leek | https://www.podiumleek.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Party Centrum van Opstal | Tilburg | https://www.partycentrumtilburg.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Podium Bloos | Breda | https://podiumbloos.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Poppentheater Damiët van Dalsum | Dordrecht | https://www.poppentheaterdamiet.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Prinsentheater | Delft | https://www.willemvanoranje.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Rembrandt | Arnhem | https://rembrandtarnhem.com/ | no shows | 2026-06-09T16:44:55.217Z | |
| Rietveld Theater | Delft | https://www.rietveldtheater.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Springintheater | Utrecht | https://www.springintheater.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Stadsklooster | Utrecht | https://stadskloosterutrecht.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Studio MAPA | Haarlem | https://www.mapa.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater aan de Slag | Culemborg | http://theateraandeslag.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater CulturA | Nootdorp | https://www.theatercultura.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Theater De Kik | Elst | https://theaterdekik.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater de Leeuw | Arnhem | https://theaterdeleeuw.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater de Liefde | Haarlem | https://theaterdeliefde.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater De Muze | Noordwijk | https://www.demuzenoordwijk.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater de Schelleboom | Oosterhout | https://www.deschelleboom.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater De Spiegel | Zwolle | https://www.zwolsetheaters.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Theater de Stoomfabriek | Dalfsen | https://www.theaterdestoomfabriek.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Theater De Wegwijzer | Nieuw- en Sint Joosland | https://www.theaterdewegwijzer.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater de Winsinghhof | Roden | https://www.theaterdewinsinghhof.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Theater Elswout | Overveen | https://www.theaterelswout.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater Harderwijk | Harderwijk | https://www.theaterharderwijk.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater Norman De Palm | Seru di Otrobanda | https://keizershofcuracao.com/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater Schuurkerkje | Maassluis | http://www.schuurkerkje.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theater Sonnevanck | Enschede | https://www.sonnevanck.nl | no shows | 2026-06-09T16:44:55.217Z | |
| TheaterHangaar | Valkenburg | https://www.theaterhangaar.nl | no shows | 2026-06-09T16:44:55.217Z | |
| Theaterhuis de Berenkuil | Utrecht | https://www.deberenkuil.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theaterkerk Wadway | Spanbroek | https://www.theaterkerkwadway.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Theather Posa | Lelystad | https://www.theaterposa.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| TivoliVredenburg | Utrecht | https://www.tivolivredenburg.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Toon Hermans Theater | Sittard | https://www.toonhermanstheater.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Verhalenhuis Haarlem | Haarlem | https://www.verhalenhuishaarlem.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Willem Hendrik Zwart Hal | Lemelerveld | https://www.huetink-royalmusic.nl/ | no shows | 2026-06-09T16:44:55.217Z | |
| Wresinski theater | Zwolle | https://www.wresinskicultuur.nl | no shows | 2026-06-09T16:44:55.217Z | |

## Blacklisted from seeding

These theatres remain in `dutch_theatres.json` with `blacklisted: true` and a `blacklist_reason`, so the seed script skips them.

| Theatre | Reason |
| --- | --- |
| De Glazen Zaal | Venue information/rental site only; no public agenda or programme links, and common agenda paths return 404. |
| Tasty Comedy | HTTPS certificate hostname mismatch and HTTP response contains no usable event content. |
| Event Centre Aalsmeer / Crown theater Aalsmeer | Current site appears to be a spam/SEO shell with no theatre agenda or event content. |
| Roy's Magic Theater | Redirects to a performer/booking site with no public dated show listings. |
| Theater De Drukkerij | Agenda currently exposes only past events as of 2026-06-09; no future shows available to seed. |
| De Improvisatie Studio | Site has no trusted certificate, unsafe to crawl. |
| Clifford Studio | Agenda/news page does not expose public future event listings or parseable dates. |
| de Tanker | Reservation shell with no links, agenda, or event markup. |
| De Toverknol | Programme gives broad date ranges and times but no exact performance dates; insufficient to seed individual shows. |
| Het Veem Theater | Stored domain does not resolve; likely replacement domain did not expose programme pages during diagnosis. |
| Marci Panis | Only stale archive posts are exposed; no current or future public programme found. |
| Poldertheater | Site lists productions/school booking information but no dated public performances. |
| Studio H67 | Domain is not resolvable on tested www/apex HTTP or HTTPS variants. |
| Toomler | Stored Facebook URL is not scrapeable; likely canonical domain has invalid TLS and blank HTTP content. |
| Vice Versa | Stored domain vice-comedy.com is not resolvable on tested www/apex HTTP or HTTPS variants. |
| Vondelbunker | Redirects to radar.squat.net bot-check page, so no accessible event content is available. |
| De Schuur | there is no agenda on this site, the link doesn't work |

## Original failing queue

1. De Glazen Zaal
2. Nieuwe Kerk
3. Tasty Comedy
4. Theater en Filmhuis Dakota
5. Theater Zwembad De Regentes
6. Zaal 3
7. Pietepaf
8. Willem Twee Concertzaal
9. Event Centre Aalsmeer / Crown theater Aalsmeer
10. Roy's Magic Theater
11. Puncher Comedy Club
12. Theater De Drukkerij
13. Podium De Meester
14. Amsterdams Marionetten Theater
15. Astaro Theatro
16. Boom Chicago
17. Clifford Studio
18. De Sloot
19. de Tanker
20. De Toverknol
21. Het Veem Theater
22. Likeminds
23. Marci Panis
24. Mascini
25. OCCII
26. Poldertheater
27. Stichting Theaterstraat
28. Studio H67
29. Teatro Munganga
30. Theater Amsterdam
31. Theater De Richel
32. Toomler
33. Vice Versa
34. Vondelbunker
35. VU Griffioen
36. Zaal 100
