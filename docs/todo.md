# CoRe TODO

Stand: 2026-10-08

Dieses Dokument enthält ausschließlich offene Arbeit. Es beschreibt die
Roadmap für das neue Kartenmodell nach [ADR-032 bis ADR-036](decisions.md).
Ausführbare Gates stehen in [`operations.md`](operations.md) und
[`test-portfolio.md`](test-portfolio.md), der heutige Ist-Stand in
[`status.md`](status.md), abgeschlossene Nachweise in [`history.md`](history.md).

Die Roadmap ist bewusst ausführlich. Sie richtet sich an das Modell, das sie
umsetzt, und beantwortet je Aufgabe: **was**, **wo**, **wie**, **wann fertig**,
**was ausdrücklich nicht** und **welche Prüfung**. Wo eine Geschmacks- oder
Produktentscheidung offen ist, steht ein Standard; abweichen nur nach Rückfrage.

## Ziel

CoRe besitzt ein dauerhaft stabiles Kartenmodell:

- Ein Inhalt existiert genau einmal; seine Karten sind leichte planbare
  Abfragen mit eigenem Lernstand (ADR-032).
- Es gibt keine Kartentypen, sondern ein universelles Inhaltsformat aus Feldern
  mit Rolle und optionalen Bausteinen, immer im CoRe-Design (ADR-033).
- Jede gängige APKG-Datei der letzten Anki-Generationen wird vollständig
  übernommen: Stapelbaum, Inhalte, Medien, Lernstand und Sonderformate wie
  Lückentext, Image Occlusion, Hinweise, Eintippen, Multiple Choice, Formeln
  und Links (ADR-033, ADR-035).
- Die Speicherung ist relational, schlanker als heute und ohne Umbau als
  SQLite-Replik einer späteren App spiegelbar (ADR-034, ADR-036).
- Eine Format-Matrix sichert das automatisch ab (ADR-035).

## Arbeitsregeln für diese Roadmap

- **Feature-Freeze:** Bis Phase 5 abgenommen ist, entstehen keine neuen
  Karten-, Editor- oder Importfunktionen außerhalb dieser Roadmap. Fehler im
  alten Pfad werden nicht dort repariert, sondern im neuen Modell geschlossen;
  die Matrix führt sie bis dahin in `KNOWN_GAPS`.
- **Tests zuerst:** Jede Lücke wird zuerst als offene Erwartung in der Matrix
  sichtbar (Phase 1) und gilt erst mit grüner Matrixzeile als geschlossen.
- **Keine Parallelpfade:** Altes Modell, alte Typen, alte Tabellen und alte
  Renderpfade werden in derselben Phase entfernt, in der ihr Ersatz fertig ist.
  Es gibt keine Migration und keinen Altlesepfad (ADR-028). „Fertig“ heißt
  hier: in der App verdrahtet. Neue, noch unverdrahtete und vollständig
  getestete Module aus Phase 2, 3 und 5A sind kein Parallelpfad; der
  Laufzeitwechsel und das Löschen des Altpfads geschehen gemeinsam im Cutover
  (Phase 4).
- **Vollständiger Cutover erlaubt:** Wo der Umbau es braucht, dürfen
  Supabase-Tabellen, Storage-Objekte, Auth-Testkonten und lokale
  IndexedDB-Bestände verworfen und neu aufgebaut werden. Für bestehende Daten
  entsteht kein Umwandlungs- oder Legacy-Code; sie bleiben nur erhalten, wenn
  sie ohne zusätzlichen Code weiter funktionieren. Persistierte Daten ändern
  sich erst in Phase 4 (K4.1, K4.5, K4.7, K4.8); Phase 0 bis 3 schreiben keine
  Bestandsdaten um. Der gehostete Reset folgt den Sicherheitsregeln aus
  ADR-028. Diese Erlaubnis gilt nur vor dem ersten extern genutzten Release.
- **Dokumentation pro Phase:** Wenn eine Phase ihren Vertrag ändert, werden
  `specs.md`, `architecture.md`, `status.md`, `anki-format-analysis.md`,
  `test-portfolio.md`, `AGENTS.md` und der Kartentypen-Katalog in derselben
  Phase angepasst; erledigte Punkte wandern datiert nach `history.md` und
  werden hier entfernt.
- **Messen statt annehmen:** Performance- und Speicherziele werden gegen eine
  vor Phase 2 erhobene Ausgangsmessung nachgewiesen.
- **Lizenzgrenze:** Anki- und Add-on-Code wird nur gelesen, nie kopiert.
  Realwelt-Stapel bleiben lokal.
- **Commit und Push nur nach Rückfrage beim Nutzer.** Vor jedem Commit am Ende
  einer Aufgabe oder Phase den Skill `audit-last-change` ausführen, temporäre
  Probe-Dateien ausschließlich im Scratchpad anlegen und vor dem Commit
  sicherstellen, dass keine im Repository liegen.
- **Gemeinsamer Arbeitsordner:** Andere arbeiten im selben Checkout. Keine
  Branchwechsel in diesem Ordner ohne Absprache; zurückgestellte Arbeit (etwa
  `archive/noemi-anki-fixes`) nur mit `git show <commit>` lesen.

## So arbeitet das ausführende Modell mit dieser Roadmap

1. Vor Beginn lesen: `AGENTS.md`, ADR-028 sowie ADR-032 bis ADR-036 in
   `decisions.md`, die betroffenen Abschnitte von `architecture.md` und diese
   Phase vollständig. Für Anki-Formatfragen `anki-format-analysis.md`.
2. Eine Aufgabe (K-Nummer) nach der anderen in der angegebenen
   Ausführungsreihenfolge umsetzen. Innerhalb einer Aufgabe zuerst den Test
   schreiben oder die Matrixerwartung prüfen, dann implementieren.
3. Nach jeder Aufgabe die unter „Prüfung“ genannten Befehle ausführen. Rote
   Prüfungen nicht durch Lockern von Tests oder neue `KNOWN_GAPS`-Einträge
   „grün machen“. Ein neuer `KNOWN_GAPS`-Eintrag ist nur für eine bisher
   unentdeckte Lücke zulässig, die eindeutig zu einer späteren K-Nummer gehört.
   Er nennt diese Nummer.
4. Am Phasenende: Abnahme prüfen, `audit-last-change` ausführen, Doku nach
   „Dokumentation pro Phase“ pflegen, `history.md`-Eintrag schreiben, die
   erledigten Punkte hier entfernen und den Nutzer um Commit-Freigabe bitten.
5. **Den Nutzer fragen, wenn** eine sichtbare Gestaltung mehrere plausible
   Varianten hat und kein Standard unten steht (dafür den Skill
   `visual-ab-review` nutzen), eine Aufgabe ohne Vertragsänderung nicht
   lösbar ist, ein Gate rot bleibt und der Fix außerhalb des Roadmap-Umfangs
   läge, oder vor jedem destruktiven Schritt an gehosteten Daten (K4.8).
6. Nicht fragen, sondern dem Standard folgen, wenn diese Roadmap eine Lösung
   vorgibt. Abweichungen vom Standard im Phasenbericht begründen.

## Ausführungsreihenfolge und Integrationsstrategie

Die Phasennummern bleiben stabil, weil `KNOWN_GAPS` und `history.md` auf die
K-Nummern verweisen. Ausgeführt wird in dieser Reihenfolge:

```text
Phase 0   Ausgangsmessung und Inhaltsschema            ✔ abgeschlossen
Phase 1   Format-Matrix und Realwelt-Korpus            ✔ abgeschlossen
Phase 2   Kanonisches Modell (reine Module)            ✔ abgeschlossen, unverdrahtet
Phase 3   Renderer und Bausteine (reine Module)        implementiert, unverdrahtet; Gerätenachweise offen
Phase 5A  Übersetzer und Importgraph (reine Module)    ✔ abgeschlossen, unverdrahtet; Korpus offen
Phase 4   Cutover: Datenbank, Replica, Sync, App       eigener Branch, ein Merge
          + K2.4–K2.6, K5.4, K5.7, K5.8/K5.9-App      (im Cutover verdrahtet)
Phase 6   Erstellen, Bearbeiten, Verwaltung, KI        auf main
Phase 7   Begraben von Geschwistern                     auf main
Phase 8   Gesamtabnahme
```

Warum so: Wer `LearningItem` vor dem Datenbankumbau entfernt, bricht
Persistenz, Sync, Import und Screens gleichzeitig und müsste
Übergangscode schreiben. Stattdessen entstehen Modell, Renderer und Übersetzer
zuerst als reine, vollständig getestete TypeScript-Module. Die Matrix prüft
schon vor dem Cutover gegen die neue Pipeline. Der Cutover
verdrahtet dann alles in einem Zug und löscht den Altpfad.

**Branch für den Cutover:** `kartenmodell-cutover`, abgezweigt vom dann
aktuellen `main` erst nach Abnahme von Phase 5A. Zwischencommits auf dem Branch
dürfen die App vorübergehend unvollständig lassen. Der Merge nach `main`
erfolgt einmal, nach grüner Phase-4-Abnahme und Freigabe durch den Nutzer.

## Geschmacks- und Produktstandards

Diese Standards gelten, solange der Nutzer nichts anderes entscheidet. Alle
sichtbaren Elemente verwenden die semantischen Tokens aus `src/styles.css` und
vorhandene Module aus `src/ui/README.md`; neue Farben, Schatten oder Radien
werden nicht frei erfunden.

| Thema | Standard |
| --- | --- |
| Anweisung (fester Vorlagentext) | Klein, gedämpfte Textfarbe, über der Frage; nie auf der Rückseite wiederholt. |
| Frage und Antwort | Ohne Feldbeschriftung. Beim Aufdecken bleibt die Frage stehen, darunter genau eine Trennlinie (wie heute `core-card-answer-separator`) und die Antwort. |
| Hinweis | Pro Hinweisfeld ein zugeklapptes `details`/`summary` mit dem Feldnamen als Beschriftung, unter der Frage, vor dem Aufdecken bedienbar, per Tastatur erreichbar. Kein Script im Kartenrahmen. |
| Zusatz (Extra) | Erst nach dem Aufdecken, unter der Antwort, mit kleinem gedämpftem Feldnamen als Überschrift. |
| Quelle | Erst nach dem Aufdecken als Link-Chips am Kartenende, mit Lucide-Icon `ExternalLink`; reiner Text ohne Link als normaler Absatz mit Feldnamen. |
| Notiz | Wird im Review nicht gezeigt, nur im Editor. |
| Lückentext | Aktive Lücke als `[…]` beziehungsweise `[Hinweis]` mit Akzent-Hintergrund; andere Lücken ausgeschrieben. Beim Aufdecken ersetzt die gefüllte Fassung die Vorderseite an derselben Stelle; die zuvor aktive Lücke bleibt farblich hervorgehoben. |
| Bildverdeckung | Masken als SVG über dem Bild; aktive Gruppe in Akzentfarbe, übrige Masken neutral gedeckt; Rückseite entfernt die aktive Maske und zeigt nur ihren Umriss. |
| Eintippen | Eingabefeld unter der Frage im Review-Host mit Beschriftung `Antwort eingeben`; Enter deckt auf; danach zeichengenauer Vergleich wie in Anki (richtig grün, falsch rot, fehlend unterstrichen) mit den Beschriftungen `Deine Antwort` und `Richtig`. |
| Auswahl | Single Choice deckt nach Auswahl direkt auf; Multiple Choice und Kprim über `Antwort prüfen`. Kprim zeigt je Aussage die Auswahl `richtig`/`falsch`. Feedback im vorhandenen Stil der heutigen Choice-Darstellung. |
| Formeln | `\(…\)` inline, `\[…\]` als abgesetzter Block, beide mit KaTeX; bei Renderfehler bleibt der Quelltext in Monospace sichtbar mit Diagnose. |
| Farbiger Feldtext | Farbe bleibt erhalten; unterschreitet sie 4,5 : 1 Kontrast zum Kartenhintergrund des aktiven Themes, wird nur die Helligkeit angepasst (`src/ui/colorMath.ts`). |
| Löschen | Anki-Verhalten nach ADR-032; Dialogtext nennt die Kartenzahl, z. B. `Inhalt mit 3 Karten löschen?`. |
| Neu übersetzen (K5.4) | Entschieden: automatisch nach einem Übersetzer-Update, nur für Inhalte ohne lokale Bearbeitung und ohne Verlust von Karten mit Lernstand; danach ein kurzer Hinweis, etwa `1.234 Inhalte mit verbesserter Darstellung aktualisiert`. |

## Phase 0 — Ausgangsmessung und Inhaltsschema

Abgeschlossen am 2026-10-06 (siehe `history.md`). Die Ausgangsmessung ist mit
`npm run measure:footprint`, `npm run performance:measure:local` und
`npm run benchmark:apkg` reproduzierbar. Das Inhaltsschema `NoteContent` mit
Validierung und Abfrageableitung liegt in `src/coreModel/noteContent.ts`, der
Feld-HTML-Vertrag in `sanitizeNoteHtml` (`src/htmlSafety.ts`); beide sind noch
nicht an Erstellung, Import oder Darstellung angeschlossen.

Merkwerte der Ausgangsmessung für spätere Vergleiche: 1.000 Lückentext-Notizen
mit je vier Lücken belegen 23,84 MiB in Postgres und 23,95 MiB Sync-Volumen;
neues Gerät bis Dashboard p75 3.958,8 ms (Budget 3.000 ms, bereits rot);
APKG-Benchmark 10,2 s Workerzeit bei 425 MiB Heap.

## Phase 1 — Format-Matrix und Realwelt-Korpus

Abgeschlossen am 2026-10-06 (siehe `history.md`). Die Matrix liegt in
`fixtures/apkg/matrix/` und wird mit `npm run fixtures:apkg-matrix` erzeugt.
`src/apkgFormatMatrix.test.ts` prüft sie im Contract-Gate. Offene Lücken stehen
ausschließlich und streng in dessen `KNOWN_GAPS`; jede Phase entfernt dort die
Einträge, die sie schließt. Der Realwelt-Korpus läuft mit
`npm run report:apkg-corpus` aus dem gitignorierten Ordner
`fixtures/apkg/corpus/`. Die visuellen Referenzfälle stehen in der
[visuellen Pflichtmatrix](operations.md#visuelle-pflichtmatrix). Echte Stapel
(Ankizin, AnKing) stellt der Nutzer später bereit; bis dahin gelten die
Nachbauten aus der Matrix.

Hinweise zur Matrix für alle folgenden Phasen:

- Paket und Erwartung werden immer gemeinsam mit
  `npm run fixtures:apkg-matrix` neu erzeugt (benötigt `anki==26.5`); Anki
  vergibt zeitbasierte IDs. `apkg-matrix.expected.json` nie von Hand bearbeiten,
  sondern die Zielerwartung im Generator `scripts/create_apkg_matrix_fixtures.py`
  ändern.
- Eine `KNOWN_GAPS`-Zeile verschwindet genau in dem Commit, der die Lücke
  schließt. Der Test erzwingt das: Eine geschlossene, aber noch gelistete Lücke
  schlägt fehl.
- Eine Zielerwartung darf nur geändert werden, wenn sie nachweislich von Ankis
  tatsächlichem Verhalten oder einer ADR abweicht; die Begründung gehört in den
  Phasenbericht.

## Phase 2 — Kanonisches Modell in TypeScript

Abgeschlossen am 2026-10-06 (siehe `history.md`). `Note`, `Card` und
`CardStudyState` sind ergänzt; `src/coreModel/notes.ts` enthält vollständig
getestete Erstellung, Änderungsabgleich und Löschplanung mit Undo-Zustand.
Die Funktionen sind noch nicht an App, Import oder Persistenz angeschlossen.
Die verbleibende Verdrahtung von K2.2, K2.4, K2.5 und K2.6 liegt in K4.9;
das Lese-/Schreibinventar für den Scheduler-Cutover steht im Phasenbericht.

## Phase 3 — Offene Abnahme

Renderer und Host-Bausteine sind implementiert und im UI-Katalog verfügbar.
Die Umsetzung von K3.1 bis K3.10 und ihre Nachweise stehen datiert in
`history.md`; die technischen Verträge stehen in `architecture.md`.
App, APKG-Import und Persistenz verwenden sie erst im Cutover (K4.10).

- [ ] **Gerätenachweise ergänzen.** Echte Smartphone-Bildschirmtastatur,
      physischer Touch/Screenreader, hörbare System-Sprachausgabe und nativer
      200-%-Browserzoom sind noch nicht geprüft. Die Chromium-Matrix und
      CSS-Zoomprobe ersetzen diese Nachweise nicht.

Realwelt-Inhalte werden über die neue Pipeline abgenommen, nicht über die
vorbereiteten normalisierten Katalogbeispiele (Abnahme Phase 5).

## Phase 5 — APKG-Import und Übersetzer

**5A ist abgeschlossen** (siehe `history.md`): `readAnkiPackage` und
`translateAnkiPackage` (`src/apkgNoteTranslation.ts`) übersetzen Pakete in den
Importgraphen; die APKG-Matrix beobachtet diese Pipeline und ist ohne
`KNOWN_GAPS` grün. Den Vertrag beschreibt `architecture.md`. Offen sind die
an Persistenz und Oberfläche gebundenen Teile (5B, im Cutover) und zwei
Nachweise, die echte Anki-Daten brauchen.

- [ ] **K5.2 Drehung und Textgröße der Bildmasken prüfen.** Der Renderer dreht
      Rechteck und Ellipse um ihre linke obere Ecke und Polygone um die
      Bildmitte, jeweils in der auf 0–1 gestreckten Maskenfläche; bei nicht
      quadratischen Bildern verzerrt das gedrehte Masken. Textbeschriftungen
      nutzen `scale` als Vielfaches der Kartenschrift; Ankis Schriftgröße `fs`
      wird noch nicht gelesen. Beides mit im Anki-Editor gezeichneten, gedrehten
      Masken und Beschriftungen abgleichen und im Renderer korrigieren (Drehung
      im Bildseitenverhältnis, Ankis Drehpunkt und Schriftgröße). Die Matrix
      kann das nicht belegen, weil ihre Masken als Text erzeugt werden.
      Befund aus Ankis Editor-Code (26.9): Masken sind fabric.js-Objekte mit
      Ursprung links oben; gespeichert werden `left`/`top` (normiert auf
      Bildbreite bzw. -höhe), `angle` in Grad, Rechtecke mit `width`/`height`,
      Ellipsen mit `rx`/`ry`, Polygone mit `left`/`top` und absoluten
      `points`, Text mit `text`, `scale` und `fs` (Schriftgröße relativ zur
      Bildhöhe), optional `fill`. Gedreht wird also in Pixeln um die linke
      obere Ecke. Der Matrixgenerator schreibt Ellipsen noch mit
      `width`/`height`; auf `rx`/`ry` umstellen. Referenz:
      `CoRe_Bildverdeckung_nativ.apkg` im Korpus (alle Formen, gedreht, Text in
      zwei Größen, Gruppe, Füllfarbe, beide Modi, 2:1-Bild); in Anki
      importiert zeigt Ankis eigener Reviewer die Sollansicht.
- [ ] **K5.10 Image Occlusion Enhanced als CoRe-Masken.** Entschieden
      2026-10-08 (Ergänzung zu ADR-033): Der IOE-Übersetzer baut aus den
      SVG-Masken echte CoRe-Masken statt einer `overlay`-Maske. Je IOE-Inhalt
      ist die Maske mit `class="qshape"` die aktive Abfrage; im Modus `ao`
      (alle verdecken, eine erraten) bleiben die übrigen Masken als
      `alwaysOccluded` verdeckt, im Modus `oa` entfallen sie. Koordinaten
      werden über `width`/`height` des SVG auf 0–1 normiert; die Add-on-Farben
      entfallen. Dafür braucht der Plan Zugriff auf die Medienbytes des
      Pakets. Nur Masken mit unbekannten Elementen (`path`, `text`,
      `transform`) bleiben `overlay`. Beleg: Das echte Deck
      `Image_Occlusion_Test_Pharmagrundlagen.apkg` enthält ausschließlich
      ungedrehte `rect`-Masken in beiden Modi. Matrixerwartung im Generator
      anpassen, `architecture.md` (Form `overlay`) mitziehen. Reines Modul,
      unabhängig vom Cutover umsetzbar.
- [ ] **K5.4 Anki-Vorlage speichern und neu übersetzen (5B, im Cutover).**
      `noteTypeSources` und die rohen Feldwerte `noteSources` aus dem
      Importgraphen landen unsichtbar in `note_type_sources` und
      `note_sources`. Nach einem Übersetzer-Update (`translator.version`)
      übersetzt CoRe bestehende Importe **automatisch** neu (Entscheidung des
      Nutzers 2026-10-07, ADR-033).
      Leitplanken: (1) nur Inhalte ohne lokale Bearbeitung
      (`contentRevision` = `importedContentRevision`; beide steigen gemeinsam);
      (2) Karten werden über `ankiCardId` zugeordnet, Lernstand bleibt
      unangetastet, neue Abfragen werden neue Karten; würde eine Karte mit
      Lernstand entfallen, bleibt der Inhalt unverändert und wird berichtet;
      (3) deterministisch und einmal je Account im Hintergrund, synchronisiert
      wie eine normale Änderung, unveränderte Inhalte werden nicht geschrieben
      (`changed: false`); (4) ein kurzer Hinweis nennt die Zahl aktualisierter
      Inhalte. Übersetzer-Verbesserungen werden gebündelt ausgeliefert, weil
      jede Version betroffene Inhalte neu synchronisiert.
- [ ] **K5.7 Reimport (5B, im Cutover).** Inhalte über Anki-GUID, Karten über
      Anki-Kartenidentität zuordnen; lokale Inhaltsänderungen, Lernstand,
      Aussetzung, Markierung und Stapelordnung bleiben; neue Lücken erzeugen
      neue Karten; in Anki entfallene Karten werden nur berichtet.
  - **Lokal bearbeitet** heißt: `contentRevision` größer als
    `importedContentRevision`. Speichern ohne inhaltliche Änderung erhöht die
    Revision nicht (`planNoteContentChange` meldet `changed: false`). Ein
    Reimport ohne lokale Bearbeitung setzt beide Werte gemeinsam neu.
- [ ] **K5.8 Großstapel in der App (5B, im Cutover).** Der Worker erhält die
      `File` statt eines ArrayBuffers und verwendet `readAnkiPackage`; die
      sichtbare Grenze steigt von 250 MB auf 2 GiB (`ANKI_PACKAGE_MAX_BYTES`
      ersetzt `LOCAL_APKG_MAX_BYTES`), die Dateiauswahl akzeptiert `.colpkg`.
      Medienbytes werden erst beim Commit einzeln gelesen und gegen ihre SHA-1
      geprüft. `specs.md` (Dateigrenzen) und `FileDropField` mitziehen.
- [ ] **K5.9 Importbericht in der Oberfläche (5B, im Cutover).** Vorschau und
      Abschluss in `src/screens/ApkgImportPanel.tsx` zeigen aus
      `report.notetypes` je Notiztyp Übersetzer, Inhalte, Karten, generisch
      übersetzte und nicht zugeordnete Felder, fehlende Medien und übernommenen
      Lernstand. Die heutigen Warnungen des Altpfads (etwa „produktive
      Medienablage bleibt ein späterer Ausbaupunkt“) entfallen mit ihm.

**Prüfung:** `npx tsx --test src/apkgNoteTranslation.test.ts
src/apkgFormatMatrix.test.ts`, `npm run typecheck`, `npm test`,
`npm run benchmark:apkg`, `npm run benchmark:apkg:large`, mit Korpus
`npm run report:apkg-corpus`.

**Abnahme (offen):** Golden-Flow APKG und Medien-E2E grün (nach dem Cutover);
mit bereitgestelltem Korpus sind mindestens 95 % der Ankizin- und
AnKing-Inhalte voll übersetzt und 0 % nicht darstellbar. Für Ankizin v5 belegt
(99,9 % Lückentexte über den eigenen Übersetzer, Blickdiagnosen generisch,
0 % nicht darstellbar; siehe `history.md`). Echte Image-Occlusion-Enhanced-
Inhalte, Ankis eingebaute Bildverdeckung (im Format des Anki-Editors erzeugt)
und ein echter Export mit FSRS-Lernstand und Revlog sind belegt (siehe
`history.md`). Offen bleiben AnKing und ein Lernstand mit Lern-,
Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten; diese Zustände
sind bis dahin nur über die Matrix synthetisch belegt.

## Phase 4 — Cutover: Datenbank-Baseline, Replica, Sync und App

**Ziel:** Die App läuft vollständig auf `Note`/`Card`, neuem Renderer und
neuer Importpipeline. Der Altpfad ist gelöscht. Ausgeführt nach Phase 5A auf
dem Branch `kartenmodell-cutover`.

**Vorgehen in dieser Reihenfolge:** K4.1 → K4.4 → K4.3 → K4.2 → K4.5 → K4.6 →
K4.7 → K4.9 → K5.4/K5.7/K5.8/K5.9 (App) → K4.10 → K4.11 → Gates → K4.8 nach
Freigabe.

- [ ] **K4.1 Neue Baseline.** Eine einzige frische Migration ersetzt die
      heutige: `decks`, `notes`, `cards` mit typisierten Lernstandsspalten,
      `note_type_sources` (unsichtbare Anki-Vorlage je Notiztyp),
      `note_sources` (rohe Anki-Feldwerte je importiertem Inhalt),
      `media_files` je Account und SHA-1, `note_media`, `card_variants`,
      `review_events`, `review_statistics_daily`, `sync_devices`,
      `sync_conflicts`. `note_type_definitions` und gespeichertes Karten-HTML
      entfallen.
  - **Wo:** neue Datei per `npx supabase migration new kartenmodell_baseline`;
    die alte Baseline
    `supabase/migrations/20260817190000_prerelease_replica_v2_baseline.sql`
    wird gelöscht (ADR-028, Cutover erlaubt). Vorhandene Funktionen,
    Trigger und Policies der alten Baseline als Vorlage lesen.
  - **Spalten (Richtwert):** `notes(user_id, id, anki_guid, content jsonb,
    search_text, sort_text, source, note_type_source_id, translator_id,
    translator_version, import_revision, content_revision, …Sync-Spalten)`;
    `cards(user_id, id, note_id, deck_id, prompt_key, anki_card_id, status,
    marked, anki_flag, state, due_at, stability, difficulty, reps, lapses,
    interval_days, learning_step_index, last_reviewed_at, last_rating,
    study_extra jsonb, source_scheduler jsonb, …Sync-Spalten)` mit
    `unique(user_id, note_id, prompt_key)`; `media_files(user_id, sha1, size,
    mime_type, storage_path, original_name)` mit Primärschlüssel
    `(user_id, sha1)`; `note_media(user_id, note_id, sha1)`. Sync-Spalten wie
    heute (`sync_change_id`, `revision`, `deleted_at`,
    `updated_by_device_id`).
  - **Indizes:** fällige Karten je Stapel (`user_id, deck_id, due_at` mit
    `status = 'active'`), `cards(user_id, note_id)`, Sync-Indizes wie heute.
    Zusätzlich, weil die alte Baseline hier ungestützt scannt: ein
    `pg_trgm`-GIN-Index auf `notes.search_text` für die Inhaltssuche (die
    alte Suche filtert per `position()` jede Zeile) und ein Index, der die
    Prüfung auf neuere Reviewereignisse derselben Karte in der atomaren
    Reviewaufzeichnung trägt (z. B. `review_events(user_id, card_id,
    answered_at)`; heute fehlt ein Index auf `source_card_id`).
- [ ] **K4.2 Projektionen prüfen.** Für `card_catalog` und
      `deck_study_summaries` wird gemessen, ob direkte Indizes auf `cards` und
      `notes` die Grenzen der Ausgangsmessung halten. Nur gerechtfertigte Projektionen
      bleiben. Messung mit `npm run performance:measure:local`
      (100k-Kartensuche, Statistik-RPC) und angepasstem
      `supabase/benchmark_replica_v2.sql`. Der Benchmark misst zusätzlich
      den Bootstrap, die atomare Reviewaufzeichnung und einen
      Import-Schreibbatch; diese Pfade sind heute ungemessen, Rückschritte
      dort fielen keinem Gate auf. Die Messung „Neues Gerät bis Dashboard“
      wird nach Phasen aufgeschlüsselt (Netz und Anmeldung, Bootstrap-RPC,
      IndexedDB-Schreiben, erste Stapelzusammenfassung, Rendern) und das
      Ergebnis im Phasenbericht festgehalten.
- [ ] **K4.3 RPCs.** Atomare Reviewaufzeichnung auf Kartenspalten, Bootstrap,
      Katalog-Delta, Hydrierung von Karten mit ihren Inhalten,
      Offline-Manifest, Stapelbaum-Löschung mit Anki-Regel für verwaiste
      Inhalte, Statistik. Vorlagen: `record_review_atomic`,
      `get_account_bootstrap_v2`, `pull_account_catalog_delta`,
      `list_account_card_catalog`, `hydrate_account_cards`,
      `get_deck_offline_manifest`, `get_account_statistics`,
      `delete_account_deck_tree`. Verwaiste Inhalte: Hat ein Inhalt nach einer
      Stapellöschung keine Karte mehr, wird er mitgelöscht.
  - **Vorlagen nicht ungeprüft übernehmen:** Die alten RPCs enthalten
    bekannte Mehrkosten, die nicht mitwandern.
  - **Bootstrap:** liefert nur, was das Dashboard für den ersten Render
    braucht (Stapelbaum, Fälligkeits- und Tageszahlen). Die
    365-Tage-Prognose und andere Statistik werden nachgeladen statt auf der
    ersten Seite accountweit berechnet.
  - **Gesamtzahlen:** Katalogsuche und Offline-Manifest zählen nur auf
    ausdrückliche Anforderung, nicht als zweiten Scan je erster Seite bzw.
    auf jeder Manifestseite.
  - **Import-Schreibpfad:** mengenbasiert. Ein Batch aktualisiert
    Projektionen und Zusammenfassungen einmal je Batch statt je Zeile per
    Trigger unter dem accountweiten Advisory-Lock, der parallele Upserts
    heute serialisiert.
- [ ] **K4.4 Sicherheit.** RLS für alle Tabellen, `verify_schema` neu,
      generierte `database.types.ts`, vollständige RLS-Suite einschließlich
      fremder Inhalte, Karten und Medien. `supabase/verify_schema_v1.sql`
      anpassen; `npm run db:types:generate` (nie von Hand editieren);
      `tests/rls/ownership-smoke.test.ts` und `two-device-sync.test.ts`
      erweitern.
- [ ] **K4.5 Web-Replica.** Neue IndexedDB-Datenbank ohne Upgradepfad mit
      Stores für Stapel, Inhalte, Karten, Varianten, Reviewereignisse,
      Outbox und Konflikte. Inhalt nach ADR-034: Stapelbaum, Lernfenster mit
      Inhalten, zuletzt geöffnete Karten, Medien bei Bedarf und
      Offline-Downloads pro Stapel. Wo: `src/indexedDbCoreRepository.ts`,
      `src/workspaceHydrationService.ts`, `src/workspaceReplica.ts`; neuer
      Datenbankname (z. B. `core.workspace.entities.v4.<userId>`), der alte
      wird beim Start gelöscht statt gelesen. Lokales Paging von Katalog und
      Lernfenster läuft über Cursor statt Seitenzahl oder Offset; heute
      überspringt `listCatalogPage` Zeilen einzeln, und das Nachladen im
      Lernfenster blättert dadurch quadratisch.
- [ ] **K4.6 Sync und Konflikte.** Mutationen für Inhalt und Karte getrennt;
      Inhaltsrevision und Lernstand bilden getrennte Konfliktgrenzen; ein
      Offline-Review und eine parallele Inhaltskorrektur werden ohne Konflikt
      zusammengeführt. Wo: `src/syncEngine.ts`, `src/syncMutationPlanner.ts`,
      `src/cloudRepository.ts`, `src/cloudRepositoryValidation.ts`.
- [ ] **K4.7 Medien.** Upload, Cache, Queue und Offline-Download auf
      `media_files`/`note_media` umstellen; Speicherfreigabe erst, wenn kein
      Inhalt mehr referenziert. Wo: `src/mediaStore.ts`,
      `src/cloudMediaStore.ts`, `src/appMediaLifecycle.ts`.
- [ ] **K4.8 Remote-Reset.** Nach grünen lokalen Gates wird das
      Pre-Release-Projekt gemäß ADR-028 mit unmittelbar davor geprüfter
      Projekt-Ref zurückgesetzt. **Nur nach ausdrücklicher Freigabe des
      Nutzers im Chat**; Projekt-Ref vorher anzeigen.
- [ ] **K4.9 App verdrahten (inklusive K2.2, K2.4, K2.5, K2.6).** Workspace
      (`src/coreWorkspace.ts`, `src/coreRepository.ts`), Review
      (`src/reviewService.ts`, `src/screens/StudyMode.tsx`,
      `src/ui/StudyCardContent.tsx`), Vorschau (`src/ui/CardPreviewDialog.tsx`),
      Kartenverwaltung (`src/screens/DecksScreen.tsx`), Erstellung
      (`src/creationWorkflow.ts`, `src/screens/ManualCreationPanel.tsx`,
      `src/coreModel/cardEditor.ts`), Import-Commit
      (`src/apkgImportSession.ts`, `src/importService.ts`,
      `src/importCloudSyncTask.ts`), Statistik (`src/statisticsModel.ts`) und
      KI-Varianten (`src/coreVariantService.ts`, `src/aiCardVariant.ts`)
      arbeiten auf `Note`/`Card`.
  - **Phase-2-Verdrahtung:** Die Funktionen aus `src/coreModel/notes.ts`
    über `src/coreModel.ts` exportieren (K2.4); Erstellung und Bearbeitung
    verwenden die validierte Abfrageableitung (K2.2). Cloud-Zeilenvalidierung
    bleibt in `cloudRepositoryValidation.ts`. Scheduler, Queue, Easy Days,
    Tageslimits, Statistik und Varianten lesen `study` beziehungsweise
    `study.extra` ohne Verhaltensänderung (K2.5); das Lese-/Schreibinventar
    steht im Phase-2-Bericht in `history.md`. Ein Änderungsplan mit
    `changed: false` schreibt weder Inhalt noch Karten.
  - **Markierung am Inhalt:** Markieren in Review und Kartenverwaltung setzt
    `note.marked` und erhöht nur die Entitätsrevision, nicht
    `contentRevision`. Damit zeigen alle Geschwister den Stern; `specs.md`
    (Kartenverwaltung, Review) beschreibt das im Cutover entsprechend.
  - **Suche in der Kartenverwaltung:** Die Sucheingabe in `DecksScreen.tsx`
    wird entprellt, und veraltete Anfragen werden per `AbortController`
    abgebrochen statt nur verworfen. Heute löst jede Eingabe je Stapel eine
    eigene Anfrage aus, offline einen vollständigen Scan.
  - **Geräte-ID:** Die Persistenz setzt `updatedByDeviceId` beim Schreiben von
    Inhalt und Karten; die reinen Planfunktionen setzen sie nicht.
  - **Löschen und Undo (K2.6):** `planNoteDeletion` in `coreWorkspace.ts`
    verdrahten; der Dialog in `DecksScreen.tsx` nennt die Geschwisterzahl.
    Aufrufer laden alle Karten des Inhalts, auch in anderen Stapeln. Der
    Undo-Befehl stellt Inhalt und Geschwister aus den vorherigen Datensätzen
    wieder her; Persistenz-/Syncrevisionen folgen dem neuen Speichervertrag.
  - **Editor-Parität:** Alles, was der Editor heute kann (Vorder- und
    Rückseite, Bilder, Lückenaktion, Rückrichtung, Single und Multiple
    Choice, Zusatzfelder, Tags, Batch-Erstellung), funktioniert danach
    identisch. Neue Editorfunktionen kommen erst in Phase 6.
  - **KI-Varianten:** Die Route `api/ai/card-variant.ts` bleibt unverändert
    (`{ front, back }`); Quelle sind die Klartexte von Frage und Antwort der
    Karte.
  - **Import-Commit:** Der Worker übersetzt mit `readAnkiPackage` und
    `translateAnkiPackage`; Stapel (`ImportDeck`), Inhalte, Karten,
    Reviewereignisse (`ImportReviewEvent` mit `cardId`) und `noteTypeSources`
    werden in begrenzten Chunks persistiert, Medien je SHA-1 aus `mediaFiles`
    hochgeladen und über `noteContentMediaRefs` mit Inhalten verknüpft.
- [ ] **K4.10 Altpfad löschen.** `LearningItem`, `LearningItemDocumentV1`,
      `NoteTypeDefinitionV1`, `CardType`, `EditableCardType`, typspezifische
      Editorwerte, `originalFront`/`originalBack`/`originalFields`/
      `originalHtml`/`canonical*`, `src/cardPresentation.ts`,
      `src/ankiContentModel.ts`, `src/coreModel/learningItemContent.ts`,
      `src/coreModel/learningItemDocument.ts` und `sanitizeCardHtml` (sofern
      unbenutzt) entfallen. In `src/apkgImportInternal.ts` entfallen die
      Abbildung ab `mapAnkiApkgToNormalizedDeck` samt Hierarchie-, Bericht-,
      Revlog- und Merge-Helfern, `readApkgPackage`, `parseAnkiMedia` mit den
      materialisierenden Medienbündeln und `LOCAL_APKG_MAX_BYTES`; der Benchmark
      misst danach nur noch die Note-Übersetzung. Prüfen mit
      `grep -rnE "LearningItem|CardType|cardPresentation" src scripts api tests`:
      keine Treffer. AGENTS.md-Begriffe („Learning Item“) mitziehen.
- [ ] **K4.11 Testinfrastruktur auf die Matrix umstellen.** E2E-Specs, die
      `fixtures/apkg/import-quality-*.apkg` nutzen
      (`tests/e2e/apkg-quality-report.spec.ts` und weitere per `grep`), auf
      Matrixpakete umstellen; danach `scripts/create_apkg_quality_fixtures.py`
      (exportiert wegen `ExportLimit` statt `DeckIdLimit` die ganze Sammlung)
      samt `import-quality*`-Fixtures löschen. `world-capitals.apkg` bleibt.

**Prüfung:** `npm run gate:push`, `npm run db:types:check`,
`npm run test:rls:local`, `npm run test:e2e:local`,
`npm run performance:measure:local`, `npm run measure:footprint` (Skript dafür
auf das neue Schema umstellen), visuelle Pflichtmatrix für Review, Vorschau,
Kartenverwaltung, Erstellen und Import.

**Abnahme:** `db:types:check`, `test:rls:local`, `test:e2e:local` und
`performance:measure:local` grün; Speicher je 1.000 Lückentext-Inhalte
nachweislich unter der Ausgangsmessung; p95-Werte mindestens auf deren Niveau; Zwei-Geräte-Test
für Review und Inhaltskorrektur grün. „Neues Gerät bis Dashboard“ war schon in
der Ausgangsmessung über Budget; der Cutover darf es nicht verschlechtern
(Merge-Bedingung). Grün ist nicht verlangt, aber das schlanke Bootstrap aus
K4.3 und die Phasenaufschlüsselung aus K4.2 sind Pflicht, damit nach dem
Cutover feststeht, ob der Rest an Netz, Bundle oder Datenbank hängt.
Ein Merge trotz rotem Gate nur mit ausdrücklicher Ausnahme des Nutzers.

## Phase 6 — Erstellen, Bearbeiten, Verwaltung und KI-Varianten

**Ziel:** Die neuen Bausteine sind auch manuell nutzbar. Ausgeführt nach dem
Cutover auf `main`.

- [ ] **K6.1 Ein Editor.** Manuelle Erstellung und Bearbeitung arbeiten auf dem
      Inhalt: Felder mit Rollen, Bausteine zuschaltbar, Hinweis-, Zusatz- und
      Quellenfelder, Eintippen, Auswahl, Richtungen, Formeln. Der Editor zeigt,
      wie viele Karten eine Änderung betrifft.
  - **Wo:** `src/screens/ManualCreationPanel.tsx`, Editorteil von
    `src/screens/DecksScreen.tsx`, `src/ui/RichTextEditor.tsx`.
  - **Gestaltung:** vorhandene Optionsgruppen der heutigen Erstellung
    erweitern (Antwortoptionen-Zeile), keine neue Kartentyp-Auswahl. Für
    neue sichtbare Bedienelemente mit mehreren plausiblen Varianten den Skill
    `visual-ab-review` nutzen.
- [ ] **K6.2 Abfrageänderungen.** Hinzugefügte Lücken oder Richtungen erzeugen
      Karten; für entfallende Abfragen nennt ein Bestätigungsdialog die Karten
      samt Lernstand und löscht sie erst nach Zustimmung (nutzt
      `planNoteContentChange` aus K2.3).
- [ ] **K6.3 Kartenverwaltung.** Listet weiterhin Karten, zeigt Geschwister
      (z. B. „Lücke 2 von 3“), sucht im Inhaltstext und bearbeitet Tags am
      Inhalt; Kopieren erzeugt einen neuen Inhalt mit frischen Karten.
- [ ] **K6.4 KI-Umformulierungen.** Bleiben an ihrer Karte; eine
      Inhaltsänderung markiert die Umformulierungen aller betroffenen Karten
      als veraltet und erlaubt gezielte Neuerzeugung.
- [ ] **K6.5 Bildverdeckungs-Editor.** Als letzter Schritt dieser Phase:
      Masken (Rechteck, Ellipse, Polygon, Text) auf einem Bild zeichnen,
      gruppieren, Verdeckungsmodus wählen und als Inhalt speichern.
      Bedienung per Maus und Touch; Tastaturalternative für Auswahl und
      Löschen. Vor Beginn Gestaltung per `visual-ab-review` mit dem Nutzer
      klären.
- [ ] **K6.6 Kartenkatalog in den Docs.** `card-types.html` und seine Demos
      zeigen Bausteine statt sechs Kartentypen (`scripts/uiCatalogDemos.tsx`,
      `scripts/generateDocs.ts`).

**Prüfung:** `npm run gate:push`, `npm run test:e2e:local`, visuelle
Pflichtmatrix.

**Abnahme:** Golden-Flows 1, 3, 5 und 6 sowie der Kartenlebenszyklus laufen auf
dem neuen Modell; visuelle Pflichtmatrix für Erstellen, Kartenverwaltung und
Review geprüft.

## Phase 7 — Begraben von Geschwistern

- [ ] **K7.1 Drei Lernoptionen** wie in Anki: neue Geschwister, Review-
      Geschwister und tagesübergreifende Lerngeschwister begraben; Standard für
      alle drei aus; in Lerneinstellungen, Stapeleinstellungen und Lernprofilen.
      Wo: `src/deckSettings.ts`, `src/globalLearningDefaults.ts`,
      `src/learningProfiles.ts`, `src/ui/LearningSettingsPanel.tsx`.
- [ ] **K7.2 Queue-Regel.** Nach einer Antwort werden Geschwister in der
      gewählten Phase bis zum nächsten Lerntag zurückgestellt, ohne Lernstand
      oder Fälligkeit zu verändern; Reihenfolge der Bevorzugung wie in Anki.
      Wo: `src/reviewService.ts`; „begraben“ ist Sitzungs- und
      Lerntagszustand, kein persistiertes Feld.
- [ ] **K7.3 Tests** für Tagesgrenze, Zeitsimulator, Unterstapel und
      Limits.

**Abnahme:** Scheduler-Tests grün; ausgeschaltete Optionen ändern das bisherige
Verhalten nachweislich nicht.

## Phase 8 — Gesamtabnahme

- [ ] **K8.1** `npm test`, `gate:push`, `gate:nightly` und
      `performance:measure:local` grün.
- [ ] **K8.2** Vergleich mit der Ausgangsmessung in `history.md`: Speicher, Ladevolumen,
      p95-Werte und Importzeiten.
- [ ] **K8.3** Visuelle Pflichtmatrix für alle Screens, die Karten anzeigen
      oder bearbeiten, mit Screenshots.
- [ ] **K8.4** `specs.md`, `architecture.md`, `status.md`,
      `anki-format-analysis.md`, `test-portfolio.md` und `AGENTS.md`
      beschreiben ausschließlich das neue Modell.

## Planungsstand

Alle Grundsatzfragen dieser Roadmap sind entschieden. Begriffe und das
Entfernen einzelner Abfragen regelt ADR-032; Großstapel-Grenzen,
Korpus-Zielquote und der Bildverdeckungs-Editor sind als Abnahmekriterien in
K5.8, Phase 5 und K6.5 festgelegt. Offen sind:

- AnKing und ein Lernstand mit Lern-, Wiederlern-, ausgesetzten, begrabenen
  und geflaggten Karten für den Korpus (Phase-5-Abnahme).

## Spätere Roadmaps

Diese Themen sind entschieden oder angedacht, gehören aber nicht zu dieser
Roadmap:

- Native App nach ADR-036: Capacitor, SQLite-Vollreplik, alle Medien auf dem
  Gerät, Store-Veröffentlichung, Push, Login- und Kontolöschungspflichten,
  KI-Route für App-Origins.
- AMBOSS-Tooltips ausschließlich über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.

## Offene Entscheidungen vor dem Cutover

Marker, Kprim-Teilpunkte und Bildbeschreibung sind entschieden und umgesetzt,
die Neuübersetzung ist entschieden (K5.4, siehe `history.md`). Bereits einer Phase zugeordnet sind:
Gerätenachweise (Phase 3, offene Abnahme), Drehung und Textgröße der
Bildmasken (K5.2).

Image Occlusion Enhanced ist entschieden (K5.10). Damit ist vor dem Cutover
nichts mehr offen.

