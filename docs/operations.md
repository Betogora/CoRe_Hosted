# CoRe-Betrieb und Runbooks

**Rolle:** einzige kanonische Quelle für lokale Betriebsabläufe, Release, Rollback, Wiederherstellung und operative Gates.
**Stand:** 2026-08-28

Zeitgebundene Release-Nachweise stehen in [`history.md`](history.md). Produktanforderungen und Roadmap stehen nicht in diesem Dokument.

## 1. Lokale Entwicklung

```powershell
npm install
npm run dev
```

Die lokale URL ist `http://127.0.0.1:5190/`.
Der normale SPA-Weg bleibt `npm run dev`. Für einen lokalen Test der Vercel Function einschließlich serverseitiger Umgebungsvariablen wird stattdessen `vercel dev --listen 5190` verwendet.

Fokussierte Prüfungen laufen zuerst. Für einen zusammenhängenden Arbeitsstand
steht das kanonische manuelle Qualitätsgate bereit:

```powershell
npm run gate:push
```

Das Gate kombiniert Typecheck und generierte Dokumente, kompakte Unit-/Contract-
Tests sowie den Production-Build einschließlich harter Bundlebudgets. Commits
und Pushes führen es nicht automatisch aus, weil ein gemischter Worktree auch
Änderungen außerhalb des zu pushenden Commits enthalten kann. GitHub Actions
führt auf `main`, in Pull Requests und manuell denselben einzelnen Quality-Job
aus. Vercel verwendet ebenfalls `npm run gate:push` als Build-Barriere; die
ausgelieferte Anwendung erhält dadurch keinen zusätzlichen Runtime-Overhead.

Schwere Gates sind vom normalen Push entkoppelt:

| Gate | Zeitplan | Befehl | Verantwortung |
| --- | --- | --- | --- |
| Nightly Core | täglich 02:17 UTC, veröffentlichte Releases, manuell | `npm run gate:nightly` | Beta-Core, vollständiges Release-E2E und APKG-Benchmark; jeder Fehler blockiert den Lauf |
| Weekly Performance | montags 04:17 UTC, manuell | `npm run performance:measure:local` | gedrosselte Startmessung, Performanceartefakt und lokaler 100k-/1m-Statistikbenchmark; jeder Grenzwert bleibt blockierend |

Bei Änderungen an Bootstrap, Preload, Sync, Katalog, Statistik, Service Worker,
Dependencies oder Chunking sowie vor Releases wird das Performance-Gate
zusätzlich lokal ausgeführt. Datenbanknahe Gates sind in
[`test-portfolio.md`](test-portfolio.md) beschrieben.

Gemessene Laufzeitwerte werden als JSON gegen die festen Produktgrenzen geprüft:

```powershell
npm run performance:gates -- test-results/performance.json
```

Die reproduzierbare lokale Performance-Abnahme startet den lokalen
Supabase-Stack, baut die E2E-Production-App und misst mit je zehn Läufen einen
wiederkehrenden Browser, einen frischen isolierten Kontext, denselben
persistenten Kontext ohne Service Worker und einen Offline-Kaltstart:

```powershell
npm run performance:measure:local
```

Das Performanceartefakt enthält ausschließlich Laufzeiten, Stapel- und
Outboxanzahl sowie den Service-Worker-Status in
`test-results/performance.json`. Der Lauf misst je zehn Wiederholungen für vier
Startkontexte und einen kontrollierten 4G-Preload-Kontext. Noch vor dem Stoppen
des Supabase-Stacks prüft er zusätzlich den produktionsnahen Statistikpfad mit
100.000 Karten und 1 Mio. logisch aggregierten Reviews. Anschließend werden die
neun Startgates aus dem Artefakt validiert. Dazu gehören null automatische
3G-Preloads, höchstens 50 ms pro automatischem 4G-Preload-Task und p75 höchstens
50 ms für den persistierten Summary-Read. Der Statistik-RPC muss p95 höchstens
1.000 ms, die 100k-Kartensuche höchstens 2.000 ms und die Clientprojektion
höchstens 50 ms benötigen. Das Hintergrundgate verwendet direkt gemessene
Projektions-/Rebuild-Abschnitte und Long Tasks innerhalb der automatischen
Lernen-/Karten-Preloads; sichtbares Dashboard-Rendering wird nicht fälschlich
als Hintergrundarbeit klassifiziert. Der Lauf schließt weder die offene
vollständige 100k-Browserjourney noch Feldmessungen. Ein rotes Laufzeitgate
bleibt rot; ein technisch erfolgreich erzeugtes Artefakt ist noch kein
Freigabenachweis.

Der Production-Build erzwingt weiterhin maximal 300 KiB gzip im initialen Importgraphen und 200 KiB je normalem Lazy-Feature. Zielwerte sind 250 beziehungsweise 150 KiB. Bis echte Feld-p75/p95 vorliegen, wird das Laufzeitartefakt mit Chromium bei ungefähr 1,6 Mbit/s, 150 ms RTT und vierfacher CPU-Verlangsamung erzeugt. Ein fehlendes Messartefakt ist kein bestandener Performance-Nachweis.

Der lokale Production-Build vom 16. August 2026 maß 217,3 KiB gzip für den Initialgraphen und 163,1 KiB für den größten Lazy-Graphen. Damit ist das Initialziel eingehalten; der größte Lazy-Graph liegt zwischen Ziel und hartem Maximum.

Supabase bleibt die Datenplattform, solange die Replica-v2-RPCs p95 höchstens 1 Sekunde benötigen, die Fehlerrate höchstens 0,1 Prozent beträgt, Cursor-Lag im Normalbetrieb unter 5 Sekunden bleibt und der 100k-/1m-Zieltest bei doppelter erwarteter Nutzerlast höchstens 70 Prozent DB-CPU und Connection-Pool belegt. Der normale Delta-Zyklus muss zusätzlich clientseitig p75 höchstens 2 und p95 höchstens 5 Sekunden halten. Zusätzlich müssen freigegebene Unit Economics und Regions-/Sync-Anforderungen erfüllt bleiben. Ein wiederholter Bruch wird zuerst mit Indizes, Query-Plan, RPC und Compute geprüft; danach ist ein eigener Sync-Dienst vor demselben Postgres der erste Plattformschritt, kein sofortiger Datenbankwechsel.

Der 100k-/1m-Statistiknachweis verwendet den produktiven täglichen Rollup mit
genau 1 Mio. logisch aggregierten Reviews. Er belegt Queryzeit, aber nicht die
physische Retention von 1 Mio. Rohereignissen: Das aktuelle Hosted-Volume lief
bei diesem zusätzlichen Kapazitätsversuch voll. Vor einer erwarteten
Rohdatenmenge dieser Größe müssen Volume beziehungsweise Retention festgelegt
und die physische Fixture erneut ausgeführt werden.

### Pre-Release-Reset der hybriden Replica

Der aktuelle Stand besitzt keine Upgrade- oder Backfillkette. `20260817190000_prerelease_replica_v2_baseline.sql` ist die einzige Migration; `verify_schema_v1.sql` ist die einzige zusätzliche SQL-Verifikation. Ein Reset löscht Auth-Konten, Storage-Objekte und fachliche Daten unwiederbringlich und ist ausschließlich für das bestätigte Pre-Release-Projekt zulässig.

1. Vor jeder Remote-Aktion die lokale Link-Konfiguration und die daraus gelesene Supabase-Projekt-Ref sichtbar ausgeben. Die Ref muss mit dem ausdrücklich freigegebenen Wegwerf-/Staging-Projekt übereinstimmen; bei Abweichung abbrechen.
2. Lokal `supabase db reset --local --no-seed`, `npm run db:types:generate`, `npm run db:types:check`, `npm run test:rls:local` und `npm run test:e2e:local` ausführen. Danach die 100k-/1m-Fixture, Performance-Gates und `EXPLAIN (ANALYZE, BUFFERS)` für Bootstrap, Katalog-Delta, Kartenliste, Hydrierung, Manifest, Lernübersicht und Statistik nachweisen.
3. Erst nach vollständig grünen lokalen Gates Sitzungen widerrufen, alle Auth-Benutzer und Objekte im Bucket `core-media` über die jeweiligen Supabase-APIs löschen und anschließend `supabase db reset --linked --no-seed` gegen die nochmals angezeigte Projekt-Ref ausführen.
4. Danach müssen `auth.users`, `storage.objects` und alle fachlichen Tabellen leer sein. Schema-Verify, Typdrift, RLS und Hosted-Smoke werden gegen den leeren Stand erneut ausgeführt. Bestehende Personen registrieren sich neu; es gibt weder Export noch Backfill.
5. Ein App-Rollback stellt gelöschte Daten nicht wieder her. Nach dem ersten extern genutzten Release wird dieser Pre-Release-Ablauf geschlossen und durch einen vorwärtskompatiblen Migrations- und Restorevertrag ersetzt.

## 2. Umgebungen und Secrets

Kanonische Production-URL: `https://core-hosted.vercel.app`.

Erlaubte Supabase-Redirects:

- `https://core-hosted.vercel.app/**`
- `https://*-bengt2.vercel.app/**` ausschließlich für Vercel-Previews
- `http://127.0.0.1:5190/**` lokal

Browser-sichtbar erlaubt sind ausschließlich öffentliche Werte wie `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ENABLE_GOOGLE_AUTH` und `VITE_ENABLE_MAGIC_LINK`. Service-Role-Secrets und `OPENROUTER_API_KEY` bleiben außerhalb des Browsers. Nachweise enthalten keine Werte, Tokens, Passwörter, `.env`-Dateien oder Auth-Screenshots.

### OpenRouter-Schlüssel für Basic-Varianten

- Im OpenRouter-Account wird ein modellagnostischer Schlüssel namens `CoRe` mit Free-only-/Null-Kosten-Schutz angelegt. Ein globaler ZDR-Zwang bleibt aus, weil die Route ihren ausdrücklich sichtbaren kostenlosen Non-ZDR-Fallback selbst steuert.
- In Vercel wird `OPENROUTER_API_KEY` für Production und Preview als sensitive Variable gesetzt. Vercel unterstützt Sensitive nicht für Development; dort wird derselbe Name separat als normal verschlüsselte, für berechtigte Projektmitglieder aber grundsätzlich einsehbare Variable hinterlegt oder lokal über eine ignorierte `.env.local` bereitgestellt. Der Wert wird nur direkt durch die berechtigte Person eingetragen, weder in Chat, Logs noch Nachweise kopiert.
- Ein enges OpenRouter-Key-Limit darf als zusätzlicher Not-Aus dienen. Die eigentliche Free-only-Garantie bleibt die serverseitige Modellauswahl, die kostenpflichtige Modelle und Modelle ohne Texteingabe oder Tool-Unterstützung verwirft.
- Nach Anlage oder Rotation ist ein neues Deployment erforderlich. Geprüft werden nur Variablenname, Umgebungszuordnung und ein authentifizierter Funktionsaufruf mit einer freigegebenen Basic-Testkarte.
- Bei Providerfehlern zuerst OpenRouter-Verfügbarkeit, Free-Limit und Modellauswahl prüfen. Karteninhalte, Bearer und Providerantworten dürfen nicht in Diagnoseausgaben übernommen werden.

## 3. Preview- und Production-Freigabe

### Freigabeumfang

Das Beta-Gate umfasst ausschließlich E-Mail-/Passwort-Auth, die fünf Kernjourneys, Kern-RLS, Sync/Offline/Reconnect/Konflikte und einen kleinen APKG-Import mit realem Medium. Es läuft lokal mit:

```powershell
npm run test:beta
```

Die früheren Variablen `VITE_ENABLE_LABS` und `VITE_ENABLE_SERVER_APKG_IMPORT` haben keine Wirkung. Google und Magic Link bleiben über ihre getrennten Flags schaltbar und sind keine Beta-Core-Abnahmekriterien. APKG über 250 MB besitzt keinen Serverpfad.

### Voraussetzungen

- Der freizugebende Commit und alle verpflichtenden CI-Gates stimmen überein und sind grün.
- Der Working Tree ist sauber.
- Preview und Production enthalten die benötigten Variablennamen; Werte werden nicht ausgelesen.
- Schemaänderungen besitzen einen vorwärtskompatiblen Migrations- und Rückfallplan.
- LCP/INP/CLS, lokaler Workspace-Start, Tabwechsel, 100k-Kartenseite, Lernstart, Reviewpersistenz und Delta-Sync halten die Performance-Gates aus [`specs.md`](specs.md#performance). Kein großer Stapel wird im Start-, Listen- oder Lernstartpfad vollständig materialisiert.

### Hosted-Core-Smoke

Der automatisierte Hosted-Smoke verwendet ausschließlich einen dedizierten, löschbaren Testaccount. Er darf dessen Produktdaten und Storage-Objekte zurücksetzen. Die folgenden Variablennamen werden lokal oder als geschützte CI-Secrets gesetzt; ihre Werte werden nie protokolliert oder in Nachweise kopiert:

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

Bei einer Vercel-geschützten Deployment-URL wird der optionale Automation-
Bypass ausschließlich am ersten Hostaufruf als Vercel-Query übergeben und als
Host-Cookie gespeichert. Er darf nicht als globaler Playwright-Header gesetzt
werden, weil dieser auch an Supabase-Fetches gelangen könnte.

Der Lauf deckt die fünf Kernjourneys ab: Login und Cloud-Laden; kleinen APKG-Import; transiente PDF-Hilfe bei Erstellung und Bearbeitung; Review mit Offline-Pending, Reconnect, Save und Reload; KI-Variante mit Reveal, Grundkarte und Feedback. Zusätzlich prüft er APKG-Medien in DB und privatem Storage sowie einen accountgebundenen Konfliktstatus. Er prüft weder Google/Magic Link noch Dateien über 250 MB.

Der Smoke läuft zuerst gegen die Preview-URL und danach gegen die mit `--skip-domain` bereitgestellte staged Production. Ein fehlgeschlagener Core-Schritt stoppt die Freigabe. Nach einer Korrektur beginnt die Abnahme mit einem neuen Deployment wieder bei Preview.

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

Vor der Promotion läuft `npm run test:beta:hosted` gegen die staged Production. Nach der Promotion werden gegen die kanonische URL Login, Cloud-Laden, ein Review mit Save/Reload und Abmeldung wiederholt; der dedizierte Testaccount darf dabei keine offenen Pending- oder Konfliktzustände zurücklassen.

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

Der ausgefüllte Nachweis wird datiert in [`history.md`](history.md) abgelegt, nicht in der Produktspezifikation.

## 4. Rollback

Rollback-Trigger sind insbesondere 5xx-Fehler, nicht funktionierender Login, fehlendes Cloud-Laden oder -Speichern, falsche Umgebung, Secret-Leaks oder unbenutzbare Kernnavigation.

```powershell
vercel logs --environment production --status-code 5xx --since 30m
vercel rollback <previous-production-url>
vercel rollback status
vercel logs --environment production --status-code 5xx --since 5m
```

Das Rückfallziel wird immer dem Nachweis des letzten erfolgreichen Releases entnommen. Ein Vercel-Rollback wechselt nur den App-Build; Supabase-Daten und Migrationen werden nicht zurückgesetzt. Danach Login, Cloud-Laden und Abmeldung prüfen und Grund, Zeit, fehlerhaftes sowie wiederhergestelltes Deployment protokollieren.

## 5. Auth-Abnahme

Hosted Auth wird in dieser Reihenfolge geprüft:

1. Site URL und Redirect-Allowlist nach Dashboard-Reload lesen.
2. SMTP-Zustellung und deutsche Templates prüfen.
3. SPF, DKIM, Return-Path und DMARC prüfen.
4. Mit einer neuen, nicht persönlichen Adresse Registrierung, Bestätigung und Login prüfen.
5. Recovery anfordern, neues Passwort setzen, abmelden und mit dem neuen Passwort erneut anmelden; das alte Passwort und ein wiederverwendeter Link müssen scheitern.
6. Google und Magic Link nur bei expliziter separater Freigabe vollständig roundtrippen. Andernfalls müssen beide Schalter leer und die Einstiege unsichtbar bleiben.
7. Security Advisor und Leaked-Password-Protection prüfen.

Lokal bleibt Google deaktiviert. Lifecycle-Tests dürfen lokale Secrets nur im privilegierten Node-Prozess halten; Vite und Playwright erhalten keine Service Role.

## 6. Datenbank, RLS und Restore

Bei Schemaänderungen gelten die Gates aus `AGENTS.md`:

```powershell
npm run db:types:check
npm run test:rls:local
npm run test:e2e:local
```

`supabase/verify_schema_v1.sql` prüft Struktur, RLS, Policies, Grants, Constraints und Buckets. Restore-Proben für Datenbank und Storage bleiben getrennt und werden erst nach dokumentiertem Ergebnis als bestanden gewertet.

### Irreversibler Labs-/Groß-APKG-Rückbau

**Ausführungsstatus:** Für das aktuelle CoRe-Produktionsprojekt wurde dieser Ablauf am 1. August 2026 vollständig abgeschlossen und verifiziert. Er darf nicht erneut als regulärer Deployschritt ausgeführt werden. Die folgenden Schritte bleiben als Audit- und Wiederanlaufreferenz erhalten; der konkrete Nachweis steht in [`history.md`](history.md#2026-08-01--labs--und-gro%C3%9F-apkg-vorleistungen-zur%C3%BCckgebaut).

Dieser Ablauf darf ausschließlich gegen das verifizierte CoRe-Produktionsprojekt ausgeführt werden. Das aktuell anderweitig verbundene Projekt `smarter-nutrition` ist kein zulässiges Ziel.

1. Zuerst die neue Anwendung deployen und prüfen, dass ausgemusterte `/api/ai/*`-Routen außer `/api/ai/card-variant` sowie `/api/imports/apkg` `404` liefern und keine Labs-/Server-APKG-Schreibvorgänge mehr entstehen.
2. Aktive Trigger- und APKG-Jobs ausschließen. Die CoRe-Projekt-Ref aus der verifizierten Vercel-Production-Konfiguration ermitteln und gegen die Supabase-URL prüfen.
3. Vor der Migration ausschließlich IDs und Storage-Pfade der zu löschenden Daten in ein unversioniertes Manifest unter `test-results/` schreiben. Das Manifest enthält keine Nutzdaten oder Objektbytes und ist kein Backup.
4. Löschzahlen und Projekt-Ref im Vier-Augen-Prinzip bestätigen, dann `20260801103920_retire_labs_and_server_apkg.sql` anwenden.
5. `SUPABASE_URL` und `SUPABASE_SECRET_KEY` für exakt dieses Projekt setzen und den Storage-Rückbau mit derselben Projekt-Ref bestätigen:

   ```powershell
   npm run storage:retire-labs -- test-results/<manifest>.json --confirm-project-ref <core-project-ref>
   ```

   Das Skript entfernt manifestierte, nicht mehr referenzierte Objekte aus `core-media`, leert `core-imports` über die Storage-API und löscht danach den Bucket. Direkte Deletes in `storage.objects` oder `storage.buckets` sind verboten.
6. Tabellen-/Spaltenabwesenheit, Quellen-Constraints, Bucket-Abwesenheit und Löschzahlen prüfen. Danach Trigger.dev-Konfiguration, dedizierte KI-/Upstash-Ressourcen und ihre Secrets außerhalb des Repositories entfernen.
7. Supabase Security- und Performance-Advisors prüfen und Ergebnis ohne Dateninhalte in [`history.md`](history.md) protokollieren.

Ein Vercel-Rollback stellt die gelöschten Daten nicht wieder her. Für diesen ausdrücklich irreversiblen Rückbau wird kein Daten- oder Objektbackup erstellt.

### DB-Restore-Probe im Testprojekt

1. Ein ausschließlich dafür bestimmtes Testprojekt und einen Zeitpunkt vor einer markierten Testmutation verwenden.
2. Datenbankbackup beziehungsweise PITR in das Testprojekt wiederherstellen; Production bleibt unverändert.
3. Schema-Verify, Kern-RLS, Testaccount-Login und Readback der markierten Rows ausführen.
4. Erwarteten Datenverlustzeitraum, Dauer, Projekt-ID und Ergebnis ohne Row-Inhalte dokumentieren.

Ein Datenbankbackup enthält nur Storage-Metadaten, nicht die Objektbytes. Eine bestandene DB-Probe ist deshalb kein Storage-Restore-Nachweis.

### Storage-Restore-Probe im Testprojekt

1. Ein kleines Testobjekt samt SHA-1, Größe und zugehöriger DB-Referenz in einem privaten Testbucket markieren.
2. Objektbytes und Metadaten über den freigegebenen Storage-Backupweg in den Testbucket zurückspielen; keine Production-Pfade überschreiben.
3. Größe und Hash prüfen, anschließend Signed URL und accountgebundene Lesbarkeit mit Kern-RLS verifizieren.
4. Fehlende, zusätzliche und nicht referenzierte Objekte getrennt dokumentieren; kein Orphan-Delete ausführen.

DB und Storage erhalten getrennte Ergebnisse. Die Beta-Freigabe ist blockiert, solange eine der beiden Proben fehlt oder die Zuordnung von DB-Referenz zu Objekt nicht verstanden ist.

## 7. Monitoring und Alarmweg

Der minimale Beta-Betriebsweg nutzt die bestehenden Vercel- und Supabase-Ansichten sowie den Hosted-Core-Smoke; es wird kein zusätzlicher Telemetrieanbieter eingeführt.

| Kernsignal | Prüfung | Alarmgrenze | Erste Reaktion |
| --- | --- | --- | --- |
| Login | Hosted-Login plus Supabase-Auth-Logs | ein Smoke-Fehler oder mindestens drei Auth-5xx in 15 Minuten | Promotion stoppen; Auth-Status und Redirects prüfen |
| Laden/Speichern | Cloud-Laden, Mutation, Save/Reload und Supabase-API-Logs | ein Datenverlust-/Ownership-Fehler oder drei aufeinanderfolgende Save-Fehler | Schreibzugriffe stoppen; RLS, Revision und Outbox prüfen |
| Review | Bewertung, Cloud-Readback und Reload | verlorenes/doppeltes Review Event oder Pending ohne Reconnect | Release blockieren beziehungsweise zurückrollen |
| Import | kleiner APKG-Import mit Medium und Storage-Readback | Importabbruch, fehlende Referenz, fehlendes Objekt oder falsche Ownership | Importfreigabe stoppen; DB und Storage getrennt prüfen |
| Serverfehler | Vercel Runtime Logs | jeder reproduzierbare 5xx im Core-Smoke oder mindestens drei 5xx in 15 Minuten | fehlerhaftes Deployment isolieren und Rollback entscheiden |

Vor Promotion und 30 Minuten danach werden Vercel-5xx sowie Supabase Auth/DB/Storage geprüft. Der Alarm geht an die im Projekt hinterlegten Owner; die verantwortliche Person eröffnet einen secretsfreien Incident-Nachweis mit Umgebung, Zeitfenster, Release-ID und betroffenem Kernsignal. Tokens, E-Mail-Adressen, Nutzerinhalte und Auth-URLs werden nicht übernommen.

## 8. Störungen

- Login: Auth-Status, Redirect-Konfiguration und Supabase-Verfügbarkeit prüfen; keine Tokens loggen.
- Sync: lokale Pending-Anzeige, Netzstatus, Konflikte und Repository-Readback prüfen; keine Nutzerinhalte in Tickets kopieren.
- Medien: DB-Referenz und Storage-Objekt getrennt prüfen; keine vorschnelle Orphan-Löschung.
- Datenverlust: Schreibzugriffe stoppen, betroffene Account- und Zeitgrenze sichern und Restore erst in einem Testprojekt prüfen.

Solange die beiden Restore-Proben und der reale Alarmempfang nicht in [`history.md`](history.md) nachgewiesen sind, bleiben diese operativen Abnahmen offen.
