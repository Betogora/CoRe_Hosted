import React from "react";
import { Play } from "lucide-react";
import type { DashboardScreenProps, ExamPlanningScreenProps } from "../appScreenProps.ts";
import { examDayDistance, getExamTopicTasks } from "../examPlanning.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { getGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { ExamPace } from "./ExamPace.tsx";
import { formatExamMinutes } from "./examPlanningUi.ts";
import { useExamForecast } from "./useExamForecast.ts";

interface ExamDashboardWidgetProps {
  state: DashboardScreenProps["state"]; now: string;
  onLoad: ExamPlanningScreenProps["onLoadPlanningData"];
  onStart: (blockId: string | null) => Promise<void>;
  onOpen: () => void;
}

/** Today's actual forecast blocks, with the same IDs the exam session starts. */
export function ExamDashboardWidget({ state, now, onLoad, onStart, onOpen }: ExamDashboardWidgetProps) {
  const preferences = getGlobalSchedulerPreferences(state.profile);
  const { exams, capacity } = preferences.examPlanning;
  const timeZone = state.profile.timezone || "UTC";
  const today = getLearningDayKey(now, { timeZone }) ?? now.slice(0, 10);
  const { forecast, current, busy, error } = useExamForecast({ decks: state.decks, exams, capacity, preferences, now, timeZone, onLoadPlanningData: onLoad });
  const [starting, setStarting] = React.useState(false);
  const [startError, setStartError] = React.useState("");
  const day = current ? forecast?.days[0] : null;
  async function start(blockId: string | null) { setStarting(true); setStartError(""); try { await onStart(blockId); } catch (failure) { setStartError(failure instanceof Error ? failure.message : "Die Einheit konnte nicht gestartet werden."); } finally { setStarting(false); } }
  return <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" data-testid="dashboard-exam-unit">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="core-heading-3 font-semibold text-core-text">Prüfungen · Heute</h2><ActionButton variant="secondary" onClick={onOpen}>Lernkalender öffnen</ActionButton></div>
    {busy ? <p role="status" className="core-body text-core-muted">Deine Aufgaben werden berechnet …</p> : null}
    {error || startError ? <StatusMessage tone="error">{startError || error}</StatusMessage> : null}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{exams.filter((exam) => exam.status === "active" && exam.examDate > today).sort((a, b) => a.examDate.localeCompare(b.examDate)).map((exam) => {
      const blocks = day ? getExamTopicTasks(day, exam.id) : [];
      const summary = current ? forecast?.exams.find((entry) => entry.examId === exam.id) : null;
      return <section key={exam.id} className="grid min-w-0 content-start gap-3 rounded-panel border border-core-border p-4" aria-label={exam.name}>
        <div><h3 className="break-words core-heading-3 font-semibold text-core-text">{exam.name}</h3><p className="core-caption text-core-muted">In {examDayDistance(today, exam.examDate)} Tagen · {formatExamMinutes(blocks.reduce((sum, block) => sum + block.plannedMinutes, 0))} heute</p></div>
        {summary ? <ExamPace summary={summary} compact /> : null}
        <ul className="grid gap-2">{blocks.map((block) => <li key={block.id}><button type="button" disabled={starting || !current} onClick={() => void start(block.id)} className="flex min-h-control w-full min-w-0 items-center gap-3 rounded-control bg-core-subtle p-3 text-left"><span className="min-w-0 flex-1"><strong className="block break-words core-body text-core-text">{state.decks.find((deck) => deck.id === block.deckId)?.name ?? "Stapel"}</strong><span className="core-caption text-core-muted">{block.cardIds.length} Karten · {block.method === "new" ? "Neues Thema" : "Wiederholen"} · {formatExamMinutes(block.plannedMinutes)}</span></span><Play size={18} className="shrink-0 text-core-text" aria-hidden="true" /></button></li>)}</ul>
        {current && !blocks.length ? <p className="core-body text-core-muted">Heute keine offenen Aufgaben für diese Prüfung.</p> : null}
      </section>;
    })}</div>
    <ActionButton variant="primary" icon={Play} loading={starting} disabled={starting || !current || !day?.blocks.length} onClick={() => void start(null)}>Heutige Einheit lernen</ActionButton>
  </SoftPanel>;
}
