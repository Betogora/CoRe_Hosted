# CoRe-Betrieb und Runbooks

Einzige Quelle für Umgebungen, Freigabe, Rollback, Auth-Abnahme, Datenbank,
Restore und Störungen. Tests, Prüfläufe, visuelle Pflichtmatrix und
Performance-Gates stehen in [`test-portfolio.md`](test-portfolio.md); ausgefüllte
Nachweise in [`history.md`](history.md#betriebsnachweise).

## 1. Lokale Entwicklung

```powershell
npm install
npm run dev
```

Die lokale URL ist `http://127.0.0.1:5190/`. `npm run dev` bedient auch die
KI-Routen `/api/ai/summary` und `/api/ai/card-variant` (Vite-Plugin
`localAiRoutes` in `vite.config.ts`); ihre serverseitigen Variablen
(`OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, ersatzweise
die `VITE_SUPABASE_*`-Werte) kommen aus der Umgebung oder der ignorierten
`.env.local`.

Bei „Ein Programmteil konnte nicht geladen werden“ zuerst Verbindung prüfen,
offene Änderungen speichern und neu laden. Ein lange geöffneter Tab kann nach
einem Deployment entfernte Chunknamen anfordern. Diagnose: Der betroffene
`/assets/…js`-Pfad muss für vorhandene Module JavaScript liefern, für fehlende
einen Fehlerstatus statt der HTML-Startseite. Der Service Worker speichert HTML
nie als JavaScript; IndexedDB oder Kontodaten müssen dafür nicht gelöscht werden.

## 2. Umgebungen und Secrets

Kanonische Production-URL: `https://core-hosted.vercel.app`.

Erlaubte Supabase-Redirects:

- `https://core-hosted.vercel.app/**`
- `https://*-bengt2.vercel.app/**` ausschließlich für Vercel-Previews
- `http://127.0.0.1:5190/**` lokal

Browser-sichtbar sind ausschließlich öffentliche Werte wie `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` und `VITE_ENABLE_MAGIC_LINK`. Service-Role-Secrets und `OPENROUTER_API_KEY` bleiben
außerhalb des Browsers. Nachweise enthalten keine Werte, Tokens, Passwörter,
`.env`-Dateien oder Auth-Screenshots.

### OpenRouter-Schlüssel

- Im OpenRouter-Account gibt es einen modellagnostischen Schlüssel `CoRe` mit Ausgabenlimit. Die Routen verlangen ZDR und verbieten Training je Anfrage selbst.
- In Vercel steht `OPENROUTER_API_KEY` für Production und Preview als sensitive Variable. Development unterstützt Sensitive nicht; dort wird derselbe Name als normal verschlüsselte Variable oder lokal über eine ignorierte `.env.local` bereitgestellt. Den Wert trägt nur die berechtigte Person direkt ein, nie über Chat, Logs oder Nachweise.
- Das Key-Limit ist die Kostenbremse: Die Variantenroute nutzt derzeit `openai/gpt-6-luna` (`OPENROUTER_MODEL`) mit Reasoning `low` (gemessen etwa 0,00006 USD je Variante). Ist das Limit erreicht, meldet die Route `provider_budget_exhausted`; es wird dann bewusst im Account angehoben.
- Nach Anlage oder Rotation ist ein neues Deployment nötig. Geprüft werden nur Variablenname, Umgebungszuordnung und ein authentifizierter Aufruf mit einer freigegebenen Testkarte.
- Verbrauch und Restbudget zeigt `GET https://openrouter.ai/api/v1/key` (`usage`, `limit_remaining`). Andere Projekte desselben Accounts teilen das Guthaben, nicht das Key-Limit.
- Jeder Erzeugungsversuch schreibt genau eine JSON-Logzeile `ai_card_variant` bzw. `ai_learning_summary` mit Ergebnis-Code, HTTP-Status, Latenz, Modell, Tokenzahl und Kosten in die Vercel-Logs. `rate_limited` ist ein Anfragelimit, `provider_budget_exhausted` das Key-Limit, `no_provider_endpoint` ein fehlender ZDR-Endpunkt.
- Bei Providerfehlern zuerst diese Logzeilen, OpenRouter-Verfügbarkeit und Key-Limit prüfen. Karteninhalte, Bearer und Providerantworten gehören nie in Diagnoseausgaben.

## 3. Preview- und Production-Freigabe

### Voraussetzungen

- Freizugebender Commit und alle Pflicht-Checks stimmen überein und sind grün; der Working Tree ist sauber.
- `npm run test:beta` ist lokal grün (E-Mail/Passwort, Golden-Flows, Kern-RLS, Sync/Offline/Konflikte, kleiner APKG-Import mit Medium). Magic Link ist kein Beta-Kriterium.
- Preview und Production enthalten die benötigten Variablennamen; Werte werden nicht ausgelesen.
- Schemaänderungen besitzen einen vorwärtskompatiblen Migrations- und Rückfallplan.
- Die Performance-Gates aus [`test-portfolio.md`](test-portfolio.md#performance-gates) sind erfüllt.

### Hosted-Core-Smoke

Der Smoke verwendet ausschließlich einen dedizierten, löschbaren Testaccount und
darf dessen Daten und Storage-Objekte zurücksetzen. Die Variablen werden lokal oder
als geschützte CI-Secrets gesetzt und nie protokolliert:

```powershell
$env:CORE_HOSTED_BASE_URL = "https://<deployment>"
$env:VITE_SUPABASE_URL = "<public project URL>"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = "<public publishable key>"
$env:CORE_E2E_EMAIL = "<dedicated smoke account>"
$env:CORE_E2E_PASSWORD = "<secret>"
$env:CORE_E2E_ALLOW_ACCOUNT_RESET = "true"
$env:VERCEL_AUTOMATION_BYPASS_SECRET = "<nur bei geschütztem Deployment>"
npm run test:beta:hosted
```

Der optionale Automation-Bypass wird nur am ersten Hostaufruf als Vercel-Query
übergeben und als Host-Cookie gespeichert, nie als globaler Playwright-Header,
weil dieser auch Supabase-Fetches erreichen könnte.

Der Lauf deckt Login und Cloud-Laden, kleinen APKG-Import, transiente PDF-Hilfe,
Review mit Offline-Pending, Reconnect und Reload sowie die KI-Variante mit Reveal,
Originalkarte und Verwaltung ab, dazu APKG-Medien in DB und privatem Storage und
einen Konfliktstatus. Nicht geprüft: Magic Link, Dateien über 250 MB.

Reihenfolge: zuerst Preview, danach die mit `--skip-domain` bereitgestellte
staged Production. Ein fehlgeschlagener Schritt stoppt die Freigabe; nach einer
Korrektur beginnt sie mit neuem Deployment wieder bei Preview.

### Staged Production und Promotion

```powershell
git status --short
git rev-parse HEAD
vercel --version
vercel list --prod
vercel deploy --prod --skip-domain
vercel inspect <staged-production-url>
vercel promote <staged-production-url>
vercel promote status
```

Vor der Promotion läuft der Smoke gegen die staged Production. Danach werden
gegen die kanonische URL Login, Cloud-Laden, ein Review mit Save/Reload und
Abmeldung wiederholt; der Testaccount hinterlässt keine Pending- oder
Konfliktzustände.

### Nachweisvorlage

```text
Commit / CI-Lauf:
Preview-URL und Deployment-ID:
In der App angezeigte Version:
Vorherige Production-URL und Deployment-ID:
Staged-Production-URL und Deployment-ID:
Tester / Start / Ende:
Lokales Beta-Core-Gate:
Hosted Auth-Lifecycle:
Preview Hosted-Core-Smoke:
Staged-Production Hosted-Core-Smoke:
Kanonischer Production-Kurzsmoke:
Monitoring- und 5xx-Scan:
DB-Restore-Probe / Storage-Restore-Probe:
Ergebnis oder Rollback-Grund:
```

Der ausgefüllte Nachweis kommt datiert unter
[Betriebsnachweise](history.md#betriebsnachweise).

## 4. Rollback

Auslöser sind insbesondere 5xx-Fehler, nicht funktionierender Login, fehlendes
Cloud-Laden oder -Speichern, falsche Umgebung, Secret-Leaks oder unbenutzbare
Kernnavigation.

```powershell
vercel logs --environment production --status-code 5xx --since 30m
vercel rollback <previous-production-url>
vercel rollback status
vercel logs --environment production --status-code 5xx --since 5m
```

Das Rückfallziel ist das letzte erfolgreiche Release aus den
[Betriebsnachweisen](history.md#betriebsnachweise). Ein Vercel-Rollback wechselt
nur den App-Build; Supabase-Daten und Migrationen bleiben. Danach Login,
Cloud-Laden und Abmeldung prüfen und Grund, Zeit, fehlerhaftes und
wiederhergestelltes Deployment protokollieren.

## 5. Auth-Abnahme

1. Site URL und Redirect-Allowlist nach Dashboard-Reload lesen.
2. SMTP-Zustellung und deutsche Templates prüfen.
3. SPF, DKIM, Return-Path und DMARC prüfen.
4. Mit einer neuen, nicht persönlichen Adresse Registrierung, Bestätigung und Login prüfen.
5. Recovery anfordern, neues Passwort setzen, abmelden, neu anmelden; altes Passwort und wiederverwendeter Link müssen scheitern.
6. Magic Link nur bei ausdrücklicher Freigabe vollständig durchspielen; sonst bleibt sein Schalter leer und der Einstieg unsichtbar.
7. Security Advisor und Leaked-Password-Protection prüfen.

Lifecycle-Tests halten lokale Secrets nur im
privilegierten Node-Prozess; Vite und Playwright erhalten keine Service Role.

## 6. Datenbank, RLS und Restore

Bei Schemaänderungen gelten die Gates aus `AGENTS.md` (`db:types:check`,
`test:rls:local`, `test:e2e:local`). `supabase/verify_schema_v1.sql` prüft
Struktur, RLS, Policies, Grants, Constraints und Buckets und ist die einzige
zusätzliche SQL-Verifikation.

### Migrationen und Pre-Release-Reset

`20261030103636_kartenmodell_baseline.sql` ist die einzige Baseline; spätere
Migrationen in `supabase/migrations/` bauen darauf auf und bleiben nach dem
Anwenden unverändert. Es gibt keine Upgrade- oder Backfillkette (ADR-034).

Wechselt der lokale Replik-Namensraum (`core.workspace.entities.vN.`), liest die
App den alten nicht mehr; noch nicht gesendete Änderungen blieben dort zurück.
Vor einem solchen Deploy deshalb alle genutzten Geräte synchronisieren, dann
`supabase db push`, `verify_schema_v1.sql` gegen das Projekt, dann die App
deployen.

Die Kartenverwaltung 2.0 (ADR-048) bringt die Migration
`20261110130000_kartenverwaltung`; sie gehört in denselben Release wie der
Client, Migration zuerst. Ein noch geöffneter älterer Client lehnt die
Delta-Tabelle `note_search` ab und synchronisiert erst nach dem Neuladen
wieder; ein neuer Client vor der Migration sucht weiter in der Cloud
(`searchTextsReady`). Die Migration füllt alle Katalogzeilen neu; der Client
mit lokaler Datenbank Version 3 lädt den Katalog beim ersten Start einmal ganz
und sucht bis dahin in der Cloud. Lokale Datenbanken, die noch die früheren
Einzelmigrationen `20261104220000` bis `20261110120000` tragen, setzt
`npx supabase db reset` neu auf.

Ein Reset löscht Auth-Konten, Storage-Objekte und fachliche Daten
unwiederbringlich und ist ausschließlich für das bestätigte Pre-Release-Projekt
zulässig:

1. Vor jeder Remote-Aktion Link-Konfiguration und Projekt-Ref sichtbar ausgeben. Die Ref muss dem ausdrücklich freigegebenen Projekt entsprechen; sonst abbrechen.
2. Lokal `supabase db reset --local --no-seed`, `npm run db:types:generate`, `npm run db:types:check`, `npm run test:rls:local` und `npm run test:e2e:local`; danach 100k-/1m-Fixture, Performance-Gates und `EXPLAIN (ANALYZE, BUFFERS)` für Bootstrap, Katalog-Delta, Kartenliste, Hydrierung, Manifest, Lernübersicht und Statistik.
3. Erst danach Sitzungen widerrufen, alle Auth-Benutzer und Objekte in `core-media` über die Supabase-APIs löschen und `supabase db reset --linked --no-seed` gegen die nochmals angezeigte Ref ausführen. Direkte Deletes in `storage.objects` oder `storage.buckets` sind verboten.
4. `auth.users`, `storage.objects` und alle fachlichen Tabellen müssen leer sein; Schema-Verify, Typdrift, RLS und Hosted-Smoke erneut. Bestehende Personen registrieren sich neu.
5. Ein App-Rollback stellt gelöschte Daten nicht wieder her. Nach dem ersten extern genutzten Release entfällt dieser Ablauf zugunsten eines vorwärtskompatiblen Migrations- und Restorevertrags.

### DB-Restore-Probe im Testprojekt

1. Ein ausschließlich dafür bestimmtes Testprojekt und einen Zeitpunkt vor einer markierten Testmutation verwenden.
2. Backup bzw. PITR in das Testprojekt wiederherstellen; Production bleibt unverändert.
3. Schema-Verify, Kern-RLS, Testaccount-Login und Readback der markierten Rows ausführen.
4. Datenverlustzeitraum, Dauer, Projekt-ID und Ergebnis ohne Row-Inhalte dokumentieren.

Ein Datenbankbackup enthält nur Storage-Metadaten, nicht die Objektbytes; eine
DB-Probe ist kein Storage-Nachweis.

### Storage-Restore-Probe im Testprojekt

1. Ein kleines Testobjekt samt SHA-1, Größe und DB-Referenz in einem privaten Testbucket markieren.
2. Objektbytes und Metadaten über den freigegebenen Backupweg in den Testbucket zurückspielen; keine Production-Pfade überschreiben.
3. Größe und Hash prüfen, dann Signed URL und accountgebundene Lesbarkeit mit Kern-RLS verifizieren.
4. Fehlende, zusätzliche und nicht referenzierte Objekte getrennt dokumentieren; kein Orphan-Delete.

Die Beta-Freigabe ist blockiert, solange eine der beiden Proben fehlt oder die
Zuordnung von DB-Referenz zu Objekt nicht verstanden ist.

## 7. Monitoring und Alarmweg

Der Beta-Betrieb nutzt Vercel- und Supabase-Ansichten sowie den Hosted-Smoke; es
gibt keinen zusätzlichen Telemetrieanbieter.

| Kernsignal | Prüfung | Alarmgrenze | Erste Reaktion |
| --- | --- | --- | --- |
| Login | Hosted-Login plus Supabase-Auth-Logs | ein Smoke-Fehler oder mindestens drei Auth-5xx in 15 Minuten | Promotion stoppen; Auth-Status und Redirects prüfen |
| Laden/Speichern | Cloud-Laden, Mutation, Save/Reload, Supabase-API-Logs | ein Datenverlust-/Ownership-Fehler oder drei Save-Fehler in Folge | Schreibzugriffe stoppen; RLS, Revision und Outbox prüfen |
| Review | Bewertung, Cloud-Readback, Reload | verlorenes oder doppeltes Review Event, Pending ohne Reconnect | Release blockieren bzw. zurückrollen |
| Import | kleiner APKG-Import mit Medium und Storage-Readback | Abbruch, fehlende Referenz oder Objekt, falsche Ownership | Importfreigabe stoppen; DB und Storage getrennt prüfen |
| Serverfehler | Vercel Runtime Logs | jeder reproduzierbare 5xx im Smoke oder mindestens drei 5xx in 15 Minuten | Deployment isolieren und Rollback entscheiden |

Vor der Promotion und 30 Minuten danach werden Vercel-5xx sowie Supabase
Auth/DB/Storage geprüft. Der Alarm geht an die im Projekt hinterlegten Owner; die
verantwortliche Person eröffnet einen secretsfreien Incident-Nachweis mit
Umgebung, Zeitfenster, Release-ID und Kernsignal, ohne Tokens, E-Mail-Adressen,
Nutzerinhalte oder Auth-URLs.

## 8. Störungen

- Login: Auth-Status, Redirect-Konfiguration und Supabase-Verfügbarkeit prüfen; keine Tokens loggen.
- Sync: Pending-Anzeige, Netzstatus, Konflikte und Repository-Readback prüfen; keine Nutzerinhalte in Tickets.
- Medien: DB-Referenz und Storage-Objekt getrennt prüfen; keine vorschnelle Orphan-Löschung.
- Datenverlust: Schreibzugriffe stoppen, Account- und Zeitgrenze sichern, Restore erst im Testprojekt prüfen.

Solange Restore-Proben und realer Alarmempfang nicht in den
[Betriebsnachweisen](history.md#betriebsnachweise) stehen, bleiben diese
Abnahmen offen.
