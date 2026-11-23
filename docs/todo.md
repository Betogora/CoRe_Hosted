# CoRe TODO

Stand: 2026-11-23

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. „Später“ ist geparkt.

## P5: KI-Eval und Hillclimb

Alle vier KI-Routen stehen (`card-variant-v5`, `card-help-v1`,
`source-cards-v2`, `learning-summary-v4`); P5 beginnt. Gemessen ist nichts:
kein echter Lauf, kein Ledger-Eintrag. Der Runner ([KI-Eval](ai-eval.md))
kennt Varianten und `card-help` mit je 24 Prüfkarten und bliebe in einem
echten Lauf an abgelehnten Antworten hängen. Befunde, Versuchsaufbau und
Arbeitspakete im Einzelnen stehen im [Versuchsplan](ai-eval-plan.md).

Festgelegt am 2026-11-23: Erzeugt wird nur über OpenRouter mit eigenem
Eval-Schlüssel, nie über ein Modell aus einer Subscription. Richter ist
Opus 5.5 als Subagent in Claude Code, je Block ein frischer Kontext. Eine
Handkalibrierung gibt es vorerst nicht; jeder Bericht zeigt je Kriterium
die zwei bis drei am wenigsten eindeutigen Urteile. Der Hillclimb läuft
innerhalb eines Modells, der Referenz `openai/gpt-6-luna` mit `low`; ein
Modellvergleich folgt später von Hand und wird nicht eigens gebaut. Ein
Modellwechsel und das KI-Kontingent sind nicht Teil von P5.

Pakete in dieser Reihenfolge; A bis G messen noch nichts.

- [ ] **A – Grundsätze und Zugang:**
      [ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis)
      nach den Festlegungen neu fassen und annehmen (Kandidat als Datei,
      drei Teile je Fallsatz, Richter in Blöcken ohne Kalibrierung, Übernahme
      über den Fingerabdruck des Prompts). `OPENROUTER_EVAL_API_KEY` mit
      Limit 30 USD und `CORE_AI_EVAL_DIR` als Benutzer-Umgebungsvariablen
      ([operations.md](operations.md#openrouter-schlüssel)).
- [ ] **B – Runner reparieren:** Heute bleibt ein echter Lauf hängen, weil
      `generate.ts` sieben Ablehnungscodes der Variantenroute nicht kennt und
      solche Antworten endlos neu anfragt. Von der Route abgelehnte Antworten
      und Zeitüberschreitungen zählen als Antwort statt offen zu bleiben;
      „nicht umformulierbar“ ist je Fall erwartbar; ein Lauf erkennt seinen
      Prompt am Fingerabdruck; Budgetabbruch, einstellbare Parallelität,
      Warten bei Ratenlimit; Aufteilung in Training, Entscheidung und
      Rückhalt nach Gruppen. Nachweis: Trockenlauf mit nachgebildeten
      Ablehnungen endet vollständig.
- [ ] **C – Kandidaten und Richter:** Prompt, Werkzeugschema, Ausgabegrenze
      und Reasoning je Lauf über eine Kandidatendatei wählbar, ohne den Code
      der Route zu ändern. Richtertabelle in Blöcken mit je einem frischen
      Subagenten, Sicherheit je Urteil, Doppelurteile als Richterrauschen,
      wiederverwendete Urteile für gleiche Ausgaben. `--record` ohne
      Kalibrierung. Nachweis: zwei Kandidaten nebeneinander;
      ein zweiter Lauf mit gleichen Ausgaben braucht keinen Richter.
- [ ] **D – Auswertung und Übersicht:** Entscheidungsregel mit Kosten und
      Latenz; Fallen im Bericht; Ergebnisdateien ohne Inhalte versioniert,
      damit der Vergleich an keinem Worktree hängt. Seite
      [KI-Eval](ai-eval.md) mit Rückhalt, Richterrauschen und Bilanz.
      Nachweis: Bilanz aus einem Testledger; Vergleich ohne `output/`.
- [ ] **E – Fallsätze Varianten und KI hilft:** je Anfragetyp etwa 200
      Fälle aus Prüfkarten und Korpus (`cases --corpus`), darunter
      Eintippen, Ketten mit vorhandenen Varianten, Lückentexte mit fast
      textfüllender Lücke, Freitext ohne echte Frage und Fallen je kritischem
      Kriterium. Nachweis: Fallzahlen je Teil und Kategorie; Stichprobe vom
      Nutzer gesehen.
- [ ] **F – Karten aus einer Quelle messbar machen:** Registereintrag und
      Definition je Dokument über den ganzen Auftrag (mehrere Anfragen,
      Zahlenwerte als Messgrößen), etwa 24 Dokumente mit Kernaussagen,
      darunter lange Quellen. Nachweis: Die Messung vom 2026-11-22
      ([Verlauf](history.md)) ist mit dem Runner nachgestellt.
- [ ] **G – Zusammenfassung messbar machen:** Definition, etwa 24
      Materialsätze mit Kernaussagen und Einstellungsprofilen. Nachweis: ein
      echter Lauf über drei Materialsätze.
- [ ] **H – Baseline:** alle Anfragetypen mit den Prompts des Codes auf
      allen drei Teilen. Nachweis: Ledger und Seite. Haltepunkt: Der Nutzer
      legt Zielwerte und Reihenfolge der Welle fest und sagt, ob der Richter
      passt; die Zielwerte im Versuchsplan sind bis dahin ein Entwurf.
- [ ] **I – Hillclimb, erste Welle:** Varianten, KI hilft, Karten aus einer
      Quelle, Zusammenfassung. Je Runde drei bis fünf Kandidaten aus den
      Trainingsfehlern, Vorauswahl am Trainingsteil, Entscheidung am
      Entscheidungsteil; Ende bei erreichtem Ziel, drei Runden ohne Übernahme
      oder acht Runden. Bei Karten aus einer Quelle zusätzlich: Kartenmenge
      wirksam machen (Weniger höchstens 60 %, Mehr mindestens 140 % der
      Vorschläge von Normal, ohne Füllkarten und bei gleicher Belegtreue;
      danach die Dichten in `AI_SOURCE_AMOUNTS` neu messen), Single Choice
      wird nie gewählt, Tabellenzeilen ergeben Doppelfragen, und die
      Zerlegung der Quelle in drei Varianten vergleichen. Nachweis: je
      Anfragetyp ein Pull Request mit Promptversion und Ledger-Einträgen.
- [ ] **J – Abschluss:** Kostenziele je Anfragetyp nach `operations.md`,
      Versuchsplan auflösen. Nachweis: Die Seite zeigt Bestand, Verlauf und
      Bilanz für alle Anfragetypen.

## Offene Nachweise

Abnahmen gebauter Funktionen; sie brauchen echte Geräte oder Daten, keinen
neuen Code.

- [ ] **Gerätenachweise:** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones; dazu die
      Mindmap-Gesten (Doppeltippen, Langdrücken, Zwei-Finger-Zoom, Vollbild)
      auf iOS und Android. Karteneditor: Tag-Eingabe mit Bildschirmtastatur
      (Android schickt die Leertaste oft ohne Tastenereignis), Reiter und
      Flaggenraster bei 200 % Zoom. „KI hilft“: Die Tastatur verdeckt die
      Eingabe im Bottom Sheet nicht.
- [ ] **Feldwerte von Testgeräten (ADR-050):** Unter Einstellungen → Über
      uns „Leistungsdaten kopieren“ auf mehreren Geräten nach einigen
      Lernsitzungen ausführen und Median und p95 für Start, „Antwort
      anzeigen“, Bewertung und Kartensuche gegen die Laborwerte in
      [`test-portfolio.md`](test-portfolio.md#performance-gates) halten.
- [ ] **Originallayout in der App (ADR-047):** Pokémon-Stapel
      (`fixtures/apkg/corpus/Pokemon_Gen_I_Auszug.apkg`) mit echtem Konto
      importieren, auf einem zweiten Gerät öffnen und offline lernen; Review,
      Editor-Vorschau und Importvorschau in Light und Dark bei 390 und 1440 px.
      Renderer, Sync und Katalog sind automatisiert und visuell belegt, die
      eingeloggte App nicht.
- [ ] **FSRS-7 an Feldwerten prüfen (Agenda 1.10):** Erst ändern, wenn
      echte Antworten es zeigen. Gemessen wird außerhalb der App (6.3): die
      tatsächliche Erinnerung in der Wiederholung gegen die Zielerinnerung
      (Toleranz ±3 Punkte) sowie Log-Loss und RMSE von FSRS-7-Standard gegen
      FSRS-6-Standard und persönlich optimierte Parameter. Ab 1.000
      Wiederholungsantworten mit mindestens einem Tag Abstand in einem Konto;
      vorher dürfen die Anki-Historien des Korpus vormessen. Geändert wird nur
      bei mehr als 3 Punkten Abweichung oder klar besserer Vorhersage.
- [ ] **APKG-Korpus:** AnKing und ein echter Lernstand mit Lern-,
      Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten. Ziel:
      mindestens 95 % voll übersetzt, 0 % nicht darstellbar. Prüfung:
      `npm run report:apkg-corpus`.

## Vor dem ersten externen Release

- [ ] **KI-Kontingent pro Nutzer:** Alle Nutzer teilen das Ausgabenlimit des
      OpenRouter-Schlüssels; ein Tageslimit je Account (atomare Zählung in
      Supabase) verhindert, dass ein Nutzer es allein aufbraucht. Braucht eine
      Ergänzung zu ADR-011.
- [ ] **Magic Link:** Gebaut, aber per Flag aus. Braucht einen eigenen
      SMTP-Server in Supabase, freigegebene Redirect-Adressen (Produktion,
      Preview), eine deutsche Mailvorlage und zusätzlich einen 6-stelligen
      Code zum Eintippen, weil der Link auf Mobilgeräten oft im falschen
      Browser landet.
- [ ] **Erste Synchronisation großer Konten:** Der lokale Schreibpfad für
      50.000 Karten sank von 570 auf rund 80 bis 110 s (isoliert in Chromium,
      ohne Netz); Validierung kostet etwa 1 s, der Rest ist IndexedDB mit
      sechs Katalogindizes. Offen: Gesamtdauer gegen den echten Server messen
      und den Zielwert festlegen (Vorschlag: höchstens 2 Minuten). Nachweis:
      Messung mit 50.000 Karten vom Login bis zum vollständigen Katalog.

## Später

### KI

- DOCX und PPTX als Quellen für Karten aus einer Quelle (ZIP und XML, ohne neue Abhängigkeit über
  `zipReader.ts` prüfen; Beleg je Folie oder Abschnitt).
- Bilder als Quelle für Karten aus einer Quelle (teurer, eigener Hillclimb); braucht eine Ergänzung
  von ADR-011 (Agenda 3.3, 3.5).
- Modellvergleich von Hand über eine Kandidatendatei, auf denselben
  Fallsätzen, sobald die erste Welle von P5 steht.
- KI-Kontingente je Nutzer im Zusammenspiel mit Bezahlstufen bzw.
  Abonnements (Umfang je Stufe, Credits, Abrechnung nach Kosten).

### Lernen und Planung

- Persönliche FSRS-Parameter je Stapelprofil, nur wenn sie den eigenen
  Verlauf messbar besser vorhersagen (ADR-044; Ausarbeitung in Commit
  `4dd2af7`).
- Quiz als eigenes Feature (ADR-042), danach Quizplanung im Prüfungsplaner;
  Entwurf in Commit `71a7892` (`codex/klausurplaner-design`).
- Name des Schalters „CoRe-Modus“ nach dem Variantenkonzept; Vorschlag
  „Umformulierungen“ (Agenda 1.7).
- Simulator für das ganze Konto entfernen; stattdessen eine selbst klickbare
  Simulationskette je Karte für alle, Vorbild Flashka recherchieren (6.1).
- Tageszahlen der Lernsitzung nach einem mitten in der Sitzung geänderten
  Tageslimit neu aus den lokalen Stapelzählungen laden (heute Stand beim Start).
- Semantische Themenzuordnung in ungegliederten Stapeln, ohne Lernstände zu
  ändern; ein Lösungsweg über Tags ist `Treffer lernen` der Kartenverwaltung.

### Kartenverwaltung

- Gliederung nach Tags als aufklappbarer Tag-Baum in einer Seitenleiste, wie
  in Anki (Agenda 5.7).
- Massenaktionen schneller: 1.000 Karten lokal in höchstens 1 s statt 2 bis 4 s.
  Weniger Katalogindizes reichen nicht (auch ohne Index über 1 s); Hebel sind
  weniger Stores je Aktion und Katalogzeilen nur bei geänderten Feldern schreiben.

### Anki-Austausch

- Stapel-Export als `.apkg`. Dabei `marked`, `leech` und Flaggen
  zurückschreiben, `importedTags` und Anki-Rohtexte nutzen.
- Aus `.colpkg` zusätzlich Flaggennamen und Einklappzustand der Tags
  übernehmen; der Import selbst steht.
- AnkiHub-Schutz-Tags (`AnkiHub_Protect::Feld`) als Feldschutz beim Reimport
  auswerten.
- `furigana`/`kana`/`kanji` erst bei der Darstellung anwenden statt beim
  Import in den Inhalt zu schreiben; heute geht die Lesehilfe im Inhalt auf.
- Eine Vorderseite nur aus `{{type:Feld}}` ergibt heute keine Karte; Anki
  fragt dann nur nach der Eingabe.
- Inhaltsform importierter Inhalte wechseln, als Umwandlung in einen eigenen
  Inhalt.
- Feldeigenschaften aus Notiztypen: Schreibrichtung rechts nach links,
  Schriftart, Ausschluss von der Suche.

### Plattform

- Native App nach ADR-036.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.
- Community-Modus planen; Lernmengen und Lerndaten anderer bleiben unsichtbar
  (Agenda 6.2, 6.4).

### Oberfläche

- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
