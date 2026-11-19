# CoRe TODO

Stand: 2026-11-13

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. P2 ist als
Nächstes dran; P5 wartet, bis alle KI-Prompts stehen. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. „Später“ ist geparkt.

## P2: Karten aus einer Quelle per KI erstellen

Gebaut und unter `/neue-karten?method=ai-source` freigeschaltet: Auftrag,
Route und Vertrag (`POST /api/ai/source-cards`, ADR-011), Auslesen und
Abschnittslauf, Vorschlagsliste mit Bearbeiten, Verwerfen und Übernahme
(`aiSourceCards.ts`). Bewusst nicht: Ergänzungen außerhalb der Quelle, DOCX
und PPTX, Scans und Bilder, Kprim und Eintippen, Neu-Generieren einzelner
Vorschläge, Abgleich mit vorhandenen Karten des Zielstapels, Speichern von
Quelle oder Vorschlägen, Serverqueue, automatische Varianten.

- [ ] **Nachweis vor dem Release:** Stichprobe gegen die Preview mit den
      Prüfdokumenten in `fixtures/ai-source/` (jedes Format, alle vier
      Kartenformen): Belege, Formen, Dopplungen, Kosten und Laufzeit; die
      inhaltsfreie Auswertung steht im PR und in `history.md`. Optimierung,
      Eval und Hillclimb folgen in P5.

## P5: KI-Eval und Hillclimb

Zurückgestellt, bis alle geplanten KI-Prompts stehen. Als Bauvorleistung
steht der Runner mit Definitionen für Varianten (Frage/Antwort, Lückentext,
Auswahl) und `card-help`; Ablauf, Ablage und Stand stehen unter
[KI-Eval](ai-eval.md). Gemessen ist noch nichts: kein echter Lauf, keine
Kalibrierung, kein Ledger-Eintrag. Karten aus einer Quelle (P2) und
gegebenenfalls Quiz bekommen eine eigene Definition im selben Schema, sobald
ihre Prompts stehen; für die Zusammenfassung fehlt ein Eval-Entwurf. Grundsätze im
vorgeschlagenen
[ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis);
Fallzahlen und Zielwerte sind ein Entwurf vom 2026-11-10 und dürfen neu
bewertet werden.

- [ ] **Eval-Schlüssel und Kostenziele:** `OPENROUTER_EVAL_API_KEY` mit
      eigenem Limit als Benutzer-Umgebungsvariable anlegen
      ([operations.md](operations.md#openrouter-schlüssel)). Kosten sind in jedem Lauf eine
      feste Metrik (pro Antwort und hochgerechnet); die Zielwerte je
      Anfragetyp werden mit der ersten Baseline festgelegt und in
      `operations.md` übernommen.
- [ ] **Fallsätze ausbauen:** Je Anfragetyp stehen 24 Prüfkarten, zwei je
      Kategorie. Ziel etwa 120 Fälle je Anfragetyp aus weiteren Prüfkarten
      und Korpusfällen (`cases --corpus`), `card-help` je Karte in allen drei
      Modi. „Freitext ohne echte Frage“ deckt Dank, Bestätigung, eigenen
      Antwortversuch, Bitte wie „einfacher“, Unverständnis, Unsinn und Text
      ohne Kartenbezug ab. Lückentext braucht Fälle, deren Lücke fast den
      ganzen Text trägt: Dort umschreibt das Modell die Lösung außerhalb der
      Lücke, was die Routenprüfung nicht erkennt (M2).
- [ ] **Kalibrieren und Baselines:** Je Anfragetyp ein Bewertungsbogen (je
      Kriterium bestanden oder nicht, mit je einem Beispiel) und etwa 40
      Einträge, nach Kategorie geschichtet und mit gezielt eingebauten
      Fehlern je kritischem Kriterium, weil echte Antworten zu selten
      durchfallen. Handurteil blind im selben Tabellenmodus wie der Richter.
      Maße: Übereinstimmung und Cohens Kappa je Kriterium, dazu die Fälle, die
      der Richter bei einem kritischen Kriterium fälschlich bestehen lässt
      (Ziel ≥ 90 % Übereinstimmung bei den kritischen Kriterien, kein falsch
      bestandener gesäter Fehler). Abweichungen durchsehen, Bogen oder
      Richterauftrag schärfen und an frischen Einträgen bestätigen; derselbe
      Richter zweimal über dieselbe Tabelle misst sein eigenes Rauschen. Aus
      den Einträgen entstehen die etwa zehn Kontrolleinträge jeder
      Richtertabelle. Richtermodell, Auftrag und Bogen sind danach
      eingefroren; jede Änderung daran kalibriert neu. Danach Baseline je
      Anfragetyp, erst dann Runden: je Runde eine Änderung aus
      Trainingsfehlern, gemessen am Testteil. Nachweis: Kalibrierung und
      Baseline je Anfragetyp im Ledger.
- [ ] **Zielwerte (Entwurf):** Varianten: Hauptwert ≥ 95 %, M2-Verletzungen
      ≤ 1 % und keine bei Richtung, Kosten höchstens 1,2-fach, Latenz p90
      ≤ 4 s. `card-help`: Hauptwert ≥ 90 %, H2 ≥ 98 %, H6 = 100 %; Streaming
      erst, wenn die Latenz im Median über 4 s liegt.
- [ ] **Neu zu bewerten:** Richter über Subscription oder über OpenRouter
      (API-Gegenwert etwa 1–1,50 USD je Runde im Tabellenmodus, Luna etwa
      0,02 USD je Runde); Fallzahl und Wiederholungen gegen das Rauschen
      (bei 60 Testfällen × 3 etwa ±7,5 Punkte); ob ein anderes Modell als
      Generator verglichen wird (Haiku 5.5 kostet auf OpenRouter dasselbe wie
      Luna).

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

## Pflege: Testsuite verschlanken

Läuft unabhängig von den Paketen, je Paket ein eigener PR. Regeln im
Pflegevertrag von [`test-portfolio.md`](test-portfolio.md#pflegevertrag);
Messung vom 2026-10-31 im [Verlauf](history.md).

- [ ] **D – Browserflows, Rest:** Etwa 80 Flows setzen das Cloud-Konto
      zurück, auch reine Layoutprüfungen; `card-lifecycle` doppelt vor und
      nach jedem Test. Überschneidungen zusammenlegen (Speicherschutz der
      Einstellungen dreifach, Pomodoro, Heatmap-Geometrie, Bewertung),
      wirkungslose feste Wartezeiten entfernen und die übrigen Breitenschleifen
      der Supabase-Specs (`product-surfaces`, `core-stabilization`,
      `world-capitals-hierarchy`) über `matrixViewports()` und `matrixThemes`
      aus `tests/e2e/support/visualMatrix.ts` kürzen. Katalogkonfiguration,
      `--gate=affected` und die eingedampften Katalogflows sind erledigt
      (siehe [Verlauf](history.md)). Nachweis: Laufzeit von
      `npm run test:e2e:local` vorher und nachher, mit lokalem Supabase.

## Später

### KI

- Varianten vorausschauend nur für Karten erzeugen, die in den nächsten Tagen
  die Haltbarkeitsschwelle erreichen (Ausarbeitung in Commit `4dd2af7`).
- Nicht umformulierbare und dauerhaft scheiternde Karten als eigener Zustand
  im Reiter `Varianten`; sie fallen aus späteren Stapelläufen. Heute fragt
  jeder Lauf sie erneut an, und 50 solche Karten blockieren ihn ganz.
- DOCX und PPTX als Quellen für P2 (ZIP und XML, ohne neue Abhängigkeit über
  `zipReader.ts` prüfen; Beleg je Folie oder Abschnitt).
- KI-Kontingente je Nutzer im Zusammenspiel mit Bezahlstufen bzw.
  Abonnements (Umfang je Stufe, Credits, Abrechnung nach Kosten).

### Lernen und Planung

- Persönliche FSRS-Parameter je Stapelprofil, nur wenn sie den eigenen
  Verlauf messbar besser vorhersagen (ADR-044; Ausarbeitung in Commit
  `4dd2af7`).
- Quiz als eigenes Feature (ADR-042), danach Quizplanung im Prüfungsplaner;
  Entwurf in Commit `71a7892` (`codex/klausurplaner-design`).
- Semantische Themenzuordnung in ungegliederten Stapeln, ohne Lernstände zu
  ändern; ein Lösungsweg über Tags ist `Treffer lernen` der Kartenverwaltung.

### Kartenverwaltung

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
- Inhaltsform importierter Inhalte wechseln, als Umwandlung in einen eigenen
  Inhalt.
- Feldeigenschaften aus Notiztypen: Schreibrichtung rechts nach links,
  Schriftart, Ausschluss von der Suche.

### Plattform

- Native App nach ADR-036.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.

### Oberfläche

- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
