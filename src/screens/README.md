# UI Screen Modules

`src/App.jsx` owns app orchestration only: workspace state, navigation, study-mode routing, and persistence callbacks.

Each exported screen in this folder is a UI module with a small props interface. Keep screen-specific panels private in the same file when they are only used by that screen. Move shared presentational pieces to `src/ui/`; move domain behavior to the existing deep modules such as `coreWorkspace.js`, `creationWorkflow.js`, `reviewService.js`, `coreVariantService.js`, `apkgImport.js`, and `mediaStore.js`.

## Screen Map

- `DashboardScreen.jsx`: dashboard metrics, active decks and study heatmap.
- `DecksScreen.jsx`: deck library, filtering, CoRe mode controls, card editor and variant prompt UI, opened from the Learn header.
- `CreationScreen.jsx`: APKG import, pasted import, manual creation and AI draft creation panels.
- `LearnScreen.jsx`: review session entry points.
- `StudyMode.jsx`: fullscreen review, shortcut handling, grading and variant feedback.
- `GraphScreen.jsx`: deck graph generation and SVG projection.
- `CommunityScreen.jsx`: local community creation, sharing and deck copy actions.
- `AssistantScreen.jsx`: Chat-your-Deck and learning plan UI, currently not exposed as a main tab.
- `AiJobsScreen.jsx`: local AI job ledger, currently not exposed as a main tab.
- `SettingsScreen.jsx`: profile, local auth placeholders, privacy and data portability.

## Design Rules

- Do not add backend, provider, or persistence adapters in screen files.
- Do not spread APKG, media, scheduler, variant, or Learning Item invariants into React callers.
- Keep new screen interfaces narrow: pass callbacks from `App.jsx`, let `coreWorkspace.js` and the domain modules hide update details.
- Update this map when adding, renaming, or moving screens so future agent work starts in the right module.
