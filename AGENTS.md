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

Use `docs/README.md` when the relevant source of truth is unclear. Read only the
documents and sections required for the current task.

- `docs/specs.md`: canonical product behavior, core journeys, functional
  requirements, and product acceptance criteria.
- `docs/specs.html`: generated visual mirror of `docs/specs.md`; do not treat it
  as a separate authoring source.
- `docs/index.html`: shared HTML entrypoint, with Specs, Journeys, UI-Elements,
  card types. Project knowledge remains in canonical Markdown. `docs/README.md` owns navigation and upkeep.
- `docs/architecture.md`: canonical current architecture, module ownership,
  invariants, persisted terminology, and implemented APIs; planned changes belong in TODO.
- `docs/status.md`: canonical current implementation status and known gaps.
- `docs/operations.md`: canonical operational gates, runbooks, release,
  rollback, recovery, and incident guidance.
- `docs/decisions.md`: canonical ADRs and durable product/architecture
  decisions.
- `docs/history.md`: canonical completed work, dated verification, release IDs,
  and smoke records.
- `docs/anki-format-analysis.md`: Anki/APKG, templates, media, and Note/Card
  behavior.
- `docs/todo.md`: the only source for open scope, priorities, planning status,
  acceptance gates, and required evidence. It contains no completed work or
  release history and provides context, not permission to implement adjacent
  roadmap items.
- `docs/file-naming-conventions.md`: naming rules for new or renamed files; read
  it before making such changes.
- `supabase/`: schema anchors, migrations, policies, and verification SQL.

For targeted navigation, use `docs/specs.md` for visible behavior,
`docs/architecture.md` for ownership and technical contracts,
`docs/decisions.md` for established decisions, and `docs/todo.md` only for open
scope and gates.

## Repository Boundaries

- `src/App.tsx` is the app shell and orchestrates the current UI screens.
  Product UI lives in `src/screens/`; domain logic belongs in focused modules
  rather than React callers.
- Before adding product UI, inspect `src/ui/README.md` for available theme,
  action, feedback, structure, form, progress, and specialized modules. Reuse
  them when their interface preserves the feature semantics; otherwise keep
  the feature local while still using the canonical semantic theme tokens.
- `src/coreTypes.ts` is the canonical type source for normalized Deck, Note,
  Card, Card Variant, and Review State forms.
- Keep unvalidated external payloads typed as `unknown` until the owning module
  validates or normalizes them.
- `src/coreModel.ts` is the only public core-model seam for creating, changing,
  deleting, restoring and duplicating notes and their cards, for note editor
  values and manual note forms. New manual, import, and AI paths must use these
  helpers; modules under `src/coreModel/` stay private behind it.
- A `Note` owns its content (fields with roles, interaction, tags, media names
  mapped to SHA-1, mark) exactly once; each `Card` owns deck, prompt key,
  status, study state with its own `studyRevision`, and variants. Deck `cards`
  holds loaded cards only, never content copies. Generated variants stay
  anchored to their card and own no independent study state.
- `src/notePresentation.ts` and `src/ui/NoteCardContent.tsx` are the only card
  renderer and host. `src/presentationFrame.ts` owns the shared CSP and media
  URL resolution; never put scripts or interaction state into rendered card
  HTML, and never persist rendered HTML.
- `src/apkgNoteTranslation.ts` (with `readAnkiPackage`) translates Anki
  packages into the import graph; `src/importRetranslation.ts` re-translates
  unedited imports after translator updates.
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
  row and JSONB validation in `src/cloudRepositoryValidation.ts`, and AI card-variant
  request/response validation in `src/aiCardVariantContract.ts`. Do not create a
  central mega-schema for unrelated trust boundaries.

## Product And Data Invariants

- Preserve existing visible screens, controls, features, and flows unless their
  removal or replacement is explicitly part of the task.
- A documented product decision may authorize deliberate feature hiding or
  removal when the task includes that scope; remove obsolete UI, routing,
  state, and tests together without leaving parallel compatibility paths.
- Preserve locally edited notes (`contentRevision` > `importedContentRevision`)
  during APKG reimport and automatic re-translation; study state, suspension,
  mark and deck placement always survive. Re-translation never drops a card
  with study state.
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
- New abstractions must preserve the ownership boundaries in
  `docs/architecture.md`.
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

- All `docs/*.html` files are generated. Update their Markdown or catalog
  sources, run `npm run docs:build`, then `npm run check:docs`. UI work must
  update the actual component demos in `scripts/uiCatalogDemos.tsx` and any
  affected local screen examples in `scripts/uiCatalogPatterns.html`; inspect
  both the catalog and app. Never hand-edit the generated HTML. New exported
  shared UI components require a catalog group and visible demo.

- Update the relevant role source from `docs/README.md`. Product behavior and
  acceptance criteria belong in `docs/specs.md`; then synchronize
  `docs/specs.html`. Architecture and public technical interfaces belong in
  `docs/architecture.md`; operations, decisions, status, and history remain in
  their own canonical files.
- Update `docs/todo.md` only when open roadmap scope, priority, planning,
  acceptance gates, or required evidence changes. Move completed work and
  release evidence to the appropriate status, changelog, or runbook area; do
  not create competing TODO files.
- Do not update documentation for implementation details that do not alter a
  documented contract.
- Do not shorten canonical documents merely because they are long. Structural
  shortening is allowed only when the content is correctly moved to its
  documented owner and all affected links remain valid.

## Testing And Validation

Choose checks proportionate to the affected area.

### Focused Validation

- Run the relevant focused tests, and add or update them for requested behavior
  or credible regression risks.
- This applies especially to scheduler/review behavior, variants and
  normalization, APKG/templates/media, AI jobs and chat contracts,
  graph/community behavior, cloud repository behavior, and note/card
  creation.
- Tests live beside the affected modules in `src/**/*.test.{ts,tsx}` unless the
  existing structure already establishes another location such as `api/` or
  `tests/rls/`.

### Standard Gate

For every visual UI change, run the mandatory viewport matrix and visual
acceptance checks in [`docs/operations.md#visuelle-pflichtmatrix`](docs/operations.md#visuelle-pflichtmatrix)
for the affected screens and states. Shared UI or app-shell changes require
checking every screen that consumes the changed component. Record screenshots,
results, and any unverified cases; type checking and geometry assertions do not
replace visual inspection.

For ordinary implementation changes:

1. run focused tests for the affected behavior;
2. run `npm run typecheck`;
3. run `npm run build` when production compilation or bundling could be
   affected.

`npm run gate:push` is the canonical manual quality gate and combines type
checking, all unit/contract/integration tests with compact output, the production build, and bundle
budgets. Git pushes do not run it automatically because a mixed worktree may
contain changes outside the commit being pushed.

Changes to bootstrap, preload, sync, catalog, statistics, service workers,
dependencies, or chunking, as well as releases, additionally require
`npm run performance:measure:local` before push or release.

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
