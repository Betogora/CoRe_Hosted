# AGENTS.md

## Local Development

- Use `npm run dev` for local hosting.
- The local default URL is `http://127.0.0.1:5190/`.
- Use port `5190` unless the user explicitly requests a different port.

## Architecture

- Keep app logic behind small, testable module interfaces.
- Prefer deep modules: hide data shaping and fallback behavior inside the module instead of spreading it through React callers.
- Do not introduce a seam or adapter unless there are at least two real adapters.
- Treat deck `cards` as the local compatibility collection for Learning Items. New card/import/AI creation paths should go through the helpers in `src/coreModel.ts` so every item keeps exactly one original variant and all non-original variants stay anchored.
- Keep APKG handling inside `src/apkgImport.js`; do not spread ZIP, SQLite, or Zstd collection details into React callers.
- Keep local APKG media persistence in `src/mediaStore.js`; React should consume resolved media URLs instead of parsing media manifests itself.
- Preserve local content edits on APKG reimport; update import metadata and media references without replacing user-edited fronts/backs.
- Preserve visible features during overhauls. Structure and logic may be changed freely, but existing user-visible features, screens, controls, and flows should only be removed when the user explicitly asks for that removal.
- Keep AI provider keys server-only. `/api/ai/*` routes may read `GOOGLE_API_KEY` or other provider secrets only from `process.env`; never introduce `VITE_*` AI keys, browser-side provider SDK calls, localStorage/export persistence for secrets, or logs that contain raw prompts plus secrets.
- Treat `src/coreTypes.ts` as the canonical type source for normalized Deck, Learning Item, Card Variant, and Review State forms. Keep unvalidated external payloads `unknown` until their owning module validates or normalizes them.
- Treat `src/database.types.ts` as generated output. With local Supabase running, use `npm run db:types:generate` to update it and `npm run db:types:check` for a read-only drift check; never edit it manually.

## UI Copy

- Write German user-facing UI copy, status messages, error messages, and AI prompts with proper Unicode spelling: use `ä`, `ö`, `ü`, `Ä`, `Ö`, `Ü`, and `ß` instead of ASCII fallbacks such as `ae`, `oe`, `ue`, or `ss`.
- Keep ASCII only for technical identifiers, route IDs, enum values, JSON fields, import formats, and external API/schema names.

## Project Navigation

- Always read `AGENTS.md` first. It is the compact repository guide and routes to the canonical sources below. Load only the sources and sections relevant to the task; do not read every canonical document in full by default.
- Use headings or targeted search in `docs/specs.md` to locate relevant sections before reading them. Read only the applicable product behavior, acceptance criteria, domain model, API, security, or operational sections. `docs/specs.html` is the generated visual mirror, not an additional agent source.
- For module placement, interfaces, import rules, or architecture changes, read the relevant parts of `docs/specs.md`, especially sections 14 and 27. For Anki/APKG, templates, media, or Learning Item behavior, also read the relevant parts of `docs/anki-format-analysis.md`. For database work, inspect the applicable files under `supabase/`, including schema anchors, migrations, and verification SQL.
- Read `docs/todo.md` only for scope, priority, status, or planning work. Prefer active or open entries; consult completed entries only when checking previous work or evidence. It remains the only maintained TODO markdown.
- No dedicated ADR directory currently exists. When a task touches an existing or hard-to-reverse architectural decision, read the relevant decision material in `docs/specs.md` (especially sections 19 and 25) and any domain analysis such as `docs/anki-format-analysis.md`.
- For broad, repository-wide changes, expand reading to all affected sections and, when necessary, complete documents. Use `docs/index.md` when the correct canonical source is unclear.
- Read `docs/file-naming-conventions.md` before adding or renaming files.
- Current UI screens are in `src/App.jsx`; domain behavior belongs in the smaller modules listed in section 27 of `docs/specs.md`.

## Documentation Updates

- When current behavior or a product contract changes, update the relevant section of `docs/specs.md` and keep `docs/specs.html` synchronized.
- Update `docs/todo.md` only when scope, priority, status, planning, or roadmap evidence changes. Add new roadmap work there instead of creating additional TODO files.
- Do not shorten canonical documents merely because they are long; keep them as structured reference sources.
- Add or update module tests in `src/*.test.{js,jsx,ts,tsx}` when changing scheduler, variants, import, AI jobs, graph, community, repository behavior, or the Learning Item creation pipeline.

## Verification

- Run `npm run typecheck`, `npm test`, and `npm run build` before handing off changes.
- When Supabase types or schema-adjacent tooling changes, also run `npm run test:rls:local`; `npm run test:e2e:local` includes the same database-type drift gate before browser tests.
