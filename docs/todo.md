# CoRe TODO

Stand: 2026-11-10

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

Reihenfolge = Priorität. Die Restposten sind klein und kommen gesammelt vorab
dran. P1 und P4 laufen, P2 folgt. Offene Nachweise brauchen keinen Code und
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
- [ ] **Ausweg für nicht umformulierbare Inhalte:** Das erzwungene Werkzeug
      verlangt heute immer eine Variante; bei sinnlosen Inhalten (zufällige
      Buchstabenfolgen) oder Insidern ohne allgemeinen Kontext bleibt dem
      Modell nur eine Hülle („Was gehört zu …?“) oder eine erfundene Deutung.
      Playtest mit solchen Prüfkarten neben den bisherigen sechs, danach eine
      Prompt-Ergänzung, über die das Modell eine Karte als nicht
      umformulierbar meldet; die Route gibt das als eigenen Fehlergrund
      zurück. Ein eigener Kartenzustand dafür steht unter „Später“.
      Nachweis: Playtest-Ergebnis vor und nach der Prompt-Ergänzung,
      Routentests mit solchen Karteninhalten.

## P4: Kartenverwaltung 2.0

Läuft auf dem Branch `claude/kartenverwaltung-2`; Roadmap, Entscheidungen und
offene Punkte (KV6, Abschluss) stehen in dessen `docs/todo.md` und kommen mit
dem Merge hierher.

- [ ] **Schmale Zeilen in der Kartenverwaltung (entschieden 2026-11-10):**
      Karten- und Stapelzeilen sind wieder höchstens 30 px hoch; gemessen
      waren am 2026-11-09 40,7 px. Der Vertrag „Karten- und Stapelzeilen
      bleiben auch in schmalen Viewports kompakt“ (`navigation-context`)
      bleibt unverändert, angepasst wird das Layout. Nachweis: Test grün,
      Pflichtmatrix der Kartenverwaltung.

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
      genau zwei KI-Routen und verlangt für ein Kontingent je Nutzer eine
      Ergänzung; eine gemeinsame Ergänzung regelt beides und gibt die dritte
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
- KI-Umformulierungen für Lückentext und andere Bausteine.
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
