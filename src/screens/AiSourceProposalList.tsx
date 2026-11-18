import { Check, Trash2, X } from "lucide-react";
import type { Ref } from "react";
import { describeAiSourceCardsRun, type AiSourceCardsRunResult, type SourceCardProposal } from "../aiSourceCards.ts";
import { AI_SOURCE_CARD_FORMS } from "../aiSourceCreation.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";

const formLabels = Object.fromEntries(AI_SOURCE_CARD_FORMS.map(({ value, label }) => [value, label]));

/** The cloze text with its single gap shown as the highlighted solution. */
function ClozeText({ text }: { text: string }) {
  const match = /\{\{c1::(.*?)(?:::.*?)?\}\}/.exec(text);
  if (!match) return <>{text}</>;
  return <>{text.slice(0, match.index)}<span className="rounded-sm bg-core-accent-soft px-1 text-core-text">{match[1]}</span>{text.slice(match.index + match[0].length)}</>;
}

function Proposal({ proposal }: { proposal: SourceCardProposal }) {
  return (
    <li className="grid min-w-0 gap-2 border-b border-core-border px-4 py-3 last:border-0" data-testid="ai-source-proposal">
      <p className="core-caption text-core-muted [overflow-wrap:anywhere]">{formLabels[proposal.form]} · {proposal.sourceLabels.join(", ")}</p>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere] core-body font-semibold text-core-text">{proposal.form === "cloze" ? <ClozeText text={proposal.front} /> : proposal.front}</p>
      {proposal.back ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere] core-body text-core-text">{proposal.back}</p> : null}
      {proposal.options.length ? (
        <ul className="grid gap-1">
          {proposal.options.map((option) => (
            <li key={option.text} className="flex min-w-0 items-start gap-2 core-body text-core-text">
              {option.correct
                ? <Check size={16} className="mt-1 shrink-0 text-core-success" aria-label="Richtig" />
                : <X size={16} className="mt-1 shrink-0 text-core-muted" aria-label="Falsch" />}
              <span className="min-w-0 [overflow-wrap:anywhere]">{option.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {proposal.explanation ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere] core-body text-core-secondary">{proposal.explanation}</p> : null}
    </li>
  );
}

/** Unsaved proposals of a finished run with everything the learner must know about what was left out. */
export function AiSourceProposalList({ result, notices, headingRef, onDiscard }: {
  result: AiSourceCardsRunResult;
  /** Remarks from reading the source, e.g. pages without a text layer. */
  notices: string[];
  headingRef: Ref<HTMLHeadingElement>;
  onDiscard: () => void;
}) {
  const count = result.proposals.length;
  return (
    <SoftPanel className="grid min-w-0 gap-6 p-4 sm:p-6" data-testid="ai-source-proposals">
      <h3 ref={headingRef} tabIndex={-1} className="min-w-0 scroll-mt-24 core-heading-3 text-core-text outline-none">
        {count === 1 ? "1 Vorschlag" : `${count.toLocaleString("de-DE")} Vorschläge`}
      </h3>
      {describeAiSourceCardsRun(result).map((message) => <StatusMessage key={message} tone="warning">{message}</StatusMessage>)}
      {notices.map((notice) => <StatusMessage key={notice} tone="info">{notice}</StatusMessage>)}
      {result.warnings.length ? (
        <StatusMessage tone="info">
          <p className="font-semibold">Hinweise der KI</p>
          <ul className="mt-1 grid list-disc gap-1 pl-5">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </StatusMessage>
      ) : null}
      {count ? <ol className="grid min-w-0 overflow-hidden rounded-panel border border-core-border">{result.proposals.map((proposal) => <Proposal key={proposal.id} proposal={proposal} />)}</ol> : null}
      <div className="flex flex-wrap gap-3">
        <ActionButton type="button" variant="secondary" icon={Trash2} onClick={onDiscard}>Vorschläge verwerfen</ActionButton>
      </div>
    </SoftPanel>
  );
}
