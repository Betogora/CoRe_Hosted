# CoRe TODO

Stand: 2026-11-02

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität: P1 vor P2 vor P4 (P3 Einstellungen läuft auf `main`). Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig, „Später“ ist geparkt.

## P1: KI-Varianten (Proof of Concept) abschließen

Bewusst einfacher Probelauf (ADR-011); Auswahl und Oberfläche werden danach
geglättet.

- [ ] **Einstiege:** Zähler der Karten ohne Variante in den Stapeleinstellungen
      (danach eine einzige Aktion, deren Beschriftung zwischen „generieren“ und
      „neu generieren“ wechselt); nach Fehlschlägen führt `Anzeigen` in der Leiste
      zum Filter `-has:variant`; Stoppgründe in der Leiste kurz halten (z. B.
      „Keine Verbindung“).
- [ ] **Visuelle Pflichtmatrix:** Fortschrittsleiste, Einschalt-Dialog,
      Variantenbereich der Stapeleinstellungen und Filter `-has:variant`; dazu
      ein E2E-Test der Stapelgenerierung (Route je Aufruf mit anderer Variante
      gemockt).
- [ ] **Nicht umformulierbare Inhalte untersuchen:** Das erzwungene Werkzeug
      verlangt heute immer eine Variante; bei sinnlosen Inhalten (zufällige
      Buchstabenfolgen) oder Insidern ohne allgemeinen Kontext bleibt dem Modell
      nur eine Hülle („Was gehört zu …?“) oder eine erfundene Deutung. Zu
      untersuchen: Playtest mit solchen Prüfkarten neben den bisherigen sechs,
      danach eine Prompt-Ergänzung mit Ausweg, über den das Modell eine Karte
      als nicht umformulierbar meldet. Offen ist, wie die Route das meldet und
      ob die Karte danach aus Stapelläufen fällt; heute wählt jeder Lauf
      gescheiterte und gemeldete Karten erneut. Ein neuer Zustand erscheint als
      weitere Zustandsmarke im Reiter `Varianten` des Karteneditors
      (ADR-045, `variantStateMarks`).
      Nachweis: Playtest-Ergebnis vor und nach der Prompt-Ergänzung,
      Routentests mit solchen Karteninhalten.

## P2: Karten aus einer Quelle per KI erstellen

Formular und Auftragsprüfung unter `/neue-karten?method=ai-source` stehen
(`src/aiSourceCreation.ts`, `AiSourceCreationPanel.tsx`); „Karten erstellen“
ist deaktiviert, nichts wird gelesen oder übertragen. Offen ist alles, was die
Oberfläche danach verspricht. Setzt P1 und das KI-Kontingent pro Nutzer
voraus.

- [ ] **Entscheidungen vor dem Code (Ergänzung zu ADR-011):** ADR-011 erlaubt
      genau zwei KI-Routen; eine dritte Route (etwa
      `POST /api/ai/source-cards`, gleiches Modell, ZDR, Kostenlog) braucht die
      Ergänzung. Festlegen: ob der Browser nur extrahierten Text oder die
      Datei überträgt (ADR-011 schließt Bildübertragung aus, Scans und
      Diagramme bleiben damit außen vor); Obergrenzen je Auftrag (Zeichen,
      Seiten oder Folien, Karten) und wie große Quellen ohne Serverqueue in
      Portionen im geöffneten Tab laufen; Hinweis, dass die Quelle an den
      Anbieter geht.
- [ ] **Quelle auslesen:** Das Formular nimmt PDF, Text, Markdown, CSV, TSV,
      DOCX und PPTX an. `documentModel.ts` liest die ersten fünf bereits;
      DOCX und PPTX fehlen (ZIP und XML, ohne neue Abhängigkeit über
      `zipReader.ts` prüfen). Jede Textstelle trägt einen echten Beleg (Seite,
      Folie oder Abschnitt), weil der Prompt einen Quellenverweis je Karte
      verlangt. Leere, geschützte, nur gescannte oder zu große Dokumente
      werden mit Meldung abgelehnt, nichts wird still abgeschnitten.
- [ ] **Generierung und Vertrag:** Anfrage- und Antwortschema in einem eigenen
      Vertragsmodul wie `aiCardVariantContract.ts`; die Route nutzt
      `buildAiSourceCreationPrompt` und hält Quellmaterial von Anweisungen
      getrennt. Je Karte getrennt: Frage oder Lückentext, kurze Lösung,
      Auswahloptionen mit Richtigkeit, quellenbasierte Erklärung, externe
      Ergänzung, Quellenverweis. Hinweise des Modells (Material trägt das
      Lernziel nicht, widersprüchliche oder unlesbare Stellen) kommen als
      eigene Meldungen zurück. Fortschritt, Abbruch und Fehler folgen den
      Regeln der Variantengenerierung.
- [ ] **Ergebnis prüfen und übernehmen:** Vor dem Speichern eine Liste der
      vorgeschlagenen Karten mit Vorschau, Bearbeiten und Verwerfen je Karte;
      Bearbeiten und Vorschau nutzen den Reiter `Inhalt` des Editors V2 (P0,
      W16), kein zweiter Editor;
      gespeichert wird erst nach Bestätigung und nur über `coreModel.ts`
      (Frage–Antwort, Lückentext, Single und Multiple Choice gibt es dort
      schon). Feldzuordnung festlegen: kurze Antwort, quellenbasierte
      Erklärung in `extra`, Quellenverweis in `source`; die externe Ergänzung
      braucht eine sichtbar getrennte Kennzeichnung „Ergänzende Erklärung –
      außerhalb der Quelle“ (eigene Feldrolle oder benanntes Feld). Neuer
      Zielstapel entsteht erst bei der Übernahme. Der Entwurfsschutz gilt
      auch für ungespeicherte Ergebnisse.
- [ ] **Freigabe:** „Karten erstellen“ und den Hinweis „noch nicht verfügbar“
      erst danach umstellen; ohne Verbindung bleibt die Aktion mit Meldung
      gesperrt. Specs §6.4, `status.md` und `architecture.md` nachziehen.
      Nachweis: Routen- und Vertragstests, E2E mit gemockter Route (Erfolg,
      Hinweise, Abbruch, Fehler, nichts gespeichert vor Übernahme), echte
      Quellen je Format mit allen vier Kartenformen, visuelle Pflichtmatrix
      für Fortschritt und Ergebnisliste.

## P4: Kartenverwaltung 2.0

Der Reiter `Karten` wird zur vollwertigen Kartenverwaltung nach dem Vorbild von
Ankis Browser: Suche mit Filtermenü, flache Trefferliste, Massenaktionen und
Pflegewerkzeuge in einer Version, ohne vorgeplante Folgeversion. Die Tabelle
behält ihre Spalten `Sortierfeld`, `Datum` und `Variante`; weitere kommen
nicht hinzu. Grundlage sind Sichtprüfung und Messung vom 2026-11-04
(Konto mit 60 Stapeln, Stapel `Muskeltrainer` mit 581 Karten) und Ankis
Seitenleiste (`qt/aqt/browser/sidebar/tree.py`), Suchsyntax
(`rslib/src/search/`) und Tabellenmodell (`qt/aqt/browser/table/`), nur als
Referenz gelesen.

**Befund**

- Die Cloud-Suche (`search_account_card_catalog`) braucht 2,5–3,6 s; sie
  nummeriert und zählt alle Treffer je Stapel, bevor die erste Seite kommt, und
  wertet `flag:`/`tag:` je Zeile über `jsonb_array_elements` aus. Sie läuft auch
  bei vollständigem lokalem Katalog online (`workspaceHydrationService.ts`,
  `queryCardPage`).
- Während der Suche zeigt jeder Stapel `Keine Karten`; online erscheint
  danach fälschlich `Offline werden nur bereits lokal indexierte Karten …`.
- `is:due` und andere Anki-Begriffe werden als Freitext gesucht und liefern
  kommentarlos nichts.
- 581 Karten im `Muskeltrainer` tragen dasselbe Sortierfeld; welche Abfrage
  gemeint ist, zeigt erst der Editor.
- Kein Stapelfilter, keine Mehrfachauswahl; Seitenwechsel in 50er-Seiten je
  Stapel zerlegt Suchtreffer über viele Stapel.
- Spaltenkopf scrollt weg, Kartenzeilen sind nicht unter ihren Stapelkopf
  eingerückt, das Panel heißt `Aktive Stapel`, Elternstapel zeigen
  `Keine Karten`, obwohl Unterstapel Karten haben.
- Mobil belegen Suche und Filter den ersten Bildschirm; Fragen werden nach
  etwa 14 Zeichen gekürzt.

**Entscheidungen (2026-11-04)**

- Zielgröße: 50.000 Karten flüssig, 100.000 bedienbar. „Flüssig“ heißt die
  Budgets unter KV1, gemessen, nicht geschätzt.
- Ohne Suche und Filter bleibt der Stapelbaum; mit Suchtext oder einem Filter
  außer dem Stapelfilter zeigt die Liste alle Treffer flach. Der Stapelfilter
  allein zeigt den gewählten Teilbaum.
- Stapel wandern aus der Trefferliste in den Stapelfilter der Suchzeile.
- Massenaktionen bestätigen ab einer Karte mit Dialog (Wirkung und Anzahl);
  danach folgt in jedem Fall ein Toast mit `Rückgängig`, auch bei `Löschen`.
- Die Suche durchsucht wie heute alle Felder und kann zusätzlich in einem
  einzelnen Feld suchen.
- Das Menü erklärt Kombinationsregeln, Chips und Suchbegriffe selbst.
- Menüaufbau (A/B-Runden 1 und 2): Das Menü klappt unter der Suchzeile auf.
  Kategorien links, rechts die Einträge der gewählten Kategorie mit
  Suchbegriff und dem Schalter `Mit`/`Egal`/`Ohne` (Ausgangsstellung
  `Egal`, also nicht Teil der Suche). Darüber steht der erzeugte
  Suchausdruck mit Kopieren.
  `Speichern` legt ihn als benannte Suche ab, `Zurücksetzen` leert alle
  Filter. Gespeicherte Suchen und Suchsyntax bilden zusammen die letzte
  Kategorie `Gespeichert & Syntax`.
- Mobil: Suchfeld mit Stapel- und Filter-Icon samt Zähler; das Filter-Icon
  unterscheidet sich vom Icon des Knopfs `Lerneinstellungen`.
- Bausteine: vorhandene UI-Komponenten (`DeckSelect`, `ActionButton`,
  `IconButton`, `CoreSegmentedControl`, `FlagDot`, `core-field`,
  `SoftPanel`); neu sind nur Kategorienleiste (Muster der
  `InPageNavigation`-Leiste), Filter-Chip (Muster der `TagInput`-Chips) und
  `CoreTriStateControl` (A/B-Runde 3, Variante A): dieselbe Schiene wie
  `CoreSegmentedControl` (Rahmen, Radius, 3 px Innenabstand, 4 px Abstand),
  aber quadratische Symbolsegmente ✓ | – | ⊘ in Auswahlhöhe minus 8 px
  (30 px, bei Touch 36 px), Ausgangsstellung `Egal` in der Mitte. Der
  Indikator gleitet in 180 ms und blendet seine Farbe in 260 ms über (blau
  `Mit`, rot `Ohne`, neutral `Egal`); Reduced Motion schaltet beides ab. Rolle `radiogroup`, Tooltips nennen `Mit`, `Egal`, `Ohne`. Alle neuen
  Elemente folgen der Designsprache der BengtsToolBox (ADR-046) und kommen
  in den UI-Katalog.
- Persistenz: so einfach wie möglich. Suche, Filter und Sortierung leben wie
  heute nur im Bildschirmzustand; Reload oder Reiterwechsel beginnt leer.
  Dauerhaft sind nur gespeicherte Suchen. Nachsteuern erst bei Bedarf.
- `Suchen und Ersetzen` ersetzt wörtlichen Text; reguläre Ausdrücke gibt es
  weder dort noch in der Suche.
- `Treffer lernen` bietet wie Ankis gefilterte Stapel beide Wege (KV5):
  `Vorziehen` mit zählenden Bewertungen (Standard, wie Ankis voreingestellte
  Option „Reschedule cards based on my answers“) und `Nur üben` ohne
  Planänderung (Ankis Vorschaumodus).

- [ ] **KV2 – Erweiterte Suche vervollständigen:** Suchzeile, Chips, Menü
      mit `CoreTriStateControl` und die Begriffe aus den vorhandenen
      Katalogspalten stehen (`is:new|learn|review|young|mature|due`,
      `prop:due`, `did:`, `has:variant`). Offen, jeweils lokal
      (`matchesCardSearch`) und in beiden Cloud-RPCs gleich ausgewertet, mit
      Paritätstests und erweitertem `benchmark:search`:
      - **KV2b – Lernverlauf im Katalog:** Der Katalog erhält, was die übrigen
        Menüzeilen brauchen: Heute (heute gelernt, heute „Nochmal“, heute
        hinzugefügt, heute bearbeitet, erstmals gelernt, neu geplant),
        Kartenstatus `Zurückgestellt`, Inhalt (Inhaltsform, Anki-Notiztyp,
        Abfrage, Varianten veraltet), Zeitraum (hinzugefügt, bearbeitet,
        bewertet, erstmals gelernt in N Tagen) und Werte (Intervall,
        Haltbarkeit, Schwierigkeit, Abrufwahrscheinlichkeit, Wiederholungen,
        Fehler mit Vergleich). Syntax: `is:buried`, `added:`, `edited:`,
        `rated:n[:Bewertung]`, `introduced:`, `resched:`, `prop:` für diese
        Werte, `deck:Name`. Braucht eine Schemaergänzung.
      - **KV2c – Gespeicherte Suchen:** kontogebunden und synchronisiert, in
        der Kategorie `Suchsyntax` über der Erklärung. `Speichern` legt oben
        eine Zeile mit Namensfeld an; ein Klick wendet die Suche an, dazu
        Umbenennen und Löschen. Braucht eine Schemaergänzung.
      - **KV2d – Kombination:** `"Phrase"`, `or` und Klammern; innerhalb
        einer Menügruppe genügt dann ein Treffer, zwischen Gruppen müssen alle
        zutreffen. Keine regulären Ausdrücke.
      Nachweis: Parser- und Komponententests, Pflichtmatrix Light/Dark bei 390
      und 1440 px, E2E Suche und Filter.
- [ ] **KV3 – Trefferliste:** Eine durchgehende, virtualisierte Liste ersetzt
      die 50er-Seiten je Stapel, im Baum wie in der flachen Ansicht; die
      Seitennavigation entfällt. Flach zeigt die Trefferzahl und den
      Stapelpfad; Vor/Zurück im Editor läuft über alle Treffer. Mobil
      zweizeilige Zeilen mit Datum rechts.
      Nachweis: Scrolltest mit 50.000 Karten ohne lange Tasks über 50 ms,
      Pflichtmatrix.
- [ ] **KV4 – Mehrfachauswahl und Massenaktionen:** Auswahl per Kontrollkästchen,
      Umschalt- und Strg-Klick, `Alle N Treffer auswählen`, mobil Langdrücken;
      eine Auswahlleiste nennt die Anzahl. Aktionen: Stapel ändern, Tags
      hinzufügen und entfernen, Flagge setzen und entfernen, Markieren,
      Aussetzen und Reaktivieren, Zurückstellen, Fälligkeit setzen (Datum oder
      Bereich), Lernstand zurücksetzen, Position neuer Karten (Ankis
      `Reposition`), Varianten generieren (ersetzt `Für diese Karten Varianten
      generieren`), Löschen. Jede Aktion läuft als eine
      lokale Transaktion über neue Sammelhelfer in `coreModel.ts`, synchronisiert
      gebündelt und ist als neue Änderung rückgängig zu machen; zwischenzeitlich
      geänderte Karten meldet der Toast.
      Nachweis: Modelltests je Aktion samt Rückgängig, Konflikt- und
      Offline-Fälle, E2E einer Massenaktion; 1.000 Karten lokal in höchstens
      1 s, Sync im Hintergrund.
- [ ] **KV5 – Inhalte pflegen:**
      - **Suchen und Ersetzen:** in allen Feldern, einem Feld oder Tags, für
        Auswahl oder alle Treffer, wörtlich, mit Groß-/Kleinschreibung und Vorschau der
        betroffenen Inhalte. Zählt als lokale Bearbeitung
        (`contentRevision`), macht Varianten veraltet und ist rückgängig zu
        machen.
      - **Duplikate finden:** nach Feld oder Sortierfeld, optional innerhalb der
        aktuellen Suche, im Worker; Gruppen öffnen, taggen oder löschen.
      - **Tag-Verwaltung** für das Konto: umbenennen samt Untertags,
        zusammenführen, löschen, ungenutzte bereinigen, Herkunft anzeigen; im
        Menü über die Tag-Zeile.
      - **Treffer lernen:** lernt die aktuellen Treffer oder die Auswahl,
        unabhängig von Fälligkeit und Tageslimits; ausgesetzte und
        zurückgestellte Karten bleiben außen vor. Ein Startdialog nennt die
        Kartenzahl und bietet `Vorziehen` (Standard) oder `Nur üben`, dazu die
        Reihenfolge `Wie die Liste` oder `Gemischt`.
        - **Vorziehen:** normale Sitzung mit gespeicherten Bewertungen über
          den bestehenden Schreibpfad (`record_review`). Noch nicht fällige
          Karten zählen als vorgezogene Wiederholung; FSRS rechnet mit den
          tatsächlich vergangenen Tagen, die Haltbarkeit wächst deshalb
          weniger als bei pünktlicher Wiederholung. Neue Karten werden
          eingeführt, ohne das Tageslimit zu belasten.
        - **Nur üben:** Ablauf wie eine Sitzung (Frage, Aufdecken,
          Bewerten). `Nochmal` holt die Karte nach einigen anderen Karten
          zurück, `Schwer` noch einmal, `Gut` und `Einfach` beenden sie für
          diese Übung; sie endet, wenn jede Karte einmal gewusst wurde.
          Lernstand, Fälligkeit, FSRS-Werte und Lernbremse bleiben
          unverändert, es entsteht kein Bewertungseintrag. Am Ende eine
          Übersicht (geübt, wie oft `Nochmal`) mit `Nochmal üben` für die
          schwierigen Karten.
        - Technisch ein transienter Sitzungsstapel wie die Prüfungseinheit
          (`plannedOrder`), aber mit einer Trefferschlange statt der
          Fälligkeitsschlange; `Nur üben` hat keinen Schreibpfad. Damit
          lassen sich auch Prüfungsthemen über Tags lernen.
      Nachweis: Modell- und Routentests, Reimport-Schutz bearbeiteter Inhalte,
      E2E je Werkzeug.
- [ ] **KV6 – Arbeitsfluss:** Ab etwa 1280 px öffnet der Editor neben der
      Liste, darunter bleibt der Dialog; die Liste behält Auswahl und
      Scrollposition. Tastenkürzel für Suche, Bewegen und Öffnen, Auswahl,
      Flagge, Markieren, Aussetzen, Stapel, Tags, Löschen und Rückgängig, ohne
      Browser-Kürzel zu überschreiben; Tooltips nennen sie.
      Nachweis: Tastaturtests, Pflichtmatrix bei 1280 und 1440 px; Editor
      öffnet bei lokalem Kartenkörper in höchstens 150 ms.
- [ ] **Abschluss:** `specs.md` §5.3 und §6, `architecture.md` (Suchindex,
      Massenaktionen), ADR zu Suchmodell und Cutover, Hilfeseite.

## Offene Nachweise

Abnahmen der Kartenmodell-Roadmap; sie brauchen echte Geräte oder Daten, keinen
neuen Code.

- [ ] **Gerätenachweise (Phase 3):** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones; dazu die
      Mindmap-Gesten aus W4c (Doppeltippen, Langdrücken, Zwei-Finger-Zoom,
      Vollbild) auf iOS und Android.
      Karteneditor V2: Tag-Eingabe mit Bildschirmtastatur (Android schickt
      die Leertaste oft ohne Tastenereignis), Reiter und Flaggenraster bei
      200 % Zoom.
- [ ] **Originallayout in der App (ADR-047):** Pokémon-Stapel
      (`fixtures/apkg/corpus/Pokemon_Gen_I_Auszug.apkg`) mit echtem Konto
      importieren, auf einem zweiten Gerät öffnen und offline lernen; Review,
      Editor-Vorschau und Importvorschau in Light und Dark bei 390 und 1440 px.
      Renderer, Sync und Katalog sind automatisiert und visuell belegt, die
      eingeloggte App nicht.
- [ ] **Korpus (Phase 5):** AnKing und ein echter Lernstand mit Lern-,
      Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten. Ziel: mindestens
      95 % voll übersetzt, 0 % nicht darstellbar. Prüfung:
      `npm run report:apkg-corpus`.

## Vor dem ersten externen Release

- [ ] **Preload-Gate:** `npm run performance:measure:local` meldet für den
      automatischen 4G-Preload einen längsten Task über 50 ms, schon auf
      `main` (2026-10-30: max. 70 ms, mit Editor V2 PR A max. 83 ms, mit PR C
      max. 51 ms, je mit Läufen ganz ohne langen Task). Klären, welcher Task beim Vorladen
      blockiert (Modulauswertung der Lazy-Chunks oder Repository-Arbeit), und
      ihn teilen oder das Gate begründet anpassen. Nachweis: zwei grüne Läufe.

- [ ] **KI-Kontingent pro Nutzer:** Alle Nutzer teilen das Ausgabenlimit des
      OpenRouter-Schlüssels; ein Tageslimit je Account (atomare Zählung in
      Supabase) verhindert, dass ein Nutzer es allein aufbraucht. Braucht eine
      Ergänzung zu ADR-011.
- [ ] **KI-Routen in `npm run dev`:** Das Vite-Plugin `localAiRoutes` in
      `vite.config.ts` bedient `/api/ai/summary` und `/api/ai/card-variant`
      bereits lokal; `operations.md` nennt dafür noch `vercel dev`. Vor dem
      ersten Release oder wenn weitere Entwickler lokal mit KI arbeiten,
      entscheiden, welcher Weg gilt, und `operations.md` anpassen.
- [ ] **Login-Wege:** Magic Link und Google sind gebaut, aber per Flag aus. Für
      Magic Link braucht es einen eigenen SMTP-Server in Supabase, freigegebene
      Redirect-Adressen (Produktion, Preview), eine deutsche Mailvorlage und
      zusätzlich einen 6-stelligen Code zum Eintippen, weil der Link auf
      Mobilgeräten oft im falschen Browser landet. Google erst nach Entscheidung
      über den OAuth-Prüfprozess und den Datenschutztext; sonst Code und Flag
      entfernen.

## Testsuite verschlanken

Läuft unabhängig von P1/P2, je Paket ein eigener PR. Regeln im Pflegevertrag
von [`test-portfolio.md`](test-portfolio.md#pflegevertrag); Messung vom
2026-10-31 im [Verlauf](history.md).

- [ ] **D – Browserflows, Rest:** Etwa 80 Flows setzen das Cloud-Konto
      zurück, auch reine Layoutprüfungen; `card-lifecycle` doppelt vor und
      nach jedem Test. Überschneidungen zusammenlegen (Speicherschutz der
      Einstellungen dreifach, Pomodoro, Heatmap-Geometrie, Bewertung),
      wirkungslose feste Wartezeiten entfernen und die übrigen Breitenschleifen
      der Supabase-Specs (`product-surfaces`, `core-stabilization`,
      `world-capitals-hierarchy`) über `matrixViewports()` und `matrixThemes`
      aus `tests/e2e/support/visualMatrix.ts` kürzen. Katalogkonfiguration,
      `--gate=affected` und die eingedampften Katalogflows sind erledigt (siehe [Verlauf](history.md)). Nachweis: Laufzeit von
      `npm run test:e2e:local` vorher und nachher, mit lokalem Supabase.

## Später

### Anki-Austausch nach dem Karteneditor V2

- Stapel-Export als `.apkg`. Dabei `marked`, `leech` und Flaggen
  zurückschreiben, `importedTags` und Anki-Rohtexte nutzen.
- Import aus `.colpkg` (bringt Flaggennamen und Einklappzustand der Tags mit).
- AnkiHub-Schutz-Tags (`AnkiHub_Protect::Feld`) als Feldschutz beim Reimport
  auswerten.
- Inhaltsform importierter Inhalte wechseln, als Umwandlung in einen eigenen
  Inhalt.
- Feldeigenschaften aus Notiztypen: Schreibrichtung rechts nach links,
  Schriftart, Ausschluss von der Suche.

### Weitere

- Native App nach ADR-036.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
- Quiz als eigenes Feature (ADR-042): Stapel-Tab `Quiz` ist Platzhalter.
  Danach Quizplanung im Prüfungsplaner; einen Entwurf mit manuellen
  Kapitel- und Gruppenquizzen und einem eigenen Lernmethoden-Schritt enthält
  Commit `71a7892` (`codex/klausurplaner-design`).
- KI-Varianten vorausschauend erzeugen: Heute erzeugt die Stapelaktion des
  Proof of Concept beim Einschalten Varianten für bis zu 50 Karten auf einmal,
  auch für Karten, die noch lange keine Variante zeigen. Künftig erzeugt CoRe
  bei eingeschaltetem CoRe-Modus Varianten gesammelt nur für Karten, die in den
  nächsten Tagen die Haltbarkeitsschwelle des Stapels (7/21/60 Tage) erreichen.
  Auswahl: Karten in der Wiederholung ohne aktive Variante, deren Haltbarkeit
  nach einem `Gut` am Fälligkeitstermin die Schwelle erreicht und die in den
  nächsten N Tagen fällig sind; `createReviewChain` aus `scheduler.ts` rechnet
  das ohne Buchführung je Karte. Erzeugt wird nur im geöffneten Tab, in kleinen
  Portionen, mit der bestehenden Fortschrittsleiste und denselben Fehler- und
  Abbruchregeln; eine Serverqueue entsteht nicht. Voraussetzungen: die offenen
  Punkte des Proof of Concept unter P1, das KI-Kontingent pro Nutzer und eine
  Ergänzung zu ADR-011 (automatische Erzeugung, Auswahlregel, Tageslimit).
  Verteilt die Kosten über die Tage und verbraucht nichts für ungelernte
  Karten. Nachweis: Test der Auswahl über die Beispielketten, E2E mit
  gemockter Route.
- Persönliche FSRS-Parameteroptimierung: Heute gelten für alle die
  21 FSRS-7-Standardparameter; Abstände passen dadurch nur zum
  Durchschnittsgedächtnis. Der Optimierer `@open-spaced-repetition/binding`
  (WebAssembly, passend zu `ts-fsrs` 6) berechnet in einem Worker aus den
  eigenen Bewertungen, einschließlich importierter Anki-Historie, eigene
  Parameter je Stapelprofil. Übernommen werden sie nur, wenn sie den Verlauf
  messbar besser vorhersagen als die Standardwerte (Log-Loss oder RMSE auf
  zurückgehaltenen Bewertungen) und genug Bewertungen vorliegen (Mindestzahl
  bei der Umsetzung festlegen, Größenordnung einige hundert). Die Parameter
  liegen im Stapelprofil und synchronisieren mit. Weil Haltbarkeit von den
  Parametern abhängt, verschieben sich Reife, Variantenfreigabe,
  Prüfungsprognose und Statistik mit; beim Übernehmen muss deshalb
  `study.extra.maturityBand` aller betroffenen Karten neu berechnet und
  `study_revision` erhöht werden, damit Katalog und andere Geräte
  nachziehen. Fälligkeiten bestehender Karten bleiben bis zur nächsten
  Bewertung unverändert. Oberfläche: Aktion in den Stapeleinstellungen mit
  Vergleich alt/neu und Zurück zu den Standardwerten. Rahmen in ADR-044;
  Ablauf und Mindestzahl dort bei der Umsetzung ergänzen. Nachweis:
  Golden-Test bleibt auf Standardparametern, Tests für Übernahme, Ablehnung
  und Neuberechnung.
- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
- Prüfungsplanung: semantische Themenzuordnung innerhalb ungegliederter Stapel.
  Heute bilden Unterstapel die Themen; eine spätere Zuordnung braucht
  explizite, prüfbare Themengrenzen und darf Lernstände nicht ändern. Einen
  Lösungsweg über Tags bietet P4 mit `Treffer lernen` (KV5).
