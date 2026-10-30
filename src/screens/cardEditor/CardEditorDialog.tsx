import React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Copy, Pause, Snail, Star, Trash2, X } from "lucide-react";
import type { CardEditorTab } from "../../appNavigation.ts";
import type { CardDraftGuard, CardEditorServices, DecksScreenProps } from "../../appScreenProps.ts";
import type { Card, CardStudyStatePatch, Deck, NoteContent } from "../../coreTypes.ts";
import type { AccountMediaStore } from "../../mediaStore.ts";
import type { NoteGraph } from "../../workspaceReplica.ts";
import { CrossLinkButton, IconButton } from "../../ui/actionUi.tsx";
import { useSlidingSelection } from "../../ui/coreUi.tsx";
import { useSuccessToast } from "../../ui/feedbackUi.tsx";
import { FlagDot } from "../../ui/flagUi.tsx";
import { CoreTooltip } from "../../ui/tooltipUi.tsx";
import { CARD_EDITOR_TAB_LABELS, cardEditorTitle, cardHeaderLabel } from "./cardEditorModel.ts";
import { CardEditorContentTab, type PendingCard } from "./CardEditorContentTab.tsx";
import { CardEditorGeneralTab } from "./CardEditorGeneralTab.tsx";

// Variants and study data are needed only once their tab opens.
const CardEditorVariantsTab = React.lazy(() => import("./CardEditorVariantsTab.tsx").then((module) => ({ default: module.CardEditorVariantsTab })));
const CardEditorStudyTab = React.lazy(() => import("./CardEditorStudyTab.tsx").then((module) => ({ default: module.CardEditorStudyTab })));

const TABS = (Object.keys(CARD_EDITOR_TAB_LABELS) as CardEditorTab[]).map((value) => ({ value, label: CARD_EDITOR_TAB_LABELS[value] }));

/** Prev/next through the loaded hits of the table; absent without a hit list, e.g. from a session (W6). */
export interface CardEditorHitNavigation {
  position: number;
  total: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}

/**
 * Modal surface of the editor: the whole viewport on narrow screens, with a small margin on wide ones. The app
 * behind it is inert; a marked card tints header, tabs and background (`--core-marked-surface`).
 */
export function CardEditorSurface({ marked = false, labelledBy, label, surfaceRef, onKeyDown, children }: {
  marked?: boolean;
  labelledBy?: string;
  label?: string;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      root?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  const surface = (
    <div className="fixed inset-0 z-[60] bg-[var(--core-backdrop)] lg:p-4" data-testid="card-detail-backdrop">
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        data-testid="card-detail-dialog"
        data-marked={marked ? "true" : undefined}
        onKeyDown={onKeyDown}
        className={`flex size-full min-w-0 flex-col overflow-hidden outline-none lg:rounded-overlay lg:border lg:border-core-border lg:shadow-raised ${marked ? "bg-core-marked-soft" : "bg-core-canvas"}`}
        style={marked ? { "--core-text-muted": "var(--core-marked-text-muted)" } as React.CSSProperties : undefined}
      >
        {children}
      </div>
    </div>
  );
  return typeof document === "undefined" ? surface : createPortal(surface, document.body);
}

function StatusIcon({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <CoreTooltip label={label}>
      <span role="img" aria-label={label} className="grid size-5 place-items-center">{children}</span>
    </CoreTooltip>
  );
}

/** Star, flag, pause and leech of the opened card, each named (W14). */
function CardStatusIcons({ card, marked, flagNames }: { card: Card; marked: boolean; flagNames: readonly string[] }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid="card-status-icons">
      {marked ? <StatusIcon label="Markiert"><Star size={16} fill="currentColor" className="text-core-warning" aria-hidden="true" /></StatusIcon> : null}
      {card.ankiFlag ? <span className="grid size-5 place-items-center"><FlagDot flag={card.ankiFlag} names={flagNames} /></span> : null}
      {card.status === "suspended" ? <StatusIcon label="Ausgesetzt"><Pause size={16} className="text-core-text" aria-hidden="true" /></StatusIcon> : null}
      {card.study.leechedAt ? <StatusIcon label="Lernbremse"><Snail size={16} className="text-core-danger-text" aria-hidden="true" /></StatusIcon> : null}
    </span>
  );
}

function EditorTabs({ value, onChange, idPrefix }: { value: CardEditorTab; onChange: (tab: CardEditorTab) => void; idPrefix: string }) {
  const { containerRef, indicator } = useSlidingSelection<HTMLDivElement>(value, TABS);
  const select = (index: number) => {
    const next = TABS[(index + TABS.length) % TABS.length];
    onChange(next.value);
    window.requestAnimationFrame(() => containerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${idPrefix}-tab-${next.value}`)}`)?.focus());
  };
  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Bereiche der Karte"
      data-sliding={indicator ? "true" : undefined}
      className="core-segmented-control core-card-editor-tabs core-control-label"
      onKeyDown={(event) => {
        const index = TABS.findIndex((tab) => tab.value === value);
        const key = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
        if (key === undefined) return;
        event.preventDefault();
        select(key);
      }}
    >
      {indicator ? <span aria-hidden="true" className="core-segmented-control-indicator" style={{ transform: `translate(${indicator.x}px, ${indicator.y}px)`, width: indicator.width, height: indicator.height }} /> : null}
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.value}`}
          aria-selected={tab.value === value}
          aria-controls={`${idPrefix}-panel-${tab.value}`}
          tabIndex={tab.value === value ? 0 : -1}
          className="core-segmented-control-option"
          onClick={() => onChange(tab.value)}
        >
          <span className="truncate">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface CardEditorDialogProps {
  deck: Deck;
  decks: readonly Deck[];
  graph: NoteGraph;
  cardId: string;
  tab: CardEditorTab;
  onTabChange: (tab: CardEditorTab) => void;
  hits: CardEditorHitNavigation | null;
  now: string;
  dayStartHour?: number;
  timeZone?: string;
  mediaUrls: Record<string, string>;
  mediaStore: AccountMediaStore | null;
  syncConflict: boolean;
  services: CardEditorServices;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  onSaveNote: (graph: NoteGraph, content: NoteContent) => Promise<unknown>;
  onSetStudyState: (cardId: string, patch: CardStudyStatePatch) => Promise<NoteGraph | null>;
  onDuplicateNote: () => Promise<NoteGraph | null>;
  onDeleteNote: () => void;
  onRescheduleCards: DecksScreenProps["onRescheduleCards"];
  onGenerateVariant: (cardId: string) => Promise<unknown>;
  onUpdateVariant: DecksScreenProps["onUpdateVariant"];
  onSelectCard: (deckId: string, cardId: string) => void;
  onCardMoved: (deckId: string, cardId: string) => void;
  onOpenDeckSettings: (deckId: string) => void;
  deckName: (deckId: string) => string;
  onClose: () => void;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
}

/** Full-surface card editor with the tabs `Allgemein`, `Inhalt`, `Varianten` and `Lernen` (specs §5.3). */
export function CardEditorDialog(props: CardEditorDialogProps) {
  const { graph, cardId, tab, onTabChange, hits, services, onSetStudyState, onDraftStateChange } = props;
  const { note } = graph;
  const card = graph.cards.find((candidate) => candidate.id === cardId) ?? null;
  const idPrefix = React.useId().replace(/:/g, "");
  const titleId = `${idPrefix}-title`;
  const setSuccessToast = useSuccessToast();
  // The content tab stays mounted once opened, so its draft survives tab changes (W5).
  const [contentMounted, setContentMounted] = React.useState(tab === "content");
  const [pendingCards, setPendingCards] = React.useState<PendingCard[]>([]);
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [duplicateError, setDuplicateError] = React.useState("");
  const draftGuardRef = React.useRef<CardDraftGuard | null>(null);
  React.useEffect(() => { if (tab === "content") setContentMounted(true); }, [tab]);
  const handleDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    draftGuardRef.current = guard;
    onDraftStateChange(guard);
  }, [onDraftStateChange]);

  if (!card) return null;
  const siblings = graph.cards.filter((candidate) => candidate.deletedAt === null);

  function setFlag(flag: number) {
    void onSetStudyState(card!.id, { flag });
  }

  function setMarked(marked: boolean) {
    void onSetStudyState(card!.id, { marked });
  }

  async function duplicate() {
    setIsDuplicating(true);
    setDuplicateError("");
    try {
      if (await props.onDuplicateNote()) setSuccessToast("Kopie wurde erfolgreich direkt unter der Ausgangskarte erstellt.");
      else setDuplicateError("Die Karte konnte nicht kopiert werden.");
    } catch {
      setDuplicateError("Die Kopie ist lokal erstellt; die Cloud-Synchronisierung steht noch aus.");
    } finally {
      setIsDuplicating(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key === "Enter") {
      event.preventDefault();
      void draftGuardRef.current?.save();
    } else if (command && !event.altKey && !event.shiftKey && /^[1-7]$/.test(event.key)) {
      event.preventDefault();
      const flag = Number(event.key);
      setFlag(card!.ankiFlag === flag ? 0 : flag);
    } else if (command && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setMarked(!note.marked);
    } else if (event.altKey && !command && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const move = event.key === "ArrowUp" ? hits?.onPrevious : hits?.onNext;
      if (!move) return;
      event.preventDefault();
      move();
    }
  }

  const panel = (value: CardEditorTab, children: React.ReactNode) => (
    <div key={value} role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-tab-${value}`} hidden={tab !== value} className="min-h-0 min-w-0 flex-1">
      {children}
    </div>
  );
  const loading = <p className="p-6 core-body text-core-muted" role="status">Wird geladen …</p>;

  return (
    <CardEditorSurface marked={note.marked} labelledBy={titleId} surfaceRef={props.surfaceRef} onKeyDown={handleKeyDown}>
      <header className="grid shrink-0 gap-3 border-b border-core-border px-3 pb-3 pt-3 sm:px-6 sm:pt-4" data-testid="card-detail-editor">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 sm:gap-x-3">
          {hits ? (
            <div className="col-start-1 row-start-1 flex shrink-0 items-center gap-1" data-testid="card-hit-navigation">
              <CoreTooltip label="Vorige Karte · Alt+↑">
                <IconButton icon={ChevronUp} label="Vorige Karte" variant="ghost" disabled={!hits.onPrevious} onClick={() => hits.onPrevious?.()} />
              </CoreTooltip>
              <CoreTooltip label="Nächste Karte · Alt+↓">
                <IconButton icon={ChevronDown} label="Nächste Karte" variant="ghost" disabled={!hits.onNext} onClick={() => hits.onNext?.()} />
              </CoreTooltip>
              <span className="hidden min-w-12 whitespace-nowrap core-caption font-semibold tabular-nums text-core-muted sm:inline" aria-label={`Karte ${hits.position} von ${hits.total}`}>{hits.position} / {hits.total}</span>
            </div>
          ) : null}
          <div className="col-span-3 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:pt-1.5">
            <h2 id={titleId} tabIndex={-1} className="line-clamp-2 break-words core-heading-3 font-semibold text-core-text outline-none sm:line-clamp-1" data-card-editor-heading>{cardEditorTitle(note)}</h2>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 core-caption text-core-muted">
              <span className="min-w-0 truncate" data-testid="card-sibling-position">{cardHeaderLabel(note, card, siblings.length)}</span>
              <CardStatusIcons card={card} marked={note.marked} flagNames={services.flagNames} />
            </p>
          </div>
          <div className="col-start-3 row-start-1 flex shrink-0 items-center gap-1">
            <CoreTooltip label="Duplizieren">
              <IconButton icon={Copy} label="Duplizieren" variant="ghost" disabled={isDuplicating} onClick={() => void duplicate()} />
            </CoreTooltip>
            <CoreTooltip label="Löschen">
              <button type="button" aria-label="Löschen" className="core-action-ghost min-w-control p-2 text-core-danger-text" onClick={props.onDeleteNote}>
                <Trash2 size={20} aria-hidden="true" />
              </button>
            </CoreTooltip>
            <CoreTooltip label="Schließen · Esc">
              <IconButton icon={X} label="Detailansicht schließen" variant="ghost" onClick={props.onClose} />
            </CoreTooltip>
          </div>
        </div>
        {duplicateError ? <p className="core-status-error core-body" role="alert">{duplicateError}</p> : null}
        {props.syncConflict ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-core-warning bg-core-warning-soft px-3 py-2 core-body text-core-text" role="status">
            <span className="font-semibold">Synchronisierung klären</span>
            <CrossLinkButton onSelect={services.openSyncConflicts}>Konflikt öffnen</CrossLinkButton>
          </div>
        ) : null}
        <EditorTabs value={tab} onChange={onTabChange} idPrefix={idPrefix} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]" data-testid="card-editor-body">
        {panel("general", tab === "general" ? (
          <CardEditorGeneralTab
            decks={props.decks}
            graph={graph}
            card={card}
            now={props.now}
            dayStartHour={props.dayStartHour}
            timeZone={props.timeZone}
            services={services}
            pendingCards={pendingCards}
            onSetFlag={setFlag}
            onSetMarked={setMarked}
            onSetStudyState={onSetStudyState}
            onRescheduleCards={props.onRescheduleCards}
            onSelectCard={props.onSelectCard}
            onCardMoved={props.onCardMoved}
            deckName={props.deckName}
          />
        ) : null)}
        {panel("content", contentMounted ? (
          <CardEditorContentTab
            graph={graph}
            card={card}
            mediaUrls={props.mediaUrls}
            mediaStore={props.mediaStore}
            dayStartHour={props.dayStartHour}
            timeZone={props.timeZone}
            active={tab === "content"}
            services={services}
            onSaveNote={props.onSaveNote}
            onPendingCardsChange={setPendingCards}
            deckName={props.deckName}
            onDraftStateChange={handleDraftStateChange}
          />
        ) : null)}
        {panel("variants", tab === "variants" ? (
          <React.Suspense fallback={loading}>
            <CardEditorVariantsTab
              deck={props.deck}
              note={note}
              card={card}
              services={services}
              onGenerateVariant={props.onGenerateVariant}
              onUpdateVariant={props.onUpdateVariant}
              onOpenDeckSettings={() => props.onOpenDeckSettings(card.deckId)}
            />
          </React.Suspense>
        ) : null)}
        {panel("study", tab === "study" ? (
          <React.Suspense fallback={loading}>
            <CardEditorStudyTab card={card} now={props.now} dayStartHour={props.dayStartHour} timeZone={props.timeZone} services={services} />
          </React.Suspense>
        ) : null)}
      </div>
    </CardEditorSurface>
  );
}
