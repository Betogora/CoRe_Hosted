# CoRe-Verlauf

Stand: 2026-11-12

Diese Datei hält zwei Dinge fest, die Git nicht abbildet:

1. **Betriebsnachweise:** was außerhalb des Repositorys auf Production und der
   gehosteten Datenbank passiert ist – Releases mit Deployment-ID, Hosted-Smokes,
   Migrationen auf dem Supabase-Projekt, irreversible Löschungen, Restore-Proben.
   Daraus liest der [Rollback](operations.md#4-rollback) das letzte gute Release,
   und nur hier ist ersichtlich, welcher Schemastand remote angewandt ist.
2. **Meilensteine:** die großen Entwicklungsschritte in einer Zeile je Schritt.

Details, Prüfläufe und Messwerte einzelner Arbeiten stehen in Commit- und
Pull-Request-Beschreibungen. Kein Eintrag definiert heutiges Verhalten; das steht
in [`specs.md`](specs.md) und [`status.md`](status.md).

**Pflege:** Ein Betriebsnachweis wird direkt nach jedem Release, Hosted-Smoke,
Remote-Schemaschritt, Reset oder Restore oben in die Tabelle eingetragen (Vorlage
in [`operations.md`](operations.md#nachweisvorlage)), ohne Secrets, Tokens oder
personenbezogene Daten. Ein Meilenstein kommt nur für einen neuen Produktbereich,
einen Modell- oder Plattformwechsel oder einen großen Umbau dazu.

## Betriebsnachweise

Neueste zuerst. Projekt `hirbiuiydczmnjqtoyqx` ist `CoRe-Database`.

| Datum | Art | Nachweis |
| --- | --- | --- |
| 2026-11-11 | Migration, Release | `20261110130000_kartenverwaltung` (Kartenverwaltung 2.0, ADR-048) per `supabase db push` nach Probelauf; `verify_schema_v1.sql` grün. Unmittelbar danach PR #91 gemergt, Production-Deployment von `d663436` erfolgreich. Hosted-Smoke ausgelassen (Entscheidung des Nutzers); `gate:nightly` auf `d663436`: bekannte Fehler und zwei neue Befunde (Editor-Modus beim Breitenwechsel, Datumsspalte), behoben im folgenden Restposten-PR. |
| 2026-11-02 | Migration | `20261102102620_originallayout_vorlagen_sync` per `supabase db push` nach Probelauf; `verify_schema_v1.sql` grün. |
| 2026-10-30 | Hosted-Smoke | `test:beta:hosted` gegen `https://core-hosted.vercel.app`, Production-Deployment von `7663022` (PR #52): 10/10. **Letzter bestätigter Production-Stand.** |
| 2026-10-30 | Migration | `migration repair --status reverted` für die zwölf Versionen `20261008101057`–`20261030004024`; Baseline `20261030103636` angewandt, danach `20261030180000_karteneditor_v2`; `supabase db diff --linked` leer. |
| 2026-10-30 | Migration | Statistik-Migrationen `20261030004024` und `…_account_statistics_single_pass` (später in die Baseline gefaltet). |
| 2026-10-30 | Irreversibel | Lokale Sicherungen der Lernstand-Neuberechnung gelöscht. |
| 2026-10-29 | Migration, Datenkorrektur | `20261029120000_card_study_states_stability_fast`, Verify grün; Lernstände von 185 Karten mit FSRS-7 nachgerechnet, Skript danach entfernt. |
| 2026-10-25 | Migration | Prüfungsprofil-Formate `20261024153629` und `20261025192248`. |
| 2026-10-17/19 | Migration | `learning_summaries` (Verify grün) und `learning_mind_maps`. |
| 2026-10-13 | Migration | Prüfungsplanung per `db push --linked`. |
| 2026-10-12 | Production-Smoke | KI-Varianten auf `core-hosted.vercel.app` mit E2E-Testkonto: 3/3, Neugenerierung nach Fix `3e346bd` ok. |
| 2026-10-10 | Release, Migration | Production `42d4cbd`, Hosted-Smoke 10/10; Migration `20261010093049`, Variantenspalten nach Deploy `3feb6cd` entfernt. |
| 2026-10-09 | Hosted-Smoke | Production 9/10 (`1f138cd`), 10/10 (`2e7527f`), K5-Smoke 10/10 (`bcd4b04`). |
| 2026-10-08/09 | Reset, irreversibel | Remote-Reset: Konten, Sitzungen, 213 Storage-Objekte und alle Tabelleninhalte gelöscht; Migrationshistorie auf `20261008101057`. |
| 2026-10-08 | Release | Production `d29cc99` (Cutover Note/Card, PR #9), CI grün. |
| 2026-08-18 | Reset, Smoke | Projekt mit frischer Baseline neu aufgebaut (zuvor gelöscht: 5 Konten, 108 Storage-Objekte, 51 Stapel, 551 Karten, 7.561 Reviews). Hosted-Fixture 100k Karten / 1 Mio. logische Reviews gemessen; 1 Mio. physische `review_events` überschritten das Volume und wurden zurückgerollt. Staged Production `dpl_Daropk4PSerq8wzKUmS8iSPxzST8`: Smoke mit 9 Kernverträgen bestanden, keine Promotion; danach erneut zurückgesetzt, Verify und DB-Lint grün. |
| 2026-08-01 | Rückbau, irreversibel | Labs- und Groß-APKG-Daten entfernt (`20260801103920_retire_labs_and_server_apkg.sql`, Storage-Bucket `core-imports` gelöscht), ohne Backup; Advisors geprüft. |
| 2026-07-10 | Release | Erstes Production-Release `e600ac4`: kanonisch `dpl_CCF8hGMt236krS8CdPW5W9G1yWM9`, Preview `dpl_ADcYAJBLJWcZ9mu2cMJPeMAyCMGG`, vorher `dpl_3HhXHhqRiL6dSqpRALwDc6dXuBYP`. Preview-, staged- und Production-Smoke bestanden, kein 5xx; Redirect-Allowlist bestätigt. |

Noch nie nachgewiesen: DB-Restore-Probe, Storage-Restore-Probe, realer Alarmempfang.

## Meilensteine

### November 2026

- **2026-11-01–02** — ToolBox-Designsprache vervollständigt: einheitliche Radien, `ColorPicker`, ein `FileDropField`, schlanker UI-Katalog.
- **2026-11-02** — Originallayout importierter Karten: Anki-Template und -CSS ohne Script, Vorlagen-Sync auf alle Geräte (ADR-047).
- **2026-11-02** — Lernmodus: gezeigte Karte bleibt bis zur Bewertung, die nächsten drei Karten werden vorgeladen.
- **2026-11-02** — Testsuite verschlankt: parallele Katalogflows ohne Supabase, gezielte Browserläufe nach Änderung.
- **2026-11-02–04** — Stapeldarstellung neu: Tageszahlen in Statusfarbe, Unterstapel im Listendesign, Kacheln ohne Aktionsleiste.
- **2026-11-03–04** — Zusammenfassung: Werkzeugleiste im Notiz-App-Muster, Belege als ausklappbare Fußnoten.
- **2026-11-04** — Navigation: `Karten` als eigener Hauptreiter, Statistik als Icon; Karteneditor mit einheitlichen Panels.
- **2026-11-04–07** — Einstellungen als Dialog: Bereichs-Sidebar statt zweier Seiten, kastenlose Zeilen, Wochenrhythmus als Tabelle, gemeinsames Zahlenfeld; Stapeleinstellungen als eigener Dialog über Ansicht oder Sitzung, die Seite `stapel-einstellungen` entfällt.
- **2026-11-04–11** — Kartenverwaltung 2.0 nach Ankis Browser: lokale Suche mit Anki-Syntax über den ganzen Katalog, flache virtualisierte Liste, Massenaktionen mit Rückgängig, Suchen und Ersetzen, Treffer lernen, Duplikate, Tags verwalten, Editor neben der Liste (ADR-048); dazu gestuftes Vorladen und ein Startgraph ohne Realtime.
- **2026-11-11–12** — Architekturumbau ohne Verhaltensänderung: `App.tsx` als Shell (2.487 auf 536 Zeilen) mit Workspace-Store, Befehlsmodulen und einer Verdrahtung je Bildschirm; lokales Repository in sechs Modulen, typisierte Sync-Grenze, Modulgrenzen und sinkende Obergrenzen im Typecheck. Dazu Sync-Schreibpfad in einer Transaktion je Seite, vorbereitete Antwortseite in der Lernansicht und lokale Feldwerte (ADR-050).

### Oktober 2026

- **2026-10-01–05** — Design-Tokens vereinheitlicht; gemeinsame HTML-Doku mit UI-Katalog aus echten Komponenten.
- **2026-10-06–08** — Kartenmodell `Note`/`Card`: Inhalt einmal, jede Abfrage eine eigene Karte mit Lernstand; APKG-Formatmatrix, Übersetzer-Registry, neuer Renderer, Cutover mit neuer Datenbank-Baseline (ADR-032).
- **2026-10-08–09** — Bildmasken wie in Anki; Image Occlusion Enhanced als CoRe-Masken; eigener Masken-Editor.
- **2026-10-09** — Gestaltungsstil nach Vorbild der BengtsToolBox (später durch ADR-046 vervollständigt).
- **2026-10-10** — Begraben von Geschwisterkarten wie in Anki; CoRe-Modus An/Aus je Stapel (ADR-039); automatische Neuübersetzung unbearbeiteter Importe.
- **2026-10-12** — KI-Varianten über GPT-6 Luna mit Zero-Data-Retention, Stapelgenerierung bis 50 Karten.
- **2026-10-12** — Stapel-UI überarbeitet: Gruppen, Kacheln, Stapelinhalte mit Reitern (ADR-041).
- **2026-10-12–25** — Prüfungsplaner als eigener Hauptbereich: Einrichtung, Themen, Kalender, Tagesaufgaben, Planung nach FSRS-Kontakten und relativer Lernzeit (ADR-042).
- **2026-10-13–17** — Zusammenfassungen und Mindmaps je Stapel, KI-erzeugt, online gespeichert und versioniert (ADR-043).
- **2026-10-18** — Robuster Umgang mit Modulladefehlern nach Deployments.
- **2026-10-21** — Desktop-Navigation als schwebende Top-Bar.
- **2026-10-28–30** — Dritter Erstellungsweg „Karten aus einer Quelle“ bis zur Auftragsprüfung.
- **2026-10-28–31** — Heute-Seite als anpassbares Dashboard mit Widgets, Lerntimer, To-dos, Motivationsimpuls und Gehirn-Maskottchen.
- **2026-10-29–30** — FSRS-7 und Reife aus der Haltbarkeit statt XP, mit Datenbank-Cutover (ADR-044).
- **2026-10-30** — Karteneditor V2: Tags, Flaggen und Lernbremse wie in Anki, Editor als Dialog mit Lernkurve (ADR-045).
- **2026-10-30** — 13 Migrationen zu einer Schemabaseline zusammengefasst.
- **2026-10-31** — Vollständige ToolBox-Designsprache für alle Screens (ADR-046); Quality-Gate parallelisiert.

### September 2026

- **2026-09-30** — Gleitende Hauptnavigation.

### August 2026

- **2026-08-01** — Labs, KI-Chat, KI-Jobs und serverseitiger APKG-Import vollständig entfernt; Fokus auf den Lernkern (ADR-001).
- **2026-08-03** — FSRS als Scheduler (zunächst FSRS-6) und Hilfeseite zur Lernlogik.
- **2026-08-04–05** — KI-Kartenvarianten über OpenRouter und Kartenverwaltung im Anki-Stil.
- **2026-08-06** — Statistik nach Anki-Vorbild auf indizierter Projektion; app-weiter Zeitsimulator.
- **2026-08-10** — Anki-nahe Tagesqueue mit Vorziehen; globaler Pomodoro-Timer.
- **2026-08-11** — Globale und stapelspezifische Einstellungen mit Lernprofilen, hierarchischen Tageslimits und Easy Days (ADR-018, ADR-019).
- **2026-08-12–13** — Erhaltender Anki-Import im Worker, gehärtet bis 25.000 Karten.
- **2026-08-14** — Synchronisation 2.0 mit einem Sync-Zyklus und Konfliktauflösung je Entität.
- **2026-08-15–18** — Local-first-Start mit hybrider Offline-Replica, adaptiven Preloads und reproduzierbarer Startmessung (ADR-034).
- **2026-08-28–29** — Unbegrenzte Stapelhierarchie mit echten Elternbeziehungen, auch beim Import.

### Juni und Juli 2026

- **2026-06-27–07-01** — Projektstart: Vite, React, Tailwind; erste Kartenerstellung, Lernfluss und Supabase-Schema.
- **2026-07-06–08** — APKG-Import, Stapelhierarchie mit Drag-and-drop, Rich-Text-Karten, erste Statistik.
- **2026-07-09–12** — Pflichtlogin, Cloud-Speicherung mit RLS, Offline-Outbox und geräteübergreifender Sync.
- **2026-07-10** — Erstes Production-Release auf Vercel.
- **2026-07-13–14** — TypeScript-Migration der Kernmodule; Medien in privatem Storage mit TUS-Uploads.
- **2026-07-15–16** — Beta-Core-Gate; Lernen und Kartenverwaltung getrennt; Batch-Erstellung.
