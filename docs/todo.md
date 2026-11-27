# CoRe TODO

Stand: 2026-11-26

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. Der P5-Nachschlag ist der Rest des KI-Hillclimbs.
„Später“ ist geparkt.

## P6: Performance und Testlaufzeit

Analyse vom 2026-11-26 auf Commit `1f304798`; läuft unabhängig von P5.
Zeilenangaben gelten für diesen Stand. Gemessen sind Bundle,
Production-Header und CI-Zeiten. Alles zu Start, Sync und Rendering stammt
aus Code-Lektüre: Der Mechanismus ist belegt, die Zeitersparnis geschätzt.
Solche Pakete beginnen deshalb mit ihrer Messung (Schritt 0).

| Kennzahl | Stand | Ziel |
| --- | --- | --- |
| `affected-e2e` mit voller Suite | 12 bis 14 min (Testschritt 800 s); seit T1 ohne 266 s Katalog, seit T3 drei Shards mit je rund 140 s Tests statt 432 s, in CI noch ungemessen | höchstens 5 min |
| `catalog-e2e` | 4,5 bis 6,5 min mit 2 Workern; seit T1 lokal auf 4 CPUs 176 statt 364 s, in CI noch ungemessen | höchstens 4 min |
| Roundtrips nacheinander je Bewertung | 5; seit A4 3 (ohne `getUser`, Profil parallel zum Delta) | 2 |

Für alle Pakete gilt:

- Alle Pakete entstehen auf einem gemeinsamen Branch, je Paket ein Commit,
  dessen Nachricht die Kennzahl vorher und nachher nennt; gemergt wird
  gemeinsam über einen Pull Request.
- Der Branch berührt Service Worker und Chunking, später auch Bootstrap
  und Sync: vor dem gemeinsamen Merge
  `gh workflow run weekly-performance.yml --ref <branch>`.
- **Hill-Climbing** (H4): je Schritt genau eine Änderung, Kennzahl
  vorher und nachher messen, nur übernehmen, wenn sie sinkt und alle Gates
  grün bleiben. Ende beim Ziel oder nach drei Schritten in Folge ohne
  nennenswerten Gewinn (unter 1 KiB, unter 2 % oder Zähler unverändert).
- Unverändert lassen: `quality` (rund 50 s, Engpass Typecheck samt knip),
  Modultests (179 Dateien in 12 s) und RLS (21 Fälle in 6 s).

Reihenfolge: A4, danach A7 und T5 nach Bedarf.

| Spur | Kennzahl | Schleife | Paket |
| --- | --- | --- | --- |
| H4 | Requests je Bewertung und je Leerlauf-Sync | Zähler gegen `tests/support/fakeLearningCloud.ts` | A4 |

### App

- [ ] **A4 – Roundtrips in Start, Sync und Lernstart (H4):**
  - Konfliktabfrage (`src/cloudConflicts.ts`, über `selectKeysetRows`)
    lädt weiter `select *` samt Wert-Snapshots; schmale Spalten, wo die
    Werte nicht gebraucht werden.
  - Schritt 0 fehlt weiter: Messpunkte für Lernstart (`studyStartP75Ms`),
    Review-Persistenz und Delta-Sync in `tests/performance/startup.spec.ts`.
  - Folgekette nach dem Boot: den Konfliktabruf des ersten Syncs bei
    `conflictCount` 0 und leerer Outbox überspringen (braucht eine Option
    in `syncNow`); `list_releasable_media` höchstens täglich (braucht
    einen gespeicherten Zeitpunkt je Konto).
  - Anmeldung: Profil-Upsert parallel zum Boot; das Profil muss vor dem
    ersten Profilpatch existieren.
  - Nachweis: `weekly-performance` auf dem Branch.
- [ ] **A7 – Große Datenmengen und Editoren:** je Punkt ein eigener
      Commit, jeder mit eigener Messung zuerst.
  - Upload nach großen Importen (ergänzt „Erste Synchronisation großer
    Konten“, die den Download betrifft): Der Start lädt die ganze Outbox
    per `getAll()`, der Flush sendet einen Batch mit `select *` zur
    Existenzprüfung, Inserts nacheinander mit `.select("*")` und
    bestätigt lokal erst am Ende (`src/indexedDbOutbox.ts:34,110`,
    `src/indexedDbImportCommit.ts:101-108,253-255,294-297`,
    `src/syncEngine.ts:505-528`, `src/cloudRevisionedWrites.ts:298-306,416`).
    In Scheiben senden und je Scheibe bestätigen, Existenz nur über
    `id, revision`, Inserts mit `CLOUD_WRITE_CONCURRENCY`. Löschreihenfolge
    und „Insert bleibt Insert“ gelten weiter.
  - Bestätigungen lesen je Zeile einzeln
    (`src/indexedDbCoreRepository.ts:748-791`); bündeln wie in
    `writeNoteGraphs`.
  - Cloud-Medien: `resolveMedia` (`src/mediaStore.ts:119-128,256-286`)
    lädt fehlende Dateien je Sitzung neu und öffnet die Datenbank je
    Datei. Geladene Blobs ungepinnt speichern (`evictUnpinnedMedia` räumt
    sie ab), eine Transaktion je Kartenmenge.
  - Mindmap: Jede Zeigerbewegung rendert die ganze Fläche, der Stift
    kopiert je Bewegung alle Punkte
    (`src/screens/DeckMindMapsPanel.tsx:64,132,266-274,378,427-440`).
    Viewport während der Geste per Ref setzen, Bühne memoisieren.
    Autospeichern, Undo und Gestenabbruch bleiben.
  - Kartenliste: `rowOffsets` läuft bei abweichender Zeilenhöhe über alle
    Treffer (`src/screens/cardList/virtualRows.ts:4-8,58-62,93-109`); erste
    gemessene Höhe als Schätzwert nehmen.
  - Rich-Text-Editor: drei bis vier xss-Pässe und ein synchrones
    `sessionStorage`-Schreiben je Taste (`src/ui/RichTextEditor.tsx:46-64,179,348-357`,
    `src/manualCreationDraft.ts:79-90`). Pässe auf bereits bereinigtem
    Text sparen, Entwurf entprellen und bei `pagehide` spülen.
  - Stapelauswahl baut alle Optionen auch geschlossen
    (`src/ui/selectUi.tsx:371-378,447-470`); erst bei `open` erzeugen.

### Tests

- [ ] **T5 – Erst messen, dann entscheiden:**
  - Production-Build mit `vite preview` statt Dev-Server für die
    Supabase-Suite (rund 240 Kaltstarts laden 312 ungebündelte Module;
    möglich 60 bis 100 s). Im Build registriert sich der Service Worker;
    `auth-resilience` und das Beta-Artefakt bräuchten eigene Builds.
  - `docs/ui-elements.html` (5,1 MB) läuft bei jedem der 131 Seitenaufrufe
    durch `transformIndexHtml` und PostCSS. Erst mit `curl -w
    "%{time_total}"` auf `?preview=screens` messen.
  - `gate:push` läuft je Pull Request viermal (CI am PR, Vercel-Preview,
    CI auf `main`, Vercel-Production). Der Lauf auf `main` wäre
    verzichtbar, wenn der Branch-Schutz aktuelle Branches verlangt; nicht
    geprüft.

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
- [ ] **Quiz auf `source-cards-v3` klären:** Ein Quiz schickt eine
      Stichprobe in einer Anfrage, die v3 auf 6.000 Zeichen begrenzt. Ein
      PDF-Quiz fragt so nur etwa ein bis zwei zufällige Seiten ab. Zu klären:
      Fragen auf mehrere Abschnitte verteilen oder den Gliederungsaufruf oben
      mitnutzen. Ungemessen ist auch, ob luna mit der Kartenspanne von v3 und
      Kartenmenge Mehr weiter genau die gewählte Fragenzahl liefert (gemessen
      nur auf v2). Nachweis: PDF über 20.000 Zeichen mit Fragen aus Anfang,
      Mitte und Ende; Fragenzahl bei 5, 10 und 20 eingehalten.
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
- Quizplanung im Prüfungsplaner (ADR-042); Entwurf in Commit `71a7892`
  (`codex/klausurplaner-design`).
- Quiz-Feinschliff: Die Erstellung läuft weiter, wenn man Reiter oder Ansicht
  verlässt (heute bricht sie ab); Ablauf und Auswertung füllen wie die übrigen
  Stapelreiter die Breite, auf dem Telefon bleibt es kompakt.
- Name des Schalters „CoRe-Modus“ nach dem Variantenkonzept; Vorschlag
  „Umformulierungen“ (Agenda 1.7).
- Simulator für das ganze Konto entfernen; stattdessen eine selbst klickbare
  Simulationskette je Karte für alle, Vorbild Flashka recherchieren (6.1).
- Tageszahlen der Lernsitzung nach einem mitten in der Sitzung geänderten
  Tageslimit neu aus den lokalen Stapelzählungen laden (heute Stand beim Start).
- Semantische Themenzuordnung in ungegliederten Stapeln, ohne Lernstände zu
  ändern; ein Lösungsweg über Tags ist `Treffer lernen` der Kartenverwaltung.
- Kopf der Lernsitzung fertigstellen: Anki-Kopf recherchieren, „Letzte
  Bewertung zurücknehmen“ (heute Strg+Z) als Knopf im Kopf, Telefon und Desktop.

### Kartenverwaltung

- Rest der Revisionskaskade, ungemessen: Verdrahtungen wählen `snapshot.state` statt `state?.decks`, je Stapelzeile ein
  `ResizeObserver` ohne `content-visibility`, Import- und Variantenfortschritt als State in `AppContent`.
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
