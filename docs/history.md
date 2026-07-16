# CoRe-Verlauf

**Rolle:** einzige kanonische Quelle für abgeschlossene Arbeit, datierte Abnahmen, Release-IDs und Smoke-Protokolle.
**Stand:** 2026-07-16

Der Verlauf ist kein Produktvertrag und keine Roadmap. Aktuelles Verhalten steht in [`status.md`](status.md), offene Arbeit in [`todo.md`](todo.md).

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
