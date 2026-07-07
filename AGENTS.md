# AGENTS.md

## Local Development

- Use `npm run dev` for local hosting.
- The local default URL is `http://127.0.0.1:5190/`.
- Use port `5190` unless the user explicitly requests a different port.

## Architecture

- Keep app logic behind small, testable module interfaces.
- Prefer deep modules: hide data shaping and fallback behavior inside the module instead of spreading it through React callers.
- Do not introduce a seam or adapter unless there are at least two real adapters.
- Treat deck `cards` as the local compatibility collection for Learning Items. New card/import/AI creation paths should go through the helpers in `src/coreModel.js` so every item keeps exactly one original variant and all non-original variants stay anchored.
- Keep APKG handling inside `src/apkgImport.js`; do not spread ZIP, SQLite, or Zstd collection details into React callers.
- Keep local APKG media persistence in `src/mediaStore.js`; React should consume resolved media URLs instead of parsing media manifests itself.
- Preserve local content edits on APKG reimport; update import metadata and media references without replacing user-edited fronts/backs.
- Preserve visible features during overhauls. Structure and logic may be changed freely, but existing user-visible features, screens, controls, and flows should only be removed when the user explicitly asks for that removal.

## UI Copy

- Write German user-facing UI copy, status messages, error messages, and AI prompts with proper Unicode spelling: use `ä`, `ö`, `ü`, `Ä`, `Ö`, `Ü`, and `ß` instead of ASCII fallbacks such as `ae`, `oe`, `ue`, or `ss`.
- Keep ASCII only for technical identifiers, route IDs, enum values, JSON fields, import formats, and external API/schema names.

## Project Navigation

- Start with `docs/specs.md` before changing features; it contains product scope, acceptance criteria, architecture notes, module map, import rules, assistant/planning context, hosting/database guidance, and current implementation status.
- Use `docs/todo.md` to understand the current gap between local MVP and production-ready product scope.
- `docs/specs.html` is the human-readable visual version of `docs/specs.md` and should carry the same content.
- `docs/index.md` is the documentation map for the maintained project docs.
- `docs/todo.md` is the only maintained TODO markdown; add new roadmap work there instead of creating additional TODO files.
- `docs/anki-format-analysis.md` documents Anki/APKG/model differences and should be consulted before changing import, template, media, or Learning Item behavior.
- Current UI screens are in `src/App.jsx`; domain behavior belongs in the smaller modules listed in `docs/specs.md`.
- Add or update module tests in `src/*.test.js` when changing scheduler, variants, import, AI jobs, graph, community, repository behavior, or the Learning Item creation pipeline.
- When current behavior changes, update `docs/specs.md`, regenerate/update `docs/specs.html`, and adjust `docs/todo.md` in the same change.

## Documentation Inventory

- `docs/specs.md`: canonical product and engineering specification, including the production path for hosting, Supabase/Postgres, Auth, storage, KI proxying, and jobs.
- `docs/specs.html`: generated, human-readable HTML version of the same spec.
- `docs/todo.md`: prioritized gap list from local MVP to production readiness.
- `docs/README.md`: project overview, local start, scripts, and document links.
- `docs/anki-format-analysis.md`: Anki format and model differential analysis for import, templates, media, and Learning Item decisions.
- `supabase/core_schema_v1.sql`: current Supabase schema anchor for the eventual production persistence layer.
- `supabase/verify_schema_v1.sql`: verification queries for RLS/policy presence.

## Verification

- Run `npm test` and `npm run build` before handing off changes.
