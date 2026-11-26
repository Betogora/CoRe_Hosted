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
| Initiales JavaScript (gzip) | 295,3 KiB bei Grenze 300; am 22.11. noch 246,8 | höchstens 250 KiB |
| Start-CSS | 191 KiB roh, 34,9 KiB gzip, eine Datei | rund 25 KiB gzip |
| `Cache-Control` für `/assets/*` in Production | `public, max-age=0, must-revalidate` | `public, max-age=31536000, immutable` |
| `affected-e2e` mit voller Suite | 12 bis 14 min (Testschritt 800 s) | höchstens 5 min |
| `catalog-e2e` | 4,5 bis 6,5 min (120 Tests, 2 Worker) | höchstens 4 min |
| Pull Requests mit voller Suite | 57 von 86 (66 %) in drei Wochen | höchstens 40 % |
| Roundtrips nacheinander je Bewertung | 5 | 2 |
| `srcdoc` einer Formelkarte | rund 400 KB | rund 30 KB |

Für alle Pakete gilt:

- Je Paket ein Pull Request von `origin/main`; die Beschreibung nennt die
  Kennzahl vorher und nachher.
- A1, A2, A4 und A5 berühren Bootstrap, Preload, Sync, Service Worker oder
  Chunking: vor dem Merge `gh workflow run weekly-performance.yml --ref <branch>`.
- **Hill-Climbing** (H1 bis H5): je Schritt genau eine Änderung, Kennzahl
  vorher und nachher messen, nur übernehmen, wenn sie sinkt und alle Gates
  grün bleiben. Ende beim Ziel oder nach drei Schritten in Folge ohne
  nennenswerten Gewinn (unter 1 KiB, unter 2 % oder Zähler unverändert).
- Unverändert lassen: `quality` (rund 50 s, Engpass Typecheck samt knip),
  Modultests (179 Dateien in 12 s) und RLS (21 Fälle in 6 s).

Reihenfolge: A1 und T1, dann A2, dann T2 und T3, dann A3 und A4; A5 nach
der Entscheidung, A6, T4, A7 und T5 nach Bedarf.

| Spur | Kennzahl | Schleife | Paket |
| --- | --- | --- | --- |
| H1 | initiales JavaScript in KiB gzip | `npm run build` gibt den Wert aus (`scripts/verifyBuildChunks.ts`), rund 20 s, ohne Supabase | A2 |
| H2 | Sekunden je Spec | `npm run test:e2e:catalog` lokal ohne Docker (rund 5 min); Supabase-Specs über den JSON-Reporter aus T1 | T3, T4 |
| H3 | Rechenläufe und Renders je Revision | Zähler als Modultest | A3 |
| H4 | Requests je Bewertung und je Leerlauf-Sync | Zähler gegen `tests/support/fakeLearningCloud.ts` | A4 |
| H5 | `srcdoc`-Bytes und Millisekunden je Kartenbundle | Mikro-Benchmark, fehlt noch | A6 |

### App

- [ ] **A1 – Auslieferung:** klein, gemessen, ohne Schritt 0.
  - `vercel.json`: Regel für `/assets/(.*)` mit
    `public, max-age=31536000, immutable`. Die vorhandene `no-cache`-Regel
    nimmt `/assets` nur aus, deshalb gilt dort Vercels Standard, und jeder
    Start ohne Service-Worker-Treffer revalidiert 16 Dateien.
  - App-Schrift (`/fonts/manrope/manrope-variable.woff2`, eingebunden in
    `src/styles.css:5-11`): `<link rel="preload" as="font" type="font/woff2"
    crossorigin>` in `index.html` und heraus aus `no-cache`, entweder über
    Vite als gehashtes Asset oder mit eigener Header-Regel ohne `immutable`.
    `src/ui/CardPresentationSurface.tsx:8` lädt dieselbe Datei per `fetch`;
    Pfad und `crossorigin` müssen dazu passen.
  - `index.html`: `<link rel="preconnect" href="%VITE_SUPABASE_URL%"
    crossorigin>`.
  - `public/sw.js`: Der Cache `core-app-shell-v1` wechselt nie den Namen und
    behält die gehashten Assets jedes Deploys; das zählt in
    `storage.estimate()` und damit in die 80-%-Bereinigung der Medien. Alte
    Assets entfernen, ohne einem offenen Tab mit altem Stand die Chunks zu
    nehmen (Vertrag „kein automatischer Reload“; etwa Assets des laufenden
    und des vorigen Builds behalten).
  - `public/sw.js`: Navigation Preload einschalten
    (`registration.navigationPreload.enable()` in `activate`,
    `event.preloadResponse` in der Navigation). HTML aus dem Cache bleibt
    reiner Rückfall.
  - Nachweis: `curl -I` auf ein Asset der Preview zeigt `immutable`;
    `weekly-performance` auf dem Branch grün, `serviceWorkerP75CostMs` und
    Offline-Kaltstart vorher und nachher.
- [ ] **A2 – Startgraph unter 250 KiB (H1):** Der Startgraph wuchs in zwei
      Sprüngen, mit PR #145 (Topbar, +24 KiB) und PR #179 (Profilabgleich,
      +18 KiB). Zusammensetzung in KiB gzip: React 59; Supabase 36;
      lokale Persistenz und Hydration 32; Kernmodell, Lernen und Prüfungen
      30; Radix und Floating-UI 28,5; Cloud und Auth 20; UI 14; xss 6,6;
      ts-fsrs 6; valibot 5,3; lucide 5 (63 Icons); Kartensuche 4,5; übrige
      App 38. Kandidaten nach erwarteter Wirkung:
  1. `src/ui/AppNavigation.tsx:4` importiert `@radix-ui/react-popover`
     statisch und hält damit Radix samt Floating-UI im Start
     (`tooltipUi.tsx` braucht beides nicht). Popover erst beim Öffnen des
     Menüs laden; `pomodoroTimerUi.tsx` (Zeile 14) ebenso prüfen.
  2. `src/cloudAuth.ts:2` importiert `cloudTable` aus `cloudQueries.ts`
     statisch; `vite.config.ts` legt das in den Chunk `cloud-repository`
     (12,9 KiB), der so samt `cloudRepositoryValidation.ts` im Start liegt.
     Stattdessen `client.from("profiles")` wie im Rest der Datei. Danach
     verschwinden die Build-Warnungen „Circular chunk: index →
     cloud-repository → index“ und „dynamisch und statisch importiert“.
  3. Der Chunk mit `indexedDbReviews` (37,7 KiB) trägt valibot,
     `cardSearchQuery.ts`, `learningProfiles`, `examPlanSettings`,
     `studyHeatmapModel` und `aiCardVariantContract`. Ketten aus dem Start:
     `App.tsx` → `workspaceHydrationService.ts` → `cardSearchQuery.ts`;
     `App.tsx` → `cardCommands.ts` → `deckSettings.ts` →
     `learningProfiles.ts`; `App.tsx` → `useAccountWorkspace.ts` →
     `authenticatedWorkspaceBoot.ts` → `profileIntegrity.ts`. Je Kette
     prüfen, ob ein Typimport oder ein dynamischer Import an der
     Nutzungsstelle reicht; die Eigentümer aus `architecture.md` bleiben.
  4. `src/App.tsx:9-19` importiert die Befehlsmodule statisch; darüber
     liegen `reviewService` → `scheduler` → ts-fsrs (13 KiB) und
     `coreModel` → `htmlSafety` → xss (10 KiB) im Start. Nur übernehmen,
     wenn Lernstart und Kartenanzeige nicht später werden.
  5. 34 der 102 Chunks sind Icon-Chunks unter 1,5 kB; zusammenlegen, wo
     sie gemeinsam laden.
  6. Start-CSS: Blöcke einzelner Screens aus `src/styles.css` (4.162
     Zeilen) in CSS-Dateien verschieben, die der jeweilige Lazy-Screen
     importiert. Roh: Dashboard 13 KB, Mindmap 12,4, Zusammenfassung 9,6,
     Datumsauswahl 6,3, Rich-Text und Erstellung 4,9, Heatmap 3,9,
     Karteneditor 3,7, Prüfungen 2,9. Risiko: `@layer components` und
     Kaskadenreihenfolge über Dateigrenzen; visuelle Pflichtmatrix je
     verschobenem Screen. Entlastet zugleich T2.
  - Die Zerlegung je Modul liefert ein Rollup-Plugin, das in
    `generateBundle` die `renderedLength` je Modul der Start-Chunks
    summiert (nicht im Repository).
  - Abschluss: harte Grenze in `scripts/verifyBuildChunks.ts` und
    `src/performanceGates.ts` von 300 auf rund 265 KiB senken und in
    `test-portfolio.md` nachziehen, damit der Gewinn hält.
  - Nachweis: Tabelle je Schritt im Pull Request; größter Lazy-Graph bleibt
    unter 175 KiB; `preloadedTabP75Ms` und `lazyTabP75Ms` grün.
- [ ] **A3 – Revisionskaskade entkoppeln (H3):** `learningNow`
      (`src/useLearningClock.ts:24`) ist ein Millisekunden-Zeitstempel, der
      bei jeder Workspace-Revision neu entsteht, also bei jedem lokalen
      Schreiben und jedem Sync mit Inhalt, und er dient als Memo- und
      Effekt-Schlüssel.
  - Schritt 0: Zähler als Modultests für Prognoseläufe je Haken in der
    Tagescheckliste (Ziel 0), Diagramm-Commits je Revision (Ziel höchstens
    1), `DeckTreeRow`-Renders je Revision ohne Stapeländerung (Ziel 0) und
    Renders des aktiven Screens je Importschritt (Ziel 0).
  - Verdrahtungen zuerst, weil der Stapelbaum sie braucht:
    `DecksScreenWiring.tsx:11`, `LearnScreenWiring.tsx:9`,
    `DashboardScreenWiring.tsx:10`, `ExamPlanningScreenWiring.tsx:7` und
    `GlobalCardSettingsScreenWiring.tsx:8` wählen `snapshot.state`. Weil
    `getShellState()` jedes Deck klont (`src/indexedDbCoreRepository.ts:375`),
    bekommt `state.decks` je Revision eine neue Identität. Getrennt
    `state?.decks` und die Profilteile wählen, wie es Statistik und
    Erstellung schon tun.
  - Prüfungsprognose: Der Schlüssel in `src/screens/useExamForecast.ts:40`
    enthält `now`. Ein Haken in der Checkliste löst so zwei volle Läufe von
    `createExamPortfolioForecast` aus (Budget 1 s für 7.000 Karten), obwohl
    der Kommentar in Zeile 38 das Gegenteil will. Schlüssel auf Lerntag
    plus grobes Zeitfenster stellen, `now` erst beim Rechnen lesen und
    `clock.globalSchedulerPreferences` durchreichen, statt sie je Render
    neu zu normalisieren (`ExamDashboardWidget.tsx:36-72`,
    `ExamPlanningScreen.tsx:111,125`). Tageswechsel und „Plan neu
    berechnen“ müssen weiter auslösen; `npm run benchmark:exams` bleibt
    grün.
  - Statistik: `StatisticsScreenWiring.tsx:11-17` fragt je Revision neu ab
    (lokale Projektion, RPC `get_account_statistics`, Cache), und jede
    Abfrage rendert alle Diagramme zweimal
    (`StatisticsScreen.tsx:306-479,641-653`, kein `memo`). Diagramme mit
    `React.memo`, Hintergrundauffrischung ohne Ladezustand, kein
    State-Wechsel bei inhaltsgleicher Projektion, Schlüssel auf Lerntag
    plus echten Datenanlass. Neue Bewertungen müssen weiter erscheinen.
  - Stapelbaum: `createDeckLibraryModel`
    (`src/libraryModel.ts:72-120,291-323`) erzeugt je `now` neue
    `row`-Objekte, deshalb rendern alle `DeckTreeRow` trotz `memo`. Je
    Zeile laufen ein `ResizeObserver`, ein `document.fonts`-Listener und
    ein Mess-Span (`src/ui/DeckTree.tsx:25-62,289,664-688`).
    `row`-Objekte bei gleichen Anzeigewerten wiederverwenden, ein Observer
    für die Spaltenbreite, `content-visibility: auto` mit
    `contain-intrinsic-size` auf `.core-deck-tree-group`. `onStudy` darf
    kein veraltetes Deck bekommen; Drag-Overlay und Fokus brauchen die
    Sichtprüfung.
  - Fortschritt: Import- und Variantenfortschritt sind State in
    `AppContent` (`src/App.tsx:230,233,323-328`, `useImportSession.ts:8`,
    `useCardVariantBatch.ts:70-72`); jeder Schritt rendert den aktiven
    Screen. In einen kleinen Store legen, den nur Erstellung und
    Variantenleiste abonnieren. `useNavigationGuard`, `beforeunload` und
    der Kontowechsel lesen die Importsitzung weiter.
  - Kleinposten: Inline-`options` an `CoreSegmentedControl` als Konstanten
    (`src/ui/coreUi.tsx:228-241`; Aufrufer `NoteContentEditor.tsx:125`,
    `ExamCalendar.tsx:107`, `HitStudyDialog.tsx:73,83`,
    `AiSourceCreationPanel.tsx:272`, `DeckMindMapsPanel.tsx:400`);
    `readTheme()` je Theme cachen und `cardBundle()` nicht in jedem Render
    aufrufen (`src/ui/NoteCardContent.tsx:25-30,50-52`).
- [ ] **A4 – Roundtrips in Start, Sync und Lernstart (H4):**
  - Schritt 0: `src/performanceGates.ts` definiert Grenzen für Lernstart
    (p75 1 s), Review lokal gespeichert (p95 250 ms) und Delta-Sync (p75
    2 s); gemessen wird nur die Suite `startup`
    (`tests/performance/startup.spec.ts`). Messpunkte ergänzen (Lernstart
    von Klick bis `core:working_set_ready`), dazu Request-Zähler je
    Bewertung und je Leerlauf-Sync.
  - Bewertung: `applyEntityMutation`, `applyEntityMutationBatch`,
    `recordAtomicReview` und `patchAccountCloudProfile`
    (`src/cloudRevisionedWrites.ts:331,389,468,504`) holen je Aufruf
    `GET /auth/v1/user`. `authenticatedUserForKnownSession`
    (`src/cloudQueries.ts:81-97`) gibt es; die `userId` durchreichen. RLS
    und `auth.uid()` in den RPCs bleiben. Ein Rückstau von N Bewertungen
    braucht dann N statt 2N Requests.
  - Sync-Zyklus (`src/syncEngine.ts:545-548`): Delta, Profil und Konflikte
    laufen nacheinander. Parallel abrufen; die Regel „Konflikte zuletzt“
    aus `architecture.md` und das Profil-Overlay mit wartenden Patches
    gelten weiter für das Anwenden. `streamAccountCatalogChanges`
    (`src/cloudRepository.ts:168-180`) liefert auch leer fünf Seiten, was
    je Leerlauf-Sync eine Schreibtransaktion über rund zehn Stores,
    `loadShell` und zwei volle `count()` kostet
    (`src/indexedDbCoreRepository.ts:331-336,384-397`): leeres Delta früh
    beenden. Konflikte mit Statusfilter und schmalen Spalten statt
    `select *` (`src/cloudConflicts.ts:397-400`). Mindestabstand für
    Fokus-Syncs bei leerer Outbox.
  - Folgekette nach dem Boot
    (`src/authenticatedWorkspaceBoot.ts:62-63,173-197,211-268`,
    `src/useAccountWorkspace.ts:99-123`, `src/appMediaLifecycle.ts:17`):
    `profileSeenAt` aus dem Bootstrap setzen (kein zweiter Profilabruf),
    Konflikte bei `conflictCount` 0 überspringen, Geräte-Registrierung
    parallel, `list_releasable_media` höchstens täglich, `cloudState` nur
    bei echter Änderung ersetzen (zwei Shell-Render weniger). Messung:
    `core:cloud_sync_after_start`.
  - Lernstart: `prepareStudyWindow`
    (`src/workspaceHydrationService.ts:407-414,223-228`) ruft je Stapel des
    Teilbaums nacheinander `fetchCatalogPage` auf, auch bei vollständigem
    Katalog, und setzt ihn dabei auf `partial` (kein `keepComplete`). Bei
    vollständigem Katalog nur einen Delta-Pull anstoßen, sonst vier
    Abrufe parallel wie `hydrateCards` und `keepComplete` übergeben.
    Vorher festhalten, dass der Delta-Pull für Bewertungen anderer Geräte
    genügt.
  - Stapelzahlen: Der Boot wartet auf `listDeckSummaries`
    (`src/authenticatedWorkspaceBoot.ts:58`), danach rechnet
    `src/useDeckSummaries.ts:15,31-41` dieselbe Projektion erneut. Den
    Schlüssel des Boot-Ergebnisses als geladen vormerken; Messung
    `projectionRebuildCount`.
  - Neues Gerät: Bootstrap-RPC parallel zur lokalen Öffnung starten
    (`src/authenticatedWorkspaceBoot.ts:52-63`) und den Chunk der Route
    beim App-Start per `prefetchAppView` holen
    (`src/appFeatureLoading.tsx:82,99-111`); Messung
    `newDeviceDashboardP75Ms`.
  - Anmeldung: Nach `signInWithPassword` folgen ein abgewarteter
    Profil-Upsert und `getUser()` (`src/useAccountWorkspace.ts:193-196`,
    `src/cloudAuth.ts:387-395`). Mit `data.user` booten, Upsert parallel;
    das Profil muss vor dem ersten Profilpatch existieren.
  - Nachweis: Zähler und die drei neuen Messwerte vorher und nachher;
    `weekly-performance` auf dem Branch.
- [ ] **A5 – Sitzungsstart mit abgelaufenem Token:** Entscheidung offen,
      berührt ADR-038. `auth.getSession()` erneuert ein Token, das in
      unter 90 s abläuft, bevor es antwortet
      (`src/authenticatedWorkspaceBoot.ts:297-306,320`,
      `src/cloudAuth.ts:315-334`); das JWT gilt 1 h, also bei praktisch
      jedem Start am nächsten Tag ein blockierender Request vor dem Öffnen
      der lokalen Datenbank. Offline wiederholt auth-js laut Audit bis rund
      25 s und endet im Anmeldebildschirm statt im lokalen Workspace.
      Nicht reproduziert.
  - Schritt 0: Szenario in `tests/performance/startup.spec.ts` mit
    zurückdatiertem `expires_at`, online und offline (Phase
    `networkAndSession`).
  - Stufe 1: nur den Offline- und Refresh-Fehlerfall abfangen und lokal
    starten. Stufe 2: Nutzer-ID aus dem persistierten Session-Eintrag
    lesen, Replica sofort öffnen, Bestätigung parallel.
  - Risiko: Kopplung an das Speicherformat von auth-js (Test gegen die
    installierte Version, Rückfall auf `getSession`). „Ablehnung verwirft
    den Start“ bleibt.
- [ ] **A6 – Kartenrahmen (H5):** braucht die visuelle Pflichtmatrix für
      die Kartendarstellung.
  - Schritt 0: Mikro-Benchmark für Millisekunden und `srcdoc`-Bytes je
    `cardBundle` (Text, Lückentext mit Formeln, Auswahl).
  - Manrope (rund 33 KB als base64) steht in jedem `srcdoc`; bei Formeln
    kommen `katex.min.css` und alle 20 KaTeX-Schriften dazu (rund 370 KB),
    und `renderCard` backt das in Frage und Antwort des Bundle-Caches je
    Note (`src/ui/CardPresentationSurface.tsx:7-35,94-97`,
    `src/noteMathAssets.ts:1-27`, `src/notePresentation.ts:379,454`). Im
    Bundle nur den Body cachen, Math-CSS erst in der Surface einsetzen und
    Schriften als `blob:`-URL liefern (die CSP erlaubt `font-src blob:`;
    nie widerrufen; Safari mit Sandbox-`srcdoc` prüfen; die generierten
    Katalogseiten brauchen weiter Data-URLs).
  - `resolvePresentationMedia` (`src/presentationFrame.ts:21-36`) läuft mit
    zwei Regex-Pässen über den ganzen String; Werte mit `data:` oder
    `blob:` sofort überspringen.
  - `useNoteCardPrefetch` (`src/ui/NoteCardContent.tsx:58-76,108-116`)
    startet direkt im Effekt; über `whenDrawnAndIdle` einplanen. Ein Bundle
    rendert fünfmal und bereinigt jedes Feld erneut mit xss und KaTeX
    (`src/notePresentation.ts:128-181`): Ergebnis je Rohfeld cachen, ohne
    einen Sanitizer-Pass auszulassen.
  - Nachweis: Benchmark vorher und nachher, Feldwerte `core:answer_shown`
    und `core:rating_to_next_card` (ADR-050). „Der Rahmen lädt nichts nach“
    bleibt.
- [ ] **A7 – Große Datenmengen und Editoren:** je Punkt ein eigener Pull
      Request, jeder mit eigener Messung zuerst.
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

- [ ] **T1 – Doppelläufe und Fixkosten:**
  - `scripts/runLocalE2E.ts:161-162` startet im Gate `affected` die
    Katalog-Suite, obwohl der Pflicht-Check `catalog-e2e` sie auf demselben
    Commit fährt (in 81 % der Pull Requests komplett doppelt, 212 bis
    266 s). Im Gate `affected` streichen, `release` behält sie.
    `test-portfolio.md` anpassen und die Direkt-Push-Regel in `AGENTS.md`
    um `npm run test:e2e:catalog` ergänzen.
  - `playwright.catalog.config.ts`: `workers` in CI von 2 auf 3, dann 4
    (der Runner hat 4 Kerne), und `trace: "off"`; der Screenshot bei
    Fehlschlag bleibt. Auf Flakes der Zieh- und Echtzeit-Tests achten
    (`dashboard-widgets.spec.ts:83,235`, `exam-topic-order.spec.ts:66`).
  - Chromium-Download in `ci.yml`, `nightly-core.yml` und
    `weekly-performance.yml` cachen (19 bis 44 s je Job).
  - JSON-Reporter beider Playwright-Konfigurationen immer als Artefakt
    hochladen; ohne ihn gibt es in CI keine Dauer je Test.
  - Übersprungene Tests bauen heute Kontext und Seite auf
    (`ai-source-creation.spec.ts:338,363,376`,
    `note-presentation.spec.ts:8-12`).
  - Nachweis: Testschritt von `affected-e2e` von 800 auf rund 535 s,
    `catalog-e2e` unter 4 min, drei Läufe in Folge grün.
- [ ] **T2 – Auswahl schärfen:** Kennzahl ist der Anteil voller Läufe.
      Gemessen, indem `affectedE2ESpecs` über die Dateilisten der letzten
      86 Merges nach `main` läuft; 10 volle Läufe kamen allein von
      `src/styles.css`, 8 allein von nicht zugeordneten Dateien.
  - `src/appScreenProps.ts` (16 Pull Requests, nur Typen) ignorieren.
  - `src/screens/cardList/` auf `card-lifecycle` und `navigation-context`
    legen.
  - Das Muster `coreRepository` trifft `indexedDbCoreRepository.ts` (13)
    wegen der Großschreibung nicht. Ebenfalls zuordnen: `cardCommands.ts`
    (9), `indexedDbImportCommit.ts` (7), `workspaceHydrationService.ts`
    (7).
  - `src/styles.css` auf alle Katalog-Specs plus `product-surfaces`,
    `core-stabilization`, `world-capitals-hierarchy` und
    `navigation-context` legen (235 statt 428 s). Aufgegeben wird bei
    reinen CSS-Änderungen der PR-Lauf der übrigen Specs; `nightly-core`
    fängt ihn.
  - Lücken schließen, die heute nichts auslösen:
    `tests/support/seedAccountState.ts`,
    `tests/support/fakeLearningCloud.ts`,
    `library/world-capitals/world-capitals.source.json`,
    `postcss.config.ts`.
  - Fehlgriffe: `.env.example` trifft `/exam/`, `CardPreviewDialog` trifft
    `/[Rr]eview/`.
  - Nachweis: Fälle in `src/affectedE2ESpecs.test.ts`; Wiederholung über
    dieselben Merges ergibt höchstens 40 %; `test-portfolio.md` nachziehen.
- [ ] **T3 – Supabase-Suite in drei Shards (H2):** 119 Tests laufen seriell
      in 432 s, ohne Ausreißer (längster 10,3 s). Drei Jobs mit festen
      Dateilisten, jeder mit eigenem Supabase, ohne Änderung am Testcode:
  - Shard 1 (rund 141 s): `core-stabilization`, `batch-resilience`,
    `exam-planning`, `auth-gate`; dazu RLS, Typ-Drift und Beta-Artefakt.
  - Shard 2 (rund 141 s): `card-lifecycle`, `product-surfaces`,
    `apkg-quality-report`, `zz-media-import`, `auth-resilience`.
  - Shard 3 (rund 140 s): `navigation-context`,
    `world-capitals-hierarchy`, `first-learning`, `auth-lifecycle`.
  - Ein Sammeljob trägt den Namen des Pflicht-Checks `affected-e2e`. Ein
    Test stellt sicher, dass jede Supabase-Spec in genau einem Shard
    liegt. Ein Shard ohne betroffene Spec endet ohne Supabase-Start.
  - Preis: zwei weitere Runner mit je rund 115 s Fixkosten. „Ein Konto je
    Worker“ spart sie, scheitert aber zunächst an 30 Anmeldungen je 5
    Minuten (`supabase/config.toml:207`), am Reset des ganzen Kontos
    (`tests/e2e/support/appState.ts:46-67`) und an drei unverträglichen
    Grundzuständen auf einem Konto.
  - Nachweis: `affected-e2e` mit voller Suite unter 5 min; Zuschnitt nach
    den Sekunden aus dem JSON-Reporter nachziehen.
- [ ] **T4 – Suite verschlanken (H2):** Vor jedem Streichen oder
      Zusammenlegen den Test benennen, der den Vertrag weiter schützt;
      `@golden-e2e` und `@beta-core` bleiben unangetastet.
  - Der Konto-Reset kostet rund 1,3 s je Test, bei 105 Resets 32 % der
    Suite. Rein lesende Layout-Tests teilen sich einen Reset oder wandern
    in den Katalog: `core-stabilization` :182, :258, :321, :596, :1010;
    `product-surfaces` :12, :26, :158, :292, :362, :444, :485, :518, :769;
    `world-capitals-hierarchy` :186, :227, :281, :736; `navigation-context`
    :195, :770. `resetToFreshLocalState` (`appState.ts:125`) nimmt einen
    Startpfad an, statt fest `/` zu laden.
  - `mindmaps.spec.ts` (27 Tests, 31 % der Katalogzeit): 15 Tests legen
    drei Karten über die Oberfläche an, 18-mal 600 ms Autosave, 16
    Reloads. Speichern und Reload nur in :47, :117, :150 und :176; :296,
    :316 und :324 sowie :253 und :98 zusammenlegen. Die Serialisierung
    deckt `src/learningMindMaps.test.ts`.
  - `dashboard-widgets.spec.ts` (26 Tests): :235 in :402 aufnehmen, :291
    und :479 zusammenlegen, den Maskottchen-Block (:343-399, 38
    `file://`-Navigationen) nach `nightly-core`.
  - Faktisch doppelt: `batch-resilience:392` (deckt
    `apkg-quality-report:119`), `product-surfaces:292` (Teilmenge von
    :202) und :787 (`src/appNavigation.test.ts:166`),
    `navigation-context:430` (`src/appNavigation.test.ts`) und :663, :687
    (Katalog `learning-summaries`), `card-lifecycle` :470, :504, :694
    (gleicher Stapel, gleiche Liste), `auth-lifecycle:32-43`
    (`first-learning:110`). Fünf Tests fahren einen vollen APKG-Import
    über die Oberfläche; `exam-planning` klickt den Assistenten viermal.
  - Nachweis: Sekunden je Spec vorher und nachher, je Änderung der
    schützende Zwilling im Pull Request.
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
