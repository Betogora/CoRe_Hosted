import { CreationActionCard } from "../src/ui/CreationActionCard.tsx";
import React, { useRef, useState } from "react";
import { BookOpen, ChevronRight, Home, Info, Layers, Plus, Save, Settings, Trash2, Type } from "lucide-react";
import { createBasicLearningItem, createReviewState, createCoreDeck, createCoreNoteTypeDefinition, createManualCoreDeck } from "../src/coreModel.ts";
import type { CardType, CoreMode, NewReviewOrder } from "../src/coreTypes.ts";
import { createDeckLibraryModel } from "../src/libraryModel.ts";
import { createStudyHeatmapModelFromCounts } from "../src/studyHeatmapModel.ts";
import { createDeckLearningSettingsDraft } from "../src/settingsDraft.ts";
import { createPomodoroTimer, type PomodoroTimer } from "../src/pomodoroTimer.ts";
import { ActionButton, CrossLinkButton, IconButton } from "../src/ui/actionUi.tsx";
import { ActionDialog, CardMarkButton, CoreModeControl, CoreSegmentedControl, CoreSlidingTabs, EmptyState, OrbIcon, PageHeader, SegmentedDonut, SoftPanel, StatTile } from "../src/ui/coreUi.tsx";
import { StatusMessage, useSuccessToast } from "../src/ui/feedbackUi.tsx";
import { CoreSelect, DeckMultiSelect, DeckSelect } from "../src/ui/selectUi.tsx";
import { CoreTooltip } from "../src/ui/tooltipUi.tsx";
import { CoreDatePicker } from "../src/ui/CoreDatePicker.tsx";
import { ColorWheelPicker } from "../src/ui/ColorWheelPicker.tsx";
import { ColorPopover, ColorToolButton } from "../src/ui/colorPicker.tsx";
import { FileDropField } from "../src/ui/FileDropField.tsx";
import { SettingsSaveBar } from "../src/ui/SettingsSaveBar.tsx";
import { AppNavigation } from "../src/ui/AppNavigation.tsx";
import { InPageNavigation } from "../src/ui/InPageNavigation.tsx";
import { DeckAppearanceIcon } from "../src/ui/deckAppearance.tsx";
import { DeckOptionsMenu } from "../src/ui/DeckOptionsMenu.tsx";
import { DeckSummaryHeader, DeckSummaryRow } from "../src/ui/DeckSummaryRow.tsx";
import { DeckTree } from "../src/ui/DeckTree.tsx";
import { DailyReviewProgress } from "../src/ui/DailyReviewProgress.tsx";
import { StudyHeatmap } from "../src/ui/StudyHeatmap.tsx";
import { PomodoroProgress, PomodoroTimerControl } from "../src/ui/pomodoroTimerUi.tsx";
import { LearningSettingsPanel } from "../src/ui/LearningSettingsPanel.tsx";
import { CardStudyStateControls } from "../src/ui/CardStudyStateControls.tsx";
import { StudySettingsOverlay } from "../src/ui/StudySettingsOverlay.tsx";
import { CardPreviewDialog } from "../src/ui/CardPreviewDialog.tsx";
import { CardPresentationSurface } from "../src/ui/CardPresentationSurface.tsx";
import { StudyCardContent } from "../src/ui/StudyCardContent.tsx";
import { CardHtml } from "../src/ui/cardMedia.tsx";
import { RichTextEditor } from "../src/ui/RichTextEditor.tsx";
import { PdfDocumentViewer } from "../src/ui/PdfDocumentViewer.tsx";
import { LearningAreaHeader } from "../src/screens/LearningAreaHeader.tsx";
import type { LearnArea } from "../src/screens/screenConstants.ts";
import { ratingButtons } from "../src/screens/screenConstants.ts";
import { AuthGateScreen } from "../src/screens/AuthGateScreen.tsx";
import { SyncConflictPanel } from "../src/screens/SyncConflictPanel.tsx";
import { StatisticsScreenContent } from "../src/screens/StatisticsScreen.tsx";
import { SimulatorScreen } from "../src/screens/SimulatorScreen.tsx";
import { HelpScreen } from "../src/screens/HelpScreen.tsx";
import { projectStatistics, type StatisticsSelection } from "../src/statisticsModel.ts";
import { createMenuModel } from "../src/menuModel.ts";
import { createCoreRepository } from "../src/coreRepository.ts";
import { getGlobalSchedulerPreferences } from "../src/learningProfiles.ts";
import { createViewRoute } from "../src/appNavigation.ts";
import { DashboardScreen } from "../src/screens/DashboardScreen.tsx";
import { LearnScreen } from "../src/screens/LearnScreen.tsx";
import { CreationScreen } from "../src/screens/CreationScreen.tsx";
import { DecksScreen } from "../src/screens/DecksScreen.tsx";
import { SettingsScreen } from "../src/screens/SettingsScreen.tsx";
import { GlobalCardSettingsScreen } from "../src/screens/GlobalCardSettingsScreen.tsx";
import { DeckSettingsScreen } from "../src/screens/DeckSettingsScreen.tsx";
import { StudyMode } from "../src/screens/StudyMode.tsx";

const today = "2026-10-02";
const imageReference = "a".repeat(40);
const sampleMedia = { [imageReference]: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160" viewBox="0 0 400 160"><rect width="400" height="160" rx="12" fill="#dde3ed"/><path d="M40 130V60l60-35 60 35v70M230 130V45h90v85M210 130h130" fill="none" stroke="#667492" stroke-width="6"/><text x="40" y="150" font-size="14">Lissabon · Beispielbild</text></svg>')}` };
const deck = createManualCoreDeck({ deckName: "Welt-Hauptstädte", card: { cardType: "basic", front: "Was ist die Hauptstadt von Portugal?", back: "Lissabon" } });
deck.id = "catalog-world";
deck.cards = [deck.cards[0], createBasicLearningItem(deck.id, "Was ist die Hauptstadt von Spanien?", "Madrid")];
const child = createManualCoreDeck({ deckName: "Europa – ein sehr langer Name für schmale Ansichten", card: { cardType: "basic", front: "Land", back: "Portugal" } });
child.id = "catalog-europe";
child.parentDeckId = deck.id;
child.hierarchyPath = [deck.name, child.name];
const sampleDecks = [deck, child, ...["Biologie", "Medizin", "Sprachen", "Geschichte"].map((name, index) => ({ ...deck, id: `catalog-${index}`, parentDeckId: null, name, hierarchyPath: [name], cards: [] }))];

export function Demo({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <article className={`catalog-demo${wide ? " catalog-demo-wide" : ""}`}><h3>{title}</h3><div className="catalog-demo-content">{children}</div></article>;
}

function ActionsDemo({ section }: { section: string }) {
  const toast = useSuccessToast();
  return <>
    {section === "buttons" && <Demo title="ActionButton · Varianten und Zustände">
      <div className="catalog-row">{(["primary", "secondary", "destructive"] as const).map((variant) => <ActionButton key={variant} variant={variant} icon={variant === "destructive" ? Trash2 : Save} onClick={() => toast("Beispielaktion ausgeführt.")}>{variant === "primary" ? "Speichern" : variant === "secondary" ? "Abbrechen" : "Löschen"}</ActionButton>)}</div>
      <div className="catalog-row"><ActionButton variant="primary" disabled>Deaktiviert</ActionButton><ActionButton variant="primary" loading>Wird gespeichert …</ActionButton><ActionButton variant="secondary" disabled>Deaktiviert</ActionButton></div>
    </Demo>}
    {section === "buttons" && <Demo title="CreationActionCard · Erstellen und leerer Einstieg"><CreationActionCard title="Karten selbst erstellen" icon={Plus} tone="info" onSelect={() => toast("Erstellen gewählt.")} /><CreationActionCard title="Anki-Stapel importieren" description="Eine vorhandene APKG-Datei übernehmen." icon={Layers} tone="success" onSelect={() => toast("Import gewählt.")} /></Demo>}
    {section === "buttons" && <Demo title="IconButton · normal, destruktiv und ghost"><div className="catalog-row">{(["secondary", "destructive", "ghost"] as const).map((variant) => <CoreTooltip key={variant} label={variant}><IconButton variant={variant} label={`${variant}: Beispielaktion`} icon={variant === "destructive" ? Trash2 : Settings} onClick={() => toast("Icon-Aktion ausgeführt.")} /></CoreTooltip>)}<IconButton label="Deaktiviert" icon={Plus} disabled /></div></Demo>}
    {section === "buttons" && <Demo title="CrossLinkButton · Link und Aktion"><div className="catalog-row"><CrossLinkButton href="journeys.html">Journeys ansehen</CrossLinkButton><CrossLinkButton onSelect={() => toast("Querlink gewählt.")}>Alle ansehen</CrossLinkButton></div></Demo>}
    {section === "tooltips" && <Demo title="CoreTooltip · Text, Wert und Stapel"><div className="catalog-row"><CoreTooltip label="Kurzer Hinweis"><IconButton label="Hinweis anzeigen" icon={Info} /></CoreTooltip><CoreTooltip label="Neu" value="12 Karten" swatchColor="var(--core-learning-status-new)"><span tabIndex={0}>Lernstatus</span></CoreTooltip><CoreTooltip label="Welt-Hauptstädte" deckAppearance={deck.deckSettings.appearance}><span tabIndex={0}>Stapelhinweis</span></CoreTooltip></div></Demo>}
  </>;
}

function BadgesDemo() {
  return <Demo title="Lokale Badges und Kennzeichnungen"><p className="catalog-pattern-source">APKG-Vorschau und Kartensynchronisierung: <code>src/screens/ApkgImportPanel.tsx</code>, <code>src/screens/DecksScreen.tsx</code>.</p><div className="catalog-row"><span className="rounded-control bg-core-success-soft px-3 py-1 core-caption !font-semibold text-core-text">Originalkarte</span><span className="rounded-control bg-core-success-soft px-3 py-1 core-caption !font-semibold text-core-text">Vorderseite</span><span className="rounded-control bg-core-success-soft px-3 py-1 core-caption !font-semibold text-core-text">Rückseite</span><span className="rounded-round bg-core-warning-soft px-2 py-0.5 core-caption text-core-text">Synchronisierung klären</span></div><p className="core-caption text-core-muted">Variantenstatus verwendet ausschließlich Haken und Strich in der Tabellenfamilie.</p></Demo>;
}

function FoundationsDemo({ section }: { section: string }) {
  return <>
    {section === "surfaces" && <Demo title="SoftPanel"><SoftPanel className="p-6"><p className="core-body text-core-text">Erhöhte Inhaltsfläche mit kanonischem Schatten.</p></SoftPanel></Demo>}
    {section === "headings" && <Demo title="PageHeader"><PageHeader eyebrow="Review" title="Heute lernen" action={<IconButton label="Hinzufügen" icon={Plus} />} /></Demo>}
    {section === "surfaces" && <Demo title="EmptyState"><EmptyState icon={BookOpen} title="Noch keine Karten" body="Erstelle deine erste Karte oder importiere einen Anki-Stapel." action={<ActionButton variant="primary" icon={Plus}>Erste Karte erstellen</ActionButton>} /></Demo>}
    {section === "symbols" && <Demo title="OrbIcon und DeckAppearanceIcon"><div className="catalog-row"><OrbIcon icon={BookOpen} /><DeckAppearanceIcon deck={deck} /><DeckAppearanceIcon appearance={{ iconKey: "brain", iconColor: "#047857" }} /></div></Demo>}
    {section === "charts" && <Demo title="StatTile · Standard und kompakt"><div className="catalog-two"><StatTile label="Karten" value="128" icon={Layers} hint="In deiner Sammlung" /><StatTile label="Lernzeit" value="24 Min." size="compact" /></div></Demo>}
    {section === "charts" && <Demo title="SegmentedDonut · Größen und leerer Zustand"><div className="catalog-row">{(["default", "compact", "responsive"] as const).map((size) => <SegmentedDonut key={size} size={size} ariaLabel="16 gelernt, 12 neu, 4 offen und 8 fällig" segments={[{ key: "new", value: 12, color: "var(--core-learning-status-new)" }, { key: "open", value: 4, color: "var(--core-learning-status-in-progress)" }, { key: "due", value: 8, color: "var(--core-learning-status-due)" }, { key: "learned", value: 16, color: "var(--core-learning-status-learned)" }]} />)}<SegmentedDonut ariaLabel="Keine Karten" segments={[]} /></div></Demo>}
  </>;
}

function ControlsDemo({ section }: { section: string }) {
  const [mode, setMode] = useState<CoreMode>("auto");
  const [tab, setTab] = useState("front");
  const [marked, setMarked] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const options = [{ value: "front", label: "Vorderseite", icon: BookOpen }, { value: "back", label: "Rückseite", icon: Layers }];
  return <>
    {section === "segments" && <Demo title="CoreSegmentedControl · regulär und kompakt"><CoreSegmentedControl ariaLabel="Kartenseite" value={tab} options={options} onValueChange={setTab} /><CoreSegmentedControl ariaLabel="Kompakte Kartenseite" size="compact" value={tab} options={options} onValueChange={setTab} /><CoreSegmentedControl ariaLabel="Deaktivierte Kartenseite" value={tab} options={options} onValueChange={setTab} disabled /></Demo>}
    {section === "segments" && <Demo title="CoreSlidingTabs"><CoreSlidingTabs ariaLabel="Vorschautabs" value={tab} options={options} onValueChange={setTab} /></Demo>}
    {section === "segments" && <Demo title="CoreModeControl"><CoreModeControl value={mode} onChange={setMode} /></Demo>}
    {section === "buttons" && <Demo title="CardMarkButton und CardStudyStateControls"><CardMarkButton marked={marked} onMarkedChange={setMarked} /><CardStudyStateControls marked={marked} suspended={suspended} onMarkedChange={setMarked} onSuspendedChange={setSuspended} /><CardStudyStateControls marked suspended disabled onMarkedChange={setMarked} onSuspendedChange={setSuspended} /></Demo>}
  </>;
}

function FormsDemo({ section }: { section: string }) {
  const [value, setValue] = useState("reviews-first");
  const [deckId, setDeckId] = useState(deck.id);
  const [scope, setScope] = useState<"all" | string[]>([deck.id]);
  const [date, setDate] = useState(today);
  const [fileName, setFileName] = useState("");
  return <>
    {section === "forms" && <Demo title="CoreSelect"><CoreSelect ariaLabel="Kartenreihenfolge" value={value} onValueChange={setValue} options={[{ value: "reviews-first", label: "Fällige Karten zuerst" }, { value: "mixed", label: "Neue und fällige mischen" }, { value: "new-first", label: "Neue Karten zuerst" }]} /></Demo>}
    {section === "forms" && <Demo title="DeckSelect · Hierarchie und Suche"><DeckSelect ariaLabel="Zielstapel" value={deckId} onValueChange={setDeckId} decks={sampleDecks} /></Demo>}
    {section === "forms" && <Demo title="DeckMultiSelect · eingeschlossene Unterstapel"><DeckMultiSelect value={scope} onValueChange={setScope} decks={sampleDecks} /></Demo>}
    {section === "forms" && <Demo title="CoreDatePicker"><CoreDatePicker today={today} value={date} min="2026-09-01" max="2027-12-31" ariaLabel="Lerndatum wählen" onValueChange={setDate} /></Demo>}
    {section === "forms" && <Demo title="Native Felder · Typen, Auswahl und Validierung"><label className="catalog-field">Suche<input type="search" placeholder="Karten durchsuchen" className="min-h-11 rounded-control border border-core-border px-3 text-core-text" /></label><label className="catalog-field">Stapelname<input className="min-h-11 rounded-control border border-core-border px-3 text-core-text" defaultValue="Biologie" /></label><label className="catalog-field">Neue Karten pro Tag<input type="number" defaultValue={20} min={0} className="min-h-11 rounded-control border border-core-border px-3 text-core-text" /></label><label className="catalog-field">Ungültige Eingabe<input aria-invalid="true" aria-describedby="catalog-input-error" className="min-h-11 rounded-control border border-core-danger px-3" defaultValue="" /><span id="catalog-input-error" className="text-core-danger">Bitte einen Namen eingeben.</span></label><label className="catalog-row"><input type="checkbox" defaultChecked /> Auswahl aktiviert</label><label className="catalog-field">Mehrzeiliger Inhalt<textarea defaultValue="Zusätzlicher Kontext" className="rounded-control border border-core-border p-3" /></label><label className="catalog-field">Passwort<input type="password" defaultValue="beispiel" className="min-h-11 rounded-control border border-core-border px-3" /></label><label className="catalog-row"><input type="radio" name="catalog-radio" defaultChecked /> Einzelwahl</label><label className="catalog-field">Deaktiviertes Feld<input disabled defaultValue="Nicht verfügbar" className="min-h-11 rounded-control border border-core-border px-3 disabled:opacity-50" /></label></Demo>}
    {section === "forms" && <Demo title="FileDropField · APKG, Bild und Quelle" wide><div className="catalog-three">{(["apkg", "image", "document"] as const).map((kind) => <FileDropField key={kind} kind={kind} selected={Boolean(fileName)} onFile={(file) => setFileName(file.name)}>{fileName && <p>{fileName}</p>}</FileDropField>)}</div><FileDropField kind="apkg" selected disabled busy onFile={() => undefined}><p>Import wird analysiert …</p></FileDropField></Demo>}
  </>;
}

function FeedbackDemo({ section }: { section: string }) {
  const [dialog, setDialog] = useState(false);
  const [bar, setBar] = useState(false);
  const [barMode, setBarMode] = useState<"global" | "learning-global" | "deck-tree">("global");
  const toast = useSuccessToast();
  const progress = { total: 40, completedTodayCount: 16, newCount: 12, inProgressCount: 4, dueCount: 8 };
  return <>
    {section === "feedback" && <Demo title="StatusMessage · alle Töne">{(["info", "success", "warning", "error"] as const).map((tone) => <StatusMessage key={tone} tone={tone}>{({ info: "Die Synchronisierung steht noch aus.", success: "Karte wurde erfolgreich gespeichert.", warning: "Einige Medien fehlen.", error: "Der Import konnte nicht abgeschlossen werden." })[tone]}</StatusMessage>)}</Demo>}
    {section === "feedback" && <Demo title="SuccessToast und SuccessToastProvider"><div className="catalog-row"><ActionButton variant="primary" onClick={() => toast("Karte wurde erfolgreich gespeichert.")}>Erfolg anzeigen</ActionButton><ActionButton variant="secondary" onClick={() => toast("Karte ausgesetzt. Der Lernstand bleibt erhalten.", { appearance: "neutral" })}>Neutralen Hinweis anzeigen</ActionButton></div></Demo>}
    {section === "dialogs" && <Demo title="ActionDialog · Bestätigung, Verwerfen und Information"><ActionButton variant="destructive" onClick={() => setDialog(true)}>Löschdialog öffnen</ActionButton><ActionDialog open={dialog} title="Stapel löschen?" description="Diese Demo verändert ausschließlich ihren eigenen Zustand." confirmLabel="Löschen" cancelLabel="Abbrechen" discardLabel="Entwurf verwerfen" destructive onConfirm={() => { setDialog(false); toast("Beispiel bestätigt."); }} onCancel={() => setDialog(false)} onDiscard={() => setDialog(false)} /></Demo>}
    {section === "dialogs" && <Demo title="SettingsSaveBar · Speicherreichweiten"><CoreSelect ariaLabel="Speicherleisten-Modus" value={barMode} onValueChange={(value) => setBarMode(value as typeof barMode)} options={[{ value: "global", label: "Allgemeine Einstellungen" }, { value: "learning-global", label: "Globale Lernwerte" }, { value: "deck-tree", label: "Stapelbaum" }]} /><ActionButton variant="secondary" onClick={() => setBar(true)}>Speicherleiste öffnen</ActionButton><SettingsSaveBar open={bar} mode={barMode} onSave={() => { setBar(false); toast("Beispiel gespeichert."); }} onDiscard={() => setBar(false)} /></Demo>}
    {section === "progress" && <Demo title="DailyReviewProgress · offen, erreicht und leer"><DailyReviewProgress progress={progress} /><DailyReviewProgress progress={{ ...progress, completedTodayCount: 40, newCount: 0, inProgressCount: 0, dueCount: 0 }} achieved /><DailyReviewProgress progress={{ total: 0, completedTodayCount: 0, newCount: 0, inProgressCount: 0, dueCount: 0 }} achieved /></Demo>}
    {section === "progress" && <Demo title="Prozessindikator · unbestimmter Statistik-Ladezustand"><div className="core-statistics-load-track" role="progressbar" aria-label="Statistik wird aktualisiert"><span className="core-statistics-load-segment" /></div><p className="core-body text-core-muted">Filter und letzte Daten bleiben sichtbar.</p></Demo>}
  </>;
}

function NavigationDemo({ section }: { section: string }) {
  const menu = createMenuModel();
  const [view, setView] = useState("uebersicht");
  const [area, setArea] = useState<LearnArea>("overview");
  const [showShell, setShowShell] = useState(false);
  const toast = useSuccessToast();
  return <>
    {section === "navigation" && <Demo title="AppNavigation · tatsächliche responsive Shell" wide><p className="core-body text-core-muted">Vorschau öffnen: ab 1280 px Sidebar, darunter Kopf und Bottom Bar. Escape oder Schließen beendet die Vorschau.</p><ActionButton variant="secondary" onClick={() => setShowShell(true)}>App-Navigation öffnen</ActionButton>{showShell && <div className="catalog-shell-preview" onKeyDown={(event) => { if (event.key === "Escape") setShowShell(false); }}><AppNavigation activeView={view} navigationItems={menu.listNavigationItems()} simulationOffsetMinutes={0} simulationDateLabel="2. Oktober 2026" pomodoroTimer={null} onNavigate={setView} onResetSimulation={() => undefined} syncStatus={{ status: "saved", message: "Synchronisiert", savedAt: "2026-10-02T12:00:00Z" }} onSyncNow={() => toast("Beispiel synchronisiert.")} /><div className="catalog-shell-content"><h2 className="core-heading-2">Navigation: {menu.getView(view)?.label ?? "Lernen"}</h2><ActionButton variant="primary" autoFocus onClick={() => setShowShell(false)}>Vorschau schließen</ActionButton></div></div>}</Demo>}
    {section === "headings" && <Demo title="LearningAreaHeader" wide><LearningAreaHeader area={area} onAreaChange={setArea} onOpenCardSettings={() => toast("Lerneinstellungen gewählt.")} /></Demo>}
    {section === "navigation" && <Demo title="InPageNavigation · Sprunglinks und Abschnitte" wide><InPageNavigation ariaLabel="Beispielbereiche" items={[{ id: "catalog-demo-overview", label: "Überblick", icon: Home }, { id: "catalog-demo-plan", label: "Planung", icon: Layers }]}><section id="catalog-demo-overview" aria-labelledby="catalog-demo-overview-heading"><h3 id="catalog-demo-overview-heading" className="core-heading-3">Überblick</h3><p className="core-body">Kennzahlen und gespeicherte Einstellungen.</p></section><section id="catalog-demo-plan" aria-labelledby="catalog-demo-plan-heading"><h3 id="catalog-demo-plan-heading" className="core-heading-3">Planung</h3><p className="core-body">Lernplanung und Tageslimits.</p></section></InPageNavigation></Demo>}
  </>;
}

function DecksDemo({ section }: { section: string }) {
  const [decks, setDecks] = useState(sampleDecks);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [treeMode, setTreeMode] = useState<"dashboard" | "learn">("dashboard");
  const toast = useSuccessToast();
  const rows = createDeckLibraryModel(decks, { now: `${today}T12:00:00Z`, timeZone: "Europe/Berlin" }).rows;
  const row = rows.find((entry) => entry.id === deck.id)!;
  function mode(id: string, coreMode: CoreMode) { setDecks((current) => current.map((entry) => entry.id === id ? { ...entry, deckSettings: { ...entry.deckSettings, coreMode } } : entry)); }
  function move(id: string, parentDeckId: string | null) { setDecks((current) => current.map((entry) => entry.id === id ? { ...entry, parentDeckId } : entry)); return null; }
  return <>
    {section === "stapel" && <Demo title="DeckSummaryHeader und DeckSummaryRow · verfügbare Breite" wide><DeckSummaryHeader /><DeckSummaryRow row={row} density="responsive" leadingControl={<ChevronRight size={18} />} actions={<IconButton label="Stapeloptionen" icon={Settings} variant="ghost" />} learningStatus={{ summary: row.summary, statusDistribution: row.statusDistribution, metricLabels: "sr-only" }} studyAction={<IconButton label="Jetzt lernen" icon={BookOpen} variant="ghost" />} /></Demo>}
    {section === "stapel" && <Demo title="DeckOptionsMenu"><DeckOptionsMenu row={row} decks={decks} onSetCoreMode={mode} onMoveDeck={move} onOpenSettings={() => toast("Stapeleinstellungen geöffnet.")} /></Demo>}
    {section === "stapel" && <Demo title="DeckTree · gemeinsamer Baumrenderer" wide><CoreSelect ariaLabel="Baumkontext" value={treeMode} onValueChange={(value) => setTreeMode(value as typeof treeMode)} options={[{ value: "dashboard", label: "Dashboard" }, { value: "learn", label: "Lernen" }]} /><DeckTree rows={rows} mode={treeMode} onActivate={(entry) => toast(`Inhalt: ${entry.name}`)} onStudy={(entry) => toast(`Lernstart: ${entry.name}`)} onOpenSettings={() => toast("Stapeleinstellungen geöffnet.")} onSetDeckCoreMode={mode} onMoveDeck={move} collapsedDeckIds={collapsed} onDeckExpansionChange={(id, expanded) => setCollapsed((current) => expanded ? current.filter((value) => value !== id) : [...current, id])} /></Demo>}
    {section === "charts" && <Demo title="StudyHeatmap · Woche, Monat, Jahr und Prognose" wide><StudyHeatmap heatmap={createStudyHeatmapModelFromCounts({ todayKey: today, countsByDay: new Map([["2026-09-27", 3], ["2026-09-28", 8], ["2026-09-29", 12], ["2026-09-30", 5], ["2026-10-01", 7], [today, 11]]), forecastCountsByDay: new Map([["2026-10-03", 10], ["2026-10-05", 20], ["2026-11-02", 35]]) })} formatDayLabel={(day) => `${day.key}: ${day.count} gelernt, ${day.forecastCount} voraussichtlich fällig`} /></Demo>}
  </>;
}

export function cardFixture(cardType: CardType = "basic", index = 0) {
  const sample = createManualCoreDeck({ deckName: "Kartentypen", card: {
    cardType, front: cardType === "cloze" ? "Die Hauptstadt von Portugal ist {{c1::Lissabon}}." : cardType === "multiple-choice" ? "Welche Städte liegen in Portugal?" : cardType === "basic-with-images" ? `<p>Welche Hauptstadt siehst du?</p><img src="${imageReference}" alt="Beispielansicht von Lissabon">` : "Was ist die Hauptstadt von Portugal?",
    mediaRefs: cardType === "basic-with-images" ? [imageReference] : [],
    back: cardType === "multiple-choice" ? "Lissabon und Porto" : "Lissabon", answerOptions: ["Lissabon", "Madrid", "Porto"], correctAnswers: cardType === "multiple-choice" ? ["Lissabon", "Porto"] : ["Lissabon"],
  } });
  const item = sample.cards[index] ?? sample.cards[0];
  const definition = createCoreNoteTypeDefinition({ document: item.contentDocument, kind: cardType === "cloze" ? "cloze" : "normal", interaction: cardType === "single-choice" || cardType === "multiple-choice" ? "choice" : undefined, createdAt: "2026-10-02T12:00:00Z" });
  return { item, definition, variant: item.variants[0], mediaUrls: sampleMedia };
}

export function StudyDemo({ cardType = "basic", index = 0 }: { cardType?: CardType; index?: number }) {
  const [revealed, setRevealed] = useState(false);
  const [choices, setChoices] = useState<string[]>([]);
  return <div><StudyCardContent {...cardFixture(cardType, index)} revealed={revealed} selectedChoices={choices} onSelectedChoicesChange={setChoices} onReveal={() => setRevealed(true)} /><div className="catalog-row mt-6"><ActionButton variant="secondary" onClick={() => setRevealed((current) => !current)}>{revealed ? "Vorderseite zeigen" : "Antwort aufdecken"}</ActionButton><ActionButton variant="secondary" onClick={() => { setRevealed(false); setChoices([]); }}>Zurücksetzen</ActionButton></div></div>;
}

function ContentDemo({ section }: { section: string }) {
  const [text, setText] = useState("<p>Markiere <strong>einen wichtigen Begriff</strong> und öffne die Werkzeuge.</p>");
  const [preview, setPreview] = useState(false);
  const [color, setColor] = useState("#6f7e9e");
  const [colorOpen, setColorOpen] = useState(false);
  const [slots, setSlots] = useState(["#181d25", "#262e3a", "#667492"]);
  const [slot, setSlot] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
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
    {section === "inhalt" && <Demo title="CardPresentationSurface · Vorderseite, Rückseite und Ladezustand"><CardPresentationSurface {...fixture} title="Vorderseite" showCompatibility="warnings-only" /><CardPresentationSurface {...fixture} side="answer" title="Rückseite" showCompatibility="warnings-only" /><CardPresentationSurface title="Noch keine Karte" loadingLabel="Kartendarstellung wird vorbereitet …" /></Demo>}
    {section === "inhalt" && <Demo title="StudyCardContent · Aufdecken und Auswahl" wide><StudyDemo /></Demo>}
    {section === "dialogs" && <Demo title="CardPreviewDialog"><ActionButton variant="secondary" onClick={() => setPreview(true)}>Kartenvorschau öffnen</ActionButton><CardPreviewDialog {...fixture} open={preview} onOpenChange={setPreview} /></Demo>}
    {section === "editor" && <Demo title="RichTextEditor · Toolbar und zusätzliche Werkzeuge" wide><RichTextEditor value={text} onChange={setText} ariaLabel="Beispiel-Karteninhalt" isActive clozeActions={{ groupId: 1 }} imageActions={{ mediaUrls, prepare: prepareImage }} /><details><summary>Aktueller HTML-Inhalt</summary><pre>{text}</pre></details></Demo>}
    {section === "colors" && <Demo title="ColorWheelPicker"><ColorWheelPicker value={color} onValueCommit={setColor} /><code>{color}</code><ColorWheelPicker value={color} disabled onValueCommit={setColor} /></Demo>}
    {section === "colors" && <Demo title="ColorToolButton und ColorPopover"><ColorToolButton label="Textfarbe" icon={Type} color={slots[slot]} isOpen={colorOpen} menuId="catalog-color-popover" onToggle={() => setColorOpen((value) => !value)} buttonRef={buttonRef} />{colorOpen && <ColorPopover id="catalog-color-popover" label="Textfarbe" icon={Type} colors={slots} paletteColors={["#181d25", "#667492", "#047857"]} selectedSlot={slot} onSelectSlot={setSlot} onApply={(value) => { setColor(value); setColorOpen(false); }} onChangeSlot={(index, value) => setSlots((current) => current.map((entry, position) => position === index ? value : entry))} />}</Demo>}
    {section === "media" && <Demo title="PdfDocumentViewer · echte lokale PDF-Vorschau" wide><PdfDemo /></Demo>}
  </>;
}

function PdfDemo() {
  const [src, setSrc] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
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
  return <>{src && <PdfDocumentViewer src={src} document={{ id: "catalog-pdf", fileName: "lernhinweis.pdf", mimeType: "application/pdf", text: "CoRe – Lernen mit Kontext", textExtractionStatus: "ready", metadata: {} }} onSelection={setSelection} />}<p className="core-body">Auswahl: {selection || "Noch kein Text markiert"}</p></>;
}

function LearningDemo({ section }: { section: string }) {
  const [timer, setTimer] = useState<PomodoroTimer | null>(null);
  const [settings, setSettings] = useState(false);
  const [marked, setMarked] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [order, setOrder] = useState<NewReviewOrder>("reviews-first");
  const [draft, setDraft] = useState(() => createDeckLearningSettingsDraft(deck.deckSettings));
  const [profiles, setProfiles] = useState<React.ComponentProps<typeof LearningSettingsPanel>["profiles"]>([]);
  const start = (minutes: number) => setTimer(createPomodoroTimer(minutes));
  return <>
    {section === "forms" && <Demo title="PomodoroTimerControl · Einstellungen und Review"><PomodoroTimerControl timer={timer} variant="settings" onStart={start} /><PomodoroTimerControl timer={timer} variant="study" onStart={start} /><ActionButton variant="secondary" onClick={() => setTimer(null)}>Demo-Timer zurücksetzen</ActionButton></Demo>}
    {section === "progress" && <Demo title="PomodoroProgress · Review, Sidebar und Kopf">{timer ? <>{(["study", "sidebar", "header"] as const).map((variant) => <PomodoroProgress key={variant} timer={timer} variant={variant} />)}</> : <ActionButton variant="secondary" onClick={() => start(25)}>Fortschritt anzeigen</ActionButton>}</Demo>}
    {section === "dialogs" && <Demo title="StudySettingsOverlay · Bottom Sheet und Dialog"><ActionButton variant="secondary" onClick={() => setSettings(true)}>Lerneinstellungen öffnen</ActionButton><StudySettingsOverlay open={settings} canEditCard marked={marked} suspended={suspended} reviewOrder={order} pomodoroTimer={timer} onOpenChange={setSettings} onEditCard={() => setSettings(false)} onEditDeck={() => setSettings(false)} onMarkedChange={setMarked} onSuspendedChange={setSuspended} onReviewOrderChange={setOrder} onStartPomodoro={(minutes) => { start(minutes); setSettings(false); }} /></Demo>}
    {section === "forms" && <Demo title="LearningSettingsPanel · Profile, Tagesrunde und Scheduler" wide><LearningSettingsPanel draft={draft} profiles={profiles} defaultProfileName="Standard" onProfilesChange={setProfiles} onDraftChange={setDraft} onApplyProfile={(next) => { setDraft(next); return true; }} /></Demo>}
    {section === "buttons" && <Demo title="Reviewratings · alle vier Bewertungen"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{ratingButtons.map((rating, index) => <button type="button" key={rating.key} className={`min-h-14 rounded-control border px-3 py-1.5 text-center shadow-soft transition hover:-translate-y-0.5 ${rating.className}`}><span className="block core-body font-semibold">{rating.label}</span><small className="block core-caption">{["1 min", "5 min", "1 Tag", "4 Tage"][index]}</small></button>)}</div></Demo>}
  </>;
}

function ProductViewsDemo({ kind }: { kind: string }) {
  const [view, setView] = useState("");
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState<StatisticsSelection>({ period: "30d", deckIds: "all", now: "2026-10-02T12:00:00Z", timeZone: "Europe/Berlin" });
  const conflict = { id: "catalog-conflict", status: "open", entityTable: "cards", entityLabel: "Karte", title: "Hauptstadt von Portugal", localPresent: true, remotePresent: true, remoteRevision: 2, createdAt: selection.now, allowedActions: ["merge-fields"], fields: [{ key: "front", label: "Frage", localText: "Hauptstadt von Portugal?", remoteText: "Wie heißt Portugals Hauptstadt?" }, { key: "back", label: "Antwort", localText: "Lissabon", remoteText: "Lissabon (Lisboa)" }] };
  const conflicts = React.useRef([conflict]);
  const listConflicts = React.useCallback(async () => conflicts.current, []);
  const resolveConflict = React.useCallback(async (_id: string, decision: { action: string }) => {
    conflicts.current = decision.action === "reopen" ? [conflict] : decision.action === "ignore" ? [{ ...conflict, status: "ignored" }] : [];
    return { conflicts: conflicts.current };
  }, []);
  const statisticsDecks = React.useMemo(() => {
    const cards = Array.from({ length: 8 }, (_, index) => ({ ...createBasicLearningItem("catalog-statistics", `Frage ${index + 1}`, "Antwort"), reviewState: createReviewState({ state: "review", dueAt: `2026-10-${String(3 + index).padStart(2, "0")}T12:00:00Z`, intervalDays: 3 + index * 5, stability: 5 + index * 10, difficulty: 2 + index, repetitions: 6 }) }));
    return [createCoreDeck({ id: "catalog-statistics", name: "Welt-Hauptstädte", source: "manual", cards, reviewEvents: Array.from({ length: 28 }, (_, index) => {
      const item = cards[index % cards.length]; const answeredAt = `2026-09-${String(3 + index).padStart(2, "0")}T12:00:00Z`;
      return { id: `catalog-review-${index}`, userId: "catalog", deckId: "catalog-statistics", learningItemId: item.id, variantId: null, reviewableType: "card" as const, reviewableId: item.id, sourceCardId: item.id, rating: (["again", "hard", "good", "easy"] as const)[index % 4], answeredAt, responseTimeMs: 1800 + index * 100, schedulerBefore: { card: { state: "review", intervalDays: 3 + index } }, schedulerAfter: {}, flags: {}, createdAt: answeredAt };
    }) }), child];
  }, []);
  const toast = useSuccessToast();
  const workspace = React.useMemo(() => ({ ...createCoreRepository().getState(), decks: sampleDecks }), []);
  const navigate = React.useCallback<React.ComponentProps<typeof DashboardScreen>["onNavigate"]>((id, fields) => createViewRoute(id ?? "uebersicht", fields), []);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const noop = React.useCallback(() => undefined, []);
  const views = [["auth", "AuthGateScreen · Anmeldung, Registrierung und Reset", "Anmeldung"], ["conflict", "SyncConflictPanel · Feldvergleich und Zusammenführung", "Konfliktauflösung"], ["statistics", "StatisticsScreenContent · alle Diagramme und Tabellen", "Statistik"], ["simulator", "SimulatorScreen · Lernuhr und Datumauswahl", "Simulator"], ["help", "HelpScreen · Lernmethoden und FSRS-Illustrationen", "Lernmethoden"]];
  views.push(
    ["dashboard", "DashboardScreen · Tagesübersicht", "Tagesübersicht"],
    ["learn", "LearnScreen · Stapel und Schnellformular", "Lernen"],
    ["creation", "CreationScreen · Einstieg", "Erstellen"],
    ["manual", "ManualCreationPanel · vollständiges Formular", "Manuelle Erstellung"],
    ["import", "ApkgImportPanel · Dateiauswahl", "Anki-Import"],
    ["decks", "DecksScreen · Tabelle und Karteneditor", "Kartenverwaltung"],
    ["settings", "SettingsScreen · Konto und Synchronisierung", "Allgemeine Einstellungen"],
    ["global", "GlobalCardSettingsScreen · globale Lernwerte", "Globale Lernwerte"],
    ["deck-settings", "DeckSettingsScreen · Darstellung und Lernwerte", "Stapeleinstellungen"],
    ["study", "StudyMode · Frage, Antwort und Bewertungen", "Lernsitzung"],
  );
  return <>{views.filter(([id]) => id === kind).map(([id, title, label]) => <Demo key={id} title={title}><ActionButton variant="secondary" onClick={() => { conflicts.current = [conflict]; setMessage(""); setView(id); }}>{label} öffnen</ActionButton></Demo>)}{view && <div className="catalog-product-preview core-screen-region" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) setView(""); }}><div className="catalog-product-bar"><p className="core-caption">Echte Produktansicht · lokale Demodaten</p><ActionButton variant="secondary" autoFocus onClick={() => setView("")}>Produktansicht schließen</ActionButton></div>
    <section className="min-w-0 overflow-x-clip px-2.5 pb-32 pt-8 sm:px-4 lg:px-6">
    {view === "auth" && <AuthGateScreen message={message} onSignIn={() => setMessage("Demo-Anmeldung geprüft.")} onSignUp={() => setMessage("Demo-Registrierung geprüft.")} onResetPassword={() => setMessage("Demo-Reset angefordert.")} />}
    {view === "conflict" && <SyncConflictPanel onListConflicts={listConflicts} onResolveConflict={resolveConflict} />}
    {view === "statistics" && <StatisticsScreenContent dataset={{ decks: statisticsDecks, projection: projectStatistics(statisticsDecks, selection) }} now={selection.now} timeZone={selection.timeZone} onSelectionChange={(next) => setSelection((current) => ({ ...current, ...next }))} onNavigate={() => toast("Demostapel ausgewählt.")} />}
    {view === "simulator" && <SimulatorScreen systemNow={selection.now} offsetMinutes={offset} onOffsetChange={setOffset} />}
    {view === "help" && <HelpScreen />}
    {view === "dashboard" && <DashboardScreen state={workspace} now={selection.now} onNavigate={navigate} onStartDeck={noop} onStartAdditionalCards={() => ({ ok: true })} onCreateDemo={async () => sampleDecks} onSetDeckCoreMode={noop} onMoveDeck={() => null} onOpenDeckSettings={noop} onSetDeckExpanded={noop} />}
    {view === "learn" && <LearnScreen decks={sampleDecks} now={selection.now} onStartDeck={noop} onCreateDeck={() => deck} focusedDeckId={null} initialParentDeckId="" onDeckCreationHandled={noop} onFocusDeck={noop} onOpenCardCreation={noop} onOpenDecks={noop} onOpenDeckContent={noop} onOpenCardSettings={noop} onOpenDeckSettings={noop} onSetDeckCoreMode={noop} onMoveDeck={() => null} collapsedDeckIds={[]} onSetDeckExpanded={noop} />}
    {["creation", "manual", "import"].includes(view) && <CreationScreen decks={sampleDecks} initialMethod={view === "manual" ? "manual" : view === "import" ? "import" : ""} onMethodChange={(method) => setView(method || "creation")} />}
    {view === "decks" && <DecksScreen decks={sampleDecks} now={selection.now} mediaStore={null} onStartDeck={noop} onSetDeckCoreMode={noop} onSaveCard={noop} onSetCardStudyState={async () => null} onDuplicateCard={async () => null} onDeleteCard={async () => null} onUndoDeleteCard={async () => null} onRescheduleCards={async () => []} onGenerateVariant={async () => { throw new Error("Keine KI-Anfrage in der Vorschau."); }} selectedDeckId={selectedCardId ? deck.id : null} selectedCardId={selectedCardId} onSelectDeck={(_id, cardId) => setSelectedCardId(cardId ?? null)} onCloseSelectedCard={() => setSelectedCardId(null)} onOpenLearn={noop} onOpenCardSettings={noop} onMoveDeck={() => null} onOpenDeckSettings={noop} onDraftStateChange={noop} expandedDeckIds={[deck.id]} onSetDeckExpanded={noop} />}
    {view === "settings" && <SettingsScreen profile={workspace.profile} syncStatus={{ status: "saved", message: "Synchronisiert", savedAt: selection.now }} onSaveSettings={() => workspace.profile} onDraftStateChange={noop} onSyncNow={async () => undefined} onListConflicts={async () => []} onResolveConflict={async () => undefined} onSignOut={async () => undefined} onNavigate={navigate} />}
    {view === "global" && <GlobalCardSettingsScreen timeZone="Europe/Berlin" globalSchedulerPreferences={getGlobalSchedulerPreferences(workspace.profile)} learningProfiles={[]} onSaveLearningProfiles={noop} onSaveSettings={() => workspace.profile} onDraftStateChange={noop} onNavigate={navigate} simulationOffsetMinutes={0} simulationDateLabel="2. Oktober 2026" pomodoroTimer={null} onStartPomodoro={noop} />}
    {view === "deck-settings" && <DeckSettingsScreen deck={deck} decks={sampleDecks} learningProfiles={[]} onSaveSettings={() => null} onApplyLearningProfile={() => deck} onSaveLearningProfiles={noop} onDraftStateChange={noop} onRequestContextAction={(action) => action()} onCreateSubdeck={noop} onDeleteDeck={async () => null} onSelectDeck={noop} onOpenGlobalSettings={noop} onBack={noop} />}
    {view === "study" && <StudyMode deck={deck} decks={sampleDecks} deckId={deck.id} variantSession={false} mediaStore={null} getNow={() => selection.now} simulationOffsetMinutes={0} pomodoroTimer={null} onStartPomodoro={noop} onExit={() => setView("")} onReturnToLearn={() => setView("learn")} onEditCard={noop} onEditDeck={noop} onSetCardStudyState={() => deck} onSetDeckReviewOrder={() => deck} onCardUpdated={noop} onReview={noop} />}
    </section>
  </div>}</>;
}

export const DEMO_GROUPS = [
  { id: "screens", title: "Produktansichten", description: "Echte Screens mit lokalen Beispieldaten für vollständige Designvergleiche. Aktionen bleiben in der Vorschau.", components: ["DashboardScreen", "LearnScreen", "CreationScreen", "DecksScreen", "SettingsScreen", "GlobalCardSettingsScreen", "DeckSettingsScreen", "StudyMode"], render: () => <>{["dashboard", "learn", "creation", "manual", "import", "decks", "settings", "global", "deck-settings", "study"].map((kind) => <ProductViewsDemo key={kind} kind={kind} />)}</> },
  { id: "colors", title: "Farbauswahl", description: "Farbkreis, Schnellfarben und Farb-Popover.", components: ["ColorWheelPicker", "ColorToolButton", "ColorPopover"], render: () => <ContentDemo section="colors" /> },
  { id: "grundlagen", title: "Flächen und Leerzustände", description: "Inhaltsflächen und leere Zustände.", components: ["SoftPanel", "EmptyState"], render: () => <FoundationsDemo section="surfaces" /> },
  { id: "headings", title: "Überschriften", description: "Seitentitel und Titel mit Bereichssteuerung.", components: ["PageHeader", "LearningAreaHeader"], render: () => <><FoundationsDemo section="headings" /><NavigationDemo section="headings" /></> },
  { id: "aktionen", title: "Buttons und Aktionen", description: "Text-, Icon-, Querlink-, Aktionskarten-, Markierungs- und Bewertungsbuttons.", components: ["ActionButton", "IconButton", "CrossLinkButton", "CreationActionCard", "CardMarkButton", "CardStudyStateControls"], render: () => <><ActionsDemo section="buttons" /><ControlsDemo section="buttons" /><LearningDemo section="buttons" /></> },
  { id: "auswahl", title: "Segmentierte Controls", description: "Reguläre und kompakte Segmente, gleitende Tabs und CoRe-Modus.", components: ["CoreSegmentedControl", "CoreSlidingTabs", "CoreModeControl"], render: () => <ControlsDemo section="segments" /> },
  { id: "formulare", title: "Eingaben und Auswahlfelder", description: "Text, Zahl, Passwort, mehrzeilige Eingaben, Checkbox, Radio, Select, Datum, Datei und zusammengesetzte Einstellungsformulare.", components: ["CoreSelect", "DeckSelect", "DeckMultiSelect", "CoreDatePicker", "FileDropField", "PomodoroTimerControl", "LearningSettingsPanel", "AuthGateScreen", "SimulatorScreen"], render: () => <><FormsDemo section="forms" /><LearningDemo section="forms" /><ProductViewsDemo kind="auth" /><ProductViewsDemo kind="simulator" /></> },
  { id: "feedback", title: "Status- und Toastmeldungen", description: "Info, Erfolg, Warnung, Fehler und schließbare Toasts.", components: ["StatusMessage", "SuccessToast", "SuccessToastProvider"], render: () => <FeedbackDemo section="feedback" /> },
  { id: "badges", title: "Badges und Kennzeichnungen", description: "Bestehende lokale Beschriftungen für Original, Kartenseite und Synchronisierung.", components: [], render: BadgesDemo },
  { id: "tooltips", title: "Tooltips", description: "Hinweise mit Text, Wert oder Stapelidentität.", components: ["CoreTooltip", "CoreTooltipProvider"], render: () => <ActionsDemo section="tooltips" /> },
  { id: "progress", title: "Fortschritt und Ladezustände", description: "Tagesfortschritt, Zeitfortschritt sowie bestimmte und unbestimmte Prozessanzeigen.", components: ["DailyReviewProgress", "PomodoroProgress"], render: () => <><FeedbackDemo section="progress" /><LearningDemo section="progress" /></> },
  { id: "dialogs", title: "Dialoge und Speicherleisten", description: "Bestätigungen, Kartenvorschau, Sitzungsdialog, Speicherentscheidung und Konfliktvergleich.", components: ["ActionDialog", "SettingsSaveBar", "CardPreviewDialog", "StudySettingsOverlay", "SyncConflictPanel"], render: () => <><FeedbackDemo section="dialogs" /><ContentDemo section="dialogs" /><LearningDemo section="dialogs" /><ProductViewsDemo kind="conflict" /></> },
  { id: "navigation", title: "Navigation", description: "Responsive Hauptnavigation und Sprunglinks.", components: ["AppNavigation", "InPageNavigation"], render: () => <NavigationDemo section="navigation" /> },
  { id: "stapel", title: "Tabellen, Bäume und Menüs", description: "Gemeinsame Tabellenzeile mit oder ohne Lernstatus, Stapelbaum und Optionsmenü.", components: ["DeckSummaryHeader", "DeckSummaryRow", "DeckOptionsMenu", "DeckTree"], render: () => <DecksDemo section="stapel" /> },
  { id: "charts", title: "Kennzahlen und Diagramme", description: "Kennzahlen, Ringdiagramme, Heatmap und die produktiven Statistikdiagramme.", components: ["StatTile", "SegmentedDonut", "StudyHeatmap", "StatisticsScreenContent"], render: () => <><FoundationsDemo section="charts" /><DecksDemo section="charts" /><ProductViewsDemo kind="statistics" /></> },
  { id: "symbols", title: "Icons und Illustrationen", description: "Iconflächen, Stapelidentität und interaktive Lernmethoden-Illustrationen.", components: ["OrbIcon", "DeckAppearanceIcon", "HelpScreen"], render: () => <><FoundationsDemo section="symbols" /><ProductViewsDemo kind="help" /></> },
  { id: "inhalt", title: "Karteninhalte", description: "Sanitisiertes HTML, Vorder-/Rückseite und kontrollierte Lernkartenkomposition. Alle Kartentypen stehen in der eigenen Referenz.", components: ["CardHtml", "CardPresentationSurface", "StudyCardContent"], render: () => <ContentDemo section="inhalt" /> },
  { id: "editor", title: "Texteditor und Werkzeuge", description: "Rich-Text-Toolbar, Lückentext, Bilder und Zusatzwerkzeuge.", components: ["RichTextEditor"], render: () => <ContentDemo section="editor" /> },
  { id: "media", title: "Medien und Dokumente", description: "PDF-Vorschau mit Textauswahl.", components: ["PdfDocumentViewer"], render: () => <ContentDemo section="media" /> },
] as const;
