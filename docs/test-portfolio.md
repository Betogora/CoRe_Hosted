# Testportfolio und Produktverträge

Stand: 15. Juli 2026. Laufzeiten sind auf einem bereits eingerichteten lokalen Entwicklungsrechner gemessene Korridore; der erste Docker- oder Playwright-Start kann länger dauern. Maßgeblich sind geschützte Produktverträge, nicht Testzahlen.

## Kategorien

- `unit`: deterministische Regeln eines einzelnen Domänenmoduls ohne Netzwerk, Browser oder persistente Infrastruktur.
- `contract`: öffentliche Modul-, Payload-, Sicherheits-, UI-Copy-, Schema- oder Boundary-Verträge. Externe Systeme werden dabei ersetzt oder mit einem engen Smoke geprüft.
- `integration`: Zusammenspiel mehrerer produktiver Module oder persistenter lokaler Adapter ohne vollständige Nutzerreise.
- `golden-e2e`: genau fünf verpflichtende Nutzerziele durch Browser, App und lokales Supabase. Der Testname beginnt mit dem betroffenen Vertrag.
- `heavy-release`: ressourcen- oder zeitintensive Infrastrukturpfade. Sie blockieren `main`, Nightly, Releases und manuelle Vollabnahmen, aber nicht jeden Pull Request.

Die ausführbare Zuordnung der TypeScript-Modultests liegt in `scripts/runModuleTests.ts`. Neue `src/**/*.test.ts(x)`-Dateien sind zunächst `unit`; API- und Screen-Tests sind `contract`. Abweichende Contract- und Integration-Suites werden dort ausdrücklich zugeordnet.

## Inventur

| Suite | Kategorie | Geschützter Vertrag | Laufzeit | Benötigte Infrastruktur | Ausführung |
|---|---|---|---|---|---|
| `npm run test:unit` | `unit` | Kernmodell, Scheduler, Navigation, lokale Transformationen und reine UI-Helfer bleiben deterministisch. | 5–10 s; gemessen 9,5 s | Node.js | PR, `main`, nightly, release, manuell |
| `npm run test:contract` | `contract` | API-/AI-/APKG-Grenzen, Auth- und Medienadapter, Importformate, sichere Fehler, sichtbare deutsche UX und Buildbudgets bleiben stabil. | 8–15 s; gemessen 12,1 s | Node.js; In-Memory-Adapter/Fixtures | PR, `main`, nightly, release, manuell |
| `npm run test:integration` | `integration` | Workspace, Cloud-Repository, Sync-Outbox/-Engine, Variantenfluss und persistenter Mediencache arbeiten modulübergreifend zusammen. | 3–10 s; gemessen 8,1 s | Node.js, Fake IndexedDB | `main`, nightly, release, manuell |
| `npm run test:rls:core:local` | `contract` | Eigene Rows sind nutzbar; fremde Rows und `anon` bleiben gesperrt; Ownership-Fälschungen, fremde FKs und Browserwrites auf serverautoritative Job-Ledger werden abgewiesen. | 45–90 s; gemessen 54 s | Docker, lokales Supabase mit Auth, Postgres und Storage | PR, `main`, nightly, release, manuell |
| Golden 1: erster Account → erste Karte → Review | `golden-e2e` | Ein neuer Nutzer bestätigt seine E-Mail, sieht einen leeren Account, erstellt eine Karte und erreicht den ersten abgeschlossenen Review. | 5–15 s; gemessen 8,1 s | Chromium, Docker, lokales Supabase, Mailpit | PR, `main`, nightly, release, manuell |
| Golden 2: APKG → Vorschau → Import → Review | `golden-e2e` | Ein leerer Account prüft eine kleine APKG-Vorschau, übernimmt den Import bewusst und reviewt eine importierte Karte. | 5–15 s; gemessen 5,6 s | Chromium, Docker, lokales Supabase, APKG-Fixture | PR, `main`, nightly, release, manuell |
| Golden 3: manuell → PDF → Bearbeiten → Review | `golden-e2e` | PDF-Text wird als Quellenanker gespeichert; die Karte bleibt bearbeitbar und die Änderung erscheint im Review. | 5–15 s; gemessen 9,5 s | Chromium, Docker, lokales Supabase, PDF.js/PDF-Fixture | PR, `main`, nightly, release, manuell |
| Golden 4: Review → Offline → Reconnect → Reload | `golden-e2e` | Ein offline beantwortetes Review bleibt lokal erhalten, wird nach Reconnect genau einmal cloudbestätigt und überlebt den Reload. | 5–15 s; gemessen 10,6 s | Chromium, Docker, lokales Supabase, Browser-Offlinemodus | PR, `main`, nightly, release, manuell |
| Golden 5: Variante → Reveal → Anker → Feedback | `golden-e2e` | Vor Reveal leckt keine Herkunft; danach sind Originalanker und kontrollierter Feedbackgrund verfügbar und das Variantenreview bleibt möglich. | 5–15 s; gemessen 7,6 s | Chromium, Docker, lokales Supabase | PR, `main`, nightly, release, manuell |
| Nicht-goldene Playwright-Flows | `integration` | Auth-Resilienz, Navigation, Accessibility-Smokes, Einstellungen, Labs-Grenzen, Hierarchie, Konflikte und Fehlerzustände bleiben browsernah funktionsfähig. | vollständige Browser-Suite etwa 3–5 min; zuletzt 4,5 min | Chromium, Docker, lokales Supabase | `main`, nightly, release, manuell |
| TUS über 6 MB und vollständiger RLS-/Zwei-Geräte-Lauf | `heavy-release` | Große resumierbare Medienuploads bleiben privat; konkurrierende Geräte schützen neueren Content, Offline-Reviews und Soft-Deletes. | etwa 2–5 min | Docker, lokales Supabase Storage/Auth/Postgres, TUS | `main`, nightly, release, manuell |
| Medien-Reconciliation und APKG-Medien-E2E | `heavy-release` | Accountweite SHA-1-Deduplizierung, Referenzreihenfolge, Shared-Object-Schutz, Pending-Queue, Cloudbestätigung und Signed URLs bleiben konsistent. | etwa 1–3 min | Chromium, Docker, lokales Supabase Storage, generierte APKG-Fixture | `main`, nightly, release, manuell |
| Serverseitiger Groß-APKG-Vertrag und Benchmark | `heavy-release` | Die Umschaltung oberhalb 250 MiB, ZIP-/Byte-Limits, serverseitige Jobprojektion, serverseitige Archiv-/Medienprüfung und der reproduzierbare große Browser-Parserpfad bleiben belastbar. | Benchmark unter 2 s; vollständiges Release-Gate etwa 4–6 min | Node.js, Python; im vollen Gate lokales Supabase | `main`, nightly, release, manuell |
| Portabilitäts- und Restore-Flows | `heavy-release` | Export/Import redigiert Authdaten, validiert Versionen, erhält lokale Konfliktgewinner; Karten-Restore ist bestätigt und auditierbar. | etwa 1–2 min | Chromium, Docker, lokales Supabase, Download-Dateisystem | `main`, nightly, release, manuell |

Eine globale Storage-Orphan-Reconciliation und ein betrieblicher Postgres-Backup-/Disaster-Restore sind noch keine implementierten Produktverträge. Das Heavy-Gate schützt den heute vorhandenen vollständigen Medienreferenz-, Portabilitäts- und Karten-Restore-Umfang und darf nicht als Nachweis für diese späteren Betriebsfunktionen bezeichnet werden.

## Gates und lokale Befehle

- PR-Qualität: `npm run typecheck`, `npm run test:unit-contract`, `npm run build`.
- PR-Produktgate: `npm run test:pr:local`; startet einmal lokales Supabase und führt Kern-RLS plus genau die fünf mit `@golden-e2e` markierten Flows aus.
- Golden isoliert: `npm run test:e2e:golden:local`.
- Vollständiges RLS isoliert: `npm run test:rls:local`.
- Vollständige lokale Infrastruktur: `npm run test:release:local`; Integration, komplette RLS-/Playwright-Suite und Groß-APKG-Benchmark.
- Vollständige lokale Release-Abnahme: `npm run test:release`; entspricht Quality-Gate plus vollständiger lokaler Infrastruktur.

Referenzmessung am 15. Juli 2026: `npm run test:pr:local` 2:20 einschließlich Supabase-Start, Kern-RLS, separatem Auth-Setup und fünf Golden-Flows; `npm run test:release:local` 5:24 einschließlich Integration, vollständigem RLS/TUS/Zwei-Geräte-Gate, 40 Browserflows sowie server- und browserseitigem APKG-Benchmark.

`.github/workflows/ci.yml` führt das PR-Produktgate parallel zum Quality-Gate aus. Pushes auf `main`, veröffentlichte Releases, der tägliche Nightly-Lauf und `workflow_dispatch` führen nach dem Quality-Gate das vollständige Release-Gate aus.

## Pflegevertrag

- Ein Test wird nur entfernt, wenn sein Produktvertrag in einer anderen Suite nachweisbar bleibt oder der Vertrag ausdrücklich aus dem Produkt entfernt wurde.
- Golden- und RLS-Testnamen beginnen mit `[Vertrag: …]`, damit ein Fehler das betroffene Nutzerziel oder die Sicherheitsgrenze benennt.
- Laufzeiten werden nach wesentlichen Infrastrukturänderungen als Bandbreite aktualisiert. Testanzahlen sind kein Abnahmekriterium.
- Neue schwere Browser-, Storage-, Großdatei- oder Restore-Pfade werden `heavy-release`; nur ein enges, fachlich repräsentatives Golden- oder Security-Smoke darf ins PR-Gate.
