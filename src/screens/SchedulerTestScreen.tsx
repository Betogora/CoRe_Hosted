import React from "react";
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FlaskConical, Play, RotateCcw } from "lucide-react";
import type { Deck, ReviewRating, ReviewState } from "../coreTypes.ts";
import {
  advanceDailyReviewSession,
  answerVariant,
  createDailyReviewSessionState,
  getNextDailyReviewSessionItem,
  type DailyReviewSessionState,
} from "../reviewService.ts";
import {
  createSchedulerTestDeck,
  createSchedulerTestStart,
  formatSchedulerTestDate,
  getSchedulerTestDate,
  getSchedulerTestDayForDate,
  getSchedulerTestDayQueue,
  listSchedulerTestDays,
  normalizeSchedulerTestDay,
} from "../schedulerTestMode.ts";
import { CardHtml } from "../ui/cardMedia.tsx";
import { MiniProgress, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { ratingButtons } from "./screenConstants.ts";

interface TestLogEntry {
  id: string;
  question: string;
  day: number;
  rating: ReviewRating;
  nextDay: number;
  dueAt: string;
  state: ReviewState["state"];
  stability: number;
  difficulty: number;
}

const ratingLabels: Record<ReviewRating, string> = {
  again: "Nochmal",
  hard: "Schwer",
  good: "Gut",
  easy: "Leicht",
};

const stateLabels: Record<ReviewState["state"], string> = {
  new: "Neu",
  learning: "Lernschritt",
  review: "Langzeitwiederholung",
  relearning: "Wiederlernen",
};

function rounded(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 100) / 100) : "–";
}

export function SchedulerTestScreen() {
  const startAtRef = React.useRef(createSchedulerTestStart());
  const [selectedDay, setSelectedDay] = React.useState(1);
  const [deck, setDeck] = React.useState<Deck>(() => createSchedulerTestDeck(startAtRef.current));
  const [session, setSession] = React.useState<DailyReviewSessionState | null>(null);
  const [showAnswer, setShowAnswer] = React.useState(false);
  const [history, setHistory] = React.useState<TestLogEntry[]>([]);
  const [error, setError] = React.useState("");
  const simulatedNow = getSchedulerTestDate(startAtRef.current, selectedDay);
  const dayQueue = React.useMemo(
    () => getSchedulerTestDayQueue(deck, startAtRef.current, selectedDay),
    [deck, selectedDay],
  );
  const current = React.useMemo(
    () => session ? getNextDailyReviewSessionItem(deck, session, { now: simulatedNow, language: "de" }) : null,
    [deck, session, simulatedNow],
  );
  const completedCards = session?.completedInitialKeys.length ?? 0;
  const sessionTotal = session?.initialKeys.length ?? 0;
  const repeatCount = session?.repeatCount ?? 0;
  const sessionFinished = Boolean(session && !current);

  function selectDay(day: unknown) {
    setSelectedDay(normalizeSchedulerTestDay(day));
    setSession(null);
    setShowAnswer(false);
    setError("");
  }

  function startSession() {
    setSession(createDailyReviewSessionState(dayQueue.items));
    setShowAnswer(false);
    setError("");
  }

  function resetSimulation() {
    setDeck(createSchedulerTestDeck(startAtRef.current));
    setSelectedDay(1);
    setSession(null);
    setShowAnswer(false);
    setHistory([]);
    setError("");
  }

  function grade(rating: ReviewRating) {
    if (!current || !session) return;
    try {
      const result = answerVariant(deck, current.learningItemId, current.cardVariantId, rating, { now: simulatedNow });
      const reviewedKey = current.sessionInfo?.key ?? `${current.deckId}:${current.learningItemId}`;
      const nextState = result.updatedCard.reviewState;
      setDeck(result.deck);
      setSession(advanceDailyReviewSession(session, { key: reviewedKey, rating, nextReviewState: nextState }));
      setHistory((entries) => [{
        id: result.event.id,
        question: current.front.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        day: selectedDay,
        rating,
        nextDay: getSchedulerTestDayForDate(startAtRef.current, nextState.dueAt),
        dueAt: nextState.dueAt,
        state: nextState.state,
        stability: nextState.stability,
        difficulty: nextState.difficulty,
      }, ...entries]);
      setShowAnswer(false);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Testbewertung konnte nicht angewendet werden.");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <PageHeader eyebrow="Werkzeug · nur lokal" title="FSRS-Testmodus" />
        <button type="button" onClick={resetSimulation} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)]">
          <RotateCcw size={17} aria-hidden="true" />
          Simulation zurücksetzen
        </button>
      </div>

      <StatusMessage tone="info">
        Dieser Teststapel ist vollständig vom Account getrennt. Bewertungen verändern weder deine echten Karten noch Statistiken oder Cloud-Daten.
      </StatusMessage>

      <SoftPanel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-[var(--core-info-surface)] text-[var(--core-action-primary)]">
              <CalendarClock size={21} aria-hidden="true" />
            </span>
            <div>
              <p className="core-heading-3 font-semibold text-[var(--core-text)]">Tag {selectedDay}</p>
              <p className="core-body text-[var(--core-text-muted)]">{formatSchedulerTestDate(simulatedNow)} · simuliert um 10:00 Uhr</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => selectDay(selectedDay - 1)} disabled={selectedDay === 1} className="core-action-secondary grid size-11 place-items-center rounded-full p-0 disabled:opacity-40" aria-label="Vorheriger simulierter Tag">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => selectDay(selectedDay + 1)} className="core-action-secondary grid size-11 place-items-center rounded-full p-0" aria-label="Nächster simulierter Tag">
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Simulierten Tag auswählen">
          {listSchedulerTestDays(selectedDay).map((day) => (
            <button key={day} type="button" onClick={() => selectDay(day)} aria-pressed={day === selectedDay} className={`min-h-10 shrink-0 rounded-xl px-4 core-body font-semibold ${day === selectedDay ? "bg-[var(--core-action-primary)] text-[var(--core-text-on-accent)]" : "border border-[var(--core-border)] bg-core-surface text-[var(--core-text-secondary)]"}`}>
              Tag {day}
            </button>
          ))}
        </div>
      </SoftPanel>

      {!session ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <SoftPanel className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="core-control-label uppercase tracking-wide text-[var(--core-action-secondary)]">FSRS-Teststapel</p>
                <h3 className="mt-2 core-heading-2 font-semibold text-[var(--core-text)]">{dayQueue.total} {dayQueue.total === 1 ? "Karte" : "Karten"} an Tag {selectedDay}</h3>
                <p className="mt-2 core-body text-[var(--core-text-muted)]">Enthalten sind neue, fällige und gegebenenfalls überfällige Karten bis zu diesem simulierten Tag.</p>
              </div>
              <button type="button" onClick={startSession} disabled={dayQueue.total === 0} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)] disabled:cursor-not-allowed disabled:bg-[var(--core-action-disabled-bg)] disabled:text-[var(--core-action-disabled-text)]">
                <Play size={18} aria-hidden="true" />
                Diesen Tag lernen
              </button>
            </div>
            {dayQueue.total > 0 ? (
              <ul className="mt-6 divide-y divide-[var(--core-border)] border-t border-[var(--core-border)]">
                {dayQueue.items.map((item: any) => (
                  <li key={`${item.deckId}:${item.learningItemId}`} className="flex items-center justify-between gap-4 py-4">
                    <span className="min-w-0 truncate core-body font-semibold text-[var(--core-text)]">{item.front.replace(/<[^>]+>/g, " ")}</span>
                    <span className="shrink-0 rounded-full bg-[var(--core-surface-muted)] px-3 py-1 core-caption font-semibold text-[var(--core-text-muted)]">{stateLabels[item.reviewState.state as ReviewState["state"]]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-[var(--core-border)] p-6 text-center">
                <p className="core-heading-3 font-semibold text-[var(--core-text)]">Keine Karten fällig</p>
                <p className="mt-2 core-body text-[var(--core-text-muted)]">FSRS plant an diesem Tag keine Wiederholung. Gehe zum nächsten Tag weiter.</p>
              </div>
            )}
          </SoftPanel>
          <SoftPanel className="p-6">
            <FlaskConical className="text-[var(--core-action-primary)]" size={28} aria-hidden="true" />
            <p className="mt-4 core-heading-3 font-semibold text-[var(--core-text)]">So testest du</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 core-body text-[var(--core-text-muted)]">
              <li>Lerne alle Karten von Tag 1.</li>
              <li>Wechsle oben zu Tag 2, 3, 4 und weiter.</li>
              <li>Beobachte, wann FSRS Karten wieder einplant.</li>
            </ol>
          </SoftPanel>
        </div>
      ) : sessionFinished ? (
        <SoftPanel className="p-8 text-center">
          <CheckCircle2 className="mx-auto text-[var(--core-success)]" size={46} aria-hidden="true" />
          <h3 className="mt-4 core-heading-2 font-semibold text-[var(--core-text)]">Tag {selectedDay} abgeschlossen</h3>
          <p className="mt-2 core-body text-[var(--core-text-muted)]">{completedCards} {completedCards === 1 ? "Karte" : "Karten"} und {repeatCount} {repeatCount === 1 ? "zusätzliche Wiederholung" : "zusätzliche Wiederholungen"} beantwortet.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => selectDay(selectedDay + 1)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)]">
              Weiter zu Tag {selectedDay + 1}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setSession(null)} className="inline-flex min-h-12 items-center rounded-xl border border-[var(--core-border)] px-5 core-body font-semibold text-[var(--core-action-primary)]">Tagesübersicht</button>
          </div>
        </SoftPanel>
      ) : current ? (
        <SoftPanel className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="core-body font-semibold text-[var(--core-action-secondary)]">
              {current.sessionInfo?.isRepeat ? (current.sessionInfo.isEarlyRepeat ? "Vorgezogene Wiederholung" : "Wiederholung") : `Karte ${Math.min(completedCards + 1, sessionTotal)} von ${sessionTotal}`}
            </p>
            <p className="core-caption font-semibold text-[var(--core-text-muted)]">Zusätzliche Wiederholungen: {repeatCount}</p>
          </div>
          <MiniProgress value={sessionTotal ? (completedCards / sessionTotal) * 100 : 0} />
          <div className="mx-auto mt-8 max-w-3xl text-center">
            <p className="core-control-label uppercase tracking-wide text-[var(--core-text-muted)]">Frage</p>
            <div className="mt-4 core-heading-2 font-semibold text-[var(--core-text)]"><CardHtml html={current.front} mediaUrls={{}} /></div>
            {showAnswer ? (
              <>
                <div className="my-7 h-px bg-[var(--core-border)]" />
                <p className="core-control-label uppercase tracking-wide text-[var(--core-text-muted)]">Antwort</p>
                <div className="mt-4 core-heading-3 font-semibold text-[var(--core-text)]"><CardHtml html={current.back} mediaUrls={{}} /></div>
              </>
            ) : (
              <button type="button" onClick={() => setShowAnswer(true)} className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)]">Antwort anzeigen</button>
            )}
          </div>
          {error ? <div className="mt-6"><StatusMessage tone="error" announce="assertive">{error}</StatusMessage></div> : null}
          {showAnswer ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              {ratingButtons.map((button) => {
                const rating = button.key as ReviewRating;
                const preview = current.ratingButtonOptions?.[rating];
                return (
                  <button key={rating} type="button" onClick={() => grade(rating)} aria-label={`Bewertung ${button.label}: ${preview?.intervalLabel ?? ""}`} className={`min-h-20 rounded-2xl border px-3 text-center ${button.className}`}>
                    <span className="block core-heading-3 font-semibold">{button.number} · {button.label}</span>
                    <span className="mt-1 block core-caption font-semibold">{preview?.intervalLabel ?? ""}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </SoftPanel>
      ) : null}

      {history.length > 0 ? (
        <SoftPanel className="p-6">
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Simulationsverlauf</h3>
          <p className="mt-2 core-body text-[var(--core-text-muted)]">Hier siehst du, welchen nächsten Tag und Gedächtniszustand FSRS nach jedem Klick berechnet hat.</p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left core-body">
              <thead className="text-[var(--core-text-muted)]">
                <tr className="border-b border-[var(--core-border)]">
                  <th className="px-3 py-3 font-semibold">Bewertet</th>
                  <th className="px-3 py-3 font-semibold">Karte</th>
                  <th className="px-3 py-3 font-semibold">Bewertung</th>
                  <th className="px-3 py-3 font-semibold">Nächster Termin</th>
                  <th className="px-3 py-3 font-semibold">Zustand</th>
                  <th className="px-3 py-3 font-semibold">S / D</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 12).map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--core-border)] last:border-0">
                    <td className="px-3 py-3">Tag {entry.day}</td>
                    <td className="max-w-xs truncate px-3 py-3 font-semibold">{entry.question}</td>
                    <td className="px-3 py-3">{ratingLabels[entry.rating]}</td>
                    <td className="px-3 py-3">Tag {entry.nextDay}<span className="block core-caption text-[var(--core-text-muted)]">{formatSchedulerTestDate(entry.dueAt)}</span></td>
                    <td className="px-3 py-3">{stateLabels[entry.state]}</td>
                    <td className="px-3 py-3">{rounded(entry.stability)} / {rounded(entry.difficulty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SoftPanel>
      ) : null}
    </div>
  );
}
