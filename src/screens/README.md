# UI Screen Modules

Stand: 2026-07-07

`src/App.jsx` owns app orchestration only: workspace state, navigation, study-mode routing, and persistence callbacks.

Each exported screen in this folder is a UI module with a small props interface. Keep screen-specific panels private in the same file when they are only used by that screen. Move shared presentational pieces to `src/ui/`; move domain behavior to the existing deep modules such as `coreWorkspace.js`, `creationWorkflow.js`, `reviewService.js`, `coreVariantService.js`, `apkgImport.js`, and `mediaStore.js`.

## Screen Map

- `DashboardScreen.jsx`: dashboard metrics, active decks and responsive keyboard-navigable study heatmap.
- `DecksScreen.jsx`: deck library, filtering, parent/child hierarchy, rename, manual subdeck creation, CoRe mode controls, card editor and variant prompt UI; opened from the Learn header.
- `CreationScreen.jsx`: APKG import, Text/CSV/table paste import, manual creation, PDF/text document mode, Rich Text editing and AI draft creation panels.
- `LearnScreen.jsx`: collapsible deck tree, subtree study entry points, direct row drag-and-drop reparenting, new/due/total counts and direct deck management buttons.
- `StudyMode.jsx`: fullscreen review, daily queue, new-card limit, shortcut handling, interval previews, grading, anchor display and variant feedback.
- `GraphScreen.jsx`: deck graph generation and SVG projection.
- `CommunityScreen.jsx`: local community creation, sharing and deck copy actions.
- `AssistantScreen.jsx`: Chat-your-Deck and learning plan UI, currently not exposed as a main tab.
- `AiJobsScreen.jsx`: local AI job ledger, currently not exposed as a main tab.
- `SettingsScreen.jsx`: profile, local auth placeholders, privacy, global CoRe mode and data portability.

## Design Rules

- Do not add backend, provider, or persistence adapters in screen files.
- Do not spread APKG, media, scheduler, variant, or Learning Item invariants into React callers.
- Keep new screen interfaces narrow: pass callbacks from `App.jsx`, let `coreWorkspace.js` and the domain modules hide update details.
- Use `screenConstants.js` for shared screen labels/options, `src/ui/RichTextEditor.jsx` for card editing, `src/ui/cardMedia.jsx` for resolved card media, and `src/ui/coreUi.jsx` for shared presentation primitives.
- Keep Rich Text, HTML sanitization, import normalization, scheduler intervals and media URL behavior in `richText.js`, `htmlSafety.js`, `importService.js`, `scheduler.js` and `mediaStore.js`.
- Update this map when adding, renaming, or moving screens so future agent work starts in the right module.
