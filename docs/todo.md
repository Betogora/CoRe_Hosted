# CoRe TODO

Stand: 2026-11-11

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. Die Restposten sind klein und kommen gesammelt vorab
dran. P3 beginnt als Nächstes mit der Lernansicht; P1 und P4 laufen, P2 folgt; P5 wartet, bis alle KI-Prompts stehen. Offene Nachweise brauchen keinen Code und
laufen unabhängig davon; die Release-Voraussetzungen sind vor dem ersten
externen Release fällig. „Später“ ist geparkt.

## Restposten

Kleine Punkte aus abgeschlossenen Paketen, gemeinsam in einem PR.

- [ ] **Veraltete Überschrift nach Reload der Kartenverwaltung:** Die
      Verträge „typgerechter Basic-Lebenszyklus“ und „typgerechter
      Multiple-Choice-Lebenszyklus“ (`card-lifecycle`) sowie die
      Offline-Löschung in `batch-resilience` erwarten nach dem Reload die
      Überschrift `Lernen`; seit `Karten` ein eigener Reiter ist (`b19da09`),
      heißt sie `Kartenverwaltung`. Nachweis: alle drei Tests grün.
- [ ] **PDF-Vorschau im Browserflow:** Der Vertrag „manuell mit PDF bis
      Bearbeiten und Review“ (`core-stabilization`) erwartet im
      PDF-Betrachter „Seite 1 von 1“, sieht aber „PDF nicht verfügbar.“; so
      lokal seit dem main-Stand vom 2026-11-10. Ursache klären (Worker,
      Laden des PDF, Testaufbau) und beheben. Nachweis: der Test grün.
- [ ] **Navigationsmarkierung beim ersten Laden:** Bei einem direkten Aufruf
      etwa von `/lernen` sitzt die gleitende Hervorhebung der Top-Bar auf
      `Heute`, obwohl `Lernen` korrekt `aria-current` trägt
      (`useSlidingSelection` in `src/ui/AppNavigation.tsx`). Nachweis: Reload
      jeder Hauptansicht bei 1280 und 1440 px zeigt die Markierung am aktiven
      Ziel, dazu ein E2E-Fall.
- [ ] **Lokale KI-Routen dokumentieren:** Das Vite-Plugin `localAiRoutes` in
      `vite.config.ts` bedient `/api/ai/summary` und `/api/ai/card-variant`
      unter `npm run dev`; `operations.md` nennt dafür noch `vercel dev`.
      Festschreiben, welcher Weg gilt, und `operations.md` anpassen.
- [ ] **Google-Login entscheiden:** Gebaut, aber per Flag aus. Entscheiden,
      ob der OAuth-Prüfprozess und ein Datenschutztext kommen; sonst Code und
      Flag entfernen.

## P3: Lernansicht 2 und „KI hilft“

Gewählt am 2026-11-11 aus zwei Entwürfen: schwebende Leisten, neue
Bewertungsfarben und eine Lernhilfe zur aufgedeckten Karte (ADR-011). Die
Lernansicht geht sofort live; das KI-Fenster wird vorher fertig gebaut, kommt
aber erst zusammen mit der Route nach `main`, damit Lernende keine Funktion
ohne Wirkung sehen.

- [ ] **Lernansicht: Leisten und Farben (zuerst):** In `StudyMode` bleiben
      Kopf (Schließen, Stapelname, Lerneinstellungen, Simulationshinweis,
      Lernfortschritt, Pomodoro) und Aktionsleiste beim Scrollen stehen; die
      Karte läuft darunter durch, `scroll-padding` hält Fokus und Sprungziele
      frei. Kopf ab 768 px als schwebende, durchscheinende Insel mit Abstand
      zum Rand, darunter als randbündige Leiste über die volle Breite.
      Aktionsleiste immer als Insel; mobil übernimmt sie Position, Breite,
      Radius, Fläche und Schatten der mobilen Bottom-Bar
      (`core-mobile-bottom-navigation`), steht also beim Lernen an deren
      Stelle (die globale Navigation bleibt im Lernmodus ausgeblendet). Sie
      trägt vorn „Antwort anzeigen“, hinten die vier Bewertungen, mobil
      nebeneinander mit dem Intervall unter dem Namen. Namen bleiben Nochmal,
      Schwer, Gut, Leicht; Farben sanft (helle Füllung, farbiger Rand und
      farbige Schrift) in tiefem Orange, Gelb, hellem Gelbgrün und Blaugrün
      als Tokens `--core-rating-*` hell und dunkel, die `ratingButtons`
      nutzt; Kontrast ≥ 4,5 : 1. Nachweis: `StudyMode.test.tsx`, betroffene
      E2E-Specs, Katalog-Demo der Bewertungsknöpfe, visuelle Pflichtmatrix
      (kurze und lange Karte, Vorder- und Rückseite, Variante mit
      Originalkarte, Abschluss- und Ladezustände, hell und dunkel).
- [ ] **KI-Fenster als Oberfläche:** Nur bei aufgedeckter Antwort schwebt
      rechts über der Aktionsleiste der Knopf „KI hilft“ mit dem Gehirn. Er
      öffnet einen modalen Dialog mit dem globalen Backdrop
      (`--core-backdrop`, `useModalDialog`: Fokusfalle, Escape, Außenklick,
      Fokusrückgabe); ab 768 px rechts neben der Karte verankert, darunter als
      Bottom Sheet wie `StudySettingsOverlay`. Inhalt: Gehirn mit „Hi! Stell
      mir eine Frage zu dieser Karte.“, Schnellknöpfe „Erklären“ und
      „Beispiel“, Eingabe „Stelle eine Frage …“, Senden, Schließen. Lern-
      Tastenkürzel ruhen, solange er offen ist; Antworten werden höflich
      angesagt; die Tastatur verdeckt mobil die Eingabe nicht. Der Offen-
      Zustand gilt für die Sitzung, der Verlauf je Karte; Bewerten bricht
      eine laufende Anfrage ab. Nachweis: Komponententests, Katalog-Demo,
      visuelle Pflichtmatrix.
- [ ] **Route `/api/ai/card-help`:** Vertrag in `src/aiCardHelpContract.ts`
      (Karte als Frage, Antwort und Zusatz; Modus `explain`, `example` oder
      `question`; Frage; höchstens sechs vorherige Wechsel; Größengrenzen),
      Function mit den Helfern aus `server/aiRoute.ts`, einem erzwungenen Tool
      Call mit begrenzter Antwortlänge, Kostenlog, deutschen Fehlertexten und
      lokaler Vite-Middleware. Kartentext über `notePlainText`, Lückentext
      aufgelöst; Bildverdeckungen und reine Bildkarten werden mit Hinweis
      abgelehnt. Antworten sind Klartext mit Absätzen und einfachen
      Aufzählungen, im Fenster escaped dargestellt und nie gespeichert;
      zunächst ohne Streaming. Prompt `card-help-v1`: Karte und Frage sind
      nicht vertrauenswürdige Daten; Sprache der Frage, sonst der Karte;
      Erklären begründet Zusammenhänge statt die Rückseite zu wiederholen;
      Beispiel ist neu, konkret und korrekt; eine Frage wird genau beantwortet
      und beim Kartenthema gehalten; Widersprüche zu gesichertem Wissen werden
      knapp benannt; keine erfundenen Quellen; etwa 120 Wörter. Der Prompt
      ist ein knapper Startprompt und wird hier nicht iteriert; Eval und
      Hillclimb laufen gemeinsam für alle Prompts in P5. Nachweis: Vertrags-
      und Routentests (Grenzen, Injection, Fehlercodes), Stichprobe in allen
      drei Modi.
- [ ] **Anbindung und Freigabe:** Das Fenster ruft über `postAiRoute`, zeigt
      Laden, Abbruch beim Kartenwechsel und deutsche Fehler (Limit, offline,
      Anbieter), ohne automatischen Neuversuch; Fenster und Route kommen
      gemeinsam nach `main`. Specs (Lernansicht, Akzeptanzkriterien,
      Nichtziel „Externer KI-Chat“ in Abschnitt 23 auf Chat ohne Kartenbezug
      schärfen), `architecture.md`, `status.md` und `operations.md` (Kosten
      je Antwort) nachziehen. Externe Nutzer erst mit dem KI-Kontingent pro
      Nutzer (P2). Nachweis: E2E mit gemockter Route (Antwort, Fehler,
      Abbruch), visuelle Pflichtmatrix mit Antwort-, Lade- und Fehlerzustand.

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
- [ ] **Ausweg für nicht umformulierbare Inhalte:** Das erzwungene Werkzeug
      verlangt heute immer eine Variante; bei sinnlosen Inhalten (zufällige
      Buchstabenfolgen) oder Insidern ohne allgemeinen Kontext bleibt dem
      Modell nur eine Hülle („Was gehört zu …?“) oder eine erfundene Deutung.
      Eine Prompt-Ergänzung, über die das Modell eine Karte als nicht
      umformulierbar meldet; die Route gibt das als eigenen Fehlergrund
      zurück. Ein eigener Kartenzustand dafür steht unter „Später“.
      Nachweis: Stichprobe mit solchen Prüfkarten vor und nach der Ergänzung,
      Routentests mit solchen Karteninhalten.
- [ ] **Varianten weiterer Kartenarten:** Lückentext, Single/Multiple
      Choice, Kprim und Eintippen (heute verliert die Variante das
      Eintippfeld) bekommen je eigenen Prompt und Vertrag; Reihenfolge nach
      Häufigkeit im Korpus, Bildverdeckungen bleiben ohne Varianten.
      Nachweis: Kartenartenzählung aus `report:apkg-corpus`, Vertrags- und
      Routentests je Kartenart, Stichprobe mit Korpuskarten.

## P4: Kartenverwaltung 2.0

Der Reiter `Karten` wird zur vollwertigen Kartenverwaltung nach dem Vorbild von
Ankis Browser: Suche mit Filtermenü, flache Trefferliste, Massenaktionen und
Pflegewerkzeuge in einer Version, ohne vorgeplante Folgeversion. Die Tabelle
behält ihre Spalten `Sortierfeld`, `Datum` und `Variante`; weitere kommen
nicht hinzu. Grundlage sind Sichtprüfung und Messung vom 2026-11-04
(Konto mit 60 Stapeln, Stapel `Muskeltrainer` mit 581 Karten) und Ankis
Seitenleiste (`qt/aqt/browser/sidebar/tree.py`), Suchsyntax
(`rslib/src/search/`) und Tabellenmodell (`qt/aqt/browser/table/`), nur als
Referenz gelesen. Befund und Produktentscheidungen stehen in
[ADR-048](decisions.md#adr-048--kartensuche-lokal-über-den-vollständigen-katalog).

- [ ] **Release:** main mergen, `npm run gate:push`,
      `npm run performance:measure:local`, Pull Request. Beim Deploy zuerst
      die Migration `20261110130000_kartenverwaltung` (`supabase db push`,
      `verify_schema_v1.sql`), dann der Client.

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

## P5: KI-Eval und Hillclimb (zurückgestellt)

Beginnt erst, wenn alle geplanten KI-Prompts stehen: Varianten je Kartenart
(P1), `card-help` (P3), Karten aus einer Quelle (P2) und gegebenenfalls Quiz;
die Zusammenfassung steht. Dann wird ein gemeinsames Experiment für alle Routen
aufgebaut statt eines Evals je Route. Grundsätze im vorgeschlagenen
[ADR-049](decisions.md#adr-049--ki-änderungen-nur-mit-eval-nachweis); alles
hier ist ein Entwurf vom 2026-11-10 und darf neu bewertet werden.

- [ ] **Runner für alle Routen:** `cases` (versionierte Prüfkarten in
      `fixtures/ai-eval/<route>.cases.json`, Korpusfälle mit festem Startwert
      nur im ignorierten `output/ai-eval/<route>/`, Kategorie per einfacher
      Regel, Aufteilung Training/Test je Kategorie einmalig festgeschrieben);
      `generate` über Payload-Builder und Antwortprüfung der Route bei
      OpenRouter mit Produktionsmodell, Schlüssel `OPENROUTER_EVAL_API_KEY` mit
      eigenem Limit in `.env.local`, höchstens vier parallel, Wiederaufnahme,
      je Zeile Transkript, geantwortetes Modell, Tokens, Kosten, Latenz;
      automatische Kriterien im Skript; Richter-Übergabe als eine Tabelle
      (ohne Dubletten, gemischt, anonymisiert, mit etwa zehn bekannten
      Kontrolleinträgen) an einen Opus-Agenten (`.claude/agents/eval-judge.md`),
      der sie in einem Durchgang blockweise bewertet; `score` prüft
      Vollständigkeit und berechnet Hauptwert, Kriterien je Kategorie,
      Rauschen und Fallwechsel gegenüber einem Vergleichslauf. Start über einen
      Skill, den auch eine Haiku-Sitzung ausführen kann. Nicht in
      `gate:push`. Nachweis: Trockenlauf mit nachgebildeter Antwort erzeugt
      einen vollständigen Bericht; Unit-Tests für Kriterien und Auswertung.
- [ ] **Varianten-Eval (Entwurf):** etwa 120 Frage/Antwort-Karten je drei
      Wiederholungen; Kategorien Definitionen, Zahlen und Formeln, Richtung
      und Reihenfolge, Aufzählungen, Kurzantworten, lange Karten, andere
      Sprachen, Rückrichtung, `avoid`-Liste, Injection, nicht umformulierbar,
      Bildverweis. Kriterien: M1 Vertrag; M2 fachlich korrekt, keine
      Vertauschung, keine neuen Fakten (kritisch); M3 Zahlen und Formeln
      zeichengenau; M4 erkennbar umformuliert; M5 anders als `avoid`; M6
      Sprache, Schwierigkeit, Natürlichkeit; M7 Tokens, Kosten, Latenz.
      Hauptwert: Anteil der Wiederholungen, die M1–M5 bestehen. Zielvorschlag:
      Hauptwert ≥ 95 %, M2-Verletzungen ≤ 1 % und keine bei Richtung, Kosten
      höchstens 1,2-fach, Latenz p90 ≤ 4 s. Weitere Kartenarten und Routen
      bekommen eigene Fälle und Kriterien im selben Schema.
- [ ] **Card-Help-Eval (Entwurf):** etwa 120 Karten je in allen drei Modi;
      Definitionen, Zahlen und Formeln, lange Prozesskarten, Vokabeln und
      andere Sprachen, Fachjargon, kurze oder kryptische Karten, Folgefragen,
      Fragen außerhalb der Karte, Injection in Karte und Frage, fachlich
      falsche Karten, Bildverweise. Kriterien: H1 Vertrag, Länge, Sprache;
      H2 fachlich korrekt und mit der Karte vereinbar (kritisch); H3 Erklären
      erklärt statt zu wiederholen; H4 Beispiel neu und passend; H5 Frage
      genau beantwortet, Abschweifungen höflich zurückgeführt; H6 keine
      ausgeführte Injection, keine erfundenen Quellen, falsche Karten benannt
      (kritisch); H7 knapp und lernförderlich; H8 Tokens, Kosten, Latenz.
      Hauptwert: Anteil der Wiederholungen, die H1–H6 bestehen. Zielvorschlag:
      Hauptwert ≥ 90 %, H2 ≥ 98 %, H6 = 100 %; Streaming erst, wenn die
      Latenz im Median über 4 s liegt.
- [ ] **Kalibrieren und Baselines:** Richter gegen etwa 40 von Hand bewertete
      Einträge im selben Tabellenmodus (≥ 90 % Übereinstimmung bei den
      kritischen Kriterien), danach Baseline je Route. Erst dann Runden: je
      Runde eine Änderung aus Trainingsfehlern, gemessen am Testteil.
      Nachweis: Baselines, Kosten und Richter-Übereinstimmung in
      `history.md`.
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
      Flaggenraster bei 200 % Zoom.
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
- [ ] **Erste Synchronisation großer Konten:** Bei der Arbeit an P4 dauerte
      die erste Synchronisation eines Kontos mit etwa 50.000 Karten rund
      10 Minuten; das betrifft jeden, der einen großen Anki-Stapel mitbringt.
      Messung reproduzieren, Zeitanteile (Netz, Validierung, IndexedDB)
      zuordnen, Zielwert festlegen und erreichen. Nachweis: Messung mit
      50.000 Karten vorher und nachher.

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
  ändern; ein Lösungsweg über Tags ist `Treffer lernen` aus P4.

### Kartenverwaltung

- Massenaktionen schneller: 1.000 Karten lokal in höchstens 1 s statt rund
  2 s; die Zeit geht fast ganz ins Schreiben von IndexedDB.

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

- Sprungnavigation der Statistik ablösen; mit ihr entfallen `InPageNavigation`,
  `.core-in-page-content`, Katalogdemo und Tests.
- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
