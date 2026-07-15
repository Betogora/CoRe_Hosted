# CoRe-Betrieb und Runbooks

**Rolle:** einzige kanonische Quelle für lokale Betriebsabläufe, Release, Rollback, Wiederherstellung und operative Gates.
**Stand:** 2026-07-15

Zeitgebundene Release-Nachweise stehen in [`history.md`](history.md). Produktanforderungen und Roadmap stehen nicht in diesem Dokument.

## 1. Lokale Entwicklung

```powershell
npm install
npm run dev
```

Die lokale URL ist `http://127.0.0.1:5190/`.

Fokussierte Prüfungen laufen zuerst. Die Standard-Gates sind:

```powershell
npm run typecheck
npm run build
```

Das verpflichtende Gate für den freigegebenen Beta-Kern ist `npm run test:beta`. `npm run test:release` prüft zusätzlich Labs-, Heavy- und Großdateipfade, ist aber kein Beta-Freigabekriterium. Datenbanknahe Gates sind in [`test-portfolio.md`](test-portfolio.md) beschrieben.

## 2. Umgebungen und Secrets

Kanonische Production-URL: `https://core-hosted.vercel.app`.

Erlaubte Supabase-Redirects:

- `https://core-hosted.vercel.app/**`
- `https://*-bengt2.vercel.app/**` ausschließlich für Vercel-Previews
- `http://127.0.0.1:5190/**` lokal

Browser-sichtbar erlaubt sind ausschließlich öffentliche Werte wie `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` und Featureflags. Provider-, Service-Role-, Redis- und HMAC-Secrets bleiben serverseitig. Nachweise enthalten keine Werte, Tokens, Passwörter, `.env`-Dateien oder Auth-Screenshots.

## 3. Preview- und Production-Freigabe

### Freigabeumfang

Das Beta-Gate umfasst ausschließlich E-Mail-/Passwort-Auth, die fünf Kernjourneys, Kern-RLS, Sync/Offline/Reconnect/Konflikte, einen kleinen APKG-Import mit realem Medium und den begrenzten Portabilitätsexport. Es läuft lokal mit:

```powershell
npm run test:beta
```

`VITE_ENABLE_LABS`, `VITE_ENABLE_SERVER_APKG_IMPORT`, `VITE_ENABLE_GOOGLE_AUTH` und `VITE_ENABLE_MAGIC_LINK` dürfen dabei nicht aktiviert sein; der lokale Beta-Lauf setzt Labs ausdrücklich auf `false`. Community, Graph, externe KI, Google, Magic Link und der serverseitige APKG-Pfad über 250 MiB sind keine Beta-Abnahmekriterien. Ein Fehler in einem zusätzlichen `heavy-release`-Lauf blockiert die Beta nur, wenn derselbe Fehler auch einen Core-Vertrag betrifft.

### Voraussetzungen

- Der freizugebende Commit und alle verpflichtenden CI-Gates stimmen überein und sind grün.
- Der Working Tree ist sauber.
- Preview und Production enthalten die benötigten Variablennamen; Werte werden nicht ausgelesen.
- Schemaänderungen besitzen einen vorwärtskompatiblen Migrations- und Rückfallplan.
- Externe KI wird nur geprüft, wenn Rate Limit, HMAC-Key und organisatorische Providerfreigaben vorhanden sind.

### Hosted-Core-Smoke

Der automatisierte Hosted-Smoke verwendet ausschließlich einen dedizierten, löschbaren Testaccount. Er darf dessen Produktdaten und Storage-Objekte zurücksetzen. Die folgenden Variablennamen werden lokal oder als geschützte CI-Secrets gesetzt; ihre Werte werden nie protokolliert oder in Nachweise kopiert:

```powershell
$env:CORE_HOSTED_BASE_URL = "https://<deployment>"
$env:VITE_SUPABASE_URL = "<public project URL>"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = "<public publishable key>"
$env:CORE_E2E_EMAIL = "<dedicated smoke account>"
$env:CORE_E2E_PASSWORD = "<secret>"
$env:CORE_E2E_ALLOW_ACCOUNT_RESET = "true"
npm run test:beta:hosted
```

Der Lauf deckt die fünf Kernjourneys ab: Login und Cloud-Laden; kleinen APKG-Import; manuelle PDF-Quelle und Bearbeitung; Review mit Offline-Pending, Reconnect, Save und Reload; Variante mit Reveal, Originalanker und Feedback. Zusätzlich prüft er APKG-Medien in DB und privatem Storage, Portabilitätsgrenzen sowie einen accountgebundenen Konfliktstatus. Er prüft weder Google/Magic Link noch Labs oder den Großdateipfad.

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
Angezeigte Version / Umgebung / Kurz-Commit:
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
- KI: Route, Consent, Rate Limit und Providerstatus prüfen; Prompts und Providerpayloads nicht loggen.
- Datenverlust: Schreibzugriffe stoppen, betroffene Account- und Zeitgrenze sichern und Restore erst in einem Testprojekt prüfen.

Solange die beiden Restore-Proben und der reale Alarmempfang nicht in [`history.md`](history.md) nachgewiesen sind, bleiben diese operativen Abnahmen offen.
