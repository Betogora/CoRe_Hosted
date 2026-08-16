# UI Screen Modules

Stand: 2026-08-06

`src/App.tsx` owns app composition, account-scoped workspace state, workspace-command wiring, route selection and persistence callbacks. `authenticatedWorkspaceBoot.ts`, `useAppNavigation.ts`, `appSyncLifecycle.ts` and `appMediaLifecycle.ts` own the corresponding React lifecycle wiring. Auth phase and sync status wording live in `src/accountSession.ts`; cloud persistence and conflict behavior stay in `src/syncEngine.ts` and `src/cloudRepository.ts`.

Each exported screen in this folder is a UI module with a small props interface. Keep screen-specific panels private in the same file when they are only used by that screen. Move shared presentational pieces to `src/ui/`; its available modules and reuse decision are documented in [`../ui/README.md`](../ui/README.md). Move domain behavior to the existing deep modules such as `coreWorkspace.ts`, `creationWorkflow.ts`, `reviewService.ts`, `coreVariantService.ts`, `apkgImport.ts`, and `mediaStore.ts`.

## Screen Map

- `DashboardScreen.tsx`: dashboard metrics, the complete shared deck tree with donut and direct reparenting, and the shared responsive keyboard-navigable study heatmap.
- `AuthGateScreen.tsx`: required Supabase login, registration, Google start, Magic Link, reset-link request and password-recovery completion before the app shell opens.
- `DecksScreen.tsx`: direkt verlinkbare, durchsuchbare und sortierbare Gesamttabelle mit kompakten Stapelköpfen, einzeiligen Kartenzeilen, gemeinsamem Stapelmenü, bestätigt verschiebbaren Stapeln und URL-gesteuertem Detail-`aside` für Editor, Versionen und CoRe-Varianten; erreichbar aus Hauptnavigation und Lernen.
- `CreationScreen.tsx`: composition and completion state for the creation area; keeps the public screen props and creation workflow wiring stable.
  - `CreationHome.tsx`: manual and import entry cards.
  - `ManualCreationPanel.tsx`: manual cards, Rich Text fields and optional PDF/text source selection.
  - `ImportCreationPanel.tsx`: local import-format selection and composition of the two import panels.
  - `ApkgImportPanel.tsx`: APKG analysis, preview, commit status, media progress and import report presentation.
  - `TextTableImportPanel.tsx`: Text/CSV/table paste preview and import.
- `LearnScreen.tsx`: shared collapsible deck tree, main/subdeck creation, whole-row subtree study entry, direct drag-and-drop reparenting, aggregated new/due/total counts and per-deck learning-settings entry points.
- `DeckSettingsScreen.tsx`: drei responsive Bereiche für Stapeldarstellung/-aktionen, Tagesrunde/Lernprofil-Vorlagen und Scheduler/CoRe; ohne fokussierten Stapel zeigt die Route eine `DeckSelect`-Auswahl.
- `HelpScreen.tsx`: statische Produktaufklärung mit kurzem Methoden-Einstieg, lokal scrollgesteuerter Active-Recall-Kartengeschichte und gekoppelter FSRS-Lernkurve; sticky ab Desktopbreite, linear darunter, ohne Workspace- oder Scheduler-Mutation.
- `SimulatorScreen.tsx`: reduzierte Minuten-, Stunden- und Tagessteuerung für die app-weite, transiente Lernuhr; enthält keinen eigenen Stapel und mutiert selbst weder Workspace noch Synczustand.
- `StatisticsScreen.tsx`: global period/deck-filtered analysis from local review events, including overview metrics, charts, the shared sparse study heatmap, FSRS distributions, retention and deck-level weak spots.
- `StudyMode.tsx`: fullscreen review, daily queue, new-card limit, shortcut handling, interval previews, grading, anchor display and variant feedback; verwendet bei aktiver Simulation denselben sichtbaren Lernzeitpunkt wie die App-Shell.
- `SettingsScreen.tsx`: vier globale Bereiche für Konto/Datenschutz, accountweiten Lerntag/Fokus, Daten/Sync und abschließend `Über uns` mit Hilfelink, Rechtstext-Platzhaltern und Versionsnummer. Stapelwerte und Lernprofilverwaltung erscheinen hier ausdrücklich nicht.
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
