# Dateinamenskonventionen

Diese Konvention gilt für neue und umbenannte Dateien im CoRe-Repository. Maßgeblich ist zuerst der vom jeweiligen Werkzeug erwartete Name, danach die Rolle der Datei und erst danach eine allgemeine Schreibweise.

## Priorität

1. Werkzeuggebundene Namen und Pfade bleiben exakt erhalten, zum Beispiel `package.json`, `vite.config.js`, `vercel.json`, `supabase/config.toml` und `.github/workflows/ci.yml`.
2. Reservierte Projektdokumente verwenden ihren etablierten Namen, zum Beispiel `README.md` und `AGENTS.md`.
3. Frei benennbare Dateien folgen der rollenbezogenen Konvention aus der folgenden Tabelle.
4. Dateinamen bleiben aus Gründen der Portabilität ASCII-basiert, auch wenn deutsche Inhalte korrekt mit `ä`, `ö`, `ü` und `ß` geschrieben werden.

## Rollenbezogene Konvention

| Rolle | Muster | Beispiele |
| --- | --- | --- |
| Einzelne React-Komponente | `PascalCase.tsx` als Ziel, während der Migration auch `.jsx` | `DashboardScreen.tsx`, `RichTextEditor.jsx` |
| React-Modus mit eigenem Komponentennamen | `PascalCase.tsx` als Ziel, während der Migration auch `.jsx` | `StudyMode.tsx`, `StudyMode.jsx` |
| JSX-/TSX-Sammlung oder UI-Helfermodul | `camelCase.tsx` als Ziel, während der Migration auch `.jsx` | `coreUi.tsx`, `cardMedia.jsx` |
| Anwendungsmodul | `camelCase.ts` als Ziel, während der Migration auch `.js` | `coreTypes.ts`, `coreModel.ts` |
| JavaScript-Einstieg oder Barrel | etablierter Rollenname | `main.jsx`, `index.js` |
| Generierte TypeScript-Typen | werkzeugüblicher Rollenname | `database.types.ts` |
| Zugeordneter Modultest | `<modul>.test.ts`/`.test.tsx` als Ziel, während der Migration auch `.test.js`/`.test.jsx` | `coreTypes.test.ts`, `coreModel.test.js` |
| Szenario-, Integrations- oder Smoke-Test | `kebab-case.test.ts` oder `kebab-case.spec.ts` als Ziel, während der Migration auch `.js` | `ownership-smoke.test.js`, `auth-gate.spec.js` |
| Test-Setup | `<rolle>.setup.ts` als Ziel, während der Migration auch `.js` | `auth.setup.js` |
| JavaScript-Skript | `camelCase.mjs` | `runLocalE2E.mjs` |
| TypeScript-Skript | `camelCase.ts` | `benchmarkApkgImport.ts` |
| Python-Modul oder -Skript | `snake_case.py` | `create_world_capitals_apkg.py` |
| Freies Markdown-Dokument | `kebab-case.md` | `anki-format-analysis.md` |
| Reserviertes Markdown-Dokument | offizieller Name | `README.md`, `AGENTS.md` |
| Generierte HTML-Fassung | Basisname der Quelle | `specs.md` und `specs.html` |
| Eigenständige HTML-Datei | `kebab-case.html` | `todo-review.html` |
| JSON-Fixture | `kebab-case[.rolle].json` | `world-capitals.source.json` |
| Sonstige Fixture | beschreibendes `kebab-case.ext` | `plain-text-sample.txt`, `pdf-selection.pdf` |
| Freies SQL-Skript | `snake_case.sql` | `core_schema_v1.sql`, `verify_schema_v1.sql` |
| Supabase-Migration | `<timestamp>_<beschreibung>.sql` | `20260709091315_sync_media_auth_operations.sql` |
| Supabase-E-Mail-Template | referenzierter `snake_case.html`-Pfad | `magic_link.html`, `reset_password.html` |
| Freie YAML-Datei | `kebab-case.yaml` | `deployment-preview.yaml` |
| Werkzeuggebundene YAML-Datei | Werkzeugkonvention | `.github/workflows/ci.yml` |
| Asset | beschreibendes `kebab-case.ext` oder etablierter Webname | `core-readme-hero.svg`, `favicon.svg` |

## Entscheidungsregeln

- Der Dateiname einer einzelnen React-Komponente entspricht ihrem exportierten Hauptsymbol. Dateien mit mehreren gleichrangigen UI-Exports dürfen als `camelCase.jsx` benannt sein.
- Fachliche TypeScript- und temporäre JavaScript-Module verwenden `camelCase`, passend zu den importierten Symbolen und zur bestehenden ESM-Codebasis.
- `*.test.{js,jsx,ts,tsx}` bezeichnet Node-Modul-, Integrations- und Smoke-Tests. Browserbasierte Playwright-Szenarien verwenden während der Migration `*.spec.js` und im Zielzustand `*.spec.ts`.
- `src/database.types.ts` ist eine bewusst werkzeugübliche Ausnahme vom allgemeinen `camelCase.ts`-Muster und darf ausschließlich durch den dokumentierten Supabase-CLI-Pfad geändert werden.
- Zusätze wie `.source`, `.expected` oder `.snapshot` stehen bei Datenartefakten direkt vor der eigentlichen Endung.
- Supabase-Migrationen werden mit `supabase migration new <name>` erzeugt. Bereits angewendete Migrationen werden nicht nachträglich umbenannt.
- Supabase-Template-Dateien dürfen nur zusammen mit allen `content_path`-Referenzen umbenannt werden. Ohne fachlichen Grund bleiben die derzeitigen Pfade stabil.
- Versionsstände gehören grundsätzlich in Git oder in den Dokumentinhalt. Ausnahmen sind bewusst versionierte technische Anker wie `core_schema_v1.sql`.
- Vermeiden: Leerzeichen, Umlaute, beliebige Groß-/Kleinschreibung, unklare Namen wie `testdatei.txt` und Statusketten wie `final-neu-v2.md`.

## Projekt-Audit vom 11. Juli 2026

- `testdatei.txt` wurde seiner tatsächlichen Rolle entsprechend nach `tests/fixtures/plain-text-sample.txt` verschoben.
- React-, JavaScript-, Python-, SQL-, Fixture- und Dokumentdateien entsprechen der oben beschriebenen Rollenlogik.
- `StudyMode.jsx` bleibt bestehen: `StudyMode` ist der exportierte Komponentenname und bezeichnet bewusst einen Vollbildmodus statt eines regulären Navigationsscreens.
- `.github/workflows/ci.yml` bleibt bestehen, weil `.yml` für GitHub-Workflows unterstützt wird und der Name bereits Teil der CI-Konfiguration ist.
- Supabase-Migrationen, `config.toml` und die referenzierten E-Mail-Templates bleiben unverändert, damit lokale und bereits angewendete Datenbankpfade stabil bleiben.
- `docs/todo-review.html` ist ein eigenständiger temporärer Review-Bericht und keine generierte Spiegeldatei von `todo.md`; sein rollenbezogener Name bleibt daher bestehen.

## Offizielle Grundlagen

- [React: Komponentennamen beginnen mit einem Großbuchstaben](https://react.dev/learn/your-first-component)
- [Playwright: Standardmuster für `test`- und `spec`-Dateien](https://playwright.dev/docs/test-configuration)
- [PEP 8: Python-Module kurz, kleingeschrieben und bei Bedarf mit Unterstrichen](https://peps.python.org/pep-0008/#package-and-module-names)
- [GitHub: reservierte Community-Dateien und unterstützte Namen](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
- [Supabase: Migrationen als `<timestamp>_<name>.sql`](https://supabase.com/docs/guides/local-development/overview)
- [Supabase: lokale E-Mail-Templates über `content_path`](https://supabase.com/docs/guides/local-development/customizing-email-templates)
- [Vite: `vite.config.js` und `index.html` als etablierte Projektdateien](https://vite.dev/guide/)
