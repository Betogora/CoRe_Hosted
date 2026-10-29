# CoRe TODO

Stand: 2026-10-29

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## P1: Reife aus FSRS-7 statt XP (R4–R7)

R0–R3 sind erledigt, Details in [`history.md`](history.md): FSRS-7 ist der
einzige Scheduler, XP ist entfernt, Reife folgt der Haltbarkeit (Tage, bis die
Erinnerung auf 90 % fällt). Die mit `Neuplanung P1` markierten Aussagen in
`specs.md`, `architecture.md` und `status.md` bleiben bis R7 nicht bindend.

Die getroffenen Entscheidungen stehen in ADR-044. Offen:

- ER5 Vorhandene Lernstände: vollständiger Cutover ohne Migrationscode in der
  App. Entweder Neuberechnung aller Lernstände aus den Reviewereignissen mit
  FSRS-7 durch ein einmaliges Skript außerhalb des App-Codes, das danach
  gelöscht wird, oder Reset nach ADR-034. Bis dahin gelten Lernstände ohne
  schnelle Spur als „schnelle Spur = Stabilität“. Vor R5 entscheiden.

- [ ] **R4 Oberfläche und Texte:** Kartendetail („Haltbarkeit X von Y
      Tagen“), Auswahl der Stapelschwelle, Einschalt-Dialog, Hilfe (Erklärung
      von `S` als Haltbarkeit statt „Zeit bis 90 %“, FSRS-7 statt FSRS-6,
      Variantenbereitschaft), Statistikkategorien (die historischen bleiben
      Anki-kompatibel nach Intervall, weil Reviewereignisse keine schnelle Spur
      tragen; Beschriftung „Intervall ab 21 Tagen“ statt „Reif“), Simulator,
      Lernschritt-Labels der Profile; `scripts/uiCatalogDemos.tsx`; visuelle Pflichtmatrix der
      betroffenen Ansichten.
- [ ] **R5 Datenbank-Cutover:** `list_account_card_study_states` liefert
      `stability_fast` als Pflichtfeld (die Validierung erlaubt es bis dahin
      leer); `card_study_states.maturity_xp` entfällt; Katalog und
      Stapelzahlen lesen weiter das von der App geschriebene Reifeband aus
      `study_extra`. ER5 ausführen. `db:types:generate`, `db:types:check`,
      `test:rls:local`, `test:e2e:local`; Migration vor dem App-Deployment auf
      dem gehosteten Supabase; Remote-Reset nur unter den Bedingungen aus
      ADR-034.
- [ ] **R6 Tests:** Tabellengetriebener Golden-Test der Beispielketten
      (Bewertungspfad × Zielerinnerung 0,90/0,92/0,94 → Abstände, Haltbarkeit,
      Reifeband, erster Kontakt mit Variante); Fixtures (`worldCapitals`,
      Showcase-Daten) und E2E `core-stabilization` gegen die neue Reife prüfen.
      `npm run gate:push`, `npm run performance:measure:local`.
- [ ] **R7 Specs und Doku:** Neuer Spec-Abschnitt „Lernverlauf einer Karte“
      für Bearbeiter: je Lage der Karte (neu, Lernschritt, Wiederholung,
      Wiederlernen), was jede Bewertung bewirkt; Beispielketten als visuelle
      Zeitleisten (Klick → Abstand → nächster Kontakt, Phase farbig, Reife und
      erste Variante markiert) und als Tabellen je Zielerinnerung; darin „Wann
      Varianten erscheinen“ je Stapelschwelle. Alle Werte stammen aus dem
      Golden-Test (R6) und werden mit `npm run docs:build` erzeugt. Glossar
      „Reife“ und „Haltbarkeit“; „gefestigt“ in die Prüfungs-Specs;
      `architecture.md`, `status.md`; Markierungen `Neuplanung P1` entfernen;
      ADR-044 auf Haltbarkeit präzisieren und `angenommen`, ADR-009 löschen,
      ADR-015 und ADR-039 anpassen; `history.md`; diesen Block löschen.

## Offene Abnahmen der Kartenmodell-Roadmap

- [ ] **Gerätenachweise (Phase 3):** Bildschirmtastatur, Touch, Screenreader,
      Sprachausgabe und 200-%-Browserzoom auf echten Smartphones; dazu die
      Mindmap-Gesten aus W4c (Doppeltippen, Langdrücken, Zwei-Finger-Zoom,
      Vollbild) auf iOS und Android.
- [ ] **Korpus (Phase 5):** AnKing und ein echter Lernstand mit Lern-,
      Wiederlern-, ausgesetzten, begrabenen und geflaggten Karten. Ziel: mindestens
      95 % voll übersetzt, 0 % nicht darstellbar. Prüfung:
      `npm run report:apkg-corpus`.

## KI-Varianten (Proof of Concept)

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

## Betrieb

- [ ] **Hosted-Smoke:** Der letzte `npm run test:beta:hosted` lief am
      2026-10-10. Seitdem kamen die Migrationen für die Planungs-RPC (10-12),
      Online-Zusammenfassungen und -Mindmaps (10-17) und Profilformat 2 und 3
      (10-24, 10-25) hinzu; nach R5 gemeinsam mit dem Testaccount gegen
      `https://core-hosted.vercel.app` wiederholen.
- [ ] **Prüfungsplanung beschleunigen:** Seit FSRS-7 und den simulierten
      Lernschritten dauert `createExamPortfolioForecast` für 200 Tage, 5.000
      neue und 2.000 bekannte Karten im Median 2.680 statt 821 ms
      (`npm run benchmark:exams`, 2026-10-29; gemeinsame Stapel 2.207 statt
      398 ms); der längste Hauptthread-Block bleibt bei 66 ms. Die Bibliothek
      braucht etwa 13 µs je Bewertung. Ansätze: weniger simulierte Kontakte
      (Kohorten gröber bündeln, Lernschritte desselben Tages zusammenfassen,
      Kontakte jenseits des Horizonts abschneiden), Schema-Prüfung von
      `ts-fsrs` im Simulationspfad vermeiden, Worker erst bei gemessenem Bedarf.
      Ziel: wieder unter 1 s für 200 Tage. Nachweis: Benchmark vorher/nachher,
      `npm run performance:measure:local`.

## Später

- Native App nach ADR-036.
- AMBOSS-Tooltips nur über eine offizielle Kooperation oder API.
- Serverseitiger APKG-Import, falls Import auf Mobilgeräten nötig wird.
- KI-Umformulierungen für Lückentext und andere Bausteine.
- KI-Kontingent pro Nutzer: Alle Nutzer teilen das Ausgabenlimit des
  OpenRouter-Schlüssels; ein Tageslimit je Account (atomare Zählung in Supabase)
  verhindert, dass ein Nutzer es allein aufbraucht. Braucht eine Ergänzung zu
  ADR-011.
- KI-Varianten vorausschauend erzeugen: Bei eingeschaltetem CoRe-Modus erzeugt
  CoRe Varianten im Hintergrund und gesammelt für die Karten, die in den nächsten
  Tagen die Haltbarkeitsschwelle des Stapels erreichen, statt beim Einschalten
  den ganzen Stapel zu bearbeiten. Verteilt die Last über die Tage und
  verbraucht nichts für ungelernte Karten. Löst die Stapelaktion des
  Proof of Concept automatisch aus. Braucht eine Ergänzung zu ADR-011.
- Persönliche FSRS-Parameteroptimierung (mit `ts-fsrs` 6 und
  `@open-spaced-repetition/binding` im Browser möglich).
- KI-Routen in `npm run dev`: Ein Vite-Plugin bedient `/api/ai/*` lokal statt
  `vercel dev`. Vor dem ersten Release oder wenn weitere Entwickler lokal mit KI
  arbeiten, entscheiden und dann `operations.md` anpassen.
- Bild einer eigenen Bildverdeckung im Karteneditor austauschen.
- Flaggen als Feature: je Karte eine von sieben Farben wie in Anki (importiert
  und synchronisiert bereits als `anki_flag`, bisher unsichtbar). Umfang:
  Flaggenwahl in Lernen und Editor (Strg+1–7), Farbpunkt in der Kartentabelle,
  Filter in der Suche, optional eigene Namen je Farbe; der Konfliktvergleich
  zeigt die Flagge dann zu Recht.
- Login-Wege: Magic Link und Google sind gebaut, aber per Flag aus. Für Magic
  Link braucht es einen eigenen SMTP-Server in Supabase, freigegebene
  Redirect-Adressen (Produktion, Preview), eine deutsche Mailvorlage und
  zusätzlich einen 6-stelligen Code zum Eintippen, weil der Link auf Mobilgeräten
  oft im falschen Browser landet. Google erst nach Entscheidung über den
  OAuth-Prüfprozess und den Datenschutztext; sonst Code und Flag entfernen.
- Prüfungsplanung: semantische Themenzuordnung innerhalb ungegliederter Stapel.
  Heute bilden Unterstapel die Themen; eine spätere Zuordnung braucht
  explizite, prüfbare Themengrenzen und darf Lernstände nicht ändern.
