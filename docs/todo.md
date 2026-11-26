# CoRe TODO

Stand: 2026-11-26

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. Der P5-Nachschlag ist der Rest des KI-Hillclimbs.
„Später“ ist geparkt.

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
      OpenRouter-Schlüssels; ein Limit je Account (atomare Zählung in
      Supabase) verhindert, dass ein Nutzer es allein aufbraucht. Vorschlag:
      ein Budget in Kosten statt in Anfragen, etwa je Monat. KI hilft,
      Varianten und Zusammenfassung lesen die Kosten je Anfrage schon
      (`costUsd`), Karten aus einer Quelle noch nicht. Dringender seit
      Reasoning `medium` und der schrittweisen Neuerzeugung der Varianten
      (`card-variant-v6`); Richtwert: eine Variante für jede von 50.000 Karten
      kostet rund 7–8 $. Braucht eine Ergänzung zu ADR-011; Bezahlstufen
      bleiben unter „Später“.
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

## P5-Nachschlag: KI-Hillclimb

P5 ist am 2026-11-25 abgeschlossen; Stand je Route und Verlauf auf der Seite
[KI-Eval](ai-eval.md), Regel in ADR-049. Unter Ziel liegen am Rückhalt
Frage/Antwort (85,4 %, Ziel 95 %) und Karten aus einer Quelle (86,8 %, Ziel
90 %).

- [ ] **Lange Quellen über die ganze Länge:** Ein Auftrag ergibt höchstens
      100 Karten, die Abschnitte (bis 6.000 Zeichen) laufen der Reihe nach.
      Bei Normal (3,5–5 Karten je 1.000 Zeichen) ist nach etwa 20.000 Zeichen
      (≈ 7 Seiten) Schluss, der Rest wird nicht abgefragt. Vorschlag: ein
      günstiger Gliederungsaufruf vorab, der die 100 Karten auf alle
      Abschnitte verteilt; Alternative ist die ganze Quelle als Kontext.
      Braucht eine Ergänzung von ADR-011 und eine eigene Hillclimb-Welle.
      Nachweis: letzte belegte Stelle bei Quellen über 20.000 Zeichen nahe am
      Ende, Hauptwert nicht schlechter. In derselben Welle: mehr Single Choice
      (bei allen Formen 4 % statt jeder achten Karte) und keine Doppelfragen
      aus Tabellenzeilen.
- [ ] **Frage/Antwort unter Ziel:** Zuerst 20–30 Handurteile je Anfragetyp
      gegen den Richter, um zu klären, ob er zu streng ist. Erst danach ein
      Prüfaufruf für Varianten oder der Modellvergleich gegen
      `openai/gpt-6-luna` (DeepSeek V4.1 Flash ohne Reasoning, Claude Haiku
      5.5 `medium`).
- [ ] **Kleinkram, zusammen mit dem KI-Kontingent:** Specs („nie im
      Hintergrund“) und ADR-011 (vorausschauende Variante) abgleichen;
      `non_zdr` aus dem Antwortschema der Zusammenfassung streichen, weil
      keine Route es mehr liefert.

## Später

### KI

- DOCX und PPTX als Quellen für Karten aus einer Quelle (ZIP und XML, ohne neue Abhängigkeit über
  `zipReader.ts` prüfen; Beleg je Folie oder Abschnitt).
- Bilder als Quelle für Karten aus einer Quelle (teurer, eigener Hillclimb); braucht eine Ergänzung
  von ADR-011 (Agenda 3.3, 3.5).
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
