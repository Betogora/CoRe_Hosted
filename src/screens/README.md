# UI Screen Modules

Stand: 2026-08-03

`src/App.tsx` owns app composition, account-scoped workspace state, workspace-command wiring, route selection and persistence callbacks. `authenticatedWorkspaceBoot.ts`, `useAppNavigation.ts`, `appSyncLifecycle.ts` and `appMediaLifecycle.ts` own the corresponding React lifecycle wiring. Auth phase and sync status wording live in `src/accountSession.ts`; cloud persistence and conflict behavior stay in `src/syncEngine.ts` and `src/cloudRepository.ts`.

Each exported screen in this folder is a UI module with a small props interface. Keep screen-specific panels private in the same file when they are only used by that screen. Move shared presentational pieces to `src/ui/`; its available modules and reuse decision are documented in [`../ui/README.md`](../ui/README.md). Move domain behavior to the existing deep modules such as `coreWorkspace.ts`, `creationWorkflow.ts`, `reviewService.ts`, `coreVariantService.ts`, `apkgImport.ts`, and `mediaStore.ts`.

## Screen Map

- `DashboardScreen.tsx`: dashboard metrics, the complete shared deck tree with donut and direct reparenting, and the responsive keyboard-navigable study heatmap.
- `AuthGateScreen.tsx`: required Supabase login, registration, Google start, Magic Link, reset-link request and password-recovery completion before the app shell opens.
- `DecksScreen.tsx`: shared selectable deck tree, filtering, one selected-deck action area with explicit confirmed reparenting, CoRe mode controls, card editor and Core variant controls; opened from the Learn controls.
- `CreationScreen.tsx`: composition and completion state for the creation area; keeps the public screen props and creation workflow wiring stable.
  - `CreationHome.tsx`: manual and import entry cards.
  - `ManualCreationPanel.tsx`: manual cards, Rich Text fields and optional PDF/text source selection.
  - `ImportCreationPanel.tsx`: local import-format selection and composition of the two import panels.
  - `ApkgImportPanel.tsx`: APKG analysis, preview, commit status, media progress and import report presentation.
  - `TextTableImportPanel.tsx`: Text/CSV/table paste preview and import.
- `LearnScreen.tsx`: shared collapsible deck tree, main/subdeck creation, whole-row subtree study entry, direct drag-and-drop reparenting, aggregated new/due/total counts and per-deck learning-settings entry points.
- `DeckSettingsScreen.tsx`: isolated settings for exactly one deck, using the shared learning-settings panel without exposing the rest of the deck library.
- `HelpScreen.tsx`: statische Produktaufklärung zu FSRS, CoRes FSRS-ähnlichem Scheduler und Varianten mit einer zugänglichen, transient interaktiven Lernkurve; keine Workspace- oder Scheduler-Mutation.
- `StatisticsScreen.tsx`: performance statistics from local review events, including success rate, rating distribution, streaks, recent trend and deck-level weak spots.
- `StudyMode.tsx`: fullscreen review, daily queue, new-card limit, shortcut handling, interval previews, grading, anchor display and variant feedback.
- `SettingsScreen.tsx`: task-based Account, Lernen, Daten und Sync, and Erweitert sections with a read-only login email, truthful privacy information, global learning defaults, sync controls, portable JSON download/import, and optional raw JSON diagnostics.
- `SyncConflictPanel.tsx`: accountgebundene Konfliktprojektionen, verständliche Fassungsentscheidung, sicherer Feld-Merge sowie Zurückstellen und Wiederaufnahme ohne Tabellen-, Revisions- oder Gerätedetails in React.

## Design Rules

- Do not add backend, provider, or persistence adapters in screen files.
- Do not spread APKG, media, scheduler, variant, or Learning Item invariants into React callers.
- Keep new screen interfaces narrow: pass callbacks from `App.tsx`, let `coreWorkspace.ts` and the domain modules hide update details.
- Check [`../ui/README.md`](../ui/README.md) before implementing new UI. Reuse a listed module when its interface preserves the feature semantics; otherwise keep the specialized control local and use the same semantic theme, typography, focus and disabled tokens.
- Use `screenConstants.ts` for shared screen labels/options, `src/ui/RichTextEditor.tsx` for card editing, `src/ui/cardMedia.tsx` for resolved card media, and `src/ui/coreUi.tsx` for shared presentation primitives.
- Keep main `PageHeader` usage compact: eyebrow plus title only. Do not add tab-level subtitles/third lines or decorative right-side header icons; place real actions as normal controls in the screen content.
- Keep Rich Text, HTML sanitization, import normalization, learning-setting normalization, scheduler intervals and media URL behavior in `richText.ts`, `htmlSafety.ts`, `importService.ts`, `deckSettings.ts`, `scheduler.ts` and `mediaStore.ts`.
- Update this map when adding, renaming, or moving screens so future agent work starts in the right module.
