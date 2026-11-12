import React from "react";
import { ChevronDown, ChevronUp, Copy, Pause, Snail, Star, Trash2 } from "lucide-react";
import type { CardEditorTab } from "../../appNavigation.ts";
import type { CardDraftGuard, CardEditorServices, DecksScreenProps } from "../../appScreenProps.ts";
import type { Card, CardStudyStatePatch, Deck, NoteContent } from "../../coreTypes.ts";
import type { AccountMediaStore } from "../../mediaStore.ts";
import type { NoteGraph } from "../../workspaceReplica.ts";
import { CrossLinkButton, IconButton } from "../../ui/actionUi.tsx";
import { CoreTabPanel, CoreTabs } from "../../ui/CoreTabs.tsx";
import { DialogFrame } from "../../ui/DialogFrame.tsx";
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

/** Class of the editor's `DialogFrame`: fixed height from 1024 px, full screen below; a marked card tints it. */
export const cardEditorFrameClass = (marked = false) => marked ? "core-card-editor-frame is-marked" : "core-card-editor-frame";

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

/** Card editor dialog with the tabs `Allgemein`, `Inhalt`, `Varianten` and `Lernen` (specs.md#karteneditor). */
export function CardEditorDialog(props: CardEditorDialogProps) {
  const { graph, cardId, tab, onTabChange, hits, services, onSetStudyState, onDraftStateChange } = props;
  const { note } = graph;
  const card = graph.cards.find((candidate) => candidate.id === cardId) ?? null;
  const panelId = `${React.useId().replace(/:/g, "")}-panel`;
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
    <div key={value} hidden={tab !== value} className={tab === value ? "flex min-w-0 flex-1 flex-col" : undefined}>
      {children}
    </div>
  );
  const loading = <p className="p-6 core-body text-core-muted" role="status">Wird geladen …</p>;

  return (
    <DialogFrame
      open
      size="l"
      testId="card-detail-dialog"
      className={cardEditorFrameClass(note.marked)}
      title={<span tabIndex={-1} className="outline-none" data-card-editor-heading>{cardEditorTitle(note)}</span>}
      subtitle={<>
        <span className="min-w-0 truncate" data-testid="card-sibling-position">{cardHeaderLabel(note, card, siblings.length)}</span>
        <CardStatusIcons card={card} marked={note.marked} flagNames={services.flagNames} />
      </>}
      leading={hits ? (
        <div className="core-card-editor-paging" data-testid="card-hit-navigation">
          <CoreTooltip label="Vorige Karte · Alt+↑">
            <IconButton icon={ChevronUp} label="Vorige Karte" variant="ghost" disabled={!hits.onPrevious} onClick={() => hits.onPrevious?.()} />
          </CoreTooltip>
          <CoreTooltip label="Nächste Karte · Alt+↓">
            <IconButton icon={ChevronDown} label="Nächste Karte" variant="ghost" disabled={!hits.onNext} onClick={() => hits.onNext?.()} />
          </CoreTooltip>
          <span className="core-card-editor-position" aria-label={`Karte ${hits.position} von ${hits.total}`}>{hits.position} / {hits.total}</span>
        </div>
      ) : null}
      actions={
        <div className="core-card-editor-actions">
          <CoreTooltip label="Duplizieren">
            <IconButton icon={Copy} label="Duplizieren" variant="ghost" disabled={isDuplicating} onClick={() => void duplicate()} />
          </CoreTooltip>
          <CoreTooltip label="Löschen">
            <IconButton icon={Trash2} variant="destructive-quiet" label="Löschen" onClick={props.onDeleteNote} />
          </CoreTooltip>
        </div>
      }
      closeLabel="Detailansicht schließen"
      onClose={props.onClose}
      onKeyDown={handleKeyDown}
      tabs={<>
        {duplicateError ? <p className="core-status-error core-body pb-3" role="alert">{duplicateError}</p> : null}
        {props.syncConflict ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-control border border-core-warning bg-core-warning-soft px-3 py-2 core-body text-core-text" role="status">
            <span className="font-semibold">Synchronisierung klären</span>
            <CrossLinkButton onSelect={services.openSyncConflicts}>Konflikt öffnen</CrossLinkButton>
          </div>
        ) : null}
        <CoreTabs ariaLabel="Bereiche der Karte" tabs={TABS} value={tab} onValueChange={onTabChange} panelId={panelId} />
      </>}
    >
      <CoreTabPanel panelId={panelId} value={tab} className="core-card-editor-panel">
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
      </CoreTabPanel>
    </DialogFrame>
  );
}
