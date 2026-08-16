# CoRe-Verlauf

**Rolle:** einzige kanonische Quelle für abgeschlossene Arbeit, datierte Abnahmen, Release-IDs und Smoke-Protokolle.
**Stand:** 2026-08-16

Der Verlauf ist kein Produktvertrag und keine Roadmap. Aktuelles Verhalten steht in [`status.md`](status.md), offene Arbeit in [`todo.md`](todo.md).

## 2026-08-16 — Adaptive Preloads und lokale Stapelprojektionen

- Automatisches Idle-Preloading lädt `Lernen` und `Karten` seriell nur bei 4G oder fehlender Network-Information. 3G erlaubt ausschließlich Hover, Fokus oder Touchstart; Save-Data, 2G, unsichtbare Tabs und Nutzerinteraktion verhindern weitere Spekulation. Der kontrollierte 4G-Lauf verursachte keinen Long Task, alle 3G-Läufe blieben ohne automatischen Preload. Ein weiterer Editor-Chunk-Split war deshalb nicht erforderlich.
- IndexedDB v5 hält löschbare Stapelprojektionen, Fälligkeits-Buckets, einen Stapel-/Kartenindex und einen fortsetzbaren Rebuild-Checkpoint. Einzelne Karten- und Reviewwrites aktualisieren die Ableitung atomar; Bulk-, Cloud-, Restore- und Konfliktpfade markieren betroffene Stapel dirty. Rebuilds arbeiten in höchstens 250er-/25-ms-Abschnitten, prüfen Dirty-Token und Kontext und schließen Konfliktkarten aus. Tagesfortschritt liest nur den aktuellen Lerntag, historische Heatmapwerte stammen weiterhin aus den stündlichen Reviewzählern.
- Der finale gedrosselte Lauf mit je zehn Wiederholungen bestand vollständig: Wiederholungsstart p75/p95 0,742/0,831 Sekunden, Offline-Kaltstart 0,482/0,576 Sekunden, Frischstart p75 2,786 Sekunden, persistierter Summary-Read p75 7 ms und längster direkt gemessener Projektions-/Hintergrundabschnitt 9,4 ms. Der Service Worker war im p75-Vergleich 576 ms schneller und blieb unverändert. Der Production-Build maß 217,3 KiB gzip im Initialgraphen und 163,1 KiB im größten Lazy-Graphen.
- Repositoryverträge decken unterbrochenen Rebuild, Reload, Review, Kartenänderung, Cloud-Delta/-Reset, Konflikte, Tageskontextwechsel und einen 100k-Karten-/1m-Reviews-Vertrag ohne vollständigen Karten-, Varianten- oder Reviewread beim normalen Boot ab. Die vollständige 100k-Browserjourney und Feldmessung bleiben als LATER-Nachweis offen.
- Der Reviewstart aus den Stapeleinstellungen ersetzt deren Browser-History-Eintrag nun anhand der tatsächlich sichtbaren Ansicht; dadurch entsteht kein doppelter, identischer Review-Eintrag. Abgenommen wurden alle 625 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, das vollständige Performance-Gate, Datenbanktypdrift, 12/12 RLS-/Zwei-Geräte-Fälle und das lokale Playwright-Release-Gate mit 90 bestandenen und einem erwartbar übersprungenen Test.

## 2026-08-16 — Reproduzierbare Startmessung

- Datenbanköffnung, Shell, Outbox samt vier Sync-Metadaten und erste Stapelzusammenfassung besitzen getrennte anonyme Performancephasen. Outbox und Sync-Metadaten werden in einer gemeinsamen Readonly-Transaktion geladen; Profil- und Karteninhalte gelangen nicht in das Artefakt.
- Das lokale Production-Gate misst je zehn Starts für einen wiederkehrenden Browser, einen frischen isolierten Kontext, einen persistenten Kontext ohne Service Worker und einen Offline-Kaltstart bei 1,6 Mbit/s, 150 ms RTT und vierfacher CPU-Verlangsamung.
- Der gemessene Wiederholungsstart bestand mit p75 0,69 Sekunden und p95 0,74 Sekunden, der Offline-Kaltstart mit p75 0,44 Sekunden und p95 0,49 Sekunden. Der Frischstart bestand mit p75 2,78 Sekunden. Der Service Worker war im p75-Vergleich 560 ms schneller und erhält daher kein Navigation-Preload.
- Das Gesamtgate bleibt rot, weil der längste Hintergrundtask 231 ms statt höchstens 50 ms benötigte. Die erste Stapelzusammenfassung dauerte bis 503 ms und verursachte den 231-ms-Long-Task; ein spekulativer Feature-Load überlappte maximal 58 ms. Gemäß Roadmap wird die dauerhafte O(Stapel)-Projektion deshalb in NOW vorgezogen und das Preload-Task-Budget nachgehärtet; große Inhaltstrennung und Navigation-Preload bleiben zurückgestellt.

## 2026-08-15 — Profilintegrität nach Local-first-Start

- Das Auf- und Zuklappen eines Stapels schreibt wieder das vollständige Profil. Gemeinsame Laufzeitprüfungen weisen unvollständige Profilwrites vor IndexedDB und vor dem Supabase-Upsert zurück.
- Der erfolgreiche Cloud-Bootstrap entfernt ausschließlich alte unvollständige Profilpatches, übernimmt das vollständige Cloud-Profil, rettet gültige UI-Präferenzen und reiht nur bei einer Abweichung genau einen vollständigen Ersatzpatch ein. Vollständige Offline-Profiländerungen sowie Karten-, Review-, Import- und Medienmutationen bleiben erhalten; offline wird nichts verworfen.
- Abgenommen wurden 60 fokussierte Profil-, Repository-, Boot- und Cloudtests, 616/616 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, Datenbanktypdrift, 12/12 RLS-Fälle sowie das vollständige lokale Playwright-Gate mit 90 bestandenen und einem erwartbar übersprungenen Test. Der neue Browservertrag bestätigt Stapelumschaltung, Einstellungen, Reload und einen frischen isolierten Kontext mit demselben Cloud-Profil.

## 2026-08-15 — Local-first Performance-Grundlage

- Der Accountstart öffnet nach einer Accountprüfung zuerst die lokale IndexedDB-Shell. Profil-/Stapel-Bootstrap, global cursorbasierte und bytebegrenzte Account-Deltas, Konflikte, Reparatur und Medien laufen nach. Kartenverwaltung und Lernen lesen 50er-Seiten; die Sitzung fordert bei 15 verbleibenden Karten nach. Ein eingerichtetes Gerät kann bei einem reinen Netzwerkfehler aus derselben persistierten Supabase-Sitzung offline kalt starten.
- Produktscreens, Supabase-Client, Cloud-/Mediencode und Statistikmodell werden dynamisch geladen. Lernen und Karten werden nach einer ruhigen Sekunde seriell vorbereitet; Datensparmodus, langsames Netz, Hintergrundtab und Interaktion stoppen Spekulation. Der Production-Build sank gegenüber 271,6 KiB Ausgangswert auf 211,8 KiB gzip im Initialgraphen; der größte Lazy-Graph misst 163,1 KiB gzip.
- Die ausführbaren Gates, Performance-Marken, PWA-App-Shell, persistente Speicheranfrage und sichtbare Quotenanzeige sind vorhanden. Der Browser-Smoke bestätigte Login-Shell, fehlendes Fehleroverlay, null CLS, 184 ms lokales LCP, 6,8 ms lokales TTFB und keinen horizontalen Überlauf bei 390 px; dies ersetzt ausdrücklich nicht den offenen gedrosselten 100k-/1m-Nachweis.
- 110 fokussierte Performance-, Repository-, Sync-, Auth- und Pagingprüfungen sowie alle 605 Modul-/Contract-/Integrationstests, Typecheck, Dokumentationscheck, Production-Build und JavaScript-Syntaxcheck des Service Workers waren grün. Datenbanktypdrift und RLS konnten mangels laufendem Docker Desktop nicht ausgeführt werden; die neue SQL-Migration bleibt deshalb vor Merge lokal nachzuprüfen.

## 2026-08-14 — Synchronisation 2.0

- Der kanonische `syncNow()`-Zyklus schreibt lokale IndexedDB-Transaktionen, überträgt Outbox-Mutationen einzeln, lädt anschließend alle `sync_change_id`-Deltas und aktualisiert Konflikt- und Statusdaten. Manueller Sync lädt auch bei leerer Outbox; Autosync ist accountgebunden und reagiert entprellt auf lokale Änderungen, Start, Online, Fokus sowie ein sichtbares Intervall von 0, 1, 5, 15 oder 30 Minuten.
- Fachliche Inhaltsrevisionen ignorieren technische Eigentümer-, Zähler-, Import- und Projektionsfelder. Reviews bleiben idempotente append-only Ereignisse, erhöhen keine Inhaltsrevision und überschreiben den Lernstand nur, wenn sie zeitlich neuer sind. Fehlende Originalvarianten vorhandener Cloud-Karten sowie technische Alt-Abweichungen werden idempotent repariert; ein Konflikt blockiert nur die betroffene Entität.
- Aktive Konflikte sind pro Account, Tabelle und Entität eindeutig. Konfliktkarten werden aus der Lernwarteschlange genommen, bleiben in der Kartenverwaltung sichtbar und können gesammelt mit einer Folgenvorschau für `Dieser Browser` oder `Cloud im Account` aufgelöst werden. Die Richtungsentscheidung entfernt die verursachende Outbox-Mutation; Reviews, Medien und konfliktfreie Inhalte bleiben unberührt.
- Navigation und globale Einstellungen zeigen Sync-Status, Konfliktzahl, ausstehende Änderungen, letzte erfolgreiche Synchronisierung, Intervall und einen vollständigen manuellen Sync. IndexedDB bleibt beim Schließen die sichere Wiederanlaufwahrheit; der letzte Browser-Sync ist ausdrücklich nur bestmöglich.
- Lokal bestanden 66 fokussierte Sync-/Repository-/Einstellungsprüfungen, alle 585 Modul-, Contract- und Integrationstests, Typecheck, Produktionsbuild, Schema-/Typdriftprüfung und 12/12 RLS-/Zwei-Geräte-Fälle. Der Sync-Konfliktpfad wurde im In-App-Browser auf Desktop und Mobil einschließlich Richtungsfolgen, Light/Dark und manuellem Vollabgleich geprüft. Der vollständige lokale Browserlauf wurde ausgeführt, bleibt im gemeinsamen uncommitteten Arbeitsbaum aber mit 16 Fehlschlägen in bereits parallel geänderten Import-, Navigations-, Kartenprofil-, Medien- und Statistikpfaden offen; 66 Fälle bestanden, einer wurde übersprungen.

## 2026-08-13 — Dependency-Sicherheitsgate geschlossen

- `pdfjs-dist` wurde gezielt auf 6.2.108 und `postcss` auf 8.5.26 angehoben. PostCSS besitzt weiterhin die transitive Abhängigkeit auf `nanoid`, die das Lockfile ohne direkte Projektabhängigkeit auf 3.3.18 auflöst; weitere Dependency-Upgrades gehörten nicht zu diesem Sicherheitspaket.
- Ein sauberes `npm ci` reproduzierte den Lockfile-Stand, und `npm audit --omit=dev` endete mit null Schwachstellen. Sieben PDF-/Worker-Fokustests, 542/542 Modul-, Contract- und Integrationstests, Typecheck, Production-Build und Bundlebudgets blieben grün.
- Das lokale Beta-Gate bestand mit 22/22 Browserfällen einschließlich Beta-Login und PDF-Quellenanker. Das Release-Gate bestätigte Datenbanktypdrift, 12/12 RLS-Prüfungen sowie 79 bestandene und einen erwartbar übersprungenen Browserfall.

## 2026-08-13 — Dynamische Karten- und Skalierungshärtung

- Karteninhalt besitzt mit `LearningItemDocumentV1` und deduplizierten Notetype-Definitionen eine Schreibwahrheit; vollständige Definitionen und Quellsnapshots werden nicht mehr über Kartenmetadaten dupliziert. Renderer und Templatecache sind synchron und von der initialen Core-Seam getrennt. Die öffentlichen Exporte sanken gegenüber dem Freeze in `coreModel` von 66 auf 52, in `apkgImport` von 32 auf 4 und in `cloudRepository` von 24 auf 18.
- APKG erzeugt Commitgraph, Bericht und höchstens fünf Samples genau einmal im Worker und streamt den Graphen in IndexedDB-Chunks. Der produktive Browserpfad besitzt keinen Direktparser-Fallback; die Protobuf-Dekoder werden als eigener Lazy-Chunk geladen, wodurch der Main-Thread-APKG-Chunk von 96,9 auf 87,3 kB sank. Boot, Kartenbrowser, Review und Statistik verwenden begrenzte Entityabfragen; eine Reviewantwort schreibt lokal eine Transaktion und synchronisiert genau einen atomaren RPC. Cloudlisten verwenden 500er-ID-Keyset-Seiten, begrenzte Writes und keinen vollständigen Readback.
- Gegen die eingefrorene Basis von 7.017 zusätzlichen handgeschriebenen Produktionszeilen verbleiben nach demselben Filter 5.564 Zeilen, also 20,7 Prozent weniger. Der Production-Build hält die komprimierten Budgets; der initiale Hauptchunk misst 478,5 kB roh statt rund 492 kB am Freeze.
- Lokal bestätigt: 542/542 Modul-, Contract- und Integrationstests, Typecheck einschließlich UI-Katalog, Production-Build, Datenbank-Reset über beide neuen Migrationen, Typgenerierung und Typdrift, Schema-Verifikation, 12/12 RLS sowie der vollständige Release-E2E-Lauf mit 79 bestandenen und einem im normalen Release-Modus erwartbar übersprungenen Beta-Artefakt-Test. Das Golden-Gate bestand separat mit Auth-Setup und sechs Kernjourneys.
- Der abschließende 25.000-Karten-/1.000-Medien-APKG-Median lag bei 15,01 Sekunden Gesamt- und 14,68 Sekunden Workerzeit, rund 688 MiB Workerheap, 25,73 ms maximaler Main-Thread-Verzögerung und 0,41 ms Ergebnisübergabe. Das überschreitet die frühere optionale Rust-Spike-Schwelle, Rust/WASM bleibt aber bewusst außerhalb dieses Pakets. `npm audit --omit=dev` meldet drei bekannte Findings im unverändert eingefrorenen PDF.js-/PostCSS-Stand und transitivem `nanoid`; die frühere Aussage „ohne Production-Vulnerability“ ist damit nicht mehr aktuell und wird nicht als Gate dieser Härtung behauptet.

## 2026-08-12 — Dynamische Karteninhalte und erhaltender Anki-Import

- Das kanonische Inhaltsmodell ist feldzentriert: `LearningItemDocumentV1`, unveränderliche Notetype-Definitionen und stabile Variantenprojektionen ersetzen feste Kartentypen als fachliche Wahrheit. Die manuelle Erstellung beginnt mit Vorder- und Rückseite und ergänzt Bilder, Lücken, Rückrichtung, Multiple Choice und weitere Felder als kombinierbare Aktionen beziehungsweise Rezepte.
- Legacy- und V18-APKG erhalten bekannte und unbekannte Notetype-, Feld- und Template-Konfigurationen einschließlich Roh-Protobuf, CSS, IDs, Medien- und Schedulerquellen. Dreiwege-Reimport schützt lokale Feldänderungen; jede Anki-Card bleibt eine separat reviewbare Variante. Ein gemeinsamer CSP-/Sandbox-Renderer versorgt Importvorschau, Kartenverwaltung und Review und zeigt bei nicht sicher ausführbaren Funktionen eine diagnostizierte Feldansicht.
- CSV- und Tabellenimporte besitzen eine bestätigungspflichtige, ausschließlich deterministische Spaltenzuordnung; der APKG-Integritätspfad bleibt davon getrennt.
- Zwei agentische Browserrunden prüften Erstellung, CSV-Mapping, importierte Felder und gemeinsame Präsentationen in Light/Dark, Reduced Motion, per Tastatur sowie von 320 bis 1.920 px und an den tatsächlichen Breakpoints. Gefundene P1-Befunde zu Cloze-Auswahl, Dirty-State, Statusmeldungen und Reflow wurden behoben; die zweite Runde fand in den erneut geprüften Kernpfaden keine offenen P0/P1. Die isolierte Auth-Oberfläche bestand zusätzlich bei exakt 160 CSS-Pixeln ohne Clipping, Konsolen- oder Seitenfehler.
- Der damalige Zwischenstand bestätigte 624 Modul-, Contract- und Integrationstests, Typecheck einschließlich UI-Katalog, Production-Build mit einem größten Hauptchunk von 491,9 kB, Datenbanktypdrift, Schema-Verifikation, die vollständige 12-Test-RLS-Suite und den 25.000-Karten-/1.000-Medien-APKG-Benchmark. Persistierte Playwright-Durchstiche bestanden für den kompletten Basic-Lebenszyklus sowie die Latest-APKG-Analyse; die nachfolgende gemeinsame Skalierungshärtung und ihr geschlossener Release-Lauf sind im Eintrag vom 13. August dokumentiert.

## 2026-08-11 — Hierarchische Tageslimits, Sortierung und Easy Days

- Eine gestartete Baumrunde berücksichtigt Neu- und Reviewbudgets jedes enthaltenen Stapels und seiner aktiven Vorfahren. Reviews sowie tagesübergreifende Lernschritte reservieren Reviewbudget vor neuen Karten; Intraday-Schritte umgehen Limits. Durch Limits verborgene fällige und neue Karten werden am Start und Abschluss verständlich ausgewiesen.
- Lernprofile und materialisierte Stapeleinstellungen führen getrennte Sortierungen für neue Karten und fällige Reviews. Alter, stabiler Lerntagszufall, Überfälligkeit und tatsächliche FSRS-Abrufwahrscheinlichkeit bestimmen die Auswahl vor dem bestehenden Modus `Neue zuerst / Gemischt / Wiederholungen zuerst`.
- Der globale Wochenrhythmus führt je Wochentag `Normal`, `Weniger` oder `Minimal`. Easy Days verteilt ausschließlich neue Review-Tagesintervalle von 3 bis 90 Tagen innerhalb des offiziellen FSRS-Fensters anhand der Last aller aktiven Stapel; Vorschau und Commit teilen denselben DST-sicheren Kontext. Profil-JSONB und Portabilität wurden ohne Schemaänderung erweitert.
- Die fokussierte Abnahme war unmittelbar nach beiden Paketen mit 102 Prüfungen grün; der nachgelagerte Vereinfachungsaudit bestand mit 70 betroffenen Queue-/Scheduler-/Bibliotheksprüfungen sowie sechs Easy-Days-Grenzfällen. Die Browserabnahme bestätigte Light und Dark bei 390, 768 und 1.440 px, Tastaturauswahl und fehlenden horizontalen Überlauf. Die Paket-Builds waren grün. Im abschließenden gemeinsamen Arbeitsbaum wurden `typecheck`, `build`, `npm test` und `test:beta` zusätzlich ausgeführt, blieben aber ausschließlich an parallel entstehenden, sachfremden APKG-/HTML-Sicherheitsänderungen hängen; das lokale Supabase-Browsergate war bereits ohne laufendes Docker Desktop extern blockiert.

## 2026-08-11 — Getrennte globale und stapelspezifische Einstellungen

- Globale Stapel-Defaults und die fehlerhafte Bulk-Mutation wurden entfernt. Tagesbeginn und Vorziehfenster werden accountweit an Queue und Sitzung übergeben; Tageslimits, Scheduler und CoRe bleiben materialisierte Stapelwerte.
- Eigene benannte Lernprofile sind konto-weite, versionierte Copy-on-apply-Vorlagen. Cloud- und lokale Normalisierung sowie Portabilität transportieren die Bibliothek ohne Datenbankmigration; Import-ID-Kollisionen werden sicher getrennt.
- Beide Einstellungsseiten besitzen drei responsive CoRe-Bereichskarten, direkte Quernavigation und mobil stabile Seitenköpfe. Die decklose Route bietet eine Stapelauswahl; Sprache ist ehrlich als `Deutsch (Beta)` gekennzeichnet.
- Lokal bestätigt: 525 Modul-, Contract- und Integrationstests, Typecheck, Production-Build sowie Browserabnahme in Light und Dark bei 390, 768 und 1.440 px. Die Profiljourney Anlegen, Anwenden, lokal Ändern und Speichern funktionierte ohne horizontalen Überlauf; zwei nachgelagerte Agentenaudits fanden und verifizierten die Legacy-, Import- und Vereinfachungskorrekturen.

## 2026-08-10 — Globaler Pomodoro-Timer

- Ein einziger accountgebundener, browserlokaler Timer wird aus globalen Einstellungen oder Lerneinstellungen gestartet. Er speichert Start, Ende und Dauer statt heruntergezählter Zwischenstände, ersetzt einen laufenden Timer sofort und bleibt dadurch über Hintergrunddrosselung, Navigation, Reload und weitere Tabs driftfrei.
- Der laufende Timer erscheint im Review, in der Desktop-Sidebar und unterhalb von 1.280 px als 22 px hohe Projektion in der Kopfleiste. Der Lernbalken behält ohne Timer den Zustand `Nicht gestartet`; globale Projektionen verschwinden nach dem Ablauf. Der vorhandene schließbare Toast meldet exakt `Timer abgelaufen.`.
- Lokal bestätigt: 27 fokussierte Timer-/UI-Tests, die vollständige Modulsuite mit 505 Tests, Typecheck und Production-Build. Das lokale Datenbankgate bestätigte 11 RLS-/Storage-/Zwei-Geräte-Prüfungen. Playwright bestätigte automatisiert den Start aus den Lerneinstellungen sowie Ablauf, Entfernung und Toast; der interaktive In-App-Browser bestätigte zusätzlich Ganzzahlfehler und ARIA-Zustand, globalen Start, sofortigen Ersatz, Navigation, Reload und Tab-Synchronisierung. Die visuelle Prüfung bei 390, 767, 768, 1.279 und 1.280 px ergab keinen horizontalen Überlauf, den vorgesehenen Navigationswechsel und keine Konsolenwarnungen oder -fehler.

## 2026-08-06 — Anki-inspirierte Statistik im CoRe-Design

- Der bisherige Statistikpfad wurde durch ein einziges indexiertes Projektionsmodell und einen lazy geladenen CoRe-Screen ersetzt. Eine globale Auswahl steuert 30 Tage, 90 Tage, ein Jahr oder den Gesamtverlauf sowie Sammlung, Oberstapel und deduplizierte Mehrfachauswahl. Aktivität, Lernzeit, Kalender, Planung, Bestand, Intervalle, FSRS, Antwortverhalten, wahre Erinnerungsquote, Stapelvergleich und schwierige Karten verwenden dieselbe Projektion und höchstens 240 aggregierte Punkte je Reihe.
- Reviewantwortzeiten werden von der sichtbaren Karte bis zur Bewertung monoton gemessen, bei 60 Sekunden gedeckelt und optional im bestehenden Review-Event gespeichert. Der APKG-Pfad übernimmt zuordenbare Anki-Revlog-Ereignisse deterministisch und duplikatfrei ausschließlich für Analysen; aktuelle Fälligkeit und FSRS-State bleiben neutral.
- Neu sind ausschließlich `recharts@3.10.1` und das dazu passende direkte `react-is@19.2.7`. Der Production-Build hielt das feste Chunkbudget mit einem 477,2-kB-Statistikchunk ein.
- Lokal bestätigt: 447 Modul-/Integrationsprüfungen, Typecheck, Production-Build sowie ein reproduzierbarer Lauf mit 250.000 synthetischen Review-Ereignissen. Nach der featurekonstanten Projektionsoptimierung benötigte der abschließende Lauf 68 ms für den Index, 311 ms für den kalten Standardzeitraum, 8–29 ms für anschließende Wechsel zwischen 30 Tagen, 90 Tagen und einem Jahr sowie 327 ms für den Gesamtverlauf; Diagrammreihen blieben bei höchstens 115 Punkten und der tägliche Jahreskalender bei 365 Zellen. Es gilt bewusst kein geräteabhängiges CI-Zeitlimit. Die manuelle Browserabnahme in Light und Dark bei Desktop-, Tablet- und 390-px-Mobilbreite bestätigte globale Filter, Maus-/Touch-/Tastaturdetails und keinen horizontalen Hauptscroll.
- Der vollständige Modullauf war mit 441 Tests grün. Das lokale Release-Gate bestätigte Datenbanktypen und alle 11 RLS-/Storage-/Zwei-Geräte-Prüfungen; nur die anschließende vollständige Playwright-Suite blieb offen, weil ein parallel gestarteter fremder Dev-Server den vorgeschriebenen Port 5190 belegte.

## 2026-08-06 — Basic + Bilder und Kartentyp-Icons

- Die manuelle Erstellung unterstützt den neuen Kartentyp `Basic + Bilder`. Vorder- und Rückseite besitzen weiterhin Rich Text und zusätzlich je ein optionales Bildfeld mit Einfügen per Strg+V, Drag-and-drop, Dateiauswahl, Vorschau, Ersetzen und Entfernen.
- Alle Kartentypen zeigen ein eigenes Icon links vom Namen. Bild-Bytes bleiben im accountgebundenen Mediencache und der bestehenden Upload-/Retry-Queue; Karten und Cloud-JSONB speichern ausschließlich SHA-1-Referenzen.
- Der neue Typ durchläuft denselben validierten Front-/Back-, Kopier-, Persistenz- und Reviewvertrag wie Basic, bleibt aber bewusst von der textbasierten KI-Variantenroute ausgeschlossen. Es wurde keine Datenbankmigration und keine neue Abhängigkeit eingeführt.
- Lokal bestätigt: 421 Modul-, Contract- und Integrationstests, Typecheck, Production-Build sowie Browserprüfung bei Desktop-, Zwischen- und Mobilbreite. Icons, Dateiauswahl, Strg+V, Vorschau, Reset nach Speichern und Offline-Medienstatus funktionierten ohne Konsolenwarnungen oder horizontalen Überlauf.

## 2026-08-06 — Gemeinsame Stapelübersicht und Stapelaktionen

- Dashboard und Lernen verwenden dasselbe responsive „Aktive Stapel“-Panel; nur das Dashboard ergänzt die Aktion „Lernen öffnen“. Die während eines Drags sichtbare Hauptebenen-Dropzone bleibt dadurch außerhalb der Zeilen erreichbar.
- Pointer-Capture hält den gegriffenen Stapel auch außerhalb der Liste aktiv. Lift-Zustand, verstärkter Einfügeindikator und bestehende Platzierungsvalidierung machen gültige und ungültige Ziele eindeutig.
- Dashboard, Lernen und Kartenverwaltung verwenden dasselbe reduzierte Stapelmenü mit Erscheinungsbild, vollständigem Pfad, CoRe-Modus, Einstellungen und bestätigtem Verschieben. Umbenennen, Unterstapel, Lernen, Variantenlernen und Löschen liegen ausschließlich in den Stapel-Einstellungen.
- Lokal bestätigt: 416 Modul-, Contract- und Integrationstests, Typecheck, Production-Build und Browserprüfung bei Desktop-, Zwischen- und Mobilbreite. Hauptebenen- und Unterstapel-Drops, Menü, Dialog und Zielvalidierung funktionierten ohne Konsolenfehler.

## 2026-08-06 — App-weite Lernzeitsimulation

- Der isolierte FSRS-Testmodus, sein Fünf-Karten-Stapel, Verlauf und `/testmodus` wurden entfernt. `/simulator` steuert stattdessen eine transiente, kalenderbasierte Lernuhr für die vorhandenen Accountkarten.
- Dashboard, Lernen, Kartenverwaltung, Statistik und Vollbildreview verwenden denselben simulierten Zeitpunkt. Reine Zeitwahl bleibt mutationsfrei; Zukunftsreviews werden über den bestehenden Scheduler-, Workspace- und Syncpfad dauerhaft gespeichert.
- Der aktive Zukunftstag ist in App-Shell und Review sichtbar. Schnellziele, einzelne Tagesschritte und ein auf zehn Jahre begrenztes Datumsfeld sind tastaturbedienbar; Reload und Logout setzen den Offset auf „Heute“ zurück.
- Es wurden keine Datenbankmigration, neue Abhängigkeit, Rollen-/Premiumlogik oder rücksetzbare Sandbox eingeführt.
- Lokal bestätigt: 413 Modul- und Integrationstests, Typecheck und Production-Build. Der In-App-Browser startete `/simulator` ohne Konsolenfehler; die geschützte Simulatoransicht selbst blieb ohne vorhandene lokale Anmeldung hinter dem Auth-Gate.

## 2026-08-01 — Labs- und Groß-APKG-Vorleistungen zurückgebaut

- Chat-your-Deck, Lernplan, Graph, Community-Demo, KI-Entwürfe/-Jobs, externer Varianten-JSON-Flow und technische APKG-Diagnose wurden aus UI, Domainmodell und Tests entfernt.
- `/api/ai/*`, `/api/imports/apkg`, Trigger.dev-Aufgaben, Upstash-/Trigger-Abhängigkeiten und der Server-APKG-Benchmark wurden entfernt. APKG bleibt lokal bis einschließlich 250 MiB.
- App-State v3 und Portable Export v2 enthalten nur Core-Daten; Legacy-Zustände und V1-Exporte werden beim Lesen bereinigt. Stapel sind implizit privat.
- Der Produktionsrückbau wurde gegen das über Vercel verifizierte Projekt `CoRe-Database` (`hirbiuiydczmnjqtoyqx`) ausgeführt. Sechs abgeschlossene KI-Jobzeilen sowie die pensionierten Tabellen und Spalten wurden entfernt; Labs-Decks, -Karten, Reviews, Konflikte und Medien waren nicht vorhanden.
- Der Storage-API-Lauf bestätigte 0 zu löschende `core-media`-Objekte und einen bereits fehlenden Bucket `core-imports`. Die pensionierten Vercel-KI-Variablen wurden aus Development, Preview und Production entfernt. `smarter-nutrition` blieb verbunden und unverändert.
- Lokal bestätigt: 346 Modul-/Integrationsprüfungen, Typecheck, Production-Build, Datenbanktypen, Beta-Core mit 22 Browserjourneys sowie Release mit vollständigem RLS/TUS, 51 Browserjourneys und lokalem 4.900-Karten-APKG-Benchmark. Die ausgemusterten Tabellen, Spalten und der Bucket `core-imports` fehlen im lokalen Zielzustand.
- Commit `5c741ad09c113455466e68970848190d0e476c78` wurde erfolgreich nach `main` ausgeliefert. Quality und Beta-Core waren grün; `extended-core` bestand im Wiederholungslauf in 7:14 Minuten. Der erste Versuch war ausschließlich beim Abruf des Supabase-`postgres-meta`-Images durch ein externes Registry-Rate-Limit fehlgeschlagen, nachdem alle 103 Integrationstests bestanden hatten.
- Vercel bestätigte genau diesen Commit. Die kanonische Startseite antwortete mit `200`, `/api/ai/chat` und `/api/imports/apkg` jeweils mit `404`.

## 2026-07-16 — Stapel-IA und URL-Kontext

- Ausgangs-Commit war `0474d1c6f1a7c5efb9f476b4109111b00d5c74ce`. Lernen und Kartenverwaltung bleiben getrennte Aufgabenoberflächen, verwenden aber denselben kanonischen URL-Kontext für View, Deck, Karte und Erstellziel.
- Der Reviewpfad serialisiert Reviewdeck, optionalen Variantenbezeichner und den diskriminierten Rückkontext `today | learn | decks` mit optionalem Rückdeck und Rückkarte. Alte Reviewpfade bleiben lesbar; freie Return-URLs werden nicht akzeptiert.
- Lokale parallele Deck-/Kartenselektion wurde aus `LearnScreen` und `DecksScreen` entfernt. Die Kartenverwaltung ist sekundär über `Karten verwalten` erreichbar, zeigt nur Inventarzahlen `im Stapel` und unterscheidet gleichnamige Unterstapel über vollständige Pfade.
- Ungültige oder gelöschte Deck-/Kartenlinks zeigen sichere deutsche Fallbacks und öffnen keine zufällige Ersatzkarte. Browser-Reload, Direktlink, neuer Tab sowie Zurück/Vorwärts erhalten den semantischen Kontext.
- `npm run typecheck`, 415 Modul-/Contract-/Integrationstests, Production-Build mit Chunkbudget, die fokussierten Navigationsjourneys A–G und das vollständige `npm run test:beta` mit 22 Browserflows waren grün.
- Es wurde keine Routerbibliothek, Datenbankmigration, Scheduler-/Queueänderung, KI-, Graph- oder Community-Funktion eingeführt.

## 2026-07-16 — Batch-Erstellung und Fehlertoleranz

- Die manuelle Erstellung bleibt nach jedem Save geöffnet, führt einen expliziten Batch-Session-State und beendet die Sitzung erst über `Fertig`. Pin-Reset, Zieldeck, vollständige Hierarchiepfade und Fokus sind deterministisch.
- Nichtleere fachliche Entwürfe sind durch einen zugänglichen Navigationsdialog und den Browser-Unload-Fallback geschützt; bereits gespeicherte Karten bleiben bei einem verworfenen Entwurf erhalten.
- Karten- und Stapellöschung verwenden produktspezifische Dialoge. Das unmittelbare Karten-Undo reaktiviert denselben Datensatz mit der bestätigten Tombstone-Revision und erhält den bestehenden Review State.
- Importmodi besitzen getrennte UI-Sessions und eine diskriminierte Zustandsprojektion. Formatwechsel entfernen alte Vorschau, Commitfähigkeit, Fehler und Fortschritt; Erfolg, Teilabschluss, Abbruch sowie retryable und terminale Fehler bleiben unterscheidbar.
- `npm run typecheck`, 411 Modul-/Integrationstests, Production-Build mit Chunkbudget, vier neue Beta-Core-Browserjourneys, der fokussierte retryable/cancelled-Serverterminal-Smoke und das vollständige `npm run test:beta` mit 20 Browserflows waren grün.
- Es wurde keine Datenbankmigration, KI-Arbeit, APKG-Parseränderung, Scheduleränderung oder neue Medieninfrastruktur eingeführt.

## 2026-07-16 — Typgerechter Kartenlebenszyklus

- Basic, Reverse, Cloze und Multiple Choice verwenden einen diskriminierten Editorwert und eine kanonische Save-Naht im Core Model; der normale Verwaltungsfluss speichert kein generisches `front/back/kind`-Patch mehr.
- Reverse-Richtung, Cloze-Lückengruppen und Multiple-Choice-Lösung werden atomar aktualisiert. Versionswiederherstellung, APKG-Reimport, Cloud-JSONB und Portabilität erhalten die strukturierten Inhalte.
- Der normale Reverse-Review zeigt die Originalrichtung; der ausdrücklich gestartete Variantenreview zeigt die synchronisierte Rückrichtung.
- Feldnahe Validierung, Rich-Text-Editoren, read-only Importfelder und progressive Herkunfts-/Versionsdetails sind in der Kartenverwaltung verfügbar.
- Unit-, Contract-, Persistenz- und fünf lokale Beta-Core-Browserjourneys einschließlich Kern-RLS waren grün. Es wurde keine Datenbankmigration und keine KI-, Provider- oder Adapterfunktion ergänzt.

## 2026-07-15 — Beta-Core-Gate lokal verifiziert

- Das neue blockierende `npm run test:beta` trennt den freigegebenen Kern von Labs-, Heavy- und Großdateipfaden. Die erweiterten Pfade laufen in CI separat und nicht blockierend.
- `npm run test:beta:local` bestand mit Kern-RLS, Registrierung und E-Mail-Bestätigung, Recovery und erneutem Login, fünf Kernjourneys, Offline/Reconnect, Konfliktstatus, kleinem APKG-Medienimport und Portabilitätsgrenzen.
- `npm run typecheck`, Unit-, Contract- und Integrationstests sowie `npm run build` waren grün. Der Build hielt das Chunk-Budget ein.
- Dies ist kein Hosted-Release-Nachweis: Preview, staged Production, realer Alarmempfang und getrennte DB-/Storage-Restore-Proben bleiben offen, weil kein dedizierter Hosted-Smoke-Account und kein Restore-Testprojekt für diesen Lauf bereitstanden.
- Der Nachweis enthält keine Secrets, Tokens, Nutzerinhalte, E-Mail-Adressen oder Authartefakte.

## 2026-07-15 — Produktvertrag und Dokumentation

- P0.1: Produktoberflächen wurden in Core, Labs und Disabled eingeordnet und zentral projiziert.
- P0.2: Der Review-/Variantenvertrag wurde korrigiert. Vor dem Reveal erscheinen keine Herkunfts-, Variantenlevel-, Reife- oder Schedulerhinweise; Original und Quelle erscheinen erst nach der Antwort.
- P0.3: Einstellungen zeigen die Login-E-Mail als Accountwert, erklären tatsächliche Datenschutzgrenzen und trennen Profil, Lernen, Sync/Daten sowie Erweitert.
- P0.4: Standardaccounts starten leer; Demo-Daten sind opt-in. Nach manueller Erstellung oder APKG-Commit führen stabile Folgeaktionen zu Lernen oder Kartenprüfung.
- P0.5: Core-/Labs-Einstiege, lesbare Quellformate, APKG-Hauptbericht und lokale Entwurfsassistenz wurden getrennt. Einzelne UX-Nacharbeiten bleiben offen.
- P0.6: Lernen und Stapelverwaltung wurden fachlich getrennt; Strukturänderungen sind explizit und bestätigt. Die moderierte Abnahme bleibt Teil des offenen P0-Gates.
- P1.1: Auth-/Account-Boot, Navigation, Sync- und Medien-Lifecycle wurden aus der App-Shell gelöst; Screen-Props sind konkret typisiert.
- P1.3: Tests wurden in Unit, Contract, Integration, Golden-E2E und Heavy-Release geordnet. Das Testportfolio steht in `docs/test-portfolio.md`.
- P1.4: Produktvertrag, Architektur, Status, Betrieb, Entscheidungen, Verlauf und offene Roadmap wurden in eindeutige Rollenquellen getrennt.

## 2026-07-14 — Cloud, Medien und Sync

- Revisionsgeprüfte Cloud-Mutationen, Konfliktprojektion, Soft-Deletes, Offline-Outbox und Zwei-Geräte-Vertrag wurden abgenommen.
- Der accountgebundene Medienpfad mit privatem Storage, Standardupload, TUS über 6 MiB, Signed URLs und reloadfester Pending-Queue wurde implementiert.
- APKG-Reimport bewahrt lokale Inhaltsänderungen und aktualisiert Import- sowie Medienmetadaten.
- Der lokale Datenbanktyp-Driftcheck, RLS-/Ownership-Smokes und Browserflows waren grün. Historische Testanzahlen werden nicht als heutiges Gate fortgeschrieben.

## 2026-07-13 — TypeScript und Architektur-Audit

- TypeScript wurde verbindlicher Standard in den produktiven Codewurzeln; `src/coreTypes.ts` wurde kanonische Typquelle.
- App-Shell, Core Model, Repository, Import und Sync wurden entlang ihrer bestehenden Modulgrenzen vertieft, ohne Produktfeatures zu entfernen.
- Lazy Loading, PDF.js-Split und das harte 500.000-Byte-JavaScript-Chunk-Gate wurden abgenommen.

## 2026-07-10 — Erstes protokolliertes Production-Release

- Commit: `e600ac4817f80c8ca8062df3aa2c706ee1f71178` (`e600ac4`).
- GitHub Actions: [Lauf 29121208290](https://github.com/Betogora/CoRe_Hosted/actions/runs/29121208290), `quality` und `browser-e2e` grün.
- Preview: `https://core-hosted-k77v2wj19-bengt2.vercel.app`, Deployment `dpl_ADcYAJBLJWcZ9mu2cMJPeMAyCMGG`.
- Vorherige Production: `https://core-hosted-38mw22988-bengt2.vercel.app`, Deployment `dpl_3HhXHhqRiL6dSqpRALwDc6dXuBYP`.
- Staged und anschließend kanonische Production: `https://core-hosted-94320qvku-bengt2.vercel.app`, Deployment `dpl_CCF8hGMt236krS8CdPW5W9G1yWM9`.
- Preview-Smoke 1–8, staged Kurzsmoke und Production-Kurzsmoke bestanden. Der Log-Scan enthielt keine 5xx- oder Error-Level-Treffer; ein Rollback war nicht erforderlich.
- Site URL und Redirect-Allowlist wurden nach Dashboard-Reload bestätigt; keine Secret-Werte wurden in den Nachweis übernommen.

## 2026-07-09 — Cloud-Grundlage

- Pflichtlogin, accountgebundene Cache-Keys, Cloud-first Autosave und Legacy-Datenübernahme wurden eingeführt.
- Supabase-Tabellen, RLS, accountgebundene Schlüssel und Auth-/Medienoperationen wurden über versionierte Migrationen und Verify-SQL abgesichert.

## Format für neue Einträge

Neue Einträge nennen Datum, abgeschlossenes Paket beziehungsweise Release, Ergebnis, relevante IDs und verbleibende Risiken. Sie enthalten keine Secrets, Passwörter, Tokens, Environment-Werte, personenbezogenen Daten oder Rohinhalte.
