# AGENTS.md

This file is the repository entrypoint for every coding agent (Codex reads it
directly; Claude Code loads it as project instructions). It defines sources of
truth, architecture boundaries, validation requirements, and working
agreements. Anything the repository needs belongs here, not in personal or
tool-specific instruction files.

## Scope

- Implement only what the task requires: no adjacent roadmap items, no
  speculative options, flags, abstractions, or compatibility paths.
- Prefer the smallest safe diff; change or delete existing code rather than
  adding parallel implementations.

## Local Development

- Use `npm run dev` for local development.
- The default local URL is `http://127.0.0.1:5190/`.
- Use port `5190` unless the task explicitly requires another port.

## Canonical Documentation

Use `docs/README.md` when the relevant source of truth is unclear. Read only the
documents and sections required for the current task.

- `docs/specs.md`: canonical product intent per feature (purpose, rules, data
  flows, decisions, deliberate limits), core journeys, and product acceptance
  criteria; no UI detail.
- `docs/specs.html`: generated visual mirror of `docs/specs.md`; do not treat it
  as a separate authoring source.
- `docs/index.html`: shared HTML entrypoint, with Specs, Journeys, UI-Elements,
  card types. Project knowledge remains in canonical Markdown. `docs/README.md` owns navigation and upkeep.
- `docs/architecture.md`: canonical current architecture, module ownership,
  invariants, persisted terminology, and implemented APIs; planned changes belong in TODO.
- `docs/status.md`: canonical current implementation status and known gaps.
- `docs/operations.md`: canonical environments, release, rollback, auth,
  database, restore, and incident runbooks.
- `docs/test-portfolio.md`: canonical test categories, automatic and local
  test runs, the visual acceptance matrix, and performance gates.
- `docs/decisions.md`: canonical ADRs and durable product/architecture
  decisions.
- `docs/ai-eval.md`: canonical layout and ledger format of the AI eval; its
  generated page shows the best measured prompt per request type and all runs
  from `fixtures/ai-eval/ledger.json`.
- `docs/history.md`: operational evidence (releases, hosted smokes, remote
  migrations, restore probes) and short dated milestones; details of completed
  work live in commit and pull-request descriptions.
- `docs/anki-format-analysis.md`: verified external Anki/APKG, template,
  media, and add-on behavior; CoRe's translation lives in `architecture.md`.
- `docs/todo.md`: the only source for open scope, priorities, planning status,
  acceptance gates, and required evidence. It contains no completed work or
  release history and provides context, not permission to implement adjacent
  roadmap items.
- `docs/file-naming-conventions.md`: naming rules for new or renamed files; read
  it before making such changes.
- `supabase/`: schema anchors, migrations, policies, and verification SQL.

For targeted navigation, use `docs/specs.md` for intended behavior and rules,
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
- Read Anki and add-on source code only as a reference; never copy it.
  Real-world decks stay local in `fixtures/apkg/corpus/` and are never committed.

## Working Agreements

- On a work branch, commit, push, and open pull requests without asking, once
  `audit-last-change` has run on the finished diff; stage only your own
  changes. Ask the user before anything lands on `main` (commit, push, or
  merge; `main` deploys production) and before rewriting pushed history.
- Commits and pull requests carry no AI attribution (no agent
  `Co-Authored-By` trailer, no "Generated with" line).
- Create temporary and probe files only in the session scratchpad; none may
  remain in the repository.
- Others work in the same checkout: do not switch branches in the main working
  folder without agreement; read shelved work with `git show <commit>`.
- The local Supabase stack is shared: before local E2E runs or measurements,
  check for migrations from other work and agree before `db reset`.
- Repository skills have their only content source in `.agents/skills/`; the
  same-named `.claude/skills/` entries only point there. A changed
  `description` is updated in both.

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

## Code Comments

- Comment only tool directives, why non-obvious code must stay (external
  formats, platform quirks, races, performance), and what a type cannot say
  (`null`, `false`, absence, units). Everything else goes: restated names, UI
  descriptions, rules from specs or ADRs, work-package IDs.

## UI Copy

- Write user-facing UI copy, status messages, error messages, and AI prompts in
  German.
- Use proper Unicode spelling, including `ä`, `ö`, `ü`, `Ä`, `Ö`, `Ü`, and `ß`;
  `ae`, `oe`, `ue`, and `ss` are not substitutes in user-facing German text.
- Keep ASCII where required for technical identifiers, routes, enum values,
  JSON fields, import formats, and external API or schema names.
- No explanatory subtitles or decorative badges; mark states clearly instead.

## Documentation

Update documentation when the implemented contract changes:

- All `docs/*.html` files are generated. Update their Markdown or catalog
  sources, run `npm run docs:build`, then `npm run check:docs`. UI work must
  update the actual component demos in `scripts/uiCatalogDemos.tsx`; inspect
  both the catalog and app. Never hand-edit the generated HTML. New exported
  shared UI components require a catalog group and visible demo.

- Update the relevant role source from `docs/README.md`. Product behavior and
  acceptance criteria belong in `docs/specs.md`; then synchronize
  `docs/specs.html`. Write specs as purpose, rules, data flows, and decisions
  that would survive a full UI redesign; controls, labels, layout, sizes,
  shortcuts, input devices, and per-view states stay out. The rule, form, and
  diagram blocks are defined in its section „Pflege dieser Datei“.
  Architecture and public technical interfaces belong in
  `docs/architecture.md`; operations, decisions, status, and history remain in
  their own canonical files.
- Change `docs/architecture.md` only when an owner, an invariant, or a public
  interface changes (its section „Pflege dieser Datei“); implementation
  details stay in code, comments, and tests.
- `npm run check:docs` caps the whole-file size of `docs/architecture.md`,
  `docs/specs.md`, and `README.md` with fixed caps (`DOC_LIMITS` in
  `scripts/generateDocs.ts`). Make room by condensing or moving text to its
  owner, not by raising a cap.
- Update `docs/todo.md` only when open roadmap scope, priority, planning,
  acceptance gates, or required evidence changes. Completed work leaves the
  TODO; its details live in commits and pull requests, and only operational
  evidence goes to `docs/history.md`. Parked items under „Später“ stay one or
  two lines until they are scheduled. Do not create competing TODO files.
- Do not update documentation for implementation details that do not alter a
  documented contract.
- Keep documents as short as their contracts allow. When a contract changes,
  replace or delete the text it makes obsolete instead of appending.
- Delete what is obsolete, completed, duplicated in another owner, or
  derivable from code, and condense wording where meaning stays intact.
- Never drop a still-valid contract, decision, or acceptance criterion: move
  it to its owner from `docs/README.md` and keep affected links valid.

## Testing And Validation

Choose checks proportionate to the affected area. `docs/test-portfolio.md` owns
categories, commands, CI jobs, and the visual matrix.

| Change | Before opening or updating the PR | Automatic on the PR |
| --- | --- | --- |
| Any code change | focused tests for the changed behavior; `npm run typecheck` | `quality` runs `npm run gate:push` |
| Browser-visible behavior, schema, RLS | — | `affected-e2e` runs the affected specs and, for `supabase/` or `tests/rls/`, the full RLS suite; shared infrastructure, migrations, app shell, or dependencies escalate to the full suite |
| Visual UI change | [visual matrix](docs/test-portfolio.md#visuelle-pflichtmatrix) with screenshots | — |
| Bootstrap, preload, sync, catalog, statistics, service worker, dependencies, chunking | `gh workflow run weekly-performance.yml --ref <branch>` before merge | — |
| Schema or generated database types | `npm run db:types:generate` with local Supabase | `affected-e2e` checks type drift; add no further drift checks |
| Release commit | — | green `nightly-core` on that commit (daily on `main`, on published releases, or dispatched) |

- `quality`, `catalog-e2e`, and `affected-e2e` are required checks; auto-merge
  waits for them.
- Add or update focused tests for requested behavior and credible regression
  risks, especially scheduler/review behavior, variants and normalization,
  APKG/templates/media, AI jobs and chat contracts, cloud repository behavior,
  and note/card creation. Tests live beside the affected modules in
  `src/**/*.test.{ts,tsx}` unless the existing structure already establishes
  another location such as `api/` or `tests/rls/`.
- Module tests share processes without isolation: restore any global state a
  test sets and never rely on file order.
- Debug a red `affected-e2e` from its artifacts first; reproduce it locally
  with `npm run test:e2e:affected:local` (same selection) only when they do not
  explain it. Do not dispatch `nightly-core` for a branch: `affected-e2e`
  already runs the full suite when the change requires it.
- Visual checks follow the matrix for the affected screens and states; shared
  UI or app-shell changes include every consuming screen. Record screenshots,
  results, and unverified cases; type checking and geometry assertions do not
  replace visual inspection.
- A direct push to `main` skips the PR jobs: run `npm run gate:push` and, for
  browser-visible changes, `npm run test:e2e:catalog` and
  `npm run test:e2e:affected:local` first.

## Completion Check

Before handing off a change, verify that:

- repository ownership boundaries remain intact and generated files were not
  edited manually;
- visible behavior was not removed unintentionally;
- canonical documentation was updated only when its contract changed;
- focused and broader checks match the actual risk;
- the diff contains no unnecessary helpers, wrappers, guards, branches,
  comments, or compatibility paths.
