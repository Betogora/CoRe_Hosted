# CoRe TODO

Stand: 2026-10-06

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
Phase 2   Kanonisches Modell (reine Module)            auf main, unverdrahtet
Phase 3   Renderer und Bausteine (reine Module)        auf main, unverdrahtet
Phase 5A  Übersetzer und Importgraph (reine Module)    auf main, Matrix prüft die neue Pipeline
Phase 4   Cutover: Datenbank, Replica, Sync, App       eigener Branch, ein Merge
          + K2.4–K2.6, K5.4, K5.7, K5.9-Oberfläche     (im Cutover verdrahtet)
Phase 6   Erstellen, Bearbeiten, Verwaltung, KI        auf main
Phase 7   Begraben von Geschwistern                     auf main
Phase 8   Gesamtabnahme
```

Warum so: Wer `LearningItem` vor dem Datenbankumbau entfernt, bricht
Persistenz, Sync, Import und Screens gleichzeitig und müsste
Übergangscode schreiben. Stattdessen entstehen Modell, Renderer und Übersetzer
zuerst als reine, vollständig getestete TypeScript-Module. Die Matrix prüft
schon vor dem Cutover gegen die neue Pipeline (siehe K5.0). Der Cutover
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
| Neu übersetzen (K5.4) | Standard: nach einem Übersetzer-Update bietet `Allgemeine Einstellungen › Daten` die Aktion `Importierte Inhalte neu übersetzen` an; sie verändert nur Inhalte ohne lokale Bearbeitung. Vor der Umsetzung Rückfrage, ob stattdessen automatisch übersetzt werden soll. |

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

**Ziel:** `Note`, `Card` und die reine Domänenlogik für Ableitung, Abgleich und
Löschen existieren vollständig getestet in `src/coreModel/`, ohne dass App,
Persistenz oder Screens sie schon verwenden.

**Ausgangspunkt:** `NoteContent`, `parseNoteContent`, `deriveNotePromptKeys`,
`clozeOrdinals` und `noteContentMediaRefs` aus Phase 0
(`src/coreModel/noteContent.ts`). Diese Funktionen werden erweitert, nicht
dupliziert.

- [ ] **K2.1 Typen.** `Note` (Inhalt ohne Stapel mit `NoteContent`, Quelle,
      Anki-GUID und Inhaltsrevision) und `Card` (Inhalt-ID, Stapel,
      Abfrageschlüssel, Anki-Kartenidentität, Status, typisierter Lernstand) in
      `coreTypes.ts`. `LearningItem` als inhaltstragende Karte,
      `LearningItemDocumentV1`, `NoteTypeDefinitionV1`, `CardType`,
      `EditableCardType`, typspezifische Editorwerte und alle
      Compatibility-Projektionen entfallen. Das Entfernen geschieht im Cutover
      (K4.10); in Phase 2 werden die neuen Typen ergänzt.
  - **Wo:** `src/coreTypes.ts`, neuer Abschnitt direkt nach `NoteContent`.
  - **Wie:** `Note` = `{ id, userId?, content: NoteContent, source:
    "manual" | "anki-apkg", ankiGuid: string | null, noteTypeSourceId: string
    | null, translator: { id: string; version: number } | null,
    contentRevision: number, createdAt, updatedAt, revision, deletedAt,
    updatedByDeviceId }`. `Card` = `{ id, noteId, deckId, promptKey,
    ankiCardId: string | null, status: "active" | "suspended", marked:
    boolean, ankiFlag: number, study: CardStudyState, variants: CardVariant[],
    createdAt, updatedAt, revision, deletedAt, updatedByDeviceId }`.
    `CardStudyState` übernimmt die heute in `ReviewStateBase` genutzten
    Felder; dabei Queue-relevante Werte (`state`, `dueAt`, `stability`,
    `difficulty`, `reps`, `lapses`, `intervalDays`, `learningStepIndex`,
    `lastReviewedAt`, `lastRating`) als eigene Felder, alle übrigen CoRe-
    beziehungsweise Variantenwerte gesammelt in `extra`. Keine Felder
    erfinden, die heute nicht gelesen werden; Liste per
    `grep -n "reviewState\." src` ermitteln.
  - **Fertig, wenn:** Typen kompilieren, `coreTypes.typecheck.ts` deckt sie ab,
    kein bestehender Typ wurde verändert.
  - **Nicht dazu:** Persistenzspalten, Cloud-Mapping, React-Props.
- [ ] **K2.2 Abfrageableitung anschließen.** `parseNoteContent` und
      `deriveNotePromptKeys` aus Phase 0 werden die einzige Quelle dafür,
      welche Karten ein Inhalt besitzt; Erstellung, Bearbeitung und Import
      verwenden sie über die `coreModel.ts`-Seam.
  - **Wo:** `src/coreModel/noteContent.ts` (Ableitung),
    neues `src/coreModel/notes.ts` (Fabrikfunktionen).
  - **Wie:** `createNote(input)` validiert mit `parseNoteContent`, erzeugt
    `Note` plus je Abfrageschlüssel eine `Card` mit neuem Lernstand
    (`createReviewState` als Vorlage). Stabile Karten-IDs aus
    `makeId("card")`; Reihenfolge der Karten = Reihenfolge der Schlüssel.
    Die Verdrahtung in Erstellung, Bearbeitung und Import geschieht im
    Cutover (K4.9) beziehungsweise in Phase 5A für den Import.
  - **Fertig, wenn:** Unit-Tests zeigen für jeden Baustein (reveal mit
    Bedingungen, choice, cloze mit `c1,2` und Verschachtelung, Bildverdeckung)
    die erwartete Kartenmenge.
- [ ] **K2.3 Abgleich bei Änderung.** Eine reine Funktion vergleicht alte und
      neue Abfragemenge und liefert neue Karten, unveränderte Karten mit
      Lernstand und entfallende Karten. Entfallende Karten werden nie still
      gelöscht, sondern erst nach Bestätigung (ADR-032).
  - **Wo:** `src/coreModel/notes.ts`, Funktion `planNoteContentChange(previous:
    { note, cards }, nextContent)`.
  - **Wie:** Rückgabe `{ note, keptCards, newCards, removedCards }`. Schlüssel
    gleich = Karte behalten (Lernstand, Varianten, Status unverändert).
    `removedCards` werden nur zurückgegeben, nicht gelöscht; die Bestätigung
    ist Sache des Aufrufers. `contentRevision` steigt genau um 1.
  - **Fertig, wenn:** Tests für Lücke hinzufügen, Lücke entfernen, Lücke
    umnummerieren (c2 → c3 = entfernt + neu), Rückrichtung an/aus,
    Bedingungsfeld geleert und Formatierungsänderung ohne Kartenänderung.
- [ ] **K2.4 Seam und Validierung.** `coreModel.ts` bleibt die einzige
      öffentliche Seam für Erzeugen, Normalisieren und Ändern von Inhalten und
      Karten. Cloud-Zeilenvalidierung bleibt in `cloudRepositoryValidation.ts`.
  - **Ausführung:** Export der neuen Funktionen über `src/coreModel.ts` erst im
    Cutover (K4.9), damit vorher kein App-Code sie versehentlich nutzt. Tests
    importieren bis dahin direkt aus `src/coreModel/notes.ts`.
- [ ] **K2.5 Scheduler und Queue umstellen.** `reviewService`, FSRS, Easy Days,
      Tageslimits und Statistik lesen den typisierten Kartenlernstand; das
      Verhalten bleibt unverändert und durch die bestehenden Tests belegt.
  - **Ausführung:** im Cutover (K4.9). In Phase 2 nur vorbereiten: Liste der
    Lese- und Schreibstellen in `src/reviewService.ts`, `src/scheduler.ts`,
    `src/easyDays.ts`, `src/learningDay.ts`, `src/statisticsModel.ts` und
    `src/coreVariantService.ts` als Kommentar im Phasenbericht festhalten.
  - **Nicht dazu:** Änderungen am FSRS-Verhalten oder an Grenzwerten.
- [ ] **K2.6 Löschen nach Anki.** Löschen einer Karte löscht Inhalt und alle
      Geschwister; Undo stellt beide wieder her; der Auswirkungsdialog nennt die
      Kartenzahl.
  - **Wo:** reine Planung `planNoteDeletion(note, cards)` in
    `src/coreModel/notes.ts` (Phase 2); Verdrahtung in `src/coreWorkspace.ts`
    (heute `softDeleteCard`/`restoreSoftDeletedCard`) und im Dialog von
    `src/screens/DecksScreen.tsx` im Cutover.
  - **Fertig, wenn:** Tests zeigen Soft-Delete von Inhalt und allen Karten mit
    gemeinsamem Zeitstempel und vollständiges Undo.

**Prüfung:** `npx tsx --test src/coreModel/notes.test.ts
src/coreModel/noteContent.test.ts`, `npm run typecheck`, `npm test`.

**Abnahme:** Unit-Tests für Ableitung und Abgleich decken jede Lückensyntax und
jeden Baustein ab; bestehende Scheduler-, Review- und Statistiktests sind
unverändert grün. (Die frühere Abnahme „im Code existiert kein
Kartentyp-Begriff mehr“ gilt jetzt für den Cutover, K4.10.)

## Phase 3 — Renderer und Bausteine

**Ziel:** Ein reiner Renderer und die nötigen React-Host-Bausteine stellen
jede Karte im CoRe-Design dar. Sie sind getestet, im UI-Katalog sichtbar und
noch nicht in Review, Vorschau oder Kartenverwaltung eingebaut.

**Ausgangspunkt:** Der heutige Renderer `src/cardPresentation.ts` mit
`CardPresentationSurface`, `StudyCardContent` und `CardPreviewDialog` in
`src/ui/`. Wiederverwenden: CSP-Gerüst und Medien-URL-Auflösung
(`buildSrcdoc`, `resolvePresentationMedia`). Nicht übernehmen:
Template-Auswertung, Feldlisten-Fallback, Anki-CSS.

- [ ] **K3.1 Ein Renderer.** `renderCard(note, card, side, theme)` erzeugt
      scriptfreies HTML mit CoRe-Styles für Vorschau, Kartenverwaltung und
      Review. Nichts davon wird persistiert. Beim Aufdecken ergänzt eine
      Abfrage Trennlinie und Antwort, ohne die Vorderseite zu wiederholen; ein
      Lückentext wird an derselben Stelle gefüllt (Vorlage: `2c08cc7` in
      `archive/noemi-anki-fixes`). Der Anki-Template-Renderpfad
      und der Feldlisten-Fallback entfallen (im Cutover, K4.10).
  - **Wo:** neues `src/notePresentation.ts` mit Test
    `src/notePresentation.test.ts`.
  - **Wie:** Signatur `renderCard({ note, card, side: "question" | "answer",
    surface: "review" | "preview" | "management", theme })` →
    `{ srcdoc, accessibleText, mediaReferences, interactions, diagnostics }`
    (gleiche Form wie `PresentationResult`, ohne `compatibility`). Die
    Rückseite im Review enthält nur Trennlinie plus Antwortteil; in
    `preview`/`management` Frage, Trennlinie und Antwort zusammen.
  - **Fertig, wenn:** jede Matrixnotiz lässt sich rendern. Die Textfassungen
    lassen sich mit den Matrixerwartungen vergleichen; das passiert ab K5.0.
- [ ] **K3.2 Feldrollen.** Frage und Antwort; Hinweise vor dem Aufdecken
      einzeln aufklappbar (ohne Script, z. B. über `details`); Zusatz erst nach
      dem Aufdecken; Quellen als Link-Chips. Gestaltung nach den Standards oben.
- [ ] **K3.3 Lückentext.** Volle Anki-Syntax einschließlich Hinweis,
      Verschachtelung, Mehrfachnummern und Lücken in Formeln; aktive Lücke
      hervorgehoben, andere Lücken ausgeschrieben.
  - **Wie:** Lücken mit einem kleinen Tokenizer statt Regex-Ersetzung
    auflösen (Klammertiefe zählen, wie `clozeOrdinals`). Für Karte N: jede
    Lücke, deren Nummernliste N enthält, wird zu `[…]`/`[Hinweis]`; innere
    Lücken einer aktiven äußeren Lücke verschwinden mit ihr. Alle übrigen
    Lücken zeigen ihren Text. Lücken innerhalb von `\(…\)` vor dem
    KaTeX-Schritt ersetzen.
  - **Testfälle:** alle Lückennotizen der Matrix, zusätzlich Hinweis mit
    Doppelpunkt im Text und leere Lücke.
- [ ] **K3.4 Bildverdeckung.** Masken als SVG über dem Bild, relative
      Koordinaten, Modi „eine verdecken“ und „alle verdecken, eine erraten“,
      Aufdecken der Zielmaske auf der Rückseite, responsive Skalierung.
  - **Wie:** Bild und ein `svg` mit `viewBox="0 0 1 1"` und
    `preserveAspectRatio="none"` in einem relativ positionierten Container;
    Formen aus `OcclusionShape`; `alwaysOccluded` entspricht Ankis `oi=1`.
    Text-Formen sind Beschriftungen und verdecken nichts.
- [ ] **K3.5 Eintippen.** Eingabe im Review-Host außerhalb des Kartenrahmens,
      zeichengenauer Vergleich beim Aufdecken, Tastaturbedienung.
  - **Wo:** reiner Vergleich `compareTypedAnswer(expected, typed)` in
    `src/notePresentation.ts`; Eingabe als React-Baustein in `src/ui/`
    (Katalog-Demo Pflicht).
- [ ] **K3.6 Auswahl.** Single Choice, Multiple Choice und Kprim im
      Review-Host mit Auswertung und Erklärung; ersetzt die heutige
      Choice-Darstellung (Ersatz wirksam im Cutover).
  - **Wo:** Auswertung als reine Funktion; Darstellung als React-Baustein.
    Heutige Logik in `src/choiceAnswers.ts` und der Choice-Teil von
    `StudyMode.tsx` als Vorlage lesen, nicht kopieren.
- [ ] **K3.7 Formeln.** MathJax-Notation (`\(…\)`, `\[…\]`) wird mit KaTeX
      vorgerendert; KaTeX lädt nur bei erkannten Formeln nach und hält die
      Bundlebudgets ein.
  - **Wie:** Abhängigkeit `katex` (npm) per dynamischem `import()` nur, wenn
    ein Feld `\(` oder `\[` enthält; KaTeX-CSS und Schriften in den
    `srcdoc` einbetten (CSP erlaubt `data:`-Fonts). `[latex]…[/latex]` und
    `[$]…[/$]` ebenfalls an KaTeX geben; nicht unterstützte Befehle zeigen
    Quelltext plus Diagnose.
  - **Pflicht:** neue Abhängigkeit ⇒ `npm run build` (Budgets) und
    `npm run performance:measure:local` (AGENTS.md).
- [ ] **K3.8 Rich Text.** Der Renderer gibt ausschließlich nach
      `sanitizeNoteHtml` bereinigtes Feld-HTML aus; Feldfarben werden für Light
      und Dark Mode automatisch auf ausreichenden Kontrast angepasst.
- [ ] **K3.9 Medien und Vorlesen.** Bilder, Audio, Video wie heute über
      aufgelöste Medien-URLs; `{{tts}}` als Vorlese-Schaltfläche im Host über
      die Sprachausgabe des Systems (`speechSynthesis`, Sprache aus
      `NoteContent.speech`). `[sound:x.mp4]` wird als Video dargestellt. Der
      heutige Fehler, dass `{{tts …}}` den Feldtext doppelt ausgibt, entfällt
      mit dem alten Renderer.
- [ ] **K3.10 Links und AMBOSS.** Links öffnen extern in neuem Kontext ohne
      Zugriff auf CoRe; Review-Aktion „In AMBOSS nachschlagen“ öffnet die
      AMBOSS-Suche mit dem markierten Begriff. Das Suchlinkformat wird vor der
      Umsetzung verifiziert.
  - **Wie:** Links mit `target="_blank" rel="noopener noreferrer"`; der
    Kartenrahmen bekommt dafür `allow-popups allow-popups-to-escape-sandbox`
    zusätzlich zur heutigen Sandbox, sonst nichts. Das Suchlinkformat im
    Browser mit einem echten Begriff prüfen; ist kein stabiles Format
    auffindbar, den Nutzer fragen statt zu raten.

**Prüfung:** `npx tsx --test src/notePresentation.test.ts`,
`npm run typecheck`, `npm run build`, `npm run docs:build` und
`npm run check:docs` (neue UI-Bausteine brauchen Katalog-Demos in
`scripts/uiCatalogDemos.tsx`), Sichtprüfung der Referenzfälle aus der
visuellen Pflichtmatrix im UI-Katalog.

**Abnahme:** Textfassungen aller Matrixfälle stimmen (über die neue Pipeline
ab K5.0); Screenshot-Fälle aus K1.9 sind in beiden Themes visuell geprüft; der
Kartenrahmen enthält nachweislich kein Script und lädt keine externen
Ressourcen; Bundlebudgets sind grün.

## Phase 5 — APKG-Import und Übersetzer

Phase 5 ist zweigeteilt. **5A** (K5.0–K5.3, K5.5, K5.6, K5.8 und der
Berichtsinhalt von K5.9) entsteht vor dem Cutover als reine Pipeline.
**5B** (K5.4, K5.7 und die Berichtsoberfläche von K5.9) braucht Persistenz und
wird im Cutover (Phase 4) umgesetzt.

**Ausgangspunkt:** Der Paketleser ist gut und bleibt: ZIP, SQLite, Zstd,
Protobuf und Medienliste in `src/apkgImportInternal.ts`, `src/zipReader.ts`,
`src/sqliteReader.ts`, `src/apkgImportProtobuf.ts`, Worker in
`src/apkgImportWorker.ts`. Ersetzt wird die Abbildung ab
`mapAnkiApkgToNormalizedDeck` und `src/ankiContentModel.ts`.

- [ ] **K5.0 Neue Pipeline und Matrixbeobachtung (5A).** Eine reine Funktion
      übersetzt ein gelesenes Paket in einen Importgraphen aus Stapeln,
      `Note`s, `Card`s, Medien, Reviewereignissen und Bericht.
  - **Wo:** neues privates Modul `src/apkgNoteTranslation.ts` (Registry und
    Übersetzer) mit Tests; die öffentliche Seam bleibt `src/apkgImport.ts`.
  - **Wie:** Eingabe ist das heutige Leseergebnis (Decks, Notes, Cards,
    Modelle, Medienliste, Revlog). Ausgabe `{ decks, notes, cards, mediaFiles,
    reviewEvents, noteTypeSources, report }`.
  - **Matrix umstellen:** `src/apkgFormatMatrix.test.ts` beobachtet ab hier
    diese Pipeline und `renderCard` statt `LearningItem` und
    `renderLearningItemPresentation`. Die Prüfungen bleiben dieselben; die
    Beobachtung liest jetzt `note.content.fields[].role` und
    `card.promptKey`. Danach `KNOWN_GAPS` neu abgleichen; der strenge Test
    zeigt, welche Lücken geschlossen sind.
- [ ] **K5.1 Importgraph.** Eine Anki-Notiz wird ein Inhalt, jede Anki-Karte
      eine Karte. Abfrageschlüssel: Basic-Familie `forward`/`reverse`, andere
      Templates `anki-<Ordinal>`, Lückentext `cloze:N`, Bildverdeckung `io:N`.
      Stapel je Karte über `did`, bei gefilterten Stapeln über `odid` und
      `odue`.
  - **Zusätzlich:** Der leere Stapel `Default` wird nur angelegt, wenn er
    Karten enthält. Gefilterte Stapel (`dyn`) werden nie angelegt.
    Geschwister in anderen Stapeln und Template-Zielstapel bleiben in ihrem
    eigenen Stapel.
  - **Schließt:** `package.decks`, `card.deck`, `card.key`, `note.cards` in
    `KNOWN_GAPS`.
- [ ] **K5.2 Übersetzer-Registry.** Versionierte Übersetzer mit Erkennung über
      Notiztyp-Art, Stock-Kennung, Felder und Template-Signatur: Basic-Familie,
      Antwort eintippen, Lückentext, native Image Occlusion (Occlusion-Feld zu
      Masken), Image Occlusion Enhanced, AnKing-/Ankizin-Familie (Text, Extra,
      zusätzliche Felder als Hinweise, Links als Quellen), verbreitete
      Multiple-Choice-Add-ons. Für `Multiple Choice for Anki` dienen Erkennung,
      Template-Signatur, Feldzuordnung und Tests aus dem zurückgestellten
      Branch `archive/noemi-anki-fixes` (Commit `e558338`) als Vorlage.
  - **Erkennung, in dieser Reihenfolge:** (1) `originalStockKind` 1–6 der
    Anki-Standardtypen; (2) Signaturen: `AllInOne (kprim, mc, sc)` beziehungsweise
    Felder `Question`, `QType …`, `Q_1` und `Answers` plus `id="qtable"` oder
    `id="Q_solutions"`; Image Occlusion Enhanced über `Question Mask`,
    `Answer Mask`, `Original Mask`; AnKing/Ankizin über Lückentyp mit Feld
    `Text` und `Extra` plus Hinweis-Buttons im Template; (3) sonst K5.3.
  - **Multiple Choice for Anki:** `QType` 0 = Kprim, 1 = Multiple,
    2 = Single Choice (belegt in `anki-format-analysis.md`); `Answers` ist
    eine durch Leerzeichen getrennte 0/1-Maske über die nicht leeren
    `Q_n`. Noemis Code behandelte nur „2“ als Single Choice; das nicht
    übernehmen.
  - **Image Occlusion nativ:** Masken aus dem Feld `Occlusion` parsen
    (`rect`, `ellipse`, `polygon:points=…`, `text:text=…`, `oi=1` →
    `alwaysOccluded`). Werte in Anki sind relativ (0–1); `\:` und `\\`
    entschlüsseln.
  - **Image Occlusion Enhanced:** Jede Notiz ist eine eigene Karte. Statt
    Masken zu rekonstruieren, werden Bild und Masken-SVGs als Bildverdeckung
    mit einer Maske übernommen, die das Frage-SVG überlagert. Ist das zu
    ungenau, den Nutzer fragen.
  - **AnKing/Ankizin:** Feldrollen nach Feldname; unbekannte Zusatzfelder
    werden Hinweise. Die Zielquote prüft der Korpus.
  - **Schließt:** `note.interaction`, `note.choice`, `note.fieldRoles`,
    `card.front`, `card.back` der Sonderformate.
- [ ] **K5.3 Generischer Übersetzer.** Für unbekannte Notiztypen leitet der
      sichere Template-Compiler aus der Struktur ab, welche Felder Frage,
      Antwort oder Zusatz sind, übernimmt statischen Template-Text als Teil der
      Frage und wertet Bedingungen aus. Nicht zuordenbare Felder bleiben als
      Notizfelder sichtbar und werden berichtet.
  - **Wie:** `compileSafeTemplate` aus `src/safeTemplate.ts` liefert den AST.
    Felder im Vorderseiten-Template → `prompt`; Felder nur in der Rückseite
    nach `<hr id=answer>` beziehungsweise nach `{{FrontSide}}` → `answer`; ein
    zweites Rückseitenfeld → `extra`; nirgends verwendete Felder → `note`.
    Statischer Text vor dem ersten Feld der Vorderseite wird `instruction` mit
    `…` an Stelle des Feldes. `{{#Feld}}` auf der Vorderseite → `requires`.
  - **Schließt:** `note.instruction`.
- [ ] **K5.4 Anki-Vorlage speichern und neu übersetzen (5B, im Cutover).**
      Templates, CSS, Feld- und Konfigurationsdaten je Notiztyp landen
      unsichtbar in `note_type_sources`; ein Befehl übersetzt bestehende
      Importe nach einem Übersetzer-Update neu, ohne lokale Inhaltsänderungen
      oder Lernstand zu überschreiben. Oberfläche nach dem Standard oben,
      vorher Rückfrage.
- [ ] **K5.5 Lernstand.** Der rohe Anki-Kartenzustand erreicht jede Karte
      (heute geht er verloren, siehe Matrix). Heutige Priorität
      (FSRS-Memory-State, Revlog-Replay, klassischer Status, neu) bleibt; ausgesetzt wird
      übernommen; begraben verfällt wie in Anki am nächsten Lerntag; Tag
      `marked` wird zur CoRe-Markierung; Flaggen bleiben als Metadaten.
  - **Ursache des heutigen Fehlers:** `sourceSchedulerData` aus
    `createAnkiSchedulingSnapshot` landet nicht in `item.meta`, deshalb liefern
    `migrateAnkiFsrsMemoryState` und `migrateAnkiCardStateHeuristically`
    nichts. In der neuen Pipeline den Snapshot direkt an die Karte geben und
    die drei Migrationsfunktionen auf `Card` umschreiben.
  - **Zuordnung:** `type` 0/1/2/3 → new/learning/review/relearning, `queue -1`
    → `status: "suspended"`, `queue -2/-3` → nicht ausgesetzt, Zustand aus
    `type`, `flags & 7` → `ankiFlag`, Tag `marked` → `marked: true` (Tag bleibt
    erhalten), `data.s`/`data.d` → FSRS-Zustand.
  - **Schließt:** alle `card.learning.*` und `note.marked`.
- [ ] **K5.6 Medien.** Namen nach Unicode-NFC, URL- und HTML-Dekodierung
      normalisieren; eine Mediendatei pro SHA-1; Referenzen je Inhalt; über
      Template-CSS referenzierte Schriften werden nicht übernommen.
  - **Wie:** Medienverweise nur aus `src`, `poster` und `[sound:…]`
    sammeln, nie aus `href`. Vergleich in normalisierter Form; der
    gespeicherte Feldtext verweist danach auf den normalisierten Namen.
  - **Schließt:** `card.media`, `package.missingMedia`.
- [ ] **K5.7 Reimport (5B, im Cutover).** Inhalte über Anki-GUID, Karten über
      Anki-Kartenidentität zuordnen; lokale Inhaltsänderungen, Lernstand,
      Aussetzung, Markierung und Stapelordnung bleiben; neue Lücken erzeugen
      neue Karten; in Anki entfallene Karten werden nur berichtet.
  - **Lokal bearbeitet** heißt: `contentRevision` größer als beim letzten
    Import (Importrevision am Inhalt speichern).
- [ ] **K5.8 Große Stapel am Computer.** ZIP und Medien werden streamend
      verarbeitet; APKG und COLPKG bis mindestens 2 GiB, Worker-Heap höchstens
      1 GiB, Main-Thread-Übergabe weiter unter 100 ms. Die Grenzen werden mit
      echten AnKing-/Ankizin-Dateien überprüft, sobald der Korpus bereitsteht.
  - **Wie:** `.colpkg` in `validateApkgFile` zulassen (gleiches Format);
    `LOCAL_APKG_MAX_BYTES` auf 2 GiB; Medien einzeln aus dem ZIP lesen und
    weiterreichen statt das Archiv vollständig zu materialisieren. Messung mit
    `npm run benchmark:apkg` und einem künstlich vergrößerten Paket.
  - **Schließt:** `package.import` für `collection-latest`.
- [ ] **K5.9 Importbericht.** Vorschau und Abschluss zeigen je Notiztyp den
      Übersetzer, die Anzahl Inhalte und Karten, generisch übersetzte und nicht
      zuordenbare Felder, fehlende Medien und übernommenen Lernstand.
  - **5A:** Berichtsinhalt in der Pipeline; veraltete Warnungen entfernen,
    insbesondere „produktive Medienablage bleibt ein späterer Ausbaupunkt“.
  - **5B:** Anzeige in `src/screens/ApkgImportPanel.tsx` im Cutover.
  - **Korpusbericht:** `scripts/reportApkgCorpus.ts` berichtet danach den
    Übersetzer je Notiztyp statt der heutigen Darstellungsquote.

**Prüfung 5A:** `npx tsx --test src/apkgNoteTranslation.test.ts
src/apkgFormatMatrix.test.ts`, `npm run typecheck`, `npm test`,
`npm run benchmark:apkg`, mit Korpus `npm run report:apkg-corpus`.

**Abnahme:** Die gesamte Matrix aus Phase 1 ist grün und `KNOWN_GAPS` leer
(für 5A: alle Lücken außer den an Persistenz gebundenen geschlossen);
Golden-Flow APKG und Medien-E2E grün (nach dem Cutover); APKG-Benchmark hält
die Grenzen aus K5.8; mit bereitgestelltem Korpus sind mindestens 95 % der
Ankizin- und AnKing-Inhalte voll übersetzt und 0 % nicht darstellbar. Fehlt
der Korpus, bleibt dieser Teil ausdrücklich offen und wird im Phasenbericht so
benannt.

## Phase 4 — Cutover: Datenbank-Baseline, Replica, Sync und App

**Ziel:** Die App läuft vollständig auf `Note`/`Card`, neuem Renderer und
neuer Importpipeline. Der Altpfad ist gelöscht. Ausgeführt nach Phase 5A auf
dem Branch `kartenmodell-cutover`.

**Vorgehen in dieser Reihenfolge:** K4.1 → K4.4 → K4.3 → K4.2 → K4.5 → K4.6 →
K4.7 → K4.9 → K5.4/K5.7/K5.9-Oberfläche → K4.10 → K4.11 → Gates → K4.8 nach
Freigabe.

- [ ] **K4.1 Neue Baseline.** Eine einzige frische Migration ersetzt die
      heutige: `decks`, `notes`, `cards` mit typisierten Lernstandsspalten,
      `note_type_sources` (unsichtbare Anki-Vorlage je Notiztyp),
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
- [ ] **K4.2 Projektionen prüfen.** Für `card_catalog` und
      `deck_study_summaries` wird gemessen, ob direkte Indizes auf `cards` und
      `notes` die Grenzen der Ausgangsmessung halten. Nur gerechtfertigte Projektionen
      bleiben. Messung mit `npm run performance:measure:local`
      (100k-Kartensuche, Statistik-RPC) und angepasstem
      `supabase/benchmark_replica_v2.sql`.
- [ ] **K4.3 RPCs.** Atomare Reviewaufzeichnung auf Kartenspalten, Bootstrap,
      Katalog-Delta, Hydrierung von Karten mit ihren Inhalten,
      Offline-Manifest, Stapelbaum-Löschung mit Anki-Regel für verwaiste
      Inhalte, Statistik. Vorlagen: `record_review_atomic`,
      `get_account_bootstrap_v2`, `pull_account_catalog_delta`,
      `list_account_card_catalog`, `hydrate_account_cards`,
      `get_deck_offline_manifest`, `get_account_statistics`,
      `delete_account_deck_tree`. Verwaiste Inhalte: Hat ein Inhalt nach einer
      Stapellöschung keine Karte mehr, wird er mitgelöscht.
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
      wird beim Start gelöscht statt gelesen.
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
  - **Editor-Parität:** Alles, was der Editor heute kann (Vorder- und
    Rückseite, Bilder, Lückenaktion, Rückrichtung, Single und Multiple
    Choice, Zusatzfelder, Tags, Batch-Erstellung), funktioniert danach
    identisch. Neue Editorfunktionen kommen erst in Phase 6.
  - **KI-Varianten:** Die Route `api/ai/card-variant.ts` bleibt unverändert
    (`{ front, back }`); Quelle sind die Klartexte von Frage und Antwort der
    Karte.
- [ ] **K4.10 Altpfad löschen.** `LearningItem`, `LearningItemDocumentV1`,
      `NoteTypeDefinitionV1`, `CardType`, `EditableCardType`, typspezifische
      Editorwerte, `originalFront`/`originalBack`/`originalFields`/
      `originalHtml`/`canonical*`, `src/cardPresentation.ts`,
      `src/ankiContentModel.ts`, `src/coreModel/learningItemContent.ts`,
      `src/coreModel/learningItemDocument.ts` und `sanitizeCardHtml` (sofern
      unbenutzt) entfallen. Prüfen mit
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
der Ausgangsmessung über Budget; der Cutover darf es nicht verschlechtern.
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

- Bereitstellung des Realwelt-Korpus (Ankizin, AnKing) durch den Nutzer; bis
  dahin gelten die synthetischen Nachbauten aus K1.4.
- Rückfrage zu K5.4: Neuübersetzung auf Knopfdruck (Standard) oder
  automatisch.
- Verifikation des AMBOSS-Suchlinkformats (K3.10).

## Spätere Roadmaps

Diese Themen sind entschieden oder angedacht, gehören aber nicht zu dieser
Roadmap:

- Native App nach ADR-036: Capacitor, SQLite-Vollreplik, alle Medien auf dem
  Gerät, Store-Veröffentlichung, Push, Login- und Kontolöschungspflichten,
  KI-Route für App-Origins.
- AMBOSS-Tooltips ausschließlich über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
