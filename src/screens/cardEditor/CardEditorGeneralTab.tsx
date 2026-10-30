import React from "react";
import { CalendarClock, CalendarDays, Check, Copy, Layers, MoveRight, Pause, Snail, Star } from "lucide-react";
import type { CardEditorServices, DecksScreenProps } from "../../appScreenProps.ts";
import type { SimilarNote } from "../../cloudRepositoryValidation.ts";
import { notePromptLabel } from "../../coreModel.ts";
import type { Card, CardStudyStatePatch, Deck } from "../../coreTypes.ts";
import { addLearningDays, getLearningDayKey, getLearningDayRange, getLearningDayStartForKey } from "../../learningDay.ts";
import { manuallyBuriedCardIds } from "../../siblingBurying.ts";
import type { TagDirectoryEntry } from "../../tagDirectory.ts";
import type { NoteGraph } from "../../workspaceReplica.ts";
import { ActionButton } from "../../ui/actionUi.tsx";
import { ActionDialog, CardMarkButton } from "../../ui/coreUi.tsx";
import { CoreDatePicker } from "../../ui/CoreDatePicker.tsx";
import { useSuccessToast } from "../../ui/feedbackUi.tsx";
import { FlagPicker } from "../../ui/flagUi.tsx";
import { DeckSelect } from "../../ui/selectUi.tsx";
import { TagInput } from "../../ui/TagInput.tsx";
import { CoreTooltip } from "../../ui/tooltipUi.tsx";
import { useOnline } from "./useOnline.ts";
import { cardStateLabel } from "./cardEditorModel.ts";
import type { PendingCard } from "./CardEditorContentTab.tsx";

const QUICK_DATES = [
  { days: 1, label: "Morgen" },
  { days: 3, label: "In 3 Tagen" },
  { days: 7, label: "In 1 Woche" },
  { days: 30, label: "In 1 Monat" },
] as const;

const formatDayKey = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const formatInstant = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  const id = React.useId();
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-panel border border-core-border bg-core-surface p-4" aria-labelledby={id} data-testid={testId}>
      <h3 id={id} className="core-body font-semibold text-core-text">{title}</h3>
      {children}
    </section>
  );
}

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="w-28 shrink-0 core-caption text-core-muted">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-mono core-caption text-core-text">{value}</dd>
      <CoreTooltip label={copied ? "Kopiert" : "Kopieren"}>
        <button type="button" aria-label={`${label} kopieren`} className="core-action-ghost min-w-control p-2" onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </button>
      </CoreTooltip>
    </div>
  );
}

/** Loads after the browser is idle, so the editor opens first (B3). */
function useIdleLoad<T>(load: ((signal: AbortSignal) => Promise<T>) | null, key: string): T | null {
  const [value, setValue] = React.useState<T | null>(null);
  React.useEffect(() => {
    setValue(null);
    if (!load) return undefined;
    const controller = new AbortController();
    const run = () => void load(controller.signal).then((result) => { if (!controller.signal.aborted) setValue(result); }).catch(() => undefined);
    const idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 200);
    return () => {
      controller.abort();
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
    // The loader is recreated on every render; the key decides when to load again.
  }, [key]);
  return value;
}

export interface CardEditorGeneralTabProps {
  decks: readonly Deck[];
  graph: NoteGraph;
  card: Card;
  now: string;
  dayStartHour?: number;
  timeZone?: string;
  services: CardEditorServices;
  pendingCards: readonly PendingCard[];
  onSetFlag: (flag: number) => void;
  onSetMarked: (marked: boolean) => void;
  onSetStudyState: (cardId: string, patch: CardStudyStatePatch) => Promise<NoteGraph | null>;
  onRescheduleCards: DecksScreenProps["onRescheduleCards"];
  onSelectCard: (deckId: string, cardId: string) => void;
  onCardMoved: (deckId: string, cardId: string) => void;
  deckName: (deckId: string) => string;
}

/**
 * `Allgemein` works at once and never takes over unsaved content changes. Actions whose result leaves the view or
 * overwrites something offer `Rückgängig` (W7, W20); flag, mark, suspension and added tags undo at their control.
 */
export function CardEditorGeneralTab({ decks, graph, card, now, dayStartHour, timeZone, services, pendingCards, onSetFlag, onSetMarked, onSetStudyState, onRescheduleCards, onSelectCard, onCardMoved, deckName }: CardEditorGeneralTabProps) {
  const { note } = graph;
  const online = useOnline();
  const setSuccessToast = useSuccessToast();
  const dayOptions = React.useMemo(() => ({ dayStartHour, timeZone }), [dayStartHour, timeZone]);
  const dueDateKey = card.study.dueAt ? getLearningDayKey(card.study.dueAt, dayOptions) ?? "" : "";
  const todayKey = getLearningDayKey(now, dayOptions) ?? "";
  const minimumKey = getLearningDayKey(addLearningDays(now, 1, dayOptions) ?? "", dayOptions) ?? "";
  const [date, setDate] = React.useState(dueDateKey);
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [moveTarget, setMoveTarget] = React.useState(card.deckId);
  const [eventsVersion, setEventsVersion] = React.useState(0);
  const [directory, setDirectory] = React.useState<TagDirectoryEntry[]>([]);
  React.useEffect(() => setDate(dueDateKey), [card.id, dueDateKey]);
  React.useEffect(() => { setError(""); setMoveOpen(false); }, [card.id]);

  const events = useIdleLoad(() => services.listReviewEvents(card.id), `${card.id}:${eventsVersion}`);
  const buried = React.useMemo(() => {
    const range = getLearningDayRange(now, dayOptions);
    if (!events || !range) return false;
    const today = events.filter((event) => Date.parse(event.answeredAt) >= range.start && Date.parse(event.answeredAt) < range.end);
    return manuallyBuriedCardIds(today).has(card.id);
  }, [card.id, dayOptions, events, now]);
  const similar = useIdleLoad<SimilarNote[]>(online && services.cloud ? (signal) => services.cloud!.listSimilarNotes(note.id, signal) : null, `${note.id}:${online}`);
  const exams = useIdleLoad(() => services.listExamsForDeck(card.deckId), card.deckId);
  React.useEffect(() => {
    let active = true;
    void services.listTagDirectory().then((entries) => { if (active) setDirectory(entries); }).catch(() => undefined);
    return () => { active = false; };
  }, [online, services]);

  /** Undo is a new, synced change and drops out with a note if the card changed meanwhile (W7). */
  function offerUndo(message: string, unchanged: (current: { card: Card; note: NoteGraph["note"] }) => boolean, undo: () => Promise<unknown>) {
    setSuccessToast(message, {
      action: {
        label: "Rückgängig",
        onAction: () => void (async () => {
          const current = await services.loadCard(card.id);
          if (!current || !unchanged(current)) {
            setSuccessToast("Rückgängig ist nicht mehr möglich: Die Karte wurde inzwischen geändert.", { appearance: "neutral" });
            return;
          }
          await undo();
          setEventsVersion((version) => version + 1);
        })().catch(() => setSuccessToast("Rückgängig ist fehlgeschlagen.", { appearance: "neutral" })),
      },
    });
  }

  async function run<T>(key: string, action: () => Promise<T>, failure: string): Promise<T | null> {
    setBusy(key);
    setError("");
    try {
      return await action();
    } catch {
      setError(failure);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function reschedule() {
    const dueAt = getLearningDayStartForKey(date, dayOptions);
    if (!dueAt || date < minimumKey || date === dueDateKey) return;
    const previous = card.study;
    const updated = await run("reschedule", () => onRescheduleCards([card.id], dueAt.toISOString(), new Date(now).toISOString()), "Die nächste Fälligkeit konnte nicht neu geplant werden.");
    const next = updated?.[0];
    if (!next) return;
    offerUndo(`Nächste Fälligkeit auf ${formatDayKey(date)} gelegt.`, (current) => current.card.studyRevision === next.studyRevision,
      () => services.restoreCardStudies(new Map([[card.id, previous]])));
  }

  async function bury(buriedNext: boolean) {
    const updated = await run("bury", () => services.buryCards([card.id], buriedNext), "Die Karte konnte nicht zurückgestellt werden.");
    const next = updated?.[0];
    if (!next) return;
    setEventsVersion((version) => version + 1);
    if (buriedNext) {
      offerUndo("Karte bis zum nächsten Lerntag zurückgestellt.", (current) => current.card.studyRevision === next.studyRevision,
        () => services.buryCards([card.id], false));
    }
  }

  async function resetLeech() {
    const previous = card.study.leechedAt;
    const updated = await run("leech", () => services.setCardsLeech([card.id], null), "Die Lernbremse konnte nicht zurückgesetzt werden.");
    const next = updated?.[0];
    if (!next) return;
    offerUndo("Lernbremse zurückgesetzt.", (current) => current.card.studyRevision === next.studyRevision,
      () => services.setCardsLeech([card.id], previous));
  }

  async function move() {
    const from = card.deckId;
    const target = moveTarget;
    setMoveOpen(false);
    if (target === from) return;
    const moved = await run("move", () => services.moveCard(card.id, target), "Die Karte konnte nicht verschoben werden.");
    const next = moved?.cards.find((candidate) => candidate.id === card.id);
    if (!next) return;
    onCardMoved(target, card.id);
    offerUndo(`Karte nach „${deckName(target)}“ verschoben.`, (current) => current.card.revision === next.revision, async () => {
      await services.moveCard(card.id, from);
      onCardMoved(from, card.id);
    });
  }

  async function changeTags(tags: string[], change: { added: string[]; removed: string[] }) {
    const previous = note.content.tags;
    const saved = await run("tags", () => onSetStudyState(card.id, { tags }), "Die Tags konnten nicht gespeichert werden.");
    if (!saved || !change.removed.length || change.added.length) return;
    const label = change.removed.length === 1 ? `Tag „${change.removed[0]}“ entfernt.` : `${change.removed.length} Tags entfernt.`;
    offerUndo(label, (current) => current.note.revision === saved.note.revision, () => onSetStudyState(card.id, { tags: previous }));
  }

  const suspended = card.status === "suspended";
  const siblings = graph.cards.filter((candidate) => candidate.deletedAt === null);
  const canReschedule = Boolean(date && minimumKey && date >= minimumKey && date !== dueDateKey);
  const planState = suspended ? "Ausgesetzt" : buried ? "Zurückgestellt bis zum nächsten Lerntag" : card.study.reps === 0 && card.study.state === "new" ? "Neu" : dueDateKey ? `Fällig am ${formatDayKey(dueDateKey)}` : "Neu";
  const moveTargets = React.useMemo(() => decks.filter((candidate) => !candidate.deletedAt).map((candidate) => candidate.id), [decks]);

  return (
    <div className="grid min-w-0 gap-4 p-4 sm:p-6 md:grid-cols-2 md:items-start" data-testid="card-general-tab">
      <div className="grid min-w-0 gap-4">
        <Section title="Flagge" testId="card-flag">
          <FlagPicker value={card.ankiFlag} names={services.flagNames} onValueChange={onSetFlag} onEditNames={services.openFlagNames} />
          <div className="flex min-h-control items-center justify-between gap-3 border-t border-core-border pt-2">
            <span className="flex items-center gap-2 core-body font-semibold text-core-secondary"><Star size={18} aria-hidden="true" />Markiert</span>
            <CoreTooltip label="Markieren · Strg+K">
              <CardMarkButton marked={note.marked} onMarkedChange={onSetMarked} />
            </CoreTooltip>
          </div>
        </Section>
        <Section title="Planung" testId="card-planning">
          <p className="core-body font-semibold text-core-text" data-testid="card-plan-state">{planState}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Schnellwahl">
            {QUICK_DATES.map((entry) => {
              const key = getLearningDayKey(addLearningDays(now, entry.days, dayOptions) ?? "", dayOptions) ?? "";
              return (
                <button key={entry.days} type="button" aria-pressed={date === key} className="core-action-secondary aria-pressed:border-core-action aria-pressed:text-core-action" onClick={() => setDate(key)}>{entry.label}</button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="core-field-group min-w-0 flex-1 basis-48">
              <span className="core-field-label inline-flex items-center gap-2 font-semibold"><CalendarDays size={17} aria-hidden="true" />Nächste Fälligkeit</span>
              <CoreDatePicker id={`card-due-date-${card.id}`} ariaLabel="Nächste Fälligkeit" value={date} min={minimumKey} today={todayKey} onValueChange={(value) => { setDate(value); setError(""); }} />
            </label>
            {canReschedule ? <ActionButton variant="primary" loading={busy === "reschedule"} onClick={() => void reschedule()}>Neu planen</ActionButton> : null}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-core-border pt-3">
            <button type="button" aria-pressed={suspended} className="core-action-secondary aria-pressed:border-core-action aria-pressed:bg-[var(--core-action-soft)] aria-pressed:text-core-action" onClick={() => void onSetStudyState(card.id, { suspended: !suspended })}>
              <Pause size={16} aria-hidden="true" />Aussetzen
            </button>
            {buried ? (
              <ActionButton variant="secondary" icon={CalendarClock} loading={busy === "bury"} onClick={() => void bury(false)}>Zurückstellen aufheben</ActionButton>
            ) : (
              <ActionButton variant="secondary" icon={CalendarClock} loading={busy === "bury"} disabled={suspended} onClick={() => void bury(true)}>Zurückstellen</ActionButton>
            )}
          </div>
          {card.study.leechedAt ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-core-danger-soft px-3 py-2" data-testid="card-leech">
              <span className="flex items-center gap-2 core-body font-semibold text-core-text"><Snail size={18} className="text-core-danger-text" aria-hidden="true" />Lernbremse seit {formatInstant(card.study.leechedAt)}</span>
              <ActionButton variant="secondary" loading={busy === "leech"} onClick={() => void resetLeech()}>Zurücksetzen</ActionButton>
            </div>
          ) : null}
        </Section>
        <Section title="Stapel" testId="card-deck">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 core-body font-semibold text-core-text"><Layers size={18} className="shrink-0" aria-hidden="true" /><span className="truncate">{deckName(card.deckId)}</span></span>
            <ActionButton variant="secondary" icon={MoveRight} loading={busy === "move"} onClick={() => { setMoveTarget(card.deckId); setMoveOpen(true); }}>Verschieben</ActionButton>
          </div>
        </Section>
        {error ? <p className="core-status-error core-body" role="alert">{error}</p> : null}
      </div>
      <div className="grid min-w-0 gap-4">
        <Section title="Tags" testId="card-tags">
          <TagInput tags={note.content.tags} importedTags={note.importedTags ?? []} directory={directory} label="Tags bearbeiten" labelHidden onChange={(tags, change) => void changeTags(tags, change)} disabled={busy === "tags"} />
        </Section>
        {siblings.length > 1 || pendingCards.length ? (
          <Section title="Karten aus diesem Inhalt" testId="card-siblings">
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {siblings.map((sibling) => {
                const content = (
                  <>
                    <span className="font-semibold text-core-text">{notePromptLabel(note.content, sibling.promptKey)}</span>
                    <span className="min-w-0 truncate text-core-muted">{deckName(sibling.deckId)} · {cardStateLabel(sibling, note, dayOptions)}</span>
                  </>
                );
                return (
                  <li key={sibling.id}>
                    {sibling.id === card.id ? (
                      <p className="flex min-h-control min-w-0 flex-wrap items-center gap-x-2 rounded-inset bg-core-subtle px-3 core-body" aria-current="true">{content}</p>
                    ) : (
                      <button type="button" onClick={() => onSelectCard(sibling.deckId, sibling.id)} className="flex min-h-control w-full min-w-0 flex-wrap items-center gap-x-2 rounded-inset px-3 text-left core-body transition-colors hover:bg-core-subtle">{content}</button>
                    )}
                  </li>
                );
              })}
              {pendingCards.map((pending) => (
                <li key={pending.promptKey} className="flex min-h-control min-w-0 flex-wrap items-center gap-x-2 rounded-inset border border-dashed border-core-border px-3 core-body" data-testid="card-sibling-pending">
                  <span className="font-semibold text-core-text">{pending.label}</span>
                  <span className="text-core-muted">Neu beim Speichern</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {online && services.cloud && similar?.length ? (
          <Section title="Ähnliche Inhalte" testId="card-similar">
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {similar.map((entry) => (
                <li key={entry.noteId}>
                  <button type="button" onClick={() => onSelectCard(entry.deckId, entry.cardId)} className="flex min-h-control w-full min-w-0 items-center gap-2 rounded-inset px-3 text-left core-body transition-colors hover:bg-core-subtle">
                    <span className="min-w-0 flex-1 truncate text-core-text">{entry.preview || "Ohne Text"}</span>
                    <span className="shrink-0 core-caption text-core-muted">{deckName(entry.deckId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <Section title="Details" testId="card-details">
          <dl className="grid gap-1.5">
            <div className="flex min-w-0 gap-2"><dt className="w-28 shrink-0 core-caption text-core-muted">Quelle</dt><dd className="min-w-0 core-body text-core-text">{note.source === "anki-apkg" ? "Anki-Import" : "Eigener Inhalt"}</dd></div>
            <div className="flex min-w-0 gap-2"><dt className="w-28 shrink-0 core-caption text-core-muted">Prüfung</dt><dd className="min-w-0 core-body text-core-text">{exams === null ? "…" : exams.length ? exams.join(", ") : "Keine"}</dd></div>
            <div className="flex min-w-0 gap-2"><dt className="w-28 shrink-0 core-caption text-core-muted">Erstellt</dt><dd className="min-w-0 core-body text-core-text">{formatInstant(card.createdAt)}</dd></div>
            <CopyableId label="Karten-ID" value={card.id} />
            <CopyableId label="Inhalts-ID" value={note.id} />
            {card.ankiCardId ? <CopyableId label="Anki-Karten-ID" value={card.ankiCardId} /> : null}
            {note.ankiGuid ? <CopyableId label="Anki-GUID" value={note.ankiGuid} /> : null}
          </dl>
        </Section>
      </div>
      <ActionDialog
        open={moveOpen}
        title="Karte verschieben"
        description={<DeckSelect ariaLabel="Zielstapel" className="w-full" value={moveTarget} decks={decks} selectableDeckIds={moveTargets} onValueChange={setMoveTarget} />}
        confirmLabel="Verschieben"
        cancelLabel="Abbrechen"
        actionIcons={{ confirm: MoveRight }}
        onCancel={() => setMoveOpen(false)}
        onConfirm={() => void move()}
      />
    </div>
  );
}
