import { Check, Pencil, Save, Trash2, X } from "lucide-react";
import type { Ref } from "react";
import { describeAiSourceCardsRun, type AiSourceCardsRunResult, type ProposalDraft } from "../aiSourceCards.ts";
import { notePlainText } from "../notePresentation.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";

import { noteKindLabel } from "./cardEditor/cardEditorModel.ts";

const plainLines = (html: string) => html.split(/<br\s*\/?>/i).map(notePlainText).join("\n").trim();

function ClozeText({ text }: { text: string }) {
  const parts = text.split(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/);
  return <>{parts.map((part, index) => index % 2 ? <span key={index} className="rounded-marker bg-core-accent-soft px-1 text-core-text">{part}</span> : part)}</>;
}

function Proposal({ proposal, plain, disabled, onEdit, onRemove }: { proposal: ProposalDraft; plain: boolean; disabled: boolean; onEdit: () => void; onRemove: () => void }) {
  const { content } = proposal;
  const text = (role: string) => content.fields.filter((field) => field.role === role).map((field) => ({ name: field.name, text: plainLines(field.html) })).filter((field) => field.text);
  const question = text("prompt").map((field) => field.text).join("\n");
  const source = text("source").map((field) => field.text).join("; ");
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-core-border px-4 py-3 last:border-0" data-testid="ai-source-proposal">
      <div className="grid min-w-0 gap-2">
        {plain ? null : <p className="core-caption text-core-muted [overflow-wrap:anywhere]">{noteKindLabel(proposal)}{source ? ` · ${source}` : ""}</p>}
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] core-body font-semibold text-core-text">{content.interaction.kind === "cloze" ? <ClozeText text={question} /> : question}</p>
        {plain ? null : text("answer").map((field) => <p key={field.name} className="whitespace-pre-wrap [overflow-wrap:anywhere] core-body text-core-text">{field.text}</p>)}
        {content.interaction.kind === "choice" ? (
          <ul className="grid gap-1">
            {content.interaction.options.map((option) => (
              <li key={option.id} className="flex min-w-0 items-start gap-2 core-body text-core-text">
                {option.correct
                  ? <Check size={16} className="mt-1 shrink-0 text-core-success" aria-label="Richtig" />
                  : <X size={16} className="mt-1 shrink-0 text-core-muted" aria-label="Falsch" />}
                <span className="min-w-0 [overflow-wrap:anywhere]">{notePlainText(option.html)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {plain ? null : text("extra").map((field) => <p key={field.name} className="whitespace-pre-wrap [overflow-wrap:anywhere] core-body text-core-secondary">{field.text}</p>)}
      </div>
      <div className="flex items-start gap-1">
        <IconButton type="button" variant="ghost" icon={Pencil} label="Vorschlag bearbeiten" disabled={disabled} onClick={onEdit} />
        <IconButton type="button" variant="ghost" icon={Trash2} label="Vorschlag verwerfen" disabled={disabled} onClick={onRemove} />
      </div>
    </li>
  );
}

export function AiSourceProposalList({ result, notices, proposals, plain = false, saving, saveError, headingRef, onEdit, onRemove, onAdopt, onDiscard }: {
  /** Null for proposals that come from no AI run. */
  result: AiSourceCardsRunResult | null;
  notices: string[];
  proposals: ProposalDraft[];
  /** Shows question and options only; kind, source, answer and extra stay in the card. */
  plain?: boolean;
  saving: boolean;
  saveError: string;
  headingRef: Ref<HTMLHeadingElement>;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onAdopt: () => void;
  onDiscard: () => void;
}) {
  const count = proposals.length;
  return (
    <SoftPanel className="grid min-w-0 gap-6 p-4 sm:p-6" data-testid="ai-source-proposals">
      <h3 ref={headingRef} tabIndex={-1} className="min-w-0 scroll-mt-24 core-heading-3 text-core-text outline-none">
        {count === 1 ? "1 Vorschlag" : `${count.toLocaleString("de-DE")} Vorschläge`}
      </h3>
      {result ? describeAiSourceCardsRun(result).map((message) => <StatusMessage key={message} tone="warning">{message}</StatusMessage>) : null}
      {notices.map((notice) => <StatusMessage key={notice} tone="info">{notice}</StatusMessage>)}
      {result?.warnings.length ? (
        <StatusMessage tone="info">
          <p className="font-semibold">Hinweise der KI</p>
          <ul className="mt-1 grid list-disc gap-1 pl-5">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </StatusMessage>
      ) : null}
      {count ? (
        <ol className="grid min-w-0 overflow-hidden rounded-panel border border-core-border">
          {proposals.map((proposal) => <Proposal key={proposal.id} proposal={proposal} plain={plain} disabled={saving} onEdit={() => onEdit(proposal.id)} onRemove={() => onRemove(proposal.id)} />)}
        </ol>
      ) : null}
      {saveError ? <StatusMessage tone="error" announce="assertive">{saveError}</StatusMessage> : null}
      <div className="flex flex-wrap gap-3">
        <ActionButton type="button" variant="primary" icon={Save} loading={saving} disabled={!count} onClick={onAdopt}>
          {count === 1 ? "1 Vorschlag übernehmen" : `${count.toLocaleString("de-DE")} Vorschläge übernehmen`}
        </ActionButton>
        <ActionButton type="button" variant="secondary" icon={Trash2} disabled={saving} onClick={onDiscard}>Alle verwerfen</ActionButton>
      </div>
    </SoftPanel>
  );
}
