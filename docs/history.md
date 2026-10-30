# CoRe-Verlauf

**Rolle:** einzige kanonische Quelle für abgeschlossene Arbeit, datierte Abnahmen, Release-IDs und Smoke-Protokolle.
**Stand:** 2026-10-30

Der Verlauf ist kein Produktvertrag und keine Roadmap. Aktuelles Verhalten steht in [`status.md`](status.md), offene Arbeit in [`todo.md`](todo.md).

## 2026-10-30 — Prüfungsplanung: exakte Beschleunigung der Laufbahnsimulation

- Kostenpfad (Profil, 200 Tage): 77.710 simulierte Kontakte, davon 68.789 für die 2.000 bekannten Karten und knapp die Hälfte Wiederlernschritte am selben Tag. `scheduleWithFsrs` trug rund zwei Drittel der Zeit; davon nur gut die Hälfte im `ts-fsrs`-Aufruf, der Rest in Buchführung je Antwort (Konfiguration normalisieren, Lernstand zweimal aufbauen, Reifeband mit eigener Modellrechnung, ISO-Zeitstempel, Intervalltexte).
- `scheduler.ts` bietet `createReviewChain`: Konfiguration einmal je Laufbahn, je Antwort derselbe `ts-fsrs`-Aufruf und dieselbe Fälligkeit einschließlich Easy Days (gemeinsame Funktion mit `projectFsrsResult`), ohne Buchführung dazwischen. `examPlanning.ts` simuliert damit; `examContactPlanning.ts` summiert Kohortenspalten nur über belegte Tage.
- Ergebnis-Speicher je Prognose (`createReviewChainMemo`): 47 % der Bibliotheksaufrufe hatten identische Eingaben, weil Ketten über die gemeinsame Bewertungsfolge in gleiche Zustände mit gleichen Abständen zusammenlaufen (200 Tage: 36.805 von 77.710). Schlüssel sind alle Eingaben, die `ts-fsrs` liest (Gedächtniszustand, Phase, Lernschritt, `scheduledDays`, vergangene Zeit, Bewertung), als Zahlen-Hash mit exaktem Vergleich; `reps` und `lapses` zählt die Bibliothek nur hoch, die Fälligkeit ist `now + scheduledDays`. Außerdem einmalige Serialisierung der Stapeleinstellungen je Prognose und Fensterschleife ohne Destrukturierung.
- Die Prognose bleibt bitgleich, verglichen über das vollständige Ergebnis aller drei Benchmark-Szenarien gegen den Stand vor der Änderung.
- Geprüft und ohne Gewinn: Kontakte jenseits des Prüfungstermins werden schon nicht simuliert; ein Worker oder Leerlauf-Häppchen verkürzen nur die gefühlte Blockade, die bereits bei 56–67 ms liegt.
- Verworfen: gröber gebündelte Kohorten bekannter Karten. Bei ±5 bis ±20 % Stabilität, ±0,25 bis ±1 Schwierigkeit und ±1 bis ±5 % Abrufwahrscheinlichkeit sanken die Laufbahnen nur von 1.000 auf 928–874 je Prüfung ohne messbaren Zeitgewinn, verschoben aber 31–82 neue Karten.
- `npm run benchmark:exams` nutzt für die drei Szenarien einen alltäglichen Bewertungsmix von 10/10/75/5 % (Wiederholen/Schwer/Gut/Leicht): Bei der Standard-Zielerinnerung 92 % scheitern etwa 8 % der Wiederholungen, 10 % ist also eher streng. Der bisherige Mix mit je 25 % trieb die Kosten (jede vierte Antwort ein Lapse mit Wiederlernschritt, die deterministische Folge begann für jede bekannte Karte mit Wiederholen) und bleibt als Stressfall über 200 Tage erhalten. Budgets: 1.000 ms je alltäglichem Szenario, 2.000 ms für den Stressfall; ein Median darüber beendet den Lauf mit Fehlercode.
- Messung mit alltäglichem Mix (Median, drei Durchläufe nach der Änderung): 60 Tage vorher 835 ms (CPU 828 ms) → 203–465 ms, 200 Tage vorher 1.210 ms (CPU 1.079 ms) → 256–268 ms, gemeinsame Stapel vorher 705 ms (CPU 579 ms) → 171–218 ms; längster Block 54–73 ms. Stressfall 200 Tage: 1.083–1.620 ms (vor der Änderung im selben Szenario 2.569 ms im alten Benchmark).
- Weitere Messung mit dem alten Mix unter Fremdlast von 75–100 % CPU, daher stark schwankend: `npm run benchmark:exams` 200 Tage vor der Änderung 2.569 ms, danach in drei Durchläufen 1.407, 1.413 und 2.386 ms (Median; einzelne Läufe 848–1.045 ms), längster Block 61–72 ms. Verlässlicher ist der verschränkte Vergleich im selben Prozess (je vier Läufe, CPU-Zeit): 60 Tage 1.578 → 610 ms, 200 Tage 4.750 → 1.953 ms, gemeinsame Stapel 2.265 → 1.063 ms, also 39–47 % der vorherigen Zeit. Mit einem Bewertungsmix von 10/10/75/5 % statt je 25 %: 200 Tage 1.079 → 500 ms CPU. Das Ziel unter 1 s für 200 Tage ist mit alltäglichem Mix erreicht; der Todo-Eintrag ist entfernt. Nicht umgesetzt, weil ohne gemessenen Bedarf: Ergebnis-Speicher über Neuberechnungen hinweg, Laufbahnen parallel in Workern.
- Verifiziert: Prüfungs- und Scheduler-Tests (neu: Laufbahn plant über 40 Zufallsantworten aus neu, Wiederholung und Wiederlernen, mit und ohne Easy Days, auch mit geteiltem Ergebnis-Speicher, wie `scheduleWithFsrs`), `npm test` (861/861), `npm run typecheck`, `npm run benchmark:exams` dreimal innerhalb der Budgets. `npm run performance:measure:local` nach dem Abgleich mit PR #53: Startmessung (vier Startkontexte und 4G-Preload) bestanden, `get_account_statistics` p95 679 ms, Katalogsuche p95 123 ms; alle Gates eingehalten.
## 2026-10-30 — Statistik-RPC wieder unter dem Gate

- Funktion: `get_account_statistics` zählte aktive Varianten mit einer Unterabfrage je Karte; bei 100.000 Karten lief sie 100.000-mal (`EXPLAIN (ANALYZE, BUFFERS)`: rund 600.000 Puffertreffer, etwa die Hälfte der Laufzeit). Migration `20261030004024_account_statistics_variant_counts.sql` gruppiert die Varianten einmal je Karte und hängt sie an; Signatur, Rückgabe und Rechte bleiben gleich. Im Vergleich in derselben Transaktion halbierte das die Laufzeit in allen sieben Runden bei identischem Ergebnis. Mehr `work_mem` gegen das Auslagern der Karten-CTE brachte keinen verlässlichen Gewinn und bleibt weg.
- Benchmark-Setup: Die Fixture rollt zurück und hinterließ je Lauf rund 1,1 Mio. tote Zeilen (Reviews, Inhalte, Karten, Katalog). Folgeläufe wurden dadurch langsamer (Median 942 → 1.200 ms nach einem Lauf Altlast), und Autovacuum lief über GB-große Tabellen parallel zu späteren Messungen. `supabase/benchmark_replica_v2.sql` räumt diese Tabellen nach dem Rollback mit `vacuum` auf (lokal etwa 15 s).
- Rechnerlast: p95 aus fünf Läufen ist faktisch der langsamste Lauf und schwankt stark; während `npm ci` im OneDrive-Ordner lag die unveränderte Funktion bei 650 bis 1.060 ms.
- Der RLS-Test prüft zusätzlich `status.activeVariants` (Karte und drei aktive Varianten).
- Verifiziert: `npm run benchmark:statistics` viermal hintereinander mit p95 581, 874, 755 und 650 ms (p75 497, 516, 718, 574 ms), danach keine toten Zeilen; Katalogsuche p95 142 bis 285 ms. `npm run db:types:check` ohne Drift, `npm run test:rls:local` 19/19, `verify_schema_v1.sql` lokal ohne Fehler, `npm run typecheck`. Nicht ausgeführt: `npm run test:e2e:local` (Rückgabe unverändert).
- Hosted: Migration am 2026-10-30 per `supabase db push --linked` auf `hirbiuiydczmnjqtoyqx` angewendet (Trockenlauf zeigte nur diese Migration), `verify_schema_v1.sql` remote ohne Fehler.

## 2026-10-30 — Hosted-Smoke nach P1

- `npm run test:beta:hosted` gegen `https://core-hosted.vercel.app` mit dem Production-Deployment von `7663022` (PR #52, Abschluss P1) nach dem Datenbank-Cutover aus R5 und den Migrationen für Planungs-RPC, Online-Zusammenfassungen und -Mindmaps sowie Profilformat 2 und 3: 10 von 10 bestanden in 3,0 min.
- Die lokalen Sicherungen der Lernstände aus der Neuberechnung (R5) sind danach gelöscht.

## 2026-10-29 — Reife aus FSRS (P1 R7): Specs und Doku, Abschluss P1

- `src/schedulerExampleChains.ts` hält Beispielketten und Lagen der Karte; Golden-Test und `npm run docs:build` lesen dieselben Ketten. Der Test prüft zusätzlich die Wirkung jeder Bewertung je Lage (neu, zweiter Lernschritt, Wiederholung, Wiederlernen) bei 92 %.
- Neuer Spec-Abschnitt §6.11 „Lernverlauf einer Karte“ mit Regeln je Lage; `specs.html` erzeugt dazu die Karten „Was jede Bewertung bewirkt“, „Beispielketten als Zeitleiste“ (Phase als Farbkante, „wird reif“ und erste Variante markiert), „Beispielketten je Zielerinnerung“ und „Wann Varianten erscheinen“ je Schwelle 7/21/60 Tage. `specsCatalog` fügt erzeugte Karten hinter einer Spec-Karte ein.
- Glossar `Haltbarkeit` und `Reife` statt `Lernstufe`; „gefestigt“ in §6.9 ist `Reif`. Alle 24 Markierungen `Neuplanung P1` in Specs, Architektur, Status und ADRs aufgelöst; dabei auch Import-Reihenfolge (FSRS-7-Replay vor Anki-Speicherstand), Statistik-Kategorien und Simulator-Schnellauswahl `+1` nachgezogen.
- ADR-044 ist `angenommen` und übernimmt die weiter gültigen Teile von ADR-009 (einziger Scheduler, Lernschritte, Sitzungsreihenfolge, keine Parameteroptimierung); ADR-009 gelöscht, ADR-015 und ADR-039 auf Haltbarkeit angepasst. P1-Block im Todo entfernt.
- Verifiziert: Golden-Test 5/5, `scripts/docsSite.test.ts` 13/13 (neu: Reihenfolge und Vollständigkeit der erzeugten Karten), `npm run docs:build`, `npm run check:docs`; Specs-Seite bei 1280 px hell und dunkel sowie 390 px ohne horizontales Scrollen geprüft.

## 2026-10-29 — Reife aus FSRS (P1 R6): Golden-Test und Gates

- Golden-Test `src/schedulerExampleChains.test.ts`: vier Bewertungspfade (immer `Gut`, `Leicht` dann `Gut`, `Gut` mit einem Fehler, `Nochmal` am Anfang) je Zielerinnerung 0,90, 0,92 und 0,94 über Produktions-Scheduler und Variantenwahl; je Kontakt Tag, Bewertung, Stapelschwellen (7/21/60 Tage), bei denen die Variante statt der Karte kommt, nächster Abstand, Haltbarkeit und Reifeband. Die Haltbarkeit hängt nicht von der Zielerinnerung ab, nur die Abstände; mit einer Variante kommt sie ab erreichter Schwelle bei jedem zweiten Kontakt. Der Reife-Test aus `schedulerIntervals.test.ts` war darin enthalten und ist entfernt.
- Fixtures: `worldCapitals` berechnet das Reifeband bereits über `getMaturityBand` (etwa 45 % reif); das Profil `variantReady` erreicht mindestens 28 Tage Haltbarkeit und bleibt unverändert. Die Showcase-Daten liegen nicht im Repository.
- `supabase/benchmark_replica_v2.sql` analysiert Notizen und Karten vor dem Katalog-Insert. Ohne Statistik schätzte der Planer eine Zeile je Tabelle und verband 100.000 × 100.000 Zeilen; die Befüllung lief über 24 Minuten statt Sekunden.
- Audit (`audit-last-change`) nachträglich über R4 und R5: keine sinnvolle Vereinfachung. Bandbezeichnungen und -schlüssel der Statistik existieren je einmal; der Rückfall auf die schnelle Spur aus alten Outbox-Einträgen bleibt; die neuen Tests sichern Status nach Band, das RLS-Feld und den Simulator-Chip.
- Verifiziert: `npm run gate:push` grün (Typecheck, Knip, Docs, alle Unit-/Contract-/Integrationstests, Build; Initialgraph 239,5 KiB gzip, größter Lazy-Graph 170,3 KiB). `npm run performance:measure:local`: Startmessung (vier Startkontexte und 4G-Preload) bestanden; Statistik-Benchmark knapp über dem Gate: `get_account_statistics` p95 1.031 und 1.063 ms in zwei Läufen (Median 967 und 878 ms, Grenze 1.000 ms). Die Funktion und ihre Tabellen sind seit dem letzten grünen Lauf unverändert; Katalogsuche p95 166/254 ms, Bootstrap 45/23 ms, App-Projektion unter 6 ms.

## 2026-10-29 — Reife aus FSRS (P1 R5): Datenbank-Cutover

- Migration `20261029120000_card_study_states_stability_fast.sql`: `list_account_card_study_states` liefert `stability_fast` aus `study_extra` (ohne Wert 0, der Scheduler setzt die schnelle Spur dann gleich der Stabilität) statt `maturity_xp`; die Validierung verlangt das Feld. Katalog und Stapelzahlen lesen weiter `study_extra.maturityBand`.
- Neuberechnung (ER5) mit einem einmaligen Skript außerhalb des Repos über den Produktions-Scheduler: Ab der letzten Antwort auf eine neue Karte werden die Reviewereignisse mit den Stapeleinstellungen nachgespielt (manuelle Verschiebungen übernehmen ihren Termin); Karten ohne vollständige Folge behalten Stabilität und Schwierigkeit und bekommen nur das Reifeband. `study_revision` steigt, damit Geräte den neuen Lernstand laden; neue Karten verlieren nur das XP-Feld. Ein zweiter Lauf ändert nichts.
- E2E an die Neuplanung angepasst: `card-lifecycle` erwartet für `Nochmal` bei neuen Karten 1 statt 5 Minuten (ER4); `core-stabilization` stellt für den Variantentest die Schwelle auf 7 Tage, weil die Fixture-Karte mit 18 Tagen Haltbarkeit unter dem Standard von 21 liegt.
- Hosted: Migration am 2026-10-29 per `supabase db push --linked` auf `hirbiuiydczmnjqtoyqx` angewendet (Trockenlauf zeigte nur diese Migration), `verify_schema_v1.sql` remote ohne Fehler. Danach die Neuberechnung: 185 gelernte Karten (156 nachgespielt, 29 nur Reifeband), 9.957 neue Karten ohne XP-Feld; ein zweiter Lauf änderte nichts. Katalog danach: 9.957 `new`, 11 `learning`, 38 `young`, 136 `mature`. Skript gelöscht.
- Verifiziert: `npm test` (856/856), `npm run typecheck`, `npm run db:types:generate`, `npm run db:types:check`, `npm run test:rls:local` (19/19, neu: `stability_fast` ist eine Zahl); `npm run test:e2e:local` 209 bestanden, 3 fehlgeschlagen, 1 übersprungen; die drei betroffenen Specs danach 51/51 (der Hilfe-Scrolltest war sporadisch). Neuberechnung lokal (291 Karten) und erneuter Lauf ohne Änderung. Nicht geprüft: Hosted-Smoke (siehe `todo.md`, Betrieb).

## 2026-10-29 — Reife aus FSRS (P1 R4): Oberfläche und Texte

- Hilfe: FSRS-7 statt FSRS-6, `S` wird als Haltbarkeit (Tage bis 90 % Abrufwahrscheinlichkeit) erklärt, Varianten ab der Haltbarkeitsschwelle des Stapels, „Gut“ führt bei neuen Karten nach 10 Minuten zum zweiten Kontakt, „Leicht“ beendet die Lernphase.
- Statistik: Die Kategorien der Reviewhistorie und der Planung bleiben Anki-kompatibel nach Intervall und heißen „Intervall unter 21 Tagen“ und „Intervall ab 21 Tagen“. Das Statusdiagramm zählt lokal wie in der Cloud das gespeicherte Reifeband (`Neu`, `Lernen`, `Jung`, `Reif`); vorher zählte es lokal nach Intervall und neue Karten als „Lernen“.
- Statistik: Das Diagramm „Antwortknöpfe“ gruppiert nach Knopf und färbt nach Kategorie wie „Wiederholungen“, damit die langen Kategorienamen in der umbrechenden Legende statt auf der schmalen Achse stehen. Das Statusdiagramm färbt nach Reifeband statt nach Position; „Neu“ und „Lernen“ hatten vorher dieselbe Farbe.
- Simulator: Schnellauswahl „+1 Min.“ für den ersten Lernschritt.
- Kartendetail, Stapelschwelle, Einschalt-Dialog und Lernschritt-Labels waren mit R3 umgestellt. ER5 entschieden: Neuberechnung aus den Reviewereignissen in R5.
- Verifiziert: `npm test` (856/856, neu: Statusdiagramm folgt dem Reifeband), `npm run typecheck`, `npm run build`, `npm run check:docs`; visuelle Prüfung von Statistik, Hilfe und Simulator im UI-Katalog bei 320, 390, 1280 und 1440 px in Light und Dark. Nicht geprüft: 360 und 430 px, 200 % Zoom, die App mit Cloud-Snapshot (braucht Anmeldung).

## 2026-10-29 — Reife aus FSRS (P1 R3): Haltbarkeit statt XP

- XP entfällt vollständig (Bewertungspunkte, Varianten-Bonus, `maturityXp`, `variantThresholdXp`, sechs XP-Bänder). Reife leitet `scheduler.ts` aus dem FSRS-7-Gedächtniszustand ab: Haltbarkeit = Tage, bis die Erinnerung auf 90 % fällt (`getDurabilityDays`); Bänder `new`, `learning` (Lern- und Wiederlernphase), `young` und `mature` ab 21 Tagen. Die rohe Stabilität eignet sich nicht, weil sie nach einem Fehler hoch bleibt, während die schnelle Spur und damit die Haltbarkeit einbrechen.
- Varianten erscheinen in der Reviewphase ohne aktuelles `Nochmal`, sobald die Haltbarkeit die Stapelschwelle `variantThresholdDays` erreicht (früher 7, Standard 21, später 60 Tage). Bei Zielerinnerung 0,92 macht dreimal `Gut` ab einer neuen Karte reif (Haltbarkeit 4,8 → 10 → 36 Tage).
- Konfigurierte Lernschritte haben Vorrang vor dem Modellintervall (ER7, `allowModelOverride: false`); Standard-Zielerinnerung 0,92 (ER9); `Leicht` beendet bei neuen Karten die Lernphase wie in Anki (ER10).
- Prüfungsfortschritt „gefestigt“ und die Methode „Variante“ nutzen dieselbe Reife-Funktion; Stapelzahlen zählen `mature`. Die Planungs-RPC liefert `stability_fast` erst mit R5, bis dahin gilt die schnelle Spur als gleich der Stabilität.
- Messung `npm run benchmark:exams` (Median): 60 Tage 669 → 799 ms, 200 Tage 2.054 → 2.680 ms, gemeinsame Stapel 902 → 2.207 ms; längster Block 66 ms. Der Anstieg kommt von den simulierten Lernschritten am ersten Tag.
- Verifiziert: `npm test` (856/856, neu: Reife über dreimal Gut und Rückfall), `npm run typecheck`, `npm run build`.

## 2026-10-29 — Reife aus FSRS (P1 R2): FSRS-7

- `ts-fsrs` 6.0.0 mit FSRS-7 (34 Standardgewichte, zweite Gedächtnisspur `stabilityFast`, gebrochene Tage); der Scheduler baut die Middleware-Kette von `DefaultScheduler` synchron mit dem statisch importierten FSRS-7-Modell, damit Vorschau, Review und Prüfungsplanung synchron bleiben. `stabilityFast` liegt im Lernstand (`study_extra`), `schedulerVersion` ist `fsrs_7_v1`.
- Lernschritte aller Profile 1 und 10 Minuten, Wiederlernen 10 Minuten (ER4); Modellübersteuerung nach FSRS-7-Standard (ER7). Easy Days nutzt `getFuzzRange`. Ein Lernstand ohne schnelle Spur startet beide Spuren gleich; ein Review ohne oder mit zukünftigem Zeitstempel gilt als gerade beantwortet.
- APKG-Import spielt eine vollständige Anki-Historie (ab neuer Karte) mit FSRS-7 ab; Ankis FSRS-6-Gedächtniszustand gilt nur bei abgeschnittener oder fehlender Historie.
- Node 24 in `engines` und CI. Messung `npm run benchmark:exams`: 60 Tage 229 → 669 ms, 200 Tage 821 → 2.054 ms, gemeinsame Stapel 398 → 902 ms (Median), längster Block 60–63 → 64–65 ms.
- Verifiziert: `npm test` (855/855), `npm run typecheck`, `npm run build`.

## 2026-10-29 — Reife aus FSRS (P1 R1): ADR-Bereinigung

- `decisions.md` von 43 auf 20 geltende ADRs: gelöscht 002, 005, 010, 020, 021, 024, 025, 027, 030 (abgelöst) sowie 008, 012, 014, 016, 017, 023, 026, 040 (UI-Detailregeln, gegen Code und Specs abgeglichen); zusammengeführt 001 ← 005/007, 032 ← 021/029/033, 034 ← 020/022/024/025/027/028, 038 ← 004, 041 ← 031; Ergänzungen in ADR-011, ADR-037 und ADR-042 (Stand E1–E16, Teil von K4) eingearbeitet; ADR-015 nennt die tatsächliche Herleitung des Anki-Lernstands.
- Fehlende UI-Regel (Stapelköpfe der Kartenverwaltung) in `specs.md` ergänzt, zwei Spec-Sätze und ein `src/ui/README.md`-Satz an den Code angepasst; Kriterium für neue ADRs in `docs/README.md`; Verweise in Code, Specs, Status, Architektur und TODO umgestellt (Migrationen und `history.md` bleiben unverändert).
- Verifiziert: `npm run docs:build`, `npm run check:docs`, `npm run typecheck`.

## 2026-10-29 — Reife aus FSRS (P1 R0): Neutralisierung und ADR-044

- Beispielketten mit dem Produktions-Scheduler: Bei Zielerinnerung 0,90 erscheint die erste Variante einer stets mit `Gut` bewerteten Karte nach 5725 Tagen (121 XP), mit einem Fehler im Pfad nach 1587 Tagen; Stabilität ≥ 7 Tage entspricht in allen Pfaden etwa drei `Gut` am Stück.
- `specs.md` (14 Aussagen und Hinweis in §5.5), `architecture.md` (3) und `status.md` (2) tragen `Neuplanung P1` und sind dort bis zum Abschluss von P1 nicht bindend.
- ADR-044 „Reife aus FSRS-7-Stabilität statt XP“ als `vorgeschlagen`; ADR-009 und die Lernstufen-Schwelle aus ADR-039 als in Neuplanung markiert.
- Verifiziert: `npm run docs:build`, `npm run check:docs`.

## 2026-10-25 — Prüfungen K8: App-Anbindung und Abnahme (Abschluss K0–K8)

- E12 offline: Heute und Prüfungen zeigen die gespeicherten Tagesziele mit „Offline: zuletzt geplante Aufgaben“, Häkchen und Start bleiben nutzbar; je Aufgabe nennt CoRe lokal vorhandene Karten und den Rest als „erst online verfügbar“; der Sitzungsstart nimmt offline nur lokale Zielkarten (`listLocalCardIds`). Beim Wiederverbinden plant der Hook neu.
- Häkchen erscheinen sofort statt erst nach dem Speichern (die kontrollierte Checkbox sprang vorher zurück; im E2E gefunden).
- Hilfe: Nachschlageabschnitt „So läuft eine Prüfungssitzung“.
- Tests: `balanceExamContacts` (Mengenerhaltung, Spitze vor Schwankung vor Erinnerung, Abbruch auch mitten in der Suche), Bewertungshistorie ab zehn Bewertungen, lokale Kartenliste; gemeinsame Planung (E3) war seit K3 abgedeckt. Neuer E2E-Test gegen die echte App: zweites Gerät desselben Kontos sieht Plan und Häkchen, Offline-Start aus lokalen Karten, Hauptnavigation hält eine ungespeicherte Bearbeitung an. Der bestehende Planungstest griff mit seinem Kartenselektor auch die Kartendetails und ist korrigiert.
- Verifiziert mit lokalem Supabase: volle RLS-Suite (19), alle Prüfungen-Specs (`exam-planning`, `exam-contact-planning`, `exam-topic-order`) grün; `npm run performance:measure:local` (aus K6 offen) mit allen Gates eingehalten. Windows reservierte die Supabase-Ports 54234–54333; die Läufe nutzten dafür lokal um 1000 verschobene Ports ohne Änderung im Repo.
- Die Entscheidungen E1–E16 stehen jetzt als Ergänzung in ADR-042; der Prüfungen-Block ist aus `todo.md` entfernt. Offen bleiben nur Gerätenachweise auf echten Smartphones.

## 2026-10-25 — Prüfungen K7: UI/UX iterativ

- Fehler behoben: Kalenderänderungen (Lernblöcke, Tageszeit, Themenstart) wurden seit Format 3 gegen Version 2 geprüft und immer abgelehnt; `isValidExamCalendar` prüft jetzt im aktuellen Format.
- Tagesdetails zeigen je Fach neue Karten, Themen, Leseaufgaben und die eigene Tageszeit in Minuten; nur eigene Lernblöcke sperren sie. Tag und Woche teilen einen Bearbeitungshorizont (`isExamCalendarDayLocked`). Lernblöcke lassen sich auch ohne Fach reservieren.
- Monat: vergangene Wochen auf eine Zeile verkleinert, im laufenden Monat Folgewochen bis vier Wochen ab heute. Woche: Leseaufgaben mit Themenname; per Touch blockt Antippen eine Stunde, Wischen scrollt (vorher sperrte das Raster jedes Scrollen). Kopfzeilen mobil mit Titel und Navigation in einer Zeile.
- Ganze Minuten in Einrichtung und Kalender, Anzeigen ohne Kommastunden; Einzahl/Mehrzahl („1 neue Karte“, „morgen“, „in 26 Tagen“); Erklärtexte entfernt; Statusmarke nur für pausierte und abgeschlossene Prüfungen; Themenreihenfolge mit Pfeilschaltflächen; einheitliche Aufklapper und Summen bei Oberstapeln in der Stapelauswahl.
- Ziehen der Themenreihenfolge scrollt ab 1280 px den Inhaltsbereich. Ungespeicherte Bearbeitungen und Kalenderentwürfe halten den Wechsel über die Hauptnavigation an.
- Verifiziert: Pflichtmatrix 320/360/390/430/1279/1280/1440 in Hell und Dunkel für Seite, Tagesdetails, Themen, Woche, Prüfungskarte, Bearbeitung, alle Einrichtungsschritte, Leerzustand und Heute mit Top-Bar in einer lokalen Prüfseite (echte Komponenten, Beispieldaten), ohne horizontales Scrollen und Konsolenfehler; Ziehen bei 1440 × 620 (Inhaltsbereich 540 → 872 px) sowie Antippen und Wischen auf emuliertem Pixel 7. Nicht geprüft: echte Geräte, Bildschirmtastatur, 200 % Zoom.

## 2026-10-25 — Prüfungen K6: Performance

- Messskript `npm run benchmark:exams` (5 Läufe, Median, längster zusammenhängender Hauptthread-Abschnitt). Vorher → nachher bei identischen Plänen (Vergleich der vollständigen Prognosen): 60 Tage 428 → 226 ms, 200 Tage 1.231 → 719 ms, gemeinsame Stapel 120 Tage 572 → 339 ms; längster Block 77/107/92 → 62/63/62 ms.
- Maßnahmen: Tauschschritte der Lastverteilung inkrementell bewertet statt die Gesamtlast neu zu summieren; ein gemeinsames Hauptthread-Budget für Planung und Lastverteilung (vorher zwei, daher bis ~100 ms Blöcke) und Budgetprüfung je Iteration sowie alle 16 Simulationsschritte; FSRS-Instanzen je Konfiguration zwischengespeichert (`scheduler.ts`, wirkt app-weit); Zeitzonenversätze je UTC-Viertelstunde zwischengespeichert (`learningDay.ts`, Vergleichstest über Umstellungen in Berlin, St. John's, Lord Howe und Kathmandu).
- E9: Prüfungsseite und eingebettetes Widget teilen eine Planung. Abhaken löst kein Neuplanen aus; nur geänderte Zielkarten zählen. Lernstände bleiben eine Minute für Heute und Prüfungen gemeinsam, eigene Antworten verwerfen sie, „Plan neu berechnen“ lädt frisch. Der Sitzungsstart nutzt gespeicherte Ziele ohne Laden und Planen.
- Verworfen: gröbere Kohorten bekannter Karten brachten in den Messszenarien keinen Gewinn und hätten Ergebnisse nur angenähert. Ein Worker ist bei 63 ms längstem Block nicht nötig.
- Nicht ausgeführt: `npm run performance:measure:local` (kein Docker).

## 2026-10-25 — Prüfungen K5: Zuständigkeiten und Datenpfad

- `workspaceHydrationService.loadExamPlanningData` ersetzt Serverlernstände durch ausstehende Antworten der Outbox (vorher in `App`); die Planung bildet die Bewertungsverteilung selbst aus den geladenen Karten (`ExamHistory`/`history` entfallen). `getExamSummaryTaskDeckId` und `getExamSessionTargetIds` in `examDailyTasks.ts` ersetzen ID-Zerlegung und Sitzungsauswahl in `App`.
- `reviewService.ts` importiert die Prüfungsplanung nicht mehr: Der transiente Sitzungsstapel trägt `Deck.plannedOrder`; dasselbe Merkmal schützt ihn in `App` vor dem Speichern.
- `getLearningTimeZone` (Profil, sonst Browser, sonst UTC) für App, Prüfungsseite und Heute-Widget; das Widget fiel vorher direkt auf UTC.
- Prüfungsseite und Heute speichern die Checkliste über denselben App-Handler, der in den aktuellen Profilstand mischt; vorher schrieb die Prüfungsseite aus dem gerenderten Stand.
- Ungültige Zeitblöcke und Tagesaufgaben fallen beim Lesen einzeln weg. E10: höchstens 5.000 Kartenverweise je Lerntag, der Abgleich kürzt darauf.
- Die Prüfungsseite lädt Lernstände auch für pausierte, abgeschlossene und vergangene Prüfungen; ihr Fortschritt zeigt nicht mehr 0/0.
- Verifiziert: neue Tests für Outbox-Übernahme, einzelnes Verwerfen, Kartenverweis-Grenze, Aufgaben-ID und Sitzungsziele; fokussierte Suiten für Prüfungen, Profil, Lernqueue, Lerntag und Hydrierung.

## 2026-10-25 — Prüfungen auf main, Migrationen angewandt, K4

- #44 (K0/K1) und #45 (K2/K3) per Merge-Commit nach main; PR #42 dadurch als gemergt geführt. `20261024153629_exam_planning_format_2.sql` direkt nach #44 und `20261025192248_exam_planning_format_3.sql` direkt nach #45 mit `supabase db push --linked` auf `CoRe-Database` (`hirbiuiydczmnjqtoyqx`) angewandt, jeweils nach Trockenlauf; beide eingebauten Formatprüfungen grün, `supabase migration list --linked` zeigt beide Migrationen.
- K4: toter Code entfernt (`StudyPlanBlock.priority`, `ExamPlanDay.buffer`, `ExamPlanDay.reviewCount` als Doppel von `reviewCardIds`, nur von Tests gelesene `projectedContacts`/`expectedRecall` samt Erinnerungssumme; Vorschau-Renderer heißt `renderPreview`). ADR-042 nennt seine überholten Teile, Spec ohne „Prognose“ in der Übersicht, Status ohne „lokal erweitert“.

## 2026-10-25 — Prüfungen K3: Entscheidungen umgesetzt

- E3: Prüfungen werden nach Einführungsstichtag geplant; jeder Stapel gehört der ersten Prüfung, die ihn enthält. Jede Karte wird genau einmal eingeführt und erscheint nur in deren Tagesaufgaben; spätere Prüfungen sehen die geplanten Kontakte anteilig ihrer Lernzeit als Grundlast.
- E4: Blöcke ohne Fach sind Notizen ohne Einfluss auf Lernzeit und Verteilung. E7: Leseaufgaben stehen nach Themenbeginn auf Heute, bis sie abgehakt oder alle Karten eingeführt sind. E11: Quizempfehlungen, Quizblöcke, Quizaufgaben und die gesperrte KI-Aktion samt Code entfernt. E13: `excludedDeckIds` mit `getExamDeckIds`/`toggleExamDeckSelection`; neue Unterstapel gehören zur Prüfung. E14: Themenliste zeigt den tatsächlichen Start, der Datumswähler beginnt beim Start des vorherigen Themas. E15: abgehakte Aufgaben bleiben startbar. E16: `getExamStatus` führt Prüfungen ab dem Folgetag als abgeschlossen. E1: Hinweis ab mehr als zwei neuen Karten pro geplanter Minute in Vorschau und Tagesdetails. E5-Rest: Kalenderänderungen speichern ohne Warten auf die Vorschau. Einführungsstichtag mindestens 1 Tag vor der Klausur.
- `getExamPlanningKey` liegt in `examPlanSettings.ts`, berücksichtigt nur eigene Zeitblöcke und ist die einzige Regel für „Plan geändert“, auch in `upsertExamPlan`.
- Profilformat 3 mit Migration `20261025192248_exam_planning_format_3.sql`; beide Migrationen nacheinander gegen PGlite mit Format-1-Daten geprüft (Quiz entfernt, Ausnahme für nicht gewählten Unterstapel, gelöschte und fremde Stapel unberührt, Stichtag 0 wird 1); das Ergebnis besteht `validateExamPlanningSettings`.
- Verifiziert: 62 fokussierte Prüfungs-/Profiltests (neu: gemeinsame Planung, Notizblöcke, Leseaufgaben, Oberstapel-Auswahl, Hinweis zu Tagesmengen, Abschluss nach Termin, Planungsschlüssel je Prüfung), `npm run gate:push`, Sichtprüfung im Katalog bei 320, 390, 1280 und 1440 px hell/dunkel (Monat, Tag, Woche, Editor-Stapelauswahl; kein Quiz-Text, kein horizontales Scrollen, keine Laufzeitfehler). Dabei gefunden und behoben: gemeinsame Themen erhielten die Leseaufgabe doppelt.
- Abschlussaudit mit `audit-last-change`: Stapelbereich je Stapelliste und Prüfungsobjekt zwischengespeichert (vorher je Thema, Aufgabe und Prüfung neu berechnet), `toggleExamDeckSelection` ohne nachträgliche Mutation, toter Zweig für mehrere Prüfungen je Kartenblock entfernt; im Kalender werden tatsächliche Themenstarts einmal je Darstellung ermittelt statt je Thema über alle Prognosetage. Nicht geprüft: lokale DB-Gates und E2E mangels Docker.

## 2026-10-24 — Prüfungen K2: Soll-Ist-Prüfung

- 44 Aussagen aus specs §6.9, den Heute-Abschnitten, `architecture.md` und ADR-042 gegen den Code geprüft: 29 erfüllt, 13 teilweise, 2 Spec-Formulierungen veraltet. Zehn Verhaltensszenarien mit den echten Domänenfunktionen nachgerechnet (Skripte im Sitzungsscratchpad `k2-scenarios/`).
- Bestätigt: gemeinsame Stapel werden je Klausur geplant (262 von 300 Karten an zwei Tagen eingeführt, Tagesaufgaben enthalten fremde Karten); Zeitblöcke ohne Fach ersetzen die Tageszeit und verfallen an freien Tagen; Kommaminuten; ein Block für eine Klausur setzt Ziele anderer zurück; Leseaufgaben verschwinden nach der ersten gelernten Karte; ein ungültiger Zeitblock entfernt alle Blöcke; Fortschritt 0/0 für nicht aktive Prüfungen; Kalenderänderungen ohne fertige Planung nicht speicherbar. Widerlegt: pausierte und abgeschlossene Prüfungen stören die Planung nicht.
- Laufzeit `createExamPortfolioForecast` (5000 neue und 2000 bekannte Karten, 2 Prüfungen): 60 Tage Horizont 292–317 ms, 200 Tage 1404–1597 ms, etwa linear im Horizont.
- Entscheidungen E13–E16 und revidiertes E4 in `todo.md`; alle Abweichungen den Schritten K3–K7 zugeordnet.

## 2026-10-24 — Prüfungen K0/K1: Klausurplaner mit main vereint, Profilformat 2 als Cutover

- K0: PR #42 (`codex/klausurplaner-fsrs-kontakte`) per Merge-Commit auf `claude/pruefungen-integration` mit main zusammengeführt; Konflikte bestanden nur in generierten Docs-Seiten. Roadmap K0–K8 mit Entscheidungen E1–E12 in `todo.md`.
- K1 (E5, E6, E8): Format 2 ist das einzige Profilformat der Prüfungsplanung. Entfernt: Umrechnung aus Format 1, gemeinsame Kapazitätsfelder (`weekdayMinutes`, `weekendMinutes`, `weekdays`, `reserveFraction`, `minimumMinutes`, `dateOverrides`, `weeklyMinutes`), `priority`, `migratedFromSharedTime` samt Hinweis. Lernzeit ist je Klausur Pflicht; global bleiben nur Zeitblöcke. Tageszeiten bearbeitet der Kalender nur mit gewählter Prüfung. Speichern hängt nur an Name, künftigem Termin und Stapeln, nicht mehr an der Vorschau.
- Migration `20261024153629_exam_planning_format_2.sql` stellt Bestände einmalig um (gemeinsame Zeit geteilt auf aktive Prüfungen, Puffer über die Lernwochentage in Kalendertage) und bricht ab, falls danach noch Format 1 vorliegt. Gegen PGlite mit Format-1-Beispieldaten geprüft; das Ergebnis besteht `validateExamPlanningSettings`, andere Profilwerte bleiben unberührt.
- Verifiziert: 61 fokussierte Prüfungs-/Profiltests, neuer Test für Speichern ohne fertige Vorschau, `npm run gate:push`, Sichtprüfung des Tageseditors im Katalog bei 320, 390, 1280 und 1440 px hell/dunkel ohne horizontales Scrollen. Abschlussaudit mit `audit-last-change`: Tageslimit wieder aus `EXAM_PLANNING_LIMITS`. Nicht geprüft: `db:types:check`, `test:rls:local` und lokale E2E mangels Docker; die Migration ändert nur JSONB-Inhalte, kein Schema.

## 2026-10-21 — Themenreihenfolge im Klausurplaner einklappbar und verschiebbar

- Die Themenliste ist standardmäßig geschlossen. Ein Ziehgriff unterstützt Maus und Touch; Hoch/Runter sowie Pfeiltasten bleiben verfügbar. Lange Listen scrollen beim Ziehen automatisch. Loslassen innerhalb der Liste übernimmt die Reihenfolge; Escape, Abbruch und Loslassen außerhalb verwerfen die Geste. Der bestehende Speicherweg für die Themenfolge bleibt erhalten.
- Verifiziert: 21 fokussierte Screen-/Theme-Tests, 20 Browserfälle und eine vollständige Einrichtungsjourney mit Speichern und erneutem Öffnen der Reihenfolge sowie Typecheck, Dokumentationsprüfung und Produktionsbuild. Die tatsächlichen Komponenten wurden in Light/Dark bei 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900 sowie 639/640×900 und dem 200-%-Layoutäquivalent 720×450 geprüft. Screenshot-Sichtprüfung, Maus, Tastatur, simulierter Touch einschließlich Abbruch und automatisches Scrollen bestanden. Katalogquellen und Produktvertrag sind aktualisiert; HTML wurde aus den Quellen erzeugt.
- Abschlussaudit mit `audit-last-change`: den ungenutzten Rückgabewert der Gesten-Abbruchfunktion entfernt. Keine weitere belegbare Vereinfachung oder Performance-Verbesserung gefunden. Die Browserfälle sichern das tatsächliche Sortieren, Abbrechen, Scrollen und Speichern gegen die Produktkomponenten ab.
- Vor Commit und Push erneut bestanden: `npm run gate:push` mit Typecheck, Knip, Dokumentationsprüfung, sämtlichen Unit-/Contract-/Integrationstests aus 121 Dateien, Produktionsbuild und Bundle-Budgets (79 Chunks, Initialgraph 234,6 KiB gzip) sowie alle 20 Sortier-Browserfälle nach dem Audit.
- Nachweise: `C:/Users/noemi/.codex/visualizations/2026/10/20/01a159b1-bf3d-7413-8f0b-02852d4f8ee1/` (`topic-order-visual-qa/`, `topic-order-integration/` und die drei Themen-Kontaktbögen). Echte Touchhardware und nativer Browserzoom bleiben ungeprüft. Die vor dem angeforderten Push erneut ausgeführte Prüfung `npm run performance:measure:local` konnte mangels laufendem Docker Desktop keine Messung starten; dieses zusätzliche Gate bleibt offen.

## 2026-10-21 — Klausurplaner für eigenen Branch vorbereitet

- Der geprüfte Klausurplanerstand liegt auf `codex/klausurplaner-fsrs-kontakte` in einem separaten Arbeitsverzeichnis. Der Hauptcheckout meldet wegen eines leeren Statusordners eines bereits abgeschlossenen Rebase weiterhin einen laufenden Rebase und bleibt unverändert.
- Die Abhängigkeiten wurden für diesen Branch isoliert mit `npm ci` anhand des Lockfiles installiert; die erzeugten Katalogseiten wurden daraus neu gebaut. Die abweichenden Paketversionen des gemeinsam genutzten Hauptcheckouts bleiben erhalten. Der Sitzungstest legt seinen Kartenerzeugungszeitpunkt ausdrücklich fest, damit er auch nach einem Tageswechsel dieselben 600 fälligen Karten prüft.
- `npm run performance:measure:local` wurde vor dem angeforderten Push ausgeführt, brach aber vor der Messung ab, weil Docker Desktop nicht verfügbar ist. Es liegt kein neuer Nachweis aus diesem Performance-Gate vor; die dokumentierten Modellbenchmarks und vorherigen Abnahmen bleiben davon getrennt.

## 2026-10-20 — Klausurplanung nach FSRS-Kontakten und relativer Lernzeit

- Die dynamische Einführung ersetzt feste Abnahmekurven, Antwortzeiten pro Karte und Machbarkeitssperren. Die begrenzte gemeinsame Kontaktsuche erhält die gesamte Neumenge; eigene Lernzeit je Klausur und konkrete Blöcke gewichten die Tage. Themenfolge, ganze/halbe Grenzen, Zusammenfassungsaufgaben, tatsächliche Fälligkeiten und gespeicherte Sitzungsziele sind durchgängig angebunden. Profilformat V2 übernimmt bestehende Zeitvorgaben und Puffer ohne Datenbankmigration.
- Abschlussaudit mit `audit-last-change`: wiederholte lineare Kartensuchen durch lokale Zuordnungsindizes ersetzt und einen durch den Aufgabenfilter unerreichbaren Ersetzungszweig entfernt; der Planungsschlüssel wird einmal je Klausur statt je Themenblock berechnet. Gemeinsame Karten und ihre Prüfungszuordnung sowie das Ersetzen offener Ziele bei Erhalt manueller Erledigung sind gegen den Produktionscode geprüft. Eine reine Abwesenheitsprüfung alter UI-Texte entfällt. Lokaler Benchmark mit 10.000 neuen und 5.000 fälligen Karten in zwei überlappenden Klausuren: Median aus drei Läufen nach Aufwärmen von 620,6 auf 188,9 ms; identischer SHA-256 des vollständigen Planungsergebnisses. Messskript und Rohwerte liegen neben den übrigen Nachweisen unter `exam-audit-benchmark.mjs` und `exam-audit-before.json`/`exam-audit-after.json`. 53 fokussierte Planungs-, Profil-, Checklisten-, Kalender- und Reviewtests bestanden.
- Verifiziert am lokalen Stand 0.2.0: vollständige Unit-/Contract-/Integrationstests aus 121 Dateien, Typecheck einschließlich Knip und Dokumentationsprüfung sowie Produktionsbuild mit Bundle-Budgets (Initialgraph 243,1 KiB gzip). Die Modelltests prüfen unter anderem 1.000 Karten über 90 Tage, 6.000 Karten an einem einzigen Tag, proportionale Zeitskalierung, Lernfenster, den kalendarischen Stichtag vor der Lerntagsgrenze und Sitzungen oberhalb normaler Tageslimits.
- 18 Browserjourneys mit den tatsächlichen Produktkomponenten im lokalen Katalog bestanden: Monat, Woche, Lernstoff, Themenfolge, Lernzeit, Vorschau und Aktivierung. Light/Dark bei 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900, zusätzlich 639/640×900 und ein 200-%-Layoutäquivalent bei 720×450 mit Pixeldichte 2. Screenshot-Sichtprüfung korrigierte schmale Themennamen und überlaufende lange Klausurauswahlen. Weitere 72 isolierte Zustandsansichten derselben Produktkomponenten decken leere Planung, Laden, Ladefehler, fehlende Karten, fehlende Einführungstage und fehlende Zusammenfassungen in der Pflichtmatrix ab; kein horizontaler Seitenüberlauf oder JavaScript-Fehler. Nachweise und ausführbare Proben: `C:/Users/noemi/.codex/visualizations/2026/10/20/01a159b1-bf3d-7413-8f0b-02852d4f8ee1/` (`exam-visual-qa/`, `exam-states/`, Kontaktbögen und `exam-state-results.json`).
- Offen bleiben die echte Smartphone-Bildschirmtastatur, Touchhardware, nativer Browserzoom und ein authentifizierter Cloud-/Review-End-to-End-Smoke. Die laufende angemeldete App wurde geöffnet; der dort angelegte Prüfdraft wurde ohne Speicherung verworfen. Kein Commit, Push oder Release.

## 2026-10-20 — Fächer im Kalenderkopf und getrennte Karten-/Quizplanung

- Die Fachlegende steht in Monat und Woche innerhalb der Kalenderfläche links neben Heute. Karten und Quiz besitzen getrennte farbige Einträge, auch in den Tagesdetails und in Monaten mit sechs Wochenzeilen.
- Wochen-To-dos übertragen Fach und Aufgabenart unabhängig in eigene Zeitblöcke. Die optionale Aufgabenart übersteht die Profilnormalisierung; bestehende Blöcke bleiben gültig. Quizzeit wird nicht zugleich für Karten verplant.
- Abschlussaudit mit `audit-last-change`: einen zusätzlich eingeführten Datumsfilter in den Wochen-To-dos entfernt, damit vorhandene Prognoseaufgaben wie bisher sichtbar bleiben. Keine belegbare Performance-Änderung nötig. Die Tests sichern getrennte Aufgaben, Profilpersistenz, Sechs-Wochen-Monate und das Kartenbudget bei reservierter Quizzeit gegen den Produktcode ab.
- Verifiziert am lokalen Stand 0.2.0: fokussierte Kalender-, Planungs-, Profil- und Theme-Tests, vollständige Unit-/Contract-/Integrationstests aus 121 Dateien, Typecheck, Knip, Dokumentationsprüfung sowie Produktionsbuild mit Bundle-Budgets. Die lokale Katalogdemo prüft die getrennte Auswahl und Zuordnung von Karten und Quiz auf 09–10 Uhr beziehungsweise 10–10:30 Uhr.
- Die Katalogseiten wurden für den Push nach einem isolierten `npm ci` mit den festgeschriebenen Lockfile-Versionen neu erzeugt; die Paketinstallation des gemeinsam genutzten Haupt-Checkouts bleibt erhalten.
- DOM-Geometrieprüfung für Monat und Woche in Light/Dark bei 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900: kein horizontaler Seitenüberlauf, Fachlegende innerhalb der Kalenderfläche, Heute in 44 beziehungsweise 40 px Bedienhöhe. Die laufende App und die echte Katalogkomponente wurden geöffnet. Nachweis: `C:/Users/noemi/.codex/visualizations/2026/10/20/01a15952-4f36-70f1-a64e-4b40f8b60539/calendar-review/verification.json`.
- Visuelle Abnahme bleibt offen: Die Browser-Screenshot-API meldet „Unable to capture screenshot“; daher liegen keine Screenshot-Nachweise vor. Pointer-Ziehen, 200-%-Zoom, Smartphone-Tastatur und Touchhardware wurden nicht abgenommen. DOM-Messungen ersetzen diese Sichtprüfung nicht.
- Vor dem angeforderten Push wurde `npm run performance:measure:local` gestartet; der Lauf endet vor der Messung, weil Docker Desktop nicht installiert ist. Es liegt kein neuer Performance-Nachweis vor.

## 2026-10-18 — Modulladefehler nach Bereitstellungen und falsche Cacheantworten

- Fehlende Assets und API-Pfade sind vom Vercel-SPA-Rewrite ausgenommen; HTML und Service Worker werden revalidiert. JavaScript aus dem App-Shell-Cache wird vor der Verwendung auf erfolgreichen Status und JavaScript-MIME-Typ geprüft. Falsch befüllte Einträge werden umgangen und beim nächsten erfolgreichen Abruf ersetzt. Vite-Ladefehler erscheinen auf Deutsch, ohne Formulare durch einen automatischen Reload zu verwerfen.
- Abschlussaudit mit `audit-last-change`: den unnötigen Cacheversionswechsel entfernt, damit gültige Offline-Dateien erhalten bleiben; den zugehörigen Test auf das tatsächliche Risiko eines Offline-Rückfalls auf HTML ausgerichtet. Keine weiteren belegbaren Vereinfachungen erforderlich.
- Verifiziert mit exakt den Lockfile-Abhängigkeiten aus einem isolierten `npm ci`: 28 fokussierte Tests und vollständiges `npm run gate:push` mit Tests aus 121 Dateien, Typecheck, Knip, Dokumentationsprüfung, Produktionsbuild und Bundle-Budgets. Knip wurde mit `KNIP_DISABLE_RAW_TRANSFER=1` ausgeführt, weil der alternative Parserpfad die Windows-Speichergrenze vermeidet. Initialgraph: 233,8 KiB gzip; größter Lazy-Graph: 170,2 KiB gzip. Die beiden Katalogseiten wurden mit diesem Lockfile-Stand neu erzeugt, nachdem lokal neuere installierte Pakete zu einer CI-Abweichung geführt hatten.
- Zehn Zusammenfassungs-Browserjourneys bestanden, einschließlich des neuen Modulladefehlers unter Erhalt von Titel und Einstellungen. Der Fehlerzustand wurde in 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900 jeweils Light/Dark visuell geprüft. Zusätzlich nativer Chromium-Zoom 200 % in einer isolierten Ansicht der echten Produktkomponente: Hinweis und Aktionen lesbar und erreichbar. Der echte Production-Service-Worker ersetzt vergiftete JavaScript-Cacheeinträge, speichert fehlende Chunks nicht, importiert das Zusammenfassungsmodul und startet nach kontrolliertem Online-Laden auch offline.
- Nachweise, Screenshots und ausführbare Browserprüfungen: `C:/Users/noemi/.codex/tmp/module-load-review-20261018/`. Port 5194 wurde verwendet, weil 5190 belegt war. Smartphone-Tastatur, Touchhardware und ein angemeldeter Live-KI-Aufruf wurden nicht geprüft. Das Docker-Performance-Gate wurde nach Feststellung der fehlenden Docker-/WSL-Installation auf ausdrückliche Nutzerfreigabe ausgelassen.

## 2026-10-18 — Ausgeschriebene Lernaufgaben im Monatskalender

- Die Monatsansicht zeigt neue Karten und Quizempfehlungen ausgeschrieben in Fachfarbe. Die Fachlegende bleibt erhalten; wiederholte Fachnamen und die zusätzliche Zeichenerklärung entfallen. Höhere Tagesfelder mit Umbruch erhalten die Einträge auf schmalen Flächen und in Monaten mit sechs Wochenzeilen. Die mobile Beschriftung nutzt den verfügbaren Platz ohne zusätzlichen Innenabstand.
- Abschlussaudit mit `audit-last-change`: eine fragile HTML-Entfernung samt reinen Abwesenheitsprüfungen im Kalendertest entfernt; Kartenmengen, Quiz-Zuordnung, Fachfarben, zugängliche Namen und Klausurpriorität bleiben geprüft. Keine weiteren belegbaren Vereinfachungen oder Performance-Änderungen erforderlich.
- Verifiziert mit den Lockfile-Abhängigkeiten im isolierten Worktree: 26 fokussierte Kalender-, Screen- und Theme-Tests sowie das vollständige `npm run gate:push` mit Typecheck, Knip, Dokumentationsprüfung, Unit-/Contract-/Integrationstests aus 120 Dateien, Produktionsbuild und Bundle-Budgets. Die generierten HTML-Seiten wurden aus den Katalog-/Markdown-Quellen erzeugt.
- Visuell geprüft am Stand 0.2.0: 64 Kalenderzustände in 320×720, 360×800, 390×844, 430×932, 639×900, 640×900, 1280×720 und 1440×900 jeweils Light/Dark; fünf und sechs Wochen, große Kartenmengen, mehrere Fächer, fehlende Prognose und leerer Kalender. Zusätzlich Prüfungsübersicht und Anlegevorschau in allen sechs Pflichtgrößen und beiden Themes. Kein horizontaler Seitenüberlauf oder abgeschnittener Lernauftrag.
- Alle 18 Browserjourneys bestanden: Übersicht und Anlegevorschau, Tagesdetails einschließlich weiterer Fächer, Fachfilter, Vor-/Zurück/Heute, Monat/Woche, Katalog und verkleinerter effektiver Viewport für 200 % Zoom. Nachweise, ausführbare lokale Prüfdaten, Screenshots und Kontaktbögen: `C:/Users/noemi/.codex/visualizations/2026/10/18/01a15002-9d6a-7803-9800-24a15c55f661/calendar-push-review/`. Port 5196 wurde verwendet, weil 5190 bereits belegt war.
- Performance-Messung auf ausdrücklichen Nutzerwunsch ausgelassen. Echte Smartphone-Tastatur, Touchhardware, nativer Browserzoom und authentifizierte Cloud-End-to-End-Journey bleiben in diesem Kalenderlauf ungeprüft. Zeitgleich entstandene Änderungen an App-Start und Offline-Verhalten sind nicht Teil dieses Kalenderstands.


## 2026-10-18 — Zusammenfassungsbereich in aktuellen Main-Stand übernommen

- Die in `summary-cleanup` geprüfte Anordnung wurde gezielt in den aktuellen Hauptcheckout auf Basis `dcbadbf` übernommen: Suche, vorhandene Fassungen, anschließend zwei vollständige Aktionsflächen. Die KI-Aktion öffnet Stapelauswahl und aufklappbare Einstellungen direkt darunter; eigenes Schreiben beginnt im leeren Editor. Wiederholte Überschriften und erklärende Captions entfallen.
- Die neueren Main-Funktionen bleiben erhalten: kontogebundene Cloud-Speicherung mit Offline- und Konfliktbehandlung, Duplizieren, bestätigtes Löschen und Neuerzeugen unter Erhalt von Zeichnungen und Seitenformat. Die unabhängigen lokalen Änderungen am Prüfungsbereich wurden vor und nach der Übernahme per Dateihash verglichen und blieben unverändert. Gemeinsame Katalog-/Spec-Dateien wurden nur an den Zusammenfassungsabschnitten ergänzt; HTML wurde aus den aktuellen Quellen erzeugt.
- Nachweise und Sicherung des Ausgangsstands: `C:/Users/noemi/.codex/visualizations/2026/10/18/01a15030-e2f0-79d1-be94-f2e44db3cb51/main-integration/`. Prüfgrenzen bleiben echte Smartphone-Tastatur, Touchhardware, angemeldeter Live-KI-Durchlauf und nativer 200-%-Browserzoom. Kein Commit oder Push.

## 2026-10-18 — Kompakte Zusammenfassungsleiste, Seitenformate und Zeichnungen

- Den vorbereiteten Dokumenteditor gezielt auf Main `1f04627` übernommen. Hochformat, Querformat und Infinity, ganze Seiten, automatische Textumbrüche, Stift/Marker/Radierer und eine bildschirmfüllende Arbeitsfläche ergänzen die kompakte Symbolleiste. Cloud-Speicherung, Duplizieren, Löschen und Neuerzeugen des aktuellen Main bleiben erhalten; Neuerzeugen ersetzt den Seitentext und erhält Zeichnungen. Optionale Seiten- und Formatfelder werden im vorhandenen JSON-Dokument validiert, ohne Datenbankänderung.
- Audit: vorhandene Toolbar-Portal-Schnittstelle wiederverwendet, abgelöste Editor-CSS-Regeln entfernt, Zeichnungsplatzierung je Ursprungsraum innerhalb einer Seite wiederverwendet. Keine weiteren belegbaren Vereinfachungen erforderlich. Der zusätzliche Cloud-Vertragstest sichert Seiten und Striche nach Gerätewechsel, Kopie und Konfliktfassung ab. Fokussierte Dokument-, Geometrie-, Rich-Text- und Theme-Tests bestanden. Die vollständige Suite fand zunächst einen numerischen Nullradius; der gleichwertige CSS-Standardwert korrigiert ihn, alle zwölf Theme-Verträge bestehen danach.
- Alle 14 Browserfälle auf der neuen Main-Basis bestanden: eigene und KI-Fassungen, Einstellungen, Entwurfsschutz, Duplizieren/Löschen, Speicherfehler/Fokus, Zeichnen/Radieren/Rückgängig, Seitenumbrüche einschließlich Leerzeilen, Formatwechsel mit Verschieben/Zoom, Speichern/Reload und Neuerzeugen mit erhaltener Zeichnung. 80 Ansichten in den sechs Pflichtviewports 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900 jeweils Light/Dark wurden gerendert und visuell geprüft. Dazu kommen die betroffenen Containerübergänge, Textwerkzeuge und Farbmenü. Belege: `C:/Users/noemi/.codex/visualizations/2026/10/18/01a14f8b-2071-7552-a3a5-fd6322d7daef/push-summary-browser-results/` und `push-summary-contact-1.jpg` bis `push-summary-contact-5.jpg`. Port 5196 wurde verwendet, weil 5190, 5194 und 5195 anderweitig belegt waren.
- Offen: echte Smartphone-Tastatur, Touch-/Stifthardware, nativer 200-%-Browserzoom sowie authentifizierte Cloud-End-to-End-Prüfung. `npm run performance:measure:local` wurde ausgeführt, brach aber vor der Messung ab, weil Docker CLI und Docker Desktop fehlen; das Performance-Gate ist nicht bestanden.

## 2026-10-18 — Lokalen Arbeitsstand mit aktuellem main integriert

- Auf Nutzerwunsch den gesamten lokalen Arbeitsstand auf Basis von `3fafb1a` gesichert und mit `origin/main` (`eb8346c`, 46 neuere Commits) in einem separaten Worktree zusammengeführt. Neuere KI-Verträge, Cloud-Zusammenfassungen, Mindmap-Funktionen und Prüfungsplanung bleiben erhalten. Lokale Ordner-/Exploreransicht, Stapelkennzahlen, Kartentrennung und ruhiger Sitzungskopf sind integriert. `Karten lernen` steht in allen Inhaltsreitern direkt neben der Navigation, auf schmalen Flächen darunter, und startet den aktuellen Stapel samt Unterstapeln.
- Audit: doppelte Merge-Einfügungen entfernt, den inzwischen ersetzten lokalen KI-Helfer nicht parallel zum aktuellen Serververtrag übernommen, memoisierte Stapelzeilen und stabile Callbacks sowie die browserlokale Ansichtswahl erhalten. Ein Dashboard-Test prüft das Ringverbot gezielt in der Tagesübersicht; die Stapelzeilen besitzen wieder ihre lokale Gesamtbestandsanzeige.
- Verifiziert: `npm run gate:push` mit Typecheck, Knip, zwölf Dokumentationstests, synchronen HTML-Ausgaben, sämtlichen Unit-/Contract-/Integrationstests (116 Dateien), Produktionsbuild und Chunk-Budget. Initialgraph 233,7 KiB gzip, größter Lazy-Graph 170,2 KiB gzip.
- Browsernachweis: 169 Viewport-/Theme-Aufnahmen der tatsächlichen Produktkomponenten im Katalog für Stapelinhalte, alle Inhaltsreiter, Lernstart, Lernsitzung, Liste, Ordner/Explorer, Dashboard und Kartenverwaltung; kein horizontaler Überlauf oder JavaScript-Fehler. Pflichtgrößen 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900 in Light/Dark, zusätzliche Übergänge 639/640, 1023/1024 und 1279/1280 sowie 200 % CSS-Zoom. Kontaktbögen wurden visuell geprüft. Nachweise und ausführbare Proben liegen außerhalb des Repositories unter `C:/Users/noemi/Documents/Codex/2026-10-17/dor/work/integrated-visual/`.
- Offen: `npm run performance:measure:local` wurde ausgeführt, konnte ohne laufendes Docker Desktop aber nicht starten. Authentifizierte vollständige Cloud-/Offline-Journey, echte Smartphone-Tastatur, Screenreader und echter Browserzoom wurden in diesem Integrationslauf nicht erneut abgenommen; die bestehenden Freigabegates bleiben bestehen.

## 2026-10-12 — Explorer auf die Ordneransicht begrenzt

- Auf Nutzerwunsch bindet ausschließlich die Ordneransicht von Lernen den Explorer ein. Listenansicht, Kartenverwaltung und sämtliche Stapelinhaltsreiter zeigen weder Navigationsbaum noch `Stapel wechseln`. Der Inhalts-Breadcrumb, Zurück-Navigation, Reiter, Lernaktion und Entwurfsschutz bleiben erhalten.
- Verifiziert: 56 fokussierte Tests für Lernscreen, Stapelinhalte, Stapelbaum und Bibliotheksmodell; Typecheck mit Dokumentationsprüfung; Produktionsbuild mit Chunk-Budget; elf Browserjourneys einschließlich Wechsel Ordner → Liste → Ordner → Stapelinhalte → Kartenverwaltung. Unter Speicherdruck beziehungsweise nach Rechner-Ruhezustand abgebrochene Prüfungen wurden einzeln erfolgreich wiederholt.
- Sichtprüfung der Produktkomponenten: Liste, Ordner mit geschlossenem/geöffnetem Explorer, Kartenverwaltung, Unterstapel, Zusammenfassungs-Leerzustand/Formular/Editor, Mindmap-Leerzustand/Details sowie Karten und Karteneditor. Viewports 320×720, 360×800, 390×844, 430×932, 1023×900, 1024×900, 1279×900, 1280×720, 1280×900 und 1440×900 jeweils Light/Dark; zusätzlich 200 % CSS-Zoom. Nachweise: `C:/Users/noemi/AppData/Local/Temp/core-explorer-folder-only-20261011/` mit 243 Screenshots, Kontaktbögen und Testlogs. Echte Smartphone-Tastatur, Screenreader und echter Browserzoom bleiben ungeprüft, ebenso die zuvor offenen Live-KI-/Cloud-Gates. Kein Commit oder Push.


## 2026-10-18 — Trennlinie und Sitzungskopf der Lernkarten

- Frage und Antwort trennt eine durchgehende 2-px-Linie in der semantischen Rahmenfarbe. Die zusätzliche Linie unter dem Karteninhalt und der permanente AMBOSS-Markierungshinweis entfallen. Die AMBOSS-Aktion bleibt bei Textauswahl erreichbar. Der Stapelname steht ohne separate Kartenposition oder Wiederholungsnummer; Tagesfortschritt und Abschlusszahlen bleiben erhalten. Der nur für diese Kopfzählung verwendete Zustand entfällt.
- Die Katalog-Beispielkarten verwenden den festen Demo-Lerntag als Erstellungsdatum, damit die Lernsitzung unabhängig vom aktuellen Datum Karten zeigt. Die HTML-Seiten werden aus ihren Quellen regeneriert.
- Sichtprüfung am lokalen Arbeitsstand 0.2.0: 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900 jeweils Light/Dark vor und nach Aufdecken. StudyMode als echte Produktkomponente mit lokalen Daten: 24 Screenshots. Die 13 APKG-Referenznotizen der visuellen Pflichtmatrix wurden über den Import übersetzt und im tatsächlichen NoteCardContent in Review/Vorschau bei 390×844 und 1440×900 betrachtet; die Eintippkarte zusätzlich in den übrigen Pflichtgrößen: 240 Screenshots. Weitere Nachweise umfassen Inhaltsansicht, Kartenvorschau, AMBOSS-Textauswahl und 200 % CSS-Zoom.
- Screenshot-Nachweise und lokale Prüfskripte: `C:/Users/noemi/.codex/visualizations/2026/10/17/01a14b96-7893-7972-9faa-8e39e6d5e353/` mit `study/`, `apkg/` und `contacts/`; ergänzende Katalog- und Zoom-Aufnahmen in `test-results/note-presentation/`. Ein generischer Katalog-Matrixlauf wurde unter Speicherdruck durch die gezielte Referenzmatrix ersetzt; ein während Rechner-Ruhezustand abgelaufener Sitzungslauf wurde wiederholt. Echte Smartphone-Tastatur, Screenreader und echter Browserzoom bleiben ungeprüft. Die APKG-Referenz `matrix-cloze-math` zeigt eine unabhängige Formeldiagnose.
- Vor dem Commit wurde der aus `Betogora/BengtsToolBox` installierte Skill `audit-last-change` angewendet: Prüfungen ausschließlich auf entfernte Texte wurden vereinfacht; weitere belegbare Optimierungen waren nicht erforderlich.
- Auf dem aktuellen `origin/main` erneut bestanden: `npm run gate:push` einschließlich Typprüfung, Knip, Dokumentation, sämtlichen Unit-/Contract-/Integrationstests aus 116 Dateien, Produktionsbuild und Bundle-Budgets; zusätzlich neun Browserprüfungen mit der vollständigen gezielten Referenzmatrix. Frische Nachweise liegen im genannten Scratchpad unter `push-results/`, `push-note-presentation/`, `study/` und `apkg/`. Die zusätzliche Prüfung `npm run performance:measure:local` konnte wegen des nicht verfügbaren Docker Desktop nicht starten; sie ist damit nicht bestanden.

## 2026-10-17 — Mindmaps online (W8b); P0 Zusammenfassungen und Mindmaps abgeschlossen

- Migration `20261017181453_learning_mind_maps.sql`: Tabelle `learning_mind_maps` (Zeilen-ID = Stapel-ID) mit Owner-RLS, Fremdschlüssel auf den Stapel und dem Revisionstrigger aus W8a; privater Bucket `learning-mind-map-images` (höchstens 2 MB, nur PNG, JPEG, WebP und GIF) mit Owner-Policies je `<userId>/`. Verify-SQL, generierte Typen und RLS-Smoke erweitert, darunter ein Test für private Mindmap-Bilder.
- `learningMindMaps.ts`: lokale Datenbank `core.learningMindMaps.v2` als Zwischenspeicher und Warteschlange je Stapel; Bilder werden vor der Map hochgeladen und auf anderen Geräten nachgeladen; der zuletzt gespeicherte Stand gewinnt mit Hinweis (I3). Zusammenführen alter Einzel-Maps sowie das Lesen von Zonen und Base64-Bildern entfallen (I2). `cloudLearningDocuments.ts` behandelt ein gleichzeitiges erstes Speichern als Konflikt und kann den Bucket bedienen.
- Nachweis: Unit-Tests mit nachgebildeter Cloud (`tests/support/fakeLearningCloud.ts`, gemeinsam mit den Zusammenfassungen) für neues Gerät mit Bildern, Offline-Warteschlange, letzten Stand und Bildfreigabe online; `npm run test:e2e:local` für `navigation-context.spec.ts` 15/15 samt RLS-Suite und Typdrift (erster Lauf: zwei Kaltstart-Zeitüberschreitungen der ersten Tests beim Übersetzen des Stapelbereichs, zweiter Lauf grün), Katalogsuites 29/29, lokal mit vorübergehend verschobenen Supabase-Ports.
- Hosted: Migration am 2026-10-19 vor dem Push per `supabase db push --linked` auf `hirbiuiydczmnjqtoyqx` angewendet (Trockenlauf zeigte nur diese Migration); `verify_schema_v1.sql` remote ohne Fehler, Remote-Migrationen danach aktuell. Vor dem Push auf die 27 neuen Main-Commits (#28 bis #40) gesetzt: Gate, Katalogsuites 55/55 und `navigation-context.spec.ts` 15/15 lokal grün.

## 2026-10-17 — Zusammenfassungen online (W8a)

- Migration `20261017125735_learning_summaries.sql`: Tabelle `learning_summaries` mit Owner-RLS, Fremdschlüssel auf den eigenen Stapel, Löschmarke `deleted_at` und Trigger, der Revision und Zeitstempel vergibt und Konto, ID und Stapel festhält. Verify-SQL, generierte Typen und RLS-Smoke erweitert.
- `cloudLearningDocuments.ts` schreibt revisionsgeprüft, `learningSummaries.ts` nutzt IndexedDB (`core.learningSummaries.v2`) als Zwischenspeicher und Warteschlange; die v1-Datenbank mit nur lokalen Fassungen wird verworfen (I2). Konflikte ergeben eine `Konfliktfassung von …` (I3), Löschen gilt überall. Panel zeigt `Gespeichert` beziehungsweise `Noch nicht synchronisiert`.
- Entscheidungen I1–I5 vom 2026-10-17 als ADR-043.
- Der Kontobindungs-Test aus W7 meldete Konto A ab und machte damit die gemeinsame Test-Sitzung für spätere Tests ungültig; er läuft jetzt in einem eigenen Browser mit Konto B.
- Nachweis: Unit-Tests mit nachgebildeter Cloud für neues Gerät, Offline-Warteschlange, Löschung und Konflikt; `npm run test:e2e:local` für `navigation-context.spec.ts` 15/15 (darunter zwei Geräte desselben Kontos) samt RLS-Suite und Typdrift, lokal mit vorübergehend verschobenen Supabase-Ports.
- Hosted: Migration am 2026-10-17 vor dem Push per `supabase db push --linked` auf das Projekt `hirbiuiydczmnjqtoyqx` angewendet; `verify_schema_v1.sql` remote ohne Fehler, Remote-Migrationen danach aktuell.

## 2026-10-16 — Testsuite für Lerninhalte (W7)

- Neue App-Verträge `[Vertrag: Lerninhalte]` in `navigation-context.spec.ts` gegen lokales Supabase: Tabs per URL, Entwurfsschutz bei Tab-, Bereichswechsel und Reload samt Verwerfen, KI-Fassung aus dem geladenen Stapelmaterial mit nachgebildeter `/api/ai/summary`, `Neu erzeugen` mit Rückfrage und Abbruch, Kontobindung mit dem lokalen zweiten Testkonto (H1, H2).
- Autospeichern der Mindmap als `createLatestSaver` mit Unit-Test für Änderungen während laufender Speicherung, abgewarteten Bildimport und sichtbare Fehler; das Panel nutzt den Helfer.
- Kaltstart: 90-s-Timeout auch für `learning-summaries.spec.ts`. Ein globales Warm-up entfällt, weil die Katalogseite ihr Bundle inline mitbringt und Vite nichts nachkompiliert.
- Aufgeräumt ohne Vertragsverlust (Pflegevertrag in `test-portfolio.md`): Katalogtests für Entwurfsschutz, Verwerfen und Abbruch gehen in den App-Verträgen auf; Plus-Aktionen, Astverteilung und Linienfarben-Speicherung bleiben über Unit-Tests und die Verknüpfen-/Astfarben-E2E abgedeckt; doppelte Sichtbarkeitsprüfungen entfallen. Testnamen beschreiben Verhalten. Quellcode und Tests zusammen ohne Netto-Zeilenzuwachs (+158/−158).
- Nachweis vom 2026-10-17: `npm run test:e2e:local` für `navigation-context.spec.ts` gegen lokales Supabase 14/14 grün (darunter die drei Lerninhalte-Verträge), RLS-Suite 17/17; Katalogsuites für Mindmaps 24/24 und Zusammenfassungen grün; `npm run gate:push` grün. Lokal waren die Supabase-Ports wegen einer Windows-Portreservierung (54300–54499) für den Lauf vorübergehend auf 553xx umgestellt; `supabase/config.toml` ist unverändert.

## 2026-10-16 — Zusammenfassungen und Mindmap verwalten (W6)

- Geöffnete Zusammenfassungen bieten `Duplizieren` (eigenständige Kopie „Kopie von …“, ungespeicherte Änderungen laufen vorher durch den Entwurfsschutz) und `Löschen` mit Rückfrage; erzeugte Mindmap-Karten bleiben.
- Mindmap: `Fläche leeren` mit Rückfrage entfernt Karten, Verbindungen, Klammern, Umrandungen, Zeichnungen, Bilder und Quellenbezüge; Titel und Linienfarbe bleiben, Rückgängig stellt alles in einem Schritt wieder her.
- Entscheidungen F1–F3 vom 2026-10-16: Löschen endgültig nach Rückfrage, `Fläche leeren` entfernt alles nach Rückfrage, Aktionen nur in der geöffneten Fassung.
- Nachweis: Unit-Tests für Kopie, kontogebundenes Löschen und `clearMindMap`; E2E für Duplizieren mit Speichern-Dialog, Löschen mit Abbrechen und Reload, `Fläche leeren` mit Rückgängig und Reload; Sichtprüfung bei 1440, 768 und 375 px.

## 2026-10-16 — Mindmap-Bilder ausgelagert (W5)

- Bilder liegen als Blob im Store `images` der Mindmap-Datenbank (Version 2) unter ihrem SHA-1; Karten speichern nur Verweise, Kopien teilen ihre Bilder. Anzeige über Objekt-URLs, unbenutzte Bilder werden nach einem Tag beim Öffnen freigegeben.
- Einlesen bis 20 MB, Verkleinerung auf höchstens 1600 px als WebP (Qualität 0,85), gespeichert höchstens 2 MB je Bild; höchstens vier Bilder je Karte und zehn je Map (G3, enger als die geplanten 100).
- Entscheidungen G1 und G2 vom 2026-10-16: alte Data-URL-Bilder werden beim Lesen verworfen statt migriert, eigener Store statt des Kartenmedienspeichers.
- Messung mit 10 Bildern à 700 KB und 200 Karten im Browser: Speichern 132 → 2,4 ms, Prüfen der Map 119 → 0,8 ms, Speicherstand 9,4 MB → 28 KB. Ein 4000 × 3000-JPEG (370 KB) wird in 0,3 s zu 1600 × 1200 WebP (33 KB).
- Nachweis: Unit-Tests für Bildspeicher, Inhaltsgleichheit, Grenzen, Verwerfen alter Bilder und Freigabe; Mindmap-E2E (26) grün, darunter Bilder nach Reload und Bildimport beim Tabwechsel.

## 2026-10-16 — Mindmap: Barrierefreiheit und Touch (W4c)

- Karten sind benannte Gruppen mit einem flächigen Auswahl-Button hinter dem Inhalt; Plus-, Anzeige- und Bildaktionen und der Editor sind keine verschachtelten Bedienelemente mehr.
- Eigene Erkennung für Doppeltippen (bearbeiten) und Langdrücken (wählen und `Hinzufügen`, entschieden als C2), Zwei-Finger-Zoom um den Mittelpunkt; ein zweiter Finger setzt ein laufendes Ziehen zurück. Klammer-Auswahl bei Touch dauerhaft sichtbar.
- Handy-Fläche höchstens 60 % der Bildschirmhöhe, `Vollbild` mit Werkzeugen, Escape beendet es (C1). Klammerbereich per Alt+⇧+↑/↓.
- Nachweis: Unit-Test für den Klammerbereich, E2E mit simulierten Touch-Ereignissen für Doppeltippen, Langdrücken, Zwei-Finger-Zoom und Vollbild. Screenreader und echte Geräte bleiben offene Gerätenachweise.

## 2026-10-15 — Mindmap: Tastatur und Bearbeiten (W4b)

- Zentraler Tastatur-Handler auf der Fläche: Pfeiltasten wechseln zwischen Karten, Alt+Pfeil verschiebt, Escape beendet die Bearbeitung auch aus Textfeldern, dazu Enter/F2, Strg/⌘+Enter, ⇧+Enter, Entf, Strg/⌘+C/V/D/Z/Y/A, +/−/0, ⇧+1 und `?` für eine Kürzelübersicht. Verknüpfen per Enter/Leertaste. Tooltips der Buttons nennen ihr Kürzel, `aria-keyshortcuts` für Screenreader.
- Neuer Button `Duplizieren`; Kastenfarbe und Kastenart wirken auf alle gewählten Karten, `Karte bearbeiten` behält dabei die Mehrfachauswahl; Bilder bleiben eine Einzelkarten-Aktion. Tippen in einer Karte ist ein Rückgängig-Schritt, Historie 100. Größengrenzen werden mit Grenze und aktuellem Wert gemeldet.
- Entscheidungen B1 bis B4 vom 2026-10-15 (B3 als Tooltips plus `?`). Neue Unit-Tests für Navigation, Kopieren/Einfügen und Grenzen; neue E2E-Tests für Kürzel, Verknüpfen per Tastatur und Mehrfachauswahl.

## 2026-10-15 — Mindmap ohne Zonen, Spec auf Verhaltensverträge gekürzt (W4a)

- Zonen samt Schema, Operationen, Darstellung, Eigenschaften, Lösch-Dialog und CSS entfernt; `placeMindMapNode` entfiel, weil es nur Zonen zuordnete. Gespeicherte Maps mit Zonen öffnen weiterhin: `withoutZones` verwirft beim Lesen Zonen, Zonenzuordnungen und Verbindungen zu Zonen; beim nächsten Speichern ist die Map sauber. Mindmaps liegen nur lokal im Browser; eine serverseitige Datenbereinigung war deshalb weder möglich noch nötig.
- Spec 6.10 Mindmap auf Verhaltensverträge gekürzt (ohne Zonen, Layoutdetails und Iterationsgeschichte); E2E-Prüfungen, die nur das Fehlen alter Elemente festhielten, entfernt und Tests nach Verhalten benannt.
- Diff: 14 Dateien, +130/−383 Zeilen. `npm run gate:push` grün, Mindmap-Unit-Tests 49/49.

## 2026-10-15 — Übersetzung Zusammenfassung → Mindmap (W3b)

- Soll-Ist am Live-Smoke-Beispiel (10 Karten): vorher 17 Mindmap-Karten, davon 4 Absätze mit gekürztem Satztitel, ein Meta-Ast `Hinweise zum Material`, keine Querverbindungen, einseitige Spalte von etwa 1.100 × 2.400 px. Mit dem neuen Übersetzer ergibt dieselbe Ausgabe 12 Karten ohne gekürzte Titel und ohne Meta-Ast, Hauptäste links und rechts, etwa 1.400 × 1.450 px.
- Prompt `learning-summary-v3` mit optionalen `relations`, eindeutigen Stichworten und Unterabschnitten nur mit neuen Punkten. Live-Smoke mit Luna (10 Karten): `200`, 2.301 Tokens, 0,0005 USD, 4,6 s; 14 Karten, der Unterabschnitt enthält neue Punkte, beide gelieferten Querbezüge wurden Querverbindungen. Eine Relation lag innerhalb desselben Abschnitts, obwohl der Prompt verschiedene Abschnitte verlangt.
- Übersetzung von 745 Karten (24 Abschnitte à 30 Punkte) in 54 ms.

## 2026-10-15 — Live-Smoke der strukturierten Zusammenfassung (`f0f2903`)

- `/api/ai/summary` lief lokal gegen OpenRouter mit dem Development-Schlüssel aus Vercel; nur die Supabase-Anmeldung war ersetzt. Material: fiktive Biologie-Karten, keine Nutzerdaten. Der Schlüssel lag nur kurzzeitig außerhalb des Repositories und wurde danach gelöscht.
- 10 Notes in Stapel und Unterstapel (Basic, Lückentext, Auswahlkarte), Länge mittel: `200`, `zdr`, 2 Abschnitte, 1 Unterabschnitt, 1 Hinweis, alle 10 Einheiten belegt; 2.220 Tokens, 0,00052 USD, 7,6 s. Die Stapelhierarchie wurde als Gliederung übernommen, Auswahl-Distraktoren nicht als Fakten; die daraus erzeugte Mindmap hat 17 Karten.
- 1.350 Notes (423 KB Anfrage), Länge lang: `200`, `zdr`, 129.411 Tokens, 0,0166 USD, 9,5 s. 2.000 Notes (über 400.000 Zeichen) wurden vor dem Aufruf mit der Grenzmeldung abgewiesen.

## 2026-10-14 — Live-Smoke der KI-Routen nach gemeinsamen Helfern (`39158ab`)

- Beide Route-Handler aus `39158ab` liefen lokal gegen OpenRouter mit dem Development-Schlüssel aus Vercel; nur die Supabase-Anmeldung war ersetzt. Material: fiktive Biologie-Basic-Karten, keine Nutzerdaten. Der Schlüssel lag nur kurzzeitig außerhalb des Repositories und wurde danach gelöscht.
- `/api/ai/card-variant`: `200`, `openai/gpt-6-luna`, 465 Tokens, 0,0000621 USD, 1,7 s.
- `/api/ai/summary`, 12 Notes, Länge mittel (2,8 KB Anfrage): `200`, `zdr`, 3 Abschnitte mit Belegen auf alle 12 Einheiten, 1.807 Tokens, 0,00036 USD, 3,7 s.
- `/api/ai/summary`, 60 Notes in zwei Stapeln, Länge lang (14,2 KB Anfrage): `200`, `zdr`, 5 Abschnitte, 2 Hinweise, 6.083 Tokens, 0,0010 USD, 6,0 s.
- Damit akzeptiert Luna den erzwungenen Zusammenfassungs-Tool-Call mit ZDR und `data_collection: "deny"`. Hochgerechnet kostet eine Zusammenfassung an der heutigen 60.000-Zeichen-Grenze etwa 0,004 USD. Kurzes Material bleibt deutlich unter dem Wortbudget, ohne aufzufüllen. Ein Production-Smoke mit angemeldetem Konto steht aus.

## 2026-10-13 — Mindmap-Integration auf aktuellem main verifiziert

- Die vollständige lokale Mindmap wurde auf `origin/main` (`2716c9c`) zusammengeführt. Die dort bereits aktualisierte Stapelnavigation, Variantenverwaltung, Prüfungsplanung und Datenladewege bleiben erhalten. Die Zusammenfassungsablage und ihr Editor liefern die Quellen für `Aus Zusammenfassung`; bestehende Konto- und Entwurfsgrenzen bleiben wirksam.
- `npm run gate:push` besteht: Typprüfung, Knip, generierte Dokumentation, alle Unit-/Contract-/Integrationstests aus 115 Dateien und Produktionsbuild. Chunk-Budgets: 75 Chunks, Initialgraph 232,6 KiB gzip, größter Lazy-Graph 170,2 KiB gzip.
- Alle 24 Browserabläufe für Mindmaps und Zusammenfassungen bestehen auf dem integrierten Stand. Zusätzliche Sichtprüfung: 121 Aufnahmen aus sechs Pflichtgrößen jeweils Light/Dark sowie einem äquivalenten 720×450-Viewport. Die ursprünglichen 409 Mindmap-/Editor-Aufnahmen bleiben als ergänzende Nachweise erhalten. Der neue Prüfstand liegt außerhalb des Repositories unter `C:/Users/noemi/.codex/visualizations/2026/10/12/01a13126-3cef-73e0-999c-12b5c1200ee8/mindmap-push/`.
- Manuelle Codeprüfung und Diff-Prüfung sind erfolgt. Der vorgeschriebene Skill `audit-last-change` ist in den verfügbaren lokalen Skills nicht vorhanden. `npm run performance:measure:local` konnte nicht starten, weil Docker nicht installiert ist. Am 2026-10-14 hat die Nutzerin Commit und Push nach manueller Codeprüfung ausdrücklich trotz dieser beiden Einschränkungen freigegeben. Die fehlenden Prüfungen gelten weiterhin nicht als bestanden. Echte Smartphone-Bildschirmtastatur, nativer 200-%-Browserzoom und die angemeldete App-Shell bleiben ungeprüft.

## 2026-10-12 — Prüfungsplanung aus `fitzbert` als globaler Bereich (ADR-042)

- Neuer Hauptbereich `Prüfungen` (`/pruefungen`), fünfter Eintrag der Navigation.
  Pläne liegen in `schedulerPreferences.examPlanning` (20 Prüfungen × 200 Stapel).
- Prognose-Engine aus `fitzbert` auf `CardStudySnapshot` portiert: Tagessimulation,
  gemeinsames Budget, Reserve, Puffertage, Priorität, Bewertungsmix (Fehlerquote
  aus den Rollups), Machbarkeit. Geändert nach Entscheidung: Kapitelreihenfolge
  statt Schwierigkeit, immer 100 % Stoff, keine Phasen, kein Zuschlag für
  Auswahlfragen, kein Monatskalender, Zeiten aus `get_account_statistics` statt aus
  lokalen Reviews, Editor als Seite statt Dialog, keine Altlasten.
- Migration `20261012204943_card_study_states_planning_columns.sql`: die
  Lernstandsabfrage liefert zusätzlich `created_at` und `maturity_xp`.
- Heutige Einheit und Blöcke laufen als Lernsitzung über genau die geplanten Karten;
  `Heute` führt bei aktiver Prüfung mit `Heutige Einheit lernen`.
- Performance: Der Sitzungsstart plant nur den heutigen Tag (2.000 Karten: 1,4 s →
  70 ms). Die Prognose berechnet den Beginn eines Prüfungstags einmal je Datum statt
  je Karte und gibt den Hauptthread über `createMainThreadBudget` erst nach 50 ms ab
  statt alle 128 Schritte (2.000 Karten, zwei Prüfungen, 4-ms-Browsertimer:
  1,7 s → 0,4–0,6 s, gleiches Ergebnis). `hydrateCards` lädt fehlende Kartenkörper
  in bis zu vier gleichzeitigen 50er-Anfragen. Eine schlanke Statistikabfrage nur
  für Antwortzeiten bleibt aus: Der Planer fragt einmal je Öffnen, wie die Statistik.
- Nachweise: 14 Engine- und 4 Ablage-Tests, `npm test` grün, `npm run typecheck`,
  `test:rls:local` 17/17, `db:types:generate`, Verify-SQL, Advisors ohne Befund,
  E2E `exam-planning.spec.ts` (Plan anlegen, Einheit lernen, Pausieren, 320 px).
- Pre-Release-Projekt: beide Migrationen am 2026-10-13 angewandt; Verify-SQL und
  Advisors ohne Befund.

## 2026-10-12 — Escape in Dialogen, Stapelkopf-E2E nach der fitzbert-Übernahme

- Escape schließt Dialoge wieder auch ohne Fokus im Dialog (Verlassen-Dialog im
  `batch-resilience.spec.ts`); übergangen wird es nur aus Radix-Poppern wie
  Auswahllisten und Datums-Popovern.
- Der Stapelkopf-E2E folgt der gruppierten Liste: feste Kennzahlspalten (44/52 px),
  in schmalen Gruppen gestapelte Zeilen mit Beschriftung statt Tabellenkopf.
- Der PDF-Smoke scheitert nur im Worktree: Vite verweigert dort den PDF-Worker aus
  dem verlinkten `node_modules` (403).

## 2026-10-12 — Lernstände ganzer Stapel ohne Kartenkörper

- Migration `20261012195419_list_account_card_study_states.sql`: RPC
  `list_account_card_study_states(text[], text, integer)` (SECURITY INVOKER,
  leerer `search_path`, nur `authenticated`) liefert je Karte Lernstand, Status,
  `study_revision` und aktive Variantenzahl, seitenweise nach Karten-ID. Client
  `listAccountCardStudyStates` blättert in Seiten zu 2.000. Grundlage der
  Prüfungsplanung aus `fitzbert` (ADR-034, Ergänzung).
- Nachweise: lokale Migration per `supabase db reset`, `npm run db:types:generate`
  und `db:types:check`, `npm run test:rls:local` 17/17 (Eigentümertrennung der
  neuen RPC), Unit-Test für Seiten, Deduplizierung und Validierung.
- Pre-Release-Projekt: am 2026-10-13 per `supabase db push --linked` angewandt.

## 2026-10-12 — Leerer Cloze-Entwurf nach dem Speichern nicht mehr ungespeichert

- Ursache des fehlschlagenden Cloze-Lebenszyklus (`card-lifecycle.spec.ts`): Nach
  dem Speichern leerte der Batch-Reset die Vorderseite, behielt aber den Typ
  `cloze`. Beim Klick auf `Fertig` meldete das fokussierte Editorfeld beim
  Verlassen den leeren Wert; die Vorderseite leitete daraus wieder `basic` ab,
  und der Entwurf wich vom gemerkten sauberen Stand ab. 0bba802 war nicht der
  Auslöser (Test scheitert auch mit dem vorherigen `RichTextEditor.tsx`).
- Seitdem setzt der Reset eine nicht angeheftete Cloze-Vorderseite auf den
  Standardtyp zurück; angeheftete Lückentexte bleiben `cloze`. Unit-Test in
  `creationBatch.test.ts`; lokal `card-lifecycle.spec.ts` und
  `batch-resilience.spec.ts` grün (17 Tests).

## 2026-10-12 — Release-Gate: Validierung in der Speicherleiste, Boot-Fetch im Test

- Ein leerer Stapelname gilt nicht mehr als fehlgeschlagenes Speichern: Der
  Hinweis steht nur beim Feld, die Speicherleiste bleibt bei
  `Änderungen speichern?`. Der Einstellungs-Guard unterscheidet dafür
  `saved`, `invalid` und `failed`.
- Der einmalige `Failed to fetch` beim Boot stammt aus `auth-js`, das einen
  gescheiterten Fetch selbst loggt; `getCloudWorkspaceUser` behandelt ihn als
  Verbindungsfehler und nutzt die gespeicherte Session. E2E-Tests filtern ihn
  gemeinsam über `tests/e2e/support/browserErrors.ts`.
- `auth.setup.ts` wartet beim Vite-Kaltstart bis zu 30 s auf den Lernen-Bereich.
- Nachweise: `npm run test:e2e:local` mit Setup und den drei betroffenen Tests
  grün (RLS 17/17) auf 086a4bb; nach dem Rebase auf 7ac3a22 `npm run
  typecheck` und die fokussierten Unit-Tests, E2E dort nicht erneut.

## 2026-10-12 — Stapel-UI aus `fitzbert` übernommen (ADR-041)

- Aus dem Arbeitsstand `fitzbert` (Basis vor dem Note/Card-Cutover) übernommen:
  gruppierte Stapelliste, Ordneransicht mit Zweig-Panel, Umschalter
  `Liste`/`Kacheln`, Inhaltskopf mit Pfad, sechs Inhaltstabs mit Start auf
  `Unterstapel` und Tab in der URL. Der Fortschrittsring entfällt überall.
  Nicht übernommen: Explorer-Spalte, Anzahl-Badges und Untertitel, fitzbert-
  Backend und KI-Routen (main gilt). Vorab auf main: drei echte Fixes aus
  `fitzbert` (Entities im Editor, Escape in Portal-Overlays, UTF-8 in der
  Variantenroute).
- Nachweise: `npm run typecheck`, `npm test` (704/704), `npm run build` mit
  Chunk-Budget; Sichtprüfung im UI-Katalog für Heute, Lernen (Liste, Kacheln,
  geöffnetes Zweig-Panel) und Stapelinhalte bei 320–1440 px in Light und Dark,
  ohne horizontalen Überlauf, verglichen mit gerenderten fitzbert-Komponenten.
- Nicht geprüft: `npm run test:e2e:local` (angepasste Specs
  `navigation-context` und `world-capitals-hierarchy`; lokales Supabase lief
  nicht), echte App nach Login, Bildschirmtastatur und 200 % Zoom.

## 2026-10-12 — Production-Smoke der KI-Varianten

- Production (`core-hosted.vercel.app`, E2E-Testaccount): Einschalt-Dialog mit
  vorausgewählter Generierung, Leiste „Varianten generieren 2 von 3“, 3/3
  Varianten `ok` (1,0–1,5 s, je etwa 0,00006 USD); der Production-Key hat
  Budget. Kartenverwaltung zeigt je eine Variante, `Ohne Variante` danach
  `Keine Karten`. `Varianten neu generieren` meldet bei aktuellen Varianten
  „bereits aus der aktuellen Version“ ohne Anfrage.
- Fund: Beim Ersetzen zweier v3-Varianten im 10-Karten-Teststapel lieferte die
  Route zweimal `ok`, beide Ergebnisse wurden aber verworfen; gelöschte
  Formulierungen gelten als Duplikat, standen aber nicht in `avoid`. Seit
  3e346bd nennt `avoid` sie nach den vorhandenen Varianten; erneuter Lauf in
  Production: „2 Varianten neu generiert“, beide inhaltlich korrekt.
- Nicht live geprüft: Marke `Kartenvariante` im Lernen (Varianten erscheinen erst
  ab der Lernstufe des Stapels); Smoke-Stapel danach gelöscht. Lokal belegt sie
  `npm run test:e2e:local` (Variantenfeedback-Vertrag grün; offene Fehlschläge
  anderer Bereiche in der TODO).
- Die visuelle Matrix der Kartenbausteine scheiterte an einer unbehandelten
  `RenderingCancelledException`: `PdfDocumentViewer` kehrte nach dem Abräumen
  zurück, ohne den abgebrochenen Render-Task abzuwarten; seither gibt er ihn an
  den vorhandenen Fehlerpfad weiter, Matrix grün.

## 2026-10-12 — Kartenvarianten gekennzeichnet und filterbar

- Begriffe: Oberfläche spricht von `Variante`/`Kartenvariante` und
  `generieren` statt „KI-Variante“; nur der Datenschutzhinweis nennt das Modell.
- Lernen: Nach dem Aufdecken steht vor den Variantenwerkzeugen die Marke
  `Kartenvariante`; vor dem Aufdecken bleibt die Herkunft verborgen.
- Kartenverwaltung: Spalte `Variante` zeigt die Zahl aktiver Varianten; Filter
  `Ohne Variante` (Sortierung nach Variante, abgeschnitten an der ersten Karte
  mit Variante, ohne Datenbankänderung) und in Stapelinhalten
  `Für diese Karten Varianten generieren`.

## 2026-10-12 — KI-Varianten: Prompt v4, Neu-Generieren und vorhandene Varianten

- Live-Probe mit einem 10-Karten-Teststapel: Prompt v2 lieferte korrekte, aber
  oft nur im Verb geänderte Fragen (3/10 mit anderem Satzanfang); v3 hob das auf
  6/10, kehrte aber einmal die Fragerichtung um (Jahreszeit). Prompt v4 mit
  Beispielen für Zählfragen, Selbstcheck und Reasoning `low`: 20/20 inhaltlich
  korrekt, 4/20 mit gleichem Satzanfang, etwa 0,00006 USD und 1,8 s je Variante.
- Die Anfrage nimmt die Fragen vorhandener Varianten als `avoid` mit; die
  Editoraktion heißt bei vorhandenen Varianten `Weitere KI-Variante erzeugen`.
- Stapeleinstellungen: `Varianten neu generieren` ersetzt Varianten älterer
  Prompt-Versionen nach Rückfrage durch je eine neue.

## 2026-10-12 — Stapelgenerierung für KI-Varianten (Proof of Concept)

- Einschalten des CoRe-Modus im Stapelmenü öffnet einen Dialog mit
  vorausgewählter Option, Varianten für bis zu 50 Karten zu generieren; die
  Stapeleinstellungen bieten `Varianten generieren`.
- Die Generierung nimmt die ersten Karten ohne aktive Variante, lädt sie
  seitenweise gebündelt, erzeugt nacheinander und speichert sofort; sie stoppt
  bei Fehlern, die jede Karte träfen.
- Zweizeilige Leiste über der Navigation mit Stapel-Icon, „Varianten generieren
  X von Y“, Abbrechen und neutralem Balken im Stil des Pomodoro-Fortschritts;
  Auswahl der Varianten per Mockup-Vergleich (Leiste unten, Dialog mit
  Häkchen).

## 2026-10-12 — KI-Varianten über GPT-6 Luna mit ZDR

- Befund: Kostenlose OpenRouter-Endpunkte bieten kein ZDR und verlangen eine
  Trainingserlaubnis; mit `data_collection: "deny"` lieferte die Route nur 404.
- Playtest mit sechs Prüfkarten (Kurzfakt, Definition, Fachbegriff, Formel,
  Englisch, Anweisung im Karteninhalt), je zwei Läufe: Prompt v1 5/12, Prompt v2
  mit Nemotron-3-Super 10/12, GPT-6 Luna 12/12 bei geringerer Abwechslung;
  Gemma war überlastet, drei weitere Free-Modelle lehnten das erzwungene
  Werkzeug ab.
- Route fest auf `openai/gpt-6-luna` ohne Reasoning, mit ZDR und ohne Training;
  gemessen etwa 0,00002 USD je Variante. Prompt `card-variant-v2` hält Sprache,
  Fragerichtung und Formeln fest. Katalog, Free-Filter und Non-ZDR-Warnung
  entfallen; die Logzeile nennt die Kosten.

## 2026-10-12 — Spec ohne Layoutdetails, ehrlichere Speicher- und Syncmeldungen

- `specs.md` beschreibt Verhalten statt Bildschirmposition (rund 1.000 Wörter
  weniger); Layout zeigt der UI-Katalog.
- Karteneditor meldet einen Speicherfehler als „nicht gespeichert“ statt
  fälschlich „lokal gespeichert“.
- Die Speicherleiste meldet fehlgeschlagenes Speichern selbst; der Entwurf
  bleibt.
- Import-Warnungen sind zugeklappt zusammengefasst und aufklappbar.
- `Daten & Synchronisierung` zeigt den letzten Erfolg auch bei ausstehenden oder
  Offline-Änderungen.
- Karteneditor: Varianten zeigen Meldegrund, lassen sich reaktivieren (bis zur
  Höchstzahl) und nach Rückfrage löschen.

## 2026-10-10 — Audit-Lücken: Easy Days, Import, Quellen, Editor, Fokus, Hilfe

- Easy Days rechnet mit der lokalen Kontoprognose statt nur mit den
  Sitzungskarten; in der Sitzung neu geplante Karten wechseln sofort ihren Tag.
- APKG-Analyse lässt sich abbrechen; der nie erreichte Zustand
  `failed_retryable` ist entfernt.
- Quellanhang prüft das Format vor dem Lesen (auch beim Ablegen) und lässt sich
  schließen; ein anderes Bild in der Bildverdeckung verwirft Masken nach
  Rückfrage.
- Lernen pausiert offline mit eigener Meldung und setzt bei Netzrückkehr selbst
  fort. Statistik zählt Karten und nennt `Leicht`.
- Karteneditor: hinzugefügte Felder lassen sich in der Rolle ändern und
  umsortieren.
- Tastaturfokus ist wieder sichtbar, Mausfokus bleibt rahmenlos (ADR-040).
  Hilfe erklärt die Grundidee in einem siebten Schritt.
- knip prüft im Typecheck ungenutzte Exporte, Dateien und Abhängigkeiten; 33
  Reste und die ungenutzte Abhängigkeit `yauzl` sind entfernt. Statistikziel
  175 KiB.

## 2026-10-10 — KI-Variantenroute gehärtet

- OpenRouter erhält die drei beliebtesten passenden Free-Modelle als
  Fallbackkette in einem Aufruf; `reasoning` ist keine Auswahlbedingung mehr.
- Accountweite Free-Limits (Tag, Minute) brechen sofort mit eigener Meldung ab;
  nur Verfügbarkeitsfehler führen einmal in den Non-ZDR-Fallback. Fehler mit
  HTTP 200 werden erkannt.
- Gesamtfrist 25 s für Route und Browser, Katalog-Weiterverwendung bei
  Abruffehlern, lokale JWT-Prüfung über JWKS statt Auth-Roundtrip, eine
  inhaltsfreie Logzeile je Erzeugung, neutrale Meldung bei Schlüsselfehlern.
- OpenRouter-Account geprüft: 11 Credits gekauft, Free-Tageslimit 1.000.

## 2026-10-10 — Kartensuche, Medienbereinigung, Rendering, tote Spalten und Exporte

- Kartensuche: `search_account_card_catalog` liefert die erste Seite aller
  Stapel in einer Abfrage; Blätter-Cursor und Gesamtzahlen gelten je Stapel,
  Suche und Sortierung statt global.
- Medienbereinigung: ungepinnte, hochgeladene Medien werden ab 80 % Quota nach
  letzter Nutzung entfernt; die Prüfung läuft auch nach Offline-Downloads und nie
  parallel.
- Rendering: Stapelbaum- und Kartenzeilen sind memoisiert mit stabilen
  Callbacks; Stapelzähler und Neuübersetzung arbeiten in Scheiben von höchstens
  50 ms.
- Sechs nie gelesene Variantenspalten per Migration entfernt; 96 nur intern
  genutzte Exporte und vier ungenutzte Typen entfernt.
- Beide Migrationen lokal angewandt, RLS-Gate grün (17 Tests). Nach dem Production-Deploy
  von `3feb6cd` (Vercel und CI grün) per `supabase db push` im Pre-Release-Projekt
  `CoRe-Database` angewandt; `verify_schema_v1.sql` gegen das Projekt grün.

## 2026-10-10 — P0-Fehler aus dem App-Audit, Sync- und Bundle-Entlastung

- Importabschluss unterscheidet Teilabschluss (`Import lokal abgeschlossen`) und
  zeigt Reimport-Zahlen; `Fertig` fragt bei ungespeichertem Entwurf nach.
- Unterbrochene Offline-Downloads lassen sich nach Reload fortsetzen; der
  Intervall-Sync startet auch nach einem Offline-Kaltstart.
- Globaler Lernstandard ist eine Kopie: Profiländerungen übernehmen ihn nicht mehr
  still, der Hinweis auf eine neuere Vorlage erscheint. „Als Standardprofil
  verwenden“ meldet nur noch die Auswahl.
- Lern- und Wiederlernschritte außerhalb der Voreinstellungen bleiben sichtbar.
- Demo ohne erfundene Lernhistorie, mit Lade- und Fehlerzustand.
- Karteneditor zeigt gespeicherte Bilder (auch importierte Dateinamen) und fügt
  neue ein; importierte Bildreferenzen werden beim Bearbeiten nicht mehr verworfen.
- Sync ohne Änderungen baut die Oberfläche nicht neu auf. Initialgraph jetzt
  ehrlich inklusive `modulepreload` gemessen: 226,6 KiB gzip.
## 2026-10-13 — Mindmap: automatische Speicherung, direkte Bewegung und freies Schreiben

- Die Namens-/Speicherzeile entfällt. Änderungen speichern nach Eingabepausen automatisch lokal; eine serielle Speicherung übernimmt auch Änderungen während laufender Transaktionen. Fehler erhalten den Entwurf und bieten `Erneut speichern`; Bildvorbereitung und Bereichswechsel behalten ihren Entwurfsschutz.
- Lose Karten aus den oberen Stichwort-/Textfeldaktionen werden beim Verknüpfen als normale Äste angegliedert und übernehmen die Astfarben. Bestehende Unterbäume behalten Inhalt und relative Positionen. Karten lassen sich ohne Bewegungsmodus direkt ziehen; Doppelklick öffnet die Bearbeitung. Escape bleibt innerhalb der Mindmap-Auswahl. Zentrierte Stichworttitel und etwas dunklere Titelstreifen in Textkarten unterscheiden die Kastenarten, jeweils passend zu Light/Dark.
- `Karte bearbeiten` trägt ein Kartensymbol, `Gestalten` einen Stift. Freies Schreiben erzeugt rahmenlosen Flächentext; bei ausgewählter Karte bearbeitet es deren Inhalt. Der zusätzliche Knotenwert `freeText` verwendet dieselben Modell-, Text-, Bewegungs-, Lösch- und Persistenzschnittstellen, gehört aber nicht zur Kartenhierarchie oder einer Zusammenfassungsklammer.
- Alle Textwerkzeuge stehen unmittelbar in einer Leiste, ohne Zusatzmenü. Die freie Text-/Markerfarbeingabe erhält die Textauswahl auch nach Fokuswechsel; der bestehende gemeinsame Editor wird weiterverwendet. `Hinzufügen` enthält Mehrfachauswahl, Zusammenfassung und Umrandung; Unterknoten bleiben über die Karten-Plusaktionen erreichbar. `Aus Zusammenfassung` steht direkt rechts nach Rückgängig/Wiederholen.
- Verifiziert: 49 fokussierte Modell-, Rich-Text- und Screen-Tests; 18 Mindmap-Browserabläufe einschließlich Farben/Reload, Auswahl, Drag, Hierarchie, Bildimport, Speicherfehler und Schreiben während verzögerter Speicherung. Typprüfung, Dokumentationsprüfung und Produktionsbuild mit Chunk-Budgets bestehen. Die eigenständige Produktvorschau öffnet, bearbeitet und speichert mit erfolgreichem Reload. Keine Änderungen an den Kernmodell-/Medien-/Cloud-Schnittstellen.
- Sichtprüfung: 409 Screenshots aus sechs Pflichtgrößen jeweils Light/Dark, einschließlich der vorhandenen Texteditor-Verbraucher in manueller Erstellung, Kartenverwaltung, Zusammenfassungen und Katalog. Freie Farbwerte am Ende der Popover sind erreichbar; Formatierung bleibt erhalten. Zusätzlich ist ein äquivalenter 720×450-Viewport geprüft. Aufnahmen, Kontaktbögen, Proben und Prüfbericht liegen außerhalb des Repositories unter `C:/Users/noemi/.codex/visualizations/2026/10/12/01a13126-3cef-73e0-999c-12b5c1200ee8/mindmap-final-feedback/`.
- Ungeprüft bleiben echte Smartphone-Bildschirmtastatur, nativer Browserzoom bei 200 % und die angemeldete App-Shell mit dem Nutzerkonto. Kein Commit, Push oder Deployment; die Umsetzung bleibt im lokalen Worktree auf `Mindmap`, die ursprüngliche Arbeitskopie auf `main`.

## 2026-10-13 — Mindmap-Rückmeldung: alte Werkzeugzeile und direkte Kartenbearbeitung kombiniert

- Nach ausdrücklicher Freigabe zur lokalen Umsetzung kombiniert die obere Zeile wieder `Stichwort`, `Textfeld`, das ergänzte Slidable-Menü und Rückgängig/Wiederholen. Verknüpfen sitzt direkt im Menü. Position, Elternauswahl und Verbindungsdetails entfallen aus Karte bearbeiten; die Umschaltung zwischen Stichwort- und Textkarte bleibt. Auf schmalen Ansichten scrollt das Menü lokal und hält den aktiven Namen vollständig sichtbar; gewöhnliche Ziele besitzen Bedienhöhe.
- Vorgeschriebene Titel wie `Neue Notiz` werden beim Antippen zur direkten Ersetzung markiert. Die Eingabe verhindert das Zurücksetzen der Markierung durch die native Zeigeraktion; ein Standardtitel auf der geschlossenen Karte öffnet direkt die Bearbeitung, während Mehrfachauswahl und Verknüpfen erhalten bleiben. Titel sind fett, normaler Notiztext bleibt normal.
- Hauptäste beginnen sanft und werden nach außen kräftiger. Die validierte Map-Eigenschaft `connectionColor` speichert graue oder kastenfarbene Hierarchie- und Querverbindungen; ältere Fassungen behalten kastenfarbene Linien. Zusammenfassungsklammern sind rund mit mittigem Anschluss; ihre eigenen Karten bleiben unabhängig von alten Farbwerten neutral. Umrandungen, Bilder und Plusaktionen bleiben erhalten.
- Neue Zonen werden nicht mehr angeboten. Gespeicherte Zonen, zugehörige Inhalte und Referenzen bleiben erhalten und bedienbar; keine Bestandsdaten werden durch die Abwahl gelöscht.
- Verifiziert: 56 fokussierte Modell-, Editor-, Screen- und Theme-Tests; alle 13 Mindmap-Browserabläufe einschließlich direkter Standardtitelersetzung mit Maus und emuliertem Touch, Linienwahl/Reload/Rückgängig, Quellen, Entwurfsschutz, Speicherfehler und verzögertem Bildimport. Typprüfung, Dokumentationsprüfung und Produktionsbuild mit Chunk-Budgets bestehen. Die eigenständige Produktvorschau öffnet, bearbeitet und speichert mit erfolgreichem Reload.
- Sichtprüfung: 229 Screenshots mit echten Produktkomponenten für sechs Pflichtgrößen jeweils hell/dunkel; zusätzlich ein äquivalenter 720×450-Viewport. Geprüft sind Werkzeugzeile und offene Menüs, Standardtitelmarkierung, direkte Bearbeitung, Bilder, freie Farbwahl, Astfarben, runde/neutrale Klammern, Umrandungen und Linienfarben. Aufnahmen, Kontaktbögen, Proben und Prüfbericht liegen außerhalb des Repositories unter `C:/Users/noemi/.codex/visualizations/2026/10/12/01a13126-3cef-73e0-999c-12b5c1200ee8/mindmap-feedback/`.
- Offen bleiben echte Smartphone-Bildschirmtastatur, nativer Browserzoom bei 200 % und die angemeldete App-Shell mit dem Nutzerkonto. Keine Produktfreigabe, kein Commit, Push oder Deployment; der lokale Worktree bleibt auf `Mindmap`, die ursprüngliche Arbeitskopie auf `main`.

## 2026-10-13 — Mindmap: direkte Kartenbearbeitung, Äste und zusätzliche Elemente

- Keyword- und Notiztitel sind fett, unformatierter Notiztext normal. Doppelklick fokussiert die Karte und öffnet die direkte Titel-/Rich-Text-Bearbeitung; dieselbe bestehende Toolbar erscheint oberhalb der Fläche. Stichwortdetails bleiben über ihre Inhaltssymbole zugänglich. CoRe-Vorgaben und freie Farbauswahl gelten für Karten, Stift und Gruppen.
- Geschwister-/Kind-Plusaktionen, getrennte Hierarchie und Querverbindungen sowie Astfarben mit Abstufungen sind umgesetzt. Automatisch platzierte Karten rücken bei wachsender Geometrie kollisionsarm nach; manuell bewegte und ältere Karten bleiben unverändert. Mehrfachauswahl funktioniert per Tastaturmodifikator oder durch Antippen; Pan behält die Auswahl.
- Zusammenfassungsklammern umfassen einen anpassbaren Geschwisterbereich samt Unterbäumen und einem eigenen editierbaren Knoten. Dynamische Umrandungen bieten Form, Beschriftung, Farben, Transparenz und Rahmenstärke. Zonen speichern Containerzuordnung, Größe, Titel, Erscheinungsbild, Klappzustand und Ebenen; sie bewegen und duplizieren ihren Inhalt einschließlich Zeichnungen und Verbindungen. Entfernen erhält standardmäßig den Inhalt; die getrennte bestätigte Aktion löscht Zone und Inhalt. Neue Ebenen und die Zuordnung in überlappenden Zonen bleiben konsistent.
- `Gestalten` enthält Zeichnen, Radieren und Schreiben. Der Entwurfsschutz wartet auf laufende Bildvorbereitung, bevor beim Bereichswechsel gespeichert wird. Inhalte, Formatierung und referenzsichere Änderungen bleiben beim Speichern, Reload sowie Rückgängig/Wiederholen erhalten. Alte freie Verbindungen bleiben erhalten und werden nicht nachträglich als Hierarchie interpretiert.
- Verifiziert: 58 fokussierte Modell-, Rich-Text-, Screen- und Theme-Tests; zwölf Mindmap-Browserabläufe einschließlich Touchsimulation, verzögertem Bildimport, Speicherfehler, Duplikation, Gruppenentfernung und Persistenz; zusätzlich sieben vorhandene Zusammenfassungs-/Lernboard-Journeys. Nach korrigiertem sofortigem Scrollen im Katalog und einem tatsächlichen Linienpunkt im Radierertest bestehen die Abschlussszenarien. Typprüfung, Dokumentationsprüfung und Produktionsbuild mit Chunk-Budgets sind erfolgreich abgeschlossen (65 Chunks; Initialgraph 209,6 KiB gzip, größter Lazy-Graph 170,8 KiB gzip).
- Sichtprüfung: 301 Screenshot-Nachweise und Kontaktbögen aus echten Produktkomponenten. Sechs Pflichtgrößen jeweils Light/Dark für leere/befüllte Fläche, Werkzeugmenüs, direkte Bearbeitung, eigene Bilder, freie Farbwahl, Mehrfachauswahl, Astabstufungen, Klammern, Umrandungen, Zonen, Elternauswahl, Löschdialog und Bildvorbereitung. Die bisherigen Texteditor-Verbraucher in Kartenverwaltung, manueller Erstellung, Zusammenfassungen und Standarddemo bleiben geprüft. Die Screenshots, ausführbaren Proben und `matrix.html` liegen außerhalb des Repositories unter `C:/Users/noemi/.codex/visualizations/2026/10/12/01a13126-3cef-73e0-999c-12b5c1200ee8/mindmap-editor-validation/`.
- Noch nicht verifiziert: echte Smartphone-Bildschirmtastatur, nativer Browserzoom bei 200 % und die angemeldete App-Shell mit dem Nutzerkonto. Direkte Bearbeitung ist zusätzlich im äquivalenten 720×450-Viewport geprüft. Keine Produktfreigabe, kein Commit, Push oder Deployment. Die Arbeit bleibt im isolierten lokalen Worktree auf `Mindmap`; die ursprüngliche Arbeitskopie bleibt auf `main`.

## 2026-10-12 — Lokaler Branch Mindmap: eine Infinity Map je Stapel

- `Mind Map` öffnet direkt eine gemeinsame Infinity Map. Alte einzelne Maps werden atomar nebeneinander zusammengeführt; Quellenmomentaufnahmen bleiben ihren Knoten zugeordnet. Weitere Zusammenfassungen ergänzen dieselbe Fläche. Die initiale Zentrierung erfolgt nach dem Rendern und erfasst auch negative Koordinaten zuverlässig.
- Stichworte zeigen nur Label und vorhandene Text-/Bildsymbole; Texte und Bilder bleiben in den Details. Textfelder zeigen ihre Bilder direkt. Pro Kasten sind vier Rasterbilder bis jeweils 2 MB möglich. Fünf Kasten-/Stiftfarben und drei Strichstärken werden gespeichert und durch Rückgängig/Wiederholen erfasst. Die permanenten Bedien-/Speicher-/Anzahltexte sowie der Unterstapel-Zusatz im gemeinsamen Kopf entfallen.
- Verifiziert: 44 fokussierte Domain-/Screen-/Theme-Tests und acht vollständige Browserjourneys. Ein paralleler Lauf überschritt Zeitlimits; die Abschlussjourneys wurden nach Korrektur der initialen Zentrierung und expliziter Canvas-Positionierung im Katalogtest vollständig erfolgreich wiederholt. Mindmap-Journeys erhalten 60 Sekunden für die umfangreichen Katalogabläufe. Typprüfung, Dokumentationsprüfung, Produktionsbuild und Chunk-Budgets gehören zum Abschlusscheck.
- Sichtprüfung der echten Produktkomponenten mit lokalen Demodaten: leere/befüllte Fläche, Text-/Bildsymbole, Bilder auf Textkarten, Details bis zur letzten Aktion, Stiftoptionen und alle sechs Inhaltsreiter nach Entfernung des Kopfzusatzes. Viewports 320×720, 360×800, 390×844, 430×932, 1280×720 und 1440×900 jeweils Light/Dark. Vier sichtbare Bilder wurden zusätzlich in 320 und 1440 geprüft. 137 Screenshot-Nachweise, Kontaktbögen, ausführbare Proben und `matrix.html` liegen außerhalb des Repositories unter `C:/Users/noemi/.codex/visualizations/2026/10/12/01a13126-3cef-73e0-999c-12b5c1200ee8/mindmap-validation/`.
- Offen bleiben die echte Smartphone-Bildschirmtastatur, nativer Browserzoom bei 200 % (nur der äquivalente CSS-Viewport wurde geprüft) und die angemeldete App-Shell mit dem Nutzerkonto. Keine Produktfreigabe, kein Commit, Push oder Deployment. Die ursprüngliche Arbeitskopie bleibt unverändert auf `main`; die Änderungen liegen im lokalen Worktree `Mindmap`.

## 2026-10-12 — Explorer auf die Ordneransicht begrenzt

- Auf Nutzerwunsch bindet ausschließlich die Ordneransicht von Lernen den Explorer ein. Listenansicht, Kartenverwaltung und sämtliche Stapelinhaltsreiter zeigen weder Navigationsbaum noch `Stapel wechseln`. Der Inhalts-Breadcrumb, Zurück-Navigation, Reiter, Lernaktion und Entwurfsschutz bleiben erhalten.
- Verifiziert: 56 fokussierte Tests für Lernscreen, Stapelinhalte, Stapelbaum und Bibliotheksmodell; Typecheck mit Dokumentationsprüfung; Produktionsbuild mit Chunk-Budget; elf Browserjourneys einschließlich Wechsel Ordner → Liste → Ordner → Stapelinhalte → Kartenverwaltung. Unter Speicherdruck beziehungsweise nach Rechner-Ruhezustand abgebrochene Prüfungen wurden einzeln erfolgreich wiederholt.
- Sichtprüfung der Produktkomponenten: Liste, Ordner mit geschlossenem/geöffnetem Explorer, Kartenverwaltung, Unterstapel, Zusammenfassungs-Leerzustand/Formular/Editor, Mindmap-Leerzustand/Details sowie Karten und Karteneditor. Viewports 320×720, 360×800, 390×844, 430×932, 1023×900, 1024×900, 1279×900, 1280×720, 1280×900 und 1440×900 jeweils Light/Dark; zusätzlich 200 % CSS-Zoom. Nachweise: `C:/Users/noemi/AppData/Local/Temp/core-explorer-folder-only-20261011/` mit 243 Screenshots, Kontaktbögen und Testlogs. Echte Smartphone-Tastatur, Screenreader und echter Browserzoom bleiben ungeprüft, ebenso die zuvor offenen Live-KI-/Cloud-Gates. Kein Commit oder Push.

## 2026-10-11 — Lokale Lernboard-Stände zusammengeführt

- Basis: aktueller Hauptcheckout auf `3fafb1a`; ausgewählte UI- und Inhaltsfunktionen aus dem lokalen Worktree `fitzbert-stapelansichten` auf `e558338` mit seinen Arbeitsänderungen übernommen. Das aktuelle normalisierte Note-/Card-Modell, CoRe An/Aus und die Review-Navigation bleiben maßgeblich. Kein Commit, Push oder Deployment.
- Lernboard mit gruppierter Listenansicht und umschaltbaren Ordnerkacheln; gemeinsamer Explorer. Stapelinhalte verbinden Unterstapel, Zusammenfassungen, Quiz, Mind Map, Karten und Quelle mit URL- und Entwurfsschutz. Zusammenfassungen und Mindmaps besitzen getrennte lokale accountgebundene Speicher. Zusammenfassungsmaterial wird vollständig über Katalogseiten geladen und nach Note dedupliziert.
- Verifiziert: fokussierte Domain-, UI-, Hydrierungs-, Navigations- und API-Vertragstests; komplette Unit-/Contract-/Integration-Suite (109 Dateien); Typecheck, Dokumentationsprüfung, Produktionsbuild und Chunk-Budget. Zehn Browserjourneys für Zusammenfassungen/Mindmaps sowie ein zusätzlicher Lernboard-Wechseltest bestehen. KI-Antworten sind in diesen Journeys simuliert; die Route selbst ist mit Auth-, Origin-, Größen- und Antwortfehlern getestet.
- Sichtprüfung mit echten Produktkomponenten im UI-Katalog: Liste, Ordner, Explorer, Unterstapel, Kartentabelle, Karteneditor, manuelle Erstellung, Dashboard, Zusammenfassungs-Leerzustand/Formular/Editor und Mindmap-Leerzustand/Details. Viewports 320×720, 360×800, 390×844, 430×932, 1023×900, 1024×900, 1279×900, 1280×720, 1280×900 und 1440×900 jeweils Light/Dark. Eine Überlappung der Unterstapel-Kennzahlen bei schmalen Ansichten wurde korrigiert und durch einen Browsertest geschützt. Auch Stapelmenüs, Entwurfsschutzdialog, KI-Fehler, Select und Editor-Farbpopover wurden in dieser Matrix geöffnet; eine über dem Menü liegende Katalog-Vorschau wurde korrigiert. Der authentifizierte lokale Datenbestand wurde im In-App-Browser zusätzlich durch Liste/Ordner und die Inhaltsreiter navigiert.
- Screenshot-Nachweise und ausführbare Prüfproben liegen außerhalb des Repositories im Sitzungsscratchpad `C:/Users/noemi/AppData/Local/Temp/core-consolidate-20261011/` (`screenshots/`, `sheets/` und Testlogs). Die Katalogansichten verwenden ausdrücklich lokale Demodaten; sie ersetzen keine vollständige Produktfreigabe.
- Noch nicht abgenommen: echte Smartphone-Bildschirmtastatur, Screenreader, echter Browserzoom (200 % CSS-Zoom wurde geprüft), vollständige Cloud-/Offline-Journey und ein externer Live-KI-Aufruf. Die bestehenden Produkt- und Betriebsgates bleiben offen.

## 2026-10-10 — CoRe-Modus An/Aus, wirksame Variantenregeln, Aufräumen und Spec-Umbau

- CoRe-Modus auf `An`/`Aus` reduziert (ADR-039). Die Variantenwahl im Review
  berücksichtigt jetzt Modus, Lernstufen-Schwelle und Höchstzahl des Stapels,
  hält die Originalkarte im Wechsel und zeigt in Lern-, Wiederlernphase und
  nach `Nochmal` die Originalkarte. Erzeugen ist bei `Aus` und erreichter
  Höchstzahl gesperrt; das Kartendetail zeigt Lernstufe und aktive Varianten
  auf Deutsch. KI-Ausgabelimit von 256 auf 1.024 Tokens angehoben.
- Entfernt ohne Ersatz: Drei-Wege-Modus, `variantSession`/`?variant=1`,
  `DeckSettings.blacklist`, Rückfall- und Bevorzugungsfelder im Lernstand,
  ungenutzte Variantenleistungs- und Review-View-Model-Felder,
  `libraryModel`-Filter und die ungelesene Heatmap-Berechnung außerhalb des
  Dashboards, `authModel.ts`, `softDeleteEntity`, Kompatibilitätshinweis im
  Kartenrahmen, unerreichbare Import-Jobstatus, tote Dokumentmodell-Zweige,
  ungenutzte CSS-Klassen, das Labs-Bereinigungsskript und das Figma-Skript.
- `specs.md` neu gegliedert (Zwischenüberschriften je Themenblock, Synchronisierung
  als 6.8, Performance als Tabelle) und um Kprim, Vorlesen und AMBOSS-Nachschlagen
  ergänzt; Bildverdeckung gilt nicht mehr als disabled, der Import-Renderer ist
  auf das Übersetzermodell korrigiert. `specs.html` folgt dem Aufbau des
  UI-Katalogs.
- Leerer Lernstart: `Tageslimit erreicht` erscheint, sobald Tageslimits fällige oder neue Karten zurückhalten, und nennt deren Anzahl. Die Spec beschreibt das Vorziehfenster durchgehend als accountweit.
- Build vom 10. Oktober: Initialgraph 208,6 KiB gzip, größter Lazy-Graph
  170,8 KiB gzip (Statistik).

## 2026-10-10 — Roadmap-Dokument aufgelöst

- `todo.md` enthält nur noch die offenen Abnahmen (Gerätenachweise, Korpus mit
  AnKing und echtem Lernstand) und die späteren Roadmaps. Die erledigten
  Phasen stehen hier datiert, die Entscheidungen in ADR-032 bis ADR-038.
- Dauerhafte Inhalte der Roadmap sind an ihren Ort gezogen: die
  Gestaltungsstandards der Kartenflächen nach `specs.md` (Abschnitt
  „Kartenflächen“), Lizenzgrenze und Arbeitsregeln nach `AGENTS.md`, die
  Pflegeregeln der APKG-Matrix nach `test-portfolio.md`. Der Feature-Freeze der
  Roadmap entfällt (Entscheidung des Nutzers).

## 2026-10-10 — Refactoring zum Abschluss der Kartenmodell-Roadmap

- Statistik zeigt „Karten · ausgesetzt · gelöscht“ statt des Altbegriffs
  „Learning Items · suspendiert“.
- Die Begrabregel steht einmal in `siblingBurying.ts`; Queue und lokale Zähler
  nutzen sie, der RLS-Test prüft das SQL für neue und fällige Geschwister.
- `App.tsx` 2.215 → 1.947 Zeilen: Lernfenster, Nachladen und Begraben-Daten in
  `useStudySession.ts` (statt drei kopierter Übernahmeblöcke ein `adopt`),
  Sitzung, Workspace-Start und Cloud-Bootstrap in `useAccountWorkspace.ts`;
  Abmelden, abgelehnte Sitzung und Passwort-Recovery verwerfen den Workspace
  über einen gemeinsamen Weg.
- `indexedDbCoreRepository.ts` 2.062 → 1.718 Zeilen: Schema und
  Datensatzformen in `indexedDbStore.ts`, Tageszähler in
  `indexedDbStudyCounts.ts`, beide privat; die öffentliche Schnittstelle bleibt.
- `main` ist geschützt (Pflicht-Check `quality`), Auto-Merge wartet auf die CI.

## 2026-10-10 — Hosted-Smoke nach Phase 4, 7, 8 und K7.4

- `npm run test:beta:hosted` gegen `https://core-hosted.vercel.app` mit dem
  Production-Deployment von `42d4cbd` (Vercel fertig 10:38 UTC) und der
  angewandten Migration `20261010093049`: 10 von 10 bestanden in 1,5 min.

## 2026-10-10 — Zähler mit Begraben (K7.4)

- Entscheidung des Nutzers: Die Zähler ziehen Geschwister heute beantworteter
  Inhalte ab (wie Ankis Begraben bei der Antwort); das Begraben unter zwei noch
  unbeantworteten Geschwistern bleibt der Queue vorbehalten.
- Lokal: `listDeckSummaries` liest bei vollständigem Katalog die heutigen
  Antworten, deren Geschwister über den Katalogindex `noteId` und zieht
  begrabene neue, fällige und tagesübergreifende Lernkarten von den Tageszahlen
  ab; ohne aktive Option wird nichts zusätzlich gelesen. Der Bestand (Donut)
  bleibt unverändert.
- Server: Die additive Migration `20261010093049_bury_siblings_in_day_counts.sql` ersetzt
  `get_account_bootstrap`; die Übersicht für Geräte mit unvollständigem Katalog
  zieht dieselben Geschwister ab. Lokal und am 2026-10-10 per `supabase db push`
  im Pre-Release-Projekt `CoRe-Database` angewandt; `verify_schema_v1.sql` gegen
  das Projekt grün.
- Nachweise: IndexedDB-Test (Stapel A verliert ein neues Geschwister nur, wenn
  der Stapel der Antwort begräbt), RLS-Test der Bootstrap-Übersicht,
  `test:rls:local` mit Schema-Prüfung und Typdrift, `gate:push`.

## 2026-10-10 — Gesamtabnahme der Kartenmodell-Roadmap (Phase 8)

Technisch abgeschlossen; offen bleiben nur die Gerätenachweise (Phase 3) und die
Korpusabnahme mit AnKing und echtem Lernstand (Phase 5). K7.4 ist inzwischen
umgesetzt (siehe oben).

- **K8.1:** Auf `main` (`d9f9320`) sind `npm test`, `gate:push` und
  `gate:nightly` grün: Quality, RLS 10/10 und 17/17, vollständige lokale
  Browser-Suite 110 bestanden (das Beta-Auth-Artefakt läuft planmäßig separat
  und besteht), APKG-Benchmark. `performance:measure:local` auf identischem Code
  besteht alle Gates.
- **K8.2 Vergleich mit der Ausgangsmessung (K0.1, 2026-10-06):**

  | Speicher je 1.000 Inhalte (MiB) | Postgres vorher → jetzt | Sync | Browser-Kartenkörper | Lernfenster 50 Karten (KiB) |
  | --- | ---: | ---: | ---: | ---: |
  | APKG Basic | 4,87 → 2,90 | 4,66 → 3,36 | 4,35 → 2,03 | 223 → 104 |
  | APKG Basic und umgekehrt | 10,60 → 4,16 | 9,77 → 4,63 | 9,16 → 3,15 | 235 → 81 |
  | APKG Lückentext (4 Lücken) | 23,84 → 7,46 | 23,95 → 7,15 | 22,72 → 4,96 | 291 → 63 |
  | Manuell Basic | 4,46 → 2,28 | 4,07 → 2,62 | 3,77 → 1,93 | 193 → 99 |
  | Manuell Basic und umgekehrt | 9,20 → 3,49 | 8,16 → 3,85 | 7,57 → 3,02 | 194 → 77 |
  | Manuell Lückentext (4 Lücken) | 22,46 → 6,49 | 21,56 → 6,15 | 20,37 → 4,75 | 261 → 61 |

  Postgres enthält jetzt Inhalte, Karten, Katalog und bei APKG die rohen
  Anki-Felder (0,49 bis 0,65 MiB); der Inhalt liegt einmal statt je Karte.

  | Start (p75 / p95) | vorher | jetzt |
  | --- | ---: | ---: |
  | Neues Gerät bis Dashboard | 3.959 / 4.187 ms | 2.574 / 2.618 ms |
  | Wiederkehrender Start | 928 / 954 ms | 490 / 531 ms |
  | Offline-Kaltstart | 677 / 706 ms | 490 / 516 ms |
  | Start ohne Service Worker | 1.435 / 1.456 ms | 1.019 / 1.064 ms |
  | 4G-Preload, längste Aufgabe | 73 ms | 0 ms |
  | Persistierte Stapelzusammenfassung | 18,7 ms | 11,7 ms |

  Datenbank (100k Karten, 1 Mio. Reviews, je fünf Läufe): Statistik-RPC p75
  468 bis 524 ms in vier Läufen dieses Tages (vorher 490 ms), Katalogsuche p75
  95 bis 264 ms (vorher 125 ms). Bei fünf Läufen ist p95 der kalte erste Lauf
  (Statistik 527 bis 963 ms, Suche 106 bis 735 ms) und schwankt mit der
  Rechnerlast; alle Gates bestehen. Ladevolumen: Initialgraph 210,0 KiB gzip
  (3. Oktober 217,5 KiB). APKG-Import mit 25.000 Karten und 1.000 Medien: Median
  4,5 s im Einzellauf und 2,8 s in `gate:nightly` (vorher 10,5 s), Worker-Heap
  141 bis 149 MiB (vorher 425 MiB), längste Main-Thread-Verzögerung 19 bis 28 ms
  (vorher 32 ms).
- **K8.3 Visuelle Pflichtmatrix:** 120 Screenshots von Lernen, Kartenverwaltung,
  Karteneditor, Kartenvorschau, manueller Erstellung, Bildverdeckungs-Editor,
  Importvorschau, Review vor und nach dem Aufdecken und Stapeleinstellungen bei
  320, 360, 390, 430, 1280 und 1440 px, jeweils hell und dunkel; kein
  horizontaler Seitenüberlauf. Zwei Befunde behoben: „Bildverdeckung“ ragte bei
  320 und 390 px aus dem Fragentyp-Schalter (jetzt weicher Trennstrich, unter
  360 px zwei Reihen), „Vorlage mit aktuellen Werten aktualisieren“ war bei
  320 px abgeschnitten (bricht jetzt um). Screenshots lagen nur temporär vor.
- **K8.4:** Die sechs genannten Dokumente beschreiben das Modell `Note`/`Card`;
  das Testportfolio nennt jetzt Bildverdeckung und Begraben im
  Kartenlebenszyklus.

## 2026-10-10 — Startzeit „Neues Gerät bis Dashboard“ unter Budget (Phase 4)

- **Vorladen:** Der Build lädt den Supabase-Client-Chunk per `modulepreload` mit
  dem Einstieg; die Sitzungsprüfung wartet nicht mehr auf den ersten Render.
- **Parallele Sitzungsbestätigung (ADR-038):** Online startet die gespeicherte
  Sitzung Shell und Bootstrap; `getUser()` bestätigt parallel, eine Ablehnung
  verwirft den Start samt Bootstrap-Wiederholungen und zeigt die Anmeldung.
- **Messung** (`performance:measure:local`, je zehn gedrosselte Läufe, p75/p95):

  | Kennzahl | `main` vorher | nur Vorladen | Vorladen und parallel |
  | --- | ---: | ---: | ---: |
  | Neues Gerät bis Dashboard | 2.856 ms | 2.736 ms | 2.574 / 2.618 ms |
  | davon bis Sitzungsprüfung | 2.529 ms | 2.392 ms | 2.176 ms |
  | Wiederkehrender Start | 714 ms | 654 ms | 490 / 531 ms |
  | Offline-Kaltstart | 474 ms | 420 ms | 490 / 516 ms |

  Alle Gates bestehen. Ein Zwischenlauf hatte einen einzelnen 57-ms-Task im
  automatischen 4G-Preload (Grenze 50 ms); die Wiederholung lag bei 0 ms wie die
  Läufe davor.
- **Tests:** Lebenszyklus-Tests für Start ohne Warten, Ablehnung durch den Server
  und Bestätigungsfehler; Unit-Test des Preload-Tags; E2E `auth-gate`,
  `auth-lifecycle`, `auth-resilience` und `first-learning` grün (19/19).

## 2026-10-10 — Begraben von Geschwistern (K7.1–K7.3)

- **K7.1:** `buryNewSiblings`, `buryReviewSiblings` und
  `buryInterdayLearningSiblings` in `LearningSettings`, standardmäßig aus und in
  allen drei Vorlagen aus; sichtbar als Checkboxen unter „Geschwisterkarten
  begraben“ in Lern- und Stapeleinstellungen, gespeichert in Lernprofilen und im
  globalen Standard. Keine Migration: Stapeleinstellungen und Profile sind JSONB.
- **K7.2:** `createDailyReviewQueue` begräbt nach Ankis Reihenfolge (heute
  beantwortet, Lernschritte des Tages, tagesübergreifend und fällig, neu); die
  Optionen der vorher gesehenen Geschwister entscheiden, begrabene Karten
  verbrauchen kein Limit. `loadReviewSession` liefert heute beantwortete Karten
  samt Geschwistern anderer Stapel nur bei aktiver Option, sodass das Begraben
  Reload und Stapelgrenzen übersteht. Die Lernsitzung entfernt begrabene
  Geschwister nach einer Antwort samt Zählern.
- **K7.3:** Scheduler-Tests für ausgeschaltete Optionen (Queue und Fortschritt
  unverändert), Bevorzugung, Tagesgrenze mit Tagesbeginn, Zeitsimulator,
  Unterstapel mit unterschiedlichen Optionen und Limits; Profiltest und
  IndexedDB-Test für das Lernfenster; E2E-Vertrag „Geschwister begraben“.
- **Offen als K7.4:** Stapelzähler und Sitzungsplan berücksichtigen das Begraben
  noch nicht.

## 2026-10-10 — Bildverdeckungs-Editor (K6.5) und Kartenbausteine in den Docs (K6.6)

- **K6.5:** Bildverdeckung ist ein Fragentyp der manuellen Erstellung. Ein Bild
  wird wie Inline-Bilder vorbereitet (Verkleinerung, SHA-1, Upload-Queue);
  `OcclusionEditor` zeichnet Rechtecke, Ellipsen, Polygone und Texte, gruppiert
  Masken zu Karten, setzt Masken auf „bleibt verdeckt“ und wählt den Modus. Maus,
  Stift und Touch teilen Pointer-Events; Masken sind per Tastatur fokussierbar,
  verschiebbar und löschbar. Der Karteneditor bearbeitet eigene Bildverdeckungen
  mit demselben Editor; Gruppennummern werden nie neu vergeben, sodass
  verbleibende Karten ihren Lernstand behalten. Gestaltung per `visual-ab-review`
  entschieden: Variante C (Seitenleiste neben dem Bild) statt Werkzeugleiste.
  Das Bild lässt sich im Karteneditor noch nicht austauschen, weil der Editor
  keine neuen Medien speichert.
- **K6.6:** `card-types.html` heißt „Kartenbausteine“ und zeigt acht Bausteine
  mit echtem Renderer und Erstellungsweg statt sechs Kartentypen.
- **Nachgezogen:** Symbolbuttons sind auf Desktop quadratisch 40 × 40 px (vorher
  44 × 40 durch eine globale Mindestbreite); der Platzhalter von Stapeln ohne
  Unterstapel folgt der Bedienhöhe, sodass Icons bündig bleiben. Die E2E-Verträge
  für Katalogsuche, Kennzahl-Kacheln, Tabellenköpfe und Bedienhöhen erwarten das
  Soft-Minimal-Design.
- **Abnahme Phase 6:** `npm run gate:push` grün; volle lokale E2E-Suite
  (110 Tests) mit anschließend korrigierten Specs vollständig grün, darunter
  Golden-Flows, Kartenlebenszyklus und der neue Vertrag „Bildverdeckung erstellen
  und bearbeiten“; visuelle Matrix für Erstellen und Katalog-Editor bei 320, 390,
  1280 und 1440 px, hell und dunkel.

## 2026-10-09 — Erstellen und Bearbeiten auf dem Inhalt (K6.1–K6.4), Soft-Minimal-Design und neuer UI-Katalog

- **K6.1:** Manuelle Erstellung und Karteneditor teilen die Bausteine
  `NoteBlockControls` (Antwort eintippen; Felder mit Rolle Zusatzfrage, Hinweis,
  Zusatz, Quelle). Gestaltung per `visual-ab-review` entschieden: Variante B
  (Optionszeile, alle Bausteine sichtbar) statt Menü. Zusatzfelder tragen eine
  Rolle statt einer Platzierung; der Editor bietet Lernrichtung, umbenennbare und
  entfernbare Felder. Der Texteditor setzt eine Auswahl als Formel.
  Importierte Inhalte behalten Feldschema und Abfragen.
- **K6.2:** Eine Live-Zeile nennt vor dem Speichern neue und entfallende Karten
  sowie veraltende KI-Umformulierungen; `Karten entfernen?` listet jede
  entfallende Karte mit Abfrage, Stapel und Lernzustand.
- **K6.3:** Das Kartendetail listet die Geschwister des Inhalts und wechselt per
  Klick; der Untertitel nennt die Abfrage (`Lückentext · Lücke 2 von 3`).
- **K6.4:** Geänderter Frage- oder Antworttext markiert aktive KI-Varianten der
  betroffenen Karten als veraltet (`isActive: false`, `meta.outdated: true`);
  `KI-Variante neu erzeugen` ersetzt sie.
- **Design:** Der Stil „Soft Minimal“ (ADR-037) gilt appweit: Manrope in App,
  Kartenfläche und Doku, Bedienhöhe 40 px (44 px bei Touch und unter 768 px),
  schwebende 15-rem-Sidebar ohne Kopfleiste auf Desktop (Variante B der
  Designstudie), randlose Utility-Symbole in einer Reihe. Buttons sind exakt
  bedienhoch; Aussetz-Segment und Fragentyp-Zeile brechen auf schmalen Breiten
  um statt überzulaufen.
- **UI-Katalog:** `ui-elements.html` folgt dem Aufbau des BengtsToolBox-Katalogs
  (Kopf, Kapitelnavigation, Suche; Grundlagen, Primitive, App-Muster,
  CoRe-Fachmuster, Icons, Zustandsmatrix) und enthält weiterhin alle bisherigen
  Demos und Inventare; `card-types.html` nutzt denselben Rahmen.
- **Prüfung:** `npm run gate:push` grün; `check:docs` grün; visuelle Matrix für
  Heute, Lernen, Erstellen, manuelle Erstellung, Kartenverwaltung, Review,
  Statistik, Einstellungen und Hilfe bei 320/390/768/1280/1440 px, hell und
  dunkel bei 390/1440 px gesichtet; lokale E2E-Specs `card-lifecycle`,
  `navigation-context`, `core-stabilization` und `product-surfaces` grün.

## 2026-10-09 — Bildmasken wie in Anki (K5.2) und Image Occlusion Enhanced als CoRe-Masken (K5.10)

- **K5.10:** Der Übersetzer für Image Occlusion Enhanced (Version 2) baut aus
  dem Frage-SVG echte CoRe-Masken: Pixelkoordinaten werden über
  `width`/`height` des SVG auf 0–1 normiert, die Form oder Gruppe mit
  `class="qshape"` ist die Abfrage `io:1`, alle übrigen Formen bleiben mit
  `ordinal` 0 dauerhaft verdeckt und bilden keine eigene Karte (neu im Modell;
  nur mit `alwaysOccluded` gültig). SVGs mit Beschriftungen, Pfaden oder
  Transformationen bleiben eine `overlay`-Maske. `translateAnkiPackage` liest
  dafür die Masken-SVGs vorab und ist asynchron; die Neuübersetzung ohne
  Paketmedien lässt solche Inhalte unverändert. Realer Korpus
  `Image_Occlusion_Test_Pharmagrundlagen.apkg`: 66 von 66 Notizen als
  CoRe-Masken (vorher 66 Overlays), 84 Karten wie bisher, die SVG-Maskenbilder
  werden nicht mehr gespeichert.
- **K5.2:** Ankis Editor und Reviewer (26.9, nur gelesen) zeichnen Rechtecke,
  Ellipsen und Text um `angle` Grad in Bildpixeln um ihre linke obere Ecke,
  ignorieren den Winkel von Polygonen und verschieben deren Punkte auf
  `left`/`top`; die Schriftgröße ist `fs` mal Bildhöhe mal `scale`. Der
  Renderer zeichnet Rechtecke, Ellipsen und Beschriftungen deshalb als HTML in
  einer Ebene in Bildgröße (CSS-Drehung, Schriftgröße in `cqh`), Polygone ohne
  Drehung im SVG; Beschriftungen nutzen wie Anki Arial ab der linken oberen
  Ecke. Das Modell erhält `fontSize` an Textmasken, Polygone verlieren
  `angle`; der native Übersetzer (Version 2) liest `fs` und verschiebt
  Polygone. Sichtvergleich mit `CoRe_Bildverdeckung_nativ.apkg` (2:1-Bild,
  alle Formen, gedreht, Text in zwei Größen, Gruppe) gegen eine Kontur nach
  Ankis Zeichenregeln bei 1280 und 375 px: alle Formen und Beschriftungen
  deckungsgleich. Die Füllfarbe einzelner Masken (`fill`) übernimmt CoRe
  weiterhin nicht.
- Matrixgenerator: native Ellipsen mit `rx`/`ry`, realistische IOE-SVGs im
  Modus `ao` und `oa`, neue Erwartung `occlusion` je Notiz; Matrix neu erzeugt
  und grün.

**Nachweise (lokal, 2026-10-09):** `gate:push` grün, fokussierte Tests
(Übersetzer, Renderer, Inhaltsschema, Neuübersetzung, Matrix) grün,
`report:apkg-corpus` ohne Verluste, `benchmark:apkg` 3,7 s gesamt, 3,35 s
Worker, Spitze 162 MiB, Main-Thread höchstens 20,9 ms. UI-Katalog-Demo hell und
dunkel geprüft. Gemergt als `bcd4b04` (PR #13, CI grün); Hosted-Smoke gegen
Production 10 von 10 grün. Die lokale E2E-Suite lief nicht, weil eine parallele
Sitzung den gemeinsamen lokalen Supabase-Stack nutzte.

## 2026-10-08/09 — Remote-Reset des Pre-Release-Projekts (K4.8)

Nach ausdrücklicher Freigabe des Nutzers im Chat; Projekt-Ref vorher aus
`supabase/.temp/project-ref` angezeigt und gegen die Freigabe geprüft.

- Projekt `CoRe-Database` (`hirbiuiydczmnjqtoyqx`). Vorher: 2 Auth-Konten,
  6 Sitzungen, 213 Objekte in `core-media`, Migration `20260817190000`.
- Storage-Objekte über die Storage-API gelöscht. Das Löschen der Konten über
  die Admin-API scheiterte am alten Schema (HTTP 500), deshalb folgte
  `supabase db reset --linked --no-seed` vor dem Kontolöschen; der Reset
  entfernte die Konten mit.
- Danach: 0 Konten, 0 Sitzungen, 0 Storage-Objekte, alle 15 Tabellen in
  `public` leer, einzige Migration `20261008101057`. `verify_schema_v1.sql`
  gegen das Projekt fehlerfrei; die aus dem Projekt generierten Typen
  entsprechen `src/database.types.ts` bis auf CLI-Metadaten und Formatierung.
- Production (`core-hosted.vercel.app`) läuft auf `d29cc99` und zeigt die
  Anmeldung ohne Konsolenfehler.
- Erster Hosted-Smoke (`npm run test:beta:hosted`, neu registrierter
  Testaccount) gegen `d29cc99`: 9 von 10 grün. „PDF-Auswahl erzeugt nur
  Karteninhalt“ scheiterte am Dialog „Änderungen übernehmen?“: Nach dem
  lokalen Speichern lud die Kartenverwaltung den Inhalt erneut aus der Cloud
  und galt bis zu deren Antwort als ungespeichert; die Antwort konnte zudem
  den älteren Cloud-Stand liefern. `reloadNoteGraph` liest seitdem nach
  lokalen Änderungen nur noch die Replica. Der PDF-Test verzögert die
  Hydrierung um 3 s und scheitert ohne die Korrektur reproduzierbar.
- Zweiter Hosted-Smoke gegen `1f138cd` (PR #10): 9 von 10 grün, der PDF-Test
  jetzt grün. „KI-Basic-Variante … reloadfest gespeichert“ scheiterte in 1 von
  3 Wiederholungen: Die Variante entstand, während der Sync von Stapel, Inhalt
  und Karte lief, und die Sync-Anforderung dazu ging verloren, weil `flush`
  bei laufendem Sync nur den laufenden zurückgab. Der Fehler bestand schon vor
  dem Cutover; die Cloud-Abfrage nach dem Speichern hatte ihn zeitlich
  verdeckt. Seitdem folgt einem Sync, während dessen ein weiterer angefordert
  wurde, ein zweiter Durchlauf, wenn die Outbox noch Mutationen enthält.
  Lokal dazu `test:e2e:local` 108 bestanden, 1 übersprungen, und
  `performance:measure:local` mit allen Gates (neues Gerät p75 2.978 ms,
  Wiederholungsstart 709 ms, offline 490 ms).
- Dritter Hosted-Smoke gegen `2e7527f` (PR #11) am 2026-10-09: 10 von 10 grün.
  K4.8 ist damit abgeschlossen.

## 2026-10-08 — Cutover auf das Kartenmodell `Note`/`Card` (Phase 4, K5.4, K5.7–K5.9)

Umgesetzt auf dem Branch `kartenmodell-cutover`, gemergt mit PR #9
(`d29cc99`, CI grün). Der Remote-Reset (K4.8) folgte am selben Tag.

- **Datenbank (K4.1, K4.3, K4.4):** Die einzige Migration
  `20261008101057_kartenmodell_baseline.sql` ersetzt die Replica-v2-Baseline:
  `notes`, `cards` mit typisierten Lernstandsspalten und eigener
  `study_revision`, `note_type_sources`, `note_sources`, `media_files`,
  `note_media`, Trigramm-Suche über `notes.search_text`, Reviewindex je Karte.
  Katalog, Summaries und Statistikrollups werden über anweisungsbezogene
  Trigger mengenbasiert gepflegt. Neue bzw. umgebaute RPCs: Bootstrap ohne
  Prognose, `get_account_due_forecast`, Katalog mit Gesamtzahl nur auf Anfrage,
  `hydrate_account_cards` nach Karten- und Inhalts-IDs, `load_reimport_targets`,
  `list_retranslation_candidates`, `list_releasable_media`, Stapelbaum-Löschung
  mit verwaisten Inhalten. `verify_schema_v1.sql`, RLS und generierte Typen
  sind neu.
- **Replica, Sync, Medien (K4.5–K4.7):** IndexedDB
  `core.workspace.entities.v4` mit Cursor-Paging; Inhalte und Karten als
  getrennte Mutationen; Medien je Account und SHA-1 mit persistenter Queue und
  Freigabe nicht mehr referenzierter Dateien.
- **App (K4.9):** Review, Vorschau, Kartenverwaltung (Inhaltseditor,
  Geschwisterlöschung mit Undo, Bestätigung entfallender Karten, Markierung am
  Inhalt, entprellte Suche mit Abbruch), manuelle Erstellung und KI-Varianten
  arbeiten auf `Note`/`Card` und rendern über `NoteCardContent`.
- **Import (K5.4, K5.7–K5.9):** Der Worker liest die `File` (`.apkg`, `.colpkg`
  bis 2 GiB), übersetzt mit `translateAnkiPackage` und streamt begrenzte Chunks;
  Medien werden beim Commit einzeln gelesen und SHA-1-geprüft. Reimport über
  Anki-GUID und Kartenidentität, auch gegen Cloud-Ziele. Bericht je Notiztyp in
  Vorschau und Abschluss. Automatische Neuübersetzung unbearbeiteter Importe
  nach Übersetzer-Updates.
- **Altpfad (K4.10) und Tests (K4.11):** `LearningItem`, Kartentypen,
  Notiztyp-Definitionen, `cardPresentation.ts`, `ankiContentModel.ts`,
  `importService.ts`, `StudyCardContent` und die Legacy-APKG-Abbildung sind
  gelöscht; `grep -rnE "LearningItem|CardType|cardPresentation" src scripts api
  tests` findet nichts. E2E-Specs nutzen Matrixpakete; der Generator und die
  `import-quality`-Fixtures sind entfernt.
- **Während der Umsetzung gefundene und behobene Fehler:** endlos wiederholte
  Medien-Queue-Einträge ohne lokale Datei; Neuübersetzung verlor `anki-N`-Karten
  statt sie umzuschlüsseln; Konfliktkarten über das gezielte Lernfenster
  lernbar; lokal erstellte Inhalte vor dem Sync nicht im Editor zu öffnen;
  ungesendete Varianten beim Hydrieren gelöscht; veraltete Kartenzeilen nach
  Bearbeiten/Aussetzen/Markieren; Vorschau verwarf die Auswahl vor
  `Antwort prüfen`; Fokusziel und Fokuswechsel im Review.

**Nachweise (lokal, 2026-10-08):**

- `npm run gate:push` grün (644 Modultests, Typecheck, Build, Chunk-Budget
  209,2 KiB gzip Initialgraph), `db:types:check` grün, `test:rls:local` 17/17
  einschließlich Zwei-Geräte-Test für Review und Inhaltskorrektur,
  `npm run test:e2e:local` 108 bestanden, 1 übersprungen (im Beta-Schritt
  bestanden), `docs:build`/`check:docs` grün.
- **Speicher je 1.000 Inhalte** (`npm run measure:footprint`, MiB; Postgres
  umfasst `notes`, `cards`, `card_catalog`, `note_sources`,
  `note_type_sources`):

  | Szenario | Karten | Postgres | Sync | Browser | Lernfenster 50 Karten |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | APKG Basic | 1.000 | 2,90 (vorher 4,87) | 3,36 (4,66) | 2,03 (4,35) | 104 KiB (223) |
  | APKG Basic und umgekehrt | 2.000 | 4,16 (10,60) | 4,63 (9,77) | 3,15 (9,16) | 81 KiB (235) |
  | APKG Lückentext (4 Lücken) | 4.000 | 7,46 (23,84) | 7,14 (23,95) | 4,96 (22,72) | 63 KiB (291) |
  | Manuell Basic | 1.000 | 2,28 (4,46) | 2,62 (4,07) | 1,93 (3,77) | 99 KiB (193) |
  | Manuell Basic und umgekehrt | 2.000 | 3,49 (9,20) | 3,85 (8,16) | 3,02 (7,57) | 77 KiB (194) |
  | Manuell Lückentext (4 Lücken) | 4.000 | 6,49 (22,46) | 6,15 (21,56) | 4,75 (20,37) | 61 KiB (261) |

- **Startzeiten** (`npm run performance:measure:local`, zweiter Lauf, p75/p95):
  Wiederholungsstart 634/656 ms (Ausgangsmessung 928/954), Offline-Kaltstart
  465/593 ms (677/706), ohne Service Worker 1.284/1.292 ms (1.435/1.456),
  neues Gerät bis Dashboard 2.883/3.003 ms (3.959/4.187), 4G-Preload
  1.216/1.399 ms ohne Hintergrund-Long-Tasks, persistierte Summary p75 8,9 ms.
  Alle Gates eingehalten. Der erste Lauf desselben Stands lag beim neuen Gerät
  bei p75 3.023 ms (knapp über Budget, nicht schlechter als K3.7 mit 3.035 ms)
  und hatte einen einzelnen Offline-Ausreißer (852 ms bei sonst höchstens
  550 ms); der Wert schwankt um das Budget.
- **Phasenaufschlüsselung „Neues Gerät bis Dashboard“** (K4.2, p75 zweiter
  Lauf): Netz, Bundle und Anmeldung bis zur Sitzungsprüfung 2.576 ms,
  Bootstrap-RPC 350 ms, IndexedDB-Schreiben 15 ms, erste Stapelzusammenfassung
  8 ms, Rendern 2 ms. Die Datenbank ist damit nicht der Engpass.
- **Datenbank** (`supabase/benchmark_replica_v2.sql`, 100k Inhalte/Karten,
  1 Mio. Reviews, p75/p95): Statistik-RPC 453/465 ms (Ausgangsmessung 490/522),
  Katalogsuche über den Inhaltstext 163/169 ms (125/295; K3.7 mit der alten
  Vorschauprojektion 42/75), Bootstrap 8/35 ms, atomarer Review 4/27 ms,
  Import-Schreibbatch mit 250 Inhalten und Karten 86/117 ms,
  Clientprojektion höchstens 9,6 ms.
- **K4.2 Projektionen:** Erste Kartenseite über `card_catalog` 1,8/10,1 ms
  gegenüber 165/194 ms direkt über `cards` und `notes`; Stapelzähler aus
  `deck_study_summaries` 0,1/0,2 ms gegenüber 30/37 ms direkter Aggregation.
  Beide Projektionen bleiben (ADR-034, Ergänzung).
- **APKG-Benchmark** (`npm run benchmark:apkg`, 25.000 Karten, 1.000 Medien,
  ohne Parallel-Last): 3,7 s gesamt, 3,3 s Worker, Spitze 161 MiB
  (Ausgangsmessung 10,2 s Worker, 425 MiB Heap), Main-Thread höchstens 16,6 ms,
  Ergebnisübergabe 0 ms.
- **Visuelle Pflichtmatrix** (320, 360, 390, 430, 1280, 1440 px; 390 und
  1440 px zusätzlich dunkel): Review Frage/Antwort, Kartenverwaltung mit
  Inhaltseditor, Vorschau Vorder-/Rückseite, manuelle Erstellung und
  APKG-Importvorschau mit Notiztyp-Bericht und Beispielkarten per Screenshot
  geprüft, ohne Befund aus dem Cutover. Vorbestehend und unverändert: Die
  Beschriftung „Aussetzen“ in den Lernstandsaktionen wird bei 320 und 360 px
  gekürzt; der Hinweis auf fehlende Medien steht in der Importvorschau
  zusätzlich in der Warnungsliste.

## 2026-10-08 — Korpus: echte Bildverdeckung und echter Lernstand

- `Image_Occlusion_Test_Pharmagrundlagen.apkg` (73 Inhalte, 84 Karten): 66
  Image-Occlusion-Enhanced-Inhalte zu 100 % voll übersetzt, sieben Lückentexte
  generisch, 0 % nicht darstellbar, keine fehlenden Medien. Die SVG-Masken
  bestehen ausschließlich aus ungedrehten Rechtecken ohne Text, in beiden
  Modi (`ao`, `oa`). Damit ist entschieden, IOE in echte CoRe-Masken zu
  übersetzen (K5.10, Ergänzung zu ADR-033). Ankis eingebaute Bildverdeckung
  enthält das Paket nicht; es hat keinen Lernstand.
- `Pokemon_Gen_I_Auszug.apkg`: mit Ankis Python-Bibliothek 26.5 auf 40 von
  151 Inhalten gekürzt (16 statt 60 MB), bevorzugt Karten mit Vergessen und
  Wiederlernen. Alle 40 Karten übernehmen den FSRS-Gedächtniszustand, alle
  116 Reviewereignisse (Lernen, Wiederholung, Wiederlernen über 7,7 Tage)
  werden ohne Auslassung übernommen. Alle Karten stehen in der Wiederholung;
  Lern-, ausgesetzte, begrabene und geflaggte Karten fehlen.
- `CoRe_Bildverdeckung_nativ.apkg`: mit Ankis Python-Bibliothek im
  Speicherformat des Anki-Editors erzeugt (aus Ankis Editor-Code 26.9
  abgelesen), weil die Desktop-Steuerung nicht verfügbar war. Zwei Inhalte mit
  je sieben Karten auf dem 2:1-Raster: ungedrehtes und gedrehtes Rechteck,
  gedrehte Ellipse (`rx`/`ry`), gedrehtes Polygon, Text in zwei Größen (einmal
  gedreht), eine Zweiergruppe mit eigener Füllfarbe; einmal „alle verdecken“,
  einmal „eine verdecken“. Anki nimmt beide Inhalte an; CoRe übersetzt sie zu
  100 % voll. Drehung und Textgröße prüft K5.2.

## 2026-10-08 — Phase-3-Performance-Abnahme (K3.7)

- `npm run performance:measure:local` lief erstmals seit Phase 3 vollständig:
  Startmessung einschließlich 4G-Preload, 100k-/1m-Statistikbenchmark und
  Grenzwertprüfung. Das 4G-Szenario, an dem der Phase-3-Lauf nach zehn Minuten
  abbrach, lief durch. Benchmark und Speichermessung lesen den Datenbankcontainer
  jetzt aus der `project_id` in `supabase/config.toml` statt aus dem
  Ordnernamen, damit sie auch in Worktrees laufen.
- Messwerte (p75/p95): Wiederholungsstart 665/703 ms, Offline-Kaltstart
  513/556 ms, ohne Service Worker 1.259/1.335 ms, 4G-Preload 1.315/1.347 ms,
  persistierte Summary p75 13,5 ms, keine Hintergrund-Long-Tasks;
  Statistik-RPC 462/466 ms, 100k-Kartensuche 42/75 ms, Clientprojektion
  höchstens 4,6 ms p95; Initialgraph 218,1 KiB gzip.
- Einziger überschrittener Grenzwert: „Neues Gerät bis Dashboard“ p75
  3.035 ms gegen 3.000 ms (Ausgangsmessung 3.959 ms). Die Überschreitung war
  bekannt und bleibt in der Phase-4-Abnahme geführt; die Grenzwerte sind
  unverändert.

## 2026-10-08 — Lokale Playwright-Suite wieder grün

- Ursache der hängenden APKG-Importe und der Synchronisierungskonflikte: Eine
  Folgeänderung an einem noch nicht gesendeten Insert (etwa die globalen
  Lernstandards direkt nach dem Import) ersetzte ihn in der Outbox als Update
  mit Basisrevision 1; die Cloud meldete `missing`, die Karten scheiterten am
  Stapel-Fremdschlüssel. Die Outbox hält solche Ersetzungen jetzt als Insert.
  Ging nur die Antwort auf einen Insert verloren (Reload während des Syncs),
  übernimmt die Cloud die Folgeänderung als Update, sofern dasselbe Gerät die
  Zeile zuletzt geschrieben hat.
- Weitere Produktkorrekturen: Die Dashboard-Überschrift trägt als zugänglichen
  Namen wieder die vollständige Begrüßung; eingefügte Bilder gehen nicht mehr
  verloren, wenn ein anderes Feld beim Einfügen den Fokus abgibt; nach dem
  Speichern landet der Fokus im ersten freien Pflichtfeld statt im
  Datei-Input der Toolbar; verpixelter Hilfetext bricht wie der lesbare um;
  der Heatmap-Kopf wechselt ab 37 rem nur noch einmal, weil 36 rem in der
  Breitendelle des größeren Innenabstands ab 640 px lag.
- Rund 30 Playwright-Tests in sieben Specs wurden an spec-gedeckte UI-Änderungen seit dem
  2026-08-18 angepasst (Stapelinhalte statt Review per Zeilenklick,
  Heatmap-Dropdown, getrennte Lerneinstellungen, Bereichstoasts,
  Platzhalter-Tabs, Einrückung 8 px, kürzbare Spaltentitel, Navigationshelfer).
- Abgenommen: `npm run gate:push` (Typecheck mit Doku-Prüfung, 108
  Testdateien, Build und Chunk-Budget), `npm run test:e2e:local` mit 15/15
  RLS-/Zwei-Geräte-Fällen, 108 bestandenen und einem erwartbar übersprungenen
  Playwright-Test sowie dem Beta-Auth-Artefakt, die Startmessung aus
  `performance:measure:local` (Wiederholungsstart p75/p95 731/775 ms,
  Offline-Kaltstart 518/542 ms, Frischstart p75 3.063 ms). Der anschließende
  Statistikbenchmark lief im Worktree nicht, weil er den Containernamen aus dem
  Verzeichnisnamen ableitet. Visuell geprüft wurden Heatmap-Kopf in Dashboard
  und Statistik, verpixelte Hilfekarte und Begrüßung bei 320 bis 1.440 px in
  Light und Dark.

## 2026-10-07 — Entscheidungen vor dem Cutover: Marker, Kprim, Bildbeschreibung

- Marker (Entscheidung 1A): Farbige `background-color`-Marker im Feld-HTML
  ändern ihre Helligkeit, bis die Kartenschrift des Themes darauf 4,5 : 1
  erreicht (Dark Mode dunkler, Light Mode heller). Der Korpus zeigte kaum echte
  Marker, aber eingefügte Webfarben: 100-mal weiße Tailwind-Schrift
  `rgb(255 255 255/var(--tw-text-opacity))` in Ankizin, die der Farbparser wegen
  `var(…)` nicht las und im Light Mode unsichtbar ließ, dazu graue und weiße
  Seitenhintergründe. `var(…)` gilt jetzt als deckend; farblose Hintergründe
  entfallen, unlesbare farblose Textfarben übernehmen die Kartenschrift.
  Visuell in Light und Dark mit Marker, Webkopie und Ankizin-Textfarben geprüft.
- Kprim (wie vorgeschlagen): Nach dem Prüfen nennt die Rückmeldung „3 von 4
  Aussagen richtig“; die Bewertung Nochmal/Schwer/Gut/Einfach bleibt manuell.
- Bildbeschreibung (Entscheidung 3A): Das Bild einer Bildverdeckung trägt den
  ersten Fragetext, etwa „Herzklappen – Bild mit verdeckten Bereichen“.
- Neuübersetzung (K5.4): Der Importgraph liefert zusätzlich `noteSources`, die
  rohen Anki-Feldwerte je Inhalt. Ohne sie wäre keine Neuübersetzung möglich,
  weil Übersetzer Felder wie Antwortmaske, Optionen oder Maskenfeld
  verbrauchen. Kosten am Beispiel Dellas: 1,75 MiB Rohfelder zu 7,39 MiB
  übersetztem Inhalt. Entschieden: automatische Neuübersetzung mit vier
  Leitplanken (nur Unbearbeitetes, Lernstand und Karten mit Lernstand
  geschützt, einmal deterministisch je Account, kurzer Hinweis), festgehalten
  in K5.4 und als Ergänzung zu ADR-033.
- Nachweise: Renderer- und Farbtests, Matrix, Übersetzertests, die drei
  Kartenbaustein-Browsertests (Eintippen, Auswahl einschließlich Kprim,
  200-%-Zoom).
- Audit mit `audit-last-change`: Textfarben werden je Stilangabe nur noch
  einmal gelesen; keine weitere belegbare Vereinfachung.

## 2026-10-07 — Übersetzer und Importgraph (Phase 5A)

- K5.0: `readAnkiPackage` (`apkgImportInternal.ts`) liest Pakete ohne
  Abbildung; `translateAnkiPackage` (`apkgNoteTranslation.ts`) liefert
  `{ decks, notes, cards, mediaFiles, reviewEvents, noteTypeSources, report }`.
  `src/apkgFormatMatrix.test.ts` beobachtet diese Pipeline und `renderCard`
  statt Learning Items; die sichtbare Textfassung blendet zugeklappte Hinweise
  aus und ergänzt bei Auswahlfragen die Optionen. Alle 27 bisherigen
  `KNOWN_GAPS`-Einträge sind geschlossen, die Liste ist leer.
- K5.1: Anki-Karten liegen in `did`, gefilterte im Heimatstapel `odid`;
  angelegt werden nur Stapel mit Karten und deren Vorfahren. `Note` trägt
  `importedContentRevision`. Fehlende Anki-Karten werden aus dem Inhalt
  abgeleitet, Karten ohne Abfrage berichtet.
- K5.2/K5.3: Registry aus nativer Image Occlusion, „Multiple Choice for Anki“
  (QType 0/1/2, Maske über die gefüllten Optionen), Image Occlusion Enhanced
  (neue Maskenform `overlay` mit Frage- und Antwort-SVG, Standard der
  Roadmap), AnKing-/Ankizin-Familie (Feldrollen nach Name, nie referenzierte
  Felder als Notiz), Anki-Standardtypen und generischem Übersetzer
  (Feldplatzierung, Anweisung mit `…`, Bedingungen, Eintippen, Vorlesen,
  Furigana). Passt ein Inhalt nicht, bleibt er als Feldliste erhalten.
- Abweichungen von der Roadmap, begründet: Signaturen werden vor der
  Stock-Kennung geprüft, und Basic/Lückentext gelten nur mit unveränderten
  Standardvorlagen als Standardtyp, weil Anki `originalStockKind` = 1 auch an
  neu angelegte und geklonte Notiztypen vergibt (in den Matrixpaketen
  nachgewiesen). Zwei Zielerwartungen wichen nachweislich von Ankis Verhalten
  ab und wurden im Generator korrigiert: „CoRe-Matrix Schrift“ ist ein
  unveränderter Basic-Klon (`forward` statt `anki-0`); ein Export ohne
  Lernstand wandelt den gefilterten Stapel in einen normalen um, die Karte
  bleibt dort. Die Matrix wurde mit `anki==26.5` neu erzeugt.
- K5.5: Phase, Fälligkeit relativ zum Sammlungsdatum, Zähler, Aussetzung und
  `flags & 7` kommen von der Anki-Karte; das Gedächtnis folgt FSRS-Memory-State,
  Revlog-Replay, klassischem Intervall oder bleibt neu. Das Tag `marked` wird
  `note.marked`. `cardStudyFromReviewState` in `coreModel/notes.ts` bildet den
  Scheduler-Zustand auf `Card.study` ab.
- K5.6: Medienverweise nur aus `src`, `poster` und `[sound:…]`, verglichen nach
  HTML-, URL- und NFC-Normalisierung und im Feldtext auf den kanonischen Namen
  umgeschrieben; eine Datei je SHA-1, nur referenzierte Medien. Moderne
  Medien werden positionsgenau ihrem ZIP-Eintrag zugeordnet (per SHA-1 geprüft).
- K5.8: Der ZIP-Leser liest Einträge einzeln aus dem `Blob`; `readAnkiPackage`
  akzeptiert `.apkg` und `.colpkg` bis 2 GiB und hält Medien bis zum Lesen im
  Archiv. Die sichtbare 250-MB-Grenze des heutigen Imports bleibt bewusst bis
  zum Cutover (K5.8 App), weil der Altpfad alle Medien materialisiert.
- K5.9: Der Bericht nennt je Notiztyp Übersetzer und Version, Inhalte, Karten,
  Feldrollen, nicht zugeordnete Felder, Feldlisten- und nicht darstellbare
  Inhalte, fehlende Medien und übernommenen Lernstand. `report:apkg-corpus`
  berichtet diese Quoten statt der Darstellungsquote.
- Nachweise: Matrix 13/13 und `apkgNoteTranslation.test.ts` 9/9 grün,
  `gate:push` mit vollständiger Modulsuite (108 Dateien), Typecheck, Build und Budgets. `benchmark:apkg` (25.000 Karten,
  1.000 Medien): Workerzeit Altpfad 7,1 s / 502 MB Heap, Note-Übersetzung
  3,2 s / 181 MB, Übergabe 0 ms. `benchmark:apkg:large` mit 2,11 GB
  (1.000 Medien à 2,1 MB): 14,7 s, Spitze Heap plus ArrayBuffer 183 MB bei
  1-GiB-Heap-Grenze.
- Browserprobe im Dev-Server: Der heutige Worker-Import liest mit dem neuen
  ZIP-Leser unverändert (`special-latest` 20 Karten, 11 Medien; Deflate-Paket
  `standard-legacy1`), die Note-Übersetzung läuft im Browser mit passender
  Medien-SHA-1. Die Supabase-E2E-Suite lief nicht, weil Docker nicht verfügbar
  war.
- Realwelt-Korpus (lokal in `fixtures/apkg/corpus/`, nicht versioniert):
  Ankizin v5 vollständig (46.729 Inhalte, 53.205 Karten, 5.617 Medien,
  784 MB; 23,5 s, 552 MiB Heap), Dellas x Amboss Pharmakologie v0.81
  (4.944 Inhalte) sowie mit Ankis eigenem Exporter geschnittene Auszüge aus
  AMBOSS feat. Ankiphil Klinik (317 Inhalte) und Physikum v43 (424 Inhalte).
  Ankizin: 99,9 % der Lückentexte über den Ankizin-/AnKing-Übersetzer, die
  1.800 Blickdiagnosen generisch, 0,1 % Feldliste (54 Lösch-Platzhalter ohne
  Lücke, eine im Original nicht geschlossene Lücke), 0 % nicht darstellbar.
  Die Stichproben deckten auf, dass echte Vorlagen Zusatzfelder hinter Buttons
  oder `display:none` auf der Rückseite, Metadaten in einer Kopfzeile auf
  beiden Seiten und Links als `href="{{Feld}}"` führen; der Übersetzer ordnet
  seitdem nach Position statt nach Feldnamen. Diese Muster stehen als
  selbst geschriebene Nachbauten (`matrix-ankizin`, `matrix-blickdiagnose`) in
  der versionierten Matrix, damit sie ohne Korpus geprüft werden. Dellas
  meldet zutreffend 44 im Paket fehlende Bilder und 7 verwaiste Anki-Karten
  gelöschter Lücken. Keiner der Stapel enthält Bildverdeckung oder Lernstand.
- `npm run test:e2e:local` mit Docker: 58 bestanden, 46 fehlgeschlagen, 4 nicht
  gelaufen. Ein Vergleichslauf der APKG-Import-Specs auf `7e9f192` scheitert
  identisch; die Fehlschläge stammen nicht aus Phase 5A (siehe `status.md`).
- Audit mit `audit-last-change`: ungenutzte Notiztyp-ID im internen Modell,
  doppelte Script-Entfernung und doppelte Filterung der Vorderseitenfelder
  entfernt. Zweites Audit nach den Korpus-Nacharbeiten: Hinweise aus
  Button-Abschnitten werden direkt über die Vorderseite statt per Suche in der
  Rückseite bestimmt; keine weitere belegbare Vereinfachung.
- Offen: AnKing, reale Bildverdeckung und reale Lernstände fehlen im Korpus;
  Lernstand ist über die mit Anki erzeugten Matrixpakete synthetisch belegt; Drehung und Textgröße der Bildmasken brauchen im Anki-Editor
  gezeichnete Masken (K5.2). Persistenz, Neuübersetzung, Reimport und
  Oberfläche folgen im Cutover (K5.4, K5.7, K5.8 App, K5.9 App).

## 2026-10-07 — Vorbereiteter Renderer und Kartenbausteine (Phase 3)

- K3.1–K3.4/K3.8: `notePresentation.ts` rendert validierte `Note`/`Card`-Paare
  ohne Anki-Templates, Scripts oder Persistenz. Review-Antworten ergänzen nur
  Antwort und Trennlinie, Vorschau/Verwaltung beide Seiten; Lücken und Bildmasken
  ersetzen die Frage. Feldrollen steuern native Hinweise, Zusatz und Quellen;
  interne Notizfelder bleiben auch bei expliziten Abfragereferenzen verborgen.
  Der Cloze-Tokenizer unterstützt Verschachtelung, Mehrfachnummern, Hinweise,
  leere Lücken und Formeln. Relative SVG-Masken unterstützen Rechteck, Ellipse,
  Polygon, Beschriftung und beide Modi. `alwaysOccluded` hält fremde Gruppen
  sichtbar, verhindert aber nicht das Aufdecken der aktiven Gruppe.
  Feld-HTML wird bereinigt und Textfarbe auf 4,5 : 1 zum Theme-Hintergrund
  angepasst. `notePlainText` erhält Wörter/Satzzeichen über Inline-Tags hinweg.
- K3.5/K3.6: `NoteCardContent` komponiert den bestehenden Kartenrahmen,
  Aktions- und Statusbausteine sowie das segmentierte Control. Eingabe und
  Auswahl bleiben im Host: Enter deckt auf, Unicode-Zeichen werden einzeln
  verglichen, Single Choice deckt direkt auf, Multiple Choice und vollständiges
  Kprim werden geprüft. Rich-Text-Optionen verwenden das bereits bereinigte
  Renderergebnis, damit KaTeX-Layoutattribute erhalten bleiben; nur aufgelöste
  Blob-/Data-Medien gelangen dabei in den Host.
- K3.7/K3.9/K3.10: KaTeX 0.19.0 lädt nur bei Formeln. Lokale WOFF2-Assets
  werden einmal geladen und mit CSS in den Frame eingebettet. Nicht unterstützte
  oder unsichere Befehle zeigen die bereits maskierte Quelle mit Diagnose.
  Rückseitendiagnosen bleiben bis zum Aufdecken verborgen. MP4-Soundmarker
  werden Video-Controls; Bilder, Audio und Video nutzen die bestehende
  URL-Auflösung. System-Vorlesen erhält bereinigten Text und Sprache im Host
  ohne Feldduplikation oder Antwortleck. Die AMBOSS-Suche mit
  `https://next.amboss.com/de/search?q=Herzinsuffizienz` wurde im echten Browser
  bis zur Anmeldung geprüft; Suchpfad und Begriff bleiben erhalten. Ergebnisse
  hinter dem Login wurden nicht geprüft. Der automatisierte Popup-Test nutzt
  eine lokale Antwort und prüft Begriff sowie `window.opener === null`.
- Gemeinsames CSP-Gerüst und URL-Auflösung liegen in `cardPresentationFrame.ts`;
  der bisherige Renderer verwendet exakt dieselben Funktionen. Der neue
  Frame-Aufruf erlaubt isolierte Popups und meldet Textauswahl. Der bisherige
  App-Aufruf bleibt unverändert. Vierzehn interaktive normalisierte Beispiele
  stehen in `scripts/uiCatalogDemos.tsx` und unter
  `docs/ui-elements.html#note-content`; der Kartentypen-Katalog verlinkt sie.
  App, Import, Scheduler, Speicherung und alte Renderpfade wechseln erst im
  Cutover. Die tatsächlichen APKG-Textvergleiche und IO-Enhanced-/Korpusnachweise
  folgen in K5.0; kein `KNOWN_GAPS`-Eintrag wurde vorzeitig entfernt.
- Nachweise: 17 fokussierte Renderer-/Kontrastprüfungen sowie neun bestehende
  Rendererprüfungen, vollständige Modulsuite (107 Dateien), Typecheck,
  Dokumentationsgate und Produktionsbuild mit Bundlebudgets bestehen.
  Initialgraph 218,0 KiB gzip, größter Lazy-Graph 168,7 KiB gzip. Ein separater
  Build des noch unverdrahteten Hosts hält dieselben Budgets ebenfalls ein;
  KaTeX-Lazy-Graph rund 76 KiB gzip. UI-, Rollen-, Wortgrenzen-, Formel- und
  Medienregressionen sind gezielt abgesichert.
- Browsernachweis für CoRe 0.2.0 im Arbeitsstand nach `0c025cb`, Chromium
  149.0.7827.55: 672 Renderfälle mit 14 Beispielen, Review/Vorschau vor und
  nach Aufdecken, Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932,
  1280 × 720 und 1440 × 900. Eingabe/Reset, falsche und richtige Auswahl,
  vollständiges Kprim, native Hinweise per Tastatur, Script-CSP, Textauswahl,
  Formelschriften und Fehlerdiagnosen, echte Audio-/MP4-Wiedergabe und
  Host-Sprachausgabe bestehen. Die bisherigen Inhalts-/Reviewrahmen und der
  mobile Vorschaudialog sind zusätzlich geprüft; die Eingabejourney besteht
  bei 200 % CSS-Zoom. Screenshots liegen in `test-results/note-presentation/`,
  zusätzlich gesichert unter `C:/Users/bengt/.codex/scratchpad/core-phase3/screenshots/`.
  Für komponentenbezogene Aufnahmen wurde ausschließlich die klebende
  Dokumentationsnavigation auf statische Position gesetzt. Die App-Styles
  wurden nicht durch Test-Styles verändert.
- Review gegen K3.1–K3.10 am 2026-10-07: Die Funktionen entsprechen der
  Roadmap. Korrigiert wurden: `[$$]…[/$$]` fehlte als abgesetzte Formel.
  Textbeschriftungen der Bildverdeckung waren SVG-Text in der gestreckten
  0–1-Fläche und damit verzerrt; Ankis Standardskala 1 ergab eine bildhohe
  Schrift. Sie sind jetzt HTML, Skala 1 entspricht der Kartenschrift. Umrisse
  verwenden nicht skalierende Striche, fremde Masken sind deckend statt in
  Bildhintergrundfarbe. Zusätze stehen vor den Quellen, Link-Quellen gemeinsam
  als Chips am Kartenende. Der Tippvergleich ersetzt auf der Antwortseite das
  Antwortfeld (`typedAnswer`), statt die Antwort doppelt zu zeigen. Der Host
  rendert Frage, Optionen und Vorlesetexte beider Seiten einmal und beim
  Aufdecken nur die Antwortseite neu, ohne die Karte zwischenzeitlich
  auszublenden.
- Visuelle Neugestaltung aus den bestehenden UI-Bausteinen: Hinweise als
  umrandete Disclosure mit Chevron, aktive Lücke als umrandete Akzentmarke,
  Zusatz mit gedämpfter Überschrift, Tabellen ohne Zeichenumbruch,
  Formelfehler als markierter Quelltext. Auswahl im vorhandenen Choice-Stil
  mit Buchstaben, Status-Icons und Feedback; Kprim zeigt die Lösung je
  Aussage. Das Eingabefeld steht mit Enter-Hinweis bis zum Aufdecken unter der
  Frage. Die Werkzeugzeile zeigt Vorlesen und `In AMBOSS nachschlagen` erst bei
  markiertem Begriff. Im Katalog wählt ein Segmented Control die Darstellung;
  Abfragen heißen „Lücke 1“, „Maske 2“ usw.
- Bewusst offen und in `todo.md` geführt: Marker-Hintergründe im Dark Mode,
  Kprim-Teilpunkte und Bildbeschreibung der Bildverdeckung (Abschnitt „Offene
  Entscheidungen aus Phase 3“) sowie Drehung und Textgröße gedrehter Masken
  (K5.2).
- Nachweise nach der Neugestaltung: 15 Renderer- und drei Kontrastprüfungen,
  vollständige Modulsuite (107 Dateien), Typecheck mit Dokumentationsgate,
  Produktionsbuild mit Bundlebudgets (Initialgraph 217,9 KiB gzip, größter
  Lazy-Graph 168,7 KiB gzip), die sieben Browserprüfungen von
  `tests/e2e/note-presentation.spec.ts` und die visuelle Matrix mit
  672 Aufnahmen (sechs Viewports, Light/Dark, Review/Vorschau, vor und nach
  dem Aufdecken; ohne horizontales Überlaufen und Seitenfehler). Gesichtet
  wurden Light und Dark bei 320, 390 und 1440 px. Der gestapelte Tippvergleich
  und die beim Aufdecken sichtbar bleibende Frage entstanden nach dem
  Matrixlauf; beides ist mit den Browserprüfungen und eigenen Aufnahmen bei
  320 und 1440 px nachgeprüft.
- Audit mit `audit-last-change` nach dem Review: Theme-Farbliste und
  Formelerkennung bestehen nur noch einmal; der Host rendert beim Aufdecken
  nicht mehr alle Seiten neu. Keine weitere belegbare Vereinfachung gefunden.
- Offene Abnahme: `npm run performance:measure:local` prüft lokales Schema
  und Typendrift und baut erfolgreich, endet aber im 4G-Szenario beim Warten
  auf `core:first_deck_summaries_ready` am Zehn-Minuten-Limit. Der Trace zeigt
  ein gerendertes Dashboard, keinen Konsolenfehler und die erfolgreiche
  Bootstrap-Marke; die Zusammenfassungsmarke fehlt in diesem Lauf. Es entsteht
  kein neues Performanceartefakt; Statistikbenchmark und Grenzwertprüfung
  wurden deshalb nicht ausgeführt. Der Nutzer hat ausdrücklich entschieden,
  Phase 3 mit offener Performance-Abnahme festzuhalten. Der bestehende Startpfad
  und alle Grenzwerte bleiben unverändert. Echte Smartphone-Tastatur,
  physischer Touch/Screenreader, hörbare Systemstimme und nativer Browserzoom
  bleiben ebenfalls ungeprüft; CSS-Zoom und kontrollierte Sprachübergabe
  ersetzen diese Nachweise nicht.
- Abschlussaudit mit `audit-last-change`: Font-Binärdaten bleiben außerhalb
  des JavaScript-Bundles, CSP und Medienauflösung sind gemeinsam statt kopiert,
  interne Feldrollen und aktive Bildmasken werden korrekt behandelt und
  Textgrenzen bleiben erhalten. Keine weitere belegbare Vereinfachung gefunden.
  Produkt-Specs und lokale Screen-Muster bleiben unverändert, weil kein
  Produktpfad auf den neuen Renderer umgestellt wurde. Keine Datenbankänderung,
  keine Phase-5A-Implementierung und kein Commit/Push ohne neue Freigabe.

## 2026-10-07 — Nachprüfung Kanonisches Modell (Phase 2)

- Review von `0c025cb` gegen K2.1–K2.6: Typen, Ableitung, Abgleich, private
  Seam, Inventar und Löschplanung entsprechen der Roadmap. Nachgeschärft:
- `planNoteContentChange` meldet `changed`. Ist der bereinigte Inhalt
  unverändert, bleiben Inhalt, Inhalts- und Entitätsrevision unverändert;
  sonst steigen beide genau einmal. Verglichen werden beide Seiten nach
  `parseNoteContent`, damit eine spätere JSONB-Schlüsselreihenfolge keine
  Scheinänderung erzeugt. So gilt ein bloßes Speichern später nicht als
  lokale Bearbeitung (K5.1/K5.7 nennen dafür jetzt `importedContentRevision`).
- Neue Karten kommen deterministisch in den Stapel der Karte, deren
  Abfrageschlüssel im bisherigen Inhalt zuerst abgeleitet wird, statt in den
  Stapel der zufällig ersten übergebenen Karte.
- Doppelte Karten-IDs oder Abfrageschlüssel werden bei Änderung und Löschung
  abgewiesen; gelöschte Inhalte oder Karten können nicht geändert werden.
- `updatedByDeviceId` setzt ausschließlich die Persistenz beim Schreiben
  (K4.9); `createNote` nimmt den Wert nicht mehr entgegen.
- Markierung: `marked` liegt wie in Anki am Inhalt (`Note.marked`) statt an
  der Karte und außerhalb von `content`; ADR-032 ist entsprechend ergänzt.
  Der APKG-Import entfernt künftig das Tag `marked` (K5.5); die
  Matrixerwartung bleibt unverändert, die Beobachtung ergänzt das Tag (K5.0).
- `architecture.md` nennt in der Modultabelle `scheduler.ts` statt der nicht
  existierenden Datei `fsrsScheduler.ts`.
- Nachweise: vier neue und drei angepasste Modelltests; vollständige
  Modulsuite (105 Dateien), `npm run typecheck` einschließlich
  `check:docs` und `npm run docs:build` bestehen.
- Audit mit `audit-last-change`: Die Stapelwahl für neue Karten nimmt die
  erste vorhandene Karte in bisheriger Schlüsselreihenfolge, statt alle
  Karten zu sortieren. Keine weitere belegbare Vereinfachung gefunden.

## 2026-10-06 — Kanonisches Note-/Card-Modell (Phase 2)

- K2.1: `coreTypes.ts` ergänzt `Note`, `Card` und `CardStudyState`, ohne
  bestehende Typen zu ändern. `coreTypes.typecheck.ts` schützt die Trennung
  von Inhalt, Stapel und Lernstand. Queue-relevante Werte liegen direkt am
  Lernstand; genutzte CoRe-, Lernfortschritts- und Variantenwerte sind in
  `extra` typisiert. Identitäten des früheren Review-State, die Aliaswerte
  `repetitions`/`sameDaySuccessCount` und die nur geschriebenen Werte
  `ease`, `retrievability` und `schedulerParamsJson` wurden nicht übernommen.
- K2.2/K2.3: `coreModel/notes.ts` validiert und bereinigt Inhalte über
  `parseNoteContent`, erstellt frische Karten je Abfrageschlüssel und plant
  Inhaltsänderungen. Gleiche Schlüssel erhalten exakt ihre bisherigen
  Karten, Lernstände, Varianten, Markierungen, Flaggen und Stapel. Neue
  Schlüssel erzeugen neue Karten im Stapel der ersten übergebenen Karte;
  entfallende Karten werden nur gemeldet, nicht gelöscht. Inhalts- und
  Entitätsrevision steigen je Änderungsplan einmal.
- K2.6 (reiner Anteil): `planNoteDeletion` plant Soft-Delete für Inhalt und
  alle Geschwister, auch in anderen Stapeln, mit einem Zeitstempel. `undo`
  enthält die vollständigen vorherigen Datensätze einschließlich Varianten
  und Aussetzung. Eingaben und Persistenz werden nicht verändert.
- K2.4/K2.5: Die neuen Funktionen bleiben privat; `coreModel.ts`, Scheduler,
  Review, Statistik, Import, App und Persistenz sind unverändert. Die
  verbleibende Verdrahtung von K2.2/K2.4/K2.5/K2.6 ist in K4.9 eingeplant.
- Nachweise: 17 neue Modelltests und elf vorhandene Inhaltsschema-Tests
  bestehen. Abgedeckt sind bedingte Richtungen, Eintippen, alle drei
  Auswahlmodi, beide Bildverdeckungsmodi, Hinweise, Mehrfachnummern,
  Verschachtelung, mehrere Lückenfelder und Formeln; außerdem Hinzufügen,
  Entfernen und Umnummerieren von Lücken, Rückrichtung an/aus, geleerte
  Bedingungen, Formatierungs-/Reihenfolgeänderungen, Fremdkartenabwehr und
  vollständiger Undo-Zustand. Die vollständige Modulsuite besteht mit
  unveränderten Scheduler-, Review- und Statistiktests (105 Dateien).
  `npm run typecheck` einschließlich `check:docs`, `npm run docs:build`
  und die abschließende Diffprüfung bestehen ebenfalls.
- Audit mit `audit-last-change`: Der Änderungsabgleich verwendet seine
  Schlüssel-Map zugleich für entfallende Karten; ein zusätzliches Set und
  ein weiterer Filterdurchlauf entfallen. Keine weitere sichere
  Vereinfachung gefunden. Keine neue Abhängigkeit, kein Laufzeitwechsel,
  keine Änderung von Datenbank oder UI. Produkt-Specs, Anki-Formatvertrag
  und Kartentypen-Demos bleiben deshalb unverändert.

<!-- K2.5: Lese-/Schreibinventar für den Cutover, Stand 2026-10-06.
src/reviewService.ts:
  Lesen: isDue/isReviewDueByLearningDay/isNewLearningItem/isLearningAvailable,
  compareQueueEntries/compareReviewQueueEntries, isIntradayLearning,
  classifyDailyReviewProgress und createDailyReviewQueue: state, dueAt, reps
  (bisher auch repetitions), lastReviewedAt und learningDayKey.
  createReviewItemViewModel/createFallbackViewModel: maturityXp/maturityBand,
  schedulerVersion, forcedVariantId, fallbackUntilCorrect, lastFailedVariantId.
  Schreiben: answerVariant -> updateCoreStateFromReview übernimmt den gesamten
  Schedulerstate, createReviewEvent speichert vorher/nachher als Snapshots;
  Variantenperformance wird separat aktualisiert. Meta-Projektionen entfallen
  erst im Cutover, repetitions wird überall auf reps umgestellt.
src/scheduler.ts:
  Lesen: createFsrsScheduler (desiredRetention), toFsrsCard/phaseForState/
  getStateReps/calculateRetrievability (direkte Queue-/FSRS-Werte),
  nextPreferredVariantLevel/fallbackStateForRating/deriveOutcomeMaturity
  (Variantenwerte), learningProgress (Lernfortschritt und Zeitstempel).
  Schreiben: projectFsrsResult -> createReviewState; state, dueAt, intervalDays,
  intervalMinutes, learningStepIndex, difficulty, stability, desiredRetention,
  reps, lapses, maturityXp/maturityBand, lastReviewedAt/lastRating,
  schedulerVersion, Variantenfallback und Lernfortschritt. Die bisher zusätzlich
  geschriebenen Alias-/Diagnosewerte entfallen im Cutover; keine FSRS-Änderung.
src/easyDays.ts:
  Lesen: createEasyDaysDueCounts liest state und dueAt; keine Lernstand-Schreibstelle.
src/learningDay.ts:
  Keine direkte ReviewState-Nutzung; erhält Datum, Zeitzone und Tagesgrenze als
  Werte. Aufrufer müssen künftig study.dueAt und extra.learningDayKey übergeben.
src/statisticsModel.ts:
  Lesen: snapshot/category/createStatisticsAccumulator nutzen state,
  intervalDays, difficulty, stability und dueAt sowie Review-Snapshots.
  Keine Lernstand-Schreibstelle; Snapshots/Account-Aggregate beim Cutover mitziehen.
src/coreVariantService.ts und coreVariantService/variantSelection.ts:
  Lesen: getLearningItemMaturity/getVariantReadiness/chooseReviewCard und
  selectAutomaticReviewVariant lesen maturityXp/maturityBand, stability,
  difficulty, intervalDays, reps (bisher auch repetitions), state,
  preferredVariantLevel, forcedVariantId und fallbackUntilCorrect.
  Keine Scheduler-Schreibstelle; Variantenmutationen bleiben an ihrer Karte.
-->

## 2026-10-06 — APKG-Formatmatrix und Realwelt-Korpus (Phase 1)

- `scripts/create_apkg_matrix_fixtures.py` erzeugt mit dem offiziellen Exporter von `anki==26.5` zwölf Pakete und `apkg-matrix.expected.json` (Vertrag v2):
  - Standardnotiztypen als aktuelles Paket, Legacy-2-Paket und Anki-2.0-Paket;
  - Sonderformate (AnKing-artige Hinweise mit AMBOSS-Link, „Multiple Choice for Anki“ als Kprim, Multiple und Single Choice, unbekannter Notiztyp mit festem Vorlagentext, Hinweis, Vorlesen, Furigana, drei Richtungen, zwei Lückenfelder, Lücke in Formel, MathJax, LaTeX, Audio, Video, Tabelle, native Image Occlusion mit allen vier Formen, Image Occlusion Enhanced);
  - Mediensonderfälle;
  - Lernstände mit und ohne Lernstand, auch als Legacy-Paket;
  - eine `.colpkg` mit Stapel `Default`;
  - ein leeres und ein defektes Paket.

  Jede Notiz trägt die Zielerwartung des universellen Inhalts: Feldrollen, Abfrageschlüssel, Text vor und nach dem Aufdecken nach der Regel aus `2c08cc7` (Basic wiederholt die Frage nicht, Lückentext füllt an derselben Stelle), Stapel, Lernstand und Medien.
- `src/apkgFormatMatrix.test.ts` (Contract, unter 1 s) prüft alle Pakete über die öffentliche Import-Seam. `KNOWN_GAPS` ist streng: Nicht gelistete Abweichungen und bereits geschlossene Lücken lassen den Test fehlschlagen.
- Die Matrix weist folgende Lücken des heutigen Imports nach:
  - **Widerspruch zum dokumentierten Vertrag:** Der rohe Anki-Kartenzustand erreicht das Learning Item nicht. Gültige FSRS-Zustände, Aussetzen, Wiederlernen, Begraben und Flaggen gehen verloren; es greift nur das Revlog-Replay.
  - **Stapel:** Jeder Import legt einen leeren Stapel `Default` an; gefilterte Stapel werden echte Stapel (`odid` ignoriert); Geschwister in anderen Stapeln, auch per Template-Zielstapel, landen im Stapel der ersten Karte.
  - **Formate:** `.colpkg` wird abgelehnt. `{{c1,3::…}}` erzeugt keine dritte Karte, verschachtelte Lücken zerbrechen, und die Eintippkarte zeigt die Antwort nicht. Hinweise sind sofort sichtbar, MathJax und LaTeX bleiben roh, Bildverdeckung erscheint als Rohtext. „Multiple Choice for Anki“ und Image Occlusion Enhanced werden nicht erkannt.
  - **Medien:** Ein Link-Pfad zählt als Medienverweis. HTML-maskierte und URL-kodierte Mediennamen werden nicht aufgelöst und fälschlich als fehlend gemeldet. Das Tag `marked` wird nicht zur Markierung.
- Belegte Formatdetails stehen in `anki-format-analysis.md`, darunter die Bedeutung von `QType` (0 = Kprim, 1 = Multiple, 2 = Single Choice) laut Quelle von `zjosua/anki-mc`. Noemis zurückgestellte Commits `e558338` und `2c08cc7` dienten nur als Lesevorlage; aus ihnen wurde kein Code übernommen.
- `scripts/reportApkgCorpus.ts` (`npm run report:apkg-corpus`) importiert echte Stapel aus `fixtures/apkg/corpus/` (gitignoriert) und berichtet je Notiztyp heutige Darstellungsquote, fehlende Medien, Laufzeit und Heap; ohne Dateien endet er mit Exit-Code 2. Mit Matrixpaketen geprüft; echte Ankizin- und AnKing-Stapel stehen noch aus.
- Audit des fertigen Diffs: Ungenutzte Erwartungsfelder im Test und ein ungenutzter Generatorparameter wurden entfernt; sonst keine Vereinfachung gefunden. Die Roadmap in `todo.md` wurde für die Übergabe an ein ausführendes Modell detailliert. Neu sind dort Arbeitsweise, Geschmacksstandards, Datei-Hinweise und Fertig-Kriterien je Aufgabe. Ausgeführt wird künftig 2 → 3 → 5A → Cutover (4) → 6 → 7 → 8, damit `LearningItem` erst im Cutover entfällt.
- Nebenbefunde außerhalb des Feature-Freezes, nicht behoben, aber in `todo.md` eingeplant (K4.11, K5.9, K3.9):
  - `scripts/create_apkg_quality_fixtures.py` exportiert wegen `ExportLimit` statt `DeckIdLimit` die ganze Sammlung.
  - Der Import meldet noch „produktive Medienablage bleibt ein späterer Ausbaupunkt“.
  - Das Filter `{{tts …}}` gibt den Feldtext doppelt aus.

## 2026-10-06 — Inhaltsschema und Feld-HTML-Vertrag (K0.2, K0.3)

- `NoteContent` in `coreTypes.ts` beschreibt den universellen Inhalt nach ADR-033: Felder mit den Rollen Frage, Antwort, Hinweis, Zusatz, Quelle und Notiz; genau eine Abfrageart (Aufdecken mit einer Liste von Abfragen, Auswahl, Lückentext oder Bildverdeckung); Vorlesen je Feld; Tags. Eine Abfrage nennt Schlüssel, Namen, eine meist ausgeblendete Anweisung für festen Vorlagentext, Vorder- und Rückseitenfelder, eine optionale Feldbedingung (`all`/`any`) und optional ein Eintippfeld. Damit bleiben auch Anki-Notiztypen mit mehr als zwei Richtungen ohne Kartenverlust abbildbar.
- `src/coreModel/noteContent.ts` validiert fremde Inhalte mit deutschen Meldungen. Daneben leitet es die Abfrageschlüssel deterministisch ab: erfüllte Abfragen über ihren Schlüssel, `choice`, `cloze:N` einschließlich `{{c1,2::…}}` und Verschachtelung sowie `io:N`. Wie in Anki entsteht keine Karte mit leerer Vorderseite. Medienreferenzen werden aus dem Inhalt abgeleitet statt gespeichert.
- `sanitizeNoteHtml` erhält Auszeichnung, Farben, relative Schriftgrößen, Listen, Tabellen mit Rahmen, Innenabständen und Prozentbreiten, Ruby, lokale beziehungsweise eingebettete Medien und absolute Web-Links. Entfernt werden Schriftarten, feste Größen, Positionierung, Klassen, IDs, Datenattribute, relative Links, Remote-, `blob:`- und Script-Inhalte. Der bestehende `sanitizeCardHtml` bleibt unverändert, bis der Renderer in Phase 3 umgestellt wird.
- Audit des fertigen Diffs: Eine Nachbearbeitung, die leere Attribute entfernen sollte, löschte auch die Wörter „src“, „href“, „style“ und „poster“ aus normalem Text. Die Prüfung liegt jetzt im Attribut-Hook des Filters, gilt nur für erlaubte Attribute und decodiert HTML-Entities vorher. Medienreferenzen werden ebenfalls decodiert (`c&amp;d.png` → `c&d.png`). Für beide Fälle gibt es Regressionstests.
- Schema und Sanitizer sind bewusst noch nicht an Erstellung, Import oder Darstellung angeschlossen; das geschieht in Phase 2, 3 und 5.
- Nachweise: 11 Schema-Tests mit Beispielen für Basic, Basic und umgekehrt, optional umgekehrt, Eintippen, drei Richtungen mit Anweisung, Lückentext, AnKing-artige Feldrollen, Single/Multiple Choice/Kprim und Bildverdeckung, 3 neue Sanitizer-Tests neben den 4 bestehenden; `npm run typecheck` einschließlich Dokumentationsgate.

## 2026-10-06 — Ausgangsmessung für das neue Kartenmodell (K0.1)

Referenz für den Vergleich nach ADR-032 bis ADR-036. Gemessen auf dem lokalen Entwicklungsrechner mit dem Kartenmodell nach ADR-029; Rohdaten liegen lokal in `test-results/baseline/`.

**Speicherbedarf je 1.000 Inhalte.** `npm run measure:footprint` erzeugt mit `anki==26.5` ein APKG aus Ankis Standardnotiztypen (je 1.000 Notizen Basic, Basic und umgekehrt sowie Lückentext mit vier Lücken und Extra; rund 300 bis 450 Zeichen Text je Notiz). Der Import läuft über den produktiven APKG-Pfad. Die manuellen Szenarien verwenden dieselben Texte über `createLearningItemsFromEditorValue`. Alle Zeilen werden über `createCloudStateRows` in einer zurückgerollten Transaktion in die lokale Datenbank geschrieben. Postgres misst `pg_column_size` je Zeile einschließlich der Trigger-Projektion `card_catalog`. Sync misst das JSON der Zeilen, Browser das UTF-8-JSON der IndexedDB-Kartenkörper. Angaben in MiB, Lernfenster in KiB.

| Szenario | Karten | Postgres gesamt | davon `cards` | davon `card_catalog` | Sync | Browser-Kartenkörper | Lernfenster 50 Karten |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| APKG Basic | 1.000 | 4,87 | 3,71 | 1,15 | 4,66 | 4,35 | 223 |
| APKG Basic und umgekehrt | 2.000 | 10,60 | 7,73 | 2,87 | 9,77 | 9,16 | 235 |
| APKG Lückentext (4 Lücken) | 4.000 | 23,84 | 19,31 | 4,53 | 23,95 | 22,72 | 291 |
| Manuell Basic | 1.000 | 4,46 | 3,52 | 0,94 | 4,07 | 3,77 | 193 |
| Manuell Basic und umgekehrt | 2.000 | 9,20 | 7,06 | 2,15 | 8,16 | 7,57 | 194 |
| Manuell Lückentext (4 Lücken) | 4.000 | 22,46 | 17,52 | 4,94 | 21,56 | 20,37 | 261 |

Notiztyp-Definitionen belegen je Szenario unter 2 KiB. Eine importierte Lückentext-Karte trägt rund 3,3 KiB Inhaltskopien (`contentDocument`, `originalHtml`, `originalFields`, `originalFront`/`originalBack`, `canonicalQuestion`/`canonicalAnswer`, `title`) und rund 0,8 KiB Lernstand-JSON mit 37 Schlüsseln. Der eigentliche Notiztext umfasst rund 0,6 KiB je Notiz.

**Startzeiten.** `npm run performance:measure:local` mit 4-facher CPU-Drosselung und je zehn Läufen:

| Kennzahl | p75 | p95 | Grenze | Ergebnis |
| --- | ---: | ---: | ---: | --- |
| Wiederkehrender Start mit IndexedDB | 927,5 ms | 953,8 ms | – | – |
| Offline-Kaltstart | 677,1 ms | 705,5 ms | – | – |
| Start ohne Service Worker | 1.435,1 ms | 1.455,8 ms | – | – |
| Neues Gerät bis Dashboard | 3.958,8 ms | 4.187,4 ms | 3.000 ms (p75) | überschritten |
| Automatischer 4G-Preload, längste Aufgabe | – | 73 ms | 50 ms | überschritten |
| Persistierte Stapelzusammenfassung | 18,7 ms | – | – | – |
| Statistik-RPC (100k Karten, 1 Mio. Reviews) | 490,0 ms | 522,0 ms | – | – |
| Katalogsuche (100k Karten) | 125,1 ms | 295,2 ms | – | – |

Die Überschreitung beim Start eines neuen Geräts war bereits am 3. Oktober 2026 bekannt (3.821,6 ms und 3.097,5 ms). Die Preload-Überschreitung trat in dieser Messung zusätzlich auf. Beide Werte sind Teil der Ausgangslage und wurden nicht korrigiert.

**APKG-Import.** `npm run benchmark:apkg` mit 25.000 Karten und 1.000 Medien (14,2 MiB): Median 10,5 s gesamt und 10,2 s im Worker, maximal 425 MiB Worker-Heap, längste Main-Thread-Verzögerung 32,4 ms, Ergebnisübergabe 0 ms.

## 2026-10-05 — Specs an den UI-Katalog angeglichen

- Specs und gemeinsamer Dokumentationsrahmen verwenden CoRe-Typografie, Abstände, Radien, Rahmen, Flächen, Controls und Lucide-Icons. Die Inhaltsnavigation markiert die Scrollposition auch innerhalb langer Abschnitte und ist unter 1280 px aufklappbar; Escape schließt sie mit Fokus-Rückkehr und erhält den Suchfilter.
- Die Markdown-Quelle wurde um 457 Wörter gestrafft; alle 35 Überschriften und 274 Aufzählungsregeln bleiben erhalten. Der Generator ergänzt eine nachvollziehbare Codeumfang-Projektion aus aktuellen Quellen mit den produktiven `SegmentedDonut`- und `StatTile`-Komponenten. Der Ring zeigt Bildschirmcode je Produktbereich; gemeinsam genutzter Code und API stehen separat. Produktfunktionen und Roadmap bleiben unverändert.
- Nachweise: neun fokussierte Dokumentationstests, Typecheck einschließlich `check:docs`, Produktionsbuild und Bundlebudgets. Chromium 149.0.7827.55: sechs Dokumentationsseiten in Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932, 1280 × 720, 1440 × 900 sowie 600/601 und 1279/1280 × 900. Kein horizontaler Seitenüberlauf. Specs zusätzlich mit langen Texten, Tabellen, Codegrafik, geöffnetem Menü, Suche/Nulltreffern, Scrollspy, Direktlinks, Browser-Zurück und Escape geprüft. Screenshots und Browserbericht liegen lokal in `test-results/specs-ui/`.
- Offen: echte Smartphone-Bildschirmtastatur, physische Touch-/Screenreader-Prüfung und nativer 200-%-Browser-Zoom. Die Zoomprobe verwendet 720 × 450 CSS-Pixel bei DPR 2 und ersetzt diese Nachweise nicht. Die App wurde als Stilreferenz angesehen; Auth-/Cloud-Flows gehören nicht zu dieser Dokumentationsänderung.

## 2026-10-03 — Token-Vereinheitlichung und Vorher-/Nachher-Vergleich

- Die Produkt-UI verwendet sechs gemeinsame Rundungen, zwei Elevationen plus Vertiefung und Auswahl, Rahmen mit 1/2 px sowie zentrale Schriftgrößen, Zeilenhöhen und Gewichte. Die sechs bisherigen Schriftgrößen bleiben erhalten; freie kleine Beschriftungen, Sonderrundungen, Schatten und ähnliche Panelabstände sind behutsam zusammengeführt. Zwölf redundante Status-Aliasse entfallen. Semantische Farben und fachliche Stapeltiefen bleiben erhalten; importierte Kartengestaltung und PDF-Textgeometrie bleiben in ihren Besitzern. Der Theme-Vertrag verhindert die erneute Einführung freier Geometrieklassen.
- Der Katalog zeigt zusätzlich echte Produkt-Screens mit lokalen Demodaten. Der temporäre A/B-Vergleich enthielt 88 Fälle mit 352 eingebetteten Vorher-/Nachher-Bildern in Light/Dark, Such- und Bereichsfilter sowie gemeinsame Vergrößerung. Grundlage war der isolierte Ausgangsstand mit identischen Fixtures und Zeitpunkt. Standardbreite 1440 px, mobile Navigation zusätzlich einmal bei 390 px. Menüs, Dialoge, Karteneditor, Textwerkzeuge, laufender Timer und Choice-Auswahl/-Lösung waren enthalten. Nach der Freigabe zur Veröffentlichung wurden Vergleichsdatei, Ausgangskopie und temporäre Vergleichsskripte auf Nutzerwunsch entfernt. Demos und generierte HTML-Seiten bleiben aus ihren Quellen aktualisiert.
- Modultests in 102 Dateien, Typecheck einschließlich Dokumentationsgate sowie Produktionsbuild und Bundlebudgets bestehen. Initialgraph 217,5 KiB gzip, größter Lazy-Graph 168,7 KiB gzip. Bedienprüfungen der Vergleichsdatei bestanden ohne Laufzeitfehler. Separate Chromium-Nachweise bleiben in `test-results/ui-token-validation/matrix/`: 15 Screens und Navigation über die sechs Pflichtgrößen sowie 1279/1280 × 900 in beiden Themes; zusätzliche Vergrößerungsprobe mit 200 % CSS-Zoom. Komponenten und geöffnete Zustände wurden am Vergleich visuell geprüft; dies ersetzt keine vollständige Geräte- oder Cloud-Abnahme.
- Audit des fertigen Diffs: keine weitere belegbare Produktionsvereinfachung oder Performance-Optimierung gefunden. Der Typografie-Test bewahrt bei der Token-Umstellung zusätzlich die bisherigen Prüfungen von Schriftfamilien und Gewichten; alle elf Theme-Prüfungen bestehen.
- Das vollständige `npm run gate:push` besteht nach dem Audit. `npm run performance:measure:local` wurde zweimal ausgeführt: zunächst neuer Geräte-Start p75 3.821,6 ms und persistierte Stapelzusammenfassung p75 110,5 ms, anschließend ohne parallele Builds 3.097,5 ms beziehungsweise 9,8 ms. Damit bleibt ausschließlich der Geräte-Start über seinem 3.000-ms-Budget. Die übrigen Grenzwerte einschließlich des 100k-Karten-/1m-Review-Statistikbenchmarks bestehen. Messungen liegen in `test-results/ui-token-validation/performance-first.json` und `performance-repeat.json`; die Grenzwerte wurden nicht verändert. Der Nutzer hat am 3. Oktober 2026 ausdrücklich eine einmalige Ausnahme für den Main-Push dieser Token-Umstellung erlaubt. Die Ausnahme ändert weder die Performance-Grenzwerte noch die Anforderungen für weitere Änderungen.
- Der vorhandene Überstand der Überschrift „Lerneinstellungen“ bei 320 px ist im Ausgangsstand identisch (300 px verfügbar, 316 px Textbreite, 36 px Schrift). Beim schnellen Theme-/Viewportwechsel des PDF-Katalogs wurde eine RenderingCancelledException vor und nach der Umstellung beobachtet. Beide angrenzenden Probleme bleiben außerhalb dieser Token-Umstellung. Reale Smartphone-Tastatur, physischer Touch/Screenreader, nativer Browserzoom und authentifizierte Cloudabläufe bleiben ungeprüft. Die lokale Änderung ist nach dem A/B-Vergleich zur Veröffentlichung freigegeben.

## 2026-10-02 — Audit der Dokumentation und UI-Korrekturen vor Main-Push

- Fertigen Diff und direkt betroffene App-, Katalog- und Erzeugungspfade geprüft. Eine unerreichbare Vorschau-CSS-Regel für `h2` entfernt; die Varianten verwenden ausschließlich `h3`. Den widersprüchlichen Specs-Satz zu schmalen Tabellenüberschriften an die bereits geprüfte Ellipsendarstellung mit vollständigen zugänglichen Namen angeglichen und den Quellenstand aktualisiert. Keine weitere belegbare Vereinfachung oder Performance-Optimierung gefunden; keine zusätzliche Produkt- oder Designänderung.
- `npm run gate:push` besteht mit Typecheck, Dokumentationsgate, allen Unit-/Contract-/Integrationstests in 102 Dateien sowie Produktionsbuild und Bundlebudgets. Initialgraph 217,7 KiB gzip, größter Lazy-Graph 168,8 KiB gzip. Nach der ausschließlich dokumentarischen Auditkorrektur sind die HTML-Ausgaben regeneriert und erneut auf Quellenstand, Inventar und Verweise geprüft. Die separat vorgestellten Designvarianten bleiben bis zur Auswahl Vorschauen.

## 2026-10-02 — UI-Korrekturen und Dokumentation nach Elementfamilien

- Reguläre und kompakte Segmente richten Icon und Text gemeinsam mittig aus. Der leere Dashboard-Einstieg verwendet dieselben Aktionskarten wie „Erstellen“; die drei bisherigen Sonderstile und die doppelte Kartenimplementierung entfallen. In beiden Kartenlisten ersetzen graue Haken-/Strich-Icons die Ja-/Nein-Pills. Feste Iconplätze richten markierte Sterne untereinander aus; schmale Tabellenköpfe überlagern sich nicht mehr.
- Der Katalog ordnet 55 Komponenten, lokale Kennzeichnungen und native Eingaben genau 18 Elementfamilien zu. Doppelte fachliche Muster sind zusammengeführt oder ihrer Elementfamilie zugeordnet. Eigene CSS-Klassen zeigen ausschließlich Verwendungen. `project.html` samt Erzeugung und Navigation entfällt; `architecture.md` enthält auf rund einem Fünftel der ursprünglichen Textmenge weiterhin Zuständigkeiten und Invarianten. Rückbauhistorie entfällt aus den Specs. Die Stapelzeile aus der Rückmeldung ist weiterhin produktiv und bleibt erhalten; ihre Demo entspricht wieder der App-Konfiguration.
- `design-review.html` zeigt die bestehenden Einstiegskarten A sowie alternative Verdichtungen B/C und drei kompaktere Meldungsdichten mit symmetrischen sichtbaren Iconabständen. Diese Vorschau-Styles werden erst nach Auswahl übernommen. Die fremde SmarterNutrition-Referenz bleibt unverändert.
- Abgenommen: 60 fokussierte UI-/Screen-/Modell-/Dokumentationstests, Typecheck einschließlich Dokumentationsgate, Produktionsbuild und Bundlebudgets. Browsernachweise in `test-results/docs/revision/`: 60 Leserfälle, zwölf Design-Freigabefälle und zwölf Segmentfälle in den sechs Pflichtgrößen und beiden Themes; zusätzlich alle 22 Katalogbereiche bei 320 und 1440 px in Light/Dark. Die gerenderten Verbraucher Einstieg, Erstellen, Dashboard und beide Kartenlisten verwenden echte Komponenten mit lokalen Fixtures. Kein horizontaler Hauptscroll; lange Datumswerte, zentrierte Segmente und ausgerichtete Sterne geprüft. Vorschau-Schließen-Aktionen bleiben 44 px hoch.
- Keine neue Auth-/Cloud-Abnahme und keine vollständige Wiederholung sämtlicher geschützter Screens. Physische Smartphone-Tastatur, Touch, Screenreader und nativer 200-%-Zoom bleiben offen. Historische Iframe-Konsolenmeldungen werden durch diese Renderprüfung nicht als behoben behauptet. Keine Veröffentlichung, kein Commit und kein Push.

## 2026-10-02 — Gemeinsame HTML-Dokumentation und vollständiger UI-Katalog

- Alle elf Markdown-Rollenquellen, die drei bisherigen HTML-Referenzen sowie die Projekt-, Screen- und UI-Einstiege auf Quellenzuständigkeit, Verweise und veraltete Aussagen geprüft. Falsche Importversprechen, Varianten-Lernstände, Hierarchiegrenzen, ADR-Status und Heatmap-Farbwahl korrigiert; historische Nachweise und weiterhin notwendige Formatverträge erhalten. `specs.md` ist gegenüber dem übernommenen Arbeitsstand um rund 1 % kürzer; die sieben Journeys und ihre Akzeptanzregeln bleiben vollständig.
- `docs/README.md` ersetzt `docs/index.md`. Docs, Specs, Journeys und UI-Elements teilen die Namen und Navigationsstruktur mit SmarterNutrition; Kartentypen und Projektwissen ergänzen die CoRe-spezifischen Rollen. Die fremde Referenz wurde ausschließlich gelesen. Ein Generator ersetzt den alten Teilgenerator und erzeugt alle sechs HTML-Seiten aus den kanonischen Quellen und echten App-Komponenten. Keine Produktionsabhängigkeit ergänzt und kein Produktcode geändert; parallel vorhandene Änderungen wurden erhalten.
- Der Katalog enthält sämtliche 49 gemeinsamen Komponenten einschließlich des gemeinsamen Lernkopfs sowie fünf besondere Produktansichten, 83 Tokens, Typografie, kanonische CSS-Regeln mit Bedingungen und 125 importierte Icons. Die sechs manuell erstellbaren Kartentypen verwenden den echten Reviewrenderer. README-Dateien und `AGENTS.md` verankern `docs:build`, `check:docs` und die Pflege der Demos; Typecheck prüft erzeugte Ausgaben, Rollen, Verweise und fehlende Komponentendemos.
- Abgenommen: sieben Dokumentationsprüfungen, Typecheck, Produktionsbuild und Chunk-Budget. Im Codex-In-App-Browser wurden alle sechs HTML-Seiten in Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932, 1280 × 720 und 1440 × 900 erfasst; 72 Seitenfälle ohne horizontales Hauptscrolling. Zusätzlich 72 geöffnete Dialog-/Menü-/Navigationszustände, 60 besondere Produktansichten, Kartentypen mit Aufdecken und Choice-Rückmeldung sowie Umbruchgrenzen geprüft. Screenshot- und JSON-Nachweise liegen lokal unter `test-results/docs/`; sie belegen die Dokumentationsdemos mit lokalen Beispieldaten und ersetzen keine Auth-/Cloud-Abnahme.
- Offen bleiben echte Smartphone-Bildschirmtastatur, physische Touch-/Screenreader-Prüfung und 200-%-Browser-Zoom. Beim Iframe-Neuladen meldet die Browserumgebung teilweise einen `MutationObserver`-Fehler ohne Quellenangabe; die Zuordnung bleibt offen. Die Karten rendern und reagieren, die skriptfreie Iframe-Gegenprobe reproduzierte die Meldung nicht. Eine fehlerfreie Browserkonsole wird daher nicht als abgenommen behauptet.

## 2026-10-02 — Testportfolio geprüft und gestrafft

- Alle 106 ursprünglichen Modultestdateien sowie zwölf Browser-, zwei RLS- und die Start-/Preload-Performance-Suite anhand der aktuellen Besitzer und Verträge geprüft. Drei Mini-Suites sind in ihre Besitzer integriert; umfangreiche selbst geprüfte Typfixtures sind durch Compile-Verträge ersetzt. Zwei doppelte History-/Review-Exit-Journeys, SSR-Tautologien und reine Klassen-/Dekorationsduplikate entfallen. Der Laufzeittestcode schrumpft um mehr als 360 Zeilen; der gesamte Diff bleibt einschließlich Dokumentation und neuer Typverträge negativ.
- Kleine Regressionstests ergänzen Workerabbrüche, Cloudrevisionen/JSONB-/Manifestgrenzen und den Cache-/Outbox-Schutz. Dabei gefundene Fehler korrigiert: APKG-Workerabbrüche während des Commits lassen den Import nicht mehr hängen; Arrays werden vor der Record-Transformation als ungültige JSONB-Objekte abgewiesen. Theme-Kontrast wird anhand der tatsächlich verwendeten CSS-Tokens geprüft. Fehlende Long-Task-Beobachtung bricht die Startmessung ausdrücklich ab, statt ein scheinbar grünes Nullergebnis zu liefern.
- Quality enthält alle schnellen Unit-/Contract-/Integrationsprüfungen. Nightly verwendet einen vollständigen Release-Lauf und ergänzt im selben Supabase-Lebenszyklus nur den abweichenden Beta-Auth-Vertrag. Alle sechs Golden-Journeys sind in Beta enthalten; fokussierte Golden-/Beta-/PR-Läufe starten einen statt vier Vite-Servern. Bestehende Authkonfigurationen bleiben in der Vollsuite.
- Abgenommen: 519/519 Modultests in 102 Dateien, Typecheck samt UI-Katalog, Production-Build und Bundlebudgets. APKG-Benchmark mit 25.000 Karten/1.000 Medien/fünf Vorschaukarten und 0 ms gemessener Workerübergabe bestanden; drei Parserläufe 8,8–32,7 s unter wechselnder Rechnerlast. Kein belastbarer Laufzeitgewinn aus diesem Audit ableitbar.
- Browserauswahl per `--list`: 99 Journeys plus Auth-Setup, davon sechs Golden, 23 Beta und neun Hosted. Tatsächliche Browser-/RLS-/Datenbankdrift-Abnahme offen: Docker Desktop scheitert beim Start seines internen Inference Managers; Hosted wurde nicht ausgeführt. Keine produktive UI geändert. Lernpuffer-/Quota-Servicepfade und Messintegritätslücken bleiben im [`Testportfolio`](test-portfolio.md) priorisiert.

## 2026-10-01 — Stapelaktionen und einheitlicher Lernkopf

- Audit vor dem Main-Push: redundante No-op-Bedingung in der Platzierungsvalidierung entfernt und einen 4-px-Abstandsfehler zwischen Kennzahlen und Donut bei mittlerer Inhaltsbreite korrigiert. Veraltete Browsertestannahmen für Mehrfachauswahl, Aufklappbutton, Speichermeldung und Play nach dem Verschieben sind an die bestehenden Produktverträge angepasst. 84 fokussierte Prüfungen, die vollständige Suite aus 106 Testdateien, das erneute Push-Gate, alle zwölf Stapel-Browsertests sowie 14 lokale RLS-/Zwei-Geräte-Tests und der Typendriftcheck bestehen. Der aktualisierte Nachweis enthält 54 Renderfälle einschließlich 820 px ohne Überlauf, Laufzeitfehler oder ungleichmäßige Kennzahl-/Donutabstände. Keine weitere belegbare Performance-Optimierung gefunden. Auch das lokale Performance-Gate besteht: 50 gedrosselte Start-/Preload-Messläufe und der 100k-Karten-/1m-Review-Benchmark halten alle Grenzwerte ein; Statistik-RPC p95 461,4 ms, Katalogsuche p95 48,09 ms, größte Clientprojektion p95 4,56 ms.

- Play liegt in Dashboard und Lernen direkt neben den Stapeloptionen hinter dem Donut. Beide Icons sind bei unveränderter 44 × 44-px-Klickfläche größer und füllen sich bei Hover beziehungsweise geöffnetem Menü in der jeweiligen Textfarbe; ihre Hintergrundfläche bleibt transparent. Beide Lernansichten verwenden denselben Header mit Lerneinstellungen links und der regulären, rechtsbündigen Bereichsauswahl.
- Abgenommen: 32 fokussierte Tests, vollständige Suite aus 106 Testdateien, Typecheck samt UI-Katalog sowie Produktionsbuild und Chunk-Budget. 48 Chromium-Renderfälle prüfen Dashboard, Lernen und Kartenverwaltung über die Pflichtmatrix in beiden Themes ohne Überlauf oder Laufzeitfehler. Sechs Interaktionsfälle bei 320, 390 und 1440 px prüfen Bereichswechsel, Lerneinstellungen, Play, Tastatur, Optionsmenü/Escape, Hover auf Ebene 1 und 6 sowie Reduced Motion. Screenshots verwenden echte Komponenten mit lokalen Beispieldaten; Auth-, Cloud- und native Geräteflows wurden nicht erneut abgenommen. Der temporäre Render-Einstieg wird entfernt; der Screenshot-Nachweis liegt außerhalb des Repositorys.

## 2026-10-01 — Schmale UI und visueller Prüfnachweis

- Ergänzung: Die visuelle Stapeltiefe endet jetzt auf Ebene 6 bei unverändert vollständiger logischer Hierarchie. Light- und Dark-Farben werden in sechs linearen sRGB-Stufen zwischen den bisherigen Endfarben verteilt. Audit der Änderung und von Commit `415b05b`: keine weitere belegbare Vereinfachung oder Performance-Optimierung; ungenutzte Tiefen-6/-7-Tokens und Zeilenregeln sind entfernt. 64 fokussierte Tests, vollständige Suite (105 Dateien), Typecheck, Produktionsbuild und Chunk-Budget bestehen. 112 Renderfälle und 48 geöffnete Stapelauswahlen bestehen die visuelle Matrix in beiden Themes; die 13-stufigen Unterbäume bleiben auf Dashboard und Lernen auf-/zuklappbar. Browsernachweis mit lokalen Fixtures, keine neue Auth-/Cloud-/Geräteabnahme.

- Dashboard-Begrüßung und Lern-Bereichswechsel passen auf schmale Ansichten; die Bereichs-Pill bleibt 44 px hoch und Lerneinstellungen behalten ihr Icon. Single Choice und Multiple Choice bleiben in einer gemeinsamen Pill mit bei Bedarf zweizeiligen Labels.
- Der Stapelvergleich verwendet auf schmalen Inhaltsflächen bestehende Kennzahlflächen; der lokale Stapelname öffnet die fünfteiligen Stapelinhalte. Die Kartenverwaltung behält ihre Tabellenzeilen. Rich Text erhält eine kurze Toolbar mit ausklappbaren vorhandenen Zusatzaktionen. Die Heatmap verwendet das gemeinsame Zeitraum-Dropdown und zweizeilige Tageslabels bei unveränderter Legende.
- Abgenommen: fokussierte Tests, vollständige Modul-/Contract-/Integrationssuite aus 105 Dateien, Typecheck samt UI-Katalog und Produktionsbuild mit Chunk-Budget. 112 Chromium-Renderfälle prüfen sieben echte Produktansichten mit lokalen Beispieldaten in Light/Dark bei 320 × 720, 360 × 800, 390 × 844, 430 × 932, 1280 × 720, 1440 × 900, 1279 × 900 und 1280 × 900 ohne Seiten- oder Control-Überlauf und ohne Laufzeitfehler. Bereichswechsel, Choice-Auswahl, Toolbar/Textselektion, Farbmenü/Escape, Cloze-Erstellung/Entfernung, Tastaturauswahl und alle Heatmap-Zeiträume sowie der Statistiklink ins Stapelmenü bestehen. Fünf Ansichten bestehen zusätzlich bei 200 % CSS-Zoom ohne Seitenüberlauf; die automatisch geladene Specs-HTML zeigt den geänderten Vertrag.
- Der lokale Screenshot-Bericht enthält sieben Vergleiche mit den alten gehosteten Aufnahmen, Zusatzansichten und das vollständige Renderarchiv. Er ist ein Nachweis echter Komponenten mit Beispieldaten; gespeicherte Authentifizierung, Cloud-Sync und persistente Speicherflows wurden nicht abgenommen. Echte Smartphone-Bildschirmtastatur, physische Touch- und Screenreader-Abnahme sowie nativer Browser-Zoom bleiben offen. Der temporäre Render-Einstieg und die vorherigen Designentwürfe werden entfernt; keine Produktionsabhängigkeit oder paralleler App-Pfad wurde ergänzt.

## 2026-09-30 — Gleitende Hauptnavigation und Statistik-Ladewechsel

- Die zweizeilige untere Hauptnavigation teilt Positionsmessung, Indikator und Bewegung mit den segmentierten Controls. Icon und Tab-Name bleiben sichtbar; Resize und Reduced Motion verwenden denselben Vertrag.
- Statistik-Filterwechsel erhalten ausschließlich das aktuell angezeigte Ergebnis bis zum Ersatz. Auswahl und Dropdownbeschriftung reagieren sofort. Variante A läuft ohne sichtbaren Schriftzug als 3-px-Balken über den vollständigen Filterinnenraum; 8 px Abstand und Balkenhöhe bleiben immer reserviert. Der vollständige Ladebildschirm erscheint beim initialen Eintritt. Überholte Antworten werden verworfen, Aktualisierungsfehler behalten Daten und Filter mit Wiederholung und Rückfokus auf die Zeitraumwahl. Zusätzliche Caches, Abfragen, Vorladung oder Warmhaltung wurden nicht eingeführt.
- Abgenommen: 36 fokussierte Screen-/UI-/Statistikprüfungen, vollständige Modul-/Contract-/Integrationssuite aus 105 Dateien, Typecheck einschließlich UI-Katalog sowie Produktionsbuild und Chunk-Budget. Browserprüfungen verwendeten echte Komponenten mit kontrollierten Antworten für initiales Laden/Fehler, sofortige und verzögerte Antworten, Reihenfolgekonflikte, Zeitraum-/Stapelwechsel, Fehler/Wiederholung, Tastatur, zugängliche Fortschritts-/Live-Semantik und stabilen Fokus/Scroll. Die originalen Reduced-Motion-Regeln wurden auf der Testseite aktiviert und anhand der berechneten Styles geprüft; ein separater Screenreader-Lauf wurde nicht durchgeführt. Light/Dark und 320, 390, 430, 640, 768, 1024, 1280 und 1920 px passen ohne Seitenüberlauf; der Balken schließt links/rechts bündig mit den Filtern ab. In der angemeldeten lokalen App blieb die Filterbox beim Wechsel 125 px hoch; der Screenshot zeigt ihren echten laufenden Ladezustand. Initialgraph 217,5 KiB gzip, größter Lazy-Graph 168,6 KiB gzip, größter Chunk 452,4 kB.

## 2026-08-29 — Unbegrenzte logische Stapelhierarchie

- Die fachliche Acht-Ebenen-Grenze und die APKG-Abflachung sind entfernt. Anlegen, Desktop-Drag, bestätigtes Verschieben und Import erhalten unmittelbare Elternbeziehungen, vollständige Pfade und beliebig tiefe Unterbäume; Reimporte bewahren die lokale Ordnung aus Name, Elternstapel, Pfad und Einstellungen.
- Ebene 8 bleibt ausschließlich die maximale sichtbare Einrückung und Tiefenfarbe. Bibliotheks- und Auswahlprojektionen laufen iterativ; Teilbaumaggregate verwenden direkte Kinder und `descendantCount` statt vollständiger Nachfahrenlisten. Überlaufwarnung, Herkunftssymbol, doppelter Suchpfad und vorbereitende Überlaufmetadaten wurden entfernt, ohne Karten- oder Anki-Tags zu verändern. ADR-031 löst ADR-030 ab; der Tag-TODO enthält keine System-Tag-Ableitung mehr.
- Abgenommen wurden 85 fokussierte Hierarchie-, Import-, Bibliotheks-, Auswahl-, Screen- und Themeprüfungen, die vollständige Suite mit 502 Tests, Typecheck einschließlich UI-Katalog sowie Production-Build und Chunk-Budget. Der gezielte Playwright-Lauf wurde gestartet, konnte aber ohne die ausdrücklich isolierten E2E-Supabase-Zugangsdaten nicht über das Auth-Setup hinauslaufen; die neue 13-stufige Desktop-/Mobiljourney bleibt für diese Umgebung ausführbar hinterlegt.

## 2026-08-28 — Globale Lerneinstellungen und Stapelstandards

- Die sichtbaren `Karteneinstellungen` heißen jetzt durchgehend `Lerneinstellungen`, bleiben unter dem kompatiblen Pfad `/karten-einstellungen` erreichbar und stehen als separater, typografisch vereinheitlichter Button neben der Bereichsauswahl. Allgemeine Einstellungen bleiben auf Konto, Daten/Sync und `Über uns` begrenzt.
- Die globale Seite besitzt nun `Lerntag & Planung`, `Tagesrunde & Lernprofile`, `Scheduler & CoRe` und `Fokuswerkzeuge`. Lernprofile lassen sich dort als Standard wählen; die Speicherleiste unterscheidet den Standard nur für neue Stapel von der ausdrücklichen Übernahme auf alle vorhandenen und neuen Stapel. Name, Hierarchie, Darstellung, CoRe-Modus, Karten und Reviewhistorie bleiben dabei erhalten.
- `Profile.schedulerPreferences` normalisiert Version 2 ohne Datenbankmigration auf Version 3 mit einem vollständigen globalen Stapelstandard. Manuelle, importierte und Demo-Stapel erhalten ihn bei der Neuerstellung; Reimporte behalten lokale Einstellungen. Das Copy-on-Apply-Prinzip vorhandener Stapel bleibt bestehen.
- Abgenommen wurden 51 fokussierte Einstellungs-/UI-Tests, die vollständige Suite mit 500 Tests, `npm run gate:push` einschließlich Unit-/Contract-Gate, Typecheck, UI-Katalog, Production-Build und Chunk-Budget. Der lokale Browser-Smoke bestand bei 1.352 × 900 und 390 × 844 px ohne Fehleroverlay, Konsolenwarnung oder horizontalen Überlauf; ohne lokale Testsitzung blieb die Live-Prüfung erwartungsgemäß am Auth-Gate, während die geschützte Einstellungsansicht über Renderingtests verifiziert wurde.

## 2026-08-28 — Stapeleinstellungen auf Unterstapel übertragbar

- Die Speicherleiste der Stapeleinstellungen unterscheidet das Speichern des gewählten Stapels vom rekursiven Speichern für den Stapel und alle Unterstapel. Die Baumoption erscheint nur bei vorhandenen Unterstapeln.
- Rekursives Speichern übernimmt feldgenau nur die gegenüber dem gespeicherten Stand geänderten Darstellungs-, Lern-, Scheduler- und CoRe-Werte. Unterstapelnamen und nicht geänderte individuelle Werte bleiben erhalten; alle betroffenen Stapel laufen durch eine gemeinsame lokale Metadatenmutation und die bestehende Sync-Outbox.
- Abgenommen wurden 15 fokussierte Draft-, Speicherleisten- und Stapeleinstellungs-Tests, Typecheck, Production-Build einschließlich Chunk-Budget sowie ein lokaler Browser-Smoke mit HTTP 200, sichtbarem Auth-Gate und ohne Konsolenfehler oder Vite-Overlay. Die angemeldete Einstellungsroute wurde im Browser-Smoke mangels Testsitzung nicht geöffnet.

## 2026-08-28 — Achtstufige Stapelhierarchie

- CoRe unterstützt Hauptstapel plus sieben Unterebenen. Eine gemeinsame reine Projektion flacht APKG-Quellknoten ab Ebene 9 als getrennte Geschwister auf sichtbare Ebene 8 ab; stabile IDs, Karten-Zuordnung, vollständiger Anki-Pfad, Quelltiefe und ursprünglicher Elternpfad bleiben erhalten.
- Manuelles Anlegen und Verschieben lehnt Ebene 9 sowie weiterhin zu tiefe Altbaum-Platzierungen ohne Mutation ab. Acht lineare Light-/Dark-Gruppentöne, Einrückung bis Tiefe 7, zweizeilige schmale Stapelnamen, Importwarnung, Herkunftssymbol, Originalpfad im Menü sowie Suche und Auswahl über beide Pfade sind umgesetzt. Kartentags und Persistenzschema blieben unverändert; die spätere System-Tag-Projektion ist ausschließlich als Folgefeature dokumentiert.
- Abgenommen wurden 66 fokussierte Hierarchie-, Import-, Workspace-, Such-, Auswahl- und Themeprüfungen, die vollständigen Unit-/Contract-Kategorien mit 98 Testdateien, Typecheck einschließlich UI-Katalog und Production-Build. Die tatsächliche gemeinsame Stapelzeile wurde bei 1.280 × 900 und 390 × 844 px geprüft: acht Tiefenflächen, Begrenzung auf Tiefe 7, genau zwei Namenszeilen, zugänglicher Herkunftshinweis, kein horizontaler Überlauf und keine Browserwarnung.

## 2026-08-18 — Replica-v2 auf frische Pre-Release-Baseline gehärtet

- Die vierzehnteilige Supabase-Kette und der doppelte Schemaanker wurden durch eine einzelne frische Baseline plus Verify-SQL ersetzt. Lokaler Reset, generierte Typen, Typdrift und 13/13 RLS-/Zwei-Geräte-Fälle sind grün. Die alten Voll-Delta-/Bootstrap-RPCs, `due_count` und der administrative Katalog-Backfill fehlen nachweislich.
- IndexedDB und Mediencache verwenden frische v2-Datenbanken mit Schema-Version 1 ohne Upgrade-, Marker- oder Legacy-localStorage-Pfade. Lokale v5-Stapelprojektionen, Fälligkeits-Buckets und deren Rebuildzustände wurden entfernt; Summary, Katalogindex und `AccountStudyOverview` bilden den einzigen Studienpfad.
- Serverpagination liefert exakt die angeforderte Keyset-Seite. Medienblobs führen alle referenzierenden Stapel und werden beim Pinnen per SHA-1 geprüft. Bootstrap-Browserlistener enden nach dem ersten Erfolg; Online-Statistik überspringt den lokalen Vollscan und liefert begrenzte Aggregate für alle vorhandenen Panels.
- Abgenommen wurden 625/625 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, Schema-Verify, warnungsfreier DB-Lint, Typdrift, 13/13 RLS-/Zwei-Geräte-Fälle sowie das lokale Playwright-Release-Gate mit 94 bestandenen und einem erwartbar übersprungenen Test. Der wiederholte gedrosselte Lauf bestand mit Wiederholungsstart p75/p95 678/751 ms, Offline-Kaltstart 677/806 ms, Frischstart p75 2.640 ms, persistierter Summary p75 8,7 ms und keinem gemessenen Hintergrund-Long-Task. Der Build maß 228,5 KiB initial und 163,1 KiB im größten Lazy-Graphen.
- Die transaktionale 100k-Karten-/1m-Review-Fixture misst den tatsächlichen SQL-Pfad: Karten-Suche p75/p95 47,54/51,22 ms, Statistik-RPC lokal p75/p95 459,52/462,23 ms und Clientprojektion höchstens 5,72 ms p95. Lokale `EXPLAIN (ANALYZE, BUFFERS)` lagen für den kalten Bootstrap bei 532 ms, Delta 12 ms, Kartenliste 3 ms, Hydrierung 14 ms, Manifest 5 ms und die kleine Statistik 11 ms.
- Projektliste, Link und vorhandene Daten identifizierten `hirbiuiydczmnjqtoyqx` eindeutig als `CoRe-Database` in Frankfurt: vor dem Reset 5 Auth-Nutzer, 12 Sitzungen, 108 Objekte im privaten `core-media`-Bucket, 51 Stapel, 551 Karten und 7.561 Reviews. Das getrennte Projekt `smarter-nutrition` blieb unberührt. Sitzungen, Storage-Objekte und Auth-Nutzer wurden über ihre vorgesehenen APIs gelöscht; anschließend wurde das bestätigte Pre-Release-Projekt ohne Seed aus der einzigen Baseline neu aufgebaut.
- Die Statistikfunktion vermeidet nach einem YAGNI-Audit den teuren beliebig genauen `numeric`-Potenzscan und berechnet ausschließlich die begrenzten 5-Prozent-Retrievability-Buckets in `double precision`. 366.000 Kombinationen aus Stabilität und verstrichenen Tagen ergaben keine Bucketabweichung. Lokal sank der tatsächliche 100k-/1m-RPC von p75/p95 1.304/1.540 ms auf 459,52/462,23 ms; der Katalogpfad blieb mit 47,54/51,22 ms deutlich unter seinem Gate. Der Performancefix ist Commit `f16e62f`.
- Die gehostete kanonische Fixture umfasste 100.000 Karten und tägliche Rollups über genau 1 Mio. logische Reviews. Warme p95-Werte lagen bei Bootstrap 146,50 ms, Delta 24,29 ms, Kartenliste 112,65 ms, Hydrierung 3,62 ms, Manifest 21,77 ms und Statistik 984,12 ms; erste kalte Aufrufe blieben mit höchstens 2.406,37 ms unter dem 3-Sekunden-App-Kaltstartgate. `EXPLAIN (ANALYZE, BUFFERS)` wurde für alle sechs Replica-Lese-RPCs erfasst. RLS zeigte 100.000 Eigentümerkarten und 0 Karten aus einem fremden Account. Ein zusätzlicher Versuch mit 1 Mio. physischen `review_events` überschritt das aktuelle Hosted-Volume und wurde vollständig zurückgerollt; diese Retention-/Kapazitätsgrenze bleibt offen.
- Das isolierte staged Production `dpl_Daropk4PSerq8wzKUmS8iSPxzST8` unter `https://core-hosted-napbxmcwd-bengt2.vercel.app` war `READY`; der Build maß 228,5 KiB initial und 163,1 KiB im größten Lazy-Graphen. Der geschützte Hosted-Lauf bestand mit einem Auth-Setup und neun Kernverträgen. Es erfolgte keine Promotion der kanonischen Domain. Danach wurden Testaccount und zwei Testmedien gelöscht und das Remote-Projekt erneut zurückgesetzt: Auth, Sitzungen, Storage-Objekte, Profile, Stapel, Karten, Katalog, Reviews und Rollups stehen bei 0; der leere private `core-media`-Bucket, Schema-Verify und Remote-DB-Lint sind grün.

## 2026-08-17 — Hybride Offline-Replica

- Supabase besitzt additive, accountisolierte Projektionen für Kartenkatalog und Stapelstatistiken sowie versionierte, bytebegrenzte RPCs für Bootstrap, Katalogdelta, Suche, Kartenhydration, Statistik und Offline-Manifeste. Kanonische Karten, Varianten, Dokumente und Reviews bleiben die Schreibwahrheit; Projektionstrigger verändern keine fachliche Revision.
- IndexedDB v6 trennt Stapel-Hüllen, Summaries, Katalog, vollständige Kartenkörper, Residency, Offline-Manifeste, Statistik-Snapshots und Synczustand. Die Migration arbeitet fortsetzbar in höchstens 250er-/25-ms-Abschnitten. Ein Hydration-Service übernimmt Kartenöffnung, serverseitig ergänzte 50er-Seiten, Lernfenster, vollständige Deck-Downloads, Medienprüfung und Quota-LRU.
- Bekannte Geräte starten aus der lokalen Replica; neue Geräte warten nur auf eine bestätigte erste Bootstrap-Seite. Ein fehlgeschlagener Erstabgleich erzeugt keine falsche Leeransicht und wird mit 2/10/30/120 Sekunden, danach fünfminütig sowie bei Online, Fokus und manueller Aktion wiederholt. Ein Race zwischen Bootstrap und bereits versendeten Offline-Profiländerungen wurde geschlossen.
- Kartenverwaltung und Lernen zeigen Katalogdaten sofort und laden Körper bedarfsgesteuert. Der Lernstart wartet nur auf die erste benötigte Karte, hält je nach Verbindung 50 oder fünf Karten vor und lädt bei 25 verbleibenden Karten nach. Angeheftete Downloads werden erst nach Karten-, Revisions-, Abhängigkeits- und Medienprüfung als offline verfügbar markiert; lokale Änderungen und aktive Lernfenster bleiben vor Bereinigung geschützt.
- Statistiken lesen serverseitige Aggregate mit optimistischer lokaler Ergänzung. Export und Reimport hydratisieren benötigte Cloud-Strukturen vollständig; accountweite Stapelbaum-Löschungen werden online serverseitig ausgeführt oder offline als Deckkommando vorgemerkt.
- Lokal bestätigt wurden 644 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, Datenbankreset und -typdrift, Schema-Verifikation, 13/13 RLS-/Zwei-Geräte-Fälle sowie fokussierte Browserjourneys für Offline-Profil-Sync, Offline-Review, Kartenhydration, Direktlinks, Lernstart, Löschen, Restore, Varianten, Portabilität, schmale Kartenverwaltung und große scrollende Stapel. Die großen 10k/250k- und 100k/1m-Lastfixtures sowie Messungen am tatsächlich konfigurierten Hosted-Projekt bleiben als dokumentierte Skalengates offen.

## 2026-08-16 — Adaptive Preloads und lokale Stapelprojektionen

- Automatisches Idle-Preloading lädt `Lernen` und `Karten` seriell nur bei 4G oder fehlender Network-Information. 3G erlaubt ausschließlich Hover, Fokus oder Touchstart; Save-Data, 2G, unsichtbare Tabs und Nutzerinteraktion verhindern weitere Spekulation. Der kontrollierte 4G-Lauf verursachte keinen Long Task, alle 3G-Läufe blieben ohne automatischen Preload. Ein weiterer Editor-Chunk-Split war deshalb nicht erforderlich.
- IndexedDB v5 hält löschbare Stapelprojektionen, Fälligkeits-Buckets, einen Stapel-/Kartenindex und einen fortsetzbaren Rebuild-Checkpoint. Einzelne Karten- und Reviewwrites aktualisieren die Ableitung atomar; Bulk-, Cloud-, Restore- und Konfliktpfade markieren betroffene Stapel dirty. Rebuilds arbeiten in höchstens 250er-/25-ms-Abschnitten, prüfen Dirty-Token und Kontext und schließen Konfliktkarten aus. Tagesfortschritt liest nur den aktuellen Lerntag, historische Heatmapwerte stammen weiterhin aus den stündlichen Reviewzählern.
- Der finale gedrosselte Lauf mit je zehn Wiederholungen bestand vollständig: Wiederholungsstart p75/p95 0,742/0,831 Sekunden, Offline-Kaltstart 0,482/0,576 Sekunden, Frischstart p75 2,786 Sekunden, persistierter Summary-Read p75 7 ms und längster direkt gemessener Projektions-/Hintergrundabschnitt 9,4 ms. Der Service Worker war im p75-Vergleich 576 ms schneller und blieb unverändert. Der Production-Build maß 217,3 KiB gzip im Initialgraphen und 163,1 KiB im größten Lazy-Graphen.
- Repositoryverträge decken unterbrochenen Rebuild, Reload, Review, Kartenänderung, Cloud-Delta/-Reset, Konflikte, Tageskontextwechsel und einen 100k-Karten-/1m-Reviews-Vertrag ohne vollständigen Karten-, Varianten- oder Reviewread beim normalen Boot ab. Die vollständige 100k-Browserjourney und Feldmessung bleiben als LATER-Nachweis offen.
- Der Reviewstart aus den Stapeleinstellungen ersetzt deren Browser-History-Eintrag nun anhand der tatsächlich sichtbaren Ansicht; dadurch entsteht kein doppelter, identischer Review-Eintrag. Abgenommen wurden alle 625 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, das vollständige Performance-Gate, Datenbanktypdrift, 12/12 RLS-/Zwei-Geräte-Fälle und das lokale Playwright-Release-Gate mit 90 bestandenen und einem erwartbar übersprungenen Test.

## 2026-08-16 — Reproduzierbare Startmessung

- Datenbanköffnung, Shell, Outbox samt vier Sync-Metadaten und erste Stapelzusammenfassung besitzen getrennte anonyme Performancephasen. Outbox und Sync-Metadaten werden in einer gemeinsamen Readonly-Transaktion geladen; Profil- und Karteninhalte gelangen nicht in das Artefakt.
- Das lokale Production-Gate misst je zehn Starts für einen wiederkehrenden Browser, einen frischen isolierten Kontext, einen persistenten Kontext ohne Service Worker und einen Offline-Kaltstart bei 1,6 Mbit/s, 150 ms RTT und vierfacher CPU-Verlangsamung.
- Der gemessene Wiederholungsstart bestand mit p75 0,69 Sekunden und p95 0,74 Sekunden, der Offline-Kaltstart mit p75 0,44 Sekunden und p95 0,49 Sekunden. Der Frischstart bestand mit p75 2,78 Sekunden. Der Service Worker war im p75-Vergleich 560 ms schneller und erhält daher kein Navigation-Preload.
- Das Gesamtgate bleibt rot, weil der längste Hintergrundtask 231 ms statt höchstens 50 ms benötigte. Die erste Stapelzusammenfassung dauerte bis 503 ms und verursachte den 231-ms-Long-Task; ein spekulativer Feature-Load überlappte maximal 58 ms. Gemäß Roadmap wird die dauerhafte O(Stapel)-Projektion deshalb in NOW vorgezogen und das Preload-Task-Budget nachgehärtet; große Inhaltstrennung und Navigation-Preload bleiben zurückgestellt.

## 2026-08-15 — Profilintegrität nach Local-first-Start

- Das Auf- und Zuklappen eines Stapels schreibt wieder das vollständige Profil. Gemeinsame Laufzeitprüfungen weisen unvollständige Profilwrites vor IndexedDB und vor dem Supabase-Upsert zurück.
- Der erfolgreiche Cloud-Bootstrap entfernt ausschließlich alte unvollständige Profilpatches, übernimmt das vollständige Cloud-Profil, rettet gültige UI-Präferenzen und reiht nur bei einer Abweichung genau einen vollständigen Ersatzpatch ein. Vollständige Offline-Profiländerungen sowie Karten-, Review-, Import- und Medienmutationen bleiben erhalten; offline wird nichts verworfen.
- Abgenommen wurden 60 fokussierte Profil-, Repository-, Boot- und Cloudtests, 616/616 Modul-/Contract-/Integrationstests, Typecheck, Production-Build, Datenbanktypdrift, 12/12 RLS-Fälle sowie das vollständige lokale Playwright-Gate mit 90 bestandenen und einem erwartbar übersprungenen Test. Der neue Browservertrag bestätigt Stapelumschaltung, Einstellungen, Reload und einen frischen isolierten Kontext mit demselben Cloud-Profil.

## 2026-08-15 — Local-first Performance-Grundlage

- Der Accountstart öffnet nach einer Accountprüfung zuerst die lokale IndexedDB-Shell. Profil-/Stapel-Bootstrap, global cursorbasierte und bytebegrenzte Account-Deltas, Konflikte, Reparatur und Medien laufen nach. Kartenverwaltung und Lernen lesen 50er-Seiten; die Sitzung fordert bei 15 verbleibenden Karten nach. Ein eingerichtetes Gerät kann bei einem reinen Netzwerkfehler aus derselben persistierten Supabase-Sitzung offline kalt starten.
- Produktscreens, Supabase-Client, Cloud-/Mediencode und Statistikmodell werden dynamisch geladen. Lernen und Karten werden nach einer ruhigen Sekunde seriell vorbereitet; Datensparmodus, langsames Netz, Hintergrundtab und Interaktion stoppen Spekulation. Der Production-Build sank gegenüber 271,6 KiB Ausgangswert auf 211,8 KiB gzip im Initialgraphen; der größte Lazy-Graph misst 163,1 KiB gzip.
- Die ausführbaren Gates, Performance-Marken, PWA-App-Shell, persistente Speicheranfrage und sichtbare Quotenanzeige sind vorhanden. Der Browser-Smoke bestätigte Login-Shell, fehlendes Fehleroverlay, null CLS, 184 ms lokales LCP, 6,8 ms lokales TTFB und keinen horizontalen Überlauf bei 390 px; dies ersetzt ausdrücklich nicht den offenen gedrosselten 100k-/1m-Nachweis.
- 110 fokussierte Performance-, Repository-, Sync-, Auth- und Pagingprüfungen sowie alle 605 Modul-/Contract-/Integrationstests, Typecheck, Dokumentationscheck, Production-Build und JavaScript-Syntaxcheck des Service Workers waren grün. Datenbanktypdrift und RLS konnten mangels laufendem Docker Desktop nicht ausgeführt werden; die neue SQL-Migration bleibt deshalb vor Merge lokal nachzuprüfen.

## 2026-08-14 — Synchronisation 2.0

- Der kanonische `syncNow()`-Zyklus schreibt lokale IndexedDB-Transaktionen, überträgt Outbox-Mutationen einzeln, lädt anschließend alle `sync_change_id`-Deltas und aktualisiert Konflikt- und Statusdaten. Manueller Sync lädt auch bei leerer Outbox; Autosync ist accountgebunden und reagiert entprellt auf lokale Änderungen, Start, Online, Fokus sowie ein sichtbares Intervall von 0, 1, 5, 15 oder 30 Minuten.
- Fachliche Inhaltsrevisionen ignorieren technische Eigentümer-, Zähler-, Import- und Projektionsfelder. Reviews bleiben idempotente append-only Ereignisse, erhöhen keine Inhaltsrevision und überschreiben den Lernstand nur, wenn sie zeitlich neuer sind. Fehlende Originalvarianten vorhandener Cloud-Karten sowie technische Alt-Abweichungen werden idempotent repariert; ein Konflikt blockiert nur die betroffene Entität.
- Aktive Konflikte sind pro Account, Tabelle und Entität eindeutig. Konfliktkarten werden aus der Lernwarteschlange genommen, bleiben in der Kartenverwaltung sichtbar und können gesammelt mit einer Folgenvorschau für `Dieser Browser` oder `Cloud im Account` aufgelöst werden. Die Richtungsentscheidung entfernt die verursachende Outbox-Mutation; Reviews, Medien und konfliktfreie Inhalte bleiben unberührt.
- Navigation und globale Einstellungen zeigen Sync-Status, Konfliktzahl, ausstehende Änderungen, letzte erfolgreiche Synchronisierung, Intervall und einen vollständigen manuellen Sync. IndexedDB bleibt beim Schließen die sichere Wiederanlaufwahrheit; der letzte Browser-Sync ist ausdrücklich nur bestmöglich.
- Lokal bestanden 66 fokussierte Sync-/Repository-/Einstellungsprüfungen, alle 585 Modul-, Contract- und Integrationstests, Typecheck, Produktionsbuild, Schema-/Typdriftprüfung und 12/12 RLS-/Zwei-Geräte-Fälle. Der Sync-Konfliktpfad wurde im In-App-Browser auf Desktop und Mobil einschließlich Richtungsfolgen, Light/Dark und manuellem Vollabgleich geprüft. Der vollständige lokale Browserlauf wurde ausgeführt, bleibt im gemeinsamen uncommitteten Arbeitsbaum aber mit 16 Fehlschlägen in bereits parallel geänderten Import-, Navigations-, Kartenprofil-, Medien- und Statistikpfaden offen; 66 Fälle bestanden, einer wurde übersprungen.

## 2026-08-13 — Dependency-Sicherheitsgate geschlossen

- `pdfjs-dist` wurde gezielt auf 6.2.108 und `postcss` auf 8.5.26 angehoben. PostCSS besitzt weiterhin die transitive Abhängigkeit auf `nanoid`, die das Lockfile ohne direkte Projektabhängigkeit auf 3.3.18 auflöst; weitere Dependency-Upgrades gehörten nicht zu diesem Sicherheitspaket.
- Ein sauberes `npm ci` reproduzierte den Lockfile-Stand, und `npm audit --omit=dev` endete mit null Schwachstellen. Sieben PDF-/Worker-Fokustests, 542/542 Modul-, Contract- und Integrationstests, Typecheck, Production-Build und Bundlebudgets blieben grün.
- Das lokale Beta-Gate bestand mit 22/22 Browserfällen einschließlich Beta-Login und PDF-Quellenanker. Das Release-Gate bestätigte Datenbanktypdrift, 12/12 RLS-Prüfungen sowie 79 bestandene und einen erwartbar übersprungenen Browserfall.

## 2026-08-13 — Dynamische Karten- und Skalierungshärtung

- Karteninhalt besitzt mit `LearningItemDocumentV1` und deduplizierten Notetype-Definitionen eine Schreibwahrheit; vollständige Definitionen und Quellsnapshots werden nicht mehr über Kartenmetadaten dupliziert. Renderer und Templatecache sind synchron und von der initialen Core-Seam getrennt. Die öffentlichen Exporte sanken gegenüber dem Freeze in `coreModel` von 66 auf 52, in `apkgImport` von 32 auf 4 und in `cloudRepository` von 24 auf 18.
- APKG erzeugt Commitgraph, Bericht und höchstens fünf Samples genau einmal im Worker und streamt den Graphen in IndexedDB-Chunks. Der produktive Browserpfad besitzt keinen Direktparser-Fallback; die Protobuf-Dekoder werden als eigener Lazy-Chunk geladen, wodurch der Main-Thread-APKG-Chunk von 96,9 auf 87,3 kB sank. Boot, Kartenbrowser, Review und Statistik verwenden begrenzte Entityabfragen; eine Reviewantwort schreibt lokal eine Transaktion und synchronisiert genau einen atomaren RPC. Cloudlisten verwenden 500er-ID-Keyset-Seiten, begrenzte Writes und keinen vollständigen Readback.
- Gegen die eingefrorene Basis von 7.017 zusätzlichen handgeschriebenen Produktionszeilen verbleiben nach demselben Filter 5.564 Zeilen, also 20,7 Prozent weniger. Der Production-Build hält die komprimierten Budgets; der initiale Hauptchunk misst 478,5 kB roh statt rund 492 kB am Freeze.
- Lokal bestätigt: 542/542 Modul-, Contract- und Integrationstests, Typecheck einschließlich UI-Katalog, Production-Build, Datenbank-Reset über beide neuen Migrationen, Typgenerierung und Typdrift, Schema-Verifikation, 12/12 RLS sowie der vollständige Release-E2E-Lauf mit 79 bestandenen und einem im normalen Release-Modus erwartbar übersprungenen Beta-Artefakt-Test. Das Golden-Gate bestand separat mit Auth-Setup und sechs Kernjourneys.
- Der abschließende 25.000-Karten-/1.000-Medien-APKG-Median lag bei 15,01 Sekunden Gesamt- und 14,68 Sekunden Workerzeit, rund 688 MiB Workerheap, 25,73 ms maximaler Main-Thread-Verzögerung und 0,41 ms Ergebnisübergabe. Das überschreitet die frühere optionale Rust-Spike-Schwelle, Rust/WASM bleibt aber bewusst außerhalb dieses Pakets. `npm audit --omit=dev` meldet drei bekannte Findings im unverändert eingefrorenen PDF.js-/PostCSS-Stand und transitivem `nanoid`; die frühere Aussage „ohne Production-Vulnerability“ ist damit nicht mehr aktuell und wird nicht als Gate dieser Härtung behauptet.

## 2026-08-12 — Dynamische Karteninhalte und erhaltender Anki-Import

- Das kanonische Inhaltsmodell ist feldzentriert: `LearningItemDocumentV1`, unveränderliche Notetype-Definitionen und stabile Variantenprojektionen ersetzen feste Kartentypen als fachliche Wahrheit. Die manuelle Erstellung beginnt mit Vorder- und Rückseite und ergänzt Bilder, Lücken, Rückrichtung, Multiple Choice und weitere Felder als kombinierbare Aktionen beziehungsweise Rezepte.
- Legacy- und V18-APKG erhalten bekannte und unbekannte Notetype-, Feld- und Template-Konfigurationen einschließlich Roh-Protobuf, CSS, IDs, Medien- und Schedulerquellen. Dreiwege-Reimport schützt lokale Feldänderungen; jede Anki-Card bleibt eine separat reviewbare Variante. Ein gemeinsamer CSP-/Sandbox-Renderer versorgt Importvorschau, Kartenverwaltung und Review und zeigt bei nicht sicher ausführbaren Funktionen eine diagnostizierte Feldansicht.
- CSV- und Tabellenimporte besitzen eine bestätigungspflichtige, ausschließlich deterministische Spaltenzuordnung; der APKG-Integritätspfad bleibt davon getrennt.
- Zwei agentische Browserrunden prüften Erstellung, CSV-Mapping, importierte Felder und gemeinsame Präsentationen in Light/Dark, Reduced Motion, per Tastatur sowie von 320 bis 1.920 px und an den tatsächlichen Breakpoints. Gefundene P1-Befunde zu Cloze-Auswahl, Dirty-State, Statusmeldungen und Reflow wurden behoben; die zweite Runde fand in den erneut geprüften Kernpfaden keine offenen P0/P1. Die isolierte Auth-Oberfläche bestand zusätzlich bei exakt 160 CSS-Pixeln ohne Clipping, Konsolen- oder Seitenfehler.
- Der damalige Zwischenstand bestätigte 624 Modul-, Contract- und Integrationstests, Typecheck einschließlich UI-Katalog, Production-Build mit einem größten Hauptchunk von 491,9 kB, Datenbanktypdrift, Schema-Verifikation, die vollständige 12-Test-RLS-Suite und den 25.000-Karten-/1.000-Medien-APKG-Benchmark. Persistierte Playwright-Durchstiche bestanden für den kompletten Basic-Lebenszyklus sowie die Latest-APKG-Analyse; die nachfolgende gemeinsame Skalierungshärtung und ihr geschlossener Release-Lauf sind im Eintrag vom 13. August dokumentiert.

## 2026-08-11 — Hierarchische Tageslimits, Sortierung und Easy Days

- Eine gestartete Baumrunde berücksichtigt Neu- und Reviewbudgets jedes enthaltenen Stapels und seiner aktiven Vorfahren. Reviews sowie tagesübergreifende Lernschritte reservieren Reviewbudget vor neuen Karten; Intraday-Schritte umgehen Limits. Durch Limits verborgene fällige und neue Karten werden am Start und Abschluss verständlich ausgewiesen.
- Lernprofile und materialisierte Stapeleinstellungen führen getrennte Sortierungen für neue Karten und fällige Reviews. Alter, stabiler Lerntagszufall, Überfälligkeit und tatsächliche FSRS-Abrufwahrscheinlichkeit bestimmen die Auswahl vor dem bestehenden Modus `Neue zuerst / Gemischt / Wiederholungen zuerst`.
- Der globale Wochenrhythmus führt je Wochentag `Normal`, `Weniger` oder `Minimal`. Easy Days verteilt ausschließlich neue Review-Tagesintervalle von 3 bis 90 Tagen innerhalb des offiziellen FSRS-Fensters anhand der Last aller aktiven Stapel; Vorschau und Commit teilen denselben DST-sicheren Kontext. Profil-JSONB und Portabilität wurden ohne Schemaänderung erweitert.
- Die fokussierte Abnahme war unmittelbar nach beiden Paketen mit 102 Prüfungen grün; der nachgelagerte Vereinfachungsaudit bestand mit 70 betroffenen Queue-/Scheduler-/Bibliotheksprüfungen sowie sechs Easy-Days-Grenzfällen. Die Browserabnahme bestätigte Light und Dark bei 390, 768 und 1.440 px, Tastaturauswahl und fehlenden horizontalen Überlauf. Die Paket-Builds waren grün. Im abschließenden gemeinsamen Arbeitsbaum wurden `typecheck`, `build`, `npm test` und `test:beta` zusätzlich ausgeführt, blieben aber ausschließlich an parallel entstehenden, sachfremden APKG-/HTML-Sicherheitsänderungen hängen; das lokale Supabase-Browsergate war bereits ohne laufendes Docker Desktop extern blockiert.

## 2026-08-11 — Getrennte globale und stapelspezifische Einstellungen

- Globale Stapel-Defaults und die fehlerhafte Bulk-Mutation wurden entfernt. Tagesbeginn und Vorziehfenster werden accountweit an Queue und Sitzung übergeben; Tageslimits, Scheduler und CoRe bleiben materialisierte Stapelwerte.
- Eigene benannte Lernprofile sind konto-weite, versionierte Copy-on-apply-Vorlagen. Cloud- und lokale Normalisierung sowie Portabilität transportieren die Bibliothek ohne Datenbankmigration; Import-ID-Kollisionen werden sicher getrennt.
- Beide Einstellungsseiten besitzen drei responsive CoRe-Bereichskarten, direkte Quernavigation und mobil stabile Seitenköpfe. Die decklose Route bietet eine Stapelauswahl; Sprache ist ehrlich als `Deutsch (Beta)` gekennzeichnet.
- Lokal bestätigt: 525 Modul-, Contract- und Integrationstests, Typecheck, Production-Build sowie Browserabnahme in Light und Dark bei 390, 768 und 1.440 px. Die Profiljourney Anlegen, Anwenden, lokal Ändern und Speichern funktionierte ohne horizontalen Überlauf; zwei nachgelagerte Agentenaudits fanden und verifizierten die Legacy-, Import- und Vereinfachungskorrekturen.

## 2026-08-10 — Globaler Pomodoro-Timer

- Ein einziger accountgebundener, browserlokaler Timer wird aus globalen Einstellungen oder Lerneinstellungen gestartet. Er speichert Start, Ende und Dauer statt heruntergezählter Zwischenstände, ersetzt einen laufenden Timer sofort und bleibt dadurch über Hintergrunddrosselung, Navigation, Reload und weitere Tabs driftfrei.
- Der laufende Timer erscheint im Review, in der Desktop-Sidebar und unterhalb von 1.280 px als 22 px hohe Projektion in der Kopfleiste. Der Lernbalken behält ohne Timer den Zustand `Nicht gestartet`; globale Projektionen verschwinden nach dem Ablauf. Der vorhandene schließbare Toast meldet exakt `Timer abgelaufen.`.
- Lokal bestätigt: 27 fokussierte Timer-/UI-Tests, die vollständige Modulsuite mit 505 Tests, Typecheck und Production-Build. Das lokale Datenbankgate bestätigte 11 RLS-/Storage-/Zwei-Geräte-Prüfungen. Playwright bestätigte automatisiert den Start aus den Lerneinstellungen sowie Ablauf, Entfernung und Toast; der interaktive In-App-Browser bestätigte zusätzlich Ganzzahlfehler und ARIA-Zustand, globalen Start, sofortigen Ersatz, Navigation, Reload und Tab-Synchronisierung. Die visuelle Prüfung bei 390, 767, 768, 1.279 und 1.280 px ergab keinen horizontalen Überlauf, den vorgesehenen Navigationswechsel und keine Konsolenwarnungen oder -fehler.

## 2026-08-06 — Anki-inspirierte Statistik im CoRe-Design

- Der bisherige Statistikpfad wurde durch ein einziges indexiertes Projektionsmodell und einen lazy geladenen CoRe-Screen ersetzt. Eine globale Auswahl steuert 30 Tage, 90 Tage, ein Jahr oder den Gesamtverlauf sowie Sammlung, Oberstapel und deduplizierte Mehrfachauswahl. Aktivität, Lernzeit, Kalender, Planung, Bestand, Intervalle, FSRS, Antwortverhalten, wahre Erinnerungsquote, Stapelvergleich und schwierige Karten verwenden dieselbe Projektion und höchstens 240 aggregierte Punkte je Reihe.
- Reviewantwortzeiten werden von der sichtbaren Karte bis zur Bewertung monoton gemessen, bei 60 Sekunden gedeckelt und optional im bestehenden Review-Event gespeichert. Der APKG-Pfad übernimmt zuordenbare Anki-Revlog-Ereignisse deterministisch und duplikatfrei ausschließlich für Analysen; aktuelle Fälligkeit und FSRS-State bleiben neutral.
- Neu sind ausschließlich `recharts@3.10.1` und das dazu passende direkte `react-is@19.2.7`. Der Production-Build hielt das feste Chunkbudget mit einem 477,2-kB-Statistikchunk ein.
- Lokal bestätigt: 447 Modul-/Integrationsprüfungen, Typecheck, Production-Build sowie ein reproduzierbarer Lauf mit 250.000 synthetischen Review-Ereignissen. Nach der featurekonstanten Projektionsoptimierung benötigte der abschließende Lauf 68 ms für den Index, 311 ms für den kalten Standardzeitraum, 8–29 ms für anschließende Wechsel zwischen 30 Tagen, 90 Tagen und einem Jahr sowie 327 ms für den Gesamtverlauf; Diagrammreihen blieben bei höchstens 115 Punkten und der tägliche Jahreskalender bei 365 Zellen. Es gilt bewusst kein geräteabhängiges CI-Zeitlimit. Die manuelle Browserabnahme in Light und Dark bei Desktop-, Tablet- und 390-px-Mobilbreite bestätigte globale Filter, Maus-/Touch-/Tastaturdetails und keinen horizontalen Hauptscroll.
- Der vollständige Modullauf war mit 441 Tests grün. Das lokale Release-Gate bestätigte Datenbanktypen und alle 11 RLS-/Storage-/Zwei-Geräte-Prüfungen; nur die anschließende vollständige Playwright-Suite blieb offen, weil ein parallel gestarteter fremder Dev-Server den vorgeschriebenen Port 5190 belegte.

## 2026-08-06 — Basic + Bilder und Kartentyp-Icons

- Die manuelle Erstellung unterstützt den neuen Kartentyp `Basic + Bilder`. Vorder- und Rückseite besitzen weiterhin Rich Text und zusätzlich je ein optionales Bildfeld mit Einfügen per Strg+V, Drag-and-drop, Dateiauswahl, Vorschau, Ersetzen und Entfernen.
- Alle Kartentypen zeigen ein eigenes Icon links vom Namen. Bild-Bytes bleiben im accountgebundenen Mediencache und der bestehenden Upload-/Retry-Queue; Karten und Cloud-JSONB speichern ausschließlich SHA-1-Referenzen.
- Der neue Typ durchläuft denselben validierten Front-/Back-, Kopier-, Persistenz- und Reviewvertrag wie Basic, bleibt aber bewusst von der textbasierten KI-Variantenroute ausgeschlossen. Es wurde keine Datenbankmigration und keine neue Abhängigkeit eingeführt.
- Lokal bestätigt: 421 Modul-, Contract- und Integrationstests, Typecheck, Production-Build sowie Browserprüfung bei Desktop-, Zwischen- und Mobilbreite. Icons, Dateiauswahl, Strg+V, Vorschau, Reset nach Speichern und Offline-Medienstatus funktionierten ohne Konsolenwarnungen oder horizontalen Überlauf.

## 2026-08-06 — Gemeinsame Stapelübersicht und Stapelaktionen

- Dashboard und Lernen verwenden dasselbe responsive „Aktive Stapel“-Panel; nur das Dashboard ergänzt die Aktion „Lernen öffnen“. Die während eines Drags sichtbare Hauptebenen-Dropzone bleibt dadurch außerhalb der Zeilen erreichbar.
- Pointer-Capture hält den gegriffenen Stapel auch außerhalb der Liste aktiv. Lift-Zustand, verstärkter Einfügeindikator und bestehende Platzierungsvalidierung machen gültige und ungültige Ziele eindeutig.
- Dashboard, Lernen und Kartenverwaltung verwenden dasselbe reduzierte Stapelmenü mit Erscheinungsbild, vollständigem Pfad, CoRe-Modus, Einstellungen und bestätigtem Verschieben. Umbenennen, Unterstapel, Lernen, Variantenlernen und Löschen liegen ausschließlich in den Stapel-Einstellungen.
- Lokal bestätigt: 416 Modul-, Contract- und Integrationstests, Typecheck, Production-Build und Browserprüfung bei Desktop-, Zwischen- und Mobilbreite. Hauptebenen- und Unterstapel-Drops, Menü, Dialog und Zielvalidierung funktionierten ohne Konsolenfehler.

## 2026-08-06 — App-weite Lernzeitsimulation

- Der isolierte FSRS-Testmodus, sein Fünf-Karten-Stapel, Verlauf und `/testmodus` wurden entfernt. `/simulator` steuert stattdessen eine transiente, kalenderbasierte Lernuhr für die vorhandenen Accountkarten.
- Dashboard, Lernen, Kartenverwaltung, Statistik und Vollbildreview verwenden denselben simulierten Zeitpunkt. Reine Zeitwahl bleibt mutationsfrei; Zukunftsreviews werden über den bestehenden Scheduler-, Workspace- und Syncpfad dauerhaft gespeichert.
- Der aktive Zukunftstag ist in App-Shell und Review sichtbar. Schnellziele, einzelne Tagesschritte und ein auf zehn Jahre begrenztes Datumsfeld sind tastaturbedienbar; Reload und Logout setzen den Offset auf „Heute“ zurück.
- Es wurden keine Datenbankmigration, neue Abhängigkeit, Rollen-/Premiumlogik oder rücksetzbare Sandbox eingeführt.
- Lokal bestätigt: 413 Modul- und Integrationstests, Typecheck und Production-Build. Der In-App-Browser startete `/simulator` ohne Konsolenfehler; die geschützte Simulatoransicht selbst blieb ohne vorhandene lokale Anmeldung hinter dem Auth-Gate.

## 2026-08-01 — Labs- und Groß-APKG-Vorleistungen zurückgebaut

- Chat-your-Deck, Lernplan, Graph, Community-Demo, KI-Entwürfe/-Jobs, externer Varianten-JSON-Flow und technische APKG-Diagnose wurden aus UI, Domainmodell und Tests entfernt.
- `/api/ai/*`, `/api/imports/apkg`, Trigger.dev-Aufgaben, Upstash-/Trigger-Abhängigkeiten und der Server-APKG-Benchmark wurden entfernt. APKG bleibt lokal bis einschließlich 250 MiB.
- App-State v3 und Portable Export v2 enthalten nur Core-Daten; Legacy-Zustände und V1-Exporte werden beim Lesen bereinigt. Stapel sind implizit privat.
- Der Produktionsrückbau wurde gegen das über Vercel verifizierte Projekt `CoRe-Database` (`hirbiuiydczmnjqtoyqx`) ausgeführt. Sechs abgeschlossene KI-Jobzeilen sowie die pensionierten Tabellen und Spalten wurden entfernt; Labs-Decks, -Karten, Reviews, Konflikte und Medien waren nicht vorhanden.
- Der Storage-API-Lauf bestätigte 0 zu löschende `core-media`-Objekte und einen bereits fehlenden Bucket `core-imports`. Die pensionierten Vercel-KI-Variablen wurden aus Development, Preview und Production entfernt. `smarter-nutrition` blieb verbunden und unverändert.
- Lokal bestätigt: 346 Modul-/Integrationsprüfungen, Typecheck, Production-Build, Datenbanktypen, Beta-Core mit 22 Browserjourneys sowie Release mit vollständigem RLS/TUS, 51 Browserjourneys und lokalem 4.900-Karten-APKG-Benchmark. Die ausgemusterten Tabellen, Spalten und der Bucket `core-imports` fehlen im lokalen Zielzustand.
- Commit `5c741ad09c113455466e68970848190d0e476c78` wurde erfolgreich nach `main` ausgeliefert. Quality und Beta-Core waren grün; `extended-core` bestand im Wiederholungslauf in 7:14 Minuten. Der erste Versuch war ausschließlich beim Abruf des Supabase-`postgres-meta`-Images durch ein externes Registry-Rate-Limit fehlgeschlagen, nachdem alle 103 Integrationstests bestanden hatten.
- Vercel bestätigte genau diesen Commit. Die kanonische Startseite antwortete mit `200`, `/api/ai/chat` und `/api/imports/apkg` jeweils mit `404`.

## 2026-07-16 — Stapel-IA und URL-Kontext

- Ausgangs-Commit war `0474d1c6f1a7c5efb9f476b4109111b00d5c74ce`. Lernen und Kartenverwaltung bleiben getrennte Aufgabenoberflächen, verwenden aber denselben kanonischen URL-Kontext für View, Deck, Karte und Erstellziel.
- Der Reviewpfad serialisiert Reviewdeck, optionalen Variantenbezeichner und den diskriminierten Rückkontext `today | learn | decks` mit optionalem Rückdeck und Rückkarte. Alte Reviewpfade bleiben lesbar; freie Return-URLs werden nicht akzeptiert.
- Lokale parallele Deck-/Kartenselektion wurde aus `LearnScreen` und `DecksScreen` entfernt. Die Kartenverwaltung ist sekundär über `Karten verwalten` erreichbar, zeigt nur Inventarzahlen `im Stapel` und unterscheidet gleichnamige Unterstapel über vollständige Pfade.
- Ungültige oder gelöschte Deck-/Kartenlinks zeigen sichere deutsche Fallbacks und öffnen keine zufällige Ersatzkarte. Browser-Reload, Direktlink, neuer Tab sowie Zurück/Vorwärts erhalten den semantischen Kontext.
- `npm run typecheck`, 415 Modul-/Contract-/Integrationstests, Production-Build mit Chunkbudget, die fokussierten Navigationsjourneys A–G und das vollständige `npm run test:beta` mit 22 Browserflows waren grün.
- Es wurde keine Routerbibliothek, Datenbankmigration, Scheduler-/Queueänderung, KI-, Graph- oder Community-Funktion eingeführt.

## 2026-07-16 — Batch-Erstellung und Fehlertoleranz

- Die manuelle Erstellung bleibt nach jedem Save geöffnet, führt einen expliziten Batch-Session-State und beendet die Sitzung erst über `Fertig`. Pin-Reset, Zieldeck, vollständige Hierarchiepfade und Fokus sind deterministisch.
- Nichtleere fachliche Entwürfe sind durch einen zugänglichen Navigationsdialog und den Browser-Unload-Fallback geschützt; bereits gespeicherte Karten bleiben bei einem verworfenen Entwurf erhalten.
- Karten- und Stapellöschung verwenden produktspezifische Dialoge. Das unmittelbare Karten-Undo reaktiviert denselben Datensatz mit der bestätigten Tombstone-Revision und erhält den bestehenden Review State.
- Importmodi besitzen getrennte UI-Sessions und eine diskriminierte Zustandsprojektion. Formatwechsel entfernen alte Vorschau, Commitfähigkeit, Fehler und Fortschritt; Erfolg, Teilabschluss, Abbruch sowie retryable und terminale Fehler bleiben unterscheidbar.
- `npm run typecheck`, 411 Modul-/Integrationstests, Production-Build mit Chunkbudget, vier neue Beta-Core-Browserjourneys, der fokussierte retryable/cancelled-Serverterminal-Smoke und das vollständige `npm run test:beta` mit 20 Browserflows waren grün.
- Es wurde keine Datenbankmigration, KI-Arbeit, APKG-Parseränderung, Scheduleränderung oder neue Medieninfrastruktur eingeführt.

## 2026-07-16 — Typgerechter Kartenlebenszyklus

- Basic, Reverse, Cloze und Multiple Choice verwenden einen diskriminierten Editorwert und eine kanonische Save-Naht im Core Model; der normale Verwaltungsfluss speichert kein generisches `front/back/kind`-Patch mehr.
- Reverse-Richtung, Cloze-Lückengruppen und Multiple-Choice-Lösung werden atomar aktualisiert. Versionswiederherstellung, APKG-Reimport, Cloud-JSONB und Portabilität erhalten die strukturierten Inhalte.
- Der normale Reverse-Review zeigt die Originalrichtung; der ausdrücklich gestartete Variantenreview zeigt die synchronisierte Rückrichtung.
- Feldnahe Validierung, Rich-Text-Editoren, read-only Importfelder und progressive Herkunfts-/Versionsdetails sind in der Kartenverwaltung verfügbar.
- Unit-, Contract-, Persistenz- und fünf lokale Beta-Core-Browserjourneys einschließlich Kern-RLS waren grün. Es wurde keine Datenbankmigration und keine KI-, Provider- oder Adapterfunktion ergänzt.

## 2026-07-15 — Beta-Core-Gate lokal verifiziert

- Das neue blockierende `npm run test:beta` trennt den freigegebenen Kern von Labs-, Heavy- und Großdateipfaden. Die erweiterten Pfade laufen in CI separat und nicht blockierend.
- `npm run test:beta:local` bestand mit Kern-RLS, Registrierung und E-Mail-Bestätigung, Recovery und erneutem Login, fünf Kernjourneys, Offline/Reconnect, Konfliktstatus, kleinem APKG-Medienimport und Portabilitätsgrenzen.
- `npm run typecheck`, Unit-, Contract- und Integrationstests sowie `npm run build` waren grün. Der Build hielt das Chunk-Budget ein.
- Dies ist kein Hosted-Release-Nachweis: Preview, staged Production, realer Alarmempfang und getrennte DB-/Storage-Restore-Proben bleiben offen, weil kein dedizierter Hosted-Smoke-Account und kein Restore-Testprojekt für diesen Lauf bereitstanden.
- Der Nachweis enthält keine Secrets, Tokens, Nutzerinhalte, E-Mail-Adressen oder Authartefakte.

## 2026-07-15 — Produktvertrag und Dokumentation

- P0.1: Produktoberflächen wurden in Core, Labs und Disabled eingeordnet und zentral projiziert.
- P0.2: Der Review-/Variantenvertrag wurde korrigiert. Vor dem Reveal erscheinen keine Herkunfts-, Variantenlevel-, Reife- oder Schedulerhinweise; Original und Quelle erscheinen erst nach der Antwort.
- P0.3: Einstellungen zeigen die Login-E-Mail als Accountwert, erklären tatsächliche Datenschutzgrenzen und trennen Profil, Lernen, Sync/Daten sowie Erweitert.
- P0.4: Standardaccounts starten leer; Demo-Daten sind opt-in. Nach manueller Erstellung oder APKG-Commit führen stabile Folgeaktionen zu Lernen oder Kartenprüfung.
- P0.5: Core-/Labs-Einstiege, lesbare Quellformate, APKG-Hauptbericht und lokale Entwurfsassistenz wurden getrennt. Einzelne UX-Nacharbeiten bleiben offen.
- P0.6: Lernen und Stapelverwaltung wurden fachlich getrennt; Strukturänderungen sind explizit und bestätigt. Die moderierte Abnahme bleibt Teil des offenen P0-Gates.
- P1.1: Auth-/Account-Boot, Navigation, Sync- und Medien-Lifecycle wurden aus der App-Shell gelöst; Screen-Props sind konkret typisiert.
- P1.3: Tests wurden in Unit, Contract, Integration, Golden-E2E und Heavy-Release geordnet. Das Testportfolio steht in `docs/test-portfolio.md`.
- P1.4: Produktvertrag, Architektur, Status, Betrieb, Entscheidungen, Verlauf und offene Roadmap wurden in eindeutige Rollenquellen getrennt.

## 2026-07-14 — Cloud, Medien und Sync

- Revisionsgeprüfte Cloud-Mutationen, Konfliktprojektion, Soft-Deletes, Offline-Outbox und Zwei-Geräte-Vertrag wurden abgenommen.
- Der accountgebundene Medienpfad mit privatem Storage, Standardupload, TUS über 6 MiB, Signed URLs und reloadfester Pending-Queue wurde implementiert.
- APKG-Reimport bewahrt lokale Inhaltsänderungen und aktualisiert Import- sowie Medienmetadaten.
- Der lokale Datenbanktyp-Driftcheck, RLS-/Ownership-Smokes und Browserflows waren grün. Historische Testanzahlen werden nicht als heutiges Gate fortgeschrieben.

## 2026-07-13 — TypeScript und Architektur-Audit

- TypeScript wurde verbindlicher Standard in den produktiven Codewurzeln; `src/coreTypes.ts` wurde kanonische Typquelle.
- App-Shell, Core Model, Repository, Import und Sync wurden entlang ihrer bestehenden Modulgrenzen vertieft, ohne Produktfeatures zu entfernen.
- Lazy Loading, PDF.js-Split und das harte 500.000-Byte-JavaScript-Chunk-Gate wurden abgenommen.

## 2026-07-10 — Erstes protokolliertes Production-Release

- Commit: `e600ac4817f80c8ca8062df3aa2c706ee1f71178` (`e600ac4`).
- GitHub Actions: [Lauf 29121208290](https://github.com/Betogora/CoRe_Hosted/actions/runs/29121208290), `quality` und `browser-e2e` grün.
- Preview: `https://core-hosted-k77v2wj19-bengt2.vercel.app`, Deployment `dpl_ADcYAJBLJWcZ9mu2cMJPeMAyCMGG`.
- Vorherige Production: `https://core-hosted-38mw22988-bengt2.vercel.app`, Deployment `dpl_3HhXHhqRiL6dSqpRALwDc6dXuBYP`.
- Staged und anschließend kanonische Production: `https://core-hosted-94320qvku-bengt2.vercel.app`, Deployment `dpl_CCF8hGMt236krS8CdPW5W9G1yWM9`.
- Preview-Smoke 1–8, staged Kurzsmoke und Production-Kurzsmoke bestanden. Der Log-Scan enthielt keine 5xx- oder Error-Level-Treffer; ein Rollback war nicht erforderlich.
- Site URL und Redirect-Allowlist wurden nach Dashboard-Reload bestätigt; keine Secret-Werte wurden in den Nachweis übernommen.

## 2026-07-09 — Cloud-Grundlage

- Pflichtlogin, accountgebundene Cache-Keys, Cloud-first Autosave und Legacy-Datenübernahme wurden eingeführt.
- Supabase-Tabellen, RLS, accountgebundene Schlüssel und Auth-/Medienoperationen wurden über versionierte Migrationen und Verify-SQL abgesichert.

## Format für neue Einträge

Neue Einträge nennen Datum, abgeschlossenes Paket beziehungsweise Release, Ergebnis, relevante IDs und verbleibende Risiken. Sie enthalten keine Secrets, Passwörter, Tokens, Environment-Werte, personenbezogenen Daten oder Rohinhalte.

## 2026-10-17 — Prüfungsplanung: Einrichtung, Themen und Kalender (lokal)

- Vier zentrale Einrichtungsschritte mit Kalender erst in der Vorschau; Oberstapel wählen ihren gesamten Zweig. Zielorientierte Lernzielauswahl und individuelle Wochenminuten, weitere Schedulerangaben im Disclosure.
- Themenplanung auf Unterstapelebene, gewünschte Einführungstage mit Tausch, konkrete Uhrzeitreservierungen je Prüfung und gemeinsame Budgetvalidierung; Themenaufgaben auf Heute lösen über denselben Tagesplan die eindeutigen Karten auf.
- 31 fokussierte Tests grün; vollständige Unit-/Contract-/Integration-Suite grün. TypeScript, Typregeln, Knip (mit KNIP_DISABLE_RAW_TRANSFER=1 wegen Windows-ArrayBuffer-Grenze), Docs-Prüfung, Produktionsbuild und Chunkbudgets geprüft.
- Browserjourney über Anlegen, Zweigauswahl, Wochenzeit, Aktivieren, Themen tauschen, Zeitblöcke, Überlappungsfehler, Speichern/Neuladen und Themenstart mit echten Komponenten und erfundenen Daten. Sechs Pflichtviewports von 320 bis 1440 Pixeln in Hell/Dunkel, Datumsauswahl, Kalender und Dashboard visuell geprüft; 200%-Projektion und Katalog-Smoke zusätzlich. Belege im Sitzungsscratchpad und im ausgegebenen Prüfbericht.
- Ungeprüft: echte Smartphone-Tastatur, echtes Touchgerät und authentifizierter Cloud-/Review-End-to-End-Lauf. Vorschau speichert ausschließlich lokale Beispieldaten. Keine Datenbankänderung, kein Commit, Push oder Deployment.

## 2026-10-18 — Unbeabsichtigte UI-Rücknahmen aus Merge #29 korrigiert

- Basis ist der aktuelle Main `9f8544d`; der beschlossene Stapelaufbau vor `881b7c2` wurde gezielt wiederhergestellt: `Liste`/`Kacheln` mit Inline-Unterstapeln, vollständiger Sammlung beim Ansichtswechsel und browserlokaler Auswahl. Explorer, Fortschrittsringe, Anzahl-Zusatztexte, runde Stapelicons und zusätzliche Bereichsnavigation in Stapelinhalten entfallen entsprechend ADR-037/ADR-041. Dialog-Escape funktioniert wieder nach einem Klick auf den Titel.
- Prüfungsplanung, heutige Aufgabenreihenfolge, cloudgespeicherte Zusammenfassungen, erweiterte Mindmaps, Entwurfsschutz und die primäre Aktion `Karten lernen` bleiben erhalten. Kernmodell, Scheduler, Cloud-, API- und Datenbankpfade sind gegenüber der Main-Basis unverändert. Separater Arbeitsbaum schützt den bereits gemischten lokalen Checkout.
- 78 fokussierte Tests sowie die vollständige Unit-/Contract-/Integration-Suite in 119 Dateien bestanden. Typecheck einschließlich Typregeln, Knip und Dokumentationsprüfung, Produktionsbuild und Bundlebudgets bestanden. Knip lief mit `KNIP_DISABLE_RAW_TRANSFER=1`, weil der Windows-Prozess unter Speicherdruck den großen OXC-ArrayBuffer nicht reservieren konnte. Der abschließende Diff-Audit ergab keine zusätzliche sinnvolle Vereinfachung.
- Drei Browserregressionen bestanden: Liste/Kacheln mit Reload und Unterstapeln, aktuelle Inhaltsreiter/Lernaktion und Escape nach Titelfokus. Acht Viewports (320×720, 360×800, 390×844, 430×932, 1280×720, 1279×900, 1280×900, 1440×900) jeweils in Hell/Dunkel geprüft: Liste, Kacheln, Inline-Unterstapel, alle sechs Inhaltsreiter, Kartenverwaltung, Stapelmenü und Heute. Screenshots wurden visuell geprüft; Schnellanlage/Sammlungsende und 200-%-CSS-Vergrößerung ergänzen die Matrix.
- Belege: Sitzungsscratchpad `C:/Users/noemi/.codex/tmp/restore-agreed-ui-20261018/`, Unterordner `browser-results`, `browser-results-light`, `browser-results-extra` und `review`. Produktkomponenten wurden im generierten Katalog mit lokalen Beispieldaten auf Port 5195 geprüft, da 5190 anderweitig belegt war. Zusätzlich bestanden alle sieben Zusammenfassungsjourneys und vier Mindmap-Journeys; der breitere gemeinsame Lauf wurde unter Speicherdruck abgebrochen, die drei Regressionen danach separat erfolgreich wiederholt.
- Offen: authentifizierter Cloud-/Review-End-to-End-Lauf, vollständige Mindmap-Browsersuite, reale Smartphone-Tastatur/Touchbedienung und echter Browserzoom. CSS-Vergrößerung ersetzt diese Nachweise nicht. Nach Commit-/Push-Freigabe wurde `npm run performance:measure:local` gestartet; der Lauf brach vor der Messung ab, weil Docker CLI und Docker Desktop auf dem Rechner fehlen. Für die Korrektur `aeccfa3` hat der Nutzer den Push auf Main ausdrücklich ohne dieses Performance-Gate freigegeben. Ein Deployment wurde nicht verifiziert.

## 2026-10-18 – Mindmap-Texte in den regulären Kartenfeldern

- Neu erzeugte Zusammenfassungsbäume verwenden Textkarten an jedem Astende und Stichwortkarten für alle Eltern. Zusammenfassungspassagen stehen im bearbeitbaren Kartentext; die unveränderliche Quelle bleibt erreichbar, der zusätzliche Passagen-Aufklappbereich entfällt. Bestehende Karten erhalten ihre Kartenart und zeigen bisherige Quellentexte im normalen Kartenfeld; „Neu erzeugen“ wendet die neue Vorgabe an.
- Verifiziert: 56 fokussierte Modell-/Screen-Tests, vier Mindmap-Browserjourneys einschließlich Textbearbeitung und Reload, Typecheck, Dokumentationsprüfung und Produktionsbuild samt Chunk-Budget. Wegen lokaler Speichergrenzen wurden Typecheck mit `KNIP_DISABLE_RAW_TRANSFER=1` und Build mit `GOMAXPROCS=2` erfolgreich wiederholt.
- Visuelle Belege: Sitzungsscratchpad `C:/Users/noemi/AppData/Local/Temp/core-mindmap-20261018/`, Screenshots und `visual-results.json`. Produktpanel in 320 × 720, 360 × 800, 390 × 844, 430 × 932, 1280 × 720 und 1440 × 900, jeweils Light/Dark mit Baumübersicht, geöffnetem Elterntext und Texteditor; Smartphone-Vollbild und dessen Scrollbereich wurden mitbetrachtet. Zusätzlich Produktansicht mit simulierter KI-Erstellung bei 390 × 844 und 1440 × 900 in beiden Themes. Port 5217, da 5190 anderweitig belegt war.
- Offen: reale Smartphone-Bildschirmtastatur, echter Browserzoom bei 200 % (nur äquivalente CSS-Fläche betrachtet), authentifizierter Live-KI-Aufruf und Cloud-End-to-End. Das vor dem Push erneut gestartete Performance-Gate brach vor der Messung ab: Docker CLI und Docker Desktop sind nicht installiert. Der Nutzer gab den Push dieses Mindmap-Commits ausdrücklich ohne das mangels Docker nicht ausführbare Performance-Gate frei. Der Abschlussaudit ergab keine weitere sinnvolle Vereinfachung. Der isolierte Commit-Stand bestand zusätzlich `npm run gate:push` (Typecheck, sämtliche Unit-/Vertrags-/Integrationstests aus 120 Dateien, Produktionsbuild und Chunk-Budgets). Ein Deployment wurde nicht verifiziert.
- CI-Abgleich: Die zunächst gemeinsam genutzten lokalen Pakete wichen von der Lockdatei ab. Im isolierten Arbeitsbaum wurden die Abhängigkeiten mit `npm ci` exakt aus `package-lock.json` installiert und die generierten Katalogseiten damit synchronisiert; der gemeinsame Checkout behielt seine Installation.

## 2026-10-18 – Prüfungskarten und Zusammenfassungseditor abgestimmt

- Prüfungskarten verwenden die gewählte aufklappbare Übersicht mit Inline-Bearbeitung, Entwurfsschutz, bestätigten Statusaktionen sowie Löschen und Rückgängig einschließlich Zeitreservierungen und Tagesaufgaben. Ein gemeinsamer Balken überlagert den gefestigten Anteil im gesehenen Anteil; Legende und Erklärung erhalten den Bezug zur gesamten Kartenmenge. Die freie Prüfungsfarbe verwendet den vorhandenen Icon-Farbkreis, bleibt im Profil erhalten und erhält lesbare Beschriftungen auf farbigen Kalenderflächen.
- Der Zusammenfassungseditor verwendet eine durchgehende, nach unten wachsende Schreibfläche mit passenden Text-, Stift-, Marker- und Radierwerkzeugen. Bestehende Seitenzeichnungen bleiben identifizierbar. Erstellung liefert einen Entwurf; beim Verlassen werden Speichern, Verwerfen und Weiter bearbeiten angeboten. Der neue Main-Stand mit nebeneinander angeordneten Erstellungsaktionen auf breiten Flächen bleibt erhalten.
- Abschlussaudit mit `audit-last-change`: keine weitere klar belegbare Vereinfachung mit kleinem Diff gefunden. Gegen `origin/main` (`f00fdc2`) zusammengeführt und in einem isolierten Arbeitsbaum mit `npm ci` aus der Lockdatei geprüft; die generierten Katalogseiten stammen aus dieser Installation.
- `npm run gate:push` bestanden: Typecheck, Typregeln, Knip, Dokumentationsprüfung, sämtliche Unit-/Vertrags-/Integrationstests aus 120 Dateien sowie Produktionsbuild und Chunkbudgets. Neun Zusammenfassungs-Browserjourneys einschließlich Speichern/Reload, Speicher- und KI-Fehlern, alten Zeichnungen sowie visuellen Matrizen für Liste, Popover und Editor bestanden. Prüfungsjourneys und sechs Pflichtviewports in Hell/Dunkel wurden zusätzlich im Verlauf dieser Sitzung mit echten Produktkomponenten und lokalen Prüfdaten geprüft. Belege: Sitzungsscratchpad `C:/Users/noemi/.codex/visualizations/2026/10/18/01a15002-9d6a-7803-9800-24a15c55f661/`, Unterordner `push-review` und `learning-goal-review`.
- Offen: authentifizierter Cloud-End-to-End-Lauf, reale Smartphone-Tastatur/Touchbedienung und echter Browserzoom; Zoomprojektionen ersetzen diese Nachweise nicht. `npm run performance:measure:local` wurde gestartet, brach jedoch vor der Messung ab, da Docker CLI und Docker Desktop fehlen. Ein Deployment wurde nicht verifiziert.
