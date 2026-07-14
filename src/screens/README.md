# UI Screen Modules

Stand: 2026-07-14

`src/App.tsx` owns app orchestration only: Supabase session boot, account-scoped workspace state, navigation, study-mode routing, SyncEngine-backed autosave and persistence callbacks. Auth phase and sync status wording live in `src/accountSession.ts`; cloud persistence and conflict behavior stay in `src/syncEngine.ts` and `src/cloudRepository.ts`.

Each exported screen in this folder is a UI module with a small props interface. Keep screen-specific panels private in the same file when they are only used by that screen. Move shared presentational pieces to `src/ui/`; move domain behavior to the existing deep modules such as `coreWorkspace.ts`, `creationWorkflow.ts`, `reviewService.ts`, `coreVariantService.ts`, `apkgImport.ts`, and `mediaStore.ts`.

## Screen Map

- `DashboardScreen.tsx`: dashboard metrics, active decks and responsive keyboard-navigable study heatmap.
- `AuthGateScreen.tsx`: required Supabase login, registration, Google start, Magic Link, reset-link request and password-recovery completion before the app shell opens.
- `DecksScreen.tsx`: deck library, filtering, parent/child hierarchy, rename, subdeck creation handoff to Learn, drag-and-drop reparenting, CoRe mode controls, card editor and variant prompt UI; opened from the Learn controls.
- `CreationScreen.tsx`: APKG import, Text/CSV/table paste import, manual creation, PDF/text document mode, Rich Text editing and AI draft creation panels.
- `LearnScreen.tsx`: collapsible deck tree, main/subdeck creation, subtree study entry points, direct row drag-and-drop reparenting, new/due/total counts and per-deck learning-settings entry points.
- `DeckSettingsScreen.tsx`: isolated settings for exactly one deck, using the shared learning-settings panel without exposing the rest of the deck library.
- `StatisticsScreen.tsx`: performance statistics from local review events, including success rate, rating distribution, streaks, recent trend and deck-level weak spots.
- `StudyMode.tsx`: fullscreen review, daily queue, new-card limit, shortcut handling, interval previews, grading, anchor display and variant feedback.
- `GraphScreen.tsx`: deck graph generation and SVG projection.
- `CommunityScreen.tsx`: local community creation, sharing and deck copy actions.
- `AssistantScreen.tsx`: Chat-your-Deck and learning plan UI, opened from the Dashboard secondary action and not exposed as a main tab.
- `AiJobsScreen.tsx`: local AI job ledger, currently not exposed as a main tab.
- `SettingsScreen.tsx`: signed-in profile, sync status, manual sync, sign-out, privacy, global learning defaults including CoRe mode and data portability.
- `SyncConflictPanel.tsx`: accountgebundene Konfliktprojektionen, lokale/Remote-Entscheidung, sicherer Feld-Merge sowie Zurückstellen und Wiederaufnahme ohne Tabellenlogik in React.

## Design Rules

- Do not add backend, provider, or persistence adapters in screen files.
- Do not spread APKG, media, scheduler, variant, or Learning Item invariants into React callers.
- Keep new screen interfaces narrow: pass callbacks from `App.tsx`, let `coreWorkspace.ts` and the domain modules hide update details.
- Use `screenConstants.ts` for shared screen labels/options, `src/ui/RichTextEditor.tsx` for card editing, `src/ui/cardMedia.tsx` for resolved card media, and `src/ui/coreUi.tsx` for shared presentation primitives.
- Keep main `PageHeader` usage compact: eyebrow plus title only. Do not add tab-level subtitles/third lines or decorative right-side header icons; place real actions as normal controls in the screen content.
- Keep Rich Text, HTML sanitization, import normalization, learning-setting normalization, scheduler intervals and media URL behavior in `richText.ts`, `htmlSafety.ts`, `importService.ts`, `deckSettings.ts`, `scheduler.ts` and `mediaStore.ts`.
- Update this map when adding, renaming, or moving screens so future agent work starts in the right module.
