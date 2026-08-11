# CoRe-Verlauf

**Rolle:** einzige kanonische Quelle für abgeschlossene Arbeit, datierte Abnahmen, Release-IDs und Smoke-Protokolle.
**Stand:** 2026-08-11

Der Verlauf ist kein Produktvertrag und keine Roadmap. Aktuelles Verhalten steht in [`status.md`](status.md), offene Arbeit in [`todo.md`](todo.md).

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
