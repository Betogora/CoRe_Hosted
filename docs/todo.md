# CoRe TODO

Stand: 2026-10-31

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität: P1 vor P2. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig, „Später“ ist geparkt.

## P1: KI-Varianten (Proof of Concept) abschließen

Bewusst einfacher Probelauf (ADR-011); Auswahl und Oberfläche werden danach
geglättet.

- [ ] **Einstiege:** Zähler der Karten ohne Variante in den Stapeleinstellungen
      (danach eine einzige Aktion, deren Beschriftung zwischen „generieren“ und
      „neu generieren“ wechselt); nach Fehlschlägen führt `Anzeigen` in der Leiste
      zum Filter „Ohne Variante“; Stoppgründe in der Leiste kurz halten (z. B.
      „Keine Verbindung“).
- [ ] **Visuelle Pflichtmatrix:** Fortschrittsleiste, Einschalt-Dialog,
      Variantenbereich der Stapeleinstellungen und Filter `Ohne Variante`; dazu
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

- [ ] **B – Veraltetes und toter Code:** `libraryModel.test.ts` (Heatmap-Test)
      nutzt `reviewedAt` statt `answeredAt` und prüft „künftige Reviews bleiben
      unsichtbar“ dadurch nicht. Nur von Tests genutzte Exporte samt Tests
      entfernen (`readAppRouteFromHistoryState`, `deleteLearningSummary`,
      `applyLearningSettingsToDeckSettings`, `getView`/`listViews` mit
      Ansichtsmetadaten, `accountStorageKeys`); `knip --production` zusätzlich
      ins Gate, damit solche Exporte künftig auffallen.
      `creationPipeline.test.ts` (kein gleichnamiges Modul) in
      `coreModel/notes.test.ts` aufgehen lassen. Abwesenheitsprüfungen
      entfernter Funktionen (Labs, KI-Assistent, alte Routen) in Modul- und
      Browsertests streichen.
- [ ] **C – Scope Creep:** In `themeContract.test.ts` Hex- und Wertesnapshots
      streichen, die Lint-Regeln (Fokus, Kontrast, alte Palette) behalten.
      Prüfungen exakter Tailwind-Klassen in den UI-Tests (`AppNavigation`,
      `DeckTree`, `coreUi`, `StudyHeatmap`, `DeckSummaryRow`,
      `ColorWheelPicker`, `LearningAreaHeader`) auf Rollen, Daten und Text
      umstellen; `colorPicker.test.ts` sowie CSS-Regeln aus `styles.css` in
      `feedbackUi`/`SettingsSaveBar` entfallen; `HelpScreen.test.tsx` auf
      Überschriften und Anker kürzen. Doppelte Prüfungen zusammenlegen
      (Decktiefe viermal, AI-Route-Middleware in beiden Routentests,
      Fortschritt in StudyMode, Dashboard-Standardwidgets). Großfixtures
      verkleinern (10.000 Karten in `libraryModel`, 300+ in `examPlanning`).
- [ ] **D – Browserflows:** Etwa 80 Flows setzen das Cloud-Konto zurück,
      auch reine Layoutprüfungen; `card-lifecycle` doppelt vor und nach jedem
      Test. Screenshot-Matrizen (`note-presentation`, `learning-summaries`,
      `deck-ui-restoration`) hinter `CORE_VISUAL_OUTPUT`. Katalogspecs ohne
      Supabase in eine eigene parallele Playwright-Konfiguration, die auf PRs
      in der CI läuft. Überschneidungen zusammenlegen (Speicherschutz der
      Einstellungen dreifach, Pomodoro, Heatmap-Geometrie, Bewertung),
      wirkungslose feste Wartezeiten und lange Breitenschleifen auf die
      Breakpoints der visuellen Pflichtmatrix kürzen. Danach `--gate=affected`
      in `runLocalE2E.ts`: geänderte Specs plus Zuordnung von `src/screens`,
      `src/ui` und Sync-Modulen zu Specs. Nachweis: Laufzeit von
      `npm run test:e2e:local` vorher und nachher.
- [ ] **Dokumentationsprüfung beschleunigen:** `npm run check:docs` ist nach
      dem parallelen Gate der längste Schritt; fast die ganze Zeit steckt im
      Rollup-Bundle des UI-Katalogs. Prüfen, ob ein Inhaltshash der
      Bundle-Eingaben den Neuaufbau bei unveränderten Quellen überspringen
      kann, ohne veraltete HTML-Seiten durchzulassen.

## Später

### Kartenverwaltung V2

Aus dem Karteneditor V2 (ADR-045) ausgeklammert:

- Tag-Verwaltung für das ganze Konto: umbenennen, zusammenführen, löschen,
  Herkunft anzeigen.
- Mehrfachbearbeitung: Flagge, Tags, Stapel, Aussetzen, Neu planen,
  Zurücksetzen für viele Karten.
- Suchen und Ersetzen in Feldern.
- Duplikate kontoweit finden, etwa „Felder gleich“.
- Gespeicherte Suchen und Spaltenauswahl.
- Position neuer Karten (Ankis „Reposition“).
- Lernen nach Tag oder Flagge (Ankis gefilterte Stapel), sinnvoll gemeinsam mit
  dem Lernbereich. Prüfungsthemen über Tags als Antwort auf die offene
  Themenzuordnung in ungegliederten Stapeln.

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
  Kapitel- und Gruppenquizzen im gespeicherten Planformat enthält
  `codex/klausurplaner-design`, ohne Quizplanung ist der Branch sonst
  übernehmbar.
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
  Lösungsweg über Tags nennt P0 unter „Für Kartenverwaltung V2 vorgemerkt“.
