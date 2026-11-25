# CoRe TODO

Stand: 2026-11-24

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. „Später“ ist geparkt.

## P5: KI-Eval und Hillclimb

Alle vier KI-Routen stehen (`card-variant-v5`, `card-help-v2`,
`source-cards-v2`, `learning-summary-v6`); P5 läuft. Bestand, Verlauf, Bilanz,
Zielwerte und Grenzen des Experiments stehen auf der Seite
[KI-Eval](ai-eval.md), die Fallsätze im Ledger.

Festgelegt am 2026-11-23: Erzeugt wird nur über OpenRouter mit dem lokalen
Schlüssel und seinem Limit, nie über ein Modell aus einer Subscription.
Richter ist Opus 5.5 als Subagent in Claude Code, je Block ein frischer
Kontext; eine Handkalibrierung gibt es vorerst nicht. Seit 2026-11-25 werden
Reasoning-Stufe und Modell wie Prompts als Kandidaten gegen denselben Bestand
gemessen. Das KI-Kontingent ist nicht Teil von P5.

Pakete in dieser Reihenfolge.

- [ ] **Inhaltsfilter in den Routen:** Bricht der Anbieter mit
      `finish_reason: content_filter` ab (im Probelauf vom 2026-11-23 bei
      Karten mit eingeschleuster Anweisung, [Verlauf](history.md)), melden die
      Routen heute „Werkzeug nicht korrekt verwendet“. Eigener Fehlercode und
      eine verständliche Meldung; im Eval bleibt es eine verworfene Antwort.
- [ ] **Modell- und Reasoning-Vergleich:** Luna `medium` für alle
      Anfragetypen gegen den Bestand (Zusammenfassung übernommen,
      `learning-summary-v6`), danach DeepSeek V4.1 Flash 1017 ohne Reasoning
      bei Varianten und KI hilft und Claude Haiku 5.5 `medium` bei Karten aus
      einer Quelle. Haiku geht mit ZDR nur mit `tool_choice: auto` und schreibt
      Listen manchmal als JSON-Text; das zählt heute als verworfene Antwort.
      Gewinnt ein Wechsel, bekommt die Route Modell und Reasoning im eigenen
      Code und eine neue Baseline mit Rückhalt. Nachweis: je Konfiguration ein
      Ledger-Eintrag.
- [ ] **Entscheidungsregel umbauen:** feste Basis je Welle; Kandidaten mit
      sichtbar behobenem Fehlerbild und etwa 70 % Wahrscheinlichkeit „besser“
      kommen in einen Sammelkorb, kritische Kriterien dürfen im eigenen
      Rauschen schwanken, die Kombination bestätigt eine Messung mit vier
      Wiederholungen. Ein Faktorversuch nur bei höchstens drei Änderungen mit
      Wechselwirkungsverdacht. Braucht eine Ergänzung von ADR-049. Nachweis:
      Runner-Tests und eine Welle nach der neuen Regel.
- [ ] **I – Hillclimb, erste Welle** auf Reasoning `low` (KI hilft erledigt,
      `card-help-v2`): Varianten,
      Karten aus einer Quelle, Zusammenfassung. Je Runde drei bis fünf
      Kandidaten aus den Trainingsfehlern, Vorauswahl am Trainingsteil,
      Entscheidung am Entscheidungsteil; mindestens drei Runden, Ende nach
      drei Runden ohne Übernahme oder nach acht Runden. Bei Karten aus einer Quelle zusätzlich: Kartenmenge
      wirksam machen (Weniger höchstens 60 %, Mehr mindestens 140 % der
      Vorschläge von Normal, ohne Füllkarten und bei gleicher Belegtreue;
      danach die Dichten in `AI_SOURCE_AMOUNTS` neu messen), Single Choice
      wird nie gewählt, Tabellenzeilen ergeben Doppelfragen, und die
      Zerlegung der Quelle vergleichen: Abschnitte wie heute, die ganze Quelle
      als Kontext mit Karten nur für den markierten Abschnitt, oder erst eine
      Gliederung mit Kernaussagen und Kartenbudget je Abschnitt; die beiden
      neuen Wege brauchen eine Ergänzung von ADR-011. Nachweis: je
      Anfragetyp ein Pull Request mit Promptversion und Ledger-Einträgen.

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
- Specs („nie im Hintergrund“) und ADR-011 (vorausschauende Variante)
  abgleichen; das Antwortschema der Zusammenfassung lässt `non_zdr` zu, das
  keine Route mehr liefert.
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
