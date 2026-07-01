import React from "react";
import {
  AlertCircle,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Database,
  Edit3,
  Eye,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Flag,
  Folder,
  GraduationCap,
  Home,
  Image,
  Languages,
  Layers,
  Loader2,
  Lock,
  Network,
  PenLine,
  Play,
  PlusSquare,
  RotateCcw,
  Save,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  User,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { commitImport, createApkgImportPreview } from "./apkgImport.js";
import { generateCardsFromDocument } from "./aiOrchestrator.js";
import { connectOAuthPlaceholder, createLocalAccount, signInLocalAccount, signOutLocalAccount } from "./authModel.js";
import { createCommunity, copySharedDeckToLibrary, shareDeckToCommunity } from "./communityModel.js";
import {
  acceptAiDraftDeck,
  createManualCoreDeck,
  createSourceDocument,
} from "./coreModel.js";
import { createCoreWorkspace } from "./coreWorkspace.js";
import { createPortableExport, mergePortableExportIntoState, stringifyPortableExport, validatePortableExport } from "./dataPortability.js";
import { answerDeckQuestion } from "./deckAssistant.js";
import { buildDeckGraph, shouldRefreshDeckGraph } from "./deckGraph.js";
import { createDocumentFromFile } from "./documentModel.js";
import { createCsvImportDeck, createTableImportDeck, createTextImportDeck } from "./importService.js";
import { createLearningPlan } from "./learningPlan.js";
import { createAiJobLedger, createDeckLibraryModel } from "./libraryModel.js";
import { createMenuModel } from "./menuModel.js";
import { resolveReviewShortcut } from "./reviewShortcuts.js";
import { createReviewSession, recordReviewRating, recordVariantFeedback } from "./reviewService.js";

const menu = createMenuModel();

const iconByKey = {
  bot: Bot,
  chart: BarChart3,
  community: Users,
  graph: Network,
  home: Home,
  layers: Layers,
  learn: BookOpen,
  plus: PlusSquare,
  settings: Settings,
  assistant: Bot,
};

const importSteps = [
  { id: "validate", label: "Datei pruefen" },
  { id: "collection", label: "Anki-Collection lesen" },
  { id: "cards", label: "Karten extrahieren" },
  { id: "preview", label: "Importvorschau erstellen" },
];

const cardTypeOptions = [
  { value: "basic", label: "Basic" },
  { value: "basic-reversed", label: "Reverse" },
  { value: "cloze", label: "Cloze" },
  { value: "image-occlusion", label: "Image" },
  { value: "multiple-choice", label: "Multiple Choice" },
  { value: "free-text", label: "Free Text" },
];

const ratingButtons = [
  { key: "again", number: "1", label: "Again", className: "border-red-200 bg-red-50 text-red-650" },
  { key: "hard", number: "2", label: "Hard", className: "border-amber-200 bg-amber-50 text-amber-700" },
  { key: "good", number: "3", label: "Good", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { key: "easy", number: "4", label: "Easy", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
];

function getIcon(iconKey) {
  return iconByKey[iconKey] ?? Home;
}

function formatBytes(size) {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function CardHtml({ html }) {
  return (
    <div
      className="max-w-none text-sm leading-6 text-inherit [&_img]:max-h-36 [&_img]:rounded"
      dangerouslySetInnerHTML={{ __html: html || "<span></span>" }}
    />
  );
}

function SoftPanel({ children, className = "" }) {
  return (
    <section className={`rounded-[18px] border border-[#dde3f4] bg-white/72 shadow-[0_18px_55px_rgba(91,105,154,0.12)] backdrop-blur ${className}`}>
      {children}
    </section>
  );
}

function OrbIcon({ icon: Icon, className = "bg-[#eceefd] text-[#6672bf]" }) {
  return (
    <div className={`grid size-12 shrink-0 place-items-center rounded-full ${className}`}>
      <Icon size={22} aria-hidden="true" />
    </div>
  );
}

function MiniProgress({ value = 0 }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[#e8ecf8]">
      <div className="h-full rounded-full bg-gradient-to-r from-[#6fb7ae] via-[#7d89d9] to-[#596bc4]" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

function DonutValue({ value }) {
  return (
    <div
      className="grid size-10 place-items-center rounded-full"
      style={{ background: `conic-gradient(#6c78cf ${value * 3.6}deg, #e9edf8 0deg)` }}
      aria-label={`${value} Prozent`}
    >
      <span className="block size-7 rounded-full bg-white" />
    </div>
  );
}

function StatTile({ icon: Icon, label, value, hint, accent = "text-[#6672bf]" }) {
  return (
    <SoftPanel className="p-6">
      {Icon ? <OrbIcon icon={Icon} className={`bg-[#eef1fb] ${accent}`} /> : null}
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#66709a]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#17214f]">{value}</p>
      {hint ? <p className="mt-1 text-sm leading-6 text-[#66709a]">{hint}</p> : null}
    </SoftPanel>
  );
}

function PageHeader({ eyebrow, title, body, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">{eyebrow}</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#17214f]">{title}</h2>
        {body ? <p className="mt-3 text-lg leading-7 text-[#66709a]">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <SoftPanel className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <OrbIcon icon={Icon} />
          <div>
            <h3 className="text-xl font-semibold text-[#17214f]">{title}</h3>
            {body ? <p className="mt-1 text-[#66709a]">{body}</p> : null}
          </div>
        </div>
        {action}
      </div>
    </SoftPanel>
  );
}

function CoreModeControl({ value, onChange }) {
  const modes = [
    { value: "off", label: "Aus" },
    { value: "auto", label: "Auto" },
    { value: "manual", label: "Manuell" },
  ];

  return (
    <div className="inline-grid min-h-10 grid-cols-3 overflow-hidden rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] text-xs font-semibold text-[#596489]">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          className={`px-3 transition ${value === mode.value ? "bg-[#4f5eb1] text-white" : "hover:bg-white"}`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function OnboardingPanel({ profile, onSave, onCreate }) {
  const [form, setForm] = React.useState(profile);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <SoftPanel className="p-6">
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="flex gap-4">
          <OrbIcon icon={ShieldCheck} className="bg-emerald-50 text-emerald-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Lokales Profil</p>
            <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">Account und Datenschutz</h3>
            <p className="mt-2 text-sm leading-6 text-[#66709a]">Lernstaende bleiben privat; Communitys erhalten nur freigegebene Deck-Inhalte.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Anzeigename
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            E-Mail
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.email} onChange={(event) => update("email", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Hochschule
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.university} onChange={(event) => update("university", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Fachbereich
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.fieldOfStudy} onChange={(event) => update("fieldOfStudy", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Sprache
            <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value)}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const saved = onSave({ ...form, onboardingComplete: true });
              onCreate?.(saved);
            }}
            className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white"
          >
            <Save size={16} aria-hidden="true" />
            Profil aktivieren
          </button>
        </div>
      </div>
    </SoftPanel>
  );
}

function DashboardScreen({ state, onSaveProfile, onNavigate, onStartDeck }) {
  const library = createDeckLibraryModel(state.decks);
  const { totals } = library;
  const dashboardRows = library.dashboardRows.length
    ? library.dashboardRows
    : [
        {
          id: "empty",
          name: "Noch kein Kartenstapel",
          deck: { id: "empty", name: "Noch kein Kartenstapel" },
          summary: { totalCards: 0, dueCards: 0 },
          progress: 0,
          isEmpty: true,
        },
      ];

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Heute"
        title={`Guten Morgen, ${state.profile.displayName || "Noemi"}`}
        body="Faellige Karten, Variantenstatus und offene Jobs."
        action={<Bell className="mt-2 text-[#5361aa]" size={22} aria-hidden="true" />}
      />

      {!state.profile.onboardingComplete ? <OnboardingPanel profile={state.profile} onSave={onSaveProfile} /> : null}

      <div className="grid gap-6 lg:grid-cols-4">
        <StatTile icon={CalendarDays} label="Heute faellig" value={totals.dueCards} hint="Review-Objekte" />
        <StatTile icon={Layers} label="Originalkarten" value={totals.totalCards} hint={`${totals.deckCount} Stapel`} accent="text-teal-700" />
        <StatTile icon={Sparkles} label="CoRe-ready" value={totals.matureCards} hint={`${totals.activeVariants} aktive Varianten`} accent="text-amber-700" />
        <StatTile icon={Target} label="Maturity" value={`${totals.completionPercent} %`} hint="Karten ab Reifegrad" accent="text-emerald-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SoftPanel className="p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[#17214f]">Aktive Stapel</h3>
            <button type="button" onClick={() => onNavigate("kartenstapel")} className="text-sm font-semibold text-[#4f5eb1]">
              Alle anzeigen
            </button>
          </div>
          <div className="grid gap-3">
            {dashboardRows.map((row) => {
              const summary = row.summary;
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e3e7f5] bg-white/72 px-5 py-4">
                  <OrbIcon icon={Layers} className="size-10 bg-[#eef1fb] text-[#6672bf]" />
                  <div className="min-w-[12rem] flex-1">
                    <p className="truncate text-base font-semibold text-[#17214f]">{row.name}</p>
                    <p className="text-sm text-[#66709a]">{summary.totalCards} Karten · {summary.dueCards} faellig</p>
                  </div>
                  <DonutValue value={row.progress} />
                  {!row.isEmpty ? (
                    <button type="button" onClick={() => onStartDeck(row.deck)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
                      Lernen <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SoftPanel>

        <SoftPanel className="p-7">
          <h3 className="text-xl font-semibold text-[#17214f]">Schnellzugriff</h3>
          <div className="mt-5 grid gap-3">
            {[
              { view: "neue-karten", icon: PlusSquare, label: "Karten erstellen" },
              { view: "kartenstapel", icon: SlidersHorizontal, label: "CoRe-Modus steuern" },
              { view: "graph", icon: Network, label: "Graph oeffnen" },
              { view: "assistent", icon: Bot, label: "Assistent fragen" },
              { view: "ki", icon: Bot, label: "KI-Jobs pruefen" },
            ].map((action) => (
              <button
                key={action.view}
                type="button"
                onClick={() => onNavigate(action.view)}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] px-4 text-left text-sm font-semibold text-[#4f5eb1] hover:bg-white"
              >
                <action.icon size={17} aria-hidden="true" />
                {action.label}
                <ChevronRight className="ml-auto" size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </SoftPanel>
      </div>
    </div>
  );
}

function DeckCardEditor({ cards = [], selectedCardId, onSaveCard, onDeleteCard }) {
  const card = cards.find((item) => item.id === selectedCardId) ?? cards[0];
  const [form, setForm] = React.useState(null);

  React.useEffect(() => {
    setForm(
      card
        ? {
            front: card.originalFront,
            back: card.originalBack,
            tags: (card.originalTags ?? []).join(" "),
            kind: card.kind,
          }
        : null,
    );
  }, [card?.id]);

  if (!card || !form) return null;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <SoftPanel className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Karten-Detail</p>
          <h3 className="mt-1 text-xl font-semibold text-[#17214f]">Original, Versionen und Anker</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSaveCard(card.id, form)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white"
          >
            <Save size={16} aria-hidden="true" />
            Speichern
          </button>
          <button
            type="button"
            onClick={() => onDeleteCard(card.id)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700"
          >
            <Trash2 size={16} aria-hidden="true" />
            Loeschen
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Vorderseite
          <textarea className="min-h-28 rounded-xl border border-[#dfe4f5] p-3" value={form.front} onChange={(event) => update("front", event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Rueckseite
          <textarea className="min-h-28 rounded-xl border border-[#dfe4f5] p-3" value={form.back} onChange={(event) => update("back", event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Kartentyp
          <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.kind} onChange={(event) => update("kind", event.target.value)}>
            {cardTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Tags
          <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.tags} onChange={(event) => update("tags", event.target.value)} />
        </label>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Initialer Anker</p>
          <CardHtml html={card.immutableOriginal?.front} />
        </div>
        <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Quellenanker</p>
          <p className="mt-2 text-sm text-[#17214f]">{card.sourceAnchors?.[0]?.documentName || "Kein Dokumentanker"}</p>
          <p className="mt-1 text-sm text-[#66709a]">{card.sourceAnchors?.[0]?.textQuote || "Import- oder manuelle Originalkarte"}</p>
        </div>
        <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Versionen</p>
          <p className="mt-2 text-2xl font-semibold text-[#17214f]">{card.versionLog?.length ?? 0}</p>
          <p className="mt-1 text-sm text-[#66709a]">Aenderungslogeintraege</p>
        </div>
      </div>
    </SoftPanel>
  );
}

function DecksScreen({ decks, onSetDeckCoreMode, onSaveCard, onDeleteCard, onStartDeck, onCreateDeck, onOpenGraph, onShareDeck }) {
  const [query, setQuery] = React.useState("");
  const [modeFilter, setModeFilter] = React.useState("all");
  const [selectedDeckId, setSelectedDeckId] = React.useState(decks[0]?.id ?? null);
  const [selectedCardId, setSelectedCardId] = React.useState(null);
  const library = createDeckLibraryModel(decks, { query, coreMode: modeFilter, selectedDeckId });
  const filteredRows = library.filteredRows;
  const selectedRow = library.selectedRow;
  const selectedDeck = selectedRow?.deck ?? null;

  React.useEffect(() => {
    if (!selectedDeckId && library.rows[0]) setSelectedDeckId(library.rows[0].id);
  }, [decks, selectedDeckId]);

  function updateCoreMode(deck, coreMode) {
    onSetDeckCoreMode(deck.id, coreMode);
  }

  function saveCard(cardId, form) {
    if (!selectedDeck) return;
    onSaveCard(selectedDeck.id, cardId, {
      originalFront: form.front,
      originalBack: form.back,
      originalTags: form.tags,
      kind: form.kind,
    });
  }

  function deleteCard(cardId) {
    if (!selectedDeck) return;
    onDeleteCard(selectedDeck.id, cardId);
  }

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Bibliothek"
        title="Kartenstapel"
        body="Deck-Hierarchie, CoRe-Modus und Kartenpflege."
        action={
          <button type="button" onClick={onCreateDeck} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white">
            <PlusSquare size={17} aria-hidden="true" />
            Neue Karten
          </button>
        }
      />

      <SoftPanel className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm text-[#66709a]">
            <Search size={17} aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen" />
          </label>
          <select className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]" value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}>
            <option value="all">Alle Modi</option>
            <option value="off">Aus</option>
            <option value="auto">Auto</option>
            <option value="manual">Manuell</option>
          </select>
        </div>
      </SoftPanel>

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Noch keine passenden Stapel"
          body="Importiere oder erstelle Karten, damit die Bibliothek gefuellt wird."
          action={
            <button type="button" onClick={onCreateDeck} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
              Erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {filteredRows.map((row) => {
            const deck = row.deck;
            const summary = row.summary;
            const isSelected = selectedRow?.id === row.id;
            return (
              <SoftPanel key={row.id} className={`p-5 ${isSelected ? "ring-2 ring-[#8c96dc]" : ""}`}>
                <div className="flex flex-wrap items-center gap-4">
                  <button type="button" onClick={() => setSelectedDeckId(deck.id)} className="flex min-w-[16rem] flex-1 items-center gap-4 text-left">
                    <OrbIcon icon={Layers} className="bg-[#eef1fb] text-[#6672bf]" />
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-semibold text-[#17214f]">{deck.name}</span>
                      <span className="block truncate text-sm text-[#66709a]">{row.path}</span>
                    </span>
                  </button>
                  <CoreModeControl value={deck.deckSettings.coreMode} onChange={(mode) => updateCoreMode(deck, mode)} />
                  <div className="grid min-w-16 gap-1">
                    <span className="text-xs font-semibold text-[#66709a]">Faellig</span>
                    <span className="text-xl font-semibold text-[#17214f]">{summary.dueCards}</span>
                  </div>
                  <div className="grid min-w-16 gap-1">
                    <span className="text-xs font-semibold text-[#66709a]">Neu</span>
                    <span className="text-xl font-semibold text-[#17214f]">{summary.newCards}</span>
                  </div>
                  <div className="grid min-w-16 gap-1">
                    <span className="text-xs font-semibold text-[#66709a]">Gesamt</span>
                    <span className="text-xl font-semibold text-[#17214f]">{summary.totalCards}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onStartDeck(deck, false)} className="grid size-10 place-items-center rounded-xl bg-[#eef1fb] text-[#4f5eb1]" aria-label="Lernen">
                      <Play size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onStartDeck(deck, true)} className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700" aria-label="Varianten">
                      <Sparkles size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onOpenGraph(deck)} className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700" aria-label="Graph">
                      <Network size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onShareDeck(deck)} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label="Teilen">
                      <Share2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </SoftPanel>
            );
          })}
        </div>
      )}

      {selectedDeck ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SoftPanel className="p-6">
            <h3 className="text-xl font-semibold text-[#17214f]">Karten in {selectedDeck.name}</h3>
            <div className="mt-5 grid max-h-[28rem] gap-3 overflow-auto pr-1">
              {(selectedRow?.cardRows ?? []).map((cardRow) => {
                const card = cardRow.card;
                return (
                  <button
                    key={cardRow.id}
                    type="button"
                    onClick={() => setSelectedCardId(cardRow.id)}
                    className={`rounded-xl border px-4 py-3 text-left ${
                      (selectedCardId ?? selectedRow?.cardRows[0]?.id) === cardRow.id ? "border-[#8c96dc] bg-[#f3f5fd]" : "border-[#e3e7f5] bg-white/70"
                    }`}
                  >
                    <span className="block truncate text-sm font-semibold text-[#17214f]">{cardRow.frontPreview}</span>
                    <span className="mt-1 block text-xs uppercase tracking-wide text-[#66709a]">{card.kind} · {card.reviewState.maturityBand}</span>
                  </button>
                );
              })}
            </div>
          </SoftPanel>
          <DeckCardEditor cards={selectedRow?.activeCards ?? []} selectedCardId={selectedCardId} onSaveCard={saveCard} onDeleteCard={deleteCard} />
        </div>
      ) : null}
    </div>
  );
}

function ApkgImportPanel({ onImported }) {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [job, setJob] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [activeStep, setActiveStep] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);

  async function parseFile(file) {
    setSelectedFile(file);
    setPreview(null);
    setJob({ fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] });
    setIsParsing(true);

    try {
      const result = await createApkgImportPreview(file, setActiveStep);
      setJob(result.job);
      setPreview(result.preview);
    } catch (error) {
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: [error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      });
      setPreview(null);
    } finally {
      setIsParsing(false);
    }
  }

  function handleFileInput(event) {
    const file = event.target.files?.[0];
    if (file) void parseFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  }

  function handleCommit() {
    if (!preview) return;
    const deck = commitImport(preview);
    setJob((currentJob) => ({ ...currentJob, status: "done" }));
    onImported(deck);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <SoftPanel className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrbIcon icon={FileArchive} className="bg-teal-50 text-teal-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Anki-Import</p>
            <h2 className="text-2xl font-semibold text-[#17214f]">APKG als Originalanker importieren</h2>
          </div>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
            isDragging ? "border-teal-500 bg-teal-50" : "border-[#dfe4f5] bg-[#f8f9fe] hover:border-teal-400"
          }`}
        >
          <Upload className="mb-4 text-teal-700" size={32} aria-hidden="true" />
          <span className="text-base font-semibold text-[#17214f]">.apkg-Datei ablegen oder auswaehlen</span>
          <span className="mt-2 max-w-md text-sm leading-6 text-[#66709a]">Decks, Notes, Karten, Tags, Medienreferenzen und Raw-Fallbacks.</span>
          <input className="sr-only" type="file" accept=".apkg" onChange={handleFileInput} />
        </label>

        {selectedFile ? (
          <div className="mt-4 rounded-xl border border-[#e3e7f5] bg-white p-4">
            <p className="text-sm font-semibold text-[#17214f]">{selectedFile.name}</p>
            <p className="mt-1 text-sm text-[#66709a]">{formatBytes(selectedFile.size)} · Status: {job?.status ?? "idle"}</p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {importSteps.map((step) => {
            const currentIndex = importSteps.findIndex((item) => item.id === activeStep);
            const stepIndex = importSteps.findIndex((item) => item.id === step.id);
            const isActive = activeStep === step.id && isParsing;
            const isDone = stepIndex < currentIndex || job?.status === "preview" || job?.status === "done";

            return (
              <div key={step.id} className="flex items-center gap-3 rounded-xl border border-[#e3e7f5] px-4 py-3">
                {isActive ? <Loader2 className="animate-spin text-teal-700" size={18} aria-hidden="true" /> : isDone ? <CheckCircle2 className="text-teal-700" size={18} aria-hidden="true" /> : <span className="size-[18px] rounded-full border border-[#cfd6ed]" />}
                <span className="text-sm font-medium text-[#4e5b8c]">{step.label}</span>
              </div>
            );
          })}
        </div>

        {job?.errors?.length > 0 ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {job.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
      </SoftPanel>

      <section className="grid gap-5">
        {preview ? (
          <>
            <SoftPanel className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Importvorschau</p>
                  <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">{preview.deck.name}</h3>
                </div>
                <button type="button" onClick={handleCommit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white">
                  <Database size={17} aria-hidden="true" />
                  Deck importieren
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Decks" value={preview.deck.importMeta.detectedDecks.length} />
                <StatTile label="Notes" value={preview.deck.importMeta.detectedNotes} />
                <StatTile label="Cards" value={preview.deck.importMeta.detectedCards} />
                <StatTile label="Tags" value={preview.deck.tags.length} />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[#66709a]">
                <p>Medien: {preview.deck.importMeta.hasMedia ? "erkannt" : "keine"} · Hierarchie-Knoten: {preview.deck.importMeta.deckHierarchy?.length ?? 0}</p>
                <p>Lernfortschritt: {preview.deck.importMeta.learningProgressStatus}</p>
              </div>
              {preview.warnings.length > 0 ? (
                <div className="mt-5 grid gap-2">
                  {preview.warnings.map((warning) => (
                    <div key={warning} className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </SoftPanel>

            <div className="grid gap-4">
              {preview.sampleCards.map((card) => (
                <article key={card.id} className="rounded-[18px] border border-[#dde3f4] bg-white/72 p-5 shadow-[0_18px_55px_rgba(91,105,154,0.10)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="rounded-xl bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Originalkarte</span>
                    <span className="text-xs font-medium uppercase tracking-wide text-[#66709a]">{card.kind}</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Front</p>
                      <CardHtml html={card.originalFront} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Back</p>
                      <CardHtml html={card.originalBack} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <SoftPanel className="p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Bereit</p>
            <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">Importbericht erscheint nach dem Upload</h3>
          </SoftPanel>
        )}
      </section>
    </div>
  );
}

function TextCsvImportPanel({ onImported }) {
  const [mode, setMode] = React.useState("text");
  const [deckName, setDeckName] = React.useState("Importierter Stapel");
  const [content, setContent] = React.useState("");
  const [report, setReport] = React.useState(null);

  function importDeck() {
    const deck =
      mode === "csv"
        ? createCsvImportDeck({ deckName, csv: content })
        : mode === "spreadsheet"
          ? createTableImportDeck({ deckName, table: content })
          : createTextImportDeck({ deckName, text: content });
    setReport(deck.importMeta);
    onImported(deck);
  }

  return (
    <SoftPanel className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <OrbIcon icon={FileSpreadsheet} className="bg-emerald-50 text-emerald-700" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Text / CSV / Excel</p>
          <h2 className="text-2xl font-semibold text-[#17214f]">Strukturierte Karten importieren</h2>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Stapelname
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
          </label>
          <CoreModeControl value={mode === "text" ? "auto" : "manual"} onChange={(value) => setMode(value === "manual" ? "csv" : "text")} />
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setMode("text")} className={`min-h-10 rounded-xl text-sm font-semibold ${mode === "text" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Text
            </button>
            <button type="button" onClick={() => setMode("csv")} className={`min-h-10 rounded-xl text-sm font-semibold ${mode === "csv" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              CSV
            </button>
            <button type="button" onClick={() => setMode("spreadsheet")} className={`min-h-10 rounded-xl text-sm font-semibold ${mode === "spreadsheet" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Excel
            </button>
          </div>
          <button type="button" disabled={!content.trim()} onClick={importDeck} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            <Database size={17} aria-hidden="true" />
            Importieren
          </button>
          {report ? <p className="text-sm text-[#66709a]">{report.detectedCards} Karten erkannt.</p> : null}
        </div>
        <textarea
          className="min-h-72 rounded-xl border border-[#dfe4f5] p-4 text-sm leading-6"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={mode === "text" ? "Front\n---\nBack" : mode === "csv" ? "front,back,tags" : "front\tback\ttags"}
        />
      </div>
    </SoftPanel>
  );
}

function ManualCreationPanel({ onCreated }) {
  const [deckName, setDeckName] = React.useState("Manueller Kartenstapel");
  const [cardType, setCardType] = React.useState("basic");
  const [front, setFront] = React.useState("");
  const [back, setBack] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [activeField, setActiveField] = React.useState("front");
  const [document, setDocument] = React.useState(null);
  const [documentText, setDocumentText] = React.useState("");
  const [selection, setSelection] = React.useState("");
  const [status, setStatus] = React.useState("");

  async function handleDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextDocument = await createDocumentFromFile(file);
    setDocument(nextDocument);
    setDocumentText(nextDocument.text);
    setStatus(nextDocument.textExtractionStatus === "success" ? "Textlayer geladen." : "Dokument als Quelle gespeichert; Textextraktion steht aus.");
  }

  function captureSelection() {
    const selectedText = window.getSelection?.().toString().trim() || documentText.slice(0, 400);
    if (!selectedText) return;
    setSelection(selectedText);
    if (activeField === "back") {
      setBack((current) => (current ? `${current}\n${selectedText}` : selectedText));
    } else {
      setFront((current) => (current ? `${current}\n${selectedText}` : selectedText));
    }
  }

  function createManualDeck() {
    const deck = createManualCoreDeck({
      deckName,
      card: {
        cardType,
        front,
        back,
        tags,
        answerOptions: cardType === "multiple-choice" ? back.split("\n").filter(Boolean) : [],
        mediaRefs: document?.fileName && cardType === "image-occlusion" ? [document.fileName] : [],
      },
      documentContext: {
        document,
        documentId: document?.id,
        fileName: document?.fileName,
        mimeType: document?.mimeType,
        documentText,
        selection,
        targetField: activeField,
      },
    });
    onCreated(deck);
    setStatus("Originalkarte gespeichert.");
  }

  const canCreate = front.trim() && (back.trim() || cardType === "image-occlusion");

  return (
    <SoftPanel className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <OrbIcon icon={PenLine} className="bg-sky-50 text-sky-700" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Manuelle Erstellung</p>
          <h2 className="text-2xl font-semibold text-[#17214f]">Karte mit Dokumentanker</h2>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Dokument
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[#cfd6ed] px-3 text-[#66709a]">
              <FileText size={17} aria-hidden="true" />
              <input type="file" accept=".txt,.md,.markdown,.pdf,.docx,image/*" onChange={handleDocument} />
            </span>
          </label>
          {document ? (
            <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-3 text-sm text-[#66709a]">
              {cardType === "image-occlusion" ? <Image className="mb-2 text-sky-700" size={18} aria-hidden="true" /> : null}
              <p className="font-semibold text-[#17214f]">{document.fileName}</p>
              <p>{document.textExtractionStatus}</p>
            </div>
          ) : null}
          <textarea
            className="min-h-80 rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6"
            value={documentText}
            onChange={(event) => setDocumentText(event.target.value)}
            placeholder="Dokumenttext"
          />
          <button type="button" onClick={captureSelection} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
            <ClipboardCheck size={16} aria-hidden="true" />
            Auswahl uebernehmen
          </button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kartenstapel
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kartentyp
              <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={cardType} onChange={(event) => setCardType(event.target.value)}>
                {cardTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setActiveField("front")} className={`min-h-10 rounded-xl text-sm font-semibold ${activeField === "front" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Vorderseite aktiv
            </button>
            <button type="button" onClick={() => setActiveField("back")} className={`min-h-10 rounded-xl text-sm font-semibold ${activeField === "back" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Rueckseite aktiv
            </button>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Vorderseite
            <textarea className="min-h-28 rounded-xl border border-[#dfe4f5] p-3" value={front} onFocus={() => setActiveField("front")} onChange={(event) => setFront(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Rueckseite
            <textarea className="min-h-28 rounded-xl border border-[#dfe4f5] p-3" value={back} onFocus={() => setActiveField("back")} onChange={(event) => setBack(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Tags
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="biologie zelle pruefung" />
          </label>
          <button type="button" disabled={!canCreate} onClick={createManualDeck} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            <Database size={17} aria-hidden="true" />
            Originalkarte speichern
          </button>
          {status ? <p className="text-sm text-[#66709a]">{status}</p> : null}
        </div>
      </div>
    </SoftPanel>
  );
}

function AiCreationPanel({ onCreated, onJob }) {
  const [config, setConfig] = React.useState({
    language: "Deutsch",
    cardCount: 6,
    detailLevel: "normal",
    cardTypes: ["basic", "cloze"],
    focus: "Pruefungswissen",
    subject: "",
    costTier: "balanced",
  });
  const [document, setDocument] = React.useState(createSourceDocument({ fileName: "Textquelle", text: "", textExtractionStatus: "success" }));
  const [draftDeck, setDraftDeck] = React.useState(null);
  const [draftCards, setDraftCards] = React.useState([]);
  const [status, setStatus] = React.useState("");

  function updateConfig(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function toggleCardType(cardType) {
    setConfig((current) => {
      const cardTypes = current.cardTypes.includes(cardType)
        ? current.cardTypes.filter((value) => value !== cardType)
        : [...current.cardTypes, cardType];
      return { ...current, cardTypes: cardTypes.length ? cardTypes : ["basic"] };
    });
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocument(await createDocumentFromFile(file));
  }

  function updateDocumentText(text) {
    setDocument((current) => ({ ...current, text, textExtractionStatus: text ? "success" : current.textExtractionStatus }));
  }

  function generateDrafts(nextConfig = config) {
    const result = generateCardsFromDocument({
      document,
      config: nextConfig,
      deckName: nextConfig.subject || "KI-Entwuerfe",
    });
    onJob(result.job);
    setStatus(result.validation.valid ? `${result.draftDeck.cards.length} Entwuerfe generiert.` : result.validation.errors.join(" "));
    setDraftDeck(result.draftDeck);
    setDraftCards(result.draftDeck?.cards ?? []);
  }

  function updateDraft(cardId, key, value) {
    setDraftCards((cards) => cards.map((card) => (card.id === cardId ? { ...card, [key]: value } : card)));
  }

  function acceptDrafts() {
    if (!draftDeck || draftCards.length === 0) return;
    const acceptedDeck = acceptAiDraftDeck({ ...draftDeck, cards: draftCards });
    onCreated(acceptedDeck);
    setStatus("Entwuerfe uebernommen.");
  }

  return (
    <SoftPanel className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <OrbIcon icon={WandSparkles} className="bg-indigo-50 text-indigo-700" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">KI-assistierte Erstellung</p>
          <h2 className="text-2xl font-semibold text-[#17214f]">Datei zu Kartenentwuerfen</h2>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Datei
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[#cfd6ed] px-3 text-[#66709a]">
              <FileText size={17} aria-hidden="true" />
              <input type="file" accept=".txt,.md,.markdown,.pdf,.docx" onChange={handleFile} />
            </span>
          </label>
          <textarea className="min-h-48 rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6" value={document.text} onChange={(event) => updateDocumentText(event.target.value)} placeholder="Quellentext" />
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["language", "Sprache"],
              ["detailLevel", "Detailgrad"],
              ["focus", "Fokus"],
              ["subject", "Fach"],
            ].map(([key, label]) => (
              <label key={key} className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                {label}
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={config[key]} onChange={(event) => updateConfig(key, event.target.value)} />
              </label>
            ))}
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kartenanzahl
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="number" min="1" max="30" value={config.cardCount} onChange={(event) => updateConfig("cardCount", Number(event.target.value))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kostenprofil
              <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={config.costTier} onChange={(event) => updateConfig("costTier", event.target.value)}>
                <option value="low">Low</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality-ready</option>
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-[#4e5b8c]">Kartentypen</p>
            <div className="flex flex-wrap gap-2">
              {["basic", "cloze"].map((cardType) => (
                <label key={cardType} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm text-[#4e5b8c]">
                  <input type="checkbox" checked={config.cardTypes.includes(cardType)} onChange={() => toggleCardType(cardType)} />
                  {cardType}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => generateDrafts()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white">
              <Bot size={17} aria-hidden="true" />
              Generieren
            </button>
            <button type="button" onClick={() => generateDrafts({ ...config, cardCount: Math.min(30, Number(config.cardCount) + 2) })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              Mehr Details
            </button>
            <button type="button" onClick={() => generateDrafts({ ...config, cardCount: Math.max(1, Number(config.cardCount) - 2) })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              Weniger
            </button>
          </div>
          {status ? <p className="text-sm text-[#66709a]">{status}</p> : null}
        </div>

        <div className="grid gap-4">
          {draftCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#cfd6ed] bg-[#f8f9fe] p-6 text-sm text-[#66709a]">Keine Entwuerfe.</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-[#17214f]">Entwuerfe</h3>
                <button type="button" onClick={acceptDrafts} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Uebernehmen
                </button>
              </div>
              {draftCards.map((card) => (
                <article key={card.id} className="rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-xl bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{card.kind}</span>
                    <span className="text-xs font-semibold text-[#66709a]">Confidence {Math.round((card.meta?.confidence ?? 0.75) * 100)} %</span>
                  </div>
                  <textarea className="min-h-20 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalFront} onChange={(event) => updateDraft(card.id, "originalFront", event.target.value)} />
                  <textarea className="mt-3 min-h-24 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalBack} onChange={(event) => updateDraft(card.id, "originalBack", event.target.value)} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#66709a]">
                    <span>{card.sourceAnchors?.[0]?.textQuote?.slice(0, 120) || "Quelle fehlt"}</span>
                    <button type="button" onClick={() => setDraftCards((cards) => cards.filter((item) => item.id !== card.id))} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-red-50 px-2 font-semibold text-red-700">
                      <Trash2 size={14} aria-hidden="true" />
                      Verwerfen
                    </button>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </div>
    </SoftPanel>
  );
}

const creationMethods = [
  { id: "anki", title: "Anki APKG", eyebrow: "Import", body: "Decks, Notes, Karten und Raw-Fallbacks.", icon: FileArchive, color: "teal" },
  { id: "text", title: "Text / CSV / Excel", eyebrow: "Import", body: "Front/Back-Daten schnell uebernehmen.", icon: FileSpreadsheet, color: "emerald" },
  { id: "manual", title: "Manuell", eyebrow: "Dokumentanker", body: "Karten mit aktiver Front/Back-Auswahl.", icon: PenLine, color: "sky" },
  { id: "ai", title: "KI-Drafts", eyebrow: "Review-first", body: "Strukturierte Entwuerfe aus Quellen.", icon: WandSparkles, color: "indigo" },
];

function CreationMethodButton({ method, isSelected, onSelect }) {
  const Icon = method.icon;
  const colorClass = method.color === "teal" ? "text-teal-700 bg-teal-50" : method.color === "emerald" ? "text-emerald-700 bg-emerald-50" : method.color === "sky" ? "text-sky-700 bg-sky-50" : "text-indigo-700 bg-indigo-50";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[18px] border border-[#dde3f4] bg-white/72 p-6 text-left shadow-[0_18px_55px_rgba(91,105,154,0.12)] transition hover:-translate-y-1 ${isSelected ? "ring-2 ring-[#8790d8]" : ""}`}
    >
      <OrbIcon icon={Icon} className={colorClass} />
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#66709a]">{method.eyebrow}</p>
      <h3 className="mt-2 text-2xl font-semibold text-[#17214f]">{method.title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#66709a]">{method.body}</p>
    </button>
  );
}

function CreationScreen({ onCreated, onJob }) {
  const [selectedMethod, setSelectedMethod] = React.useState("anki");

  function renderSelectedMethod() {
    if (selectedMethod === "anki") return <ApkgImportPanel onImported={onCreated} />;
    if (selectedMethod === "text") return <TextCsvImportPanel onImported={onCreated} />;
    if (selectedMethod === "manual") return <ManualCreationPanel onCreated={onCreated} />;
    return <AiCreationPanel onCreated={onCreated} onJob={onJob} />;
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Erstellen" title="Neue Karten" body="Import, manuelle Erstellung und KI-Drafts." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {creationMethods.map((method) => (
          <CreationMethodButton key={method.id} method={method} isSelected={selectedMethod === method.id} onSelect={() => setSelectedMethod(method.id)} />
        ))}
      </section>
      {renderSelectedMethod()}
    </div>
  );
}

function LearnScreen({ decks, onStartDeck, onCreateDeck }) {
  const library = createDeckLibraryModel(decks);

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Review"
        title="Lernen"
        body="Originale und variantenfokussierte Sessions."
        action={
          <button type="button" onClick={onCreateDeck} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
            <PlusSquare size={17} aria-hidden="true" />
            Neue Karten
          </button>
        }
      />

      {decks.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Keine Karten"
          body="Erstelle oder importiere zuerst einen Stapel."
          action={
            <button type="button" onClick={onCreateDeck} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
              Erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          }
        />
      ) : (
        library.rows.map((row) => {
          const deck = row.deck;
          const summary = row.summary;
          return (
            <SoftPanel key={deck.id} className="p-6">
              <div className="flex flex-wrap items-center gap-5">
                <OrbIcon icon={BookOpen} />
                <div className="min-w-[12rem] flex-1">
                  <h3 className="text-xl font-semibold text-[#17214f]">{deck.name}</h3>
                  <p className="mt-1 text-sm text-[#66709a]">{summary.dueCards} faellig · {summary.activeVariants} Varianten · {deck.deckSettings.coreMode}</p>
                </div>
                <div className="grid min-w-24 gap-1">
                  <span className="text-xs font-semibold text-[#66709a]">Maturity</span>
                  <span className="text-2xl font-semibold text-[#17214f]">{summary.averageMaturityXp}</span>
                </div>
                <DonutValue value={row.progress} />
                <button type="button" onClick={() => onStartDeck(deck, false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f2f4fd] px-5 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
                  Lernen <ChevronRight size={16} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onStartDeck(deck, true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-50 px-5 text-sm font-semibold text-amber-700 hover:bg-white">
                  Varianten <Sparkles size={16} aria-hidden="true" />
                </button>
              </div>
            </SoftPanel>
          );
        })
      )}
    </div>
  );
}

function StudyMode({ deck, variantSession, onExit, onDeckUpdated }) {
  const initial = React.useMemo(() => createReviewSession(deck, { variantSession }), [deck.id, variantSession]);
  const [sessionDeck, setSessionDeck] = React.useState(initial.deck);
  const [session] = React.useState(initial.session);
  const [index, setIndex] = React.useState(0);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [showAnchor, setShowAnchor] = React.useState(false);
  const current = session.items[index] ?? null;
  const progress = session.items.length ? ((index + 1) / session.items.length) * 100 : 0;
  const sourceCard = current ? sessionDeck.cards.find((card) => card.id === current.sourceCardId) : null;

  React.useEffect(() => {
    if (initial.session.generatedVariantCount > 0) {
      onDeckUpdated(initial.deck);
    }
  }, []);

  function finishOrNext(nextDeck) {
    onDeckUpdated(nextDeck);
    setSessionDeck(nextDeck);
    if (index < session.items.length - 1) {
      setIndex((value) => value + 1);
      setShowAnswer(false);
      setShowAnchor(false);
    } else {
      onExit();
    }
  }

  function grade(rating) {
    if (!current) return;
    const result = recordReviewRating(sessionDeck, current, rating);
    finishOrNext(result.deck);
  }

  function updateVariant(action) {
    if (!current?.isVariant) return;
    const result = recordVariantFeedback(sessionDeck, current, { action });
    onDeckUpdated(result.deck);
    setSessionDeck(result.deck);
  }

  React.useEffect(() => {
    function handleKeyDown(event) {
      const action = resolveReviewShortcut(event, { hasCurrent: Boolean(current), showAnswer });
      if (!action) return;

      event.preventDefault();
      if (action.type === "exit") {
        onExit();
      } else if (action.type === "reveal") {
        setShowAnswer(true);
      } else if (action.type === "rate") {
        grade(action.rating);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, showAnswer, sessionDeck, index]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#eef2fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <header className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={onExit} className="grid size-11 place-items-center rounded-full bg-white/75 text-[#4f5eb1] shadow-[0_14px_40px_rgba(91,105,154,0.12)]" aria-label="Lernmodus verlassen">
              <X size={22} aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-[#66709a]">{deck.name}</p>
              <p className="mt-1 text-sm text-[#66709a]">{session.items.length ? `${index + 1} / ${session.items.length}` : "0 / 0"}</p>
            </div>
            <button type="button" className="grid size-11 place-items-center rounded-full bg-white/75 text-[#4f5eb1] shadow-[0_14px_40px_rgba(91,105,154,0.12)]" aria-label="Lerneinstellungen">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          <MiniProgress value={progress} />
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="flex min-h-[56vh] w-full max-w-3xl flex-col justify-center rounded-[28px] border border-[#dfe4f5] bg-white/86 p-8 shadow-[0_30px_90px_rgba(91,105,154,0.18)] sm:p-14">
            {current ? (
              <>
                <div className="mx-auto w-full max-w-2xl">
                  <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#7a84c7]">Frage</p>
                  <div className="text-2xl font-semibold leading-relaxed text-[#17214f] sm:text-4xl">
                    <CardHtml html={current.front} />
                  </div>
                  {showAnswer ? (
                    <>
                      <div className="my-8 h-px bg-[#dfe4f5]" />
                      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#7a84c7]">Antwort</p>
                      <div className="text-xl font-semibold leading-relaxed text-[#17214f] sm:text-3xl">
                        <CardHtml html={current.back} />
                      </div>
                      <div className="mt-8 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setShowAnchor((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]">
                          <Eye size={16} aria-hidden="true" />
                          Original anzeigen
                        </button>
                        {current.isVariant ? (
                          <>
                            <button type="button" onClick={() => updateVariant("disable")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700">
                              <Ban size={16} aria-hidden="true" />
                              Nicht mehr zeigen
                            </button>
                            <button type="button" onClick={() => updateVariant("flag")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700">
                              <Flag size={16} aria-hidden="true" />
                              Fehler melden
                            </button>
                          </>
                        ) : null}
                      </div>
                      {showAnchor && sourceCard ? (
                        <div className="mt-5 rounded-2xl border border-[#dfe4f5] bg-[#f8f9fe] p-5">
                          <p className="text-sm font-semibold uppercase tracking-wide text-[#66709a]">Originalanker</p>
                          <div className="mt-3 grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold text-[#66709a]">Front</p>
                              <CardHtml html={sourceCard.immutableOriginal?.front ?? sourceCard.originalFront} />
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold text-[#66709a]">Back</p>
                              <CardHtml html={sourceCard.immutableOriginal?.back ?? sourceCard.originalBack} />
                            </div>
                          </div>
                          <p className="mt-3 text-sm text-[#66709a]">Quelle: {current.sourceAnchors?.[0]?.documentName || "Originalkarte"} {current.transformType ? `· Variation: ${current.transformType}` : ""}</p>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowAnswer(true)} className="mx-auto mt-12 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white">
                      <RotateCcw size={17} aria-hidden="true" />
                      Antwort anzeigen
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center">
                <h1 className="text-3xl font-semibold">Keine faelligen Karten</h1>
                <p className="mt-3 text-[#66709a]">Dieser Stapel hat aktuell keine reviewbaren Karten.</p>
              </div>
            )}
          </div>
        </section>

        {showAnswer ? (
          <footer className="grid gap-3 sm:grid-cols-4">
            {ratingButtons.map((rating) => (
              <button key={rating.key} type="button" onClick={() => grade(rating.key)} disabled={!current} className={`min-h-20 rounded-2xl border text-center shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${rating.className}`}>
                <span className="block text-2xl font-semibold">{rating.number}</span>
                <span className="mt-1 block text-sm font-semibold">{rating.label}</span>
              </button>
            ))}
          </footer>
        ) : null}
      </div>
    </main>
  );
}

function GraphScreen({ decks, onUpdateDeck }) {
  const [deckId, setDeckId] = React.useState(decks[0]?.id ?? "");
  const deck = decks.find((item) => item.id === deckId) ?? decks[0] ?? null;
  const graph = deck?.graph ?? null;

  React.useEffect(() => {
    if (!deckId && decks[0]) setDeckId(decks[0].id);
  }, [decks, deckId]);

  function generateGraph() {
    if (!deck) return;
    const nextGraph = buildDeckGraph(deck, { termLimit: 10 });
    onUpdateDeck(deck.id, (current) => ({ ...current, graph: nextGraph }));
  }

  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Mindmap"
        title="Deck Graph"
        body="Themen, Kartenlinks und Refresh-Trigger."
        action={
          <button type="button" onClick={generateGraph} disabled={!deck} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white disabled:bg-slate-300">
            <Network size={17} aria-hidden="true" />
            Graph generieren
          </button>
        }
      />
      {decks.length === 0 ? (
        <EmptyState icon={Network} title="Kein Stapel fuer Graph" body="Importiere oder erstelle Karten." />
      ) : (
        <>
          <SoftPanel className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <select className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]" value={deck?.id ?? ""} onChange={(event) => setDeckId(event.target.value)}>
                {decks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <span className="text-sm font-semibold text-[#66709a]">Status: {graph?.status ?? "offen"} · Refresh: {shouldRefreshDeckGraph(deck) ? "faellig" : "aktuell"}</span>
            </div>
          </SoftPanel>
          <SoftPanel className="p-6">
            {graph ? (
              <div className="grid gap-6 xl:grid-cols-[1fr_0.7fr]">
                <div className="min-h-[28rem] rounded-2xl bg-[#f8f9fe] p-4">
                  <svg viewBox="0 0 720 420" className="h-full min-h-[28rem] w-full" role="img" aria-label="Deck Graph">
                    {graph.edges.map((edge) => {
                      const fromIndex = graph.nodes.findIndex((node) => node.id === edge.from);
                      const toIndex = graph.nodes.findIndex((node) => node.id === edge.to);
                      const fromAngle = (fromIndex / Math.max(1, graph.nodes.length)) * Math.PI * 2;
                      const toAngle = (toIndex / Math.max(1, graph.nodes.length)) * Math.PI * 2;
                      const from = fromIndex === 0 ? [360, 210] : [360 + Math.cos(fromAngle) * 210, 210 + Math.sin(fromAngle) * 145];
                      const to = toIndex === 0 ? [360, 210] : [360 + Math.cos(toAngle) * 210, 210 + Math.sin(toAngle) * 145];
                      return <line key={edge.id} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#c9d1ee" strokeWidth="2" />;
                    })}
                    {graph.nodes.map((node, nodeIndex) => {
                      const angle = (nodeIndex / Math.max(1, graph.nodes.length)) * Math.PI * 2;
                      const x = nodeIndex === 0 ? 360 : 360 + Math.cos(angle) * 210;
                      const y = nodeIndex === 0 ? 210 : 210 + Math.sin(angle) * 145;
                      const fill = node.type === "deck" ? "#4f5eb1" : node.type === "topic" ? "#0f766e" : "#ffffff";
                      const color = node.type === "card" ? "#17214f" : "#ffffff";
                      return (
                        <g key={node.id}>
                          <circle cx={x} cy={y} r={node.type === "deck" ? 54 : node.type === "topic" ? 38 : 30} fill={fill} stroke="#dfe4f5" strokeWidth="2" />
                          <text x={x} y={y + 4} textAnchor="middle" fill={color} fontSize="12" fontWeight="700">
                            {node.label.slice(0, 16)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="grid gap-3 content-start">
                  <StatTile label="Knoten" value={graph.nodes.length} />
                  <StatTile label="Kanten" value={graph.edges.length} />
                  <StatTile label="Kartenbasis" value={graph.metadata.cardCount} />
                </div>
              </div>
            ) : (
              <EmptyState icon={Network} title="Graph noch nicht generiert" body="Der Graph wird manuell oder nach Triggern aktualisiert." />
            )}
          </SoftPanel>
        </>
      )}
    </div>
  );
}

function CommunityScreen({ decks, communities, onSaveCommunity, onSaveDeck }) {
  const [name, setName] = React.useState("Medizin Erstes Studienjahr");
  const [selectedDeckId, setSelectedDeckId] = React.useState(decks[0]?.id ?? "");
  const community = communities[0] ?? null;

  function ensureCommunity() {
    const next = community ?? createCommunity({ name });
    onSaveCommunity(next);
    return next;
  }

  function shareSelectedDeck() {
    const deck = decks.find((item) => item.id === selectedDeckId);
    if (!deck) return;
    const target = ensureCommunity();
    const result = shareDeckToCommunity(target, deck, { permission: "copy" });
    onSaveCommunity(result.community);
  }

  function copyDeck(sharedRef) {
    const sourceDeck = decks.find((deck) => deck.id === sharedRef.deckId);
    if (sourceDeck) {
      onSaveDeck(copySharedDeckToLibrary(sourceDeck));
    }
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Kleine Gruppen" title="Community" body="Ordnerbasiertes Teilen ohne Lernstandsvergleich." />
      <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Users} className="bg-emerald-50 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Community</p>
              <h3 className="text-xl font-semibold text-[#17214f]">{community?.name ?? "Neue Gruppe"}</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Name
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button type="button" onClick={ensureCommunity} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">
              <Users size={17} aria-hidden="true" />
              Community sichern
            </button>
            <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4 text-sm text-[#66709a]">
              <Lock size={17} aria-hidden="true" />
              <p className="mt-2">Keine fremden Review-Events, Streaks, Online-Status oder Rankings.</p>
            </div>
          </div>
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-[#17214f]">Ordner und geteilte Stapel</h3>
            <div className="flex flex-wrap gap-2">
              <select className="min-h-10 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]" value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={shareSelectedDeck} disabled={!selectedDeckId} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                <Share2 size={16} aria-hidden="true" />
                Teilen
              </button>
            </div>
          </div>
          {community ? (
            <div className="grid gap-4">
              {community.folders.map((folder) => (
                <div key={folder.id} className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#17214f]">
                    <Folder size={17} aria-hidden="true" />
                    {folder.name}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {(community.sharedDecks ?? []).filter((ref) => ref.folderId === folder.id).map((ref) => (
                      <div key={ref.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3">
                        <Layers size={17} className="text-[#6672bf]" aria-hidden="true" />
                        <span className="min-w-[12rem] flex-1 text-sm font-semibold text-[#17214f]">{ref.deckName}</span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">{ref.permission}</span>
                        <button type="button" onClick={() => copyDeck(ref)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#eef1fb] px-3 text-xs font-semibold text-[#4f5eb1]">
                          <Copy size={14} aria-hidden="true" />
                          Kopieren
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Users} title="Noch keine Community" body="Lege eine Gruppe an und teile danach Stapel in einen Ordner." />
          )}
        </SoftPanel>
      </div>
    </div>
  );
}

function AssistantScreen({ decks, transcript, plans, onSaveChat, onSavePlan }) {
  const [activeTab, setActiveTab] = React.useState("chat");
  const [deckId, setDeckId] = React.useState("all");
  const [question, setQuestion] = React.useState("Welche Karten haengen mit Myelin zusammen?");
  const [targetDate, setTargetDate] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
  });
  const [dailyMinutes, setDailyMinutes] = React.useState(35);
  const [newCardsPerDay, setNewCardsPerDay] = React.useState(8);
  const latestPlan = plans[0] ?? null;

  function askQuestion() {
    if (!question.trim()) return;
    const exchange = answerDeckQuestion({ decks, deckId, question });
    onSaveChat(exchange);
  }

  function generatePlan() {
    const plan = createLearningPlan({
      decks: deckId === "all" ? decks : decks.filter((deck) => deck.id === deckId),
      targetDate,
      dailyMinutes: Number(dailyMinutes),
      newCardsPerDay: Number(newCardsPerDay),
      includeVariants: true,
    });
    onSavePlan(plan);
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Chat und Lernplan" title="Assistent" body="Antwortet quellengebunden aus deinen Karten und plant Wiederholungstage." />

      <SoftPanel className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-grid min-h-10 grid-cols-2 overflow-hidden rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] text-sm font-semibold text-[#596489]">
            <button type="button" onClick={() => setActiveTab("chat")} className={`px-4 ${activeTab === "chat" ? "bg-[#4f5eb1] text-white" : "hover:bg-white"}`}>
              Chat
            </button>
            <button type="button" onClick={() => setActiveTab("plan")} className={`px-4 ${activeTab === "plan" ? "bg-[#4f5eb1] text-white" : "hover:bg-white"}`}>
              Lernplan
            </button>
          </div>
          <select className="min-h-10 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]" value={deckId} onChange={(event) => setDeckId(event.target.value)}>
            <option value="all">Alle Stapel</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>
      </SoftPanel>

      {activeTab === "chat" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={Bot} className="bg-indigo-50 text-indigo-700" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Chat-your-Deck</p>
                <h3 className="text-xl font-semibold text-[#17214f]">Frage an deine Karten</h3>
              </div>
            </div>
            <textarea className="min-h-32 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button type="button" onClick={askQuestion} disabled={!decks.length || !question.trim()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <Bot size={17} aria-hidden="true" />
              Quellengebunden antworten
            </button>
            <p className="mt-3 text-sm text-[#66709a]">Ohne passende Kartenquelle gibt der Assistent keine freie Antwort.</p>
          </SoftPanel>

          <SoftPanel className="p-6">
            <h3 className="text-xl font-semibold text-[#17214f]">Antworten</h3>
            <div className="mt-5 grid max-h-[34rem] gap-4 overflow-auto pr-1">
              {(transcript.length ? transcript : []).map((exchange) => (
                <article key={exchange.id} className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
                  <p className="text-sm font-semibold text-[#17214f]">{exchange.question}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#4e5b8c]">{exchange.answer}</p>
                  {exchange.warnings.length > 0 ? (
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{exchange.warnings.join(" ")}</div>
                  ) : null}
                  <div className="mt-4 grid gap-2">
                    {exchange.citations.map((citation) => (
                      <div key={`${exchange.id}-${citation.cardId}`} className="rounded-xl bg-white px-3 py-2 text-xs text-[#66709a]">
                        <span className="font-semibold text-[#17214f]">{citation.deckName}</span> · {citation.quote}
                        <p className="mt-1">Quelle: {citation.source} · {citation.sourceQuote.slice(0, 120)}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {transcript.length === 0 ? <p className="text-sm text-[#66709a]">Noch keine Fragen gestellt.</p> : null}
            </div>
          </SoftPanel>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={CalendarDays} className="bg-emerald-50 text-emerald-700" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Lernplan</p>
                <h3 className="text-xl font-semibold text-[#17214f]">Pruefungsziel planen</h3>
              </div>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Zieltermin
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Minuten pro Tag
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="number" min="10" max="240" value={dailyMinutes} onChange={(event) => setDailyMinutes(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Neue Karten pro Tag
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="number" min="0" max="80" value={newCardsPerDay} onChange={(event) => setNewCardsPerDay(event.target.value)} />
              </label>
              <button type="button" onClick={generatePlan} disabled={!decks.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                <CalendarDays size={17} aria-hidden="true" />
                Lernplan generieren
              </button>
            </div>
          </SoftPanel>

          <SoftPanel className="p-6">
            <h3 className="text-xl font-semibold text-[#17214f]">Aktueller Plan</h3>
            {latestPlan ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <StatTile label="Tage" value={latestPlan.totals.days} />
                  <StatTile label="Faellig" value={latestPlan.totals.dueCards} />
                  <StatTile label="Neu" value={latestPlan.totals.newCards} />
                  <StatTile label="Varianten" value={latestPlan.totals.activeVariants} />
                </div>
                <div className="mt-5 grid max-h-[34rem] gap-3 overflow-auto pr-1">
                  {latestPlan.days.slice(0, 14).map((day) => (
                    <div key={day.date} className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#17214f]">{day.date} · {day.focusDeckName}</p>
                        <span className="rounded-xl bg-white px-3 py-1 text-xs font-semibold text-[#4f5eb1]">{day.minutes} min</span>
                      </div>
                      <p className="mt-2 text-sm text-[#66709a]">{day.dueReviews} Reviews · {day.newCards} neue Karten · {day.variantReviews} Varianten</p>
                      {day.focusTopics.length > 0 ? <p className="mt-2 text-xs text-[#66709a]">Fokus: {day.focusTopics.join(", ")}</p> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-[#66709a]">Noch kein Lernplan generiert.</p>
            )}
          </SoftPanel>
        </div>
      )}
    </div>
  );
}

function AiJobsScreen({ decks, jobs }) {
  const ledger = createAiJobLedger({ decks, jobs });

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Orchestrierung" title="KI-Jobs" body="Trigger, Status und strukturierte Ergebnisse." />
      <div className="grid gap-6 lg:grid-cols-3">
        <StatTile icon={Bot} label="Jobs" value={ledger.total} />
        <StatTile icon={CheckCircle2} label="Succeeded" value={ledger.succeeded} accent="text-emerald-700" />
        <StatTile icon={AlertCircle} label="Failed" value={ledger.failed} accent="text-red-700" />
      </div>
      <SoftPanel className="p-6">
        <div className="grid gap-3">
          {ledger.jobs.length === 0 ? (
            <p className="text-sm text-[#66709a]">Keine Jobs.</p>
          ) : (
            ledger.jobs.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] px-4 py-3">
                <OrbIcon icon={Bot} className="size-10 bg-indigo-50 text-indigo-700" />
                <div className="min-w-[14rem] flex-1">
                  <p className="text-sm font-semibold text-[#17214f]">{job.jobType}</p>
                  <p className="text-xs text-[#66709a]">{job.deckName ?? job.deckId ?? "global"} · {job.createdAt}</p>
                </div>
                <span className={`rounded-xl px-3 py-1 text-xs font-semibold ${job.status === "succeeded" ? "bg-emerald-50 text-emerald-700" : job.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                  {job.status}
                </span>
                <span className="text-xs text-[#66709a]">{job.resultLabel}</span>
              </div>
            ))
          )}
        </div>
      </SoftPanel>
    </div>
  );
}

function SettingsScreen({ appState, profile, decks, onSaveProfile, onUpdateAllDecks, onSaveState }) {
  const [form, setForm] = React.useState(profile);
  const [password, setPassword] = React.useState("");
  const [accountMessage, setAccountMessage] = React.useState("");
  const [exportText, setExportText] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [portabilityMessage, setPortabilityMessage] = React.useState("");

  React.useEffect(() => {
    setForm(profile);
  }, [profile]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePrivacy(key, value) {
    setForm((current) => ({ ...current, privacy: { ...current.privacy, [key]: value } }));
  }

  function save() {
    onSaveProfile(form);
  }

  function setAllMode(coreMode) {
    onUpdateAllDecks((deck) => ({ ...deck, deckSettings: { ...deck.deckSettings, coreMode } }));
  }

  function createAccount() {
    try {
      const nextProfile = createLocalAccount({ ...form, password });
      onSaveProfile(nextProfile);
      setPassword("");
      setAccountMessage("Lokaler Account erstellt und angemeldet.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Account konnte nicht erstellt werden.");
    }
  }

  function signIn() {
    try {
      const nextProfile = signInLocalAccount(profile, { email: form.email, password });
      onSaveProfile(nextProfile);
      setPassword("");
      setAccountMessage("Lokale Anmeldung erfolgreich.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.");
    }
  }

  function signOut() {
    onSaveProfile(signOutLocalAccount(profile));
    setAccountMessage("Abgemeldet.");
  }

  function connectProvider(provider) {
    onSaveProfile(connectOAuthPlaceholder(profile, provider));
    setAccountMessage(`${provider} als OAuth-Platzhalter verbunden.`);
  }

  function prepareExport() {
    const text = stringifyPortableExport(appState);
    const payload = createPortableExport(appState);
    setExportText(text);
    setPortabilityMessage(`Export vorbereitet: ${payload.decks.length} Decks, Hash ${payload.contentHash}.`);
  }

  function importExport() {
    try {
      const validation = validatePortableExport(importText);
      if (!validation.valid) {
        setPortabilityMessage(validation.errors.join(" "));
        return;
      }
      const nextState = mergePortableExportIntoState(appState, validation.payload);
      onSaveState(nextState);
      setImportText("");
      setPortabilityMessage("Export validiert und in die lokale Bibliothek gemergt.");
    } catch (error) {
      setPortabilityMessage(error instanceof Error ? error.message : "Import konnte nicht gelesen werden.");
    }
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Profil" title="Einstellungen" body="Account, Hochschule, Datenschutz, Scheduler und Datenportabilitaet." />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <SoftPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <OrbIcon icon={User} />
            <h3 className="text-xl font-semibold text-[#17214f]">Account</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Anzeigename
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              E-Mail
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.email} onChange={(event) => update("email", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Hochschule
              <span className="flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3">
                <GraduationCap size={17} className="text-[#66709a]" aria-hidden="true" />
                <input className="min-w-0 flex-1 outline-none" value={form.university} onChange={(event) => update("university", event.target.value)} />
              </span>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Sprache
              <span className="flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3">
                <Languages size={17} className="text-[#66709a]" aria-hidden="true" />
                <select className="min-w-0 flex-1 outline-none" value={form.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value)}>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </select>
              </span>
            </label>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Lokales Passwort
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="button" onClick={createAccount} className="mt-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white">
              <User size={17} aria-hidden="true" />
              Account erstellen
            </button>
            <button type="button" onClick={signIn} className="mt-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              <ShieldCheck size={17} aria-hidden="true" />
              Anmelden
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={save} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
              <Save size={16} aria-hidden="true" />
              Profil speichern
            </button>
            <button type="button" onClick={() => connectProvider("oauth-demo")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              <Lock size={16} aria-hidden="true" />
              OAuth-Platzhalter
            </button>
            <button type="button" onClick={signOut} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700">
              <X size={16} aria-hidden="true" />
              Abmelden
            </button>
          </div>
          <p className="mt-3 text-sm text-[#66709a]">
            Status: {profile.account?.status ?? "lokales Profil"} {profile.account?.authProvider ? `· ${profile.account.authProvider}` : ""}
          </p>
          {accountMessage ? <p className="mt-2 text-sm text-[#66709a]">{accountMessage}</p> : null}
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <OrbIcon icon={Lock} className="bg-emerald-50 text-emerald-700" />
            <h3 className="text-xl font-semibold text-[#17214f]">Datenschutz</h3>
          </div>
          <div className="grid gap-3">
            {[
              ["shareLearningProgress", "Lernstand teilen"],
              ["showOnlineStatus", "Online-Status zeigen"],
              ["showStreaksToOthers", "Streaks fuer andere"],
            ].map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center justify-between rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] px-4 text-sm font-semibold text-[#4e5b8c]">
                {label}
                <input type="checkbox" checked={Boolean(form.privacy?.[key])} onChange={(event) => updatePrivacy(key, event.target.checked)} />
              </label>
            ))}
          </div>
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-[#4e5b8c]">CoRe-Modus fuer alle Stapel</p>
            <CoreModeControl value="auto" onChange={setAllMode} />
            <p className="mt-3 text-sm text-[#66709a]">{decks.length} Stapel betroffen.</p>
          </div>
        </SoftPanel>
      </div>
      <SoftPanel className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrbIcon icon={Database} className="bg-sky-50 text-sky-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Datenportabilitaet</p>
            <h3 className="text-xl font-semibold text-[#17214f]">Lokaler Export und Import</h3>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid gap-3">
            <button type="button" onClick={prepareExport} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white">
              <Database size={17} aria-hidden="true" />
              Export vorbereiten
            </button>
            <textarea className="min-h-72 rounded-xl border border-[#dfe4f5] p-3 font-mono text-xs leading-5" value={exportText} onChange={(event) => setExportText(event.target.value)} placeholder="Export-JSON" />
          </div>
          <div className="grid gap-3">
            <button type="button" onClick={importExport} disabled={!importText.trim()} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
              <Upload size={17} aria-hidden="true" />
              JSON importieren
            </button>
            <textarea className="min-h-72 rounded-xl border border-[#dfe4f5] p-3 font-mono text-xs leading-5" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="CoRe Export hier einfuegen" />
          </div>
        </div>
        {portabilityMessage ? <p className="mt-3 text-sm text-[#66709a]">{portabilityMessage}</p> : null}
      </SoftPanel>
    </div>
  );
}

export function App() {
  const workspace = React.useMemo(() => createCoreWorkspace(), []);
  const [state, setState] = React.useState(() => workspace.getState());
  const [activeView, setActiveView] = React.useState(menu.defaultViewId);
  const [studyRequest, setStudyRequest] = React.useState(null);
  const navigationItems = menu.listNavigationItems();

  function refresh() {
    setState(workspace.getState());
  }

  function saveDeck(deck) {
    const saved = workspace.saveDeck(deck);
    refresh();
    return saved;
  }

  function updateDeck(deckId, updater) {
    const updated = workspace.updateDeck(deckId, updater);
    refresh();
    return updated;
  }

  function setDeckCoreMode(deckId, coreMode) {
    const updated = workspace.setDeckCoreMode(deckId, coreMode);
    refresh();
    return updated;
  }

  function saveDeckCard(deckId, cardId, patch) {
    const updated = workspace.saveDeckCardContent(deckId, cardId, patch);
    refresh();
    return updated;
  }

  function deleteDeckCard(deckId, cardId) {
    const updated = workspace.deleteDeckCard(deckId, cardId);
    refresh();
    return updated;
  }

  function saveProfile(profile) {
    const saved = workspace.saveProfile(profile);
    refresh();
    return saved;
  }

  function saveCommunity(community) {
    const saved = workspace.saveCommunity(community);
    refresh();
    return saved;
  }

  function saveJob(job) {
    workspace.saveAiJob(job);
    refresh();
  }

  function saveChat(exchange) {
    workspace.saveChatExchange(exchange);
    refresh();
  }

  function savePlan(plan) {
    workspace.saveLearningPlan(plan);
    refresh();
  }

  function saveState(nextState) {
    const saved = workspace.saveState(nextState);
    setState(saved);
    return saved;
  }

  function startDeck(deck, variantSession = false) {
    setStudyRequest({ deckId: deck.id, variantSession });
  }

  function updateAllDecks(updater) {
    workspace.updateAllDecks(updater);
    refresh();
  }

  function openGraph(deck) {
    setActiveView("graph");
    workspace.ensureDeckGraph(deck.id);
    refresh();
  }

  function shareDeck(deck) {
    setActiveView("community");
    workspace.shareDeckToDefaultCommunity(deck.id);
    refresh();
  }

  function createDemoDeck() {
    workspace.createDemoDeck();
    refresh();
  }

  function renderActiveView() {
    if (activeView === "kartenstapel") {
      return (
        <DecksScreen
          decks={state.decks}
          onSetDeckCoreMode={setDeckCoreMode}
          onSaveCard={saveDeckCard}
          onDeleteCard={deleteDeckCard}
          onStartDeck={startDeck}
          onCreateDeck={() => setActiveView("neue-karten")}
          onOpenGraph={openGraph}
          onShareDeck={shareDeck}
        />
      );
    }
    if (activeView === "neue-karten") {
      return <CreationScreen onCreated={saveDeck} onJob={saveJob} />;
    }
    if (activeView === "lernen") {
      return <LearnScreen decks={state.decks} onStartDeck={startDeck} onCreateDeck={() => setActiveView("neue-karten")} />;
    }
    if (activeView === "graph") {
      return <GraphScreen decks={state.decks} onUpdateDeck={updateDeck} />;
    }
    if (activeView === "community") {
      return <CommunityScreen decks={state.decks} communities={state.communities} onSaveCommunity={saveCommunity} onSaveDeck={saveDeck} />;
    }
    if (activeView === "ki") {
      return <AiJobsScreen decks={state.decks} jobs={state.aiJobs} />;
    }
    if (activeView === "assistent") {
      return <AssistantScreen decks={state.decks} transcript={state.chatTranscript} plans={state.learningPlans} onSaveChat={saveChat} onSavePlan={savePlan} />;
    }
    if (activeView === "einstellungen") {
      return <SettingsScreen appState={state} profile={state.profile} decks={state.decks} onSaveProfile={saveProfile} onUpdateAllDecks={updateAllDecks} onSaveState={saveState} />;
    }
    return <DashboardScreen state={state} onSaveProfile={saveProfile} onNavigate={setActiveView} onStartDeck={startDeck} />;
  }

  const studyDeck = studyRequest ? state.decks.find((deck) => deck.id === studyRequest.deckId) : null;
  if (studyRequest && studyDeck) {
    return (
      <StudyMode
        deck={studyDeck}
        variantSession={studyRequest.variantSession}
        onExit={() => {
          setStudyRequest(null);
          refresh();
        }}
        onDeckUpdated={saveDeck}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[96rem] overflow-hidden rounded-[22px] border border-[#dce2f4] bg-white/52 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl lg:grid-cols-[18rem_1fr]">
        <aside className="border-b border-[#dce2f4] bg-white/42 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col px-5 py-7 sm:px-8 lg:py-10">
            <div>
              <h1 className="text-5xl font-semibold tracking-normal text-[#17214f]">CoRe</h1>
              <p className="mt-2 text-base text-[#66709a]">Content Repetition</p>
            </div>

            <nav aria-label="Hauptmenue" className="mt-12 grid gap-3">
              {navigationItems.map((view) => {
                const NavIcon = getIcon(view.iconKey);
                const isActive = view.id === activeView;

                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-left text-base font-medium transition ${
                      isActive ? "bg-[#e9ecfb] text-[#24327a] shadow-sm" : "text-[#4f5a86] hover:bg-white/70 hover:text-[#17214f]"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <NavIcon size={21} aria-hidden="true" />
                    <span>{view.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 grid gap-2">
              {state.decks.length === 0 ? (
                <button type="button" onClick={createDemoDeck} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#eef1fb] px-3 text-sm font-semibold text-[#4f5eb1]">
                  <Database size={15} aria-hidden="true" />
                  Demo-Stapel
                </button>
              ) : null}
            </div>

            <div className="mt-auto border-t border-[#dce2f4] pt-6">
              <button type="button" onClick={() => setActiveView("einstellungen")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[#24327a] hover:bg-white/70">
                <span className="grid size-10 place-items-center rounded-full bg-[#dfe4fb] text-sm font-semibold">{(state.profile.displayName || "NC").slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{state.profile.displayName}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{renderActiveView()}</section>
      </div>
    </main>
  );
}
