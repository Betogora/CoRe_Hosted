# CoRe TODO

Stand: 2026-11-13

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. P1 läuft,
P2 folgt; P5 wartet, bis alle KI-Prompts stehen. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. „Später“ ist geparkt.

## P1: KI-Varianten (Proof of Concept) abschließen

Bewusst einfacher Probelauf (ADR-011); Auswahl und Oberfläche werden danach
geglättet.

Pakete, je ein PR, in dieser Reihenfolge. Alle Kartenarten bleiben auf
der Route `/api/ai/card-variant` (ADR-011): Die Anfrage nennt ihre Kartenart,
jede Kartenart hat eigenen Prompt, eigenes Werkzeugschema und eigene Prüfung.
Varianten bleiben in `card_variants` (`front`, `back`, `meta`); keine
Migration. Bildverdeckungen bleiben ohne Varianten. Zum Ausprobieren je
Kartenart drei Karten in `fixtures/apkg/ai-variant-card-kinds.apkg`
(`scripts/create_ai_variant_demo_apkg.py`). Reihenfolge nach erwartetem
Nutzen: Lückentext trägt die großen Medizin- und Fachstapel, Eintippen das
Vokabellernen, Single Choice das Altfragen-Format des IMPP und die Karten
aus P2; Multiple Choice und Kprim kommen nur über ein Add-on.

- [ ] **B – Lückentext:** Eine Variante gehört zu ihrer Lückengruppe:
      `front` ist der umformulierte Text mit genau dieser Lückengruppe,
      andere Lücken stehen als Klartext; `back` hält den Lückeninhalt. Die
      Route weist Varianten ab, deren Lückeninhalt nicht wortgleich ist,
      die weitere Lücken enthalten oder die Lösung im Text verraten.
      Review, Editor-Reiter `Varianten` und Stapellauf zeigen und
      bearbeiten Lückentext-Varianten. Nachweis: Vertrags- und
      Routentests, Lückentext-Karten des Demo-Stapels und eine Stichprobe
      aus Ankizin und AnKing mit verschachtelten Lücken, Hinweisen und
      Formeln, Eval-Fallsatz `card-variant-cloze`.
- [ ] **C – Auswahl (Single, Multiple Choice, Kprim):** `front` ist der
      umformulierte Fragestamm, die Optionstexte stehen je Options-ID in
      `meta`. Richtig/Falsch kehrt eine Variante nie um (keine verneinten
      Fragen, keine umgedrehten Kprim-Aussagen); dieselben Options-IDs,
      dieselbe Anzahl und dieselbe Richtigkeit sind Pflicht. Die Variante
      zeigt die Optionen in einer eigenen, festen Reihenfolge, damit keine
      Position auswendig gelernt wird. Editor und Duplikatprüfung schließen
      die Optionstexte ein. Nachweis: Vertrags- und Routentests, Auswahl-
      Karten des Demo-Stapels, Eval-Fallsätze je Modus.
- [ ] **D – Einstiege und Abnahme:** Zähler der Karten ohne Variante in den
      Stapeleinstellungen (danach eine einzige Aktion, deren Beschriftung
      zwischen „generieren“ und „neu generieren“ wechselt); nach
      Fehlschlägen führt `Anzeigen` in der Leiste zum Filter
      `-has:variant`; Stoppgründe in der Leiste kurz halten (z. B. „Keine
      Verbindung“). Visuelle Pflichtmatrix für Fortschrittsleiste,
      Einschalt-Dialog, Variantenbereich der Stapeleinstellungen, Filter
      `-has:variant` und die Varianten jeder Kartenart im Review; E2E-Test
      der Stapelgenerierung über den Demo-Stapel (Route je Aufruf mit
      anderer Variante gemockt). Specs
      [Kartenvarianten erzeugen](specs.md#kartenvarianten-erzeugen),
      `status.md` und `architecture.md` nachziehen.

## P2: Karten aus einer Quelle per KI erstellen

Formular und Auftragsprüfung unter `/neue-karten?method=ai-source` stehen
(`src/aiSourceCreation.ts`, `AiSourceCreationPanel.tsx`); „Karten erstellen“
ist deaktiviert, nichts wird gelesen oder übertragen. Offen ist alles, was die
Oberfläche danach verspricht. Setzt P1 voraus. Erste Ausbaustufe: PDF, Text,
Markdown, CSV und TSV.

- [ ] **KI-Kontingent pro Nutzer:** Alle Nutzer teilen das Ausgabenlimit des
      OpenRouter-Schlüssels; ein Tageslimit je Account (atomare Zählung in
      Supabase) verhindert, dass ein Nutzer es allein aufbraucht. Auch
      Voraussetzung für das erste externe Release.
- [ ] **Entscheidungen vor dem Code (Ergänzung zu ADR-011):** ADR-011 erlaubt
      genau drei KI-Routen und verlangt für ein Kontingent je Nutzer eine
      Ergänzung; eine gemeinsame Ergänzung regelt beides und gibt die vierte
      Route frei (etwa `POST /api/ai/source-cards`, gleiches Modell, ZDR,
      Kostenlog). Festlegen: ob der Browser nur extrahierten Text oder die Datei
      überträgt (ADR-011 schließt Bildübertragung aus, Scans und Diagramme
      bleiben damit außen vor); Obergrenzen je Auftrag (Zeichen, Seiten,
      Karten) und wie große Quellen ohne Serverqueue in Portionen im
      geöffneten Tab laufen; Hinweis, dass die Quelle an den Anbieter geht.
- [ ] **Quelle auslesen:** `documentModel.ts` liest PDF, Text, Markdown, CSV
      und TSV bereits; DOCX und PPTX kommen aus der Dateiauswahl des
      Formulars und aus den Specs heraus (Lesen steht unter „Später“). Jede
      Textstelle trägt einen echten Beleg (Seite oder Abschnitt), weil der
      Prompt einen Quellenverweis je Karte verlangt. Leere, geschützte, nur
      gescannte oder zu große Dokumente werden mit Meldung abgelehnt, nichts
      wird still abgeschnitten.
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
      Bearbeiten und Vorschau nutzen den Reiter `Inhalt` des Karteneditors
      (ADR-045), kein zweiter Editor; gespeichert wird erst nach Bestätigung
      und nur über `coreModel.ts` (Frage–Antwort, Lückentext, Single und
      Multiple Choice gibt es dort schon). Feldzuordnung festlegen: kurze
      Antwort, quellenbasierte Erklärung in `extra`, Quellenverweis in
      `source`; die externe Ergänzung braucht eine sichtbar getrennte
      Kennzeichnung „Ergänzende Erklärung – außerhalb der Quelle“ (eigene
      Feldrolle oder benanntes Feld). Neuer Zielstapel entsteht erst bei der
      Übernahme. Der Entwurfsschutz gilt auch für ungespeicherte Ergebnisse.
- [ ] **Freigabe:** „Karten erstellen“ und den Hinweis „noch nicht verfügbar“
      erst danach umstellen; ohne Verbindung bleibt die Aktion mit Meldung
      gesperrt. Specs [Automatisch aus einer Quelle](specs.md#automatisch-aus-einer-quelle), `status.md` und `architecture.md` nachziehen.
      Nachweis: Routen- und Vertragstests, E2E mit gemockter Route (Erfolg,
      Hinweise, Abbruch, Fehler, nichts gespeichert vor Übernahme), echte
      Quellen je Format mit allen vier Kartenformen, visuelle Pflichtmatrix
      für Fortschritt und Ergebnisliste.

## P5: KI-Eval und Hillclimb

Zurückgestellt, bis alle geplanten KI-Prompts stehen. Als Bauvorleistung
steht der Runner für Varianten Frage/Antwort und `card-help`; Ablauf, Ablage
und Stand stehen unter [KI-Eval](ai-eval.md). Gemessen ist noch nichts: kein
echter Lauf, keine Kalibrierung, kein Ledger-Eintrag.
Varianten je Kartenart (P1), Karten aus einer Quelle (P2) und gegebenenfalls
Quiz bekommen eine eigene Definition im selben Schema, sobald ihre Prompts
stehen; für die Zusammenfassung fehlt ein Eval-Entwurf. Grundsätze im
vorgeschlagenen
[ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis);
Fallzahlen und Zielwerte sind ein Entwurf vom 2026-11-10 und dürfen neu
bewertet werden.

- [ ] **Eval-Schlüssel und Kostenziele:** `OPENROUTER_EVAL_API_KEY` mit
      eigenem Limit in `.env.local` anlegen. Kosten sind in jedem Lauf eine
      feste Metrik (pro Antwort und hochgerechnet); die Zielwerte je
      Anfragetyp werden mit der ersten Baseline festgelegt und in
      `operations.md` übernommen.
- [ ] **Fallsätze ausbauen:** Je Anfragetyp stehen 24 Prüfkarten, zwei je
      Kategorie. Ziel etwa 120 Fälle je Anfragetyp aus weiteren Prüfkarten
      und Korpusfällen (`cases --corpus`), `card-help` je Karte in allen drei
      Modi. „Freitext ohne echte Frage“ deckt Dank, Bestätigung, eigenen
      Antwortversuch, Bitte wie „einfacher“, Unverständnis, Unsinn und Text
      ohne Kartenbezug ab.
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

Dazu das KI-Kontingent pro Nutzer aus P2.

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
- Nicht umformulierbare Karten als eigener Zustand im Reiter `Varianten`;
  gemeldete Karten fallen aus späteren Stapelläufen.
- DOCX und PPTX als Quellen für P2 (ZIP und XML, ohne neue Abhängigkeit über
  `zipReader.ts` prüfen; Beleg je Folie oder Abschnitt).

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
