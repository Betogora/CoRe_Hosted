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

## Project Navigation

- Start with `Docs/specs.md` before changing features; it contains product scope, acceptance criteria, architecture notes, module map, import rules, assistant/planning context, hosting/database guidance, and current implementation status.
- Use `Docs/todo.md` to understand the current gap between local MVP and production-ready product scope.
- `Docs/specs.html` is the human-readable visual version of `Docs/specs.md` and should carry the same content.
- `Docs/index.md` is the documentation map for the maintained project docs.
- Current UI screens are in `src/App.jsx`; domain behavior belongs in the smaller modules listed in `Docs/specs.md`.
- Add or update module tests in `src/*.test.js` when changing scheduler, variants, import, AI jobs, graph, community, repository behavior, or the Learning Item creation pipeline.
- When current behavior changes, update `Docs/specs.md`, regenerate/update `Docs/specs.html`, and adjust `Docs/todo.md` in the same change.

## Documentation Inventory

- `Docs/specs.md`: canonical product and engineering specification, including the production path for hosting, Supabase/Postgres, Auth, storage, KI proxying, and jobs.
- `Docs/specs.html`: generated, human-readable HTML version of the same spec.
- `Docs/todo.md`: prioritized gap list from local MVP to production readiness.
- `Docs/README.md`: project overview, local start, scripts, and document links.
- `supabase/core_schema_v1.sql`: current Supabase schema anchor for the eventual production persistence layer.
- `supabase/verify_schema_v1.sql`: verification queries for RLS/policy presence.

## Verification

- Run `npm test` and `npm run build` before handing off changes.
