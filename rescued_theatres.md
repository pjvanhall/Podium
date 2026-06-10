# Rescued Theatres

Source queue: `Podium App/server/scraper_report.json` zero-count theatres from the current report.

## Verified rescues

| Theatre | Shows rescued | Fix |
| --- | ---: | --- |
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

## Pending rescue queue

Generated from `node scripts/scrape-shows.js --unscraped` on 2026-06-09T16:44:55.217Z. Known blacklisted theatres are excluded unless `--include-blacklisted` is used.

| Theatre | City | Website | Status | Last attempted |
| --- | --- | --- | --- | --- |
| 't Mosterdzaadje | Santpoort-Noord | http://www.mosterdzaadje.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| 't Raodhoes | Venlo | https://www.raodhoesblerick.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Andledon | Den Andel | https://andledon.nl | no shows | 2026-06-09T16:44:55.217Z |
| Arto Theater | Schoonhoven | https://artotheater.nl | no shows | 2026-06-09T16:44:55.217Z |
| Calypso Theater | Wijk bij Duurstede | https://www.calypsotheater.nl | no shows | 2026-06-09T16:44:55.217Z |
| Circus Hakim | Haarlem | https://www.circushakim.com/ | no shows | 2026-06-09T16:44:55.217Z |
| City of Wesopa | Weesp | https://www.wesopa.nl/city | no shows | 2026-06-09T16:44:55.217Z |
| Club Wicked | Groningen | https://www.clubwicked.nl | no shows | 2026-06-09T16:44:55.217Z |
| Cool kunst en cultuur | Heerhugowaard | https://www.coolheerhugowaard.nl | no shows | 2026-06-09T16:44:55.217Z |
| Cultureel Centrum de Boodschap | Rijen | https://ccgr.nl/de-boodschap/ | no shows | 2026-06-09T16:44:55.217Z |
| Cultuurschip Thor | Zwolle | https://www.cultuurschipthor.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| De Buurvrouw | Rotterdam | https://www.buurvrouwrotterdam.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| De Eendracht | Gemert | https://eendracht-gemert.nl | no shows | 2026-06-09T16:44:55.217Z |
| De Flits Microtheater | Delft | https://www.deflits.nl | no shows | 2026-06-09T16:44:55.217Z |
| De Hoop | Diemen | https://www.schuilkerkdehoop.nl | no shows | 2026-06-09T16:44:55.217Z |
| De Improvisatie Studio | Zoetermeer | http://improvisatiestudio.nl/wordpress/ | no shows | 2026-06-09T16:44:55.217Z |
| De Kleine Willem | Enschede | https://www.wilminktheater.nl/nl/pQNNPHd/de-kleine-willem | no shows | 2026-06-09T16:44:55.217Z |
| De Noorderbak | Roswinkel | http://www.theaterdenoorderbak.nl | no shows | 2026-06-09T16:44:55.217Z |
| De Schoenendoos | Heeze | https://deschoenendoos.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| De Schuur | Utrecht | https://www.deschuur.eu | no shows | 2026-06-09T16:44:55.217Z |
| De Smeltkroes | Maarheeze | https://www.akdesmeltkroes.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| De Steenakker | Haps | https://www.desteenakker.nl | no shows | 2026-06-09T16:44:55.217Z |
| De Theaterboerderij | Ekehaar | https://www.detheaterboerderij.nl | no shows | 2026-06-09T16:44:55.217Z |
| De Theaterstraat | Lent | http://www.de-theaterstraat.nl | no shows | 2026-06-09T16:44:55.217Z |
| De Verhalenboot | Zwolle | https://www.deverhalenboot.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| De Vorstin | Hilversum | https://www.devorstin.nl | no shows | 2026-06-09T16:44:55.217Z |
| Domani | Venlo | https://www.domani-venlo.nl | no shows | 2026-06-09T16:44:55.217Z |
| Energiehuis | Dordrecht | https://www.energiehuis.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| ESTV Doppio | Eindhoven | https://doppio.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Etalagetheater | Leeuwarden | http://www.hayebijlstra.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Eva's Theatertuin | Nijmegen | https://evastheatertuin.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Fazant | Deventer | https://theaterfazant.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Fidei et Arti | Oudenbosch | https://www.fideietarti.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Hal015 | Delft | https://www.hal015.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Haventheater IJmuiden | IJmuiden | https://haventheaterijmuiden.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Hedon | Zwolle | https://www.hedon-zwolle.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Het Filiaaltheater | Utrecht | https://www.hetfiliaal.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Het Parochiehuis | Bakel | https://www.parochiehuisbakel.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Het Theater | Blaricum | https://hettheater.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Het Verhalenhuis | Zutphen | https://verhalenhuis.nl | no shows | 2026-06-09T16:44:55.217Z |
| Houten Kaap | Ouddorp | https://houtenkaap.nl | no shows | 2026-06-09T16:44:55.217Z |
| Imperium | Leiden | https://www.imperiumtheater.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Jansstheater | Lochem | https://www.jansstheater.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Jeugdcircus Santelli | Groningen | https://www.jeugdcircus.nl/cms/index.php | no shows | 2026-06-09T16:44:55.217Z |
| Kulturhus de Talter | Oldebroek | https://www.detalter.nl | no shows | 2026-06-09T16:44:55.217Z |
| Musketon Theater | Utrecht | https://www.demusketon.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Muziektheater De Ontmoeting | Rozenburg | https://www.mtdo.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Nationaal Muziekkwartier | Enschede | https://www.muziekkwartier.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Nieuw Capels Toneel | Capelle aan den IJssel | https://nieuwcapelstoneel.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Ons Pakhuus | Silvolde | http://www.onspakhuussilvolde.nl | no shows | 2026-06-09T16:44:55.217Z |
| Op Maarhuizen | Winsum | https://opmaarhuizen.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Openluchttheater Brilmansdennen | Losser | https://www.openluchttheaterbrilmansdennen.nl | no shows | 2026-06-09T16:44:55.217Z |
| Openluchttheater Cabrio | Soest | https://www.openluchttheatersoest.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Openluchttheater Kersouwe | Heeswijk-Dinther | https://kersouwe.nl | no shows | 2026-06-09T16:44:55.217Z |
| Openluchttheater Leek | Leek | https://www.podiumleek.nl | no shows | 2026-06-09T16:44:55.217Z |
| Party Centrum van Opstal | Tilburg | https://www.partycentrumtilburg.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Podium Bloos | Breda | https://podiumbloos.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Poppentheater Damiët van Dalsum | Dordrecht | https://www.poppentheaterdamiet.nl | no shows | 2026-06-09T16:44:55.217Z |
| Prinsentheater | Delft | https://www.willemvanoranje.nl | no shows | 2026-06-09T16:44:55.217Z |
| Rembrandt | Arnhem | https://rembrandtarnhem.com/ | no shows | 2026-06-09T16:44:55.217Z |
| Rietveld Theater | Delft | https://www.rietveldtheater.nl | no shows | 2026-06-09T16:44:55.217Z |
| Springintheater | Utrecht | https://www.springintheater.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Stadsklooster | Utrecht | https://stadskloosterutrecht.nl | no shows | 2026-06-09T16:44:55.217Z |
| Studio MAPA | Haarlem | https://www.mapa.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater aan de Slag | Culemborg | http://theateraandeslag.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater CulturA | Nootdorp | https://www.theatercultura.nl | no shows | 2026-06-09T16:44:55.217Z |
| Theater De Kik | Elst | https://theaterdekik.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater de Leeuw | Arnhem | https://theaterdeleeuw.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater de Liefde | Haarlem | https://theaterdeliefde.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater De Muze | Noordwijk | https://www.demuzenoordwijk.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater de Schelleboom | Oosterhout | https://www.deschelleboom.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater De Spiegel | Zwolle | https://www.zwolsetheaters.nl | no shows | 2026-06-09T16:44:55.217Z |
| Theater de Stoomfabriek | Dalfsen | https://www.theaterdestoomfabriek.nl | no shows | 2026-06-09T16:44:55.217Z |
| Theater De Wegwijzer | Nieuw- en Sint Joosland | https://www.theaterdewegwijzer.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater de Winsinghhof | Roden | https://www.theaterdewinsinghhof.nl | no shows | 2026-06-09T16:44:55.217Z |
| Theater Elswout | Overveen | https://www.theaterelswout.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater Harderwijk | Harderwijk | https://www.theaterharderwijk.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater Norman De Palm | Seru di Otrobanda | https://keizershofcuracao.com/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater Schuurkerkje | Maassluis | http://www.schuurkerkje.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theater Sonnevanck | Enschede | https://www.sonnevanck.nl | no shows | 2026-06-09T16:44:55.217Z |
| TheaterHangaar | Valkenburg | https://www.theaterhangaar.nl | no shows | 2026-06-09T16:44:55.217Z |
| Theaterhuis de Berenkuil | Utrecht | https://www.deberenkuil.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theaterkerk Wadway | Spanbroek | https://www.theaterkerkwadway.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Theather Posa | Lelystad | https://www.theaterposa.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| TivoliVredenburg | Utrecht | https://www.tivolivredenburg.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Toon Hermans Theater | Sittard | https://www.toonhermanstheater.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Verhalenhuis Haarlem | Haarlem | https://www.verhalenhuishaarlem.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Vestzaktheater | Son en Breugel | https://www.vestzaktheaterson.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Willem Hendrik Zwart Hal | Lemelerveld | https://www.huetink-royalmusic.nl/ | no shows | 2026-06-09T16:44:55.217Z |
| Wresinski theater | Zwolle | https://www.wresinskicultuur.nl | no shows | 2026-06-09T16:44:55.217Z |

## Blacklisted from seeding

These theatres remain in `dutch_theatres.json` with `blacklisted: true` and a `blacklist_reason`, so the seed script skips them.

| Theatre | Reason |
| --- | --- |
| De Glazen Zaal | Venue information/rental site only; no public agenda or programme links, and common agenda paths return 404. |
| Tasty Comedy | HTTPS certificate hostname mismatch and HTTP response contains no usable event content. |
| Event Centre Aalsmeer / Crown theater Aalsmeer | Current site appears to be a spam/SEO shell with no theatre agenda or event content. |
| Roy's Magic Theater | Redirects to a performer/booking site with no public dated show listings. |
| Theater De Drukkerij | Agenda currently exposes only past events as of 2026-06-09; no future shows available to seed. |
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
