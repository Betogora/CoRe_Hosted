# CoRe TODO

Stand: 2026-10-10

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
Phase 2   Kanonisches Modell (reine Module)            ✔ abgeschlossen, im Cutover verdrahtet
Phase 3   Renderer und Bausteine (reine Module)        ✔ im Cutover verdrahtet; Gerätenachweise offen
Phase 5A  Übersetzer und Importgraph (reine Module)    ✔ im Cutover verdrahtet; Korpus offen
Phase 4   Cutover: Datenbank, Replica, Sync, App       ✔ abgeschlossen
          + K2.4–K2.6, K5.4, K5.7, K5.8/K5.9-App      ✔ im Cutover verdrahtet
Phase 6   Erstellen, Bearbeiten, Verwaltung, KI        ✔ abgeschlossen
Phase 7   Begraben von Geschwistern                     ✔ abgeschlossen; Migration remote offen
Phase 8   Gesamtabnahme                                 ✔ technisch abgeschlossen; wartet auf Phase 3 und 5
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
Feld-HTML-Vertrag in `sanitizeNoteHtml` (`src/htmlSafety.ts`); seit dem Cutover
nutzen Erstellung, Import und Darstellung beide.

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

Abgeschlossen am 2026-10-06 und im Cutover am 2026-10-08 verdrahtet (siehe
`history.md`).

## Phase 3 — Offene Abnahme

Renderer und Host-Bausteine sind implementiert und im UI-Katalog verfügbar.
Die Umsetzung von K3.1 bis K3.10 und ihre Nachweise stehen datiert in
`history.md`; die technischen Verträge stehen in `architecture.md`. Seit dem
Cutover verwenden Review, Vorschau, Verwaltung, Erstellung und Import sie.

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
`KNOWN_GAPS` grün. Den Vertrag beschreibt `architecture.md`. Die an Persistenz
und Oberfläche gebundenen Teile (K5.4, K5.7 bis K5.9) sind im Cutover umgesetzt,
Image Occlusion Enhanced als CoRe-Masken (K5.10) sowie Drehung und Textgröße der
Bildmasken wie in Anki (K5.2) danach (siehe `history.md`). Offen sind zwei
Nachweise, die echte Anki-Daten brauchen.

**Prüfung:** `npx tsx --test src/apkgNoteTranslation.test.ts
src/apkgFormatMatrix.test.ts`, `npm run typecheck`, `npm test`,
`npm run benchmark:apkg`, `npm run benchmark:apkg:large`, mit Korpus
`npm run report:apkg-corpus`.

**Abnahme (offen):** Golden-Flow APKG und Medien-E2E sind seit dem Cutover grün;
mit bereitgestelltem Korpus sind mindestens 95 % der Ankizin- und
AnKing-Inhalte voll übersetzt und 0 % nicht darstellbar. Für Ankizin v5 belegt
(99,9 % Lückentexte über den eigenen Übersetzer, Blickdiagnosen generisch,
0 % nicht darstellbar; siehe `history.md`). Echte Image-Occlusion-Enhanced-
Inhalte, Ankis eingebaute Bildverdeckung (im Format des Anki-Editors erzeugt)
und ein echter Export mit FSRS-Lernstand und Revlog sind belegt (siehe
`history.md`). Offen bleiben AnKing und ein Lernstand mit Lern-,
Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten; diese Zustände
sind bis dahin nur über die Matrix synthetisch belegt.

## Phase 7 — Begraben von Geschwistern

- [ ] **K7.4 im Pre-Release-Projekt.** `20261010093049_bury_siblings_in_day_counts.sql` mit dem
      Ablauf aus `operations.md` auf `CoRe-Database` anwenden, danach
      `verify_schema_v1.sql` und Hosted-Smoke.

**Abnahme:** Die Bootstrap-Übersicht im Pre-Release-Projekt zieht begrabene
Geschwister ab; Hosted-Smoke grün.

## Planungsstand

Alle Grundsatzfragen dieser Roadmap sind entschieden. Begriffe und das
Entfernen einzelner Abfragen regelt ADR-032; Großstapel-Grenzen,
Korpus-Zielquote sind als Abnahmekriterien in K5.8 und Phase 5 festgelegt. Offen sind:

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

## Offene Entscheidungen

Marker, Kprim-Teilpunkte und Bildbeschreibung sind entschieden und umgesetzt,
die Neuübersetzung ist entschieden (K5.4, siehe `history.md`), Image Occlusion
Enhanced ist umgesetzt (K5.10). Bereits einer Phase zugeordnet sind die
Gerätenachweise (Phase 3, offene Abnahme). Damit ist nichts mehr offen.

