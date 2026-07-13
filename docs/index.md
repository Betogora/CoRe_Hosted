# CoRe Documentation

Diese Datei ist die Dokumentationskarte fuer CoRe. Die Root-Ebene bleibt bewusst schlank; `AGENTS.md` bleibt dort, damit Coding-Agenten die Projektregeln automatisch finden.

## Maintained Documentation

- `README.md`: Projektueberblick, lokaler Start, Scripts und Struktur.
- `specs.md`: kanonische Produkt- und Engineering-Spezifikation.
- `specs.html`: generierte HTML-Fassung von `specs.md`.
- `todo.md`: einzige TODO-Markdown-Datei und priorisierter Gap-Backlog vom lokalen MVP zum produktionsfaehigen Produkt.
- `file-naming-conventions.md`: verbindliche, rollenbezogene Dateinamenskonvention und dokumentierter Projekt-Audit.
- `debatable-features.md`: leicht verständliche Entscheidungsliste für potenziell verzichtbare Features; keine automatische Löschfreigabe.
- `anki-format-analysis.md`: Analyse des offiziellen Anki-Datei- und Kartenmodells mit CoRe-Prioritaeten.
- `anki-ecosystem-feature-radar.md`: Recherche zu offiziellem Anki, Forks, Add-ons, Popularitaetssignalen und priorisiertem Feature-Radar fuer CoRe.

## TODO Inventory

Aktuell gibt es genau eine TODO-Markdown-Datei:

- `todo.md`

Es gibt keine weitere `TODO.md`, `todo.md` oder `*-todo.md`-Datei im Repository. Neue offene Arbeit soll in `todo.md` einsortiert werden.

## Technical Anchors Outside Documentation

- `../AGENTS.md`: lokale Entwicklungsregeln, Architekturleitplanken und Verifikationskommandos.
- `../vercel.json`: Vercel-Build, `dist`-Output und SPA-Rewrite ausserhalb von `/api/*`.
- `../vite.config.js`: allowlist-basierter Buildvertrag fuer App-Version, normalisierte Umgebung und kurzen Vercel-/GitHub-Commit.
- `../.env.example`: oeffentliche Browser-Env-Grenzen fuer Supabase und KI-Proxy-Featureflag sowie leere Platzhalter fuer den separaten Playwright-Testaccount.
- `../supabase/core_schema_v1.sql`: aktueller Supabase/Postgres-Schemaanker.
- `../supabase/migrations/20260707081417_core_schema_v1.sql`: angewendete Erst-Migration des Schemaankers.
- `../supabase/migrations/20260709074255_cloud_variant_schema_alignment.sql`: angewendete Schema-Abgleichsmigration fuer Cloud-Varianten, `json-import`-Quellen und entfernte `anon`-Grants.
- `../supabase/migrations/20260709082140_account_scoped_primary_keys.sql`: angewendete Account-Isolationsmigration fuer `(user_id, id)` auf account-owned Tabellen.
- `../supabase/verify_schema_v1.sql`: Verify-Queries fuer RLS- und Policy-Praesenz.

## Production Path Notes

Die Hinweise aus dem externen Hosting-/Database-/KI-Guide wurden am 2026-07-07 in `specs.md` und `todo.md` uebernommen. Der alte Guide soll nicht als zweite Wahrheit weitergefuehrt werden.

Relevante Zielrichtungen:

- Vercel fuer Hosting, Preview/Production, Domain und `/api/*` Functions.
- Das ausfuehrbare Preview-/Production-/Rollback-Runbook liegt in `specs.md` Abschnitt 14.2.2 und gespiegelt in `specs.html`; Release-Nachweise bleiben secretsfrei.
- `https://core-hosted.vercel.app` ist die kanonische Production-URL. Der entschiedene Supabase-Vertrag umfasst diese Site URL sowie `https://core-hosted.vercel.app/**`, `https://*-bengt2.vercel.app/**` nur fuer Previews und `http://127.0.0.1:5190/**` lokal; die Anwendung im Hosted Dashboard und die erste protokollierte Production-Abnahme bleiben offen.
- Login-Gate, Einstellungen und React-Fehlerfallback zeigen dieselbe Release-Information aus Version, Umgebung und kurzem Commit; weitere Env-Werte werden nicht in den Browser uebernommen.
- Supabase Auth + Postgres + RLS als naheliegender Persistenzpfad.
- Echte Tabellen fuer Decks, Learning Items, Varianten, Review Events, Dokumente, Medienreferenzen und AI Jobs statt grossem Store-Blob.
- Aktueller erster Online-Pfad: Pflichtlogin, Supabase E-Mail/Passwort, Profil-Upsert, accountgebundener Browser-Cache und Cloud-first Autosave ueber Tabellen.
- Supabase Storage/Object Storage fuer APKG-Medien, Dokumente und grosse Uploads.
- Eigene KI-Proxy-Routen fuer geheime Provider-Keys; Browser bekommt nur Drafts und nie Secrets.

## Current Local Architecture Notes

- `src/reviewService.js` ist der tiefe Review-Flow fuer FSRS-like Scheduling, Variant-Fallback und Next-Review-Projektionen.
- `src/reviewFlow.js` bleibt nur als Legacy-Fassade fuer bestehende Imports bestehen.
- `src/coreVariantService.js` buendelt Eligibility, Reifegrad, Readiness, Coverage, Variant-Generation-Plan und Fallback-Projektion hinter kleinen Interfaces.
- `src/importService.js` buendelt Text-, CSV-, JSON- und Tabellen-Importe, Fingerprints, Dedupe und Parent-/Hierarchy-Felder hinter der Learning-Item-Creation-Pipeline.
- `src/richText.js` und `src/htmlSafety.js` halten Rich-Text-Normalisierung und HTML-Sanitization aus Screens und Importpfaden heraus.
- `src/libraryModel.js` erzeugt Dashboard-, Statistik-, Decklisten-, Heatmap- und KI-Job-Projektionen fuer die Screens.
- `src/supabaseClient.js`, `src/cloudAuth.js`, `src/accountSession.js`, `src/accountStorage.js` und `src/cloudRepository.js` kapseln den konkreten Supabase-Pfad fuer Auth, Profile, Login-Gate-Zustand, accountgebundenen Cache und Cloud-Tabellenpersistenz.
- `src/appRuntime.js`, `src/ui/ReleaseInfo.jsx` und `src/AppErrorBoundary.jsx` kapseln Release-Identitaet, sichere Anzeige und den deutschen Wiederherstellungsfallback ohne rohe Fehler- oder Nutzerdaten.
- `src/pdfRuntime.js`, `src/pdfSelection.js` und `src/ui/PdfDocumentViewer.jsx` kapseln PDF.js-Lifecycle, Worker, kontinuierliche Anzeige, Zoom, Textauswahl und die Umrechnung in stabile PDF-Quellenkoordinaten.
- `src/App.jsx` ist nur noch App-Shell fuer Workspace-State, Navigation und Routing; authentifizierte Produktscreens laden per `React.lazy`, produktnahe UI liegt in `src/screens/`.
- `scripts/verifyBuildChunks.mjs` prueft das Vite-Manifest nach jedem Production-Build und erzwingt die 500.000-Byte-Grenze fuer JavaScript-Chunks; PDF-Worker und WASM bleiben getrennte Assets.
- `src/screens/README.md` ist die Einstiegskarte fuer KI-Programmierung an Screens; geteilte UI-Bausteine liegen in `src/ui/`.
- Sichtbare Features sollen bei Ueberarbeitungen erhalten bleiben und nur durch explizite Prompts entfernt werden.
