# CoRe TODO

Stand: 2026-07-14

Diese Liste wurde gegen den tatsächlichen Repository-Stand geprüft. Grundlage waren `docs/specs.md`, `AGENTS.md`, die Module unter `src/`, die Vercel-Route unter `api/`, die Supabase-SQL-Dateien, die Tests und die lokalen Build-/E2E-Läufe. Die Liste beschreibt deshalb konkrete Lücken und keine allgemeinen Produktideen.

## Auditierter Ist-Stand

- `npm run typecheck`: strikter reiner TypeScript-Graph und Type-Policy ohne `@ts-ignore`/`@ts-nocheck` sind grün; `allowJs: false` und das Dateipolicy-Gate verhindern JavaScript-Rückfälle in den Codewurzeln.
- `npm test`: 358 Tests bestanden, einschließlich Redirect-/Fehlercode-Verträgen, Secret-Redaktion, Loopback-Grenzen, APKG-Route, serverseitigen ZIP-Sicherheitsgrenzen und der gemeinsamen Browser-/Server-Medienfinalisierung sowie den bestehenden Runtime-Vertragstests für lokale/Cloud-Persistenz, Medien, KI und APKG.
- `npm run build`: erfolgreich und ohne Chunk-Warnung. Der größte budgetierte JavaScript-Chunk ist PDF.js mit 431,65 kB; der aktuelle Entry-Chunk ist 315,89 kB. Ein manifestbasierter Postbuild-Check bricht den Build bei mehr als 500.000 Byte pro JavaScript-Chunk ab. Der getrennt geladene PDF-Worker und WASM-Dateien sind von diesem JavaScript-Budget ausgenommen.
- `npm run test:e2e:local`: zehn RLS-Smokes, der lokale AI-Job-Ledger-Smoke und 28 Playwright-Tests einschließlich Desktop-/Mobile-Abnahme des APKG-Importberichts sind im vollständigen lokalen Docker-/Supabase-Gate grün.
- `npx supabase migration list --linked`: mit Supabase CLI 2.109.0 erfolgreich. Die vier Migrationen bis einschließlich `20260709091315` sind lokal und remote vorhanden; die neue APKG-Jobmigration `20260714212117` ist lokal abgenommen und bleibt bis zum separaten Hosted-Release-Gate unapplied.
- `supabase/verify_schema_v1.sql` besteht vollständig: Zielspalten einschließlich `apkg_import_jobs`, Tabellen, Composite Keys/FKs, RLS, Policies, `authenticated`-/`service_role`-Grants, fehlende `anon`-Grants sowie die privaten Buckets `core-media` und `core-imports` sind bestätigt.
- `npm run test:rls:local`: SQL-Struktur-Gate und zehn echte Data-API-/Sync-Smokes mit Nutzer A, Nutzer B und `anon` sind grün. Der Medien-Smoke prüft einen Standard-Upload, einen echten Upload über 6 MB per TUS, private Objekt-/Row-Zugriffe und zwei Referenzen auf dasselbe accountweite Objekt. Das Zwei-Geräte-Gate prüft mit getrennten Clients, Storages und Geräte-IDs stale Snapshots, idempotente Offline-Reviews und dauerhafte Soft-Deletes.
- Der Performance-Advisor meldet keine Warnungen. Der Security-Advisor meldet ausschließlich den bereits vor der Migration vorhandenen Hinweis `auth_leaked_password_protection`.
- Der debouncete Autosave läuft über `src/syncEngine.ts` und `src/cloudRepository.ts`: `applyDeckMutation`, `applyCardMutation` und `softDeleteEntity` prüfen Basisrevisionen atomar über `user_id`, `id` und `revision`; stale Writes erzeugen idempotente `sync_conflicts`. Deckbaum-Löschungen bleiben bis zur Cloud-Bestätigung als Tombstones erhalten. Die accountgebundene Outbox überlebt Reloads, behält fehlgeschlagene Mutationen mit Retry-Zähler und entfernt Review- beziehungsweise Snapshot-Mutationen nur nach getrenntem Persistenz-Readback.
- `src/creationWorkflow.ts` hält lokale und serverseitige APKG-Pfade hinter einer Seam. Bis 250 MiB bleibt der Browser-Worker unverändert; darüber liefert der Server nur Bericht und medienfreies Artefakt. Browser und Trigger verwenden für die anschließende Medienfinalisierung denselben Planer und dieselbe accountweite SHA-1-/Referenz-/Löschlogik aus dem bestehenden Medienmodul.
- Der einzige Server-KI-Pfad ist `POST /api/ai/chat`. Die Route prüft Supabase-Bearer und accountgebundene Einwilligung, begrenzt Nutzer und IP über Upstash, erzwingt strikte Payload-/Prompt-/Modell-/Outputgrenzen sowie UUID-Idempotenz und protokolliert bei Providerfehlern nur sichere Strukturmetadaten. Dauerhafte Kostenbudgets und das echte Server-Jobmodell fehlen weiterhin.
- Community, Graph, KI-Drafts, Varianten und Jobs sind weiterhin lokale Produktmodelle; nur Chat besitzt einen externen Gemma-Proxy.

## Reihenfolge

Die Abhängigkeiten sind absichtlich enger als in der früheren Liste:

`P0 TypeScript-Modernisierung` → `P1 Cloud-Datenkorrektheit` → `P1 Sync und Medien` → `P1 externe KI-Jobs` → `P2 Community-Rechte und Wachstum`.

Das bisherige P0-Betriebsgate, P1 Repository-Mapping, die lokale Ownership-/RLS-Abnahme, die persistente Outbox, die Geräte-Registrierung, konkrete revisionsgeprüfte Cloud-Mutationen, die fachlichen Konfliktregeln, die klickbare Konfliktauflösung sowie Online-/Offline-Status mit Wiederverbindungs-Backoff sind geschlossen. Die gewachsene JavaScript-Codebasis wurde in vier abhängigen Arbeitspaketen auf einen strikten TypeScript-Pfad gebracht; das Zwei-Geräte-Korrektheitsgate ist ebenfalls abgeschlossen. Weitere Produktarbeit folgt der verbleibenden Priorisierung unten.

## Aktives nächstes Ziel

**P1 Auth-Lifecycle — lokal abgeschlossen, Hosted-Abnahme offen.** Redirect- und Fehlercode-Vertrag, lokale bestätigte Testaccounts, Mailpit-Hilfe, fünf Browser-Flows, Account-/Datenschutz-Datenfluss sowie das Docker-basierte RLS-/E2E-Gate sind grün. Offen bleibt ausschließlich die tatsächlich autorisierte Hosted-Konfiguration mit secretsfreiem Readback.

Verbindlicher URL-Vertrag:

- kanonische Production- und Supabase-Site-URL: `https://core-hosted.vercel.app`
- exakter Production-Redirect: `https://core-hosted.vercel.app/**`
- ausschließlich für Vercel-Previews: `https://*-bengt2.vercel.app/**`
- lokaler Redirect: `http://127.0.0.1:5190/**`

Phasen und messbare Abnahme:

- [x] Lokale P0-Implementierung: tiefer PDF.js-Viewer mit kontinuierlicher Anzeige, Fit-to-width, Navigation, Zoom, Textauswahl und `pageNumber`/`bbox`; Lazy-Loading der authentifizierten Screens; dynamischer APKG-Pfad; getrennte React-/Supabase-Chunks; harte 500-kB-Buildgrenze; Modul- und Browser-Smokes grün.
- [x] Hosted Supabase konfiguriert und geprüft: Site URL und genau die drei Redirect-Muster oben sind eingetragen; Production bleibt exakt, Wildcard nur für Preview. Der Dashboard-Readback nach Reload bestätigt alle vier Werte ohne Secret- oder Auth-Daten.
- [x] Release-Abnahme nach grünem CI: Commit `e600ac4817f80c8ca8062df3aa2c706ee1f71178`, GitHub-Lauf `29121208290`, Preview `dpl_ADcYAJBLJWcZ9mu2cMJPeMAyCMGG`, staged/Production `dpl_CCF8hGMt236krS8CdPW5W9G1yWM9`, Preview-Smoke 1-8, Kurzsmoke vor und nach Promotion sowie 5xx-/Error-Log-Scan sind grün und in `docs/specs.md` 14.2.2 protokolliert.
- [x] P1 Repository-Mapping mit revisionsbedingtem Delta-Autosave, Tombstones und Server-Acknowledgements geschlossen; Ownership-/RLS-Smokes als aktives Ziel gesetzt.
- [x] P1 Ownership-/RLS-Gate geschlossen: `npm run test:rls:local` führt das erweiterte SQL-Verify und acht Nutzer-A/Nutzer-B/`anon`-Data-API-Smokes ausschließlich gegen Loopback-Supabase aus; `npm run test:e2e:local` führt dasselbe Gate vor Playwright aus.
- [x] P1 Geräte-Registrierung geschlossen: der Account-Boot registriert `sync_devices` vor dem Cloud-Load, aktualisiert `last_seen_at`, User-Agent und Browser-/Betriebssystem-Label, bewahrt `created_at` und übergibt getrennte Snapshot-/Review-Mutation-IDs samt Geräte-ID an das Repository.
- [x] P1 konkrete Cloud-Mutationen geschlossen: `applyDeckMutation`, `applyCardMutation`, `appendReviewEvent`, `softDeleteEntity` und `markConflict` bestätigen nur persistierte Writes, halten stale Snapshots in der Outbox und schreiben Konflikte idempotent; 257 Modul-, acht RLS- und 19 Browser-Tests sind grün.
- [x] P1 Konfliktregeln geschlossen: Review-Events bleiben unveränderlich append-only, stale Nutzerinhalte und -metadaten erzeugen Konflikte, reine Servermetadaten werden anerkannt und Cloud-Medien werden innerhalb eines Deck-/Card-Kontexts per SHA-1 dedupliziert; 262 Modultests und der Production-Build sind grün.
- [x] P1 Konfliktauflösung geschlossen: `SyncConflictPanel` zeigt accountgebundene Konflikte, lokale/Remote-Versionen, sicheren Feld-Merge und zurückgestellte Entscheidungen; CAS, Tombstones, Outbox-Neubildung und weiterlaufende append-only Reviews bleiben hinter `cloudRepository`/`syncEngine`. 273 Modul-, acht RLS- und 20 Browser-Tests sowie der Production-Build sind grün.
- [x] P0 M3 geschlossen: Persistenz-, Auth-/Sync-, Medien-, Import-/APKG- und KI-/Servermodule sind `.ts`; Valibot 1.4.2 validiert die jeweiligen Vertrauensgrenzen, Supabase verwendet den generierten `Database`-Vertrag, und der native APKG-Preview-Worker bleibt als eigener 38,98-kB-Chunk lazy. Abnahme: 306 Modul-, acht RLS- und 21 Browser-Tests, Typecheck, DB-Typdrift und Build mit maximal 431,65 kB je budgetiertem JavaScript-Chunk sind grün.

## 0. P0 — TypeScript-Modernisierung vor weiterem Featureausbau

Die vier Pakete wurden in der Reihenfolge `M1 → M2 → M3 → M4` abgeschlossen. Ergebnis ist eine kleinere semantische Änderungsoberfläche: explizite Typverträge, tiefe Module mit kleinen Interfaces, Laufzeitvalidierung an Vertrauensgrenzen und unverändertes sichtbares Produktverhalten. SQL, Python-Hilfsskripte und ein späterer gemessener Rust/WASM- oder Worker-Pfad bleiben außerhalb einer pauschalen TypeScript-Pflicht; der verbindliche Sprachvertrag steht in `docs/specs.md` Abschnitt 14.1.

### 0.1 M1 — Prüfbares Typfundament und Migrationsmechanik

- [x] **TypeScript als verpflichtendes Qualitätsgate eingeführt.** TypeScript 5.9, `tsx`, Node-/React-Typen, ein striktes `noEmit`-`tsconfig`, `npm run typecheck`, Type-Policy und der gemischte JS-/TS-Testlauf sind lokal und im CI-Job `quality` verdrahtet. `src/coreTypes.ts` bildet die normalisierten Kernformen ab; `src/database.types.ts` wird aus dem lokal migrierten Supabase-Schema generiert und vor RLS/E2E read-only auf Drift geprüft. Die absichtlich erzeugte Typabweichung wurde abgewiesen; anschließend waren 298 Modul-, acht RLS- und 21 Browser-Tests sowie der Production-Build grün.

### 0.2 M2 — Domänen-, Scheduler- und Creation-Module migrieren und vertiefen

- [x] **Die in-process Produktlogik nach TypeScript überführen und ihre Interfaces verkleinern.** `coreModel`, `deckSettings`, `scheduler`, `reviewService`, `coreVariantService`, `variantGeneration`, `variantSelection`, `libraryModel`, `coreWorkspace`, `creationWorkflow` und die gemeinsame Learning-Item-Creation-Pipeline sind zu strict geprüftem TypeScript migriert. `src/coreModel.ts` bleibt die einzige öffentliche Seam und bündelt private Verantwortungsflächen unter `src/coreModel/`; React und Review-Flow verwenden die Variantenlogik über `coreVariantService.ts`, ohne neue Adapternaht. Discriminated Unions und exhaustive Typvertragstests decken Kartenarten, Original-/abgeleitete Varianten, Review- und Sync-Zustände ab. Abnahme am 2026-07-13: `npm run typecheck`, 298 Modultests, Production-Build samt Chunkbudget, 8 lokale RLS-/Schema-Smokes und 21 Playwright-Browserflows sind grün; Originalvariante, Anker, Varianten-State, Reimport-/Edit-Erhalt und sichtbare Features blieben unverändert.

### 0.3 M3 — Persistenz-, Import- und Servergrenzen typisieren

- [x] **Alle I/O- und Vertrauensgrenzen auf explizite TypeScript- und Laufzeitverträge umstellen.** Persistenz, Auth/Account, Sync/Outbox, lokale und Cloud-Medien, Datei-/JSON-/CSV-/APKG-Import, ZIP/SQLite, KI-Client und `/api/ai/chat` sind zu `.ts` migriert. Owner-lokale Valibot-Schemas prüfen LocalStorage, Outbox-Accountbindung, Supabase-Rows/JSONB, Profile, IndexedDB-Records, Import-/Exportpayloads sowie KI- und Worker-Nachrichten. `createClient<Database>` und die generierten Row-/Insert-/Update-/Json-Typen bleiben die Cloud-Typquelle; `database.types.ts` wurde nicht manuell geändert. Der native Vite-Worker überträgt APKG- und Medienbuffer, meldet Fortschritt und wird bei Resultat, Fehler, ungültiger Nachricht oder Abbruch beendet. ZIP-/SQLite-Leser prüfen Bounds, Größen, Seiten, Varints, Overflow und Zyklen. `npm run benchmark:apkg` erzeugt im ignorierten `test-results/` deterministisch 4.900 Karten und 200 Medien (2.522.246 Eingabebytes); der lokale Referenzlauf dauerte 236,89 ms bei 33.662.760 Byte Heap-Delta best-effort. Zeitwerte sind kein CI-Limit. Abnahme am 2026-07-13: Typecheck, 306 Modultests, Build/Chunkbudget, DB-Typdrift, 8 RLS-Smokes und 21 Playwright-Flows grün.

### 0.4 M4 — React, Tests und Tooling abschließen; Übergang schließen

- [x] **Die Migration codebaseweit abgeschlossen und den Rückfall verhindert.** App-Shell, Screens und UI-Module sind `.tsx`; produktnahe, serverseitige, RLS- und Playwright-Tests sowie Root-Konfigurationen und Toolskripte sind `.ts`. `allowJs: false`, ein expliziter `.ts`/`.tsx`-Include-Graph und `verifyTypePolicy` verbieten `.js`, `.jsx`, `.mjs`, `.cjs`, `@ts-ignore` und `@ts-nocheck` in den Codewurzeln. App-Routing verwendet `AppRoute = ViewRoute | StudyRoute`, Release-Informationen bleiben allowlist-basiert typisiert, Lazy-Loading und sichtbares Verhalten unverändert. Abnahme am 2026-07-14: Typecheck und Type-Policy, 307 Modul-/API-Tests, Production-Build mit maximal 431,65 kB je budgetiertem JavaScript-Chunk, 9 lokale RLS-/Sync-Tests und 21 Playwright-Flows sind grün.

## 1. P0 — Prüfbare Release- und Infrastruktur-Basis

### 1.1 Supabase-CLI und Migration

- [x] In `supabase/config.toml` die drei `auth.email.template.*.content_path`-Werte auf `./supabase/templates/...` korrigieren; das Security-Notification-Template bleibt CLI-konform bei `./templates/...`. `npx supabase migration list --linked` läuft erfolgreich.
- [x] Remote-Migrationsstand vor dem Release dokumentiert und `20260709091315_sync_media_auth_operations.sql` nach erfolgreichem Dry-Run und Datenbankfreigabe remote angewendet; alle vier Migrationen stimmen lokal und remote überein.
- [x] Nach der Anwendung `supabase/verify_schema_v1.sql` ausgeführt und Bucket `core-media`, `authenticated`-/`service_role`-Grants, fehlende `anon`-Grants, Constraints sowie alle erwarteten Core- und Storage-Policies bestätigt.
- [x] Unterschied zwischen Schemaanker `supabase/core_schema_v1.sql`, angewendeten Migrationen und Remote-Schema als Release-Stand in `docs/specs.md` festgehalten; es wurde keine zusätzliche breite Migration erzeugt.

### 1.2 Deterministische Tests und Deployment

- [x] Playwright-Auth-Fixture eingeführt: `auth-setup` setzt ausschließlich einen vorab angelegten Account im separaten Supabase-Testprojekt auf die Hauptstadt-Fixture zurück, schreibt eine bereinigte und ignorierte `storageState`-Datei und lässt `resetToFreshLocalState()` nur `core.*` statt der Supabase-Session löschen.
- [x] E2E-Suite in klare Gruppen geteilt: Login-Gate/Auth-Fehlerfälle, cloudfreie Auth-Resilience und authentifizierte Produkt-Smokes für Navigation, Review, Varianten, KI-Draft, Assistent, Portabilität, Deck-Hierarchie, PDF-Quellenauswahl, Konfliktentscheidung, Offline-Reconnect und APKG-Cloud-Medien. Die vier Playwright-Projekte und 22 Tests sind per `--list` bestätigt; `npm run test:e2e:local` läuft mit lokalem Docker/Supabase, reduziertem Service-Set, Migrationen, lokalem Testaccount und anschließendem Stop reproduzierbar mit 22/22 grünen Tests. Der GitHub-Actions-Job `browser-e2e` führt denselben secretfreien Loopback-Pfad aus.
- [x] E2E-Tests für Offline-Start, fehlende Supabase-Konfiguration und abgelaufene Session ergänzt. Die drei cloudfreien Smokes verwenden einen getrennten unkonfigurierten Vite-Port bzw. Browser-Routen für Netzwerkausfall und `session_expired`; alle drei sind grün und prüfen verständliche deutsche Fehlerzustände ohne Cloud-Mutation.
- [x] GitHub-Actions-Release-Gate mit den stabilen Checks `quality` und `browser-e2e` angelegt. `quality` führt `npm test` und `npm run build` aus; `browser-e2e` startet den lokalen Supabase-Stack und alle Playwright-Smokes ohne Hosted-Zugangsdaten oder KI-Secrets. Fehlerberichte und Screenshots sowie Traces der sessionlosen Projekte werden sieben Tage als Artefakt aufbewahrt; Auth-Session und `.env`-Dateien sind ausgeschlossen.
- [x] Preview-Smoke und Production-Rollback in `docs/specs.md` Abschnitt 14.2.2 dokumentiert: gruenes CI und fester Commit als Eingangsgate, eigener RLS-geschuetzter Smoke-Account, Login, Cloud-Laden, Review mit sichtbarem Save-Status, mutationsfreie APKG-Importvorschau, `/api/ai/chat` mit vorhandenem Key sowie verpflichtender fehlender-Key-Pruefung, Abmeldung, staged Production per `--skip-domain`, Promotion, konkrete Rollback-Trigger und der Hinweis, dass ein Vercel-Rollback keine Supabase-Daten oder Migrationen zuruecksetzt. Die erste echte Production-Abnahme vom 2026-07-10 ist dort mit Commit, CI-Lauf, Deployment-IDs, Zeiten und Ergebnissen secretsfrei festgehalten.
- [x] URL-/Redirect-Pfad live angewendet und abgenommen: `https://core-hosted.vercel.app` ist kanonische Production- und Site-URL; Hosted Supabase enthält das exakte Production-, Preview- und lokale Redirect-Muster aus dem aktiven Ziel. Der Readback nach Reload bestätigt exakt drei Redirects und keine alte `localhost:3000`-Site-URL.
- [x] App-Version, Build-Commit und Umgebung aus einem allowlist-basierten Vite-Buildvertrag sichtbar machen: `ReleaseInfo` erscheint am Login-Gate, in den Einstellungen und im React-Fehlerfallback. Die Error Boundary zeigt keine rohe Exception oder Nutzerdaten, bietet Neuladen und Startseiten-Rückkehr und ist über einen ausschließlich im E2E-Modus vorhandenen Renderfehler-Smoke geprüft; der Production-Build enthält den Testparameter nicht.
- [x] `npm run build` ohne Chunk-Warnung: authentifizierte Screens laden per `React.lazy`, APKG/SQLite/Zstd bleibt hinter den asynchronen Workspace-Methoden dynamisch, React und Supabase liegen in eigenen Vendor-Chunks und der tiefe PDF.js-Viewer lädt Runtime und Worker separat. Ein manifestbasierter Postbuild-Check erzwingt maximal 500.000 Byte je JavaScript-Chunk; größter geprüfter Chunk ist PDF.js mit 431,65 kB.

## 2. P1 — Cloud-Persistenz fachlich korrekt machen

### 2.1 Repository-Mapping

- [x] `src/cloudRepository.ts` um die in der lokalen Migration vorhandenen Felder ergänzt: `revision`, `deleted_at`, `updated_by_device_id` für Decks, Cards, Varianten, Dokumente und Jobs sowie `created_by_device_id` für Review-Events.
- [x] Beim Laden Soft-Deletes als unsichtbare `cloudTombstones` und Revisionen korrekt in das lokale Modell überführen; Core-Normalisierung und Server-Acknowledgements erhalten die Metadaten.
- [x] `replaceAccountCloudState()` bleibt ausschließlich für Legacy-Import bzw. Test-Reset destruktiv. Regulärer Autosave schreibt nur Deltas, prüft Updates atomar über Account, ID und Basisrevision und reaktiviert keine Remote-Tombstones.
- [x] Mapping- und Repository-Tests für Revisionen, Soft-Deletes, Geräte-IDs, Medienreferenzen, leere/teilweise Cloud-Daten, unveränderte Snapshots, stale Writes, append-only Events und Voll-Replace ergänzt.

### 2.2 Ownership, RLS und Account-Lifecycle

- [x] Einen echten Nutzer-A/Nutzer-B/`anon`-Smoke gegen lokales Supabase automatisiert. Geprüft werden `profiles`, `core_portable_exports`, `decks`, `cards`, `card_variants`, `review_events`, `source_documents`, `ai_jobs`, `media_assets`, `sync_devices` und `sync_conflicts`; der Runner verweigert Hosted-Ziele.
- [x] Für jede authentifiziert schreibbare Tabelle verifiziert, dass UPDATE sowohl `using` als auch `with check` hat. Runtime-Smokes bestätigen eigene Updates, unsichtbare und unveränderbare fremde Rows sowie abgewiesene Ownership-Fälschungen; Composite-FKs verweigern fremde Deck-/Card-IDs mit `23503`.
- [ ] Hosted Auth konfigurieren und dokumentieren: Der bestehende Site-/Redirect-Vertrag und das secretsfreie Abnahme-Runbook stehen in `docs/specs.md` Abschnitt 14.2.3. Offen bleiben die tatsächliche Resend-/Domain-/Google-Konfiguration, der Hosted-Readback und Leaked-Password-Protection; ohne kontrollierte Auth-Subdomain, dokumentierte Resend-DPA/SCC-Freigabe und Supabase Pro darf dieser Punkt nicht geschlossen werden.
- [ ] Browser-Tests für Magic Link, Google Redirect, Recovery, Passwortänderung, erneuten Login, Rate-Limit-Fehler und abgelaufene Links sind als isolierter lokaler Playwright-Bereich samt Mailpit-Hilfe implementiert. Offen bleibt nur das vollständige grüne `npm run test:e2e:local`-Gate; die aktuelle Arbeitsumgebung hatte kein laufendes Docker Desktop.
- [x] Account-Löschung, operationsgebundene Reauth, Art.-15-Auskunft, Art.-20-Portabilitätsexport und idempotente Löschreihenfolge in `docs/specs.md` Abschnitt 14.2.3 als verbindlichen Datenfluss spezifiziert. Produktive Routen, UI, Tabellen und Storage-Jobs bleiben ein eigenes sicherheitskritisches Folgepaket.

## 3. P1 — Sync, Offline und Konflikte

### 3.1 Erst die Mutation-Semantik, dann Offline-UI

- [x] Eine dauerhafte Outbox hinter `src/syncEngine.ts` eingeführt. Mutation-ID, Geräte-ID, `baseRevision`, Entitätstabelle, Entitäts-ID, Payload, Erstellzeit, Flushzeit und Retry-Zähler werden accountgebunden gespeichert; die Queue überlebt Reload und Tab-Neustart.
- [x] `SYNC_MUTATION_TYPES.reviewEventAppend` produktiv verdrahtet. Der Lernmodus reicht das erzeugte Event direkt weiter, der Supabase-Adapter verarbeitet es idempotent über `(user_id, id)`, und Autosave sowie manueller Sync verwenden dieselbe Outbox.
- [x] `sync_devices` beim ersten Login/Start registriert und `last_seen_at`, User-Agent und Gerätebezeichnung aktualisiert. Flushes übergeben getrennte Snapshot-/Review-Mutation-IDs und die Geräte-ID an das Repository; nur bestätigte IDs verlassen die Outbox.
- [x] In `cloudRepository` konkrete Mutationsfunktionen ergänzen: `applyDeckMutation`, `applyCardMutation`, `appendReviewEvent`, `softDeleteEntity` und `markConflict`. Die Funktionen prüfen Server-Revisionen bedingt, bestätigen idempotente Retries per Readback und halten nicht bestätigte Mutation-IDs in der Outbox.
- [x] Konfliktregeln dokumentiert und getestet: Review-Events werden append-only und inhaltsidentisch bestätigt, gleiche Cloud-Medien innerhalb eines Deck-/Card-Kontexts per SHA-1 dedupliziert, Content- und Nutzer-Metadatenänderungen bei abweichender `baseRevision` in `sync_conflicts` abgelegt und reine Servermetadaten ohne automatischen Nutzerfeld-Merge anerkannt.
- [x] `sync_conflicts` beim Erkennen tatsächlich beschreiben. Revisionskonflikte erzeugen deterministische, accountgebundene Konfliktzeilen; Retries duplizieren oder öffnen bereits gelöste Konflikte nicht erneut.
- [x] Konfliktauflösung in `SettingsScreen` über `SyncConflictPanel` klickbar: lokale Version behalten, Remote-Version behalten, pro geändertem Fachfeld manuell zusammenführen oder für später zurückstellen. React konsumiert sichere Projektionen; Merge-, CAS-, Tombstone- und State-Regeln bleiben in `syncEngine`/Repository-Modulen.
- [x] Online-/Offline-Status, Retry mit exponentiellem Backoff, 30-Sekunden-Cap und Jitter, Flush bei Wiederverbindung sowie sichtbare Zustände für `pending`, `saving`, `saved`, `offline` und `conflict` hinter `syncEngine` ergänzt. Genau ein Timer läuft, Teilbestätigungen bleiben korrekt pending und Cleanup entfernt Listener beim Accountwechsel.
- [x] Zwei-Geräte-Test als separates lokales Supabase-Gate: Zwei authentifizierte Clients desselben Accounts verwenden getrennte Memory-Storages und Geräte-IDs. Ein alter Snapshot erzeugt bei neuerem Remote-Content einen Konflikt statt Überschreiben, ein Offline-Review wird nach Wiederverbindung auch bei wiederholtem Flush genau einmal persistiert, und ein Remote-Soft-Delete wird durch den älteren Snapshot nicht reaktiviert.

## 4. P1 — Medien, Dokumente und APKG

### 4.1 Cloud-Medien an den bestehenden Import anschließen

- [x] Der APKG-Importpfad cached Vorschau-Medien lokal, bestätigt beim Commit zuerst die Stapel in der Cloud und startet danach die persistente Medien-Queue. Lokaler Cache, Cloud-Fortschritt, Wiederverwendung, Pending, Pause/Fortsetzen, Abbruch und Integritätsfehler haben getrennte Statusmeldungen.
- [x] `media_assets` ist ein validierter, accountgebundener Cloud-Ladepfad. `Deck.mediaAssets` enthält ausschließlich persistierte Metadaten; `src/ui/cardMedia.tsx` konsumiert die aufgelösten URLs und interpretiert weder Storage-Pfade noch APKG-Manifeste.
- [x] Accountweite Reimport- und Referenzregeln sind implementiert: physische Objekte liegen unter `{userId}/objects/{sha1}`, mehrere Deck-/Card-Referenzen dürfen denselben Pfad verwenden, lokale Content-Edits behalten benötigte alte Medien, und Signed-URL-Fehler fallen sichtbar auf lokale Blobs beziehungsweise einen Missing-Status zurück.

### 4.2 Große Dateien und Hintergrundjobs

- [x] Große Medien über 6 MB verwenden lazy `tus-js-client@4.3.1` mit 6-MB-Chunks, aktuellem Bearer-Token je Request, stabiler Resume-Fingerprint, Retryfolge, Pause/Fortsetzen, Terminierung bei Abbruch, einmaligem Neustart bei abgelaufener Resume-URL und stabiler Fehlerklassifikation.
- [x] Serverseitigen APKG-Tracer-Bullet für Dateien oberhalb 250 MiB bis 1 GiB implementiert: signierter TUS-Upload in `core-imports`, service-role-only Job-Ledger, CAS-Zustandsmaschine, Trigger.dev-Analyse/Medienfinalisierung/Cleanup, medienfreies gzip-Artefakt, sichere Vorschau, Retry, Abbruch und Wiederaufnahme einer fertigen Vorschau. Der lokale Typ-/Schema-/RLS-Vertrag ist grün.
- [ ] Hosted-Ressourcenabnahme für den großen APKG-Pfad: Supabase-Pro-Limit, Trigger-Projekt in Frankfurt, DPA/SCC/Subprozessoren, echte `large-1x`-Messung für knapp über 250 MiB und 1 GiB sowie OOM-Fallback auf `large-2x` autorisiert prüfen. Bis dahin ist der Pfad lokal implementiert, aber nicht produktiv freigegeben.
- [ ] Storage-Orphan-GC bauen: Rows mit `deleted_at`, fehlende DB-Referenzen, fehlende Storage-Objekte und Storage-Objekte ohne DB-Row getrennt melden; Löschung nur über serverseitig geschützte Admin-/Cron-Aktionen.
- [x] Missing-/Delete-/accountweite Reimport-/Queue-/Signed-URL- und echte lokale TUS-/RLS-Tests ergänzt. `fake-indexeddb@6.2.5` prüft Persistenz, Accountwechsel, Legacy-Übernahme und Session-Fallback. Der Remote-Rollout der neuen Migration bleibt bis zum separaten Release-Gate ausstehend.

### 4.3 Importqualität

- [x] Deterministische Legacy- und eingecheckte `anki==26.5`-APKG-Fixtures decken Basic Reverse, Optional Reverse mit gesetztem und leerem Steuerfeld, Cloze `c1`/`c2`, ungewöhnliche Notetypes, vorhandene/fehlende Medien, moderne MediaEntries und echte `collection.anki21b`-/Zstd-Pakete ab. Ein Erwartungsmanifest prüft Paket-SHA-256, Container, Modelle, Identitäten und Medien-SHA-1.
- [x] Die versionierte `ankiImportIdentityV1` hält GUID, Note-/Card-/Notetype-ID, Template-Ordinal/-Name, Deck-ID/-Pfad und Importgruppe fest. Reimport matcht GUID-basiert vor IDs, Legacy-Kennungen und Fingerprint; Modul- und JSONB-Roundtriptests belegen Dedupe sowie den Erhalt lokaler Inhalte, Varianten- und Reviewzustände.
- [x] Der versionierte APKG-Importbericht zeigt in `CreationScreen` erkannte Stapel, Kartentypen und Templates, gemappte/nicht gemappte Felder, Paket-/Medienformat, vorhandene/fehlende Medien, Cache-/Cloudstatus, Warnungen und Reimport-Dedupe. Desktop- und Mobile-E2E prüfen die vier Berichtsbereiche und eine mutationsfreie Vorschau.
- [ ] DOCX-Textextraktion als eigenes Modul mit Fehlerfällen planen. OCR, Bildregionen und erweiterte PDF-Werkzeuge erst nach einem stabilen textbasierten Dokumentpfad angehen.

## 5. P1 — KI-Proxy, Jobs und Kostenkontrolle

- [x] `/api/ai/chat` ist an die eingeloggte Nutzeridentität gebunden. `src/deckAssistant.ts` holt das aktuelle Supabase-Access-Token unmittelbar vor dem Request und sendet es nur als Bearer-Header; `api/ai/chatProtection.ts` prüft es per `auth.getUser`, liest die aktuelle Einwilligung RLS-geschützt mit demselben Client und nutzt keine Service Role. Abnahme 2026-07-14: Missing-/Invalid-Bearer, fehlende Einwilligung und secretsfreie Fehlerpfade sind getestet.
- [x] Nutzer-/IP-Rate-Limits, Eingabegrenzen, Modell-Allowlist, Outputlimit, Timeout, Prompt-Injection-Basisschutz und Idempotenz sind für den Chat umgesetzt. Upstash nutzt 20 Nutzer- und 200 IP-Aufrufe je zehn Minuten, HMAC-pseudonymisierte Schlüssel, 90 Sekunden Pending- und zehn Minuten Completed-TTL; Schutzinfrastruktur fällt geschlossen aus. Die kostenlose `fra1`-Ressource ist CLI-seitig vorbereitet, kann aber erst nach der erforderlichen Upstash-Marketplace-Terms-Annahme provisioniert werden; ohne Ressource bleibt die Route absichtlich `503 protection_unavailable`.
- [x] `ai_jobs` ist als serverautoritatives Version-1-Ledger umgesetzt: Capability, Prompt-/Schema-Version, CAS-Status, maximal drei Versuche, Idempotenz/Fingerprint, kurzlebige Resultatreferenz, sanitisiertes Fehlerpaar, nullable Tokenwerte und versionierte Kostenprojektion. Legacy-Jobs bleiben lokal als Vertrag 0 sichtbar; Browserrollen dürfen eigene Serverjobs nur lesen. Abnahme 2026-07-14: Gemma-Chat-Tracer-Bullet, Leakfreiheit, Cloud-Read-only und RLS-Smokes sind automatisiert.
- [x] Provider-, Datenschutz- und Inhaltsentscheidung für den bestehenden Chat dokumentiert: Google Gemma Paid Services, `store: false` ohne ZDR-Versprechen, DPA-/Billing-Produktionsgate, einmalige versionierte 18+-/Transfer-Einwilligung, maximal Frage plus fünf minimierte Kartenbelege und zehn Minuten EU-Antwortcache.
- [ ] Vor Kartenerstellung, Varianten- oder Graph-Proxys die Datenschutz-, Kosten- und Jobentscheidung capability-spezifisch ergänzen und erst danach strukturierte, validierte Draft-Routen bauen.
- [ ] Längere KI-Aufgaben über eine Queue/Worker-Infrastruktur ausführen; Browser-Requests dürfen nicht auf lange Providerläufe warten.
- [ ] Eval-Datensatz und Qualitätsgates für Kartenqualität, Quellenanker, Halluzinationen, Prompt-Injection aus Dokumenten, Varianten-Nähe und KI-Fehlerfeedback erstellen.
- [ ] Nutzer-/Deck-Budgets und Admin-Sicht auf fehlgeschlagene Jobs ergänzen. Tokenwerte und die versionierte Kostenprojektion werden für den Gemma-Chat bereits im serverautoritativen Ledger erfasst; fehlende einzelne Usage-Zähler bleiben `null`, Gemma 4 ist auf Preisstand 2026-07-09 mit `0 USD` projektiert.
- [x] Route- und Schutztests decken Auth-Fehler, fehlenden Bearer, fehlende/veraltete Einwilligung, beide Rate-Limits samt `Retry-After`, exakte Payloadgrenzen, parallele/abgeschlossene Idempotenz, Body-Konflikte, Freigabe nach Providerfehler und keine Token-/IP-/Nutzer-/Prompt-Leaks im Redis-Zustand ab.

## 6. P1 — Betrieb, Monitoring, Backups und Admin

- [ ] `/api/admin/*` nur serverseitig mit Service-Role-Secret und geprüfter Admin-Rolle bauen. Admin-Rechte dürfen aus `app_metadata` oder einer geschützten Rollentabelle kommen, nicht aus `user_metadata`.
- [ ] Admin-Funktionen für Nutzerexport/-löschung, offene Sync-Konflikte, Storage-Orphans, fehlgeschlagene Jobs und RLS-Smoke-Checks hinter einer kleinen, auditierbaren Modulgrenze bündeln.
- [ ] `admin_audit_events` für Import, KI-Generierung, Variantenstatus, Share, Rechteänderung, Restore/Undo und administrative Eingriffe tatsächlich beschreiben; Nutzerinhalte und Secrets gehören nicht ungekürzt in Audit-Metadaten.
- [ ] Monitoring-Runbook schreiben: Vercel Runtime Logs/Observability, Supabase DB-/Auth-Logs, Auth-Rate-Limits, Storage-Fehler, KI-/Worker-Fehler, Build-Status und relevante Produktmetriken.
- [ ] DB-Backup/Restore und Storage-Mirror/Restore als getrennte Abläufe dokumentieren und in einem Testprojekt prüfen; ein DB-Backup stellt Storage-Objekte nicht wieder her.
- [ ] Betriebs-Checks automatisieren: Testdump, Restore, Storage-Mirror, RLS A/B/`anon`, Admin-Aktion mit Audit-Eintrag und fehlgeschlagener Job mit Retry.

## 7. P1 — Produktqualität und Lernwirksamkeit

- [x] Die authentifizierten Browser-Smokes nach dem E2E-Fixture-Fix für Review, Variantenreview, KI-Draft, Chat, Lernplan, Export/Import, Deck-Hierarchie, Browser-Back/Forward und PDF-Quellenauswahl grün bekommen; zwölf authentifizierte Produkt-Smokes laufen im vollständigen lokalen 19/19-Lauf stabil.
- [ ] Accessibility und Fehlerzustände an `AuthGateScreen`, `StudyMode`, `CreationScreen`, `DecksScreen` und `SettingsScreen` prüfen: Fokusführung, sichtbare Labels, Tastatur, Screenreader-Status, Kontrast, leere Zustände, große Dateien und Netzwerkfehler.
- [ ] Version-Restore/Undo in `DecksScreen` tatsächlich klickbar machen. `versionLog` und Restore-Basis existieren im Modell, aber der Nutzerfluss ist noch nicht vollständig sichtbar.
- [ ] Datenportabilität mit Roundtrips testen: `createPortableExport`, `validatePortableExport`, `mergePortableExportIntoState`, Legacy-Card-Normalisierung, Learning-Item-Invariante und ID-Kollisionen. Medien- und serverseitige Account-Rechte müssen ausdrücklich als nicht enthalten markiert bleiben.
- [ ] Das Desktop-Raster aus der Spec im Code messbar nachziehen: Ziel 1440 × 900, Mindestbreite 1280, feste Arbeitsflächen-/Review-Breiten und zentrale Typografie-/Farb-Tokens statt vieler verstreuter Tailwind-Werte.
- [ ] Keine sichtbaren Produktpfade bei Überarbeitungen entfernen; neue Produktionsfehler müssen als Statusmeldung und nicht nur als Console-Fehler erscheinen.

## 8. P2 — Scheduler, Varianten und Content-Repetition

- [ ] Die jetzt sichtbaren globalen und stapelspezifischen Lernprofile mit aufgezeichneten anonymisierten Lernverläufen oder einer versionierten synthetischen Session-Fixture validieren: Tageslimits, Queue-Reihenfolge, Stability, Difficulty, Desired Retention, Retrievability, Lern-/Wiederlernschritte, Maximalintervall und Kurzintervall-Bias.
- [ ] Invarianten für Learning Item, Originalvariante, Varianten-State, Family-State und Fallback-State über mehrere Sessions testen; insbesondere `Again` auf Variante, Rückkehr zur einfacheren Variante und kein Review-Duplikat der Originalkarte.
- [ ] Eligibility und konservative Variant-Level mit realistisch gemischten Decks prüfen: Vokabeln, Cloze-Familien, Reverse-Varianten, importierte Templates und Karten mit Medien.
- [ ] Feedbackpfad fachlich auswerten: deaktiviert, fachlich falsch, schlecht formuliert, Quellenanker unbrauchbar. Feedback darf private Reviewdaten nicht in serverseitig wiederverwendbare Variantenqualität vermischen.

## 9. P2 — Community und geteilte Inhalte

- [ ] Community-Datenmodell mit echten Tabellen für Community, Mitgliedschaft, Rolle, Einladung, Ordner, Deck-Freigabe und Kopiervorgang entwerfen. `community_refs` im Deck und `communityModel.ts` sind derzeit kein Berechtigungsmodell.
- [ ] RLS/Membership-Regeln festlegen: geteilte Inhalte ja, fremde Review-Events, Lernstände, privaten Quellenanker und persönliche Qualitätsurteile nein.
- [ ] Deck-Kopie serverseitig idempotent umsetzen und dabei Reviewdaten, private Dokumente und private Medienreferenzen sicher ausschließen oder neu verankern.
- [ ] Minimalen Moderations-, Missbrauchs- und Auditfluss definieren, bevor Community-Rechte in der UI als echt dargestellt werden.
- [ ] Graph- und Varianten-Wiederverwendung erst an reale Berechtigungen und den KI-Jobpfad anschließen; der lokale Graph bleibt bis dahin ein MVP.

## 10. P3 — Späterer Produktausbau

- [ ] Entscheiden, ob nach dem Desktop-Web-MVP zuerst responsive Web, PWA/Offline oder native App verfolgt wird.
- [ ] Push-/Reminder-Konzept an Lernplan, Fälligkeit und Datenschutzoptionen koppeln.
- [ ] Onboarding mit realen Zielgruppen testen: Medizin, Jura und Power-User; erst danach Kurs-/Hochschulfelder erweitern.
- [ ] Zahlungs-/Abo-Modell erst nach Hostingkosten, KI-Kostenmessung, Limits und Backup-/Supportprozess diskutieren.

## Bewusst noch nicht bauen

- [ ] Keine generische Backend-, Auth- oder LLM-Adapter-Schicht einführen, solange Supabase und der Gemma-Chat der jeweils einzige reale Pfad sind.
- [ ] Keine weitere breite produktive Datenbankmigration schreiben, bevor CLI-Konfiguration, Remote-Status, RLS-Verify und die lokale Migration `20260709091315...` abgeglichen sind.
- [ ] Keine vollständige Offline-First-Lösung vortäuschen, bevor Outbox, Revisionen, Konflikterzeugung, Konflikt-UI, Medienstrategie und Zwei-Geräte-Tests zusammen funktionieren.
- [ ] Keine Community-Rechte, Rankings oder fremde Lernstände in der UI als produktiv darstellen, solange Tabellen, Membership-RLS und Moderationsregeln fehlen.
- [x] Der bestehende Chat sendet externe Inhalte erst nach dokumentierter Provider-/Datenschutz-/Auth-/Kostenentscheidung und serverseitig bestätigter Einwilligung; Production bleibt zusätzlich hinter Upstash-/Google-DPA und Google-Billing gegatet.
- [ ] Neue externe Karten-, Varianten-, Graph- oder weitere Providerpfade bleiben blockiert, bis ihre capability-spezifischen Datenschutz-, Auth-, Kosten- und Jobentscheidungen dokumentiert sind.

## Bereits belastbar vorhanden

- [x] Vite/React-App mit Port 5190, Pflichtlogin, Supabase E-Mail/Passwort, Google-Start, Magic Link, Recovery-Abschluss, Profil-Upsert und accountgebundenem Browser-Cache.
- [x] Cloud-first Delta-Autosave über echte Tabellen ohne Delete-Missing-Semantik: unveränderte Rows bleiben unberührt, Updates sind revisionsbedingt, Review-Events append-only und bewusster Voll-Replace bleibt für Legacy-Import/Test-Reset.
- [x] Learning-Item-Creation-Pipeline für Basic, Reverse, Cloze, Importvarianten und KI-Drafts mit genau einer Originalvariante.
- [x] APKG-, Text-, CSV-, normalisierte JSON- und Tabellen-/Excel-Paste-Importe mit Dry-Run, Dedupe, Hierarchie und Reimport-Merge.
- [x] Accountgebundener APKG-Medienspeicher mit lokalem Vorschau-Cache, persistenter Pending-/Resume-Queue, Supabase-Referenzen, Signed-URL-Auflösung, HTML-Safety, Rich Text, PDF-/Textauslesung und Quellenankern.
- [x] Fullscreen-Review, vier Ratings, Tastatur, Review-Events, FSRS-like State, Fälligkeit, Varianten-Fallback und Originalanker.
- [x] Lokale Community, Graph, Chat-/Lernplan-UI, AI-Job-Ledger und JSON-Portabilität als MVP-Modelle.
- [x] Serverroute `/api/ai/chat` mit serverseitigem `GOOGLE_API_KEY`, Supabase-Bearer-/Einwilligungsprüfung, Upstash-Rate-Limits und Idempotenz, Origin-/Payload-/Promptgrenzen, aktuellem `steps`- und Legacy-`outputs`-Gemma-Response-Parsing, secretsfreien Fehler-Metadaten und lokalem Quellen-Fallback.
- [x] Breite Modul-Testabdeckung für Core-Modell, Import, Review, Varianten, Auth, Cloud-Mapping, Medien-Grundlage, Portabilität und Sync-Grundfunktionen.

## Referenzen

- `docs/specs.md`: kanonische Produkt- und Engineering-Spezifikation, insbesondere Abschnitte 10, 12, 14–18, 21, 26 und 27.
- `docs/anki-format-analysis.md`: Anki-/APKG-Differenzen und Importidentitäten.
- `supabase/core_schema_v1.sql`: Schemaanker für Tabellen, RLS, Grants und Storage-Policies.
- `supabase/migrations/20260709091315_sync_media_auth_operations.sql`: remote angewendete Migration für Revisionen, Medien, Geräte, Konflikte und Storage-Policies.
- `supabase/verify_schema_v1.sql`: fehlschlagendes Verify-Gate für Zieltabellen/-spalten, RLS, Policies, Grants, Constraints und den privaten Medien-Bucket.
- `tests/rls/ownership-smoke.test.ts`: echter lokaler Data-API-Smoke für Nutzer A, Nutzer B, `anon`, Ownership und accountgebundene Foreign Keys.
- `src/cloudRepository.ts`, `src/syncEngine.ts`: aktueller Cloud-/Sync-Pfad und nächste technische Naht.
- `src/cloudMediaStore.ts`, `src/mediaStore.ts`, `src/creationWorkflow.ts`: aktueller lokaler und vorbereiteter Cloud-Medienpfad.
- `api/ai/chat.ts`, `src/deckAssistant.ts`, `src/aiOrchestrator.ts`: aktueller Chat-Proxy und lokale KI-Drafts.
- `.github/workflows/ci.yml`, `tests/e2e/`, `playwright.config.ts`: automatisiertes Release-Gate, bestehende Browser-Smokes und lokale Supabase-Test-Session.
