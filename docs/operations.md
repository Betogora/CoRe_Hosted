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

Das vollständige lokale Release-Gate ist `npm run test:release`. Datenbanknahe Gates sind in [`test-portfolio.md`](test-portfolio.md) beschrieben.

## 2. Umgebungen und Secrets

Kanonische Production-URL: `https://core-hosted.vercel.app`.

Erlaubte Supabase-Redirects:

- `https://core-hosted.vercel.app/**`
- `https://*-bengt2.vercel.app/**` ausschließlich für Vercel-Previews
- `http://127.0.0.1:5190/**` lokal

Browser-sichtbar erlaubt sind ausschließlich öffentliche Werte wie `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` und Featureflags. Provider-, Service-Role-, Redis- und HMAC-Secrets bleiben serverseitig. Nachweise enthalten keine Werte, Tokens, Passwörter, `.env`-Dateien oder Auth-Screenshots.

## 3. Preview- und Production-Freigabe

### Voraussetzungen

- Der freizugebende Commit und alle verpflichtenden CI-Gates stimmen überein und sind grün.
- Der Working Tree ist sauber.
- Preview und Production enthalten die benötigten Variablennamen; Werte werden nicht ausgelesen.
- Schemaänderungen besitzen einen vorwärtskompatiblen Migrations- und Rückfallplan.
- Externe KI wird nur geprüft, wenn Rate Limit, HMAC-Key und organisatorische Providerfreigaben vorhanden sind.

### Preview-Smoke

1. Preview-URL und tiefen SPA-Link wie `/lernen` öffnen; kein 404, keine Laufzeitfehler, korrekte Release-Information.
2. Mit einem dedizierten, nicht persönlichen Smoke-Account anmelden.
3. Einen bekannten Cloud-Stapel laden.
4. Eine Karte bewerten, erfolgreichen Save abwarten, neu laden und Syncstatus prüfen.
5. Eine kleine APKG-Fixture bis zur Vorschau analysieren; den Import nicht übernehmen.
6. Falls freigegeben, den KI-Chat mit harmloser Frage, Consent, Idempotenz und ohne Secret-/Prompt-Leak prüfen.
7. Den fehlenden Provider-Key über den verpflichtenden Route-Test abdecken; keine gemeinsam genutzte Umgebung dafür mutieren.
8. Abmelden; App-Shell und Cloud-Inhalte dürfen ohne Sitzung nicht sichtbar bleiben.

Ein fehlgeschlagener Schritt stoppt die Freigabe. Nach einer Korrektur beginnt der Smoke mit einem neuen Deployment wieder bei Schritt 1.

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

Vor der Promotion laufen Login, Cloud-Laden, mutationsfreie Navigation und Abmeldung gegen die staged Production. Nach der Promotion wird derselbe Kurzsmoke gegen die kanonische URL wiederholt.

### Nachweisvorlage

```text
Commit / CI-Lauf:
Preview-URL und Deployment-ID:
Angezeigte Version / Umgebung / Kurz-Commit:
Vorherige Production-URL und Deployment-ID:
Staged-Production-URL und Deployment-ID:
Tester / Start / Ende:
Preview-Smoke 1-8:
Production-Kurzsmoke:
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
4. Registrierung, Bestätigung, Login, Recovery und Wiederverwendung verbrauchter Links prüfen.
5. Google und Magic Link nur bei expliziter Freigabe vollständig roundtrippen.
6. Security Advisor und Leaked-Password-Protection prüfen.

Lokal bleibt Google deaktiviert. Lifecycle-Tests dürfen lokale Secrets nur im privilegierten Node-Prozess halten; Vite und Playwright erhalten keine Service Role.

## 6. Datenbank, RLS und Restore

Bei Schemaänderungen gelten die Gates aus `AGENTS.md`:

```powershell
npm run db:types:check
npm run test:rls:local
npm run test:e2e:local
```

`supabase/verify_schema_v1.sql` prüft Struktur, RLS, Policies, Grants, Constraints und Buckets. Restore-Proben für Datenbank und Storage bleiben getrennt und werden erst nach dokumentiertem Ergebnis als bestanden gewertet.

## 7. Störungen

- Login: Auth-Status, Redirect-Konfiguration und Supabase-Verfügbarkeit prüfen; keine Tokens loggen.
- Sync: lokale Pending-Anzeige, Netzstatus, Konflikte und Repository-Readback prüfen; keine Nutzerinhalte in Tickets kopieren.
- Medien: DB-Referenz und Storage-Objekt getrennt prüfen; keine vorschnelle Orphan-Löschung.
- KI: Route, Consent, Rate Limit und Providerstatus prüfen; Prompts und Providerpayloads nicht loggen.
- Datenverlust: Schreibzugriffe stoppen, betroffene Account- und Zeitgrenze sichern und Restore erst in einem Testprojekt prüfen.

Monitoring, Supportweg und Restore-Abnahmen bleiben offene Roadmap-Punkte in [`todo.md`](todo.md).
