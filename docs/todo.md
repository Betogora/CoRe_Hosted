# CoRe TODO

Stand: 2026-07-09

Diese Datei ist die einzige TODO-Markdown-Datei im Repository. Sie bündelt die offene Arbeit aus der früheren Kurzliste und der technischen Roadmap. Neue Aufgaben werden hier nach Oberthemen einsortiert.

## Aktueller Stand

CoRe ist ein Vite/React-Web-MVP mit Supabase-Pflichtlogin, E-Mail/Passwort, Google-OAuth-Start, Magic Link, Recovery-Abschluss, Profil-Upsert, accountgebundenem Browser-Cache, lokalem Erstimportdialog, Sync-Engine-vermitteltem Autosave und echten Supabase-Tabellen für den ersten Cloud-Datenpfad.

Vorhanden sind außerdem: Learning-Item-kompatibles Kartenmodell, APKG-/Text-/CSV-/JSON-/Tabellen-Importe, lokaler APKG-Medienspeicher, `cloudMediaStore`-Grundlage für private Supabase-Storage-Medien, neue Haupt- und Unterstapel-Anlage direkt auf der Lern-Ebene, Screen-Level-Browser-Verlauf für Hauptscreens, versteckte Screens und Lernmodus, kalenderjahrbasierte Dashboard-Heatmap mit responsiven Wochenfenstern, deutsche Auth-Mailtemplates, RLS-/Grant-Schemaanker, Vercel-/Supabase-Startpfad und breite Modultests.

Noch nicht produktionsfertig sind vor allem: vollständige Offline-Konfliktauflösung, resumable Medien-/APKG-Jobs, Hosted-Auth-Konfiguration, Admin-APIs, Monitoring, Backup-/Restore-Runbooks, Community-Rechte, externe KI-Jobs und Bundle-Code-Splitting.

## 1. Betrieb, Deployment und Konfiguration

- [ ] Neue lokale Migration `supabase/migrations/20260709091315_sync_media_auth_operations.sql` remote anwenden und gegen `supabase/verify_schema_v1.sql` prüfen.
- [ ] Domain-/DNS-Pfad dokumentieren: eigene Domain in Vercel verbinden, Preview-URLs getrennt halten, Production-Domain bewusst mappen.
- [ ] Deployment-Checkliste pflegen: `npm test`, `npm run build`, Preview-Smoke, Production-Rollback, Netzwerk-Tab ohne Secrets, KI-Route mit/ohne Key.
- [ ] Basale Runtime-Konfiguration ergänzen: App-Version, Fehlerseite, Build-Metadaten und klare Umgebungsanzeige für Development/Preview/Production.
- [ ] Secret-Hygiene prüfen: keine KI-Keys in Browser-Code, `localStorage`, Export-State, Logs oder Supabase-Userdaten; `GOOGLE_API_KEY` bleibt serverseitig in Vercel Sensitive Env Vars und wird nur aus `process.env` gelesen.
- [ ] Build-Warnung zu großen Chunks abarbeiten: PDF-, Worker-, APKG-/ZIP-/SQLite- und Import-Code per dynamic import oder Rollup-Chunking trennen.

## 2. Auth, Accounts und E-Mail

- [ ] Hosted Supabase Auth konfigurieren: Site URL, Redirect-Allowlist, Google OAuth Client-ID/Secret, eigene SMTP-Domain, DKIM/SPF/DMARC und Template-Deployment prüfen.
- [ ] Session-Tests im Browser ergänzen: Magic-Link-Redirect, Google-Redirect, Recovery-Redirect, Passwortänderung, erneuter Login, Rate-Limit-Fehler und ausgelaufener Link.
- [ ] Session-Gültigkeit, Reauth-Regeln, Account-Löschung, Datenschutzexport und Datenportabilitätsrechte spezifizieren.
- [ ] Auth-Mailtemplates im echten Projekt testen: Confirm Signup, Magic Link, Reset Password und Password Changed mit deutscher Copy, korrekten Redirects und freundlichen Fehlerzuständen.

## 3. Persistenz, Schema und RLS

- [ ] `supabase/core_schema_v1.sql` weiter gegen das aktuelle `src/coreModel.js` abgleichen: Importrohdetails, Community-Rechte, Admin-Rollen und Jobtabellen fehlen noch.
- [ ] Echte Tabellen statt großen Store-Blob als Produktivquelle durchziehen; JSONB nur für flexible Metadaten, Policies, Importrohdetails und Versionseinträge verwenden.
- [ ] RLS-Tests schreiben: Nutzer A kann eigene Decks/Karten/Events/Medien lesen und schreiben, Nutzer B nie; `anon` bleibt ohne Core-Tabellenzugriff.
- [ ] Update-Policies gesondert prüfen: jede schreibbare Tabelle braucht sowohl `using` als auch `with check`.
- [ ] Nutzer-A/Nutzer-B-Smoke für `decks`, `cards`, `card_variants`, `review_events`, `source_documents`, `ai_jobs`, `media_assets`, `sync_devices` und `sync_conflicts` automatisieren.

## 4. Sync, Offline und Konflikte

- [ ] Outbox-Modell implementieren: `sync_mutations` oder äquivalente persistente Queue mit `id`, `device_id`, `base_revision`, `entity_table`, `entity_id`, `payload`, `created_at`, `flushed_at`, Retry-Zähler und idempotenter Verarbeitung.
- [ ] Konfliktregeln produktiv durchziehen: Review-Events append-only mergen, Medien per SHA-1 deduplizieren, Karten-/Deck-Content bei unterschiedlichem `base_revision` als `sync_conflicts` markieren.
- [ ] Metadaten-Feldregeln explizit festlegen: unabhängige Felder nur mit dokumentierten Merge-Regeln zusammenführen, sonst Konflikt.
- [ ] `cloudRepository` schrittweise von Vollzustands-Upsert auf Entitätsmutationen umstellen: `applyDeckMutation`, `applyCardMutation`, `appendReviewEvent`, `softDeleteEntity`, `markConflict`.
- [ ] Konflikt-UI in Settings oder eigenem Sync-Panel bauen; Konfliktlogik bleibt in `syncEngine`/Repository-Modulen, nicht in React-Screens.
- [ ] Zwei-Geräte-Tests ergänzen: stale Snapshot darf neuere Serveränderungen nicht löschen; Offline-Review-Events werden append-only nachgezogen.

## 5. Medien, Dokumente und APKG

- [ ] TUS/resumable Upload implementieren: `uploadLargeMediaAsset()`, Fortschritt, Resume, Abbruch, Fehlerklassen und Tests gegen Supabase Storage.
- [ ] APKG-Server-/Worker-Importjob spezifizieren: Browsergrenze 250 MB beibehalten, größere APKGs über `/api/imports`, Jobstatus, Storage-Originaldatei, Worker-Extraktion und Importreport verarbeiten.
- [ ] Storage-Orphan-GC als Admin-/Cron-Job bauen: `media_assets.deleted_at`, fehlende DB-Referenzen, fehlende Storage-Objekte und Storage-Objekte ohne Row getrennt melden.
- [ ] Storage-Tests erweitern: signed URL, fehlendes Medium, Delete/Garbage Collection, APKG-Reimport ohne doppelte Assets, große Datei mit `resumable-required`.
- [ ] APKG-Fixtures erweitern: Basic reversed, optional reversed, Cloze, Medienreferenzen, moderne MediaEntries, ungewöhnliche Note Types und echte `collection.anki21b`/Zstd-Beispiele.
- [ ] Notetype-/Template-Snapshots und Importidentitäten gemäß `docs/anki-format-analysis.md` prüfen: Anki-GUID, Note-ID, Card-ID, Notetype-ID, Template-Ordinal, Deck-Pfad und Medienchecksums.
- [ ] Importbericht in der UI detailreicher machen: erkannte Decks, Warnungen, nicht gemappte Felder, Medienstatus und Reimport-Dedupe.
- [ ] DOCX-Textextraktion als echtes Modul planen, inklusive Fehlerfällen.
- [ ] OCR, Bildregionen und erweiterte PDF-Werkzeuge erst nach stabilem textbasiertem Dokumentpfad priorisieren.
- [ ] Medienreferenzen für geteilte Decks stabil und datenschutzbewusst modellieren.

## 6. Monitoring, Backups und Admin-Werkzeuge

- [ ] `/api/admin/*` nur serverseitig mit Service-Role-Secret bauen: Nutzerexport/-löschung, Sync-Konflikte, Storage-Orphans, fehlgeschlagene Jobs und RLS-Smoke-Checks.
- [ ] Admin-Rollen festlegen: bevorzugt `app_metadata` oder DB-Rollentabelle; keine Admin-Rechte in `user_metadata`.
- [ ] Admin-Aktionen vollständig auditieren: `admin_audit_events` mit Actor, Target, Aktion, Metadaten und Zeitstempel.
- [ ] Monitoring-Runbook schreiben: Vercel Runtime Logs/Observability, Supabase Logs/Auth Audit Logs, DB-Fehler, Auth-Rate-Limits, Storage-Fehler, Worker-Fehler und Build-Status.
- [ ] Backup-Runbook trennen: Supabase-DB-Backup/Restore und Storage-Mirror/Restore separat testen, weil DB-Backups Storage-Objekte nicht wiederherstellen.
- [ ] Betriebs-Checks automatisieren: Backup-Dump erzeugen, Restore in Testprojekt, Storage-Mirror prüfen, Admin-Aktion auditieren, RLS-Query gegen Nutzer A/B/anon ausführen.

## 7. KI, Jobs und Kostenkontrolle

- [ ] Entscheiden, welche weiteren KI-Fähigkeiten echte LLMs brauchen: Kartenerstellung, Varianten und Graph; Chat nutzt bereits den serverseitigen Gemma-Pfad.
- [ ] Provider- und Datenschutzentscheidung treffen, bevor externe Inhalte gesendet werden.
- [x] Server-KI-Proxy für Chat umsetzen: Browser ruft nur `/api/ai/chat` auf; `GOOGLE_API_KEY` bleibt in Vercel/Supabase-Serverumgebung und wird serverseitig aus `process.env` gelesen.
- [ ] Weitere Server-KI-Proxys für Kartenerstellung, Varianten und Graph entwerfen; Provider-Keys bleiben ausnahmslos serverseitig.
- [ ] Supabase-Session-Strategie für KI-Routen festlegen: erst Drafts zurückgeben und Client speichert via RLS, später User-Identität für Kostenlimits serverseitig prüfen.
- [ ] Job-Queue-Interface aus dem lokalen `aiJobs`-Modell ableiten.
- [ ] Idempotenz, Retry, Rate-Limits und Fehlerklassifikation für KI-Jobs spezifizieren.
- [ ] Prompt-/Schema-Versionierung für `aiOrchestrator` einführen.
- [ ] Eval-Datensatz für Halluzinationen, Quellenanker und Kartenqualität erstellen.
- [ ] Token-/Kostenlogging und Budgetgrenzen pro Nutzer/Deck planen.
- [ ] Abuse-Schutz für KI planen: Same-Origin, Request-Größenlimit, Modell-Allowlist, Outputlimit, IP-/User-Rate-Limit, keine Secrets in Logs.

## 8. Produktqualität, UI und E2E

- [ ] Desktop-Website-Designraster im UI-Code nachziehen: Zielviewport 1440 x 900 px, Desktop-Mindestbreite 1280 px, feste Arbeitsflächen-/Review-Breiten und feste Typografie-Tokens.
- [ ] Leere, fehlerhafte und große Eingaben für Text/CSV/Excel/APKG mit UI-Fehlermeldungen absichern.
- [ ] Version-Restore in der UI voll klickbar machen, nicht nur im Modell vorbereiten.
- [ ] Bestehende lokale Demo-Daten als reproduzierbare Fixtures statt impliziter UI-Erzeugung pflegen.
- [ ] Tastatur- und Mobile-Review weiter polieren.
- [ ] Nach größeren UI-/Routing-Änderungen `npm test`, `npm run build` und Browser-Preview-Smoke gegen `http://127.0.0.1:5190/` ausführen.

## 9. Scheduler, Varianten und Lernqualität

- [ ] FSRS-like Scheduler-Parameter gegen reale Lernsessions validieren: Stability, Difficulty, Desired Retention, Retrievability und Kurzintervall-Bias.
- [ ] Learning-Item-State, Varianten-State, Fallback-State und Family-State gegen reale Lernsessions validieren.
- [ ] Regeln für Variantenzulässigkeit aus echten Decks nachschärfen; Cloze-Familien, Reverse-Varianten und importierte Template-Ordnungen gesondert validieren.
- [ ] Variantenqualität aus Feedback ableiten: deaktiviert, fachlich falsch, schlecht formuliert.

## 10. Community, Teilen und Wachstum

- [ ] Echtes Mitglieder-, Rollen- und Einladungsmodell entwerfen.
- [ ] Serverregeln definieren: geteilte Inhalte ja, fremde Review-Events nein.
- [ ] Ordner, Deck-Kopien und spätere Varianten-Wiederverwendung mit Berechtigungen verbinden.
- [ ] Moderations- und Missbrauchsfälle minimal beschreiben.
- [ ] Export/Import und Community-Kopie konsistent halten.
- [ ] Entscheiden, ob zuerst responsive Web, PWA oder native App verfolgt wird.
- [ ] Push-/Reminder-Konzept an Lernplan und Fälligkeit koppeln.
- [ ] Onboarding mit realen Zielgruppen testen: Medizin, Jura, Power-User.
- [ ] Kurs-/Hochschulfelder erst nutzen, wenn Community-Findung oder Deck-Empfehlungen konkret werden.
- [ ] Keine Social-Rankings einführen; Community bleibt ordner- und lerninhaltzentriert.
- [ ] Zahlungs-/Abo-Modell erst nach Hosting, Kostenmessung und KI-Budgetlogik diskutieren.

## Bewusst noch nicht bauen

- [ ] Keine generische Backend-Adapter-Schicht einführen, solange Supabase der einzige reale Anbieter ist.
- [ ] Keine weitere breite produktive Datenbankmigration schreiben, bevor die neue Sync-/Media-Migration remote geprüft ist.
- [ ] Keine externe LLM-Provider-Abstraktion bauen, bevor Provider, Datenschutzrahmen und Kostenmodell klar sind.
- [ ] Keine vollständige Offline-first Sync-Auflösung bauen, bevor Outbox, Konflikt-UI, Medienstrategie und Server-/Admin-Routinen zusammen spezifiziert sind.
- [ ] Keine Community-Rechteverwaltung vortäuschen, solange es keine echten Nutzer, Rollen und Serverregeln gibt.

## Erledigte Grundlagen

- [x] Pflichtlogin, Supabase E-Mail/Passwort, Profil-Upsert und accountgebundener Browser-Cache.
- [x] Google-OAuth-Start, Magic Link ohne Auto-Signup, Passwort-Recovery-Abschluss und deutsche Auth-Mailtemplates.
- [x] Einmalige lokale Datenübernahme pro Supabase-Account.
- [x] Account-owned Tabellen mit `(user_id, id)` für lokale ID-Kollisionen.
- [x] `syncEngine`-Skelett mit Snapshot-Load, Mutation Queue, Flush, Konfliktliste und Konfliktauflösung.
- [x] Regulärer Autosave über `upsertAccountCloudState()` ohne Delete-Missing-Semantik; bewusster Voll-Replace bleibt für Legacy-Importe.
- [x] `cloudMediaStore`, `media_assets`, private `core-media`-Bucket-Policies, signed URLs und Markierung großer Uploads.
- [x] Learning-Item-Creation-Pipeline für Basic, Reverse, Cloze, Importvarianten und KI-Drafts.
- [x] APKG-Basic-Import mit Unterstapeln, Media-Manifesten, HTML-Sanitization, lokaler Medienablage und Reimport-Merge.
- [x] Text-, CSV-, normalisierte JSON- und Tabellen-/Excel-Paste-Importe.
- [x] Fullscreen-Review, append-only Review-Events, FSRS-like Scheduler-State und Intervallvorschau.
- [x] Content-Repetition-Varianten mit Eligibility, Reifegrad-Gate, Originalanker, Fallback und Feedback.
- [x] Screen-Level-Browser-Verlauf für Hauptscreens, versteckte Screens und Lernmodus ohne SPA-Reload.
- [x] Dashboard-Heatmap zeigt standardmäßig das Kalenderjahr von Januar bis Dezember, nutzt breite Viewports mit flexiblen Wochen-Spalten und bleibt auf schmalen Breiten als ganzer Wochenausschnitt navigierbar.
- [x] Lokale Community-Gruppen, Deck-Graph, Chat-your-Deck, Lernplan, AI-Job-Modell und JSON-Datenportabilität.
- [x] Vercel-Route `POST /api/ai/chat` für freie Gemma-4-31B-IT-Chatantworten per Default, optionale Quellenbindung mit lokalem Quellen-Fallback und server-only `GOOGLE_API_KEY`.
- [x] Vercel-/Supabase-Startpfad, Env-Grenzen, Vercel-Projekt, Supabase-CLI-Link, RLS-/Grant-Schemaanker und Verify-Query.

## Referenzen

- `docs/index.md`: Dokumentationskarte.
- `docs/specs.md`: Produkt-, Engineering-, Modul- und Implementierungs-Soll.
- `docs/specs.html`: navigierbare HTML-Version der Spezifikation.
- `docs/anki-format-analysis.md`: Differentialanalyse des offiziellen Anki-Modells mit CoRe-Prioritäten.
- `supabase/core_schema_v1.sql`: aktueller Supabase/Postgres-Schemaanker.
- `supabase/migrations/20260707081417_core_schema_v1.sql`: angewendete Erst-Migration.
- `supabase/migrations/20260709074255_cloud_variant_schema_alignment.sql`: angewendete Schema-Abgleichsmigration.
- `supabase/migrations/20260709082140_account_scoped_primary_keys.sql`: angewendete Account-Isolationsmigration.
- `supabase/migrations/20260709091315_sync_media_auth_operations.sql`: neue lokale Migration für Sync, Medien, Storage-Policies und Admin-Audit.
- `supabase/verify_schema_v1.sql`: RLS-/Policy-Verifikation.
- `src/cloudAuth.test.js`: Supabase-Profil- und Auth-Mapping.
- `src/cloudMediaStore.test.js`: Supabase-Storage-Medienpfad, direkte Uploads, große Upload-Markierung und signed URLs.
- `src/syncEngine.test.js`: Autosave ohne Delete-Missing-Semantik, append-only Merge und Revision-Konflikterkennung.
- `src/cloudRepository.test.js`: Cloud-Tabellenmapping für Decks, Cards/Learning Items, Originalvarianten und Review Events.
- `src/coreFeatures.test.js`: großer Modul-Test für MVP-Pfade.
