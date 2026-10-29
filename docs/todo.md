# CoRe TODO

Stand: 2026-10-29

Nur offene Arbeit. Ist-Stand in [`status.md`](status.md), Entscheidungen in
[`decisions.md`](decisions.md), erledigte Arbeit in [`history.md`](history.md).

## P1: Reife aus FSRS-7 statt XP (R0–R7)

Anlass: Die Lernstufe (XP) zählt nur Klicks und ignoriert FSRS. Bei
Zielerinnerung 0,90 erscheint die erste Variante einer immer mit `Gut`
bewerteten Karte erst nach etwa 15 Jahren; Karten mit Fehlern werden früher
reif, importierte Anki-Karten starten mit 0 XP. Ziel: XP entfällt
vollständig, Reife und Variantenbereitschaft kommen aus dem
FSRS-Gedächtniszustand, FSRS-7 wird Standard. Reihenfolge = Abhängigkeit;
R2–R5 liegen auf einem Branch und werden erst nach R5 gemergt.
Entscheidungsvorschläge (vor R2 bestätigen):

- ER1 XP entfällt samt `maturityXp`, Bonus für Varianten, Bändern, Spalten
  und Anzeige „XP“; der Begriff „Lernstufe“ entfällt.
- ER2 Reife wird aus der Stabilität S abgeleitet und nicht gespeichert: `Neu`,
  `Lernen` (Lern-/Wiederlernphase), `Jung` (S < 7 Tage), `Reif`
  (7 ≤ S < 21), `Gefestigt` (S ≥ 21). „Reif“ heißt überall S ≥ 7 Tage:
  Stapelzahlen, Statistik und Prüfungsfortschritt verwenden dieselbe Funktion.
- ER3 Varianten erscheinen in der Reviewphase, wenn die letzte Bewertung nicht
  `Nochmal` war und S die Stapelschwelle erreicht; Stapelschwelle `früher`
  (3 Tage), `Standard` (7 Tage), `später` (21 Tage). Bei FSRS-7 zählt die
  langfristige Stabilität, nicht `stabilityFast`. Die Rotation bleibt.
- ER4 FSRS-7 aus der jeweils neuesten stabilen `ts-fsrs`-Hauptversion (keine
  Beta) mit offiziellen Standardparametern; Fuzz bleibt aus (Easy Days
  ausgenommen). Entschieden 2026-10-29: Alle drei Profile nutzen die
  `ts-fsrs`-Standardwerte (1 und 10 Minuten, Wiederlernen 10 Minuten); die
  bisherigen Schritte stammten aus dem Scheduler vor FSRS.
- ER7 Entschieden 2026-10-29: Konfigurierte Lernschritte haben Vorrang vor dem
  Modellintervall (`allowModelOverride: false`, wie Anki). Eine neue Karte
  durchläuft bei `Gut` 1 → 10 Minuten; erst danach plant FSRS-7. R2 nutzt
  noch die Übersteuerung und wird mit R3 umgestellt.
- ER9 Standard-Zielerinnerung neuer Stapel und Profile: Anki, `ts-fsrs` und
  `py-fsrs` nutzen 0,90; das Anki-Handbuch rät zu Werten zwischen dem
  berechneten Minimum und 0,97. 0,94 verkürzt die Abstände guter Karten auf ein Drittel bis ein Fünftel und
  kostet im ersten Jahr rund 40 % mehr Wiederholungen. Offen.
- ER10 `Leicht` auf einer neuen Karte ergibt unter FSRS-7 bei 0,90 etwa 54,
  bei 0,94 etwa 19 Tage (FSRS-6: rund 8). Anki behandelt `Leicht` gleich
  (Lernphase sofort beendet). Offen, ob CoRe dem folgt.
- ER8 FSRS-7 rechnet je Bewertung etwa 13 µs in der Bibliothek; die
  Prüfungsplanung braucht für 200 Tage, 5.000 neue und 2.000 bekannte Karten
  im Median 2.054 statt 821 ms (längster Block unverändert 65 ms).
  Entschieden 2026-10-29: vorerst hinnehmen, später optimieren (siehe
  `Betrieb`).
- ER5 Vorhandene Lernstände: vollständiger Cutover ohne Migrationscode in der
  App. Entweder Neuberechnung aus den Reviewereignissen durch ein einmaliges
  Skript außerhalb des App-Codes, das danach gelöscht wird, oder Reset nach
  ADR-034. Offen.
- ER6 Entschieden 2026-10-29: `Leicht` beendet bei neuen Karten die
  Lernphase sofort (heutiger Code, specs §6.5); ADR-009 ist korrigiert.

R0 und R1 sind erledigt (Markierung `Neuplanung P1`, ADR-044 vorgeschlagen,
`decisions.md` mit 20 geltenden ADRs), Details in [`history.md`](history.md).
R2 (FSRS-7) und R3 (Reife aus der Haltbarkeit) sind erledigt, Details in
[`history.md`](history.md).
- [ ] **R4 Oberfläche und Texte:** Kartendetail (Stabilität statt
      „Lernstufe X von Y XP“), Auswahl der Stapelschwelle, Einschalt-Dialog,
      Hilfe zu S und Variantenbereitschaft, Statistikkategorien, Simulator;
      `scripts/uiCatalogDemos.tsx`; visuelle Pflichtmatrix der betroffenen
      Ansichten.
- [ ] **R5 Datenbank-Cutover:** `maturity_xp` und `maturity_band` entfallen,
      `stability_fast` kommt hinzu; Katalog, `mature_count` und
      `young`/`mature` leiten Reife aus der Stabilitätsspalte ab (gleiche
      Grenzen wie R3, Verify-SQL); Stapeleinstellungen ohne alten
      Schwellenschlüssel; ER5 ausführen. `db:types:generate`,
      `db:types:check`, `test:rls:local`, `test:e2e:local`; Remote-Reset nur
      unter den Bedingungen aus ADR-034.
- [ ] **R6 Tests:** Tabellengetriebener Golden-Test der Beispielketten
      (Bewertungspfad × Zielerinnerung → Intervalle, S, D, Reifeband, erster
      Kontakt mit Variante) mit FSRS-7; XP-Tests entfernen; Fixtures
      (`worldCapitals`, Showcase-Daten), `coreVariantService`- und
      Prüfungsplanungstests, E2E `core-stabilization` anpassen.
      `npm run gate:push`, `npm run performance:measure:local`.
- [ ] **R7 Specs und Doku:** Neuer Spec-Abschnitt „Lernverlauf einer Karte“
      für Bearbeiter, der das Scheduling sichtbar macht: je Lage der Karte
      (neu, Lernschritt, Wiederholung, Wiederlernen) was jede Bewertung
      bewirkt; Beispielketten als visuelle Zeitleisten (Klick → Abstand →
      nächster Kontakt, Phase farbig, Reife und erste Variante markiert) und
      zusätzlich als Tabellen je Zielerinnerung; darin „Wann Varianten
      erscheinen“ je Stapelschwelle. Alle Werte stammen aus dem Golden-Test
      (R6) und werden mit `npm run docs:build` erzeugt, nicht von Hand
      gepflegt; die Darstellung kommt in die Specs-HTML. Glossar „Reife“ und
      „Stabilität“; Prüfungsfortschritt „gefestigt“ in die Prüfungs-Specs;
      `architecture.md`, `status.md`; Neutralisierungshinweise aus R0
      entfernen; ADR-044 `angenommen`, ADR-009 entfernt, ADR-039 angepasst;
      TODO-Punkt „KI-Varianten vorausschauend erzeugen“ auf
      Stabilitätsprognose umformulieren; `history.md`; diesen Block löschen.

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

- [ ] **Prüfungsplanung unter FSRS-7 beschleunigen:** Seit FSRS-7 dauert
      `createExamPortfolioForecast` für 200 Tage, 5.000 neue und 2.000
      bekannte Karten im Median 2.054 statt 821 ms (`npm run benchmark:exams`,
      2026-10-29); der längste Hauptthread-Block bleibt bei 65 ms. Die
      Bibliothek braucht etwa 13 µs je Bewertung, unser Wrapper etwa 3,5 µs.
      Ansätze: weniger simulierte Kontakte (Kohorten gröber bündeln,
      Zukunftskontakte jenseits des Horizonts abschneiden), Schema-Prüfung von
      `ts-fsrs` im Simulationspfad vermeiden, Worker erst bei gemessenem
      Bedarf. Ziel: wieder unter 1 s für 200 Tage. Nachweis: Benchmark
      vorher/nachher, `npm run performance:measure:local`.
- [ ] **Hosted-Smoke nach den Migrationen vom 2026-10-10:** `npm run test:beta:hosted`
      mit dem dedizierten Testaccount gegen `https://core-hosted.vercel.app`.

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
  Tagen die Lernstufe des Stapels erreichen, statt beim Einschalten den ganzen
  Stapel zu bearbeiten. Verteilt die Last über die Tage und
  verbraucht nichts für ungelernte Karten. Löst die Stapelaktion des
  Proof of Concept automatisch aus. Braucht eine Ergänzung zu ADR-011.
- KI-Routen in `npm run dev`: `fitzbert` bedient `/api/ai/*` lokal per
  Vite-Plugin statt über `vercel dev`. Vor dem ersten Release oder wenn weitere
  Entwickler lokal mit KI arbeiten, entscheiden und dann `operations.md`
  anpassen.
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

## Prüfungsplanung: verbleibende Themenanbindung

- [ ] Semantische Themenzuordnung innerhalb ungegliederter Stapel entwerfen. Aktuell bilden Unterstapel die Themen; eine spätere Zuordnung braucht explizite, prüfbare Themengrenzen und darf Lernstände nicht ändern.
