import React from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Lightbulb, LoaderCircle, MessageCircleQuestion, X } from "lucide-react";
import { MAX_AI_CARD_HELP_HISTORY, MAX_AI_CARD_HELP_QUESTION_CHARS, type AiCardHelpRequest } from "../aiCardHelpContract.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { BrainMascot } from "../ui/BrainMascot.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { useModalDialog } from "../ui/useModalDialog.ts";

const QUICK_QUESTIONS = [
  { label: "Erklären", icon: MessageCircleQuestion, mode: "explain", question: "Erkläre mir diese Karte." },
  { label: "Beispiel", icon: Lightbulb, mode: "example", question: "Gib mir ein Beispiel dazu." },
] as const;

interface Exchange { question: string; answer?: string; error?: string }

export type AskCardHelp = (request: AiCardHelpRequest, signal: AbortSignal) => Promise<string>;

/**
 * Learning help for the revealed card: a floating entry and a modal chat. The history survives closing and ends
 * with the card; unmounting on card change aborts a running request.
 */
export function StudyAiHelp({ card, onAsk, open, onOpenChange }: {
  card: AiCardHelpRequest["card"];
  onAsk: AskCardHelp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [exchanges, setExchanges] = React.useState<Exchange[]>([]);
  const [draft, setDraft] = React.useState("");
  const entryRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const close = () => onOpenChange(false);
  const { dialogRef, initialFocusRef } = useModalDialog({ open, onClose: close, returnFocusRef: entryRef, stopEscapePropagation: true });
  const pending = exchanges.some((exchange) => exchange.answer === undefined && exchange.error === undefined);

  React.useEffect(() => () => controllerRef.current?.abort(), []);
  React.useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [exchanges, open]);

  const ask = (mode: AiCardHelpRequest["mode"], question: string) => {
    if (pending) return;
    const history = exchanges.flatMap(({ question, answer }) => answer === undefined ? [] : [{ question, answer }]).slice(-MAX_AI_CARD_HELP_HISTORY);
    const controller = new AbortController();
    controllerRef.current = controller;
    setExchanges((current) => [...current, { question }]);
    const settle = (result: Omit<Exchange, "question">) => {
      if (!controller.signal.aborted) setExchanges((current) => current.map((exchange, index) => index === current.length - 1 ? { ...exchange, ...result } : exchange));
    };
    onAsk({ card, mode, ...(mode === "question" ? { question } : {}), ...(history.length ? { history } : {}) }, controller.signal).then(
      (answer) => settle({ answer }),
      (error: unknown) => settle({ error: error instanceof Error ? error.message : "Die KI-Hilfe konnte nicht antworten." }),
    );
  };

  const dialog = open ? (
    <div
      className="core-study-settings-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-[var(--core-backdrop)] md:items-stretch md:justify-end md:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="KI hilft"
        data-testid="study-ai-help"
        className="core-study-settings-overlay core-overlay flex h-[min(80dvh,40rem)] w-full flex-col overflow-hidden rounded-t-overlay border-b-0 md:h-auto md:max-w-md md:rounded-overlay md:border-b"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-round bg-core-border md:hidden" aria-hidden="true" />
        <div className="flex items-start gap-3 p-4">
          <span className="w-11 shrink-0" aria-hidden="true"><BrainMascot id="pastell-nicht-sicher" /></span>
          <p className="mt-1 flex-1 rounded-panel bg-core-subtle px-3 py-2 core-body text-core-text">Hi! Stell mir eine Frage zu dieser Karte.</p>
          <IconButton ref={initialFocusRef} label="KI hilft schließen" icon={X} variant="ghost" onClick={close} />
        </div>
        <div ref={listRef} className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto overscroll-contain px-4" aria-live="polite" aria-busy={pending}>
          {exchanges.map((exchange, index) => (
            <React.Fragment key={index}>
              <p className="max-w-[85%] justify-self-end rounded-panel bg-core-info-soft px-3 py-2 core-body text-core-text">{exchange.question}</p>
              {exchange.answer !== undefined ? (
                <p className="max-w-[90%] justify-self-start whitespace-pre-line rounded-panel bg-core-subtle px-3 py-2 core-body text-core-text">{exchange.answer}</p>
              ) : exchange.error !== undefined ? (
                <StatusMessage tone="error" className="max-w-[90%] justify-self-start">{exchange.error}</StatusMessage>
              ) : (
                <p className="flex items-center gap-2 justify-self-start px-3 py-2 core-body text-core-secondary">
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} aria-hidden="true" />
                  Ich denke nach …
                </p>
              )}
            </React.Fragment>
          ))}
        </div>
        <form
          className="grid gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim() || pending) return;
            ask("question", draft.trim());
            setDraft("");
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {QUICK_QUESTIONS.map(({ label, icon, mode, question }) => (
              <ActionButton key={label} type="button" variant="secondary" icon={icon} disabled={pending} onClick={() => ask(mode, question)}>{label}</ActionButton>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="core-field min-w-0 flex-1" value={draft} maxLength={MAX_AI_CARD_HELP_QUESTION_CHARS} placeholder="Stelle eine Frage …" aria-label="Frage zu dieser Karte" onChange={(event) => setDraft(event.target.value)} />
            <ActionButton type="submit" variant="primary" icon={ArrowUp} aria-label="Frage senden" disabled={!draft.trim() || pending} />
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button ref={entryRef} type="button" className="core-study-ai-entry core-action-secondary rounded-round py-1 pl-1 pr-4 shadow-raised" aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpenChange(true)}>
        <span className="w-8 shrink-0" aria-hidden="true"><BrainMascot id="pastell-app" /></span>
        KI hilft
      </button>
      {dialog && typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog}
    </>
  );
}
