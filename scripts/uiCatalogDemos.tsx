import { registerAppModuleLoadErrors } from "../src/pwa.ts";
import { CreationActionCard } from "../src/ui/CreationActionCard.tsx";
import { SectionHeader } from "../src/ui/SectionHeader.tsx";
import { MetricRow } from "../src/ui/MetricRow.tsx";
import { Steps } from "../src/ui/Steps.tsx";
import { CoreTabPanel, CoreTabs } from "../src/ui/CoreTabs.tsx";
import { DialogFrame } from "../src/ui/DialogFrame.tsx";
import { CoreWordmark } from "../src/ui/CoreWordmark.tsx";
import { BrainMascot } from "../src/ui/BrainMascot.tsx";
import { DailyMotivationWidget } from "../src/screens/DailyMotivationWidget.tsx";
import React, { useRef, useState } from "react";
import { ArrowUpRight, Ban, BookOpen, ChevronRight, MoreHorizontal, Play, Copy, Eye, FileSpreadsheet, Grid2x2, Highlighter, Home, Info, Layers, List, Pencil, PenLine, Plus, RefreshCw, Save, Settings, Sparkles, Star, Trash2, X, type LucideIcon } from "lucide-react";
import { addCardVariant, addNoteField, cardStudyFromReviewState, type OcclusionMode, createBasicNote, createCoreDeck, createManualNoteContent, createNote, createReviewState, noteBlocks, setNoteTypeIn, type ManualContentKind } from "../src/coreModel.ts";
import type { ExamPlanningSettings, CoreMode, NewReviewOrder, NoteContent, NoteField, OcclusionMask, SavedCardSearch, SyncStatus } from "../src/coreTypes.ts";
import type { CardEditorServices, DecksCardPageRequest } from "../src/appScreenProps.ts";
import type { CardEditorTab } from "../src/appNavigation.ts";
import { NOTE_THEME_COLORS, renderCard, type NotePresentationResult, type NotePresentationTheme } from "../src/notePresentation.ts";
import type { NoteTypeSource } from "../src/apkgImport.ts";
import { NoteLayoutContext, type NoteLayoutSource } from "../src/ui/noteLayoutContext.ts";
import { catalogEntryFromCard } from "../src/workspaceReplica.ts";
import { matchesCardSearch, parseCardSearchQuery } from "../src/cardSearchQuery.ts";
import { createDeckLibraryModel } from "../src/libraryModel.ts";
import { createStudyHeatmapModelFromCounts } from "../src/studyHeatmapModel.ts";
import { createDeckLearningSettingsDraft } from "../src/settingsDraft.ts";
import { createPomodoroTimer, createPomodoroTimerFromSeconds, pausePomodoroTimer, resumePomodoroTimer, type PomodoroTimer } from "../src/pomodoroTimer.ts";
import { ActionButton, CrossLinkButton, IconButton } from "../src/ui/actionUi.tsx";
import { ActionDialog, CardMarkButton, CoreIconSegmentedControl, CoreTag, CoreModeControl, CoreSegmentedControl, CoreSlidingTabs, CoreTriStateControl, EmptyState, OrbIcon, PageHeader, SoftPanel, StatTile, type CoreTriState } from "../src/ui/coreUi.tsx";
import { StatusMessage, useSuccessToast } from "../src/ui/feedbackUi.tsx";
import { createAccountMediaStore, type AccountMediaStore } from "../src/mediaStore.ts";
import { CoreSelect, DeckMultiSelect, DeckSelect } from "../src/ui/selectUi.tsx";
import { CoreTooltip } from "../src/ui/tooltipUi.tsx";
import { CoreDatePicker } from "../src/ui/CoreDatePicker.tsx";
import { CoreCheckbox, CoreCheckboxGroup, CoreRadio, CoreRadioGroup, CoreSlider, CoreSwitch } from "../src/ui/formControls.tsx";
import { FlagDot, FlagPicker } from "../src/ui/flagUi.tsx";
import { TagInput } from "../src/ui/TagInput.tsx";
import { ColorPicker } from "../src/ui/ColorPicker.tsx";
import { FileDropField } from "../src/ui/FileDropField.tsx";
import { SettingsSaveBar } from "../src/ui/SettingsSaveBar.tsx";
import { VariantGenerationBar } from "../src/ui/VariantGenerationBar.tsx";
import { AppNavigation } from "../src/ui/AppNavigation.tsx";
import { WorkspaceStoreContext } from "../src/useWorkspaceStore.ts";
import { createWorkspaceStore } from "../src/workspaceStore.ts";
import { bindFieldTimingsAccount } from "../src/fieldTimings.ts";
import { InPageNavigation } from "../src/ui/InPageNavigation.tsx";
import { DeckAppearanceIcon } from "../src/ui/deckAppearance.tsx";
import { DeckOptionsMenu } from "../src/ui/DeckOptionsMenu.tsx";
import { DeckSummaryHeader, DeckSummaryRow } from "../src/ui/DeckSummaryRow.tsx";
import { DeckTree, type DeckTreeView } from "../src/ui/DeckTree.tsx";
import { DeckSubstacksPanel } from "../src/screens/DeckSubstacksPanel.tsx";
import { DailyReviewProgress } from "../src/ui/DailyReviewProgress.tsx";
import { StudyHeatmap } from "../src/ui/StudyHeatmap.tsx";
import { PomodoroProgress, PomodoroTimerControl } from "../src/ui/pomodoroTimerUi.tsx";
import { LearningSettingsPanel } from "../src/ui/LearningSettingsPanel.tsx";
import { CoreNumberField } from "../src/ui/CoreNumberField.tsx";
import { CardStudyStateControls } from "../src/ui/CardStudyStateControls.tsx";
import { StudySettingsOverlay } from "../src/ui/StudySettingsOverlay.tsx";
import { CardPreviewDialog } from "../src/ui/CardPreviewDialog.tsx";
import { CardPresentationSurface } from "../src/ui/CardPresentationSurface.tsx";
import { CardHtml } from "../src/ui/cardMedia.tsx";
import { RichTextEditor } from "../src/ui/RichTextEditor.tsx";
import { PdfDocumentViewer } from "../src/ui/PdfDocumentViewer.tsx";
import { LearningAreaHeader } from "../src/screens/LearningAreaHeader.tsx";
import { ratingButtons } from "../src/screens/screenConstants.ts";
import { AuthGateScreen } from "../src/screens/AuthGateScreen.tsx";
import { SyncConflictPanel } from "../src/screens/SyncConflictPanel.tsx";
import { StatisticsScreenContent } from "../src/screens/StatisticsScreen.tsx";
import { SimulatorScreen } from "../src/screens/SimulatorScreen.tsx";
import { HelpScreen } from "../src/screens/HelpScreen.tsx";
import { projectStatistics, type StatisticsSelection } from "../src/statisticsModel.ts";
import { getMaturityBand } from "../src/scheduler.ts";
import { createMenuModel } from "../src/menuModel.ts";
import { createCoreRepository } from "../src/coreRepository.ts";
import { getGlobalSchedulerPreferences, withGlobalSchedulerPreferences } from "../src/learningProfiles.ts";
import { withExamDailyTasks } from "../src/examDailyTasks.ts";
import { createExamPlan, normalizeExamPlanningSettings, upsertExamPlan } from "../src/examPlanSettings.ts";
import { createViewRoute, type DeckContentTab } from "../src/appNavigation.ts";
import { DashboardScreen } from "../src/screens/DashboardScreen.tsx";
import { ExamPlanningScreen } from "../src/screens/ExamPlanningScreen.tsx";
import { ExamTopicOrder } from "../src/screens/ExamTopicOrder.tsx";
import { LearnScreen } from "../src/screens/LearnScreen.tsx";
import { CreationScreen } from "../src/screens/CreationScreen.tsx";
import { DecksScreen } from "../src/screens/DecksScreen.tsx";
import { NoteBlockControls } from "../src/ui/NoteBlockControls.tsx";
import { OcclusionEditor } from "../src/ui/OcclusionEditor.tsx";
import { SettingsScreen } from "../src/screens/SettingsScreen.tsx";
import { SettingsDialog } from "../src/screens/SettingsDialog.tsx";
import type { SettingsDraftGuard } from "../src/appScreenProps.ts";
import { settingsContentSection, settingsSectionGroup, type DeckSettingsSection, type GeneralSettingsSection, type LearningSettingsSection, type SettingsSection } from "../src/appNavigation.ts";
import { GlobalCardSettingsScreen } from "../src/screens/GlobalCardSettingsScreen.tsx";
import { DeckSettingsScreen } from "../src/screens/DeckSettingsScreen.tsx";
import { StudyMode } from "../src/screens/StudyMode.tsx";
import { NoteCardContent } from "../src/ui/NoteCardContent.tsx";

import { generatedSummaryHtml, prepareSummaryMaterial, type SummaryGenerationInput, type SummaryGenerationResult } from "../src/aiLearningSummary.ts";
import { AI_LEARNING_SUMMARY_PROMPT_VERSION, type AiLearningSummarySuccess } from "../src/aiLearningSummaryContract.ts";
import { DeckSummariesPanel } from "../src/screens/DeckSummariesPanel.tsx";
import { DeckMindMapsPanel } from "../src/screens/DeckMindMapsPanel.tsx";
import { createLearningSummary, createSummarySettings, loadLearningSummaries, saveLearningSummary } from "../src/learningSummaries.ts";

const today = "2026-10-02";
const imageReference = "a".repeat(40);
const sampleMedia = { [imageReference]: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160" viewBox="0 0 400 160"><rect width="400" height="160" rx="12" fill="#dde3ed"/><path d="M40 130V60l60-35 60 35v70M230 130V45h90v85M210 130h130" fill="none" stroke="#667492" stroke-width="6"/><text x="40" y="150" font-size="14">Lissabon · Beispielbild</text></svg>')}` };
const sampleGraphs = [
  createBasicNote("catalog-world", "Was ist die Hauptstadt von Portugal?", "Lissabon", { createdAt: `${today}T08:00:00Z` }),
  createBasicNote("catalog-world", "Was ist die Hauptstadt von Spanien?", "Madrid", { createdAt: `${today}T08:00:00Z` }),
  createBasicNote("catalog-europe", "Land", "Portugal", { createdAt: `${today}T08:00:00Z` }),
];
const sampleNotes = sampleGraphs.map(({ note }) => note);
const sampleNotesById = new Map(sampleNotes.map((note) => [note.id, note]));
const deck = createCoreDeck({ id: "catalog-world", name: "Welt-Hauptstädte", source: "manual", cards: sampleGraphs.slice(0, 2).flatMap(({ cards }) => cards) });
const childName = "Europa – ein sehr langer Name für schmale Ansichten";
const child = createCoreDeck({ id: "catalog-europe", name: childName, source: "manual", parentDeckId: deck.id, hierarchyPath: [deck.name, childName], cards: sampleGraphs[2].cards });
const sampleDecks = [deck, child, ...["Biologie", "Medizin", "Sprachen", "Geschichte"].map((name, index) => ({ ...deck, id: `catalog-${index}`, parentDeckId: null, name, hierarchyPath: [name], cards: [] }))];
const substackDemoDecks = [...sampleDecks];
const variantStudyGraph = createBasicNote("catalog-variant", "Was ist die Hauptstadt von Portugal?", "Lissabon", { createdAt: `${today}T08:00:00Z` });
// Mature, due and with an odd review count, so the session asks the variant instead of the card.
const variantStudyCard = addCardVariant({ ...variantStudyGraph.cards[0], study: cardStudyFromReviewState(createReviewState({ state: "review", reps: 5, stability: 90, intervalDays: 60, maturityBand: "mature", dueAt: `${today}T06:00:00Z`, lastReviewedAt: "2026-08-03T08:00:00Z", lastRating: "good" })) }, { front: "Welche Stadt ist die Hauptstadt Portugals?", back: "Lissabon" }, `${today}T07:00:00Z`);
const variantStudyDeck = createCoreDeck({ id: "catalog-variant", name: "Welt-Hauptstädte · Varianten", source: "manual", cards: [variantStudyCard] });
// Generated variants are text only; an image reaches them through the card's extra field.
const imageVariantGraph = createNote({ deckId: "catalog-variant-image", createdAt: `${today}T08:00:00Z`, media: { [imageReference]: imageReference }, content: {
  schemaVersion: 1,
  fields: [
    { id: "front", name: "Vorderseite", role: "prompt", html: "Was ist die Hauptstadt von Portugal?" },
    { id: "back", name: "Rückseite", role: "answer", html: "Lissabon" },
    { id: "extra", name: "Zusatz", role: "extra", html: `<img src="${imageReference}" alt="Beispielansicht von Lissabon">` },
  ],
  interaction: { kind: "reveal", prompts: [{ key: "forward", name: "Vorwärts", instruction: "", questionFieldIds: ["front"], answerFieldIds: ["back"], requires: null, typeInFieldId: null }] },
  speech: [],
  tags: [],
} });
const imageVariantDeck = createCoreDeck({ id: "catalog-variant-image", name: "Bildvariante", source: "manual", cards: [addCardVariant({ ...imageVariantGraph.cards[0], study: variantStudyCard.study }, { front: "Welche Stadt ist die Hauptstadt Portugals?", back: "Lissabon" }, `${today}T07:00:00Z`)] });

/** A real, cloud-free account media store holding the sample image, so the session resolves it like in the app. */
function useCatalogMediaStore(enabled: boolean) {
  const [store, setStore] = useState<AccountMediaStore | null>(null);
  React.useEffect(() => {
    if (!enabled || store) return;
    const candidate = createAccountMediaStore({ client: null, supabaseUrl: "", userId: "catalog-media", indexedDB: null });
    void fetch(sampleMedia[imageReference]).then((response) => response.blob()).then(async (blob) => {
      await candidate.cacheMedia([{ sha1: imageReference, name: "lissabon.svg", size: blob.size, mimeType: blob.type, blob }], { queueUpload: false });
      setStore(candidate);
    });
  }, [enabled, store]);
  return store;
}
for (const [index, name] of ["Südeuropa", "Portugal", "Lissabon"].entries()) {
  const parent = index === 0 ? child : substackDemoDecks.at(-1)!;
  substackDemoDecks.push(createCoreDeck({ id: `catalog-substack-${index}`, name, source: "manual", parentDeckId: parent.id, hierarchyPath: [...parent.hierarchyPath, name], cards: [] }));
}

export function Demo({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <article className={`catalog-demo${wide ? " catalog-demo-wide" : ""}`}><h4>{title}</h4><div className="catalog-demo-content">{children}</div></article>;
}

function ActionsDemo({ section }: { section: string }) {
  const toast = useSuccessToast();
  return <>
    {section === "buttons" && <Demo title="ActionButton · Varianten und Zustände">
      <div className="catalog-row">{(["primary", "secondary", "destructive"] as const).map((variant) => <ActionButton key={variant} variant={variant} icon={variant === "destructive" ? Trash2 : Save} onClick={() => toast("Beispielaktion ausgeführt.")}>{variant === "primary" ? "Speichern" : variant === "secondary" ? "Abbrechen" : "Löschen"}</ActionButton>)}</div>
      <div className="catalog-row"><ActionButton variant="primary" disabled>Deaktiviert</ActionButton><ActionButton variant="primary" loading>Wird gespeichert …</ActionButton></div>
    </Demo>}
    {section === "buttons" && <Demo title="CreationActionCard · im Raster mit und ohne Beschreibung"><div className="grid gap-4">
      <div className="catalog-two">{([["Karten selbst erstellen", PenLine], ["Import", FileSpreadsheet]] as const).map(([title, icon]) => <CreationActionCard key={title} title={title} icon={icon} onSelect={() => toast(`${title} gewählt.`)} />)}</div>
      <CreationActionCard title="Anki-Stapel importieren" description="Eine vorhandene APKG-Datei übernehmen." icon={Layers} onSelect={() => toast("Import gewählt.")} />
    </div></Demo>}
    {section === "buttons" && <Demo title="IconButton · normal, destruktiv, destruktiv-dezent und ghost"><div className="catalog-row">{(["secondary", "destructive", "destructive-quiet", "ghost"] as const).map((variant) => <CoreTooltip key={variant} label={variant}><IconButton variant={variant} label={`${variant}: Beispielaktion`} icon={variant.startsWith("destructive") ? Trash2 : Settings} onClick={() => toast("Icon-Aktion ausgeführt.")} /></CoreTooltip>)}</div></Demo>}
    {section === "buttons" && <Demo title="CrossLinkButton"><CrossLinkButton onSelect={() => toast("Querlink gewählt.")}>Alle ansehen</CrossLinkButton></Demo>}
    {section === "tooltips" && <Demo title="CoreTooltip · Text, Wert und Stapel"><div className="catalog-row"><CoreTooltip label="Kurzer Hinweis"><IconButton label="Hinweis anzeigen" icon={Info} /></CoreTooltip><CoreTooltip label="Neu" value="12 Karten" swatchColor="var(--core-learning-status-new)"><span tabIndex={0}>Lernstatus</span></CoreTooltip><CoreTooltip label="Welt-Hauptstädte" deckAppearance={deck.deckSettings.appearance}><span tabIndex={0}>Stapelhinweis</span></CoreTooltip></div></Demo>}
  </>;
}

function BadgesDemo() {
  return <>
    <Demo title="CoreTag · fünf Töne"><div className="catalog-row"><CoreTag tone="neutral">Originalkarte</CoreTag><CoreTag tone="info">Variante</CoreTag><CoreTag tone="warning">1 offen</CoreTag><CoreTag tone="success">Fertig</CoreTag><CoreTag tone="outline">Stand heute</CoreTag></div></Demo>
    <Demo title="CoreTag · Fachfarbe als Punkt"><div className="catalog-row"><CoreTag tone="neutral" dot="var(--core-exam-color-1)">Geografie-Testat</CoreTag><CoreTag tone="neutral" dot="var(--core-exam-color-3)">Anatomie</CoreTag></div></Demo>
  </>;
}

function FoundationsDemo({ section }: { section: string }) {
  return <>
    {section === "surfaces" && <Demo title="SoftPanel"><SoftPanel className="p-6"><p className="core-body text-core-text">Erhöhte Inhaltsfläche mit kanonischem Schatten.</p></SoftPanel></Demo>}
    {section === "headings" && <Demo title="PageHeader"><PageHeader title="Heute lernen" action={<IconButton label="Hinzufügen" icon={Plus} />} /></Demo>}
    {section === "headings" && <Demo title="PageHeader · Begrüßung von Heute und Seitenzustand"><div className="grid gap-6"><PageHeader greeting="Willkommen zurück," title="Noemi!" /><PageHeader title="Simulator" tag={<CoreTag tone="neutral">Nur lokal</CoreTag>} /></div></Demo>}
    {section === "surfaces" && <Demo title="EmptyState"><EmptyState icon={BookOpen} title="Noch keine Karten" body="Erstelle deine erste Karte oder importiere einen Anki-Stapel." action={<ActionButton variant="primary" icon={Plus}>Erste Karte erstellen</ActionButton>} /></Demo>}
    {section === "symbols" && <Demo title="OrbIcon und DeckAppearanceIcon"><div className="catalog-row"><OrbIcon icon={BookOpen} /><DeckAppearanceIcon deck={deck} /></div></Demo>}
    {section === "charts" && <Demo title="StatTile · Standard, kompakt und rahmenlos"><div className="catalog-row items-stretch"><StatTile label="Karten" value="128" hint="In deiner Sammlung" /><StatTile label="Lernzeit" value="24 Min." size="compact" /><StatTile label="Erfolgsrate" value="83,3 %" variant="plain" /></div></Demo>}
    {section === "charts" && <Demo title="MetricRow · mit Statuspunkt und ohne" wide><div className="grid gap-6">
      <MetricRow aria-label="Heute" items={[{ label: "Gelernt", value: 9, dot: "var(--core-learning-progress-completed)" }, { label: "Neu", value: 107, dot: "var(--core-learning-status-new)" }, { label: "Offen", value: 5, dot: "var(--core-learning-status-in-progress)" }, { label: "Fällig", value: 0, dot: "var(--core-learning-status-due)" }]} />
      <MetricRow aria-label="Überblick" items={[{ label: "Reviews", value: "12" }, { label: "Erfolgsrate", value: "83,3 %" }, { label: "Lernzeit", value: "12 Sek." }, { label: "Serie", value: "1 Tag" }]} />
    </div></Demo>}
  </>;
}

const STEP_DEMO_ITEMS = [{ label: "Analysieren" }, { label: "Vorschau" }, { label: "Übernehmen" }, { label: "Cloud" }, { label: "Medien" }, { label: "Fertig" }];
const TAB_DEMO_ITEMS = [{ value: "substacks", label: "Unterstapel" }, { value: "summaries", label: "Zusammenfassungen" }, { value: "quiz", label: "Quiz" }, { value: "mindmap", label: "Mind Map" }, { value: "cards", label: "Karten" }, { value: "source", label: "Quelle" }] as const;

function StructureDemo({ section }: { section: string }) {
  const [planStep, setPlanStep] = useState(1);
  const [tab, setTab] = useState<(typeof TAB_DEMO_ITEMS)[number]["value"]>("cards");
  const [view, setView] = useState("list");
  const [dialog, setDialog] = useState<"s" | "m" | "l" | null>(null);
  const [dialogTab, setDialogTab] = useState<"content" | "study">("content");
  const toast = useSuccessToast();
  return <>
    {section === "struktur" && <Demo title="SectionHeader · mit Zähler und Aktionen, daneben ohne" wide><div className="catalog-two">
      <SoftPanel className="p-5"><SectionHeader level={3} title="Aktive Stapel" count={8} action={<><CrossLinkButton onSelect={() => toast("Alle eingeklappt.")}>Alle einklappen</CrossLinkButton><CoreIconSegmentedControl ariaLabel="Stapelansicht" value={view} options={[{ value: "tiles", label: "Als Kacheln anzeigen", icon: Grid2x2 }, { value: "list", label: "Als Liste anzeigen", icon: List }]} onValueChange={setView} /></>} /></SoftPanel>
      <SoftPanel className="p-5"><SectionHeader level={3} title="Lernaktivität" action={<IconButton variant="ghost" label="Statistik öffnen" icon={ArrowUpRight} />} /><p className="core-body text-core-secondary">Gleiche Höhe und Grundlinie wie der Kopf daneben.</p></SoftPanel>
    </div></Demo>}
    {section === "struktur" && <Demo title="Steps · auswählbar, gestreckt und laufend" wide><div className="grid gap-6">
      <Steps ariaLabel="Schritte der Prüfungsplanung" items={[{ label: "Prüfung" }, { label: "Lernstoff" }, { label: "Lernzeit", disabled: planStep < 1 }, { label: "Dein Plan", disabled: planStep < 2 }]} current={planStep} onSelect={setPlanStep} />
      <Steps ariaLabel="Importstatus" items={STEP_DEMO_ITEMS} current={2} stretch animated />
      <Steps ariaLabel="Import fehlgeschlagen" items={STEP_DEMO_ITEMS.map((item, index) => index === 3 ? { ...item, failed: true } : item)} current={3} stretch />
    </div></Demo>}
    {section === "struktur" && <Demo title="CoreTabs und CoreTabPanel" wide><CoreTabs ariaLabel="Stapelinhalte" tabs={TAB_DEMO_ITEMS} value={tab} onValueChange={setTab} panelId="catalog-deck-content" /><CoreTabPanel panelId="catalog-deck-content" value={tab} className="pt-4 core-body text-core-secondary">Inhalt des Reiters {TAB_DEMO_ITEMS.find((item) => item.value === tab)?.label}.</CoreTabPanel></Demo>}
    {section === "dialogs" && <Demo title="DialogFrame · s, m mit Reitern, l"><div className="catalog-row">{(["s", "m", "l"] as const).map((size) => <ActionButton key={size} variant="secondary" onClick={() => setDialog(size)}>{`Dialog ${size.toUpperCase()} öffnen`}</ActionButton>)}</div>
      <DialogFrame open={dialog !== null} size={dialog ?? "m"} title={dialog === "m" ? "Karte bearbeiten" : "Tags verwalten"} onClose={() => setDialog(null)}
        tabs={dialog === "m" ? <CoreTabs ariaLabel="Bereiche" tabs={[{ value: "content", label: "Inhalt" }, { value: "study", label: "Lernen" }]} value={dialogTab} onValueChange={setDialogTab} panelId="catalog-dialog-panel" /> : undefined}
        footer={<><ActionButton variant="secondary" onClick={() => setDialog(null)}>Abbrechen</ActionButton><ActionButton variant="primary" onClick={() => { setDialog(null); toast("Beispiel gespeichert."); }}>Speichern</ActionButton></>}>
        {dialog === "m" ? <CoreTabPanel panelId="catalog-dialog-panel" value={dialogTab} className="core-body text-core-text">{dialogTab === "content" ? "Felder der Karte." : "Lernstand der Karte."}</CoreTabPanel> : <ul className="core-settings-list">{["geo", "hauptstaedte", "europa", "afrika"].map((tag, index) => <li key={tag} className="flex min-h-12 items-center justify-between gap-3 core-body"><span className="font-medium text-core-text">{tag}</span><span className="text-core-muted">{`${(index + 1) * 13} Karten`}</span></li>)}</ul>}
      </DialogFrame>
    </Demo>}
  </>;
}

function ControlsDemo({ section }: { section: string }) {
  const [tab, setTab] = useState("front");
  const [iconView, setIconView] = useState<DeckTreeView>("tiles");
  const [marked, setMarked] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [due, setDue] = useState<CoreTriState>("in");
  const [again, setAgain] = useState<CoreTriState>("");
  const [leech, setLeech] = useState<CoreTriState>("out");
  const options = [{ value: "front", label: "Vorderseite", icon: BookOpen }, { value: "back", label: "Rückseite", icon: Layers }];
  return <>
    {section === "segments" && <Demo title="CoreSegmentedControl"><CoreSegmentedControl ariaLabel="Kartenseite" value={tab} options={options} onValueChange={setTab} /></Demo>}
    {section === "segments" && <Demo title="CoreIconSegmentedControl"><CoreIconSegmentedControl ariaLabel="Stapelansicht" value={iconView} options={[{ value: "tiles", label: "Als Kacheln anzeigen", icon: Grid2x2 }, { value: "list", label: "Als Liste anzeigen", icon: List }]} onValueChange={setIconView} /></Demo>}
    {section === "segments" && <Demo title="CoreSlidingTabs"><CoreSlidingTabs ariaLabel="Vorschautabs" value={tab} options={options} onValueChange={setTab} /></Demo>}
    {section === "segments" && <Demo title="CoreTriStateControl"><CoreTriStateControl label="Fällig" value={due} onValueChange={setDue} /><CoreTriStateControl label="Heute gelernt" value={again} onValueChange={setAgain} /><CoreTriStateControl label="Lernbremse" value={leech} onValueChange={setLeech} /></Demo>}
    {section === "buttons" && <Demo title="CardMarkButton und CardStudyStateControls"><CardMarkButton marked={marked} onMarkedChange={setMarked} /><CardStudyStateControls marked={marked} suspended={suspended} onMarkedChange={setMarked} onSuspendedChange={setSuspended} /></Demo>}
  </>;
}

function ChoiceControlsDemo() {
  const [mode, setMode] = useState<CoreMode>("on");
  const [states, setStates] = useState({ plain: false, checked: true, described: true, invalid: false });
  const [forms, setForms] = useState<Array<"basic" | "cloze" | "single" | "multiple">>(["basic", "cloze"]);
  const [extra, setExtra] = useState(false);
  const [day, setDay] = useState<"normal" | "reduced" | "minimum">("normal");
  const [switches, setSwitches] = useState({ small: false, medium: true, large: false, start: true, described: false });
  const [retention, setRetention] = useState(90);
  const [opacity, setOpacity] = useState(40);
  const someForms = forms.length > 0 && forms.length < 4;
  return <>
    <Demo title="CoreCheckbox · Zustände">
      <div className="grid">
        <CoreCheckbox label="Nicht ausgewählt" checked={states.plain} onCheckedChange={(plain) => setStates({ ...states, plain })} />
        <CoreCheckbox label="Ausgewählt" checked={states.checked} onCheckedChange={(checked) => setStates({ ...states, checked })} />
        <CoreCheckbox label="Alle Kartenformate" checked={forms.length === 4} indeterminate={someForms} onCheckedChange={(checked) => setForms(checked ? ["basic", "cloze", "single", "multiple"] : [])} />
        <CoreCheckbox label="Beispiele aufnehmen" description="Nur Beispiele aus dem eigenen Material." checked={states.described} onCheckedChange={(described) => setStates({ ...states, described })} />
        <CoreCheckbox label="Ungültig" invalid checked={states.invalid} onCheckedChange={(invalid) => setStates({ ...states, invalid })} />
        <CoreCheckbox label="Deaktiviert" disabled checked={false} />
        <CoreCheckbox label="Deaktiviert und ausgewählt" disabled checked />
        <div className="catalog-row"><CoreCheckbox aria-label="Ohne sichtbare Beschriftung" checked={states.plain} onCheckedChange={(plain) => setStates({ ...states, plain })} /><CoreCheckbox aria-label="In Prüfungsfarbe" accent={{ fill: "var(--core-exam-color-3)", on: "var(--core-exam-on-color)" }} checked /></div>
      </div>
    </Demo>
    <Demo title="CoreCheckboxGroup">
      <CoreCheckboxGroup label="Welche Kartenformate möchtest du?" description="Mindestens ein Format." value={forms} onValueChange={setForms} options={[{ value: "basic", label: "Frage–Antwort" }, { value: "cloze", label: "Lückentext" }, { value: "single", label: "Single Choice" }, { value: "multiple", label: "Multiple Choice", disabled: true }]} errorMessage={forms.length ? undefined : "Wähle mindestens ein Kartenformat."} />
    </Demo>
    <Demo title="CoreRadio und CoreRadioGroup">
      <div className="grid gap-4">
        <CoreRadioGroup label="Ergänzungen der KI" value={extra} onValueChange={setExtra} options={[{ value: false, label: "Nur meine Quelle verwenden" }, { value: true, label: "Ergänzungen erlauben und kennzeichnen", description: "Ergänzungen werden deutlich markiert." }]} />
        <CoreRadioGroup label="Montag" orientation="horizontal" value={day} onValueChange={setDay} options={[{ value: "normal", label: "Normal" }, { value: "reduced", label: "Weniger" }, { value: "minimum", label: "Minimum", disabled: true }]} />
        <CoreRadioGroup label="Ungültig" value={day} onValueChange={setDay} errorMessage="Bitte eine Stufe wählen." options={[{ value: "normal", label: "Normal" }, { value: "reduced", label: "Weniger" }]} />
        <div className="catalog-row" role="radiogroup" aria-label="Dienstag">{(["normal", "reduced", "minimum"] as const).map((level) => <CoreRadio key={level} name="catalog-radio-tuesday" aria-label={`Dienstag: ${level}`} checked={day === level} onCheckedChange={() => setDay(level)} />)}</div>
      </div>
    </Demo>
    <Demo title="CoreSwitch · Größen, Beschriftung und Zustände">
      <div className="grid">
        <CoreSwitch size="sm" label="Klein" checked={switches.small} onCheckedChange={(small) => setSwitches({ ...switches, small })} />
        <CoreSwitch label="Mittel (Standard)" checked={switches.medium} onCheckedChange={(medium) => setSwitches({ ...switches, medium })} />
        <CoreSwitch size="lg" label="Groß" checked={switches.large} onCheckedChange={(large) => setSwitches({ ...switches, large })} />
        <CoreSwitch labelPlacement="start" label="Beschriftung vorne" checked={switches.start} onCheckedChange={(start) => setSwitches({ ...switches, start })} />
        <CoreSwitch label="Varianten einbeziehen" description="Umformulierte Karten zählen zum Plan." checked={switches.described} onCheckedChange={(described) => setSwitches({ ...switches, described })} />
        <CoreSwitch label="Deaktiviert" disabled checked={false} />
        <CoreSwitch label="Deaktiviert und an" disabled checked />
      </div>
    </Demo>
    <Demo title="CoreModeControl"><CoreModeControl value={mode} onChange={setMode} /></Demo>
    <Demo title="CoreSlider · Label, Wert und Zustände">
      <div className="grid gap-6">
        <CoreSlider label="Gewünschte Erinnerungsrate" min={70} max={99} value={retention} formatValue={(value) => `${value} %`} onValueChange={setRetention} />
        <CoreSlider aria-label="Transparenz" min={0} max={100} step={5} value={opacity} formatValue={null} onValueChange={setOpacity} />
        <CoreSlider label="Deaktiviert" disabled min={0} max={100} value={30} onValueChange={() => undefined} />
      </div>
    </Demo>
  </>;
}

function FormsDemo({ section }: { section: string }) {
  const [value, setValue] = useState("reviews-first");
  const [deckId, setDeckId] = useState(deck.id);
  const [scope, setScope] = useState<"all" | string[]>([deck.id]);
  const [date, setDate] = useState(today);
  const [fileName, setFileName] = useState("");
  const [learnAhead, setLearnAhead] = useState(20);
  return <>
    {section === "forms" && <Demo title="CoreSelect"><CoreSelect ariaLabel="Kartenreihenfolge" value={value} onValueChange={setValue} options={[{ value: "reviews-first", label: "Fällige Karten zuerst" }, { value: "mixed", label: "Neue und fällige mischen" }, { value: "new-first", label: "Neue Karten zuerst" }]} /></Demo>}
    {section === "forms" && <Demo title="DeckSelect · Hierarchie und Suche"><DeckSelect ariaLabel="Zielstapel" value={deckId} onValueChange={setDeckId} decks={sampleDecks} /></Demo>}
    {section === "forms" && <Demo title="DeckMultiSelect · eingeschlossene Unterstapel"><DeckMultiSelect value={scope} onValueChange={setScope} decks={sampleDecks} /></Demo>}
    {section === "forms" && <Demo title="CoreDatePicker"><CoreDatePicker today={today} value={date} min="2026-09-01" max="2027-12-31" ariaLabel="Lerndatum wählen" onValueChange={setDate} /></Demo>}
    {section === "forms" && <Demo title="Native Felder"><label className="catalog-field">Stapelname<input className="min-h-control rounded-control border border-core-border px-3 text-core-text" defaultValue="Biologie" /></label><label className="catalog-field">Neue Karten pro Tag<input type="number" defaultValue={20} min={0} className="min-h-control rounded-control border border-core-border px-3 text-core-text" /></label><label className="catalog-field">Ungültige Eingabe<input aria-invalid="true" aria-describedby="catalog-input-error" className="min-h-control rounded-control border border-core-danger px-3" defaultValue="" /><span id="catalog-input-error" className="text-core-danger">Bitte einen Namen eingeben.</span></label><label className="catalog-field">Mehrzeiliger Inhalt<textarea defaultValue="Zusätzlicher Kontext" className="rounded-control border border-core-border p-3" /></label><label className="catalog-field">Passwort<input type="password" defaultValue="beispiel" className="min-h-control rounded-control border border-core-border px-3" /></label><label className="catalog-field">Deaktiviertes Feld<input disabled defaultValue="Nicht verfügbar" className="min-h-control rounded-control border border-core-border px-3 disabled:opacity-50" /></label></Demo>}
    {section === "forms" && <Demo title="CoreNumberField · Einstellungszeile" wide><div className="core-settings-list w-full"><div className="core-settings-row"><div className="core-settings-row-text"><label htmlFor="catalog-learn-ahead" className="core-settings-row-title">Lernkarten vorziehen</label><p id="catalog-learn-ahead-hint" className="core-settings-row-hint">Lernkarten, die in diesem Zeitraum fällig werden, erscheinen schon jetzt. 0 schaltet aus.</p></div><div className="core-settings-row-control"><CoreNumberField id="catalog-learn-ahead" value={learnAhead} min={0} max={720} unit="Min." ariaDescribedBy="catalog-learn-ahead-hint" className="w-32" onChange={setLearnAhead} /></div></div><div className="core-settings-row" data-layout="inline"><span className="core-settings-row-title">Profilzeitzone</span><div className="core-settings-row-control"><span className="core-settings-row-value">Europe/Berlin</span></div></div></div></Demo>}
    {section === "forms" && <Demo title="FileDropField"><FileDropField accept="image/*" pasteImages ariaLabel="Bild einfügen oder ablegen" prompt="Bild mit Strg+V einfügen oder hier ablegen" actionLabel={fileName ? "Bild ersetzen" : "Bild auswählen"} onFile={(file) => setFileName(file.name)}>{fileName && <p className="core-body">{fileName}</p>}</FileDropField></Demo>}
  </>;
}

function FeedbackDemo({ section }: { section: string }) {
  const [dialog, setDialog] = useState(false);
  const [bar, setBar] = useState(false);
  const [variantBar, setVariantBar] = useState(false);
  const toast = useSuccessToast();
  const progress = { total: 40, completedTodayCount: 16, newCount: 12, inProgressCount: 4, dueCount: 8 };
  return <>
    {section === "feedback" && <Demo title="StatusMessage · alle Töne">{(["info", "success", "warning", "error"] as const).map((tone) => <StatusMessage key={tone} tone={tone}>{({ info: "Die Synchronisierung steht noch aus.", success: "Karte wurde erfolgreich gespeichert.", warning: "Einige Medien fehlen.", error: "Der Import konnte nicht abgeschlossen werden." })[tone]}</StatusMessage>)}</Demo>}
    {section === "feedback" && <Demo title="SuccessToast und SuccessToastProvider"><div className="catalog-row"><ActionButton variant="primary" onClick={() => toast("Karte wurde erfolgreich gespeichert.")}>Erfolg anzeigen</ActionButton><ActionButton variant="secondary" onClick={() => toast("Karte ausgesetzt. Der Lernstand bleibt erhalten.", { appearance: "neutral" })}>Neutralen Hinweis anzeigen</ActionButton><ActionButton variant="secondary" onClick={() => toast("Karte nach „Europa“ verschoben.", { action: { label: "Rückgängig", onAction: () => toast("Verschieben rückgängig gemacht.") } })}>Mit Rückgängig anzeigen</ActionButton></div></Demo>}
    {section === "dialogs" && <Demo title="ActionDialog"><ActionButton variant="destructive" onClick={() => setDialog(true)}>Löschdialog öffnen</ActionButton><ActionDialog open={dialog} title="Stapel löschen?" description="Diese Demo verändert ausschließlich ihren eigenen Zustand." confirmLabel="Löschen" cancelLabel="Abbrechen" discardLabel="Entwurf verwerfen" destructive onConfirm={() => { setDialog(false); toast("Beispiel bestätigt."); }} onCancel={() => setDialog(false)} onDiscard={() => setDialog(false)} /></Demo>}
    {section === "dialogs" && <Demo title="SettingsSaveBar"><ActionButton variant="secondary" onClick={() => setBar(true)}>Speicherleiste öffnen</ActionButton><SettingsSaveBar open={bar} failed={false} mode="global" onSave={() => { setBar(false); toast("Beispiel gespeichert."); }} onDiscard={() => setBar(false)} /></Demo>}
    {section === "progress" && <Demo title="DailyReviewProgress"><DailyReviewProgress progress={progress} /></Demo>}
    {section === "progress" && <Demo title="VariantGenerationBar"><ActionButton variant="secondary" onClick={() => setVariantBar(true)}>Variantenleiste anzeigen</ActionButton>{variantBar ? <VariantGenerationBar deck={deck} done={7} total={18} outcome={null} onCancel={() => setVariantBar(false)} onClose={() => setVariantBar(false)} /> : null}</Demo>}
    {section === "progress" && <Demo title="Prozessindikator"><div className="core-statistics-load-track" role="progressbar" aria-label="Statistik wird aktualisiert"><span className="core-statistics-load-segment" /></div></Demo>}
  </>;
}

function NavigationDemo({ section }: { section: string }) {
  const menu = createMenuModel();
  const [view, setView] = useState("uebersicht");
  const [showShell, setShowShell] = useState(false);
  const [syncDemo, setSyncDemo] = useState("saved");
  const syncDemoStatus: SyncStatus = syncDemo === "offline" ? { status: "offline", message: "Offline", pendingCount: 2, nextRetryAt: null }
    : syncDemo === "error" ? { status: "error", message: "Synchronisierung fehlgeschlagen." }
      : syncDemo === "conflict" ? { status: "conflict", message: "2 Änderungen brauchen deine Entscheidung.", conflictCount: 2 }
        : syncDemo === "manual" ? { status: "pending", message: "Ausstehend", pendingCount: 1 }
          : { status: "saved", message: "Synchronisiert", savedAt: "2026-10-02T12:00:00Z" };
  const syncDemoStore = React.useMemo(() => {
    const store = createWorkspaceStore();
    store.set({ syncStatus: syncDemoStatus });
    return store;
  }, [syncDemo]);
  const toast = useSuccessToast();
  return <>
    {section === "navigation" && <Demo title="AppNavigation" wide><div className="catalog-row"><CoreSelect ariaLabel="Sync-Zustand" value={syncDemo} onValueChange={setSyncDemo} options={[{ value: "saved", label: "Synchronisiert (kein Icon)" }, { value: "manual", label: "Manuell, ausstehend" }, { value: "offline", label: "Offline" }, { value: "error", label: "Fehler" }, { value: "conflict", label: "2 Konflikte" }]} /><ActionButton variant="secondary" onClick={() => setShowShell(true)}>App-Navigation öffnen</ActionButton></div>{showShell && <div className="catalog-shell-preview" onKeyDown={(event) => { if (event.key === "Escape") setShowShell(false); }}><WorkspaceStoreContext.Provider value={syncDemoStore}><AppNavigation activeView={view} navigationItems={menu.listNavigationItems()} simulationOffsetMinutes={0} simulationDateLabel="2. Oktober 2026" pomodoroTimer={null} onNavigate={setView} settingsOpen={false} onOpenSettings={() => toast("Einstellungsdialog geöffnet.")} onResetSimulation={() => undefined} manualSync={syncDemo === "manual"} onSyncNow={() => toast("Beispiel synchronisiert.")} onOpenSyncSettings={(target) => toast(target === "sync-conflicts" ? "Konflikte in den Einstellungen geöffnet." : "Synchronisierung in den Einstellungen geöffnet.")} /></WorkspaceStoreContext.Provider><div className="catalog-shell-content"><h2 className="core-heading-2">Navigation: {menu.getView(view)?.label ?? "Lernen"}</h2><ActionButton variant="primary" autoFocus onClick={() => setShowShell(false)}>Vorschau schließen</ActionButton></div></div>}</Demo>}
    {section === "navigation" && <Demo title="CoreWordmark"><span className="core-heading-1"><CoreWordmark /></span></Demo>}
    {section === "headings" && <Demo title="LearningAreaHeader" wide><div className="grid gap-6">{(["overview", "cards"] as const).map((area) => <LearningAreaHeader key={area} area={area} onOpenCardSettings={() => toast("Lerneinstellungen gewählt.")} />)}</div></Demo>}
    {section === "navigation" && <Demo title="InPageNavigation · Sprunglinks der Statistik" wide><InPageNavigation ariaLabel="Beispielbereiche" items={[{ id: "catalog-demo-overview", label: "Überblick", icon: Home }, { id: "catalog-demo-plan", label: "Planung", icon: Layers }]}><section id="catalog-demo-overview" aria-labelledby="catalog-demo-overview-heading"><h3 id="catalog-demo-overview-heading" className="core-heading-3" tabIndex={-1}>Überblick</h3><p className="core-body">Kennzahlen und gespeicherte Einstellungen.</p></section><section id="catalog-demo-plan" aria-labelledby="catalog-demo-plan-heading"><h3 id="catalog-demo-plan-heading" className="core-heading-3" tabIndex={-1}>Planung</h3><p className="core-body">Lernplanung und Tageslimits.</p></section></InPageNavigation></Demo>}
  </>;
}

function DecksDemo({ section }: { section: string }) {
  const [decks, setDecks] = useState(substackDemoDecks);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [treeMode, setTreeMode] = useState<"dashboard" | "learn">("dashboard");
  const [treeView, setTreeView] = useState<DeckTreeView>("list");
  const toast = useSuccessToast();
  const rows = createDeckLibraryModel(decks, { now: `${today}T12:00:00Z`, timeZone: "Europe/Berlin" }).rows;
  const row = rows.find((entry) => entry.id === deck.id)!;
  function mode(id: string, coreMode: CoreMode) { setDecks((current) => current.map((entry) => entry.id === id ? { ...entry, deckSettings: { ...entry.deckSettings, coreMode } } : entry)); }
  function move(id: string, parentDeckId: string | null) { setDecks((current) => current.map((entry) => entry.id === id ? { ...entry, parentDeckId } : entry)); return null; }
  return <>
    {section === "stapel" && <Demo title="DeckSubstacksPanel" wide><DeckSubstacksPanel rows={rows} current={row} onOpenDeck={(id) => toast(`Stapel: ${rows.find((entry) => entry.id === id)?.path}`)} onStudy={(entry) => toast(`Lernstart: ${entry.name}`)} onOpenSettings={() => toast("Stapeleinstellungen geöffnet.")} onSetCoreMode={mode} onMoveDeck={move} /></Demo>}
    {section === "stapel" && <Demo title="DeckSummaryHeader und DeckSummaryRow" wide><DeckSummaryHeader /><DeckSummaryRow row={row} density="responsive" leadingControl={<ChevronRight size={18} />} actions={<IconButton label="Stapeloptionen" icon={MoreHorizontal} variant="ghost" className="core-deck-icon-action" />} learningStatus={{ summary: row.summary, metricLabels: "sr-only" }} studyAction={<IconButton label="Jetzt lernen" icon={Play} variant="ghost" className="core-deck-icon-action core-deck-study-action" data-deck-has-work="true" />} /></Demo>}
    {section === "stapel" && <Demo title="DeckOptionsMenu"><DeckOptionsMenu row={row} decks={decks} onSetCoreMode={mode} onMoveDeck={move} onOpenSettings={() => toast("Stapeleinstellungen geöffnet.")} /></Demo>}
    {section === "stapel" && <Demo title="DeckTree" wide><div className="catalog-row"><CoreSelect ariaLabel="Baumkontext" value={treeMode} onValueChange={(value) => setTreeMode(value as typeof treeMode)} options={[{ value: "dashboard", label: "Dashboard" }, { value: "learn", label: "Lernen" }]} /></div><DeckTree rows={rows} mode={treeMode} view={treeView} onViewChange={setTreeView} headerAction={treeMode === "dashboard" ? <IconButton icon={ArrowUpRight} variant="ghost" label="Alle Stapel öffnen" onClick={() => toast("Lernen geöffnet.")} /> : undefined} onActivate={(entry) => toast(`Inhalt: ${entry.name}`)} onStudy={(entry) => toast(`Lernstart: ${entry.name}`)} onOpenSettings={() => toast("Stapeleinstellungen geöffnet.")} onSetDeckCoreMode={mode} onMoveDeck={move} collapsedDeckIds={collapsed} onDeckExpansionChange={(id, expanded) => setCollapsed((current) => {
      const ids: readonly string[] = typeof id === "string" ? [id] : id;
      return expanded ? current.filter((value) => !ids.includes(value)) : [...new Set([...current, ...ids])];
    })} /></Demo>}
    {section === "stapel" && <Demo title="DeckTree · schmale Liste mit Kennzahlen als Unterzeile"><div className="max-w-sm"><DeckTree rows={rows} mode="learn" onActivate={(entry) => toast(`Inhalt: ${entry.name}`)} onStudy={(entry) => toast(`Lernstart: ${entry.name}`)} onOpenSettings={() => toast("Stapeleinstellungen geöffnet.")} onSetDeckCoreMode={mode} onMoveDeck={move} collapsedDeckIds={collapsed} onDeckExpansionChange={(id, expanded) => setCollapsed((current) => {
      const ids: readonly string[] = typeof id === "string" ? [id] : id;
      return expanded ? current.filter((value) => !ids.includes(value)) : [...new Set([...current, ...ids])];
    })} /></div></Demo>}
    {section === "charts" && <Demo title="StudyHeatmap" wide><StudyHeatmap heatmap={createStudyHeatmapModelFromCounts({ todayKey: today, countsByDay: new Map([["2026-09-27", 3], ["2026-09-28", 8], ["2026-09-29", 12], ["2026-09-30", 5], ["2026-10-01", 7], [today, 11]]), forecastCountsByDay: new Map([["2026-10-03", 10], ["2026-10-05", 20], ["2026-11-02", 35]]) })} formatDayLabel={(day) => `${day.key}: ${day.count} gelernt, ${day.forecastCount} voraussichtlich fällig`} /></Demo>}
  </>;
}

/** Manual content forms of the card reference; "basic-with-images" is a basic note with an inline image. */
export type CatalogCardKind = ManualContentKind | "basic-with-images";

export function cardFixture(kind: CatalogCardKind = "basic", index = 0) {
  const front = kind === "cloze" ? "Die Hauptstadt von Portugal ist {{c1::Lissabon}}." : kind === "multiple-choice" ? "Welche Städte liegen in Portugal?" : kind === "basic-with-images" ? `<p>Welche Hauptstadt siehst du?</p><img src="${imageReference}" alt="Beispielansicht von Lissabon">` : "Was ist die Hauptstadt von Portugal?";
  const content = createManualNoteContent({
    kind: kind === "basic-with-images" ? "basic" : kind,
    front,
    back: kind === "multiple-choice" ? "Lissabon und Porto" : "Lissabon",
    answerOptions: ["Lissabon", "Madrid", "Porto"],
    correctOptionIndices: kind === "multiple-choice" ? [0, 2] : [0],
  });
  const { note, cards } = createNote({ content, deckId: "catalog-card-types", media: kind === "basic-with-images" ? { [imageReference]: imageReference } : {} });
  return { note, card: cards[index] ?? cards[0], mediaUrls: sampleMedia };
}

export function StudyDemo({ kind = "basic", index = 0 }: { kind?: CatalogCardKind; index?: number }) {
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(0);
  const fixture = React.useMemo(() => cardFixture(kind, index), [kind, index]);
  return <div><NoteCardContent key={round} {...fixture} revealed={revealed} onReveal={() => setRevealed(true)} /><div className="catalog-row mt-6"><ActionButton variant="secondary" onClick={() => setRevealed((current) => !current)}>{revealed ? "Vorderseite zeigen" : "Antwort aufdecken"}</ActionButton><ActionButton variant="secondary" onClick={() => { setRevealed(false); setRound((current) => current + 1); }}>Zurücksetzen</ActionButton></div></div>;
}

function catalogTheme(): NotePresentationTheme {
  const style = getComputedStyle(document.documentElement);
  return {
    mode: document.documentElement.dataset.coreTheme === "dark" ? "dark" : "light",
    colors: Object.fromEntries(NOTE_THEME_COLORS.map((name) => [name, style.getPropertyValue(`--core-${name}`).trim()])) as NotePresentationTheme["colors"],
  };
}

function SurfaceDemo() {
  const fixture = React.useMemo(() => cardFixture("basic-with-images"), []);
  const [sides, setSides] = useState<Record<"question" | "answer", NotePresentationResult> | null>(null);
  React.useEffect(() => {
    let active = true;
    void Promise.all((["question", "answer"] as const).map((side) => renderCard({ note: fixture.note, card: fixture.card, side, surface: "management", theme: catalogTheme() })))
      .then(([question, answer]) => { if (active) setSides({ question, answer }); });
    return () => { active = false; };
  }, [fixture]);
  return <><CardPresentationSurface presentation={sides?.question ?? null} title="Vorderseite" mediaUrls={fixture.mediaUrls} /><CardPresentationSurface presentation={sides?.answer ?? null} title="Rückseite" mediaUrls={fixture.mediaUrls} /><CardPresentationSurface presentation={null} title="Noch keine Karte" loadingLabel="Kartendarstellung wird vorbereitet …" /></>;
}

function ContentDemo({ section }: { section: string }) {
  const [text, setText] = useState("<p>Markiere <strong>einen wichtigen Begriff</strong> und öffne die Werkzeuge.</p>");
  const [preview, setPreview] = useState(false);
  const [color, setColor] = useState("#3b7dd8");
  const imageUrls = useRef<string[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  React.useEffect(() => () => imageUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  async function prepareImage(file: File) {
    const hash = await crypto.subtle.digest("SHA-1", await file.arrayBuffer());
    const reference = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const previewUrl = URL.createObjectURL(file);
    imageUrls.current.push(previewUrl);
    setMediaUrls((current) => ({ ...current, [reference]: previewUrl }));
    return { reference, previewUrl, alt: file.name };
  }
  const fixture = cardFixture();
  return <>
    {section === "inhalt" && <Demo title="CardHtml"><CardHtml html='<p>Sanitisiertes <strong>Karten-HTML</strong> mit <em>Hervorhebung</em>.</p>' /></Demo>}
    {section === "inhalt" && <Demo title="CardPresentationSurface"><SurfaceDemo /></Demo>}
    {section === "inhalt" && <Demo title="NoteCardContent" wide><StudyDemo /></Demo>}
    {section === "dialogs" && <Demo title="CardPreviewDialog"><ActionButton variant="secondary" onClick={() => setPreview(true)}>Kartenvorschau öffnen</ActionButton><CardPreviewDialog note={fixture.note} card={fixture.card} mediaUrls={fixture.mediaUrls} open={preview} onOpenChange={setPreview} /></Demo>}
    {section === "editor" && <Demo title="RichTextEditor" wide><RichTextEditor value={text} onChange={setText} ariaLabel="Beispiel-Karteninhalt" isActive showAllTools clozeActions={{ groupId: 1 }} imageActions={{ mediaUrls, prepare: prepareImage }} /></Demo>}
    {section === "editor" && <Demo title="RichTextEditor · Dokumentwerkzeuge" wide><RichTextEditor value={text} onChange={setText} ariaLabel="Beispiel-Dokument mit Dokumentwerkzeugen" isActive documentTools /></Demo>}
    {section === "colors" && <Demo title="ColorPicker · Farbfeld und Werkzeug"><div className="catalog-row"><ColorPicker ariaLabel="Farbe wählen" value={color} onValueCommit={setColor} /><ColorPicker variant="tool" icon={Highlighter} ariaLabel="Markerfarbe" value={color} onValueCommit={setColor} /></div></Demo>}
    {section === "media" && <Demo title="PdfDocumentViewer" wide><PdfDemo /></Demo>}
  </>;
}

/** Tags save at once in the editor; here they change only the demo state. */
function TagsAndFlagsDemo() {
  const [tags, setTags] = useState(["Biologie::Zelle", "#AK_Step1::Herz", "AK::Kreislauf", "eigen"]);
  const [flag, setFlag] = useState(3);
  const directory = [
    { tag: "Biologie::Zelle", noteCount: 18, importedCount: 0 },
    { tag: "Biologie::Zelle::Mitochondrium", noteCount: 4, importedCount: 0 },
    { tag: "#AK_Step1::Herz", noteCount: 120, importedCount: 120 },
    { tag: "Prüfung::Physiologie", noteCount: 9, importedCount: 0 },
  ];
  return <>
    <Demo title="TagInput"><TagInput tags={tags} importedTags={["#AK_Step1::Herz", "AK::Kreislauf"]} loadDirectory={async () => directory} onChange={setTags} /></Demo>
    <Demo title="FlagPicker und FlagDot"><FlagPicker value={flag} onValueChange={setFlag} names={["", "", "Wiederholen", "", "", "", ""]} onEditNames={() => undefined} /><div className="catalog-row">{[1, 2, 3, 4, 5, 6, 7].map((value) => <FlagDot key={value} flag={value} />)}</div></Demo>
  </>;
}

/** Building blocks change a real content; the list shows the fields and cards that result. */
function NoteBlocksDemo() {
  const [content, setContent] = useState(() => createBasicNote("catalog", "Was speichert ATP?", "Chemische Energie").note.content);
  const blocks = noteBlocks(content);
  return (
    <Demo title="NoteBlockControls" wide>
      <NoteBlockControls
        typeIn={blocks.typeIn}
        fieldRoles={blocks.fieldRoles}
        onTypeInChange={(enabled) => setContent((current) => setNoteTypeIn(current, enabled))}
        onAddField={(role) => setContent((current) => addNoteField(current, role).content)}
      />
    </Demo>
  );
}

function PdfDemo() {
  const [src, setSrc] = useState<string | null>(null);
  React.useEffect(() => {
    const bodies = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 240] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
    const stream = "BT /F1 20 Tf 32 180 Td (CoRe - Lernen mit Kontext) Tj 0 -36 Td /F1 12 Tf (Diesen Text kannst du markieren.) Tj ET";
    bodies.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    bodies.forEach((body, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, []);
  return <>{src && <PdfDocumentViewer src={src} document={{ id: "catalog-pdf", fileName: "lernhinweis.pdf", mimeType: "application/pdf", text: "CoRe – Lernen mit Kontext", textExtractionStatus: "success", metadata: {} }} onSelection={() => undefined} />}</>;
}

function LearningDemo({ section }: { section: string }) {
  const [timer, setTimer] = useState<PomodoroTimer | null>(null);
  const [settings, setSettings] = useState(false);
  const [marked, setMarked] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [flag, setFlag] = useState(0);
  const [order, setOrder] = useState<NewReviewOrder>("reviews-first");
  const [draft, setDraft] = useState(() => createDeckLearningSettingsDraft(deck.deckSettings));
  const [profiles, setProfiles] = useState<React.ComponentProps<typeof LearningSettingsPanel>["profiles"]>([]);
  const start = (minutes: number) => setTimer(createPomodoroTimer(minutes));
  const demoTimer = React.useMemo(() => createPomodoroTimer(25), []);
  return <>
    {section === "forms" && <Demo title="PomodoroTimerControl"><PomodoroTimerControl timer={timer} variant="settings" onStart={start} /></Demo>}
    {section === "progress" && <Demo title="PomodoroProgress"><PomodoroProgress timer={timer ?? demoTimer} variant="study" /></Demo>}
    {section === "dialogs" && <Demo title="StudySettingsOverlay"><ActionButton variant="secondary" onClick={() => setSettings(true)}>Lerneinstellungen öffnen</ActionButton><StudySettingsOverlay open={settings} canEditCard marked={marked} suspended={suspended} reviewOrder={order} pomodoroTimer={timer} onOpenChange={setSettings} onEditCard={() => setSettings(false)} onEditDeck={() => setSettings(false)} onMarkedChange={setMarked} onSuspendedChange={setSuspended} flag={flag} flagNames={[]} onFlagChange={setFlag} onReviewOrderChange={setOrder} onStartPomodoro={(minutes) => { start(minutes); setSettings(false); }} /></Demo>}
    {section === "forms" && <Demo title="LearningSettingsPanel · Tagesrunde und Scheduler" wide><LearningSettingsPanel section="daily" draft={draft} profiles={profiles} defaultProfileName="Standard" onProfilesChange={setProfiles} onDraftChange={setDraft} onApplyProfile={(next) => { setDraft(next); return true; }} /><LearningSettingsPanel section="scheduler" draft={draft} profiles={profiles} defaultProfileName="Standard" onProfilesChange={setProfiles} onDraftChange={setDraft} onApplyProfile={(next) => { setDraft(next); return true; }} /></Demo>}
    {section === "buttons" && <Demo title="Reviewratings"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{ratingButtons.map((rating, index) => <button type="button" key={rating.key} className={`min-h-14 rounded-control border px-3 py-1.5 text-center shadow-soft transition hover:-translate-y-0.5 ${rating.className}`}><span className="block core-body font-semibold">{rating.label}</span><small className="block core-caption">{["1 min", "5 min", "1 Tag", "4 Tage"][index]}</small></button>)}</div></Demo>}
  </>;
}

async function generateSummaryDemo(input: SummaryGenerationInput, signal: AbortSignal, mode = "success"): Promise<SummaryGenerationResult> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, mode === "slow" ? 15_000 : 300);
    const abort = () => { window.clearTimeout(timer); reject(new Error("Erstellung abgebrochen.")); };
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
  if (mode === "error") throw new Error("Der KI-Dienst ist momentan nicht erreichbar. Deine Auswahl bleibt erhalten.");
  if (mode === "module-error") {
    const events = new EventTarget(), error = new TypeError("Failed to fetch dynamically imported module");
    registerAppModuleLoadErrors(events);
    events.dispatchEvent(Object.assign(new Event("vite:preloadError"), { payload: error }));
    throw error;
  }
  const material = prepareSummaryMaterial([deck], sampleNotes, input.deckId, input.title, input.settings, input.source);
  const result: AiLearningSummarySuccess = {
    summary: { sections: material.request.units.slice(0, 3).map((unit, index) => ({
      heading: material.references[index].label.split(" · ").at(-1)!.slice(0, 160), paragraphs: input.settings.format === "bullets" ? [] : [unit.text],
      points: input.settings.format === "bullets" ? [{ keyword: "Kernaussage", text: unit.text }] : [], references: [unit.id], subsections: [],
    })), warnings: ["Diese Katalogfassung ist eine simulierte KI-Antwort und dient ausschließlich der UI-Prüfung."], relations: [] },
    model: "catalog/demo", privacyMode: "zdr", promptVersion: AI_LEARNING_SUMMARY_PROMPT_VERSION, usage: null,
  };
  return { html: generatedSummaryHtml(result, material), generation: { model: result.model, privacyMode: result.privacyMode, promptVersion: result.promptVersion, generatedAt: new Date().toISOString(), materialUnits: material.request.units.length } };
}

function SummaryContentDemo() {
  const [simulation, setSimulation] = useState("success");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function show() {
    setBusy(true); setError("");
    try {
      const account = { userId: "catalog-summaries", cloud: null };
      if (!(await loadLearningSummaries(account, deck.id)).summaries.length) {
        for (const [title, text] of [
          ["Europa im Überblick", "<h2>Portugal</h2><p>Lissabon ist die Hauptstadt von Portugal.</p><h2>Spanien</h2><p>Madrid ist die Hauptstadt von Spanien.</p><p>Diese Zusammenfassung ist ein lokales Beispiel für die Listenvorschau.</p>"],
          ["Vor der nächsten Wiederholung", "<p>Rufe die Hauptstadt zu jedem Land zunächst selbst ab. Vergleiche deine Antwort anschließend mit der Karte.</p>"],
        ]) {
          await saveLearningSummary(account, { ...createLearningSummary(deck.id, title, createSummarySettings()), html: text });
        }
      }
      setOpen(true);
    } catch { setError("Die lokale Zusammenfassungs-Demo konnte nicht geladen werden."); }
    finally { setBusy(false); }
  }
  return <Demo title="Zusammenfassungen" wide><ActionButton variant="secondary" loading={busy} onClick={() => void show()}>Zusammenfassungen öffnen</ActionButton>{error && <StatusMessage tone="error">{error}</StatusMessage>}{open && <div className="mt-6"><label className="core-field-group mb-4"><span className="core-field-label">KI-Demoantwort</span><CoreSelect ariaLabel="KI-Demoantwort" value={simulation} options={[{ value: "success", label: "Erfolgreich" }, { value: "error", label: "Fehler" }, { value: "module-error", label: "Ladefehler nach Update" }, { value: "slow", label: "Langsam mit Abbruch" }]} onValueChange={setSimulation}/></label><DeckSummariesPanel deck={deck} userId="catalog-summaries" onGenerateSummary={(input, signal) => generateSummaryDemo(input, signal, simulation)} onDraftStateChange={() => undefined}/></div>}</Demo>;
}

function MindMapContentDemo() {
  const [open, setOpen] = useState(false), [error, setError] = useState(""), [withoutSummary, setWithoutSummary] = useState(false);
  async function show(empty = false) {
    try {
      const account = { userId: "catalog-mindmaps", cloud: null };
      if (!empty && !(await loadLearningSummaries(account, deck.id)).summaries.length) {
        await saveLearningSummary(account, { ...createLearningSummary(deck.id, "Europa und ihre Hauptstädte", createSummarySettings()), html: "<h2>Portugal</h2><p>Portugal liegt auf der Iberischen Halbinsel im Südwesten Europas und grenzt an Spanien sowie den Atlantik.</p><p>Lissabon ist die Hauptstadt von Portugal.</p><h2>Spanien</h2><p>Madrid ist die Hauptstadt von Spanien.</p><h3>Merksatz</h3><p>Vergleiche Länder und Hauptstädte miteinander.</p>" });
      }
      setWithoutSummary(empty); setOpen(true);
    } catch { setError("Die lokale Mindmap-Demo konnte nicht geladen werden."); }
  }
  return <Demo title="Mindmaps" wide><div className="flex flex-wrap gap-2"><ActionButton variant="secondary" onClick={() => void show()}>Mindmaps öffnen</ActionButton><ActionButton variant="secondary" onClick={() => void show(true)}>Mindmaps ohne Zusammenfassung öffnen</ActionButton></div>{error && <StatusMessage tone="error">{error}</StatusMessage>}{open && <div className="mt-6"><DeckMindMapsPanel key={String(withoutSummary)} deck={deck} userId={withoutSummary ? "catalog-mindmaps-empty" : "catalog-mindmaps"} onGenerateSummary={generateSummaryDemo} onDraftStateChange={() => undefined}/></div>}</Demo>;
}

function ExamTopicOrderDemo() {
  const [topics, setTopics] = useState(() => Array.from({ length: 20 }, (_, i) => ({ id: `catalog-topic-${i + 1}`, name: `${String(i + 1).padStart(2, "0")} · Vorlesung${i === 1 ? " mit einem sehr langen Namen: Herz, Kreislauf und Medikamente" : ""}` })));
  return <Demo title="Prüfungen · Themenreihenfolge" wide><ExamTopicOrder topics={topics} onChange={(ids) => setTopics((current) => ids.map((id) => current.find((topic) => topic.id === id)!))} /></Demo>;
}

const PRODUCT_VIEWS = ["auth", "conflict", "statistics", "simulator", "help", "dashboard", "dashboard-empty", "learn", "exams", "creation", "ai-source", "manual", "import", "decks", "deck-content", "deck-settings", "study", "study-variant", "study-variant-image"];

/**
 * Browser-test harness outside the catalog: `?preview=cards` shows every renderer case, any other value lists the
 * real screens with local sample data and opens the named one directly.
 */
export function CatalogPreview({ kind }: { kind: string }) {
  if (kind === "cards") return <div id="note-content" className="catalog-preview catalog-demo-grid">{noteDemoGraphs.map((item) => <NoteDemo key={item.id} item={item} />)}</div>;
  return <div id="screens" className="catalog-preview catalog-demo-grid">{PRODUCT_VIEWS.map((id) => <ProductViewsDemo key={id} kind={id} />)}<ExamTopicOrderDemo /><SummaryContentDemo /><MindMapContentDemo /></div>;
}

function ProductViewsDemo({ kind }: { kind: string }) {
  const [dashboardTimer, setDashboardTimer] = useState<PomodoroTimer | null>(null);
  const [focusedDemoDeckId, setFocusedDemoDeckId] = useState<string | null>(null);
  const [demoStudyDeck, setDemoStudyDeck] = useState(deck);
  const [demoContentTab, setDemoContentTab] = useState<DeckContentTab>("children");
  const [collapsedDemoDeckIds, setCollapsedDemoDeckIds] = useState<string[]>([]);
  const [view, setView] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === kind ? kind : "");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("konto");
  const [settingsGuard, setSettingsGuard] = useState<SettingsDraftGuard | null>(null);
  const [deckSettingsSection, setDeckSettingsSection] = useState<DeckSettingsSection>("stapel");
  const settingsFooter = settingsGuard ? <SettingsSaveBar open mode={settingsSectionGroup(settingsSection) === "learning" ? "learning-global" : "global"} onSave={(scope) => { void settingsGuard.save(scope); }} onDiscard={() => { settingsGuard.discard(); setSettingsGuard(null); }} /> : null;
  const catalogMediaStore = useCatalogMediaStore(view === "study-variant-image");
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState<StatisticsSelection>({ period: "30d", deckIds: "all", now: kind === "exams" ? "2026-10-14T12:00:00Z" : "2026-10-02T12:00:00Z", timeZone: "Europe/Berlin" });
  const conflict = { id: "catalog-conflict", status: "open", entityTable: "cards", entityLabel: "Karte", title: "Hauptstadt von Portugal", localPresent: true, remotePresent: true, remoteRevision: 2, createdAt: selection.now, allowedActions: ["merge-fields"], fields: [{ key: "front", label: "Frage", localText: "Hauptstadt von Portugal?", remoteText: "Wie heißt Portugals Hauptstadt?" }, { key: "back", label: "Antwort", localText: "Lissabon", remoteText: "Lissabon (Lisboa)" }] };
  const conflicts = React.useRef([conflict]);
  const [catalogStore] = useState(() => {
    const store = createWorkspaceStore();
    store.set({ syncStatus: { status: "saved", message: "Synchronisiert", savedAt: selection.now } });
    // Answers in the preview session are timed, so `Über uns` can copy them like in the app.
    bindFieldTimingsAccount("ui-catalog");
    return store;
  });
  const listConflicts = React.useCallback(async () => conflicts.current, []);
  const resolveConflict = React.useCallback(async (_id: string, decision: { action: string }) => {
    conflicts.current = decision.action === "reopen" ? [conflict] : decision.action === "ignore" ? [{ ...conflict, status: "ignored" }] : [];
    return { conflicts: conflicts.current };
  }, []);
  const statisticsDecks = React.useMemo(() => {
    const cards = Array.from({ length: 8 }, (_, index) => ({ ...createBasicNote("catalog-statistics", `Frage ${index + 1}`, "Antwort").cards[0], study: cardStudyFromReviewState(createReviewState({ state: "review", dueAt: `2026-10-${String(3 + index).padStart(2, "0")}T12:00:00Z`, intervalDays: 3 + index * 5, stability: 5 + index * 10, difficulty: 2 + index, reps: 6, maturityBand: getMaturityBand({ state: "review", stability: 5 + index * 10, difficulty: 2 + index }) })) }));
    return [createCoreDeck({ id: "catalog-statistics", name: "Welt-Hauptstädte", source: "manual", cards, reviewEvents: Array.from({ length: 28 }, (_, index) => {
      const item = cards[index % cards.length]; const answeredAt = `2026-09-${String(3 + index).padStart(2, "0")}T12:00:00Z`;
      return { id: `catalog-review-${index}`, userId: "catalog", deckId: "catalog-statistics", cardId: item.id, variantId: null, rating: (["again", "hard", "good", "easy"] as const)[index % 4], answeredAt, responseTimeMs: 1800 + index * 100, schedulerBefore: { card: { state: "review", intervalDays: 3 + index } }, schedulerAfter: {}, flags: {}, createdAt: answeredAt };
    }) }), child];
  }, []);
  const toast = useSuccessToast();
  const workspace = React.useMemo(() => ({ ...createCoreRepository().getState(), decks: sampleDecks }), []);
  const navigate = React.useCallback<React.ComponentProps<typeof DashboardScreen>["onNavigate"]>((id, fields) => createViewRoute(id ?? "uebersicht", fields), []);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cardEditorTab, setCardEditorTab] = useState<CardEditorTab>("general");
  const [savedSearches, setSavedSearches] = useState<SavedCardSearch[]>([{ id: "demo-search", name: "Heute nicht gewusst", query: "rated:1:1" }]);
  const [contentTab, setContentTab] = useState<DeckContentTab>("children");
  // Local stand-in for the catalog query of the app: every deck shows its sample cards as one page.
  const requestCardPage = React.useCallback((request: DecksCardPageRequest) => {
    // The flat hit list of a search reads the cards of every deck in scope that match the search.
    const search = parseCardSearchQuery(request.query);
    const deckCards = request.deckIds
      ? sampleDecks.filter((candidate) => request.deckIds!.includes(candidate.id)).flatMap((candidate) => candidate.cards)
      : sampleDecks.find((candidate) => candidate.id === request.deckId)?.cards ?? [];
    const selectedCard = deckCards.find((card) => card.id === request.selectedCardId);
    const note = selectedCard ? sampleNotesById.get(selectedCard.noteId) : undefined;
    const items = deckCards.map((card) => catalogEntryFromCard(card, sampleNotesById.get(card.noteId) ?? null)).filter((entry) => !request.deckIds || matchesCardSearch(entry, search));
    catalogStore.set((current) => ({ cardPages: { ...current.cardPages, [request.deckId]: { deckId: request.deckId, deckIds: request.deckIds, pages: { 0: items }, pageSize: 50, totalCount: items.length, query: request.query, sort: request.sort, selected: selectedCard && note ? { note, cards: deckCards.filter((card) => card.noteId === note.id), cardId: selectedCard.id } : null, requestedCardId: request.selectedCardId } } }));
  }, [catalogStore]);
  const noop = React.useCallback(() => undefined, []);
  // Stand-in for the learning help route: a short pause, then a fixed plain-text answer.
  const askCatalogCardHelp = React.useCallback((_request: unknown, signal: AbortSignal) => new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => resolve("Die Karte fragt nach dem Kern des Begriffs.\n\n- Merke dir die Antwort als Ursache, nicht als Definition.\n- Verknüpfe sie mit einem Beispiel aus deinem Alltag."), 800);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("abgebrochen")); });
  }), []);
  const completedDemoExamCards = React.useRef(new Set<string>());
  const examDemoDecks = React.useMemo(() => [deck, child, ...["Herz und Kreislauf", "Atmung", "Niere und Elektrolyte"].map((name, index) => {
    const id = `catalog-exam-topic-${index}`;
    return createCoreDeck({ id, name, parentDeckId: deck.id, cards: createBasicNote(id, `${name}: Was ist wichtig?`, "Lokale Beispielantwort.", { createdAt: selection.now }).cards });
  })], [selection.now]);
  const [demoPlanning, setDemoPlanning] = React.useState<ExamPlanningSettings | null>(null);
  const examWorkspace = React.useMemo(() => {
    const today = selection.now.slice(0, 10);
    const exam = { ...createExamPlan(today, examDemoDecks.map((candidate) => candidate.id)), id: "exam-demo", name: "Anatomie", readSummaryBeforeTopics: true, examDate: "2026-10-20", createdAt: "2026-09-29T08:00:00.000Z" };
    const initialPlanning = upsertExamPlan(upsertExamPlan(normalizeExamPlanningSettings(undefined), exam), { ...exam, id: "exam-demo-second", name: "Physiologie", examDate: "2026-10-27" });
    initialPlanning.capacity.timeBlocks = [{ id: "catalog-study-block", date: today, start: 540, end: 600, examId: exam.id }, { id: "catalog-open-block", date: today, start: 780, end: 810, examId: null }];
    initialPlanning.dailyTasks = examDemoDecks.slice(0, 4).map((candidate, index) => ({ id: `topic:${exam.id}:${candidate.id}`, date: today, examId: exam.id, kind: "study", deckIds: [candidate.id], cardIds: candidate.cards.map((card) => card.id), capturedAt: selection.now, completed: index === 0 ? "manual" : null }));
    return { ...workspace, decks: examDemoDecks, profile: withGlobalSchedulerPreferences(workspace.profile, { examPlanning: demoPlanning ?? initialPlanning }) };
  }, [demoPlanning, examDemoDecks, selection.now, workspace]);
  const loadExamPlanningData = React.useCallback(async (deckIds: string[]) => ({
    cards: examDemoDecks.flatMap((candidate) => candidate.cards).filter((card) => deckIds.includes(card.deckId)).map((card) => {
      const { extra, ...study } = card.study;
      // Sample cards carry their real creation time; new ones are due on the catalog's simulated day.
      return { cardId: card.id, deckId: card.deckId, noteId: card.noteId, status: card.status, study: completedDemoExamCards.current.has(card.id) ? { ...study, state: "review" as const, dueAt: "2026-11-01T08:00:00.000Z", lastReviewedAt: selection.now, reps: study.reps + 1 } : { ...study, dueAt: study.state === "new" ? selection.now : study.dueAt }, studyRevision: completedDemoExamCards.current.has(card.id) ? 1 : 0, activeVariantCount: card.variants.length, createdAt: card.createdAt, stabilityFast: extra.stabilityFast };
    }),
  }), [examDemoDecks, selection.now]);
  const views = [["auth", "AuthGateScreen · Anmeldung, Registrierung und Reset", "Anmeldung"], ["conflict", "SyncConflictPanel · Feldvergleich und Zusammenführung", "Konfliktauflösung"], ["statistics", "StatisticsScreenContent · alle Diagramme und Tabellen", "Statistik"], ["simulator", "SimulatorScreen · Lernuhr und Datumauswahl", "Simulator"], ["help", "HelpScreen · Lernmethoden und FSRS-Illustrationen", "Lernmethoden"]];
  views.push(
    ["dashboard", "DashboardScreen · Tagesziel als Auftakt, nachrückende Widgets, Widget-Leiste und direkt einstellbarer Timer", "Tagesübersicht"],
    ["dashboard-empty", "DashboardScreen · Erststart ohne Daten", "Erststart"],
    ["learn", "LearnScreen · Stapel und Schnellformular", "Lernen"],
    ["exams", "ExamPlanningScreen · lokaler Plus-Einstieg bei leerer Prüfungsliste und durchgehendes Plus-Feld Weitere Prüfung planen unter bestehenden Prüfungen · einzeln umschaltbare Prüfungsfarben im Kalenderkopf statt globalem Dropdown, ausgefüllt oder hell umrandet · gemeinsame Monatskachel je Fach für Karten und Lesen, auch ohne neue Karten · Kalender ab aktueller Woche mit Rücknavigation · vier Schritte mit Rücksprüngen und genau einem Schritt vorwärts über die Leiste, Lernstart mit Vorgabe heute und sichtbarem Prüfungsziel auf der ersten Seite · durchsuchbare Stapelzweige mit Plusauswahl ohne Teilmarkierung · alternative Zeitangaben mit Durchschnitt oder direkt editierbaren Wochentagszeiten, freie Tage mit 0 Minuten · Vorschau mit Lerntagen, auf Kalenderhöhe begrenzter ausklappbarer Themenfolge, dauerhaftem Prüfungstermin und erreichbarer Planbestätigung · nichtmodale Tagesdetails", "Prüfungen"],
    ["creation", "CreationScreen · Drei Erstellungswege", "Erstellen"],
    ["ai-source", "AiSourceCreationPanel · Drei Schritte: Quelle und Stapel, Lernwünsche, Karten", "Automatische Erstellung"],
    ["manual", "ManualCreationPanel · Formular und Bausteine", "Manuelle Erstellung"],
    ["import", "ApkgImportPanel · Dateiauswahl", "Anki-Import"],
    ["decks", "DecksScreen · Tabelle und Karteneditor", "Kartenverwaltung"],
    ["deck-content", "DecksScreen · Karten lernen direkt neben den Inhaltsreitern", "Stapelinhalte"],
    ["settings", "SettingsDialog · alle Bereiche der Einstellungen", "Einstellungen"],
    ["deck-settings", "DeckSettingsScreen · Darstellung und Lernwerte", "Stapeleinstellungen"],
    ["study", "StudyMode · Frage, Antwort und Bewertungen", "Lernsitzung"],
    ["study-variant", "StudyMode · Kartenvariante mit einklappbarer Originalkarte", "Lernsitzung mit Variante"],
    ["study-variant-image", "StudyMode · Kartenvariante mit Bild aus dem Zusatzfeld", "Lernsitzung mit Bildvariante"],
  );
  return <>{views.filter(([id]) => id === kind).map(([id, title, label]) => <Demo key={id} title={title}><ActionButton variant="secondary" onClick={() => { conflicts.current = [conflict]; setMessage(""); setView(id); }}>{label} öffnen</ActionButton></Demo>)}{view && <div className="catalog-product-preview core-screen-region" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) setView(""); }}><div className="catalog-product-bar"><p className="core-caption">Echte Produktansicht · lokale Demodaten</p><ActionButton variant="secondary" autoFocus onClick={() => setView("")}>Produktansicht schließen</ActionButton></div>
    <section className="min-w-0 overflow-x-clip px-2.5 pb-32 pt-8 sm:px-4 lg:px-6"><WorkspaceStoreContext.Provider value={catalogStore}>
    {view === "auth" && <AuthGateScreen message={message} onSignIn={() => setMessage("Demo-Anmeldung geprüft.")} onSignUp={() => setMessage("Demo-Registrierung geprüft.")} onResetPassword={() => setMessage("Demo-Reset angefordert.")} />}
    {view === "conflict" && <SyncConflictPanel onListConflicts={listConflicts} onResolveConflict={resolveConflict} />}
    {view === "statistics" && <StatisticsScreenContent dataset={{ decks: statisticsDecks, projection: projectStatistics(statisticsDecks, selection) }} now={selection.now} timeZone={selection.timeZone} onSelectionChange={(next) => setSelection((current) => ({ ...current, ...next }))} onNavigate={() => toast("Demostapel ausgewählt.")} />}
    {view === "simulator" && <SimulatorScreen systemNow={selection.now} offsetMinutes={offset} onOffsetChange={setOffset} />}
    {view === "help" && <HelpScreen />}
    {view === "dashboard" && <DashboardScreen pomodoroTimer={dashboardTimer} onStartPomodoro={(minutes) => setDashboardTimer(createPomodoroTimerFromSeconds(Math.round(minutes * 60)))} onPausePomodoro={() => setDashboardTimer(pausePomodoroTimer)} onResumePomodoro={() => setDashboardTimer(resumePomodoroTimer)} onResetPomodoro={() => setDashboardTimer(null)} onLoadExamPlanningData={loadExamPlanningData} onLoadExamSummaryAvailability={async () => false} onSaveExamTasks={async (dailyTasks) => setDemoPlanning(withExamDailyTasks(getGlobalSchedulerPreferences(examWorkspace.profile).examPlanning, dailyTasks))} onStartExamUnit={async () => { examDemoDecks.flatMap((candidate) => candidate.cards).forEach((card) => completedDemoExamCards.current.add(card.id)); toast("Lernaufgabe in dieser lokalen Demo abgeschlossen."); }} state={examWorkspace} now={selection.now} onNavigate={navigate} onStartDeck={noop} onStartAdditionalCards={() => ({ ok: true })} onCreateDemo={async () => sampleDecks} onSetDeckCoreMode={noop} onMoveDeck={() => null} onOpenDeckSettings={noop} onSetDeckExpanded={noop} />}
    {view === "dashboard-empty" && <DashboardScreen state={{ ...examWorkspace, decks: [] }} now={selection.now} onNavigate={navigate} onStartDeck={noop} onStartAdditionalCards={() => ({ ok: true })} onCreateDemo={async () => sampleDecks} onSetDeckCoreMode={noop} onMoveDeck={() => null} onOpenDeckSettings={noop} onSetDeckExpanded={noop} />}
    {view === "exams" && <ExamPlanningScreen state={examWorkspace} now={selection.now} onLoadSummaryAvailability={async () => false} onLoadPlanningData={loadExamPlanningData} onSavePlanning={async (next) => { setDemoPlanning(next); const previous = getGlobalSchedulerPreferences(examWorkspace.profile).examPlanning; if (JSON.stringify([previous.exams, previous.capacity]) !== JSON.stringify([next.exams, next.capacity])) toast("Plan für diese lokale Vorschau übernommen."); }} onSaveTasks={async (dailyTasks) => setDemoPlanning(withExamDailyTasks(getGlobalSchedulerPreferences(examWorkspace.profile).examPlanning, dailyTasks))} onStartUnit={async () => toast("In der Vorschau startet keine Sitzung.")} />}
    {view === "learn" && <LearnScreen decks={sampleDecks} now={selection.now} onStartDeck={noop} onCreateDeck={() => deck} focusedDeckId={focusedDemoDeckId} initialParentDeckId="" onDeckCreationHandled={noop} onFocusDeck={setFocusedDemoDeckId} onOpenCardCreation={noop} onOpenDecks={(id) => { setFocusedDemoDeckId(id ?? null); setView("decks"); }} onOpenDeckContent={(id) => { setFocusedDemoDeckId(id); setContentTab("children"); setSelectedCardId(null); setView("deck-content"); }} onOpenCardSettings={noop} onOpenDeckSettings={noop} onSetDeckCoreMode={noop} onMoveDeck={() => null} collapsedDeckIds={collapsedDemoDeckIds} onSetDeckExpanded={(_surface, id, expanded) => setCollapsedDemoDeckIds((current) => expanded ? current.filter((value) => !(typeof id === "string" ? [id] : id).includes(value)) : [...new Set([...current, ...(typeof id === "string" ? [id] : id)])])} />}
    {["creation", "manual", "import", "ai-source"].includes(view) && <CreationScreen decks={sampleDecks} initialMethod={view === "manual" ? "manual" : view === "import" ? "import" : view === "ai-source" ? "ai-source" : ""} onMethodChange={(method) => setView(method || "creation")} />}
    {["decks", "deck-content"].includes(view) && <DecksScreen summaryAccountId="catalog-summaries" onGenerateSummary={generateSummaryDemo} contentDeckId={view === "deck-content" ? focusedDemoDeckId ?? deck.id : null} contentTab={contentTab} onOpenDeckContent={(id, tab) => { setFocusedDemoDeckId(id); setContentTab(tab ?? "children"); setSelectedCardId(null); }} decks={substackDemoDecks} now={selection.now} mediaStore={null} onStartDeck={(selectedDeck) => { setDemoStudyDeck(selectedDeck); setView("study"); }} onSetDeckCoreMode={noop} onRequestCardPage={requestCardPage} onSaveNote={async () => null} onSetCardStudyState={async () => null} onDuplicateNote={async () => null} onDeleteNote={async () => null} onUndoDeleteNote={async () => null} onRescheduleCards={async () => []} onGenerateVariant={async () => { throw new Error("Keine KI-Anfrage in der Vorschau."); }} onUpdateVariant={async () => undefined} selectedDeckId={view === "deck-content" ? focusedDemoDeckId ?? deck.id : selectedCardId ? deck.id : null} selectedCardId={selectedCardId} cardEditorTab={cardEditorTab} onCardEditorTabChange={setCardEditorTab} cardEditor={catalogCardEditorServices} onSelectDeck={(_id, cardId, tab) => { setSelectedCardId(cardId ?? null); setCardEditorTab(tab ?? "general"); }} onOpenLearn={noop} onOpenCardSettings={noop} onMoveDeck={() => null} onOpenDeckSettings={noop} onDraftStateChange={noop} savedSearches={savedSearches} onSavedSearchesChange={setSavedSearches} />}
    {view === "settings" && <SettingsDialog section={settingsSection} onSelectSection={setSettingsSection} onClose={() => setView("")} footer={settingsFooter}>{settingsSectionGroup(settingsSection) === "general"
      ? <SettingsScreen section={settingsContentSection(settingsSection) as GeneralSettingsSection} focusConflicts={settingsSection === "konflikte"} profile={workspace.profile} onSaveSettings={() => workspace.profile} onDraftStateChange={setSettingsGuard} onSyncNow={async () => undefined} onListConflicts={async () => []} onResolveConflict={async () => undefined} onSignOut={async () => undefined} onNavigate={navigate} />
      : <GlobalCardSettingsScreen section={settingsContentSection(settingsSection) as LearningSettingsSection} decks={sampleDecks} onOpenDeckSettings={() => setView("deck-settings")} timeZone="Europe/Berlin" globalSchedulerPreferences={getGlobalSchedulerPreferences(workspace.profile)} flagNames={workspace.profile.uiPreferences.flagNames} learningProfiles={[]} onSaveLearningProfiles={noop} onSaveSettings={() => workspace.profile} onDraftStateChange={setSettingsGuard} onNavigate={navigate} simulationOffsetMinutes={0} simulationDateLabel="2. Oktober 2026" pomodoroTimer={null} onStartPomodoro={noop} />}</SettingsDialog>}
    {view === "deck-settings" && <DeckSettingsScreen section={deckSettingsSection} onSelectSection={setDeckSettingsSection} deck={deck} decks={sampleDecks} learningProfiles={[]} onSaveSettings={() => null} onApplyLearningProfile={() => deck} onSaveLearningProfiles={noop} onDraftStateChange={noop} onRequestContextAction={(action) => action()} onCreateSubdeck={noop} onDeleteDeck={async () => null} onSelectDeck={noop} onOpenGlobalSettings={noop} onClose={() => setView("")} />}
    {view === "study" && <StudyMode deck={demoStudyDeck} decks={sampleDecks} notes={sampleNotes} deckId={demoStudyDeck.id} mediaStore={null} getNow={() => selection.now} simulationOffsetMinutes={0} pomodoroTimer={null} onStartPomodoro={noop} onExit={() => setView("")} onReturnToLearn={() => setView("learn")} onEditCard={noop} onEditDeck={noop} flagNames={[]} onSetCardStudyState={() => null} onSetDeckReviewOrder={() => deck} onReview={noop} onAskCardHelp={askCatalogCardHelp} />}
    {view === "study-variant" && <StudyMode deck={variantStudyDeck} decks={[variantStudyDeck]} notes={[variantStudyGraph.note]} deckId={variantStudyDeck.id} mediaStore={null} getNow={() => selection.now} simulationOffsetMinutes={0} pomodoroTimer={null} onStartPomodoro={noop} onExit={() => setView("")} onReturnToLearn={() => setView("")} onEditCard={(_deckId, _cardId, tab) => toast(`Karteneditor öffnet sich im Tab ${tab === "variants" ? "Varianten" : "Inhalt"}.`)} onEditDeck={noop} flagNames={[]} onSetCardStudyState={() => null} onSetDeckReviewOrder={() => variantStudyDeck} onReview={noop} onAskCardHelp={askCatalogCardHelp} />}
    {view === "study-variant-image" && catalogMediaStore && <StudyMode deck={imageVariantDeck} decks={[imageVariantDeck]} notes={[imageVariantGraph.note]} deckId={imageVariantDeck.id} mediaStore={catalogMediaStore} getNow={() => selection.now} simulationOffsetMinutes={0} pomodoroTimer={null} onStartPomodoro={noop} onExit={() => setView("")} onReturnToLearn={() => setView("")} onEditCard={(_deckId, _cardId, tab) => toast(`Karteneditor öffnet sich im Tab ${tab === "variants" ? "Varianten" : "Inhalt"}.`)} onEditDeck={noop} flagNames={[]} onSetCardStudyState={() => null} onSetDeckReviewOrder={() => imageVariantDeck} onReview={noop} onAskCardHelp={askCatalogCardHelp} />}
    </WorkspaceStoreContext.Provider></section>
  </div>}</>;
}

/** The editor's reads and instant actions stay inside the preview; nothing reaches a repository or the cloud. */
const catalogCardEditorServices: CardEditorServices = {
  flagNames: ["", "", "Wiederholen", "", "", "", ""],
  moveCard: async () => null,
  resetCards: async () => [],
  setCardsLeech: async () => [],
  buryCards: async () => [],
  restoreCardStudies: async () => [],
  editVariant: async () => undefined,
  removeNoteMedia: async () => null,
  loadCard: async () => null,
  listReviewEvents: async () => [],
  listTagDirectory: async () => [{ tag: "Geografie::Europa", noteCount: 12, importedCount: 0 }, { tag: "Geografie::Asien", noteCount: 8, importedCount: 0 }],
  listNoteTypes: async () => [{ id: "demo-basic", name: "Einfach" }],
  listExamsForDeck: async () => [],
  prefetchCard: () => undefined,
  cloud: null,
  openFlagNames: () => undefined,
  openSyncConflicts: () => undefined,
};

const ICON_ROLES: Array<[LucideIcon, string]> = [[Plus, "Hinzufügen"], [Save, "Speichern"], [Pencil, "Bearbeiten"], [Copy, "Kopieren"], [Trash2, "Löschen"], [X, "Schließen"], [Eye, "Vorschau"], [Star, "Markieren"], [Ban, "Aussetzen"], [RefreshCw, "Synchronisieren"], [Sparkles, "KI-Variante"], [Settings, "Einstellungen"]];

function IconRolesDemo() {
  return <Demo title="Aktionen und ihre Icons"><ul className="catalog-icon-roles">{ICON_ROLES.map(([Icon, label]) => <li key={label}><span className="grid size-control place-items-center rounded-control bg-core-surface-muted text-core-action"><Icon size={18} aria-hidden="true" /></span>{label}</li>)}</ul></Demo>;
}

/** Masks on the sample heart: two single cards, one group of two and a mask that stays hidden. */
function OcclusionEditorDemo() {
  const [masks, setMasks] = useState<OcclusionMask[]>([
    { id: "mask-1", ordinal: 1, shape: { kind: "rect", left: 0.2, top: 0.22, width: 0.22, height: 0.28, angle: 0 }, alwaysOccluded: false },
    { id: "mask-2", ordinal: 2, shape: { kind: "ellipse", left: 0.63, top: 0.3, width: 0.2, height: 0.3, angle: 0 }, alwaysOccluded: false },
    { id: "mask-3", ordinal: 2, shape: { kind: "polygon", points: [[0.5, 0.62], [0.6, 0.62], [0.55, 0.75]] }, alwaysOccluded: false },
    { id: "mask-4", ordinal: 0, shape: { kind: "text", left: 0.7, top: 0.06, text: "Vorhof", scale: 1, fontSize: 0.07, angle: 0 }, alwaysOccluded: true },
  ]);
  const [mode, setMode] = useState<OcclusionMode>("hide-all-guess-one");
  return <Demo title="OcclusionEditor · zeichnen, gruppieren und Modus wählen" wide><OcclusionEditor imageUrl={noteDemoImage} imageAlt="Schematisches Herz" masks={masks} mode={mode} onMasksChange={setMasks} onModeChange={setMode} /></Demo>;
}

/** Catalog chapters in the order of the shared UI catalog structure. */
export type CatalogSectionId = "grundlagen" | "primitive" | "shared" | "fachmuster" | "icons";

export const DEMO_GROUPS = [
  { id: "aktionen", section: "primitive", title: "Button", description: "Text-, Icon-, Querlink-, Aktionskarten-, Markierungs- und Bewertungsbuttons.", components: ["ActionButton", "IconButton", "CrossLinkButton", "CreationActionCard", "CardMarkButton", "CardStudyStateControls"], render: () => <><ActionsDemo section="buttons" /><ControlsDemo section="buttons" /><LearningDemo section="buttons" /></> },
  { id: "auswahl", section: "primitive", title: "SegmentedControl", description: "Segmente, gleitende Tabs, reine Icon-Auswahl und Dreifach-Schalter.", components: ["CoreSegmentedControl", "CoreSlidingTabs", "CoreIconSegmentedControl", "CoreTriStateControl"], render: () => <ControlsDemo section="segments" /> },
  { id: "formulare", section: "primitive", title: "Input- und Select-Familie", description: "Text, Zahl mit Einheit, Passwort, mehrzeilige Eingaben, Select, Datum, Datei, Einstellungszeilen und Lerneinstellungen.", components: ["CoreSelect", "CoreNumberField", "DeckSelect", "DeckMultiSelect", "CoreDatePicker", "FileDropField", "PomodoroTimerControl", "LearningSettingsPanel"], wide: true, render: () => <><FormsDemo section="forms" /><LearningDemo section="forms" /></> },
  { id: "auswahlfelder", section: "primitive", title: "Checkbox, Radio, Schalter und Schieberegler", description: "Auswahl einzelner und mehrerer Werte, Ein/Aus-Zustände und Werte auf einer Skala.", components: ["CoreCheckbox", "CoreCheckboxGroup", "CoreRadio", "CoreRadioGroup", "CoreSwitch", "CoreModeControl", "CoreSlider"], render: ChoiceControlsDemo },
  { id: "badges", section: "primitive", title: "Tag", description: "Gemeinsames Tag in fünf Tönen und mit Farbpunkt.", components: ["CoreTag"], render: BadgesDemo },
  { id: "tooltips", section: "primitive", title: "Tooltip", description: "Hinweise mit Text, Wert oder Stapelidentität.", components: ["CoreTooltip", "CoreTooltipProvider"], render: () => <ActionsDemo section="tooltips" /> },
  { id: "feedback", section: "primitive", title: "Toaster / StatusMessage", description: "Info, Erfolg, Warnung, Fehler und schließbare Toasts.", components: ["StatusMessage", "SuccessToast", "SuccessToastProvider"], render: () => <FeedbackDemo section="feedback" /> },
  { id: "progress", section: "primitive", title: "Fortschritt", description: "Tagesfortschritt, Zeitfortschritt sowie bestimmte und unbestimmte Prozessanzeigen.", components: ["DailyReviewProgress", "PomodoroProgress", "VariantGenerationBar"], render: () => <><FeedbackDemo section="progress" /><LearningDemo section="progress" /></> },
  { id: "dialogs", section: "primitive", title: "Dialog-Familie", description: "Bestätigung, Dialograhmen, Speicherleiste, Kartenvorschau und Lerneinstellungen.", components: ["ActionDialog", "DialogFrame", "SettingsSaveBar", "CardPreviewDialog", "StudySettingsOverlay"], render: () => <><FeedbackDemo section="dialogs" /><StructureDemo section="dialogs" /><ContentDemo section="dialogs" /><LearningDemo section="dialogs" /></> },
  { id: "tags-flags", section: "primitive", title: "Tags und Flaggen", description: "Tag-Eingabe, Flaggenwähler und Flaggenpunkt.", components: ["TagInput", "FlagPicker", "FlagDot"], render: TagsAndFlagsDemo },
  { id: "colors", section: "primitive", title: "ColorPicker", description: "Farbfeld oder Werkzeug, Farbkreis und Schnellwahl.", components: ["ColorPicker"], render: () => <ContentDemo section="colors" /> },
  { id: "flaechen", section: "shared", title: "SoftPanel und EmptyState", description: "Inhaltsflächen und leere Zustände.", components: ["SoftPanel", "EmptyState"], render: () => <FoundationsDemo section="surfaces" /> },
  { id: "struktur", section: "shared", title: "Abschnittskopf, Schritte und Reiter", description: "Kopf jeder Fläche, Schrittlinie und Unterstreichungs-Reiter.", components: ["SectionHeader", "Steps", "CoreTabs", "CoreTabPanel"], wide: true, render: () => <StructureDemo section="struktur" /> },
  { id: "headings", section: "shared", title: "PageHeader und LearningAreaHeader", description: "Seitentitel sowie Köpfe von Lernen und Kartenverwaltung.", components: ["PageHeader", "LearningAreaHeader"], render: () => <><FoundationsDemo section="headings" /><NavigationDemo section="headings" /></> },
  { id: "navigation", section: "shared", title: "AppNavigation, Einstellungsdialog und InPageNavigation", description: "Responsive Hauptnavigation, CoRe-Wortmarke, der gemeinsame Rahmen der Einstellungsdialoge und die Sprunglinks der Statistik.", components: ["AppNavigation", "CoreWordmark", "SettingsDialog", "InPageNavigation"], render: () => <><NavigationDemo section="navigation" /><ProductViewsDemo kind="settings" /></> },
  { id: "stapel", section: "shared", title: "Stapeltabelle, Baum und Menü", description: "Tabellenzeile, Stapelbaum, Unterstapel und Optionsmenü.", components: ["DeckSummaryHeader", "DeckSummaryRow", "DeckOptionsMenu", "DeckTree"], wide: true, render: () => <DecksDemo section="stapel" /> },
  { id: "charts", section: "fachmuster", title: "Kennzahlen und Heatmap", description: "Einzelne Kennzahl, Kennzahlzeile und Lern-Heatmap.", components: ["StatTile", "MetricRow", "StudyHeatmap"], wide: true, render: () => <><FoundationsDemo section="charts" /><DecksDemo section="charts" /></> },
  { id: "inhalt", section: "fachmuster", title: "Karteninhalte", description: "Sanitisiertes HTML, Kartenfläche und Lernkarte. Alle Kartentypen stehen in der eigenen Referenz.", components: ["CardHtml", "CardPresentationSurface", "NoteCardContent"], wide: true, render: () => <ContentDemo section="inhalt" /> },
  { id: "editor", section: "fachmuster", title: "Texteditor und Inhaltsbausteine", description: "Rich-Text-Toolbar und Inhaltsbausteine.", components: ["RichTextEditor", "NoteBlockControls"], wide: true, render: () => <><ContentDemo section="editor" /><NoteBlocksDemo /></> },
  { id: "bildverdeckung-editor", section: "fachmuster", title: "Bildverdeckungs-Editor", description: "Masken zeichnen, gruppieren und den Verdeckungsmodus wählen.", components: ["OcclusionEditor"], wide: true, render: OcclusionEditorDemo },
  { id: "media", section: "fachmuster", title: "PDF-Vorschau", description: "PDF-Vorschau mit Textauswahl.", components: ["PdfDocumentViewer"], wide: true, render: () => <ContentDemo section="media" /> },
  { id: "symbols", section: "icons", title: "Iconflächen", description: "Iconfläche und Stapelidentität.", components: ["OrbIcon", "DeckAppearanceIcon"], render: () => <FoundationsDemo section="symbols" /> },
  { id: "icon-rollen", section: "icons", title: "Häufige Icon-Rollen", description: "Wiederkehrende Aktionen und ihre Lucide-Icons.", components: [], render: IconRolesDemo },
  { id: "brain-mascots", section: "icons", title: "Gehirn-Maskottchen und Motivation", description: "SVG-Maskottchen mit interaktiven Augen und täglicher Lernimpuls.", components: ["BrainMascot", "DailyMotivationWidget"], wide: true, render: () => <><Demo title="BrainMascot"><BrainMascot id="pastell-lernen" interactive /></Demo><Demo title="DailyMotivationWidget"><DailyMotivationWidget now="2026-10-29T12:00:00Z" timeZone="Europe/Berlin" dayStartHour={3} /></Demo></> },
] satisfies Array<{ id: string; section: CatalogSectionId; title: string; description: string; components: string[]; wide?: boolean; render: () => React.ReactNode }>;

const noteDemoField = (id: string, role: NoteField["role"], html: string): NoteField => ({ id, name: id, role, html });
const noteDemoContent = (fields: NoteField[], interaction: NoteContent["interaction"], speech: NoteContent["speech"] = []): NoteContent => ({ schemaVersion: 1, fields, interaction, speech, tags: [] });
const noteDemoReveal = (typed = false): NoteContent["interaction"] => ({ kind: "reveal", prompts: [{ key: "forward", name: "Vorwärts", instruction: "", questionFieldIds: ["Frage"], answerFieldIds: ["Antwort"], requires: null, typeInFieldId: typed ? "Antwort" : null }] });
function noteDemoAudio() {
  const bytes = new Uint8Array(8044);
  const view = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, "RIFF"], [8, "WAVEfmt "], [36, "data"]] as const) bytes.set(Array.from(text, (letter) => letter.charCodeAt(0)), offset);
  for (const [offset, value] of [[4, 8036], [16, 16], [24, 8000], [28, 8000], [40, 8000]]) view.setUint32(offset, value, true);
  for (const [offset, value] of [[20, 1], [22, 1], [32, 1], [34, 8]]) view.setUint16(offset, value, true);
  for (let index = 0; index < 8000; index += 1) bytes[44 + index] = 128 + Math.round(20 * Math.sin(index * 2 * Math.PI * 440 / 8000));
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}
const noteDemoTone = noteDemoAudio();
const noteDemoImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320" viewBox="0 0 600 320"><rect width="600" height="320" fill="#edf1f6"/><path d="M190 230C50 140 130 25 220 105C310 25 390 140 250 230Z" fill="#e28b68"/><rect x="390" y="110" width="100" height="80" rx="8" fill="#6f7e9e"/><text x="70" y="285" font-family="sans-serif" font-size="24" fill="#181d25">Herz · schematisches Beispiel</text></svg>')}`;
const noteDemoMasks: Extract<NoteContent["interaction"], { kind: "image-occlusion" }>["masks"] = [
  { id: "rect", ordinal: 1, shape: { kind: "rect", left: .18, top: .2, width: .24, height: .28, angle: 0 }, alwaysOccluded: false },
  { id: "ellipse", ordinal: 2, shape: { kind: "ellipse", left: .65, top: .34, width: .17, height: .25, angle: 0 }, alwaysOccluded: false },
  { id: "polygon", ordinal: 2, shape: { kind: "polygon", points: [[.1, .1], [.18, .1], [.14, .2]] }, alwaysOccluded: true },
  { id: "label", ordinal: 1, shape: { kind: "text", left: .18, top: .15, text: "Ziel", scale: 1, fontSize: null, angle: 0 }, alwaysOccluded: false },
];
// An imported note type with its own design (ADR-047): the card shows the author's template and CSS.
const noteDemoLayout: NoteTypeSource = {
  id: "catalog-layout", ankiNotetypeId: "catalog", name: "Pokémon · Bilderkennung", translator: { id: "generic", version: 3 }, kind: 0, originalStockKind: 0,
  css: '.card{font-family:Georgia,serif;text-align:center;background:#f4f0e8;color:#252525}.nightMode .card{background:#202124;color:#f1f0ed}'
    + '.karte{max-width:26rem;margin:0 auto;padding:1rem;border:1px solid #e8e2d8;border-radius:1rem;background:#fffdf8}.nightMode .karte{background:#292a2c;border-color:#484640}'
    + '.meta{color:#77736d}.nr:not([data-generation="X"])::before{content:"#"}.name{font-size:1.5em;font-weight:650}'
    + '.typ{display:inline-block;padding:.1em .5em;border-radius:.5em;color:#fff;font-weight:700}.typ[data-typ="Wasser"]{background:#2c9be3}',
  fields: ["Name", "Nummer", "Generation", "Bild", "Typ"].map((name, ordinal) => ({ name, ordinal })),
  templates: [{
    name: "Bilderkennung", ordinal: 0, targetDeckId: null,
    front: '<div class="karte"><div class="meta"><span class="nr" data-generation="{{Generation}}">{{Nummer}}</span> · Generation {{Generation}}</div>{{Bild}}</div>',
    back: '{{FrontSide}}<hr id=answer><div class="name">{{Name}}</div>{{Typ}}',
  }],
  config: {},
};
// Only the original-layout case reads it; the other cases come from no generic translation.
const noteDemoLayoutSource: NoteLayoutSource = { loadNoteTypeSource: async () => noteDemoLayout, deckName: () => "Pokémon" };
const noteDemoCases = [
  { id: "roles", title: "Feldrollen · Frage und Antwort mit Trennlinie, Hinweise, Zusatz und Quellen", value: noteDemoContent([noteDemoField("Frage", "prompt", "Welches Hormon senkt den Blutzucker?"), noteDemoField("Antwort", "answer", "Insulin"), noteDemoField("Hinweis", "hint", "Es wird in den Betazellen gebildet."), noteDemoField("Zusatz", "extra", "Insulin fördert die Aufnahme von Glukose."), noteDemoField("Quelle", "source", '<a href="https://www.amboss.com/de">AMBOSS</a>'), noteDemoField("Intern", "note", "Dieses Feld erscheint nur im Editor.")], noteDemoReveal()) },
  { id: "cloze", title: "Lücken · Mehrfachnummern und Hinweise", value: noteDemoContent([noteDemoField("Text", "prompt", "{{c1,3::Insulin::Hinweis: Hormon}} senkt, {{c2::Glukagon}} hebt den Blutzucker.")], { kind: "cloze" }) },
  { id: "nested", title: "Lücken · Verschachtelung", value: noteDemoContent([noteDemoField("Text", "prompt", "{{c1::Das Herz hat {{c2::vier}} Hohlräume.}}")], { kind: "cloze" }) },
  { id: "cloze-math", title: "Lücke in Formel", value: noteDemoContent([noteDemoField("Text", "prompt", "\\(E = {{c1::m}}c^2\\)")], { kind: "cloze" }) },
  { id: "occlusion-all", title: "Bildverdeckung · Alle verdecken, eine erraten", value: noteDemoContent([noteDemoField("Frage", "prompt", "Welcher Bereich ist markiert?"), noteDemoField("Zusatz", "extra", "Die aktive Maske zeigt nach dem Aufdecken nur den Umriss.")], { kind: "image-occlusion", image: "herz.svg", mode: "hide-all-guess-one", masks: noteDemoMasks }) },
  { id: "occlusion-one", title: "Bildverdeckung · Eine verdecken", value: noteDemoContent([noteDemoField("Frage", "prompt", "Benenne den verdeckten Bereich.")], { kind: "image-occlusion", image: "herz.svg", mode: "hide-one-guess-one", masks: noteDemoMasks }) },
  { id: "typed", title: "Antwort eintippen", value: noteDemoContent([noteDemoField("Frage", "prompt", "Welches Organ pumpt das Blut?"), noteDemoField("Antwort", "answer", "Herz")], noteDemoReveal(true)) },
  ...(["single", "multiple", "kprim"] as const).map((mode) => ({ id: mode, title: mode === "single" ? "Single Choice" : mode === "multiple" ? "Multiple Choice" : "Kprim", value: noteDemoContent([noteDemoField("Frage", "prompt", "Welche Aussagen zum Herz-Kreislauf-System treffen zu?"), noteDemoField("Antwort", "answer", "Das Herz pumpt Blut. Blut transportiert Sauerstoff.")], { kind: "choice", mode, options: ["Das Herz pumpt Blut.", "Die Lunge produziert Blut.", "Blut transportiert Sauerstoff.", "Alle Gefäße haben identische Wände."].map((html, index) => ({ id: `o${index}`, html, correct: index === 0 || (mode !== "single" && index === 2) })) }) })),
  { id: "math", title: "Formeln · MathJax, Anki-LaTeX und sichtbarer Fehler", value: noteDemoContent([noteDemoField("Frage", "prompt", "Inline: \\(x^2 + y^2 = z^2\\). \\[\\frac{1}{2}\\] [latex]\\sqrt{2}[/latex] [$]\\alpha[/$]"), noteDemoField("Antwort", "answer", "Nicht unterstützte Formel: \\(\\unsupportedcommand\\)")], noteDemoReveal()) },
  { id: "choice-rich", title: "Auswahl mit Formel und Bild", value: noteDemoContent([noteDemoField("Frage", "prompt", "Wähle den Bruch mit dem schematischen Herz."), noteDemoField("Antwort", "answer", "Die erste Option zeigt den Bruch und das Bild.")], { kind: "choice", mode: "single", options: [{ id: "fraction", html: '\\(\\frac{1}{2}\\)<img src="herz.svg" alt="Schematisches Herz">', correct: true }, { id: "zero", html: "0", correct: false }] }) },
  { id: "rich-media", title: "Rich Text · Tabelle, Farbe, Audio und Video", value: noteDemoContent([noteDemoField("Frage", "prompt", '<p style="color:yellow">Kontrastangepasster gelber Text</p><table style="width:100%;border-collapse:collapse"><tr><td style="border:1px solid gray;padding:4px">Ein langer Begriff zur Prüfung schmaler Ansichten</td><td>Wert</td></tr></table><img src="herz.svg">[sound:ton.wav][sound:film.mp4]'), noteDemoField("Antwort", "answer", "Tabellen bleiben lokal scrollbar; Medien werden über aufgelöste URLs geladen.")], noteDemoReveal()) },
  { id: "original-layout", title: "Originallayout · Template und CSS eines importierten Stapels", layout: noteDemoLayout, value: noteDemoContent(
    [["Name", "answer", "Karpador"], ["Nummer", "prompt", "???"], ["Generation", "prompt", "X"], ["Bild", "prompt", '<img src="herz.svg">'], ["Typ", "answer", '<span class="typ" data-typ="Wasser">Wasser</span>']]
      .map(([name, role, html], ordinal): NoteField => ({ id: `f${ordinal}`, name, role: role as NoteField["role"], html })),
    { kind: "reveal", prompts: [{ key: "anki-0", name: "Bilderkennung", instruction: "", questionFieldIds: ["f1", "f2", "f3"], answerFieldIds: ["f0", "f4"], requires: null, typeInFieldId: null }] },
  ) },
  { id: "speech", title: "Vorlesen und AMBOSS-Textauswahl", value: noteDemoContent([noteDemoField("Frage", "prompt", "Herzinsuffizienz bezeichnet eine eingeschränkte Pumpfunktion des Herzens."), noteDemoField("Antwort", "answer", "Markiere einen Begriff für die AMBOSS-Suche.")], noteDemoReveal(), [{ fieldId: "Frage", language: "de-DE" }]) },
];
const notePromptLabel = (key: string) => ({ forward: "Vorwärts", reverse: "Rückwärts", choice: "Auswahl" } as Record<string, string>)[key] ?? key.replace(/^cloze:/, "Lücke ").replace(/^io:/, "Maske ");
const noteDemoGraphs = noteDemoCases.map((item) => {
  const graph = createNote({ id: `note-demo-${item.id}`, content: item.value, deckId: "catalog", createdAt: "2026-10-06T12:00:00.000Z" });
  return { ...item, graph: "layout" in item && item.layout ? { ...graph, note: { ...graph.note, translator: { id: "generic", version: 3 }, noteTypeSourceId: item.layout.id } } : graph };
});

function NoteDemo({ item, titled = true }: { item: typeof noteDemoGraphs[number]; titled?: boolean }) {
  const [revealed, setRevealed] = React.useState(false);
  const [generation, setGeneration] = React.useState(0);
  const [key, setKey] = React.useState(item.graph.cards[0].promptKey);
  const [surface, setSurface] = React.useState<"review" | "preview">("review");
  const card = item.graph.cards.find((candidate) => candidate.promptKey === key)!;
  return <article className="catalog-demo catalog-demo-wide" data-note-demo={item.id}>
    {titled ? <h4>{item.title}</h4> : null}
    <div className="catalog-demo-content grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <CoreSegmentedControl ariaLabel="Darstellung" value={surface} options={[{ value: "review", label: "Review" }, { value: "preview", label: "Vorschau" }]} onValueChange={(value) => { setSurface(value); setRevealed(false); }} />
        {item.graph.cards.length > 1 ? <CoreSelect ariaLabel="Abfrage" value={key} options={item.graph.cards.map((candidate) => ({ value: candidate.promptKey, label: notePromptLabel(candidate.promptKey) }))} onValueChange={(value) => { setKey(value); setRevealed(false); }} /> : null}
      </div>
      <NoteLayoutContext.Provider value={noteDemoLayoutSource}><NoteCardContent key={`${generation}:${key}`} note={item.graph.note} card={card} revealed={revealed} onReveal={() => setRevealed(true)} surface={surface} mediaUrls={{ "herz.svg": noteDemoImage, "ton.wav": noteDemoTone, "film.mp4": "data:video/mp4;base64,AAAAJGZ0eXBpc29tAAACAGlzb21pc282aXNvMmF2YzFtcDQxAAACy21vb3YAAAB4bXZoZAEAAAAAAAAA5usLYwAAAADm6wtjAAAD6AAAAAAAAAAhAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIjdHJhawAAAGh0a2hkAQAAAwAAAADm6wtjAAAAAObrC2MAAAABAAAAAAAAAAAAAAAhAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAACgAAAAWgAAAAABs21kaWEAAAAsbWRoZAEAAAAAAAAA5usLYwAAAADm6wtjAAB1MAAAAAAAAAAhVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVJtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAlZGluZgAAAB1kcmVmAAAAAAAAAAEAAAANdXJsIAAAAAEAAAABEXN0YmwAAAAQc3RzYwAAAAAAAAAAAAAAEHN0dHMAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAMVzdHNkAAAAAAAAAAEAAAC1YXZjMQAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAACgAFoASAAAAEgAAAAAAAAAAQtBVkMxIENvZGluZwAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAAAAAAAAAAAAChhdmNDAULADP/hABFnQsAMjGgo15JqDAwMDwiEagEABGjOPIAAAAATY29scm5jbHgABgAGAAYAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAAAAAGhtb29mAAAAEG1maGQAAAAAAAAAAQAAAFB0cmFmAAAAFHRmaGQAAgAgAAAAAQEBAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAACB0cnVuAQADBQAAAAEAAABwAgAAAAAAA+cAAAH+AAACBm1kYXQAAAH6ZbgABAQ///4IooABb3k5OTk5OTk5OTrrrrrrrrrrr/4yhxiOANraTfkFrf64Jvrz25kwBEjl99pNlbtyIPr0+dqgeM8AMxs2SY+AbshrpgNlt3gsLfDI0Th9v4xzwGh9YOLTSf/yDWnISdadTOPCqiaOwRf4DADCPKbh8BOLwABAGjVrRvE23+VDaNeF60jxESQx2vegj0UxKTYRTf6Z0epuBUBttNIQvf9YURMZwBXNMmbU3xmWB/+X71LFKtVPqhZPCb1DBGOZdb4YWdggzxfABjZW9LvwS3fOnbUVs3p/PnVzt2EI5+7cxLQ69GlLSDkRjBe2ai0f6zKCW5N82lIV8//FQEYvgCRk02PPL9ACZZuwWFvsbOmlmZme8KF7vCp51p/5RE4p9b/DmR0T9BCyQrz/gbp8EEojkbmj0TG9vPAHjbkPf6uuvpmI/+H4Bj6e6/e+Gkdksv9P+SbYf8JZUlMP9L11z62OSfzv+8O9ikX/bx4pn+YUP/4S7rjX0TWj66U2/y5vW7JF+9/XikP+EsIXJBUoZrv/AfXSGq/bBF/+Ep/dn8J9ZOMLEh7PSJP7f/oF0/+Ery1nD6tq2Ob+t7/wrz+UzC2pd2tNL3//1b//h7L2+yS/35jXf+7/XXXXXXXXXfff/8f4IIHBAgtl999999999+AAAABMbWZyYQAAADR0ZnJhAQAAAAAAAAEAAAA/AAAAAQAAAAAAAAAAAAAAAAAAAu8AAAABAAAAAQAAAAEAAAAQbWZybwAAAAAAAABM" }} /></NoteLayoutContext.Provider>
      <div className="flex flex-wrap gap-3"><ActionButton variant="primary" disabled={revealed} onClick={() => setRevealed(true)}>Aufdecken</ActionButton><ActionButton variant="secondary" onClick={() => { setRevealed(false); setGeneration((value) => value + 1); }}>Zurücksetzen</ActionButton></div>
    </div>
  </article>;
}

/** One renderer case by id, without its own heading; the card reference shows it inside its card. */
export function NoteCaseDemo({ id }: { id: string }) {
  return <NoteDemo item={noteDemoGraphs.find((item) => item.id === id)!} titled={false} />;
}

export const NOTE_CASE_TITLES: Record<string, string> = Object.fromEntries(noteDemoCases.map((item) => [item.id, item.title]));
