# CoRe TODO

Stand: 2026-11-24

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. „Später“ ist geparkt.

## P5: KI-Eval und Hillclimb

Alle vier KI-Routen stehen (`card-variant-v5`, `card-help-v2`,
`source-cards-v2`, `learning-summary-v4`); P5 läuft. Die Baseline aller
sechs Anfragetypen steht auf den ausgewogenen Fallsätzen im Ledger und auf
der Seite [KI-Eval](ai-eval.md): Varianten und `card-help` mit 96 bis 120
Prüfkarten über sieben Fächer mit Referenzaussagen und höchstens 20 % aus
dem eigenen Fundus, Karten aus einer Quelle mit 24 Dokumenten (vier über
60.000 Zeichen) und die Zusammenfassung mit 24 Materialsätzen in neun
paarweise deckenden Profilen. Der Runner misst Kandidaten als Datei,
lässt in Blöcken mit Urteilscache richten und entscheidet Runden selbst.
Befunde, Versuchsaufbau und Arbeitspakete im Einzelnen stehen im
[Versuchsplan](ai-eval-plan.md).

Festgelegt am 2026-11-23: Erzeugt wird nur über OpenRouter mit dem lokalen
Schlüssel und seinem Limit, nie über ein Modell aus einer Subscription.
Richter ist Opus 5.5 als Subagent in Claude Code, je Block ein frischer
Kontext. Eine Handkalibrierung gibt es vorerst nicht; jeder Bericht zeigt je
Kriterium die zwei bis drei am wenigsten eindeutigen Urteile. Der Hillclimb läuft
innerhalb eines Modells, der Referenz `openai/gpt-6-luna` mit `low`; ein
Modellvergleich folgt später von Hand und wird nicht eigens gebaut. Ein
Modellwechsel und das KI-Kontingent sind nicht Teil von P5.

Pakete in dieser Reihenfolge.

- [ ] **Inhaltsfilter in den Routen:** Bricht der Anbieter mit
      `finish_reason: content_filter` ab (im Probelauf vom 2026-11-23 bei
      Karten mit eingeschleuster Anweisung, [Verlauf](history.md)), melden die
      Routen heute „Werkzeug nicht korrekt verwendet“. Eigener Fehlercode und
      eine verständliche Meldung; im Eval bleibt es eine verworfene Antwort.
- [ ] **I – Hillclimb, erste Welle** auf Reasoning `low` (KI hilft erledigt,
      `card-help-v2`): KI hilft, Varianten,
      Karten aus einer Quelle, Zusammenfassung. Je Runde drei bis fünf
      Kandidaten aus den Trainingsfehlern, Vorauswahl am Trainingsteil,
      Entscheidung am Entscheidungsteil; mindestens drei Runden, Ende nach
      drei Runden ohne Übernahme oder nach acht Runden. Am Ende KI hilft
      einmal mit `medium` und dem besten Prompt. Bei Karten aus einer Quelle zusätzlich: Kartenmenge
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
