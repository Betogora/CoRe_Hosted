# CoRe TODO

Stand: 2026-10-29

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

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
- [ ] **Statistik-RPC am Gate:** `get_account_statistics` lag im lokalen
      Benchmark (100k Karten, 1 Mio. Reviews) bei p95 1.031 und 1.063 ms
      (Median 967 und 878 ms, 2026-10-29) und damit knapp über der Grenze von
      1.000 ms, ohne dass sich Funktion oder Tabellen geändert hatten. Mit
      `EXPLAIN (ANALYZE, BUFFERS)` klären, ob Rauschen oder echter Spielraum
      fehlt; bei Bedarf Abfrage oder Rollup straffen. Nachweis:
      `npm run benchmark:statistics` mehrfach unter der Grenze.

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
