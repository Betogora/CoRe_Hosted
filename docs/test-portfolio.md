# Tests und Prüfläufe

Einzige Quelle für Testkategorien, automatische und lokale Prüfläufe, die visuelle
Pflichtmatrix und die Performance-Gates. Release, Rollback und Restore stehen in
[`operations.md`](operations.md). Maßgeblich sind geschützte Produktverträge, nicht
Testzahlen oder Laufzeiten; `gate:push` und der Modultest-Runner melden ihre
Laufzeiten bei jedem Lauf selbst.

## Was wann automatisch läuft

| Auslöser | Workflow / Ort | Befehl | Blockiert |
| --- | --- | --- | --- |
| Pull Request, Push auf `main`, manuell | GitHub `ci.yml`, Job `quality` | `npm run gate:push` | ja, Pflicht-Check für `main` |
| wie oben | GitHub `ci.yml`, Job `catalog-e2e` | `npm run test:e2e:catalog` | nein, kein Pflicht-Check |
| jedes Vercel-Deployment | Build-Befehl in `vercel.json` | `npm run gate:push` | ja, ohne Erfolg kein Deployment |
| täglich 02:17 UTC, veröffentlichtes Release, manuell | GitHub `nightly-core.yml` | `npm run gate:nightly` | ja |
| montags 04:17 UTC, manuell | GitHub `weekly-performance.yml` | `npm run performance:measure:local` | ja |

Commits und Pushes führen lokal nichts automatisch aus, weil ein gemischter
Worktree Änderungen außerhalb des Commits enthalten kann. Ein neuer Push in einen
Pull Request bricht dessen überholten Lauf ab; Läufe auf `main` brechen nie ab.
Die zeitgesteuerten Workflows haben je genau einen blockierenden Job ohne
Abhängigkeiten oder `continue-on-error`.

## Lokale Befehle

- `npm run gate:push`: Typecheck (inkrementell), Prüfung auf Ungenutztes
  (`npm run check:unused`, knip), generierte Dokumente (`npm run check:docs`),
  alle Unit-, Contract- und Integrationstests mit kompakter Ausgabe und der
  Production-Build mit Bundlebudgets laufen parallel (`scripts/runQualityGate.ts`).
  Jeder Schritt meldet seine Laufzeit; einer rot heißt Gate rot.
- `npm run gate:nightly`: Modultests, vollständige RLS- und Browser-Suite samt
  Beta-Auth-Artefakt in einem Supabase-Lauf, danach der APKG-Benchmark. Die
  Modultests laufen wegen datumsabhängiger Fälle täglich erneut.
- `npm run test:e2e:catalog`: Specs aus `tests/e2e/support/catalogSpecs.ts` über
  `playwright.catalog.config.ts`, parallel gegen den generierten Katalog oder
  vollständig abgefangene App-Flows, ohne Docker und Supabase, eigener Vite-Server
  auf Port 5195.
- `npm run test:e2e:affected:local`: wählt die Specs aus den Änderungen gegenüber
  der Merge-Basis mit `origin/main`, auch uncommittet (`scripts/affectedE2ESpecs.ts`).
  Geänderte Specs laufen immer; Produktquellen wählen über ihren Bereich, Doku und
  Modultests keine. Gemeinsame E2E-Infrastruktur, Playwright- und
  Build-Konfiguration, Abhängigkeiten, Migrationen, App-Shell und nicht
  zugeordnete Produktquellen führen zur vollständigen Suite. Ersetzt vor einem
  Release weder `test:e2e:local` noch die visuelle Pflichtmatrix.
- `npm run test:e2e:local`: vollständige lokale Browser-Suite mit Supabase,
  einschließlich Katalogflows und Datenbanktyp-Drift.
- `npm run test:pr:local`: Kern-RLS plus die sechs `@golden-e2e`-Flows.
  `npm run test:e2e:golden:local` führt nur die Golden-Flows aus.
- `npm run test:beta`: `gate:push`, Kern-RLS und die `@beta-core`-Flows; Google
  und Magic Link bleiben deaktiviert. `npm run test:beta:hosted` läuft gegen eine
  gehostete URL (siehe [Hosted-Core-Smoke](operations.md#hosted-core-smoke)).
- `npm run test:rls:local`: vollständiges RLS isoliert.
- `npm run test:release:local`: Integration, komplette RLS- und Browser-Suite,
  APKG-Benchmark. `npm run test:release` stellt `gate:push` voran.

Screenshot-Matrizen der Browserflows laufen nur mit `CORE_VISUAL_OUTPUT=1`.
Ohne die Variable prüfen Flows mit Breitenschleife 390 × 844 und 1440 × 900 im
hellen Theme ohne Screenshots; die Prüfungsflows behalten zusätzlich 720 × 450
(200 %). Mit der Variable laufen alle Größen der Pflichtmatrix, betroffene
Rasterumbrüche und beide Themes.

Unter Windows kann WinNAT die Supabase-Ports reservieren
(`netsh interface ipv4 show excludedportrange protocol=tcp`); `supabase start`
scheitert dann mit „Zugriff auf einen Socket … unzulässig“. Ohne Systemeingriff
hilft, die Ports in `supabase/config.toml` für den Lauf zu verschieben und die
Datei danach zurückzusetzen; die Testskripte lesen URLs aus `supabase status`.

## Visuelle Pflichtmatrix

Jede visuelle UI-Änderung wird in den folgenden Viewports gerendert und anhand
von Screenshots geprüft. Die Matrix gilt für alle betroffenen Ansichten und
Zustände; Änderungen an gemeinsamen Komponenten oder der App-Shell beziehen alle
konsumierenden Screens ein. Vor einer Produktfreigabe werden sämtliche sichtbaren
Menüs und Kernjourneys geprüft.

| Ziel | Viewport in CSS-Pixeln |
| --- | --- |
| Sehr schmales Smartphone | 320 × 720 |
| Schmales Smartphone | 360 × 800 |
| Standard-Smartphone | 390 × 844 |
| Breites Smartphone | 430 × 932 |
| Desktop-Mindestziel | 1280 × 720 |
| Primärer Desktop | 1440 × 900 |

- Bei Änderungen an Navigation, Shell oder Breakpoints zusätzlich 1279 × 900 und
  1280 × 900; weitere betroffene Breakpoints jeweils unmittelbar darunter und darauf.
- Light und Dark gehören immer dazu, auch wenn nur in einem Modus entwickelt wurde.
- Prüfkriterien: lesbare lange Inhalte, vollständige Beschriftungen, keine
  Überlagerungen, saubere Umbrüche, Touchziele (unter 768 px und auf Touchgeräten
  mindestens 44 × 44 px, sonst 36 px für Buttons und 40 px für Felder),
  Scrollbarkeit und die erreichbare letzte Aktion oberhalb fester Navigation und
  Speicherleisten. Horizontales Hauptscrolling ist unzulässig; dokumentierte lokale
  Scrollbereiche werden auf Bedienbarkeit geprüft.
- Betroffene Dialoge, Popover und Selects werden geöffnet; Entwürfe sowie Lade-,
  Fehler- und Leerzustände berücksichtigt. Bei Eingaben gehört die geöffnete
  Smartphone-Tastatur dazu. Die betroffene Kernjourney wird zusätzlich bei 200 %
  Zoom geprüft.

Änderungen an Kartendarstellung oder APKG-Import prüfen zusätzlich diese
Referenzinhalte aus `fixtures/apkg/matrix/`, je Fall in Light und Dark vor und
nach dem Aufdecken in Review und Kartenvorschau bei mindestens 390 × 844 und
1440 × 900:

| Fall | Fixture | Notiz-GUID |
| --- | --- | --- |
| Lückentext mit Mehrfachnummer, verschachtelt, in Formel | `standard-latest`, `special-latest` | `matrix-cloze`, `matrix-cloze-nested`, `matrix-cloze-math` |
| Bildverdeckung nativ und Image Occlusion Enhanced | `special-latest` | `matrix-io-native`, `matrix-ioe-1` |
| Hinweise, Zusatz und Quellen-Link | `special-latest` | `matrix-hint-tts`, `matrix-anking` |
| Antwort eintippen | `standard-latest` | `matrix-type-in` |
| Kprim, Multiple und Single Choice | `special-latest` | `matrix-mc-kprim`, `matrix-mc-multiple`, `matrix-mc-single` |
| Formeln und LaTeX | `special-latest` | `matrix-math` |
| Tabelle, farbiger Text, Audio und Video | `special-latest` | `matrix-media-rich` |
| Originallayout (Template, CSS, Feld im Attribut, Nachtregeln) | `special-latest` | `matrix-originallayout` |

Der Abschlussbericht nennt Version, Viewports, Theme, geprüfte Zustände und
Screenshots. Nicht geprüfte Fälle bleiben ausdrücklich offen; Geometrieprüfungen,
Builds, Entwürfe oder Mockups ersetzen die Sichtprüfung nicht.

## Performance-Gates

Die Zielwerte stehen in [`specs.md`](specs.md#performance). Geprüft werden sie so:

- Der Production-Build erzwingt die Bundle-Grenzen (300 KiB gzip initial, 200 KiB
  je Lazy-Feature) bei jedem `gate:push`.
- `npm run performance:measure:local` startet lokales Supabase, baut die
  E2E-Production-App und misst je zehn gedrosselte Läufe (Chromium, etwa 1,6 Mbit/s,
  150 ms RTT, vierfache CPU-Verlangsamung) für wiederkehrenden Browser, frischen
  Kontext, persistenten Kontext ohne Service Worker, Offline-Kaltstart und einen
  kontrollierten 4G-Preload. Im selben Lauf misst er den Statistikpfad mit
  100.000 Karten und 1 Mio. logisch aggregierten Reviews.
- Das Artefakt `test-results/performance.json` enthält nur Laufzeiten, Stapel- und
  Outboxanzahl und den Service-Worker-Status; `npm run performance:gates --
  test-results/performance.json` prüft es gegen die festen Grenzen (u. a. keine
  automatischen 3G-Preloads, höchstens 50 ms je 4G-Preload-Task, Statistik-RPC p95
  ≤ 1.000 ms, 100k-Kartensuche ≤ 2.000 ms, Clientprojektion ≤ 50 ms).
- Zusätzlich lokal auszuführen bei Änderungen an Bootstrap, Preload, Sync, Katalog,
  Statistik, Service Worker, Abhängigkeiten oder Chunking sowie vor Releases.
- Ein rotes Gate bleibt rot; ein fehlendes oder nur technisch erzeugtes Artefakt
  ist kein Freigabenachweis. Feld-p75/p95 und die vollständige 100k-Browserjourney
  misst der Lauf nicht.

## Kategorien

| Kategorie | Inhalt | Läuft in |
| --- | --- | --- |
| `unit` | deterministische Regeln eines Domänenmoduls ohne Netzwerk, Browser oder Persistenz | `gate:push`, nightly |
| `contract` | öffentliche Modul-, Payload-, Sicherheits-, UI-Copy-, Schema- oder Boundary-Verträge | `gate:push`, nightly |
| `integration` | Zusammenspiel mehrerer Module oder persistenter lokaler Adapter; Browserflows ohne Golden-Status | Modulsuites in `gate:push`; Browserflows nightly und lokal |
| `golden-e2e` | sechs verpflichtende Nutzerziele durch Browser, App und lokales Supabase | nightly, `test:pr:local`, Release |
| `heavy-release` | ressourcen- oder zeitintensive Infrastruktur-, Medien- und Restore-Pfade | nightly, Release |
| `performance` | Bundle-, Start-, Preload-, Statistik- und Skalierungsgrenzen | Build, weekly, manuell |

Die Zuordnung der Modultests liegt in `scripts/runModuleTests.ts`. Neue
`src/**/*.test.ts(x)` sind zunächst `unit`, API- und Screen-Tests `contract`. Der
Runner verteilt die Dateien auf einen Prozess je CPU-Kern ohne Prozessisolation
(`--test-isolation=none`): Ein Test räumt jeden globalen Zustand, den er setzt
(Mocks, Timer, `globalThis`, Fake-IndexedDB), selbst ab und setzt weder
Dateireihenfolge noch frischen Prozess voraus.

## Inventur

| Suite | Kategorie | Geschützter Vertrag | Infrastruktur |
| --- | --- | --- | --- |
| `npm run test:unit` | `unit` | Kernmodell, Scheduler, Navigation, lokale Transformationen und reine UI-Helfer bleiben deterministisch. | Node.js |
| `src/coreModel/notes.test.ts`, `noteContent.test.ts` | `unit` | Note-/Card-Domäne: validierte Inhalte, Abfrageableitung, stabile Kartenidentität und Lernstände bei Änderungen, bestätigungspflichtige Entfernungen, Löschplanung samt Undo, Wiederherstellung, Markierung und Kopie. | Node.js |
| `src/notePresentation.test.ts`, `src/ui/colorMath.test.ts` | `unit` | Renderer: Seitenkomposition, Feldrollen, verschachtelte Lücken und Formeln ohne Antwortleck, relative Bildmasken, sichere Medien/Links, zugänglicher Formeltext, Unicode-Vergleich, Auswahlregeln, Theme-Kontrast. | Node.js |
| `src/importRetranslation.test.ts`, `src/coreVariantService.test.ts` | `unit` | Neuübersetzung: unveränderte Inhalte bleiben ungeschrieben, Karten behalten Lernstand, neue Abfragen werden Karten, eine entfallende Karte mit Lernstand hält den Inhalt fest. Variantenquelle, Erzeugungseignung, Variantenwahl im Review und Darstellung. | Node.js |
| `npm run test:contract` | `contract` | APKG-Grenzen, Auth- und Medienadapter, Import, Migrationen, sichere Fehler, sichtbare deutsche UX, Buildbudgets. | Node.js, In-Memory-Adapter |
| `src/apkgFormatMatrix.test.ts` | `contract` | Zwölf mit `anki==26.5` erzeugte Pakete aus `fixtures/apkg/matrix/` laufen über `readAnkiPackage`, Note-Übersetzung und `renderCard` gegen `apkg-matrix.expected.json`; bekannte Lücken stehen streng in `KNOWN_GAPS`. | Node.js, versionierte Fixtures |
| `src/apkgNoteTranslation.test.ts` | `contract` | Mediendubletten und -normalisierung, Feldlisten-Rückfall, geänderte Standardvorlagen, AnKing-Feldrollen, Image-Occlusion-Eigenschaften, Lernstand, abgeleitete und überzählige Karten, Medienzuordnung, Dateigrenzen. | Node.js, Matrix-Fixture |
| `npm run test:integration` | `integration` | Workspace, Cloud-Repository, Sync-Outbox/-Engine, IndexedDB, Hydration und persistenter Mediencache arbeiten zusammen. | Node.js, Fake IndexedDB |
| `npm run test:rls:core:local` | `contract` | Eigene Rows nutzbar, fremde Rows und `anon` gesperrt; Ownership-Fälschungen, fremde FKs und Neuplanungen abgewiesen; entfernte Tabellen und `core-imports` fehlen. | Docker, lokales Supabase |
| Golden 1–6 (`@golden-e2e`) | `golden-e2e` | Erster Account → erste Karte → Review · APKG → Vorschau → Import → Review · manuell mit PDF → Bearbeiten → Review · Review offline → Reconnect → Reload · Variante → Reveal → Originalkarte → Verwaltung · KI-Umformulierung → Persistenz → Reload. | Chromium, Docker, lokales Supabase, Mailpit, Fixtures |
| `tests/e2e/note-presentation.spec.ts` | `integration` | Katalog-Kartenbausteine: Eintippen, Auswahlmodi, Hinweise, Script-CSP, Formelschriften, Medien, Sprachausgabe, AMBOSS-Textauswahl. | Chromium, generierte Doku |
| Kartenlebenszyklus, Batch-Erstellung, Stapel-IA und URL-Kontext | `integration` | Jede Kartenform als eigenständige Karte durch Erstellung, Bearbeitung, Persistenz und Review; Begraben reloadfest; Reimport erhält Lernstand; Batch, Löschen, Undo, Importzustände; URL-, Reload- und History-Kontext. | Chromium, Docker, lokales Supabase |
| Lerninhalte (`learning-summaries`, `mindmaps`, `[Vertrag: Lerninhalte]`) | `integration` | Bedienung, Speicherfehler und Reload der Panels; Tabs per URL, Entwurfsschutz, KI-Fassung mit nachgebildeter Route, Kontobindung; `src/latestSaver.test.ts` sichert Autospeichern. | Chromium; App-Verträge mit Supabase |
| Übrige Playwright-Flows | `integration` | Auth-Resilienz, Navigation, Neuplanung, Accessibility-Smokes, Einstellungen, Hierarchie, Konflikte, Fehlerzustände; frühere Labs-Routen fallen zurück. | Chromium, Docker, lokales Supabase |
| TUS über 6 MB, RLS-/Zwei-Geräte-Lauf | `heavy-release` | Große Uploads bleiben privat; konkurrierende Geräte schützen neueren Inhalt, Offline-Reviews und Soft-Deletes. | Docker, lokales Supabase Storage |
| Medien-Reconciliation, APKG-Medien-E2E | `heavy-release` | SHA-1-Deduplizierung, Referenzreihenfolge, Shared-Object-Schutz, Pending-Queue, Signed URLs. | Chromium, Docker, Supabase Storage |
| `npm run benchmark:apkg` | `heavy-release` | Worker liefert 25.000 Karten, 1.000 Medien und höchstens fünf Vorschaukarten; Übergabe unter 100 ms, unter 1 GiB Heap plus ArrayBuffer. | Node.js, Python |
| `npm run benchmark:apkg:large` | `heavy-release` | Paket knapp unter 2 GiB aus dateigestützter Blob-Quelle mit 1-GiB-Heap-Grenze. Nur manuell. | Node.js, Python, ~2 GB Platz |
| `npm run performance:measure:local` | `performance` | siehe [Performance-Gates](#performance-gates). | Chromium, Docker, lokales Supabase |
| `npm run measure:footprint` | `performance` | Speicherbedarf je 1.000 Basic-, Reverse- und Lückentext-Inhalte in Postgres, Sync und Replica; kein Grenzwert. Nur manuell. | Python `anki==26.5`, Docker |
| `npm run fixtures:apkg-matrix` | Werkzeug | Erzeugt Matrix-Pakete und Erwartungsmanifest gemeinsam neu; nie einzeln bearbeiten. | Python `anki==26.5` |
| `npm run report:apkg-corpus` | Werkzeug | Übersetzt echte Stapel aus dem gitignorierten `fixtures/apkg/corpus/` und berichtet je Notiztyp; ohne Dateien Exit-Code 2. Gefundene Muster gehen als Nachbau in die Matrix. | Node.js, lokaler Korpus |

`@beta-core` umfasst die Golden-Flows plus Kartenlebenszyklus, Batch und
Fehlertoleranz, URL-/History-Journeys, Passwort-Recovery, einen kleinen
APKG-Medienimport und Konfliktauflösung. `@hosted-core` ist der hosted-taugliche
Teil ohne Mailpit; Registrierung, Bestätigung und Recovery werden hosted
getrennt mit realer SMTP-Zustellung abgenommen.

## Bekannte Testlücken

1. Hydration: fehlgeschlagener Lernpuffer-Refill und sichtbarer Offlineabbruch auf Serviceebene.
2. Quota: serviceübergreifender Schutz gepinnter und aktiver Medien sowie die Bereinigung von 80 auf 70 % Speicherbelegung.
3. APKG-Benchmark: Parserzeit und Speicherspitze sind noch nicht blockierend; erst belastbare Korridore erheben.
4. Keine vollständige automatisierte Accessibility- und Screenshot-Abnahme; ARIA-, Tastatur- und Geometrieprüfungen ersetzen die Pflichtmatrix nicht.
5. Globale Storage-Orphan-Reconciliation und Postgres-Disaster-Restore sind keine Produktverträge; das Heavy-Gate ist kein Nachweis dafür.

## Pflegevertrag

- Ein Test wird nur entfernt, wenn sein Vertrag anderswo nachweisbar bleibt oder aus dem Produkt entfernt wurde.
- Ein Export, den außer Tests niemand nutzt, ist toter Code; Funktion und Test entfallen gemeinsam. Ausnahmen tragen `/** @internal */` (bewusst nur für Tests angebotene Seam-Hilfe) oder `/** @public */` (fertige Schnittstelle mit ausstehendem Aufrufer).
- Abwesenheitsprüfungen gehören zur Entfernung selbst. Ausgenommen sind die Browserprüfungen für [Beta-Abnahme Punkt 4](specs.md#22-beta-abnahme), auch hosted.
- Browserflows setzen das Cloud-Konto nur zurück, wenn sie Cloudzustand prüfen oder voraussetzen.
- Eine neue Spec steht in `tests/e2e/support/catalogSpecs.ts` (ohne Supabase) oder in einem Projekt von `playwright.config.ts` und ist in `AREAS` von `scripts/affectedE2ESpecs.ts` zugeordnet; `src/affectedE2ESpecs.test.ts` meldet Lücken.
- Golden- und RLS-Testnamen beginnen mit `[Vertrag: …]`.
- Neue schwere Browser-, Storage-, Großdatei- oder Restore-Pfade werden `heavy-release`; ins PR-Gate darf nur ein enges Golden- oder Security-Smoke.
- APKG-Matrix: Erwartungen ändern sich nur im Generator `scripts/create_apkg_matrix_fixtures.py` und nur bei belegter Abweichung von Anki oder einer ADR. Neue `KNOWN_GAPS` nur für bisher unentdeckte Lücken, nie um ein Gate grün zu machen.
- Jeder neue Test nennt im Review den verletzbaren Vertrag, eine plausible Änderung, bei der er fehlschlägt, und den zusätzlichen Schutz gegenüber vorhandenen Tests. Fixtures bleiben so klein wie der Fehlerfall erlaubt.
