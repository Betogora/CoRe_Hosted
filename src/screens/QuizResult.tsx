import React from "react";
import { CheckCircle2, ChevronDown, Play, RotateCcw, Save, Timer, XCircle } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import { proposalNoteContent, saveProposals, type ProposalDraft } from "../aiSourceCards.ts";
import type { Deck } from "../coreTypes.ts";
import { formatQuizDuration, isQuizAnswerCorrect, quizOptionId, quizSelection, scoreQuizAttempt, type Quiz, type QuizAttempt } from "../quiz.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { ChoiceOptionList } from "../ui/ChoiceOptionList.tsx";
import { CoreSegmentedControl, CoreTag } from "../ui/coreUi.tsx";
import { SectionHeader } from "../ui/SectionHeader.tsx";
import { DeckSelect } from "../ui/selectUi.tsx";
import { AiSourceProposalEditor } from "./AiSourceProposalEditor.tsx";
import { AiSourceProposalList } from "./AiSourceProposalList.tsx";
import { QuizViewHeader } from "./QuizRun.tsx";

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ percent }: { percent: number }) {
  return <div className="core-quiz-ring" role="img" aria-label={`${percent} Prozent richtig`}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle className="core-quiz-ring-track" cx="60" cy="60" r={RING_RADIUS} />
      <circle className="core-quiz-ring-value" cx="60" cy="60" r={RING_RADIUS} strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - percent / 100)} />
    </svg>
    <span className="core-heading-1 text-core-text" aria-hidden="true">{percent} %</span>
  </div>;
}

export function QuizResult({ quiz, expanded, onExpandedChange, onBack, onRepeat, onRetryWrong, onSaveCards }: {
  quiz: Quiz;
  expanded: readonly string[];
  onExpandedChange: (expanded: string[]) => void;
  onBack: () => void;
  onRepeat: () => void;
  onRetryWrong: () => void;
  onSaveCards: () => void;
}) {
  const id = React.useId();
  const attempt = quiz.attempts.at(-1)!;
  const score = scoreQuizAttempt(quiz, attempt);
  const wrong = quiz.questions.filter((question) => !isQuizAnswerCorrect(question, attempt.answers[question.id]));

  return <div className="core-quiz-view">
    <QuizViewHeader title={quiz.title} backLabel="Alle Quizze" onBack={onBack} />
    <div className="core-quiz-score">
      <ScoreRing percent={score.percent} />
      <div className="grid min-w-0 gap-1">
        <p className="core-metric text-core-text">{score.correct} von {score.total} richtig</p>
        {attempt.durationMs === undefined ? null : <p className="flex items-center gap-1.5 core-body text-core-secondary"><Timer size={16} aria-hidden="true" /><span className="sr-only">Dauer </span>{formatQuizDuration(attempt.durationMs)} Min.</p>}
      </div>
    </div>
    <div className="core-quiz-actions">
      {wrong.length ? <ActionButton variant="primary" icon={Play} onClick={onRetryWrong}>Nur falsche wiederholen</ActionButton> : null}
      <ActionButton variant={wrong.length ? "secondary" : "primary"} icon={RotateCcw} onClick={onRepeat}>Quiz wiederholen</ActionButton>
      <ActionButton variant="secondary" icon={Save} onClick={onSaveCards}>Als Karten speichern</ActionButton>
    </div>
    <div className="grid min-w-0">
      <SectionHeader title="Fragen" level={4} />
      <ol className="core-quiz-results">
        {quiz.questions.map((question, index) => {
          const chosen = attempt.answers[question.id] ?? [];
          const correct = !wrong.includes(question);
          const helped = attempt.helped.includes(question.id);
          const open = expanded.includes(question.id);
          const StateIcon = correct ? CheckCircle2 : XCircle;
          return <li key={question.id} className="core-quiz-result">
            <button type="button" className="core-quiz-result-row" aria-expanded={open} aria-controls={`${id}-${question.id}`}
              onClick={() => onExpandedChange(open ? expanded.filter((item) => item !== question.id) : [...expanded, question.id])}>
              <span className="core-quiz-result-number" aria-hidden="true">{index + 1}</span>
              <StateIcon size={20} className={`shrink-0 ${correct ? "text-core-success" : "text-core-danger"}`} aria-label={correct ? "Richtig" : "Falsch"} />
              <span className="min-w-0 [overflow-wrap:anywhere] core-body font-semibold text-core-text">{question.front}</span>
              {helped || !chosen.length ? <span className="core-quiz-result-tags">
                {chosen.length ? null : <CoreTag tone="neutral">Nicht beantwortet</CoreTag>}
                {helped ? <CoreTag tone="info">Hilfe genutzt</CoreTag> : null}
              </span> : null}
              <ChevronDown size={18} className="core-quiz-result-chevron" aria-hidden="true" />
            </button>
            {open ? <div id={`${id}-${question.id}`} className="core-quiz-result-detail">
              <ChoiceOptionList mode={question.form === "single-choice" ? "single" : "multiple"} revealed answers={quizSelection(chosen)}
                options={question.options.map((option, optionIndex) => ({ id: quizOptionId(optionIndex), correct: option.correct, label: option.text }))} />
              {question.explanation ? <p className="core-body text-core-secondary [overflow-wrap:anywhere]">{question.explanation}</p> : null}
            </div> : null}
          </li>;
        })}
      </ol>
    </div>
  </div>;
}

export function QuizSaveCards({ quiz, attempt, decks, deckId, onSaveCard, onBack, onSaved }: {
  quiz: Quiz;
  attempt: QuizAttempt;
  decks: readonly Deck[];
  deckId: string;
  onSaveCard: CreationScreenProps["onSaveManualNote"];
  onBack: () => void;
  onSaved: (createdCards: number, deckName: string) => void;
}) {
  const id = React.useId();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const wrong = React.useMemo(() => quiz.questions.filter((question) => !isQuizAnswerCorrect(question, attempt.answers[question.id])), [quiz, attempt]);
  const proposalsOf = (scope: "wrong" | "all") => (scope === "wrong" ? wrong : quiz.questions)
    .map((question): ProposalDraft => ({ id: question.id, content: proposalNoteContent({ ...question, back: "", sources: [], sourceLabels: [] }, null) }));
  const [scope, setScope] = React.useState<"wrong" | "all">(wrong.length ? "wrong" : "all");
  const [proposals, setProposals] = React.useState(() => proposalsOf(scope));
  const [targetDeckId, setTargetDeckId] = React.useState(deckId);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const target = decks.find((deck) => deck.id === targetDeckId);
  const edited = proposals.find((proposal) => proposal.id === editing) ?? null;

  async function adopt() {
    if (saving || !target) return;
    setSaving(true);
    setSaveError("");
    const outcome = await saveProposals(proposals, { deckId: target.id, deckName: target.name }, onSaveCard);
    setSaving(false);
    if (!outcome.error) { onSaved(outcome.createdCards, target.name); return; }
    setProposals((current) => current.slice(outcome.saved));
    setSaveError(`${outcome.saved.toLocaleString("de-DE")} von ${proposals.length.toLocaleString("de-DE")} Vorschlägen wurden gespeichert. ${outcome.error} Die übrigen bleiben hier; versuche es erneut.`);
  }

  return <div className="core-quiz-view">
    <QuizViewHeader title="Als Karten speichern" backLabel="Zur Auswertung" onBack={onBack} />
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="core-field-group min-w-0">
        <label className="core-field-label" htmlFor={`${id}-deck`}>Zielstapel</label>
        <DeckSelect id={`${id}-deck`} ariaLabel="Zielstapel" className="w-full" value={targetDeckId} decks={decks} onValueChange={setTargetDeckId} />
      </div>
      {wrong.length && wrong.length < quiz.questions.length ? <div className="grid min-w-0 content-start gap-2">
        <span className="core-field-label">Fragen</span>
        <CoreSegmentedControl ariaLabel="Fragen" className="w-full" value={scope} disabled={saving}
          options={[{ value: "wrong", label: `Falsche (${wrong.length})` }, { value: "all", label: `Alle (${quiz.questions.length})` }]}
          onValueChange={(next) => { setScope(next); setProposals(proposalsOf(next)); setSaveError(""); }} />
      </div> : null}
    </div>
    <AiSourceProposalList plain result={null} notices={[]} proposals={proposals} saving={saving} saveError={saveError} headingRef={headingRef}
      onEdit={setEditing} onRemove={(removed) => setProposals((current) => current.filter((proposal) => proposal.id !== removed))} onAdopt={() => void adopt()} onDiscard={onBack} />
    {edited ? <AiSourceProposalEditor key={edited.id} content={edited.content} onCancel={() => setEditing(null)}
      onApply={(content) => { setProposals((current) => current.map((proposal) => proposal.id === edited.id ? { ...proposal, content } : proposal)); setEditing(null); }} /> : null}
  </div>;
}
