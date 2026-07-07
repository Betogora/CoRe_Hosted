# CoRe ToDo

Stand: 2026-07-07

Diese Datei beschreibt die Differenz zwischen Soll-Spezifikation (`docs/specs.md` / `docs/specs.html`) und aktuellem Codebase-Ist. Der aktuelle Stand ist ein lokaler Vite/React-Web-MVP mit `localStorage`, lokalen Deep Modules und testbaren Produktpfaden. Seit dem 2026-07-06 ist das lokale Kartenmodell Learning-Item-kompatibel: Deck-`cards` bleiben als lokale Compatibility Collection erhalten, werden aber ueber die gemeinsame Creation Pipeline normalisiert. Am 2026-07-07 wurden die relevanten Hosting-, Supabase-, Datenbank-, Secret- und KI-Proxy-Hinweise aus dem externen Hosting-Guide in die Specs uebernommen und die Projektdokumentation unter `docs/` gebuendelt. Ebenfalls am 2026-07-07 wurden Supabase-CLI, erste Remote-Migration, Vercel-Projekt, Vercel-Env-Grenzen und Deployment initial eingerichtet. Der MVP ist weiterhin kein fertiges gehostetes Mehrnutzerprodukt, weil App-Persistenz, echte Auth, Sync, Serverjobs und produktive Betriebsablaeufe noch fehlen.

## Aktuell erledigt

- [x] Cleanere lokale Navigation fuer Heute, Erstellen, Lernen, Graph und Community; Kartenstapel ist ueber Lernen erreichbar, Einstellungen ueber den Account-Button.
- [x] Responsive Full-Width-App-Shell: Hauptnavigation und Lernmodus wachsen mit der Browserbreite statt bei Desktopbreiten fest begrenzt zu bleiben.
- [x] Persistenter lokaler App-State ueber `src/coreRepository.js`.
- [x] Deck-/Learning-Item-Modell mit Review-State, Quellenankern, Versionen, Varianten und CoRe-Modus.
- [x] Kompatible Learning-Item-Creation-Pipeline fuer Basic, Reverse, Cloze, Import-Varianten und KI-Drafts.
- [x] Legacy-Card-Normalisierung ohne Verlust bestehender Review-Events.
- [x] APKG-Basic-Import mit Mapping, echten Unterstapeln, Importbericht, HTML-Sanitization, Raw-/Fallback-Feldern, lesbarer `collection.anki21b`/Zstd-Unterstuetzung, Media-Manifesten, lokalem Browser-Medienspeicher und Reimport-Merge.
- [x] Text-, CSV- und Excel-/Tabellen-Paste-Import ueber die gemeinsame Learning-Item-Pipeline mit Warnungen fuer uebersprungene Eingaben.
- [x] Manuelle Kartenanlage mit Rich-Text-Editor fuer Front/Back, bestehendem/neuem Stapelziel, Dokumentmodus, CoRe-integriertem minimalem visuellem PDF-Viewer, Auswahl-zu-Feld, PDF-/Text-Auslesung, Multiple-Choice/Free-Text-Selbstcheck und Original-Variantenanker.
- [x] Erstellen oeffnet standardmaessig die manuelle Kartenerstellung; die Reiter stehen in der Reihenfolge Manuell, PDF/Text, Import, KI.
- [x] Lokale KI-Drafts aus Quellentext mit Schema-Validation, Draft-Annahme und normalisierter Learning-Item-Erstellung.
- [x] Fullscreen-Review mit Antwortaufdeckung, vier Ratings, Tastatursteuerung, append-only Review-Events und Learning-Item-/Varianten-Kompatibilitaetsfeldern.
- [x] Tages-Queue im Lernmodus fuer jetzt faellige/ueberfaellige Karten plus pro Stapel einstellbare neue Karten; Elternstapel lernen ihren Unterbaum.
- [x] Lernuebersicht mit aufklappbaren Unterstapeln, aggregierten Neu-/Faellig-/Gesamtzahlen, CoRe-Status und Stapeloptionen ohne kartenbezogene Maturity-Anzeige.
- [x] Manuelle Stapelverwaltung mit Hauptstapeln, beliebig tiefen Unterstapeln, direktem Umbenennen, Drag-and-drop-Reparenting und Loeschen ganzer Stapelbaeume; APKG-Unterstapel sind im Workspace-Importpfad abgesichert.
- [x] Reproduzierbarer Welt-Hauptstädte-Teststapel als Default-Seed fuer frische lokale Browser-States und echte APKG-Fixture mit sieben Kontinent-Unterstapeln.
- [x] Intervallvorschau direkt auf den Buttons Again, Hard, Good und Easy.
- [x] FSRS-like Scheduler-State mit Stability, Difficulty, Desired Retention, Retrievability und konservativen Intervallen.
- [x] Content-Repetition-Varianten mit Eligibility, Reifegrad-Gate, Originalanker-Minikarte, Variant-Level, Fallback nach Fehlern, Deaktivieren und Fehler-Feedback.
- [x] Lokale Community-Gruppen, Ordner und Deck-Kopie ohne fremde Reviewdaten.
- [x] Lokaler Deck-Graph, Chat-your-Deck mit Zitaten, Lernplan, AI-Job-Datenmodell und responsive, pfeilnavigierbare Heute-Jahres-Heatmap ohne horizontalen Slider.
- [x] Lokaler JSON-Export/-Import ohne Passwort-Verifier.
- [x] Modul-/Browser-Verifikation fuer die zentralen lokalen Pfade.
- [x] Supabase/Postgres-Schemaanker in `supabase/core_schema_v1.sql` mit RLS-Policies und Verify-Query dokumentiert.
- [x] Hosting-/Database-/KI-Guide in die zentrale Spezifikation ueberfuehrt und redundante Guide-Datei entfernt.
- [x] Supabase CLI lokal initialisiert und mit `CoRe-Database` verlinkt.
- [x] `supabase/core_schema_v1.sql` als erste Migration angewendet und RLS-/Policy-Verify gegen Remote ausgefuehrt.
- [x] Vercel-Projekt `core-hosted` angelegt, Env-Grenzen fuer oeffentliche `VITE_*`-Variablen gesetzt und Deployment verifiziert.

## Bewusst noch nicht bauen

- [ ] Keine generische Adapter-Schicht einfuehren, solange es nur einen lokalen Pfad und keinen entschiedenen Anbieter gibt.
- [ ] Keine weiteren produktiven Datenbankmigrationen schreiben, bevor Datenbank/Hosting-Stack, Auth-Flow und Medienstrategie entschieden sind.
- [ ] Keine externe LLM-Provider-Abstraktion bauen, bevor Provider, Datenschutzrahmen und Kostenmodell klar sind.
- [ ] Keine vollstaendige Sync-Engine bauen, bevor Auth, Server-Persistenz und Konfliktmodell feststehen.
- [ ] Keine Community-Rechteverwaltung vortaeuschen, solange es keine echten Nutzer, Rollen und Serverregeln gibt.

## P0: Lokalen MVP stabilisieren

- [ ] Smoke-Test-Skript fuer weitere wichtige Browser-Flows automatisieren: Review, Variante, KI-Draft, Assistent, Export.
- [ ] Accessibility-Pass fuer Review, Import und Settings durchfuehren: Fokusreihenfolge, Labels, Kontrast, Tastatur.
- [ ] Leere, fehlerhafte und grosse Eingaben fuer Text/CSV/Excel/APKG mit UI-Fehlermeldungen absichern.
- [ ] Version-Restore in der UI voll klickbar machen, nicht nur im Modell vorbereiten.
- [ ] Datenportabilitaet mit Roundtrip-Fixtures testen: Export alter Version, Import in frischen State, Konfliktfall, Learning-Item/Legacy-Card-Normalisierung.
- [ ] Bestehende lokale Demo-Daten als reproduzierbare Fixtures statt impliziter UI-Erzeugung pflegen.

## P1: Hosting und Produktivbetrieb vorbereiten

- [x] Zielplattform entscheiden; aktueller Startpfad: Vercel fuer Vite-Hosting, Preview/Production und eigene `/api/*` Functions.
- [ ] Domain-/DNS-Pfad dokumentieren: eigene Domain in Vercel verbinden, Preview-URLs getrennt halten, Production-Domain bewusst mappen.
- [ ] Build-/Preview-/Production-Pipeline ausbauen: `npm test`, `npm run build`, Preview Smoke, Production Rollback.
- [x] SPA-Routing fuer Vite/Vercel festlegen: statische App aus `dist`, Browser-Routen auf `index.html`, `/api/*` nicht umschreiben.
- [ ] Basale Runtime-Konfiguration einziehen: Umgebungsvariablen, App-Version, Fehlerseite.
- [x] Env-Var-Konzept festlegen: Browser nur `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, Featureflags; geheime KI-/Supabase-Keys nur serverseitig.
- [ ] Secret-Hygiene pruefen: keine KI-Keys in Browser-Code, `localStorage`, Export-State, Logs oder Supabase-Userdaten; Vercel Sensitive Env Vars nutzen.
- [ ] Produktives Logging/Monitoring-Konzept definieren, aber erst nach Hosting-Auswahl anbinden.
- [ ] Deployment-Checkliste erstellen: Build, Tests, Smoke, Rollback, Datenschutzhinweise, Netzwerk-Tab ohne Secrets, KI-Route mit/ohne Key.

## P1: Persistenz und Auth

- [x] Datenbank-Stack entscheiden; aktueller Startpfad: Supabase Auth + Postgres + RLS, perspektivisch Supabase Storage fuer Medien/Dokumente.
- [ ] `supabase/core_schema_v1.sql` gegen das aktuelle `src/coreModel.js` abgleichen: Learning Items, Original-Variantenanker, Review Events, Medienreferenzen, AI Jobs.
- [ ] Echte Tabellen statt grossen Store-Blob als Produktivquelle verwenden; JSONB nur fuer flexible Metadaten, Policies, Importrohdetails und Versionseintraege.
- [x] Supabase Grants + RLS als Einheit behandeln: Tabellen im exposed Schema explizit fuer `authenticated` freigeben, RLS aktivieren, Ownership-Policies pruefen.
- [ ] RLS-Tests definieren: Nutzer A sieht eigene Decks/Karten/Events, Nutzer B sieht sie nicht; Updates brauchen `using` und `with check`.
- [ ] Repository-Interface aus `createCoreRepository()` und lokale App-Kommandos aus `createCoreWorkspace()` als echte Persistenz-/Produktionsnaht schaerfen.
- [ ] Lokale IDs, Versionen und Review-Events auf serverfaehige Tabellen/Dokumente mappen.
- [ ] Echte Auth-Entscheidung treffen: E-Mail/Passwort, OAuth, Magic Link oder externer Anbieter; MVP darf cloud-first mit Login-Gate sein.
- [ ] Account-Recovery, Session-Gueltigkeit und Datenschutz-/Exportrechte spezifizieren.
- [ ] Migration von lokalem `localStorage` in Serverkonto definieren.

## P1: Dokumente, Medien und Import

- [ ] APKG-Fixtures weiter erweitern: Basic reversed, optional reversed, Cloze, Medienreferenzen, moderne MediaEntries, ungewohnte Note Types und echte `collection.anki21b`/Zstd-Beispiele.
- [ ] Notetype-/Template-Snapshots und Importidentitaeten gemaess `docs/anki-format-analysis.md` pruefen: Anki-GUID, Note-ID, Card-ID, Notetype-ID, Template-Ordinal, Deck-Pfad und Medienchecksums.
- [ ] Importbericht in der UI detailreicher machen: erkannte Decks, Warnungen, nicht gemappte Felder.
- [ ] Server-/Worker-Pfad fuer grosse APKGs und Medien entwerfen; Rust/WASM erst nach Benchmark echter Import-Hotpaths pruefen.
- [ ] Supabase Storage/Object-Storage-Strategie fuer APKG-Originale, extrahierte Medien, Dokumente und spaetere CDN-URLs festlegen.
- [ ] Browser-Importgrenzen definieren: grosse Decks und medienreiche APKGs serverseitig/workerbasiert verarbeiten, Fortschritt und Abbruch anbieten.
- [x] Erste browserseitige PDF-/Text-Textextraktion als Modul mit Fehlerstatus und formatierter Textanzeige umsetzen.
- [x] Minimalen visuellen PDF-Viewer im manuellen Dokumentmodus einbinden: PDF-Seiten sichtbar, CoRe-integrierte Viewer-Flaeche, Text markierbar, einfacher Klick ohne Uebernahme.
- [ ] DOCX-Textextraktion als echtes Modul planen, inklusive Fehlerfaellen.
- [ ] OCR, Bildregionen und erweiterte PDF-Werkzeuge erst nach textbasiertem Dokumentpfad priorisieren.
- [ ] Produktive Medienpersistenz fuer APKG-Assets bauen: Server-Ablage, stabile Referenzen, Sync, Export und Loeschregeln.
- [ ] Medienreferenzen fuer geteilte Decks stabil und datenschutzbewusst modellieren.

## P2: KI und Jobs produktionsfaehig machen

- [ ] Entscheiden, welche KI-Faehigkeiten echte LLMs brauchen: Kartenerstellung, Varianten, Graph, Chat.
- [ ] Provider- und Datenschutzentscheidung treffen, bevor externe Inhalte gesendet werden.
- [ ] Server-KI-Proxy entwerfen: Browser ruft nur eigene `/api/ai/*` Route auf; Provider-Key bleibt in Vercel/Supabase-Serverumgebung.
- [ ] Supabase-Session-Strategie fuer KI-Routen festlegen: erst Drafts zurueckgeben und Client speichert via RLS, spaeter User-Identitaet fuer Kostenlimits serverseitig pruefen.
- [ ] Job-Queue-Interface aus dem lokalen `aiJobs`-Modell ableiten.
- [ ] Idempotenz, Retry, Rate-Limits und Fehlerklassifikation fuer KI-Jobs spezifizieren.
- [ ] Prompt-/Schema-Versionierung fuer `aiOrchestrator` einfuehren.
- [ ] Eval-Datensatz fuer Halluzinationen, Quellenanker und Kartenqualitaet erstellen.
- [ ] Token-/Kostenlogging und Budgetgrenzen pro Nutzer/Deck planen.
- [ ] Abuse-Schutz fuer KI planen: Same-Origin, Request-Groessenlimit, Modell-Allowlist, Outputlimit, IP-/User-Rate-Limit, keine Secrets in Logs.

## P2: Scheduler, Varianten und Lernqualitaet

- [ ] FSRS-like Scheduler-Parameter gegen reale Lernsessions validieren: Stability, Difficulty, Desired Retention, Retrievability und Kurzintervall-Bias.
- [ ] Learning-Item-State, Varianten-State, Fallback-State und Family-State gegen reale Lernsessions validieren.
- [ ] Regeln fuer welche Kartentypen Varianten bekommen duerfen aus echten Decks nachschaerfen; Cloze-Familien, Reverse-Varianten und importierte Template-Ordnungen gesondert validieren.
- [ ] Variantenqualitaet aus Feedback ableiten: deaktiviert, fachlich falsch, schlecht formuliert.
- [x] Review-Queue fuer jetzt faellige Karten und neue Karten im lokalen Lernmodus nachvollziehbar anzeigen; bewertete Karten erscheinen erst wieder ab ihrem gespeicherten `dueAt`.
- [ ] Tastatur- und Mobile-Review weiter polieren.

## P2: Community und Teilen

- [ ] Echtes Mitglieder-, Rollen- und Einladungsmodell entwerfen.
- [ ] Serverregeln definieren: Geteilte Inhalte ja, fremde Review-Events nein.
- [ ] Ordner, Deck-Kopien und spaetere Varianten-Wiederverwendung mit Berechtigungen verbinden.
- [ ] Moderations- und Missbrauchsfaelle minimal beschreiben.
- [ ] Export/Import und Community-Kopie konsistent halten.

## P3: Sync, Mobile und Offline

- [ ] Entscheiden, ob zuerst responsive Web, PWA oder native App verfolgt wird.
- [ ] Offline-Queue fuer Review-Events erst nach Server-Persistenz entwerfen.
- [ ] Konfliktloesung fuer Kartenbearbeitung, Review-Events und Varianten definieren.
- [ ] Push-/Reminder-Konzept an Lernplan und Faelligkeit koppeln.

## P3: Produkt- und Wachstumsschicht

- [ ] Onboarding mit realen Zielgruppen testen: Medizin, Jura, Power-User.
- [ ] Kurs-/Hochschulfelder erst nutzen, wenn Community-Findung oder Deck-Empfehlungen konkret werden.
- [ ] Keine Social-Rankings einfuehren; Community bleibt ordner- und lerninhaltzentriert.
- [ ] Zahlungs-/Abo-Modell erst nach Hosting, Kostenmessung und KI-Budgetlogik diskutieren.

## Referenzen

- `docs/index.md`: Dokumentationskarte.
- `docs/specs.md`: Produkt-, Engineering-, Modul- und Implementierungs-Soll.
- `docs/specs.html`: navigierbare HTML-Version der Spezifikation.
- `docs/anki-format-analysis.md`: Differential- und Differenzanalyse des offiziellen Anki-Modells mit CoRe-Prioritaeten, Formatentscheidungen und Sprach-/Backend-Empfehlungen.
- `supabase/core_schema_v1.sql`: aktueller Supabase/Postgres-Schemaanker.
- `supabase/verify_schema_v1.sql`: RLS-/Policy-Verifikation.
- `src/coreFeatures.test.js`: groesster Modul-Test fuer die implementierten MVP-Pfade.
- `src/creationPipeline.test.js` und `src/learningModel.test.js`: aktuelle Tests fuer Learning-Item-Erstellung, Variantenanker und Legacy-Kompatibilitaet.
- `src/fsrsVariantFlow.test.js`: FSRS-like Scheduler, Variant-Readiness, Coverage, Fallback und Next-Review-Projektion.
