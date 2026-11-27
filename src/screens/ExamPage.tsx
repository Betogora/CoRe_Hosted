import React from "react";
import { CalendarCheck, ChevronRight, Palette, Pause, Pencil, Play, Trash2 } from "lucide-react";
import type { Deck, ExamPlan } from "../coreTypes.ts";
import { examDayDistance, getExamStatus, type ExamForecastSummary } from "../examPlanning.ts";
import { CrossLinkButton, IconButton } from "../ui/actionUi.tsx";
import { ColorPicker } from "../ui/ColorPicker.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { examTextColor, formatExamDate } from "./examPlanningUi.ts";

const STATUS_LABELS = { paused: "Pausiert", completed: "Abgeschlossen" } as const;

export interface ExamReadiness { coverage: number; consolidated: number; totalCards: number }

function countdown(exam: ExamPlan, civilToday: string) {
  const days = examDayDistance(civilToday, exam.examDate);
  if (days > 1) return { value: days, label: "Tage bis zur Prüfung" };
  if (days === 1) return { value: 1, label: "Tag bis zur Prüfung" };
  return { value: 0, label: days === 0 ? "Heute ist die Prüfung" : "Termin erreicht" };
}

function PosterTop({ exam, civilToday, before, heading }: { exam: ExamPlan; civilToday: string; before?: React.ReactNode; heading?: React.Ref<HTMLHeadingElement> }) {
  const status = getExamStatus(exam, civilToday);
  const Heading = heading ? "h2" : "h3";
  return <div className="exam-poster-top">
    {before}
    <Heading ref={heading} tabIndex={heading ? -1 : undefined} className="exam-poster-eyebrow outline-none">{exam.name}</Heading>
    {status !== "active" ? <span className="exam-poster-chip">{STATUS_LABELS[status]}</span> : null}
    <span className="exam-poster-date">{formatExamDate(exam.examDate)}</span>
  </div>;
}

export function ExamPosterLink({ exam, color, civilToday, disabled, onOpen }: { exam: ExamPlan; color: string; civilToday: string; disabled: boolean; onOpen: () => void }) {
  const { value, label } = countdown(exam, civilToday);
  return <button type="button" className="dashboard-poster exam-poster" data-testid={`exam-card-${exam.id}`} data-status={getExamStatus(exam, civilToday)} disabled={disabled} aria-label={`${exam.name}: Prüfung öffnen`} style={{ "--bg": color, "--fg": examTextColor(exam) } as React.CSSProperties} onClick={onOpen}>
    <PosterTop exam={exam} civilToday={civilToday} />
    <span className="dashboard-poster-giant exam-poster-giant">{value}</span>
    <span className="dashboard-poster-subtitle exam-poster-subtitle">{label}</span>
    <ChevronRight size={28} aria-hidden="true" className="exam-poster-way" />
  </button>;
}

interface ExamPageProps {
  exam: ExamPlan;
  color: string;
  decks: readonly Deck[];
  summary: ExamForecastSummary | null;
  readiness: ExamReadiness | null;
  civilToday: string;
  busy: boolean;
  /** Replaces today's tasks and the deck list while the exam is edited. */
  editor: React.ReactNode;
  today: React.ReactNode;
  onBack: () => void;
  onColor: (color: string) => void;
  onEdit: () => void;
  onStatus: (status: ExamPlan["status"]) => void;
  onDelete: () => void;
}

export function ExamPage({ exam, color, decks, summary, readiness, civilToday, busy, editor, today, onBack, onColor, onEdit, onStatus, onDelete }: ExamPageProps) {
  const status = getExamStatus(exam, civilToday);
  const past = examDayDistance(civilToday, exam.examDate) <= 0;
  const { value, label } = countdown(exam, civilToday);
  const total = readiness?.totalCards ?? 0;
  const seen = Math.round(total * (readiness?.coverage ?? 0)), solid = Math.min(seen, Math.round(total * (readiness?.consolidated ?? 0)));
  const heading = React.useRef<HTMLHeadingElement>(null);
  // The poster that opened this page is gone, so keyboard focus moves to the page instead of falling to the document.
  React.useEffect(() => { heading.current?.focus(); }, []);
  const parts = [{ label: "Gefestigt", value: solid }, { label: "Gesehen", value: seen - solid }, { label: "Neu", value: total - seen }];
  return <section className="exam-page grid min-w-0 gap-3" data-testid={`exam-page-${exam.id}`} data-status={status}>
    <div className="core-page-header-back"><CrossLinkButton direction="back" onSelect={onBack}>Prüfungen</CrossLinkButton></div>
    <div className="min-w-0">
      <header className="dashboard-poster exam-page-hero" style={{ "--bg": color, "--fg": examTextColor(exam) } as React.CSSProperties}>
        <PosterTop exam={exam} civilToday={civilToday} heading={heading} before={<ColorPicker icon={Palette} ariaLabel="Farbe der Prüfung ändern" value={exam.color ?? "#6f7e9e"} disabled={busy} onValueCommit={onColor} />} />
        <div className="exam-page-actions">
          <button type="button" className="exam-page-edit" disabled={busy} onClick={onEdit}><Pencil size={16} aria-hidden="true" />Bearbeiten</button>
          <IconButton variant="ghost" icon={status === "active" ? Pause : Play} label={status === "active" ? "Pausieren" : status === "completed" ? "Wieder öffnen" : "Fortsetzen"} disabled={busy || (status !== "active" && past)} onClick={() => onStatus(status === "active" ? "paused" : "active")} />
          {status !== "completed" ? <IconButton variant="ghost" icon={CalendarCheck} label="Abschließen" disabled={busy} onClick={() => onStatus("completed")} /> : null}
          <IconButton variant="ghost" icon={Trash2} label="Löschen" disabled={busy} onClick={onDelete} />
        </div>
        <p className="exam-page-countdown"><span className="dashboard-poster-giant">{value}</span><span className="dashboard-poster-subtitle">{label}</span></p>
        {readiness ? <dl className="exam-page-parts" aria-label="Lernstand">
          {parts.map((part, index) => <div key={part.label} data-part={index} style={{ flexGrow: part.value }}><dt>{part.label}</dt><dd>{part.value}</dd></div>)}
        </dl> : <p className="exam-page-parts-missing">Der Lernstand ist noch nicht verfügbar.</p>}
      </header>
      <div className="exam-page-body" data-split={editor ? undefined : ""}>
        {editor ? <div className="exam-page-editor">{editor}</div> : <>
          <div className="exam-page-cell">{today}{summary?.issues.map((issue) => <StatusMessage key={issue} tone="info">{issue}</StatusMessage>)}</div>
          {summary?.decks.length ? <div className="exam-page-cell">
            <table className="exam-page-decks">
              <thead><tr><th scope="col">Stapel</th><th scope="col">Neu</th><th scope="col">Karten</th></tr></thead>
              <tbody>{summary.decks.map((entry) => {
                const deck = decks.find((candidate) => candidate.id === entry.deckId);
                return <tr key={entry.deckId}>
                  <th scope="row"><span className="exam-page-deck">{deck ? <DeckAppearanceIcon deck={deck} className="size-8" iconSize={16} /> : null}<span>{entry.name}</span></span></th>
                  <td data-new={entry.total - entry.known > 0 || undefined}>{entry.total - entry.known}</td>
                  <td>{entry.total}</td>
                </tr>;
              })}</tbody>
            </table>
          </div> : null}
        </>}
      </div>
    </div>
  </section>;
}
