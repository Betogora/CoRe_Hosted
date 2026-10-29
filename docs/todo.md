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
  ausgenommen). Vorläufig 2026-10-29: Lernschritte folgen den
  `ts-fsrs`-Standardwerten (heute 1 und 10 Minuten, Wiederlernen 10 Minuten);
  offen: Die heutigen Profilschritte stammen aus dem Scheduler vor FSRS, nicht
  aus `ts-fsrs`; zu bestätigen, auch für Intensiv und Entspannt.
- ER5 Vorhandene Lernstände: vollständiger Cutover ohne Migrationscode in der
  App. Entweder Neuberechnung aus den Reviewereignissen durch ein einmaliges
  Skript außerhalb des App-Codes, das danach gelöscht wird, oder Reset nach
  ADR-034. Offen.
- ER6 Entschieden 2026-10-29: `Leicht` beendet bei neuen Karten die
  Lernphase sofort (heutiger Code, specs §6.5); ADR-009 ist korrigiert.

R0 und R1 sind erledigt (Markierung `Neuplanung P1`, ADR-044 vorgeschlagen,
`decisions.md` mit 20 geltenden ADRs), Details in [`history.md`](history.md).

- [ ] **R2 FSRS-7:** `ts-fsrs` auf die neueste stabile Version; FSRS-7-Modell
      statt veraltetem `fsrs()`; entfernte APIs ersetzen
      (`get_retrievability`, `elapsed_days`); `stabilityFast` in
      `ReviewState`/`CardStudyState`; Easy Days gegen die neue Fuzz-Spanne
      prüfen; APKG-Import spielt die Anki-Historie mit FSRS-7 ab (Anki-eigene
      FSRS-6-Werte nur ohne Historie); Prüfungsprognose messen (FSRS-7 je
      Simulation); Node 24 in `engines`, CI und Vercel; ER4 Lernschritte.
- [ ] **R3 Reifemodell:** Eine Funktion für Reifeband und
      Variantenbereitschaft aus dem Lernstand (ER2, ER3). XP-Logik,
      `variantThresholdXp` und Reifebänder entfernen; Stapeleinstellung auf
      Stabilitätstage umstellen. Nutzer: `selectReviewVariant`,
      `describeVariantReadiness`, Stapelzahlen (`matureCount`),
      Prüfungsplanung (gefestigt, Methode „Variante“), Statistikkategorien.
      Importierte Anki-Karten sind damit sofort richtig eingestuft.
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
- [ ] **R7 Specs und Doku:** Neuer Spec-Abschnitt „Wann Varianten
      erscheinen“ mit Tabelle der Klickpfade je Zielerinnerung und
      Stapelschwelle (Werte aus dem Golden-Test); Glossar „Reife“ und
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
