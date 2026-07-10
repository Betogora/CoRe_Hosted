# CoRe TODO

Stand: 2026-07-10

Diese Liste wurde gegen den tatsächlichen Repository-Stand geprüft. Grundlage waren `docs/specs.md`, `AGENTS.md`, die Module unter `src/`, die Vercel-Route unter `api/`, die Supabase-SQL-Dateien, die Tests und die lokalen Build-/E2E-Läufe. Die Liste beschreibt deshalb konkrete Lücken und keine allgemeinen Produktideen.

## Auditierter Ist-Stand

- `npm test`: 187 Tests bestanden.
- `npm run build`: erfolgreich; der Build meldet aber einen ca. 1,97 MB großen Hauptchunk sowie große PDF-/Worker-Chunks.
- `npm run test:e2e -- --list`: ein Auth-Setup, zwei sessionlose Auth-Gate-Smokes und elf authentifizierte Produkt-Smokes werden in drei getrennten Playwright-Projekten korrekt erkannt. Der vollständige Lauf benötigt die nicht committeden Zugangsdaten eines separaten Supabase-Testprojekts in `.env.e2e.local`.
- `npx supabase migration list --linked`: mit Supabase CLI 2.109.0 erfolgreich. Alle vier Migrationen bis einschließlich `20260709091315` sind lokal und remote vorhanden.
- `supabase/verify_schema_v1.sql` besteht vollständig: Zielspalten, Tabellen, Composite Keys/FKs, RLS, Policies, `authenticated`-/`service_role`-Grants, fehlende `anon`-Grants und der private Bucket `core-media` sind bestätigt.
- Der Performance-Advisor meldet keine Warnungen. Der Security-Advisor meldet ausschließlich den bereits vor der Migration vorhandenen Hinweis `auth_leaked_password_protection`.
- Der aktuelle Autosave ist ein debounceter Vollzustands-Upsert über `src/syncEngine.js` und `src/cloudRepository.js`. Die Queue lebt nur im Speicher; `reviewEventAppend` besitzt keinen produktiven Adapterpfad.
- `src/creationWorkflow.js` verwendet weiterhin den lokalen `src/mediaStore.js`. `src/cloudMediaStore.js` ist separat getestet, aber noch nicht in Import, Cloud-State-Laden oder Karten-Rendering integriert.
- Der einzige Server-KI-Pfad ist `POST /api/ai/chat`. Die Route prüft Origin, Request-Größe und Providerfehler, aber noch keine Supabase-Session, Nutzer-/IP-Limits oder Kostenbudgets. Der Browser sendet derzeit keinen Bearer-Token.
- Community, Graph, KI-Drafts, Varianten und Jobs sind weiterhin lokale Produktmodelle; nur Chat besitzt einen externen Gemma-Proxy.

## Reihenfolge

Die Abhängigkeiten sind absichtlich enger als in der früheren Liste:

`P0 Prüf- und Deploymentbasis` → `P1 Cloud-Datenkorrektheit` → `P1 Sync und Medien` → `P1 externe KI-Jobs` → `P2 Community-Rechte und Wachstum`.

Solange ein P0-Gate offen ist, sind neue Produktfeatures nur als lokale Modul- oder Fixture-Arbeit sinnvoll.

## 1. P0 — Prüfbare Release- und Infrastruktur-Basis

### 1.1 Supabase-CLI und Migration

- [x] In `supabase/config.toml` die drei `auth.email.template.*.content_path`-Werte auf `./supabase/templates/...` korrigieren; das Security-Notification-Template bleibt CLI-konform bei `./templates/...`. `npx supabase migration list --linked` läuft erfolgreich.
- [x] Remote-Migrationsstand vor dem Release dokumentiert und `20260709091315_sync_media_auth_operations.sql` nach erfolgreichem Dry-Run und Datenbankfreigabe remote angewendet; alle vier Migrationen stimmen lokal und remote überein.
- [x] Nach der Anwendung `supabase/verify_schema_v1.sql` ausgeführt und Bucket `core-media`, `authenticated`-/`service_role`-Grants, fehlende `anon`-Grants, Constraints sowie alle erwarteten Core- und Storage-Policies bestätigt.
- [x] Unterschied zwischen Schemaanker `supabase/core_schema_v1.sql`, angewendeten Migrationen und Remote-Schema als Release-Stand in `docs/specs.md` festgehalten; es wurde keine zusätzliche breite Migration erzeugt.

### 1.2 Deterministische Tests und Deployment

- [x] Playwright-Auth-Fixture eingeführt: `auth-setup` setzt ausschließlich einen vorab angelegten Account im separaten Supabase-Testprojekt auf die Hauptstadt-Fixture zurück, schreibt eine bereinigte und ignorierte `storageState`-Datei und lässt `resetToFreshLocalState()` nur `core.*` statt der Supabase-Session löschen.
- [ ] Die E2E-Suite in zwei klare Gruppen teilen: Login-Gate/Auth-Fehlerfälle und authentifizierte Produkt-Smokes für Navigation, Review, Varianten, KI-Draft, Assistent, Portabilität und Deck-Hierarchie. Die drei Playwright-Projekte und 14 Tests sind umgesetzt und per `--list` bestätigt; die Abnahme wartet auf einen vollständigen Lauf mit `.env.e2e.local`.
- [ ] E2E-Tests für Offline-Start, fehlende Supabase-Konfiguration und abgelaufene Session explizit ergänzen; derzeit sind diese Fälle nur teilweise über Modul-Tests abgedeckt.
- [ ] Einen CI- oder Release-Job anlegen, der mindestens `npm test`, `npm run build` und `npm run test:e2e` mit der Test-Session ausführt. Secrets dürfen nur als CI-/Vercel-Secrets injiziert werden.
- [ ] Preview-Smoke und Production-Rollback dokumentieren: Deployment, Login, Cloud-Laden, Review mit Save-Status, Importvorschau, `/api/ai/chat` mit und ohne Key, Abmeldung und Rollback.
- [ ] Domain-/DNS-Pfad für Vercel festlegen: Preview-URLs und Production-Domain trennen, Redirect-Allowlist in Supabase passend pflegen.
- [ ] App-Version, Build-Commit, Umgebung und eine nutzbare Fehlerseite anzeigen; keine sensiblen Env-Werte ausgeben.
- [ ] `npm run build` ohne Chunk-Warnung bekommen: PDF-/Worker-/APKG-/SQLite-Code über echte Route-/Feature-Dynamic-Imports oder gezieltes Rollup-Chunking aus dem Hauptchunk herauslösen. Keine bloße Erhöhung von `chunkSizeWarningLimit`.

## 2. P1 — Cloud-Persistenz fachlich korrekt machen

### 2.1 Repository-Mapping

- [ ] `src/cloudRepository.js` um die in der lokalen Migration vorhandenen Felder ergänzen: `revision`, `deleted_at`, `updated_by_device_id` für Decks, Cards, Varianten, Dokumente und Jobs sowie `created_by_device_id` für Review-Events.
- [ ] Beim Laden Soft-Deletes und Revisionen korrekt in das lokale Modell überführen; beim Schreiben Revisionen nicht stillschweigend zurücksetzen.
- [ ] `replaceAccountCloudState()` ausschließlich für den einmaligen Legacy-Import bzw. einen ausdrücklich bestätigten Voll-Replace verwenden. Regulärer Autosave darf weder fehlende Rows löschen noch einen älteren Snapshot bedingungslos über einen neueren Serverstand schreiben.
- [ ] Mapping-Tests in `src/cloudRepository.test.js` für Revision, Soft-Delete, Geräte-ID, Medienreferenzen und leere/teilweise Cloud-Daten ergänzen.

### 2.2 Ownership, RLS und Account-Lifecycle

- [ ] Einen echten Nutzer-A/Nutzer-B/`anon`-Smoke gegen das verlinkte oder lokale Supabase-Projekt automatisieren. Prüfen: `decks`, `cards`, `card_variants`, `review_events`, `source_documents`, `ai_jobs`, `media_assets`, `sync_devices` und `sync_conflicts`.
- [ ] Für jede schreibbare Tabelle gesondert verifizieren, dass UPDATE sowohl `using` als auch `with check` hat und Foreign Keys keine fremden Deck-/Card-IDs akzeptieren.
- [ ] Hosted Auth konfigurieren und dokumentieren: Site URL, Redirect-Allowlist, Google OAuth, SMTP-Absender, DKIM/SPF/DMARC, deutsche Templates, E-Mail-Bestätigung und Leaked-Password-Protection.
- [ ] Browser-Tests für Magic Link, Google Redirect, Recovery, Passwortänderung, erneuten Login, Rate-Limit-Fehler und abgelaufene Links mit der Test-Fixture ergänzen.
- [ ] Account-Löschung, Reauth, Datenschutzexport und Datenportabilitätsrechte als Datenfluss spezifizieren. Der vorhandene JSON-Export ist nur ein lokaler Inhalts-Export und ersetzt keine Account-Löschung oder serverseitige DSGVO-Antwort.

## 3. P1 — Sync, Offline und Konflikte

### 3.1 Erst die Mutation-Semantik, dann Offline-UI

- [ ] Eine dauerhafte Outbox hinter `src/syncEngine.js` einführen. Sie muss mindestens Mutation-ID, Geräte-ID, `baseRevision`, Entitätstabelle, Entitäts-ID, Payload, Erstellzeit, Flushzeit, Retry-Zähler und idempotente Verarbeitung speichern. Die Queue darf einen Reload oder Tab-Neustart überleben.
- [ ] `SYNC_MUTATION_TYPES.reviewEventAppend` wirklich verdrahten. Aktuell nutzt `src/App.jsx` ausschließlich `statePatch`; `adapter.applyMutationBatch` ist optional und im Supabase-Adapter nicht implementiert.
- [ ] `sync_devices` beim ersten Login/Start registrieren und `last_seen_at`, User-Agent und Gerätebezeichnung aktualisieren. Flushes müssen Mutation-IDs und Geräte-ID an das Repository übergeben.
- [ ] In `cloudRepository` konkrete Mutationsfunktionen ergänzen: `applyDeckMutation`, `applyCardMutation`, `appendReviewEvent`, `softDeleteEntity` und `markConflict`. Die Funktionen müssen Server-Revisionen bedingt prüfen, statt nur clientseitig zu vergleichen.
- [ ] Konfliktregeln dokumentieren und testen: Review-Events append-only zusammenführen, gleiche Medien per SHA-1 deduplizieren, Content-Änderungen bei abweichender `baseRevision` in `sync_conflicts` ablegen; unabhängige Metadaten nur mit expliziter Feldregel mergen.
- [ ] `sync_conflicts` beim Erkennen tatsächlich beschreiben. Die vorhandenen Funktionen listen und lösen Konflikte nur auf; sie erzeugen noch keinen Konflikt-Datensatz.
- [ ] Konfliktauflösung in `SettingsScreen` oder einem eigenen Sync-Panel klickbar machen: lokale Version behalten, Remote-Version behalten, manuell zusammenführen, ignorieren. Die Merge-Logik bleibt in `syncEngine`/Repository-Modulen.
- [ ] Online-/Offline-Status, Retry mit Backoff, Flush bei Wiederverbindung und sichtbare Zustände für `pending`, `saving`, `saved`, `offline` und `conflict` ergänzen.
- [ ] Zwei-Geräte-Tests schreiben: alter Snapshot darf neue Remote-Content-Änderungen nicht löschen; Offline-Reviews werden nach Wiederverbindung genau einmal ergänzt; Soft-Delete wird nicht durch einen älteren Snapshot reaktiviert.

## 4. P1 — Medien, Dokumente und APKG

### 4.1 Cloud-Medien an den bestehenden Import anschließen

- [ ] Den APKG-Importpfad in `src/creationWorkflow.js` so erweitern, dass nach der Vorschau wahlweise `src/cloudMediaStore.js` statt ausschließlich `src/mediaStore.js` verwendet wird. Lokaler Browser-Medienspeicher und Cloud-Medien müssen klar getrennte Statusmeldungen haben.
- [ ] `media_assets` in den Cloud-Persistenzpfad aufnehmen: Rows mit Deck-/Card-Referenzen speichern, beim Laden accountgebunden laden und für `src/ui/cardMedia.jsx` in aufgelöste signed URLs übersetzen. React darf keine Storage-Manifeste selbst interpretieren.
- [ ] Reimport- und Dedupe-Regeln festlegen: SHA-1 plus Nutzer/Bucket/Storage-Pfad, keine doppelten Assets, lokale Content-Edits bleiben erhalten, fehlende signed URLs erscheinen als verständlicher Medienstatus.

### 4.2 Große Dateien und Hintergrundjobs

- [ ] `uploadLargeMediaAsset()` implementieren: resumable Upload, Fortschritt, Abbruch, Wiederaufnahme, eindeutige Fehlerklassen und Tests. `persistDeckMedia()` markiert Dateien über 6 MB derzeit nur als `resumable-required` und lädt sie nicht hoch.
- [ ] Einen serverseitigen APKG-Importjob für Dateien oberhalb der Browsergrenze von 250 MB spezifizieren: Original in Storage, Jobstatus, Worker-Extraktion, Importreport, Fehler-/Retry-Status und idempotenter Abschluss.
- [ ] Storage-Orphan-GC bauen: Rows mit `deleted_at`, fehlende DB-Referenzen, fehlende Storage-Objekte und Storage-Objekte ohne DB-Row getrennt melden; Löschung nur über serverseitig geschützte Admin-/Cron-Aktionen.
- [ ] Signed-URL-, fehlendes-Medium-, Delete-, Reimport- und `resumable-required`-Tests in `src/cloudMediaStore.test.js` ergänzen.

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

- [ ] Die authentifizierten Browser-Smokes nach dem E2E-Fixture-Fix für Review, Variantenreview, KI-Draft, Chat, Lernplan, Export/Import, Deck-Hierarchie und Browser-Back/Forward grün bekommen.
- [ ] Accessibility und Fehlerzustände an `AuthGateScreen`, `StudyMode`, `CreationScreen`, `DecksScreen` und `SettingsScreen` prüfen: Fokusführung, sichtbare Labels, Tastatur, Screenreader-Status, Kontrast, leere Zustände, große Dateien und Netzwerkfehler.
- [ ] Version-Restore/Undo in `DecksScreen` tatsächlich klickbar machen. `versionLog` und Restore-Basis existieren im Modell, aber der Nutzerfluss ist noch nicht vollständig sichtbar.
- [ ] Datenportabilität mit Roundtrips testen: `createPortableExport`, `validatePortableExport`, `mergePortableExportIntoState`, Legacy-Card-Normalisierung, Learning-Item-Invariante und ID-Kollisionen. Medien- und serverseitige Account-Rechte müssen ausdrücklich als nicht enthalten markiert bleiben.
- [ ] Das Desktop-Raster aus der Spec im Code messbar nachziehen: Ziel 1440 × 900, Mindestbreite 1280, feste Arbeitsflächen-/Review-Breiten und zentrale Typografie-/Farb-Tokens statt vieler verstreuter Tailwind-Werte.
- [ ] Keine sichtbaren Produktpfade bei Überarbeitungen entfernen; neue Produktionsfehler müssen als Statusmeldung und nicht nur als Console-Fehler erscheinen.

## 8. P2 — Scheduler, Varianten und Content-Repetition

- [ ] FSRS-like Parameter mit aufgezeichneten anonymisierten Lernverläufen oder einer versionierten synthetischen Session-Fixture validieren: Stability, Difficulty, Desired Retention, Retrievability, Lernschritte und Kurzintervall-Bias.
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
- [x] Cloud-first Autosave über echte Tabellen ohne Delete-Missing-Semantik im regulären Autosave; bewusster Voll-Replace bleibt für den Legacy-Import.
- [x] Learning-Item-Creation-Pipeline für Basic, Reverse, Cloze, Importvarianten und KI-Drafts mit genau einer Originalvariante.
- [x] APKG-, Text-, CSV-, normalisierte JSON- und Tabellen-/Excel-Paste-Importe mit Dry-Run, Dedupe, Hierarchie und Reimport-Merge.
- [x] Lokaler APKG-Medienspeicher, HTML-Safety, Rich Text, PDF-/Textauslesung und Quellenanker; produktive Cloud-Medienanbindung ist separat offen.
- [x] Fullscreen-Review, vier Ratings, Tastatur, Review-Events, FSRS-like State, Fälligkeit, Varianten-Fallback und Originalanker.
- [x] Lokale Community, Graph, Chat-/Lernplan-UI, AI-Job-Ledger und JSON-Portabilität als MVP-Modelle.
- [x] Serverroute `/api/ai/chat` mit serverseitigem `GOOGLE_API_KEY`, Origin-/Payload-Prüfung, Gemma-Response-Parsing und lokalem Quellen-Fallback.
- [x] Breite Modul-Testabdeckung für Core-Modell, Import, Review, Varianten, Auth, Cloud-Mapping, Medien-Grundlage, Portabilität und Sync-Grundfunktionen.

## Referenzen

- `docs/specs.md`: kanonische Produkt- und Engineering-Spezifikation, insbesondere Abschnitte 10, 12, 14–18, 21, 26 und 27.
- `docs/anki-format-analysis.md`: Anki-/APKG-Differenzen und Importidentitäten.
- `supabase/core_schema_v1.sql`: Schemaanker für Tabellen, RLS, Grants und Storage-Policies.
- `supabase/migrations/20260709091315_sync_media_auth_operations.sql`: remote angewendete Migration für Revisionen, Medien, Geräte, Konflikte und Storage-Policies.
- `supabase/verify_schema_v1.sql`: fehlschlagendes Verify-Gate für Zieltabellen/-spalten, RLS, Policies, Grants, Constraints und den privaten Medien-Bucket.
- `src/cloudRepository.js`, `src/syncEngine.js`: aktueller Cloud-/Sync-Pfad und nächste technische Naht.
- `src/cloudMediaStore.js`, `src/mediaStore.js`, `src/creationWorkflow.js`: aktueller lokaler und vorbereiteter Cloud-Medienpfad.
- `api/ai/chat.js`, `src/deckAssistant.js`, `src/aiOrchestrator.js`: aktueller Chat-Proxy und lokale KI-Drafts.
- `tests/e2e/`, `playwright.config.js`: bestehende Browser-Smokes und fehlende Auth-Fixture.
