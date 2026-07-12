# CoRe TODO

Stand: 2026-07-12

Diese Liste wurde gegen den tatsächlichen Repository-Stand geprüft. Grundlage waren `docs/specs.md`, `AGENTS.md`, die Module unter `src/`, die Vercel-Route unter `api/`, die Supabase-SQL-Dateien, die Tests und die lokalen Build-/E2E-Läufe. Die Liste beschreibt deshalb konkrete Lücken und keine allgemeinen Produktideen.

## Auditierter Ist-Stand

- `npm test`: 273 Tests bestanden.
- `npm run build`: erfolgreich und ohne Chunk-Warnung. Der größte budgetierte JavaScript-Chunk ist PDF.js mit 431,65 kB; der lokale Entry-Chunk ist 248,30 kB. Ein manifestbasierter Postbuild-Check bricht den Build bei mehr als 500.000 Byte pro JavaScript-Chunk ab. Der getrennt geladene PDF-Worker und WASM-Dateien sind von diesem JavaScript-Budget ausgenommen.
- `npm run test:e2e -- --list`: ein Auth-Setup, drei sessionlose Auth-Gate-Smokes einschließlich Fehlerfallback, drei cloudfreie Auth-Resilience-Smokes und dreizehn authentifizierte Produkt-Smokes werden in vier getrennten Playwright-Projekten korrekt erkannt. Der vollständige lokale Lauf mit Docker/Supabase ist mit 20/20 Tests grün; zusätzlich zu PDF-Lazy-Loading, Textauswahl, Kartenfeld und Quellenanker ist die accountgebundene Konfliktentscheidung mit Zurückstellen, Reload, Wiederaufnahme und Remote-Version abgedeckt.
- `npx supabase migration list --linked`: mit Supabase CLI 2.109.0 erfolgreich. Alle vier Migrationen bis einschließlich `20260709091315` sind lokal und remote vorhanden.
- `supabase/verify_schema_v1.sql` besteht vollständig: Zielspalten einschließlich des vollständigen `sync_devices`-Spaltenvertrags, Tabellen, Composite Keys/FKs, RLS, Policies, `authenticated`-/`service_role`-Grants, fehlende `anon`-Grants und der private Bucket `core-media` sind bestätigt.
- `npm run test:rls:local`: SQL-Struktur-Gate und acht echte Data-API-Smokes mit Nutzer A, Nutzer B und `anon` sind grün. Eigene CRUD-Zugriffe, unsichtbare fremde Rows, wirkungslose Fremdmutationen, Ownership-Fälschung, accountgebundene Foreign Keys, gleiche lokale IDs, Geräte-Heartbeat sowie zwei konkurrierende Deck-Writes auf derselben Basisrevision mit persistiertem Konflikt sind reproduzierbar geprüft.
- Der Performance-Advisor meldet keine Warnungen. Der Security-Advisor meldet ausschließlich den bereits vor der Migration vorhandenen Hinweis `auth_leaked_password_protection`.
- Der debouncete Autosave läuft über `src/syncEngine.js` und `src/cloudRepository.js`: `applyDeckMutation`, `applyCardMutation` und `softDeleteEntity` prüfen Basisrevisionen atomar über `user_id`, `id` und `revision`; stale Writes erzeugen idempotente `sync_conflicts`. Deckbaum-Löschungen bleiben bis zur Cloud-Bestätigung als Tombstones erhalten. Die accountgebundene Outbox überlebt Reloads, behält fehlgeschlagene Mutationen mit Retry-Zähler und entfernt Review- beziehungsweise Snapshot-Mutationen nur nach getrenntem Persistenz-Readback.
- `src/creationWorkflow.js` verwendet weiterhin den lokalen `src/mediaStore.js`. `src/cloudMediaStore.js` dedupliziert separat getestet innerhalb eines Deck-/Card-Kontexts über Nutzer, Bucket und SHA-1, verwendet dateinamenunabhängige kanonische Pfade und bestätigt keine Row für noch nicht hochgeladene große Dateien; die Integration in Import, Cloud-State-Laden und Karten-Rendering fehlt weiterhin.
- Der einzige Server-KI-Pfad ist `POST /api/ai/chat`. Die Route prüft Origin, Request-Größe und Providerfehler, liest aktuelle `steps`- sowie ältere `outputs`-Responses und protokolliert bei Providerfehlern nur sichere Strukturmetadaten. Supabase-Session, Nutzer-/IP-Limits und Kostenbudgets fehlen weiterhin; der Browser sendet derzeit keinen Bearer-Token.
- Community, Graph, KI-Drafts, Varianten und Jobs sind weiterhin lokale Produktmodelle; nur Chat besitzt einen externen Gemma-Proxy.

## Reihenfolge

Die Abhängigkeiten sind absichtlich enger als in der früheren Liste:

`P0 Prüf- und Deploymentbasis` → `P1 Cloud-Datenkorrektheit` → `P1 Sync und Medien` → `P1 externe KI-Jobs` → `P2 Community-Rechte und Wachstum`.

Das P0-Betriebsgate, P1 Repository-Mapping, die lokale Ownership-/RLS-Abnahme, die persistente Outbox, die Geräte-Registrierung, konkrete revisionsgeprüfte Cloud-Mutationen, die fachlichen Konfliktregeln und die klickbare Konfliktauflösung sind geschlossen. Die Reihenfolge läuft deshalb mit Online-/Offline-Status und Wiederverbindungslogik weiter.

## Aktives nächstes Ziel

**P1 Online-/Offline-Status und Wiederverbindung.** Als nächster Slice werden Netzwerkstatus, Retry mit Backoff, Flush bei Wiederverbindung und die sichtbaren Zustände `pending`, `saving`, `saved`, `offline` und `conflict` hinter der bestehenden Sync-Modulgrenze vervollständigt.

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

## 1. P0 — Prüfbare Release- und Infrastruktur-Basis

### 1.1 Supabase-CLI und Migration

- [x] In `supabase/config.toml` die drei `auth.email.template.*.content_path`-Werte auf `./supabase/templates/...` korrigieren; das Security-Notification-Template bleibt CLI-konform bei `./templates/...`. `npx supabase migration list --linked` läuft erfolgreich.
- [x] Remote-Migrationsstand vor dem Release dokumentiert und `20260709091315_sync_media_auth_operations.sql` nach erfolgreichem Dry-Run und Datenbankfreigabe remote angewendet; alle vier Migrationen stimmen lokal und remote überein.
- [x] Nach der Anwendung `supabase/verify_schema_v1.sql` ausgeführt und Bucket `core-media`, `authenticated`-/`service_role`-Grants, fehlende `anon`-Grants, Constraints sowie alle erwarteten Core- und Storage-Policies bestätigt.
- [x] Unterschied zwischen Schemaanker `supabase/core_schema_v1.sql`, angewendeten Migrationen und Remote-Schema als Release-Stand in `docs/specs.md` festgehalten; es wurde keine zusätzliche breite Migration erzeugt.

### 1.2 Deterministische Tests und Deployment

- [x] Playwright-Auth-Fixture eingeführt: `auth-setup` setzt ausschließlich einen vorab angelegten Account im separaten Supabase-Testprojekt auf die Hauptstadt-Fixture zurück, schreibt eine bereinigte und ignorierte `storageState`-Datei und lässt `resetToFreshLocalState()` nur `core.*` statt der Supabase-Session löschen.
- [x] E2E-Suite in klare Gruppen geteilt: Login-Gate/Auth-Fehlerfälle, cloudfreie Auth-Resilience und authentifizierte Produkt-Smokes für Navigation, Review, Varianten, KI-Draft, Assistent, Portabilität, Deck-Hierarchie, PDF-Quellenauswahl und Konfliktentscheidung. Die vier Playwright-Projekte und 20 Tests sind per `--list` bestätigt; `npm run test:e2e:local` läuft mit lokalem Docker/Supabase, reduziertem Service-Set, Migrationen, lokalem Testaccount und anschließendem Stop reproduzierbar mit 20/20 grünen Tests. Der GitHub-Actions-Job `browser-e2e` führt denselben secretfreien Loopback-Pfad aus.
- [x] E2E-Tests für Offline-Start, fehlende Supabase-Konfiguration und abgelaufene Session ergänzt. Die drei cloudfreien Smokes verwenden einen getrennten unkonfigurierten Vite-Port bzw. Browser-Routen für Netzwerkausfall und `session_expired`; alle drei sind grün und prüfen verständliche deutsche Fehlerzustände ohne Cloud-Mutation.
- [x] GitHub-Actions-Release-Gate mit den stabilen Checks `quality` und `browser-e2e` angelegt. `quality` führt `npm test` und `npm run build` aus; `browser-e2e` startet den lokalen Supabase-Stack und alle Playwright-Smokes ohne Hosted-Zugangsdaten oder KI-Secrets. Fehlerberichte und Screenshots sowie Traces der sessionlosen Projekte werden sieben Tage als Artefakt aufbewahrt; Auth-Session und `.env`-Dateien sind ausgeschlossen.
- [x] Preview-Smoke und Production-Rollback in `docs/specs.md` Abschnitt 14.2.2 dokumentiert: gruenes CI und fester Commit als Eingangsgate, eigener RLS-geschuetzter Smoke-Account, Login, Cloud-Laden, Review mit sichtbarem Save-Status, mutationsfreie APKG-Importvorschau, `/api/ai/chat` mit vorhandenem Key sowie verpflichtender fehlender-Key-Pruefung, Abmeldung, staged Production per `--skip-domain`, Promotion, konkrete Rollback-Trigger und der Hinweis, dass ein Vercel-Rollback keine Supabase-Daten oder Migrationen zuruecksetzt. Die erste echte Production-Abnahme vom 2026-07-10 ist dort mit Commit, CI-Lauf, Deployment-IDs, Zeiten und Ergebnissen secretsfrei festgehalten.
- [x] URL-/Redirect-Pfad live angewendet und abgenommen: `https://core-hosted.vercel.app` ist kanonische Production- und Site-URL; Hosted Supabase enthält das exakte Production-, Preview- und lokale Redirect-Muster aus dem aktiven Ziel. Der Readback nach Reload bestätigt exakt drei Redirects und keine alte `localhost:3000`-Site-URL.
- [x] App-Version, Build-Commit und Umgebung aus einem allowlist-basierten Vite-Buildvertrag sichtbar machen: `ReleaseInfo` erscheint am Login-Gate, in den Einstellungen und im React-Fehlerfallback. Die Error Boundary zeigt keine rohe Exception oder Nutzerdaten, bietet Neuladen und Startseiten-Rückkehr und ist über einen ausschließlich im E2E-Modus vorhandenen Renderfehler-Smoke geprüft; der Production-Build enthält den Testparameter nicht.
- [x] `npm run build` ohne Chunk-Warnung: authentifizierte Screens laden per `React.lazy`, APKG/SQLite/Zstd bleibt hinter den asynchronen Workspace-Methoden dynamisch, React und Supabase liegen in eigenen Vendor-Chunks und der tiefe PDF.js-Viewer lädt Runtime und Worker separat. Ein manifestbasierter Postbuild-Check erzwingt maximal 500.000 Byte je JavaScript-Chunk; größter geprüfter Chunk ist PDF.js mit 431,65 kB.

## 2. P1 — Cloud-Persistenz fachlich korrekt machen

### 2.1 Repository-Mapping

- [x] `src/cloudRepository.js` um die in der lokalen Migration vorhandenen Felder ergänzt: `revision`, `deleted_at`, `updated_by_device_id` für Decks, Cards, Varianten, Dokumente und Jobs sowie `created_by_device_id` für Review-Events.
- [x] Beim Laden Soft-Deletes als unsichtbare `cloudTombstones` und Revisionen korrekt in das lokale Modell überführen; Core-Normalisierung und Server-Acknowledgements erhalten die Metadaten.
- [x] `replaceAccountCloudState()` bleibt ausschließlich für Legacy-Import bzw. Test-Reset destruktiv. Regulärer Autosave schreibt nur Deltas, prüft Updates atomar über Account, ID und Basisrevision und reaktiviert keine Remote-Tombstones.
- [x] Mapping- und Repository-Tests für Revisionen, Soft-Deletes, Geräte-IDs, Medienreferenzen, leere/teilweise Cloud-Daten, unveränderte Snapshots, stale Writes, append-only Events und Voll-Replace ergänzt.

### 2.2 Ownership, RLS und Account-Lifecycle

- [x] Einen echten Nutzer-A/Nutzer-B/`anon`-Smoke gegen lokales Supabase automatisiert. Geprüft werden `profiles`, `core_portable_exports`, `decks`, `cards`, `card_variants`, `review_events`, `source_documents`, `ai_jobs`, `media_assets`, `sync_devices` und `sync_conflicts`; der Runner verweigert Hosted-Ziele.
- [x] Für jede authentifiziert schreibbare Tabelle verifiziert, dass UPDATE sowohl `using` als auch `with check` hat. Runtime-Smokes bestätigen eigene Updates, unsichtbare und unveränderbare fremde Rows sowie abgewiesene Ownership-Fälschungen; Composite-FKs verweigern fremde Deck-/Card-IDs mit `23503`.
- [ ] Hosted Auth konfigurieren und dokumentieren: Site URL, Redirect-Allowlist, Google OAuth, SMTP-Absender, DKIM/SPF/DMARC, deutsche Templates, E-Mail-Bestätigung und Leaked-Password-Protection.
- [ ] Browser-Tests für Magic Link, Google Redirect, Recovery, Passwortänderung, erneuten Login, Rate-Limit-Fehler und abgelaufene Links mit der Test-Fixture ergänzen.
- [ ] Account-Löschung, Reauth, Datenschutzexport und Datenportabilitätsrechte als Datenfluss spezifizieren. Der vorhandene JSON-Export ist nur ein lokaler Inhalts-Export und ersetzt keine Account-Löschung oder serverseitige DSGVO-Antwort.

## 3. P1 — Sync, Offline und Konflikte

### 3.1 Erst die Mutation-Semantik, dann Offline-UI

- [x] Eine dauerhafte Outbox hinter `src/syncEngine.js` eingeführt. Mutation-ID, Geräte-ID, `baseRevision`, Entitätstabelle, Entitäts-ID, Payload, Erstellzeit, Flushzeit und Retry-Zähler werden accountgebunden gespeichert; die Queue überlebt Reload und Tab-Neustart.
- [x] `SYNC_MUTATION_TYPES.reviewEventAppend` produktiv verdrahtet. Der Lernmodus reicht das erzeugte Event direkt weiter, der Supabase-Adapter verarbeitet es idempotent über `(user_id, id)`, und Autosave sowie manueller Sync verwenden dieselbe Outbox.
- [x] `sync_devices` beim ersten Login/Start registriert und `last_seen_at`, User-Agent und Gerätebezeichnung aktualisiert. Flushes übergeben getrennte Snapshot-/Review-Mutation-IDs und die Geräte-ID an das Repository; nur bestätigte IDs verlassen die Outbox.
- [x] In `cloudRepository` konkrete Mutationsfunktionen ergänzen: `applyDeckMutation`, `applyCardMutation`, `appendReviewEvent`, `softDeleteEntity` und `markConflict`. Die Funktionen prüfen Server-Revisionen bedingt, bestätigen idempotente Retries per Readback und halten nicht bestätigte Mutation-IDs in der Outbox.
- [x] Konfliktregeln dokumentiert und getestet: Review-Events werden append-only und inhaltsidentisch bestätigt, gleiche Cloud-Medien innerhalb eines Deck-/Card-Kontexts per SHA-1 dedupliziert, Content- und Nutzer-Metadatenänderungen bei abweichender `baseRevision` in `sync_conflicts` abgelegt und reine Servermetadaten ohne automatischen Nutzerfeld-Merge anerkannt.
- [x] `sync_conflicts` beim Erkennen tatsächlich beschreiben. Revisionskonflikte erzeugen deterministische, accountgebundene Konfliktzeilen; Retries duplizieren oder öffnen bereits gelöste Konflikte nicht erneut.
- [x] Konfliktauflösung in `SettingsScreen` über `SyncConflictPanel` klickbar: lokale Version behalten, Remote-Version behalten, pro geändertem Fachfeld manuell zusammenführen oder für später zurückstellen. React konsumiert sichere Projektionen; Merge-, CAS-, Tombstone- und State-Regeln bleiben in `syncEngine`/Repository-Modulen.
- [ ] Online-/Offline-Status, Retry mit Backoff, Flush bei Wiederverbindung und sichtbare Zustände für `pending`, `saving`, `saved`, `offline` und `conflict` ergänzen.
- [ ] Zwei-Geräte-Tests schreiben: alter Snapshot darf neue Remote-Content-Änderungen nicht löschen; Offline-Reviews werden nach Wiederverbindung genau einmal ergänzt; Soft-Delete wird nicht durch einen älteren Snapshot reaktiviert.

## 4. P1 — Medien, Dokumente und APKG

### 4.1 Cloud-Medien an den bestehenden Import anschließen

- [ ] Den APKG-Importpfad in `src/creationWorkflow.js` so erweitern, dass nach der Vorschau wahlweise `src/cloudMediaStore.js` statt ausschließlich `src/mediaStore.js` verwendet wird. Lokaler Browser-Medienspeicher und Cloud-Medien müssen klar getrennte Statusmeldungen haben.
- [ ] `media_assets` in den Cloud-Persistenzpfad aufnehmen: Rows mit Deck-/Card-Referenzen speichern, beim Laden accountgebunden laden und für `src/ui/cardMedia.jsx` in aufgelöste signed URLs übersetzen. React darf keine Storage-Manifeste selbst interpretieren.
- [ ] Accountweite Reimport- und Referenzregeln festlegen: SHA-1 plus Nutzer/Bucket/Storage-Pfad über mehrere Decks und Karten, keine verwaisten oder mehrfach gespeicherten Objekte, lokale Content-Edits bleiben erhalten, fehlende signed URLs erscheinen als verständlicher Medienstatus.

### 4.2 Große Dateien und Hintergrundjobs

- [ ] `uploadLargeMediaAsset()` implementieren: resumable Upload, Fortschritt, Abbruch, Wiederaufnahme, eindeutige Fehlerklassen und Tests. `persistDeckMedia()` markiert Dateien über 6 MB derzeit nur als `resumable-required` und lädt sie nicht hoch.
- [ ] Einen serverseitigen APKG-Importjob für Dateien oberhalb der Browsergrenze von 250 MB spezifizieren: Original in Storage, Jobstatus, Worker-Extraktion, Importreport, Fehler-/Retry-Status und idempotenter Abschluss.
- [ ] Storage-Orphan-GC bauen: Rows mit `deleted_at`, fehlende DB-Referenzen, fehlende Storage-Objekte und Storage-Objekte ohne DB-Row getrennt melden; Löschung nur über serverseitig geschützte Admin-/Cron-Aktionen.
- [ ] Fehlendes-Medium-, Delete-, accountweite Reimport- und echte resumable-Upload-Tests in `src/cloudMediaStore.test.js` ergänzen; deckgebundene signed URLs, SHA-1-Reimport und `resumable-required` sind bereits abgedeckt.

### 4.3 Importqualität

- [ ] APKG-Fixtures für Basic reversed, optional reversed, Cloze, Medienreferenzen, moderne MediaEntries, ungewöhnliche Note Types und echte `collection.anki21b`/Zstd-Pakete hinzufügen.
- [ ] Importidentität aus `docs/anki-format-analysis.md` in Tests festhalten: Anki-GUID, Note-ID, Card-ID, Notetype-ID, Template-Ordinal, Deck-Pfad und Medienchecksum.
- [ ] Importbericht in `CreationScreen` um erkannte Decks, nicht gemappte Felder, Warnungen, Medienstatus und Reimport-Dedupe ergänzen.
- [ ] DOCX-Textextraktion als eigenes Modul mit Fehlerfällen planen. OCR, Bildregionen und erweiterte PDF-Werkzeuge erst nach einem stabilen textbasierten Dokumentpfad angehen.

## 5. P1 — KI-Proxy, Jobs und Kostenkontrolle

- [ ] `/api/ai/chat` an die eingeloggte Nutzeridentität binden. `src/deckAssistant.js` muss den Supabase-Access-Token sicher als Bearer-Header mitsenden; die Serverroute muss Token prüfen, ohne Secrets oder vollständige Prompts zu loggen.
- [ ] Pro Nutzer und IP Rate-Limits, maximale Evidenz-/Promptgröße, Modell-Allowlist, Outputlimit und Missbrauchsschutz ergänzen. Origin-Prüfung und Request-Byte-Limit allein sind kein ausreichender Abuse-Schutz.
- [ ] `ai_jobs` vom lokalen Ledger zu einem echten Server-Jobvertrag ausbauen: Capability, Prompt-/Schema-Version, Status, Retry, Idempotency-Key, Resultat-Referenz, Fehlerklasse, Tokenverbrauch und Kosten.
- [ ] Vor weiteren Providerpfaden eine Entscheidung zu Provider, Datenschutz und übertragbaren Inhalten dokumentieren. Danach Server-Proxys für Kartenerstellung, Varianten und Graph mit strukturierten, validierten Drafts bauen.
- [ ] Längere KI-Aufgaben über eine Queue/Worker-Infrastruktur ausführen; Browser-Requests dürfen nicht auf lange Providerläufe warten.
- [ ] Eval-Datensatz und Qualitätsgates für Kartenqualität, Quellenanker, Halluzinationen, Prompt-Injection aus Dokumenten, Varianten-Nähe und KI-Fehlerfeedback erstellen.
- [ ] Token-/Kostenlogging, Nutzer-/Deck-Budgets und Admin-Sicht auf fehlgeschlagene Jobs ergänzen. Der vorhandene Chat-Response enthält Usage nur aus der Providerantwort und persistiert keine Kosten.
- [ ] Route-Tests um Auth-Fehler, Rate-Limit, fehlenden Bearer-Token, maximale Evidenz, Idempotenz und keine Secret-/Prompt-Leaks erweitern.

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

- [ ] Community-Datenmodell mit echten Tabellen für Community, Mitgliedschaft, Rolle, Einladung, Ordner, Deck-Freigabe und Kopiervorgang entwerfen. `community_refs` im Deck und `communityModel.js` sind derzeit kein Berechtigungsmodell.
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
- [ ] Keine externen KI-Inhalte senden, bevor Provider-, Datenschutz-, Auth- und Kostenentscheidungen dokumentiert sind.

## Bereits belastbar vorhanden

- [x] Vite/React-App mit Port 5190, Pflichtlogin, Supabase E-Mail/Passwort, Google-Start, Magic Link, Recovery-Abschluss, Profil-Upsert und accountgebundenem Browser-Cache.
- [x] Cloud-first Delta-Autosave über echte Tabellen ohne Delete-Missing-Semantik: unveränderte Rows bleiben unberührt, Updates sind revisionsbedingt, Review-Events append-only und bewusster Voll-Replace bleibt für Legacy-Import/Test-Reset.
- [x] Learning-Item-Creation-Pipeline für Basic, Reverse, Cloze, Importvarianten und KI-Drafts mit genau einer Originalvariante.
- [x] APKG-, Text-, CSV-, normalisierte JSON- und Tabellen-/Excel-Paste-Importe mit Dry-Run, Dedupe, Hierarchie und Reimport-Merge.
- [x] Lokaler APKG-Medienspeicher, HTML-Safety, Rich Text, PDF-/Textauslesung und Quellenanker; produktive Cloud-Medienanbindung ist separat offen.
- [x] Fullscreen-Review, vier Ratings, Tastatur, Review-Events, FSRS-like State, Fälligkeit, Varianten-Fallback und Originalanker.
- [x] Lokale Community, Graph, Chat-/Lernplan-UI, AI-Job-Ledger und JSON-Portabilität als MVP-Modelle.
- [x] Serverroute `/api/ai/chat` mit serverseitigem `GOOGLE_API_KEY`, Origin-/Payload-Prüfung, aktuellem `steps`- und Legacy-`outputs`-Gemma-Response-Parsing, secretsfreien Fehler-Metadaten und lokalem Quellen-Fallback.
- [x] Breite Modul-Testabdeckung für Core-Modell, Import, Review, Varianten, Auth, Cloud-Mapping, Medien-Grundlage, Portabilität und Sync-Grundfunktionen.

## Referenzen

- `docs/specs.md`: kanonische Produkt- und Engineering-Spezifikation, insbesondere Abschnitte 10, 12, 14–18, 21, 26 und 27.
- `docs/anki-format-analysis.md`: Anki-/APKG-Differenzen und Importidentitäten.
- `supabase/core_schema_v1.sql`: Schemaanker für Tabellen, RLS, Grants und Storage-Policies.
- `supabase/migrations/20260709091315_sync_media_auth_operations.sql`: remote angewendete Migration für Revisionen, Medien, Geräte, Konflikte und Storage-Policies.
- `supabase/verify_schema_v1.sql`: fehlschlagendes Verify-Gate für Zieltabellen/-spalten, RLS, Policies, Grants, Constraints und den privaten Medien-Bucket.
- `tests/rls/ownership-smoke.test.js`: echter lokaler Data-API-Smoke für Nutzer A, Nutzer B, `anon`, Ownership und accountgebundene Foreign Keys.
- `src/cloudRepository.js`, `src/syncEngine.js`: aktueller Cloud-/Sync-Pfad und nächste technische Naht.
- `src/cloudMediaStore.js`, `src/mediaStore.js`, `src/creationWorkflow.js`: aktueller lokaler und vorbereiteter Cloud-Medienpfad.
- `api/ai/chat.js`, `src/deckAssistant.js`, `src/aiOrchestrator.js`: aktueller Chat-Proxy und lokale KI-Drafts.
- `.github/workflows/ci.yml`, `tests/e2e/`, `playwright.config.js`: automatisiertes Release-Gate, bestehende Browser-Smokes und lokale Supabase-Test-Session.
