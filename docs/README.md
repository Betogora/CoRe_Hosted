# CoRe - Content Repetition

CoRe ist ein lokaler Web-MVP fuer eine Lernplattform, die klassische Spaced-Repetition-Karten um inhaltliche Wiederholung erweitert. Das Ziel ist, Kartenblindheit zu reduzieren: Lernende sollen nicht nur Layout, Wortlaut oder Lueckenposition wiedererkennen, sondern den Inhalt auch bei veraenderter Fragestellung abrufen koennen.

Der aktuelle Stand ist ein breiter Web-MVP. Viele Produktpfade sind klickbar und testbar; Supabase und Vercel sind angebunden, und es gibt Pflichtlogin, Supabase-E-Mail/Passwort, accountgebundenen Browser-Cache und Cloud-first Autosave ueber Tabellen. Authentifizierte Screens laden bedarfsgerecht, der PDF.js-Viewer kapselt Anzeige und Quellenauswahl, und ein harter Postbuild-Check begrenzt JavaScript-Chunks auf 500.000 Byte. Das Preview-/Production-/Rollback-Runbook, die Hosted-Redirect-Konfiguration und die erste Production-Abnahme sind dokumentiert; Version, Umgebung und Build-Commit sind am Login, in den Einstellungen und im sicheren React-Fehlerfallback sichtbar. TypeScript-Migration, Konfliktauflösung und das lokale Zwei-Geräte-Sync-Gate sind abgeschlossen. Produktive Medienablage, Serverjobs, Monitoring und Backups fehlen weiterhin.

Die gepflegte Projektdokumentation liegt im Ordner `docs/`. Es gibt genau eine TODO-Markdown-Datei: `docs/todo.md`. `AGENTS.md` bleibt auf Root-Ebene, damit Coding-Agenten die Arbeitsregeln automatisch finden.

## Funktionsumfang

- Dashboard, Profil-Onboarding, Datenschutzoptionen und globale CoRe-Einstellungen.
- Deck-Verwaltung mit Hierarchie-Metadaten, Suche/Filtern, direktem Umbenennen, Unterstapel-Anlage, Kartenbearbeitung und Versionseintraegen; Lernuebersicht mit Anki-artigem Drag-and-drop fuer Unterstapel.
- Reproduzierbarer lokaler Teststapel `Welt-Hauptstädte` mit echter APKG-Fixture und sieben Kontinent-Unterstapeln.
- Importpfade fuer Anki-APKG, Text, CSV, normalisierte JSON-Payloads und Tabellen-/Excel-Paste.
- Manuelle Kartenerstellung mit Dokumentkontext und Quellenankern.
- Rich-Text-Editor, Rich-Text-Helfer und HTML-Safety-Module fuer Karteninhalt und Importvorschau.
- Deterministische lokale KI-Drafts aus Quellentext mit Schema-Validierung und Draft-Review.
- Fullscreen-Review mit Antwortaufdeckung, vier Ratings (`Again`, `Hard`, `Good`, `Easy`), Tastatursteuerung und FSRS-like Scheduler-State.
- Content-Repetition-Varianten fuer geeignete reife Karten, inklusive Originalanker, konservativer Variant-Level, Fallback nach Fehlern, Deaktivieren und Fehler-Feedback.
- Lokale Community-Logik fuer kleine Gruppen, Ordner und Deck-Kopien ohne fremde Reviewdaten.
- Deck-Graph/Mindmap, Chat-your-Deck mit Zitaten, Lernplan-Generator, AI-Job-Uebersicht und JSON-Datenportabilitaet.

## Tech Stack

- Vite
- React 19
- Tailwind CSS
- Node.js `node:test` fuer Modultests
- Accountgebundener Browser-Cache ueber `localStorage`
- Supabase Auth/Postgres fuer Account-, Profil- und Cloud-first Datenpfad

## Lokaler Start

```bash
npm install
npm run dev
```

Die Entwicklungs- und Preview-Server sind auf `http://127.0.0.1:5190/` konfiguriert.

## Scripts

```bash
npm run dev      # Vite-Dev-Server
npm test         # Node-Testlauf fuer src/**/*.test.{ts,tsx} und api/**/*.test.{ts,tsx}
npm run test:e2e # Playwright-Smoke fuer lokale Browser-Flows
npm run test:e2e:local # Supabase lokal starten, alle Browser-Smokes ausführen und wieder stoppen
npm run test:rls:local # Supabase lokal starten, Schema-/RLS-Gate und A/B/anon-Smokes ausführen
npm run build    # Produktionsbuild plus manifestbasierte 500-kB-Chunk-Pruefung
npm run preview  # Lokale Preview auf Port 5190
```

## Automatisiertes Release-Gate

`.github/workflows/ci.yml` läuft bei Pull Requests, bei Pushes auf `main` und manuell über GitHub Actions. Der Check `quality` installiert reproduzierbar mit `npm ci` und führt `npm test` sowie `npm run build` aus. Danach installiert `browser-e2e` Chromium und startet mit `npm run test:e2e:local` einen vollständig lokalen Supabase-Stack auf dem GitHub-Ubuntu-Runner. Vor Playwright laufen das SQL-Struktur-Gate und die Nutzer-A/Nutzer-B/`anon`-Data-API-Smokes. Der CI-Pfad benötigt deshalb weder Hosted-Supabase-Zugangsdaten noch KI-Provider-Secrets.

Playwright schreibt im CI-Modus einen HTML-Bericht und Screenshots für fehlgeschlagene Tests. Traces werden nur für die sessionlosen Projekte erzeugt; `auth-setup` und `authenticated-chromium` deaktivieren sie, damit keine Supabase-Sitzung in Diagnoseartefakte gelangt. Bei einem Fehler lädt der Workflow ausschließlich `playwright-report/` und `test-results/` für sieben Tage als GitHub-Actions-Artefakt hoch; `playwright/.auth/` und `.env`-Dateien bleiben ausgeschlossen. Retries bleiben deaktiviert, damit instabile Tests das Gate sichtbar fehlschlagen lassen.

## Preview- und Production-Release

Der verbindliche manuelle Ablauf steht in [`docs/specs.md`, Abschnitt 14.2.2](specs.md#1422-preview-smoke-und-production-rollback-runbook) und gespiegelt in [`docs/specs.html`](specs.html#14-2-2-preview-smoke-und-production-rollback-runbook). Er prueft auf der PR-Preview Login, Cloud-Laden, Review samt Save-Status, eine nicht uebernommene APKG-Importvorschau, `/api/ai/chat` mit vorhandenem Key sowie die Abmeldung. Der fehlende-Key-Pfad bleibt als verpflichtender Route-Test im CI-Gate und kann zusaetzlich in einer absichtlich keylosen Preview geprueft werden, ohne den gemeinsam verwendeten Preview-Key zu entfernen.

Am Login-Gate, in den Einstellungen und im React-Fehlerfallback steht eine kompakte Release-Information aus `package.json`-Version, normalisierter Umgebung und kurzem Commit. Vercel-Commits haben Vorrang vor GitHub-Commits; andere Env-Felder, URLs und Secrets werden nicht in den Browservertrag aufgenommen. Der Fehlerfallback zeigt keine rohe Exception und bietet Neuladen sowie Startseiten-Rueckkehr.

Production wird bevorzugt zuerst ohne Domain-Zuordnung gebaut und nach einem kurzen Smoke explizit freigegeben:

```powershell
vercel deploy --prod --skip-domain
vercel inspect <staged-production-url>
vercel promote <staged-production-url>
vercel promote status
```

Bei einem Produktionsfehler stellt `vercel rollback` das vorherige App-Deployment wieder her. Dieser Vorgang setzt keine Supabase-Migrationen oder Nutzerdaten zurueck; Datenbankaenderungen brauchen deshalb einen eigenen vorwaertskompatiblen Rueckfallplan. Release-Nachweise duerfen keine Secrets, Tokens, `.env`-Dateien oder Passwoerter enthalten.

## Authentifizierte Browser-Tests

Der bevorzugte kostenfreie Testpfad verwendet Docker Desktop und den lokalen Supabase-Stack:

```bash
npm run test:e2e:local
```

Der Befehl prüft die Docker-Engine, startet nur die für CoRe benötigten lokalen Supabase-Dienste, wendet ausstehende Migrationen an, führt das SQL-Struktur-Gate und echte Nutzer-A/Nutzer-B/`anon`-Data-API-Smokes aus, liest URL und Publishable Key aus dem JSON-Status der installierten Supabase-CLI ausschließlich von der Loopback-Instanz, legt lokale Testaccounts bei Bedarf an, führt Playwright aus und stoppt den Stack anschließend wieder. Die Status-Auswertung bleibt auch mit älteren `KEY=VALUE`-Ausgaben kompatibel. Beim ersten Lauf lädt Supabase die Docker-Images herunter. Docker muss dafür laufen; für `npm test`, `npm run build` und normale Entwicklungsarbeit ist Docker nicht erforderlich. Zusätzliche Playwright-Argumente werden weitergereicht, zum Beispiel `npm run test:e2e:local -- --project=auth-gate-chromium`. Für die fokussierte Datenbankabnahme ohne Browser dient `npm run test:rls:local`.

Der lokale Lauf wurde am 2026-07-14 mit allen 21 Tests erfolgreich abgenommen. Darin enthalten sind ein ausschließlich im E2E-Modus aktivierbarer Renderfehler-Smoke fuer den sicheren Fehlerfallback, ein PDF-Smoke fuer Lazy-Loading, Textauswahl, Kartenfeld und Quellenanker sowie Offline-Reconnect und Konfliktauflösung; der Production-Build enthaelt den Renderfehler-Testparameter nicht. Beim ersten Start werden die Docker-Images einmalig lokal heruntergeladen; danach startet der Lauf deutlich schneller.

Alternativ unterstützen die Playwright-Produkttests weiterhin ein separates Hosted-Supabase-Testprojekt mit einem einmalig vorab angelegten Testaccount. Lege dafür lokal eine von Git ignorierte `.env.e2e.local` mit diesen Werten an:

```text
VITE_SUPABASE_URL=https://<testprojekt>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key-des-testprojekts>
CORE_E2E_EMAIL=<vorab-angelegter-testaccount>
CORE_E2E_PASSWORD=<testpasswort>
CORE_E2E_ALLOW_ACCOUNT_RESET=true
```

`npm run test:e2e` startet Vite immer im Modus `e2e` auf `http://127.0.0.1:5190/`; ein normal laufender Dev-Server muss vorher beendet werden. Das Setup ersetzt bei jedem Lauf ausschließlich die Daten des isolierten Testaccounts durch die reproduzierbare `Welt-Hauptstädte`-Fixture und speichert die Supabase-Sitzung unter `playwright/.auth/`. Dieses Verzeichnis enthält Zugriffstoken, ist ignoriert und darf nicht committed werden. Verwende für den optionalen Hosted-Pfad niemals einen persönlichen oder produktiven Account; der GitHub-Actions-Workflow verwendet ausschließlich den lokalen Loopback-Pfad.

Die sessionlosen Auth-Gate-Smokes und die authentifizierten Produkt-Smokes lassen sich getrennt starten:

```bash
npm run test:e2e -- --project=auth-gate-chromium
npm run test:e2e -- --project=auth-resilience-chromium
npm run test:e2e -- --project=authenticated-chromium
```

`auth-gate-chromium` verwendet keine gespeicherte Sitzung und setzt keinen Account zurück. `auth-resilience-chromium` simuliert fehlende Konfiguration, Netzwerkausfall und Sessionablauf vollständig ohne Cloud-Mutation. `authenticated-chromium` führt über seine Projektabhängigkeit zuerst `auth-setup` aus und verwendet danach die bereinigte Test-Session.

## Projektstruktur

```text
src/
  App.tsx                 App-Shell: Workspace-State, Navigation und Routing
  AppErrorBoundary.tsx    Sicherer React-Fehlerfallback und Wiederherstellungsaktionen
  appRuntime.ts           Allowlist-basierte App-Version, Umgebung und Build-Commit
  screens/                UI-Screens mit kleinen Props-Interfaces
  screens/README.md       Screen-Map und Regeln fuer KI-Programmierung
  ui/                     Geteilte Praesentationsbausteine und Medien-HTML
  coreModel.ts            Zentrales Deck-, Karten-, Varianten- und Review-Datenmodell
  coreRepository.ts       Lokale Persistenz und State-Normalisierung
  accountSession.ts       Auth-Phasen, Login-Gate-Entscheidung und Sync-Statusmeldungen
  accountStorage.ts       Accountgebundene Browser-Cache-Keys und Legacy-Importmarkierung
  supabaseClient.ts       Supabase Browser-Client aus oeffentlichen Vite-Env-Variablen
  cloudAuth.ts            Supabase Auth/Profile-Kommandos
  cloudRepository.ts      Accountgefiltertes Laden/Speichern ueber Supabase-Tabellen
  coreWorkspace.ts        App-Kommandos und Demo-Daten
  fixtures/               Lokale Seed-/Fixture-Daten
  creationWorkflow.ts     Creation-/Import-Orchestrierung fuer APKG, Paste, manuell und KI-Drafts
  apkgImport.ts           Anki-APKG-Importpipeline
  pdfRuntime.ts           Geteilte, bedarfsgeladene PDF.js-Runtime samt Worker-Vertrag
  pdfSelection.ts         Text- und Koordinaten-Normalisierung fuer PDF-Quellenanker
  ui/PdfDocumentViewer.tsx Tiefer PDF-Viewer fuer Anzeige, Navigation, Zoom und Auswahl
  importService.ts        Text-, CSV-, JSON- und Tabellen-Import mit Fingerprints/Dedupe
  reviewService.ts        Tiefer Review-Flow, Sessions, Fallback und Rating-Erfassung
  scheduler.ts            FSRS-like Review-State, Intervalle, Retrievability und Maturity-XP
  libraryModel.ts         Dashboard-, Decklisten-, Heatmap- und Job-Projektionen
  richText.ts             Rich-Text-Normalisierung und Text-zu-Karten-HTML
  htmlSafety.ts           HTML-Sanitization und HTML-zu-Text-Helfer
  coreVariantService.ts   Eligibility, Reifegrad, Variant-Plan, Fallback und Varianten-Feedback
  aiOrchestrator.ts       Lokale KI-Job- und Draft-Erzeugung
  deckGraph.ts            Mindmap-/Graph-Modell
  deckAssistant.ts        Quellengebundene Deck-Antworten
  learningPlan.ts         Lokale Lernplan-Erzeugung
  dataPortability.ts      JSON-Export/-Import
```

## Wichtige Dokumente

- `docs/index.md`: Dokumentationskarte fuer Menschen und Agenten.
- `docs/specs.md`: Produktvision, Anforderungen, Datenmodell, API-Skizzen, Architektur, Hosting-/Datenbank-/KI-Leitplanken und Implementierungsstand.
- `docs/specs.html`: navigierbare HTML-Fassung der Spezifikation.
- `docs/todo.md`: einzige TODO-Markdown-Datei; Differenz zwischen aktuellem lokalen MVP und produktionsreifem Zielbild mit Code-Sicht.
- `docs/file-naming-conventions.md`: verbindliche Dateinamenskonvention nach Werkzeug, Dateiformat und Rolle.
- `docs/anki-format-analysis.md`: Analyse des offiziellen Anki-Datei- und Kartenmodells mit CoRe-Prioritaeten.
- `fixtures/apkg/world-capitals.apkg`: reproduzierbare APKG-Fixture fuer Unterstapel-Tests.
- `scripts/create_world_capitals_apkg.py`: Generator fuer APKG-Fixture, Quell-Snapshot und lokalen Seed.
- `tests/e2e/world-capitals-hierarchy.spec.ts`: Playwright-Smoke fuer Seed, Unterstapel, direkte Lernlisten-Drag-and-drop-Gesten und die Kartenstapel-Verwaltung ohne alten Drag-Handle.
- `tests/e2e/auth.setup.ts`: RLS-konformer Reset des dedizierten Testaccounts und Aufbau der ignorierten Playwright-`storageState`-Session.
- `tests/rls/ownership-smoke.test.ts`: echter lokaler Nutzer-A/Nutzer-B/`anon`-Smoke für Core-, Medien- und Sync-Tabellen.
- `tests/e2e/auth-gate.spec.ts`: sessionlose Login-Gate- und Auth-Fehler-Smokes.
- `tests/e2e/core-stabilization.spec.ts`: authentifizierte Produkt-Smokes für Navigation, Review, Varianten, KI-Draft, Assistent und Portabilität.
- `AGENTS.md`: lokale Entwicklungsregeln, empfohlene Kommandos und Architekturleitplanken.
- `vercel.json`: aktueller Vercel-Build-/Rewrite-Anker fuer die Vite-App.
- `.env.example`: oeffentliche Browser-Env-Grenzen fuer Supabase und KI-Proxy-Featureflag.
- `supabase/core_schema_v1.sql`: aktueller Supabase/Postgres-Schemaanker fuer den spaeteren Produktivpfad.
- `supabase/migrations/20260707081417_core_schema_v1.sql`: angewendete Erst-Migration des Schemaankers.
- `supabase/migrations/20260709074255_cloud_variant_schema_alignment.sql`: angewendete Schema-Abgleichsmigration fuer Cloud-Varianten, `json-import`-Quellen und entfernte `anon`-Grants.
- `supabase/migrations/20260709082140_account_scoped_primary_keys.sql`: angewendete Account-Isolationsmigration fuer zusammengesetzte Primary Keys `(user_id, id)`.
- `supabase/verify_schema_v1.sql`: RLS-/Policy-Verifikation fuer das Supabase-Schema.

## Aktueller Status

CoRe laeuft lokal als Vite/React-App und hat einen verifizierten Vercel-/Supabase-Infrastrukturpfad. Pflichtlogin, E-Mail/Passwort-Auth, Profil-Upsert, accountgebundener Cache, Cloud-first Autosave, bedarfsgeladene Produktscreens, ein PDF.js-Quellenviewer, ein hartes Build-Chunk-Gate, automatisiertes CI, sichtbare Release-Identitaet, sicherer React-Fehlerfallback und ein manuelles Preview-/Production-/Rollback-Runbook sind vorhanden. `https://core-hosted.vercel.app` ist als kanonische Production-URL festgelegt; Hosted-Supabase-Konfiguration und die protokollierte Production-Abnahme sind abgeschlossen. Das lokale Zwei-Geräte-Gate verifiziert Konflikte, Offline-Reviews und Soft-Deletes. Eine eigene Domain ist fuer dieses P0-Ziel nicht erforderlich; vollständige Betriebsbeobachtung bleibt offen.

## Naechste sinnvolle Schritte

- Den festgelegten URL-Vertrag in Hosted Supabase anwenden: Site URL `https://core-hosted.vercel.app`, Production `https://core-hosted.vercel.app/**`, Preview `https://*-bengt2.vercel.app/**`, lokal `http://127.0.0.1:5190/**`.
- Das Release-Runbook nach gruenem CI beim ersten echten staged Production-Deployment ausfuehren und den secretsfreien Nachweis ablegen; danach P1 Cloud-Datenkorrektheit aktivieren.
- Cloud-first Autosave zu einer Offline-Strategie weiterentwickeln: Konfliktmodell, Queue, Merge-Regeln und Medien-Storage.
- `supabase/core_schema_v1.sql` weiter gegen Medien-/Storage-Referenzen, Importdetails und Community-Rechte abgleichen.
- APKG-/Medienfixtures und Importidentitaeten gemaess `docs/anki-format-analysis.md` ausbauen.
- Server-KI-Proxy, Job-Queue, Prompt-Versionierung, Kostenlogging und Rate-Limits planen, bevor echte Provider angebunden werden.
