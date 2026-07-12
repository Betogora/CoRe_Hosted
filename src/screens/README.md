# UI Screen Modules

Stand: 2026-07-10

`src/App.jsx` owns app orchestration only: Supabase session boot, account-scoped workspace state, navigation, study-mode routing, SyncEngine-backed autosave and persistence callbacks. Auth phase and sync status wording live in `src/accountSession.js`; cloud persistence and conflict behavior stay in `src/syncEngine.js` and `src/cloudRepository.js`.

Each exported screen in this folder is a UI module with a small props interface. Keep screen-specific panels private in the same file when they are only used by that screen. Move shared presentational pieces to `src/ui/`; move domain behavior to the existing deep modules such as `coreWorkspace.js`, `creationWorkflow.js`, `reviewService.js`, `coreVariantService.js`, `apkgImport.js`, and `mediaStore.js`.

## Screen Map

- `DashboardScreen.jsx`: dashboard metrics, active decks and responsive keyboard-navigable study heatmap.
- `AuthGateScreen.jsx`: required Supabase login, registration, Google start, Magic Link, reset-link request and password-recovery completion before the app shell opens.
- `DecksScreen.jsx`: deck library, filtering, parent/child hierarchy, rename, subdeck creation handoff to Learn, drag-and-drop reparenting, CoRe mode controls, card editor and variant prompt UI; opened from the Learn controls.
- `CreationScreen.jsx`: APKG import, Text/CSV/table paste import, manual creation, PDF/text document mode, Rich Text editing and AI draft creation panels.
- `LearnScreen.jsx`: collapsible deck tree, main/subdeck creation, subtree study entry points, direct row drag-and-drop reparenting, new/due/total counts and per-deck learning-settings entry points.
- `DeckSettingsScreen.jsx`: isolated settings for exactly one deck, using the shared learning-settings panel without exposing the rest of the deck library.
- `StatisticsScreen.jsx`: performance statistics from local review events, including success rate, rating distribution, streaks, recent trend and deck-level weak spots.
- `StudyMode.jsx`: fullscreen review, daily queue, new-card limit, shortcut handling, interval previews, grading, anchor display and variant feedback.
- `GraphScreen.jsx`: deck graph generation and SVG projection.
- `CommunityScreen.jsx`: local community creation, sharing and deck copy actions.
- `AssistantScreen.jsx`: Chat-your-Deck and learning plan UI, opened from the Dashboard secondary action and not exposed as a main tab.
- `AiJobsScreen.jsx`: local AI job ledger, currently not exposed as a main tab.
- `SettingsScreen.jsx`: signed-in profile, sync status, manual sync, sign-out, privacy, global learning defaults including CoRe mode and data portability.
- `SyncConflictPanel.jsx`: accountgebundene Konfliktprojektionen, lokale/Remote-Entscheidung, sicherer Feld-Merge sowie Zurückstellen und Wiederaufnahme ohne Tabellenlogik in React.

## Design Rules

- Do not add backend, provider, or persistence adapters in screen files.
- Do not spread APKG, media, scheduler, variant, or Learning Item invariants into React callers.
- Keep new screen interfaces narrow: pass callbacks from `App.jsx`, let `coreWorkspace.js` and the domain modules hide update details.
- Use `screenConstants.js` for shared screen labels/options, `src/ui/RichTextEditor.jsx` for card editing, `src/ui/cardMedia.jsx` for resolved card media, and `src/ui/coreUi.jsx` for shared presentation primitives.
- Keep main `PageHeader` usage compact: eyebrow plus title only. Do not add tab-level subtitles/third lines or decorative right-side header icons; place real actions as normal controls in the screen content.
- Keep Rich Text, HTML sanitization, import normalization, learning-setting normalization, scheduler intervals and media URL behavior in `richText.js`, `htmlSafety.js`, `importService.js`, `deckSettings.js`, `scheduler.js` and `mediaStore.js`.
- Update this map when adding, renaming, or moving screens so future agent work starts in the right module.
