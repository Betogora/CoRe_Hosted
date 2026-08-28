# Testportfolio und Produktverträge

Stand: 28. August 2026. Laufzeiten sind auf einem bereits eingerichteten lokalen Entwicklungsrechner gemessene Korridore; der erste Docker- oder Playwright-Start kann länger dauern. Maßgeblich sind geschützte Produktverträge, nicht Testzahlen.

## Kategorien

- `unit`: deterministische Regeln eines einzelnen Domänenmoduls ohne Netzwerk, Browser oder persistente Infrastruktur.
- `contract`: öffentliche Modul-, Payload-, Sicherheits-, UI-Copy-, Schema- oder Boundary-Verträge. Externe Systeme werden dabei ersetzt oder mit einem engen Smoke geprüft.
- `integration`: Zusammenspiel mehrerer produktiver Module oder persistenter lokaler Adapter ohne vollständige Nutzerreise.
- `golden-e2e`: genau fünf verpflichtende Nutzerziele durch Browser, App und lokales Supabase. Der Testname beginnt mit dem betroffenen Vertrag.
- `heavy-release`: ressourcen- oder zeitintensive Core-Infrastruktur-, Medien- oder betriebliche Restore-Pfade. Sie laufen im gemeinsamen Nightly-/Release-Gate und bleiben dort blockierend.
- `performance`: reproduzierbare Bundle-, Start-, Preload-, Statistik- und Skalierungsgrenzen. Sie laufen beim Build, wöchentlich und bei performancekritischen Änderungen zusätzlich manuell.

Die ausführbare Zuordnung der TypeScript-Modultests liegt in `scripts/runModuleTests.ts`. Neue `src/**/*.test.ts(x)`-Dateien sind zunächst `unit`; API- und Screen-Tests sind `contract`. Abweichende Contract- und Integration-Suites werden dort ausdrücklich zugeordnet.

## Inventur

| Suite | Kategorie | Geschützter Vertrag | Laufzeit | Benötigte Infrastruktur | Ausführung |
|---|---|---|---|---|---|
| `npm run test:unit` | `unit` | Kernmodell, Scheduler, Navigation, lokale Transformationen und reine UI-Helfer bleiben deterministisch. | 5–10 s; gemessen 9,5 s | Node.js | manuelles Quality-Gate, GitHub Quality, Vercel, nightly, release |
| `npm run test:contract` | `contract` | APKG-Grenzen, Auth- und Medienadapter, APKG-Import, Migrationen, sichere Fehler, sichtbare deutsche UX und Buildbudgets bleiben stabil. | 8–15 s | Node.js; In-Memory-Adapter/Fixtures | manuelles Quality-Gate, GitHub Quality, Vercel, nightly, release |
| `npm run test:integration` | `integration` | Workspace, Cloud-Repository, Sync-Outbox/-Engine einschließlich offline persistenter Neuplanung, Variantenfluss und persistenter Mediencache arbeiten modulübergreifend zusammen. | 3–10 s; gemessen 8,1 s | Node.js, Fake IndexedDB | nightly, release, manuell |
| `npm run test:rls:core:local` | `contract` | Eigene Rows sind nutzbar; fremde Rows und `anon` bleiben gesperrt; Ownership-Fälschungen, fremde FKs und fremde Neuplanungen werden abgewiesen. Entfernte Tabellen, Spalten und `core-imports` müssen fehlen. | 45–90 s | Docker, lokales Supabase mit Auth, Postgres und Storage | nightly, release, manuell |
| Golden 1: erster Account → erste Karte → Review | `golden-e2e` | Ein neuer Nutzer bestätigt seine E-Mail, sieht einen leeren Account, erstellt eine Karte und erreicht den ersten abgeschlossenen Review. | 5–15 s; gemessen 8,1 s | Chromium, Docker, lokales Supabase, Mailpit | nightly, release, manuell |
| Golden 2: APKG → Vorschau → Import → Review | `golden-e2e` | Ein leerer Account prüft eine kleine APKG-Vorschau, übernimmt den Import bewusst und reviewt eine importierte Karte. | 5–15 s; gemessen 5,6 s | Chromium, Docker, lokales Supabase, APKG-Fixture | nightly, release, manuell |
| Golden 3: manuell → PDF → Bearbeiten → Review | `golden-e2e` | PDF-Text hilft transient bei der Erstellung; nur der übernommene Karteninhalt bleibt gespeichert, bearbeitbar und im Review sichtbar. | 5–15 s; gemessen 9,5 s | Chromium, Docker, lokales Supabase, PDF.js/PDF-Fixture | nightly, release, manuell |
| Golden 4: Review → Offline → Reconnect → Reload | `golden-e2e` | Ein offline beantwortetes Review bleibt lokal erhalten, wird nach Reconnect genau einmal cloudbestätigt und überlebt den Reload. | 5–15 s; gemessen 10,6 s | Chromium, Docker, lokales Supabase, Browser-Offlinemodus | nightly, release, manuell |
| Golden 5: Variante → Reveal → Grundkarte → Feedback | `golden-e2e` | Vor Reveal leckt keine Lösung; danach sind die zugehörige Grundkarte und kontrollierter Feedbackgrund verfügbar, während die KI-Umformulierung denselben Lernstatus nutzt. | 5–15 s; gemessen 7,6 s | Chromium, Docker, lokales Supabase | nightly, release, manuell |
| Typgerechter Kartenlebenszyklus | `integration` | Basic und Multiple Choice sowie beide Reverse-Richtungen und jede Cloze-Gruppe durchlaufen als eigenständige Karten Erstellung, Bearbeitung, Persistenz und Review; ein neuerer APKG-Reimport ersetzt Inhalt, erhält aber den CoRe-Lernstatus. | fünf Browserflows etwa 25–45 s; gemessen 26,6 s | Chromium, Docker, lokales Supabase, APKG-Fixture | nightly, release, manuell |
| Batch-Erstellung und Fehlertoleranz | `integration` | Fünf Karten bleiben in einer Session; Pin-Reset, Fokus, vollständige Deckpfade und Draftdialog sind deterministisch; Karten-/Decklöschung, Undo sowie Importmodus- und Terminalzustände bleiben reload- und syncfest. | vier Beta-Core-Browserflows etwa 20–35 s | Chromium, Docker, lokales Supabase | nightly, release, manuell |
| Stapel-IA und URL-Kontext | `integration` | Learn und Kartenverwaltung bleiben getrennt, teilen aber View-, Deck-, Karten-, Erstell- und Review-Rückkontext über URL, Reload, Direktlink sowie Browser-Zurück/-Vorwärts; ungültige IDs bleiben sicher bedienbar. | zwei Beta-Core-Browserflows etwa 15–25 s; fokussiert zuletzt 16,1 s zuzüglich Auth-Setup | Chromium, Docker, lokales Supabase | nightly, release, manuell |
| Nicht-goldene Playwright-Flows | `integration` | Auth-Resilienz, statische Core-Navigation, Kartenneuplanung ohne sichtbaren Versionsverlauf, Accessibility-Smokes, Einstellungen, Hierarchie, Konflikte und Fehlerzustände bleiben browsernah funktionsfähig; frühere Labs-Routen fallen zurück. | vollständige Browser-Suite etwa 3–5 min | Chromium, Docker, lokales Supabase | nightly, release, manuell |
| TUS über 6 MB und vollständiger RLS-/Zwei-Geräte-Lauf | `heavy-release` | Große resumierbare Medienuploads bleiben privat; konkurrierende Geräte schützen neueren Content, Offline-Reviews und Soft-Deletes. | etwa 2–5 min | Docker, lokales Supabase Storage/Auth/Postgres, TUS | nightly, release, manuell |
| Medien-Reconciliation und APKG-Medien-E2E | `heavy-release` | Accountweite SHA-1-Deduplizierung, Referenzreihenfolge, Shared-Object-Schutz, Pending-Queue, Cloudbestätigung und Signed URLs bleiben konsistent. | etwa 1–3 min | Chromium, Docker, lokales Supabase Storage, generierte APKG-Fixture | nightly, release, manuell |
| Lokaler APKG-Benchmark | `heavy-release` | Der reproduzierbare lokale Parserpfad bleibt innerhalb des 250-MiB-Limits belastbar; größere Dateien werden vor Parser- und Netzwerkzugriff abgewiesen. | Benchmark unter 2 s | Node.js, Python | nightly, release, manuell |
| `npm run performance:measure:local` | `performance` | Vier Startkontexte und kontrollierter 4G-Preload bestehen je zehn gedrosselte Läufe; Statistik-RPC, 100k-Kartensuche und Clientprojektion halten ihre p95-Grenzen mit 1 Mio. logisch aggregierten Reviews. | 50 Browserstarts plus wiederholte Datenbankmessungen | Chromium, Docker, lokales Supabase | wöchentlich, performancekritische Änderungen, release, manuell |
Die mit `@beta-core` markierte Auswahl ergänzt die fünf Golden-Flows um den typgerechten Kartenlebenszyklus, Batch-/Fehlertoleranz, dauerhafte URL-/History-Journeys, Passwort-Recovery, einen kleinen realen APKG-Medienimport und Konfliktauflösung. `@hosted-core` bezeichnet den hosted-tauglichen Teil ohne Mailpit-Lifecycle. Registrierung, Bestätigung und Recovery werden hosted separat mit realer SMTP-Zustellung abgenommen.

Eine globale Storage-Orphan-Reconciliation und ein betrieblicher Postgres-Backup-/Disaster-Restore sind noch keine implementierten Produktverträge. Das Heavy-Gate schützt den heute vorhandenen vollständigen Medienreferenzumfang und darf nicht als Nachweis für diese späteren Betriebsfunktionen bezeichnet werden.

## Gates und lokale Befehle

- Manuelles Quality-Gate: `npm run gate:push`; kombiniert Typecheck und generierte Dokumente, kompakte Unit-/Contract-Tests und den Production-Build mit Bundlebudgets. Pushes starten ohne lokalen Test-Hook; GitHub und Vercel führen denselben Vertrag unabhängig aus.
- Nightly Core: `npm run gate:nightly`; führt Beta-Core, danach vollständiges Release-E2E ohne erneute Integrationstests und anschließend den APKG-Benchmark aus. Der GitHub-Workflow läuft täglich um 02:17 UTC, bei veröffentlichten Releases und manuell als ein blockierender Job.
- Weekly Performance: `npm run performance:measure:local`; hält Supabase für Startmessung und Statistikbenchmark in einem Lebenszyklus und prüft danach das Performanceartefakt. Der GitHub-Workflow läuft montags um 04:17 UTC und manuell.
- Fokussiertes lokales PR-Produktgate: `npm run test:pr:local`; startet einmal lokales Supabase und führt Kern-RLS plus genau die fünf mit `@golden-e2e` markierten Flows aus. Es ist kein eigener erwarteter GitHub-Check mehr.
- Golden isoliert: `npm run test:e2e:golden:local`.
- Beta-Core lokal: `npm run test:beta`; führt Quality, Integration, Kern-RLS und ausschließlich die mit `@beta-core` markierten Core-Flows aus. Google und Magic Link bleiben für dieses Gate deaktiviert; Labs und serverseitige APKG existieren nicht.
- Beta-Core hosted: `npm run test:beta:hosted`; läuft mit dediziertem Testaccount gegen die in `CORE_HOSTED_BASE_URL` gesetzte Preview-, staged-Production- oder Production-URL. Die erforderlichen Variablennamen und Sicherheitsgrenzen stehen in [`operations.md`](operations.md#hosted-core-smoke).
- Vollständiges RLS isoliert: `npm run test:rls:local`.
- Vollständige lokale Infrastruktur: `npm run test:release:local`; Integration, komplette RLS-/Playwright-Suite und lokaler APKG-Benchmark.
- Erweiterte lokale Vollabnahme: `npm run test:release`; entspricht Quality-Gate plus vollständiger lokaler Infrastruktur, ist aber kein Beta-Core-Gate.

Referenzmessung am 1. August 2026: Beta-Core umfasste 22 Browserjourneys. Die frühere erweiterte Core-Abnahme benötigte im erfolgreichen Wiederholungslauf 7:14 einschließlich Integration, lokalem Supabase-Start, Datenbanktypprüfung, vollständigem RLS/TUS/Zwei-Geräte-Gate, 51 Browserjourneys und lokalem 4.900-Karten-APKG-Benchmark. Externe Container-Registry-Rate-Limits sind Infrastrukturfehler und werden getrennt von Produktregressionen ausgewiesen.

`.github/workflows/ci.yml` enthält für normale Pushes, Pull Requests und manuelle Läufe nur `quality`. Die zeitgesteuerten Workflows besitzen jeweils genau einen unabhängigen, blockierenden Job; es gibt keine Jobabhängigkeiten, kein `continue-on-error` und keine Abbruchkonkurrenz, die erwartbare `Skipped`- oder `Cancelled`-Checks erzeugt.

## Pflegevertrag

- Ein Test wird nur entfernt, wenn sein Produktvertrag in einer anderen Suite nachweisbar bleibt oder der Vertrag ausdrücklich aus dem Produkt entfernt wurde.
- Golden- und RLS-Testnamen beginnen mit `[Vertrag: …]`, damit ein Fehler das betroffene Nutzerziel oder die Sicherheitsgrenze benennt.
- Laufzeiten werden nach wesentlichen Infrastrukturänderungen als Bandbreite aktualisiert. Testanzahlen sind kein Abnahmekriterium.
- Neue schwere Browser-, Storage-, Großdatei- oder Restore-Pfade werden `heavy-release`; nur ein enges, fachlich repräsentatives Golden- oder Security-Smoke darf ins PR-Gate.
