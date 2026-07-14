# AGENTS.md

This file is the compact repository entrypoint for coding agents. It defines
project-specific sources of truth, architecture boundaries, and validation
requirements. General working agreements are inherited from the global
`AGENTS.md`.

## Local Development

- Use `npm run dev` for local development.
- The default local URL is `http://127.0.0.1:5190/`.
- Use port `5190` unless the task explicitly requires another port.

## Canonical Documentation

Use `docs/index.md` when the relevant source of truth is unclear. Read only the
documents and sections required for the current task.

- `docs/specs.md`: canonical product behavior, acceptance criteria, domain
  contracts, architecture, security, and operational behavior.
- `docs/specs.html`: generated visual mirror of `docs/specs.md`; do not treat it
  as a separate authoring source.
- `docs/anki-format-analysis.md`: Anki/APKG, templates, media, and Learning Item
  behavior.
- `docs/todo.md`: open scope, priorities, planning status, and evidence. It
  provides context, not permission to implement adjacent roadmap items.
- `docs/file-naming-conventions.md`: naming rules for new or renamed files; read
  it before making such changes.
- `supabase/`: schema anchors, migrations, policies, and verification SQL.

For targeted navigation in `docs/specs.md`:

- use sections 14 and 27 for module ownership, interfaces, and import rules;
- use section 19 for open decision context and section 25 for established
  product decisions;
- search for the affected behavior or acceptance criteria first, and expand
  reading only as needed for broader changes.

No dedicated ADR directory currently exists. Relevant decisions live in
`docs/specs.md` and, where applicable, the domain analyses.

## Repository Boundaries

- `src/App.tsx` is the app shell and orchestrates the current UI screens.
  Product UI lives in `src/screens/`; domain logic belongs in focused modules
  rather than React callers.
- `src/coreTypes.ts` is the canonical type source for normalized Deck, Learning
  Item, Card Variant, and Review State forms.
- Keep unvalidated external payloads typed as `unknown` until the owning module
  validates or normalizes them.
- `src/coreModel.ts` is the only public core-model seam for Learning Item
  creation and normalization. New manual, import, and AI paths must use these
  helpers.
- Deck `cards` remains the local compatibility collection for Learning Items.
  Each item must have exactly one original variant, and every other variant
  must remain anchored to it.
- `src/apkgImport.ts` is the public APKG import and normalization seam. Keep
  worker, protocol, ZIP, and SQLite details private in
  `src/apkgImportWorker.ts`, `src/apkgImportWorkerProtocol.ts`,
  `src/zipReader.ts`, and `src/sqliteReader.ts`; do not expose them to React
  callers.
- `src/mediaStore.ts` is the public account-scoped media seam for the local
  cache, persistent queue, and URL resolution. `src/cloudMediaStore.ts` owns
  Supabase Storage, signed URLs, and TUS details. React consumes only resolved
  URLs and media status.
- `src/database.types.ts` is generated output. Never edit it manually.
- Keep validation schemas with the module that owns the trust boundary: cloud
  row and JSONB validation in `src/cloudRepositoryValidation.ts`, and AI chat
  request/response validation in `src/aiChatContract.ts`. Do not create a
  central mega-schema for unrelated trust boundaries.

## Product And Data Invariants

- Preserve existing visible screens, controls, features, and flows unless their
  removal or replacement is explicitly part of the task.
- Preserve user-edited card fronts and backs during APKG reimport. Reimport may
  update import metadata and media references but must not silently overwrite
  local content edits.
- Parser failures from an active APKG worker must remain visible. Do not hide
  them through a silent direct-parser retry.
- Keep AI provider credentials server-only. `/api/ai/*` routes may read them
  only from `process.env`.
- Never introduce `VITE_*` AI credentials, secret-dependent provider SDK calls
  in the browser, or secret persistence in `localStorage` or exports.
- Never log raw secrets. Log raw prompts or payloads only when they are
  explicitly sanitized and operationally required.

## Architecture Guidance

- Prefer small, testable interfaces and deep modules that hide their own data
  shaping, validation, and fallback behavior.
- Keep React callers focused on UI orchestration; parsing, persistence, and
  compatibility logic stay in their owning modules.
- Do not introduce an adapter or architectural seam for only one current
  implementation.
- New abstractions must preserve the ownership boundaries in `docs/specs.md`.
  Verify the applicable ownership and import rules before moving behavior
  between modules.
- Before database changes, inspect the existing schema anchors, migrations,
  policies, and verification SQL.

## UI Copy

- Write user-facing UI copy, status messages, error messages, and AI prompts in
  German.
- Use proper Unicode spelling, including `ä`, `ö`, `ü`, `Ä`, `Ö`, `Ü`, and `ß`;
  `ae`, `oe`, `ue`, and `ss` are not substitutes in user-facing German text.
- Keep ASCII where required for technical identifiers, routes, enum values,
  JSON fields, import formats, and external API or schema names.

## Documentation

Update documentation when the implemented contract changes:

- Update the relevant section of `docs/specs.md` when product behavior,
  acceptance criteria, public interfaces, security behavior, or architecture
  changes; then synchronize `docs/specs.html`.
- Update `docs/todo.md` only when roadmap scope, priority, status, planning, or
  completion evidence changes. Add new roadmap work there; do not create
  competing TODO files.
- Do not update documentation for implementation details that do not alter a
  documented contract.
- Do not shorten canonical documents merely because they are long.

## Testing And Validation

Choose checks proportionate to the affected area.

### Focused Validation

- Run the relevant focused tests, and add or update them for requested behavior
  or credible regression risks.
- This applies especially to scheduler/review behavior, variants and
  normalization, APKG/templates/media, AI jobs and chat contracts,
  graph/community behavior, cloud repository behavior, and Learning Item
  creation.
- Tests live beside the affected modules in `src/**/*.test.{ts,tsx}` unless the
  existing structure already establishes another location such as `api/` or
  `tests/rls/`.

### Standard Gate

For ordinary implementation changes:

1. run focused tests for the affected behavior;
2. run `npm run typecheck`;
3. run `npm run build` when production compilation or bundling could be
   affected.

Run the complete `npm test` suite when a change is cross-cutting, affects shared
domain behavior or several feature areas, lacks sufficient coverage from
focused tests, or is part of a release or repository-wide verification.

### Database Validation

When Supabase schema, generated database types, RLS behavior, or schema-adjacent
tooling changes:

- run `npm run db:types:generate` with local Supabase when generated types must
  be updated;
- run `npm run db:types:check` as a read-only drift check;
- run `npm run test:rls:local`;
- run `npm run test:e2e:local` when browser and database integration are
  affected.

`npm run test:e2e:local` already includes the database-type drift gate. Do not
add redundant custom drift checks without a demonstrated need.

## Completion Check

Before handing off a change, verify that:

- repository ownership boundaries remain intact and generated files were not
  edited manually;
- visible behavior was not removed unintentionally;
- canonical documentation was updated only when its contract changed;
- focused and broader checks match the actual risk;
- the diff contains no unnecessary helpers, wrappers, guards, branches,
  comments, or compatibility paths.
