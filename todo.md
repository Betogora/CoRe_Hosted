# CoRe ToDo

Stand: 2026-07-01

Diese Datei beschreibt die Differenz zwischen Soll-Spezifikation (`specs.md` / `specs.html`) und aktuellem Codebase-Ist. Der aktuelle Stand ist ein lokaler Vite/React-Web-MVP mit `localStorage`, lokalen Deep Modules und testbaren Produktpfaden. Er ist noch kein gehostetes Mehrnutzerprodukt.

## Aktuell erledigt

- [x] Lokale Navigation fuer Dashboard, Decks, Erstellen, Lernen, Graph, Community, KI-Jobs, Assistent und Einstellungen.
- [x] Persistenter lokaler App-State ueber `src/coreRepository.js`.
- [x] Deck-/Kartenmodell mit Review-State, Quellenankern, Versionen, Varianten und CoRe-Modus.
- [x] APKG-Basic-Import mit Mapping, Importbericht, HTML-Sanitization und Raw-/Fallback-Feldern.
- [x] Text-, CSV- und Excel-/Tabellen-Paste-Import.
- [x] Manuelle Kartenanlage mit Dokumentkontext und Auswahl-zu-Feld.
- [x] Lokale KI-Drafts aus Quellentext mit Schema-Validation und Draft-Annahme.
- [x] Fullscreen-Review mit Antwortaufdeckung, vier Ratings, Tastatursteuerung und Review-Events.
- [x] Content-Repetition-Varianten mit Eligibility, Reifegrad-Gate, Originalanker, Deaktivieren und Fehler-Feedback.
- [x] Lokale Community-Gruppen, Ordner und Deck-Kopie ohne fremde Reviewdaten.
- [x] Lokaler Deck-Graph, Chat-your-Deck mit Zitaten, Lernplan und AI-Job-Uebersicht.
- [x] Lokaler JSON-Export/-Import ohne Passwort-Verifier.
- [x] Modul-/Browser-Verifikation fuer die zentralen lokalen Pfade.

## Bewusst noch nicht bauen

- [ ] Keine generische Adapter-Schicht einfuehren, solange es nur einen lokalen Pfad und keinen entschiedenen Anbieter gibt.
- [ ] Keine Datenbankmigrationen schreiben, bevor Datenbank/Hosting-Stack entschieden sind.
- [ ] Keine externe LLM-Provider-Abstraktion bauen, bevor Provider, Datenschutzrahmen und Kostenmodell klar sind.
- [ ] Keine vollstaendige Sync-Engine bauen, bevor Auth, Server-Persistenz und Konfliktmodell feststehen.
- [ ] Keine Community-Rechteverwaltung vortaeuschen, solange es keine echten Nutzer, Rollen und Serverregeln gibt.

## P0: Lokalen MVP stabilisieren

- [ ] Smoke-Test-Skript fuer die wichtigsten Browser-Flows automatisieren: Demo/Import, Review, Variante, KI-Draft, Assistent, Export.
- [ ] Accessibility-Pass fuer Review, Import und Settings durchfuehren: Fokusreihenfolge, Labels, Kontrast, Tastatur.
- [ ] Leere, fehlerhafte und grosse Eingaben fuer Text/CSV/Excel/APKG mit UI-Fehlermeldungen absichern.
- [ ] Version-Restore in der UI voll klickbar machen, nicht nur im Modell vorbereiten.
- [ ] Datenportabilitaet mit Roundtrip-Fixtures testen: Export alter Version, Import in frischen State, Konfliktfall.
- [ ] Bestehende lokale Demo-Daten als reproduzierbare Fixtures statt impliziter UI-Erzeugung pflegen.

## P1: Hosting und Produktivbetrieb vorbereiten

- [ ] Zielplattform entscheiden: Vercel/Netlify/anderes Hosting, plus Umgebungsstrategie.
- [ ] Build-/Preview-/Production-Pipeline dokumentieren.
- [ ] Basale Runtime-Konfiguration einziehen: Umgebungsvariablen, App-Version, Fehlerseite.
- [ ] Produktives Logging/Monitoring-Konzept definieren, aber erst nach Hosting-Auswahl anbinden.
- [ ] Deployment-Checkliste erstellen: Build, Tests, Smoke, Rollback, Datenschutzhinweise.

## P1: Persistenz und Auth

- [ ] Datenbank-Stack entscheiden und Datenmodell aus `src/coreModel.js` ableiten.
- [ ] Repository-Interface aus `createCoreRepository()` und lokale App-Kommandos aus `createCoreWorkspace()` als echte Persistenz-/Produktionsnaht schaerfen.
- [ ] Lokale IDs, Versionen und Review-Events auf serverfaehige Tabellen/Dokumente mappen.
- [ ] Echte Auth-Entscheidung treffen: E-Mail/Passwort, OAuth, Magic Link oder externer Anbieter.
- [ ] Account-Recovery, Session-Gueltigkeit und Datenschutz-/Exportrechte spezifizieren.
- [ ] Migration von lokalem `localStorage` in Serverkonto definieren.

## P1: Dokumente, Medien und Import

- [ ] APKG-Fixtures erweitern: Basic reversed, Cloze, Medienreferenzen, ungewohnte Note Types.
- [ ] Importbericht in der UI detailreicher machen: erkannte Decks, Warnungen, nicht gemappte Felder.
- [ ] Server-/Worker-Pfad fuer grosse APKGs und Medien entwerfen.
- [ ] PDF-/DOCX-Textextraktion als echtes Modul planen, inklusive Fehlerfaellen.
- [ ] OCR und Bildregionen erst nach textbasiertem Dokumentpfad priorisieren.
- [ ] Medienreferenzen fuer geteilte Decks stabil und datenschutzbewusst modellieren.

## P2: KI und Jobs produktionsfaehig machen

- [ ] Entscheiden, welche KI-Faehigkeiten echte LLMs brauchen: Kartenerstellung, Varianten, Graph, Chat.
- [ ] Provider- und Datenschutzentscheidung treffen, bevor externe Inhalte gesendet werden.
- [ ] Job-Queue-Interface aus dem lokalen `aiJobs`-Modell ableiten.
- [ ] Idempotenz, Retry, Rate-Limits und Fehlerklassifikation fuer KI-Jobs spezifizieren.
- [ ] Prompt-/Schema-Versionierung fuer `aiOrchestrator` einfuehren.
- [ ] Eval-Datensatz fuer Halluzinationen, Quellenanker und Kartenqualitaet erstellen.
- [ ] Token-/Kostenlogging und Budgetgrenzen pro Nutzer/Deck planen.

## P2: Scheduler, Varianten und Lernqualitaet

- [ ] Scheduler-Strategie entscheiden: einfacher MVP, SM-2-nahe Logik oder FSRS-Integration.
- [ ] Varianten-State mit Family-State gegen reale Lernsessions validieren.
- [ ] Regeln fuer welche Kartentypen Varianten bekommen duerfen aus echten Decks nachschaerfen.
- [ ] Variantenqualitaet aus Feedback ableiten: deaktiviert, fachlich falsch, schlecht formuliert.
- [ ] Review-Queue fuer faellige Karten, neue Karten und Varianten nachvollziehbar anzeigen.
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

- `specs.md`: Produkt-, Engineering-, Modul- und Implementierungs-Soll.
- `specs.html`: navigierbare HTML-Version der Spezifikation.
- `src/coreFeatures.test.js`: groesster Modul-Test fuer die implementierten MVP-Pfade.
