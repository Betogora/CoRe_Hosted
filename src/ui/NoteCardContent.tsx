import React from "react";
import { CheckCircle2, ExternalLink, Volume2, XCircle } from "lucide-react";
import type { Card, Note } from "../coreTypes.ts";
import { resolvePresentationMedia } from "../cardPresentationFrame.ts";
import { NOTE_THEME_COLORS, evaluateNoteChoice, noteHasMath, notePlainText, renderCard, renderNoteChoiceOptions, renderNoteSpeech, type NotePresentationResult, type NotePresentationTheme } from "../notePresentation.ts";
import { ActionButton } from "./actionUi.tsx";
import { CoreSegmentedControl } from "./coreUi.tsx";
import { StatusMessage } from "./feedbackUi.tsx";
import { CardPresentationSurface } from "./CardPresentationSurface.tsx";

export interface NoteCardContentProps {
  note: Note;
  card: Card;
  revealed: boolean;
  onReveal: () => void;
  surface?: "review" | "preview" | "management";
  mediaUrls?: Record<string, string>;
}

type Speech = Awaited<ReturnType<typeof renderNoteSpeech>>;
type OptionTone = "idle" | "selected" | "correct" | "wrong" | "muted";

const OPTION_TONE: Record<OptionTone, string> = {
  idle: "border-core-border bg-core-surface",
  selected: "border-core-action bg-core-subtle",
  correct: "core-mcq-option-correct border-core-success bg-core-success-soft",
  wrong: "core-mcq-option-wrong border-core-danger bg-core-danger-soft",
  muted: "border-core-border bg-core-surface text-core-muted",
};

function readTheme(): NotePresentationTheme | null {
  if (typeof document === "undefined") return null;
  const style = getComputedStyle(document.documentElement);
  const colors = Object.fromEntries(NOTE_THEME_COLORS.map((name) => [name, style.getPropertyValue(`--core-${name}`).trim()]));
  return { mode: document.documentElement.dataset.coreTheme === "dark" ? "dark" : "light", colors: colors as NotePresentationTheme["colors"] };
}

const loadMathCss = (note: Note) => noteHasMath(note) ? import("../noteMathAssets.ts").then((assets) => assets.loadNoteMathCss()) : Promise.resolve("");

export function NoteCardContent(props: NoteCardContentProps) {
  return <NoteCardContentBody key={`${props.card.id}:${props.note.contentRevision}`} {...props} />;
}

function NoteCardContentBody({ note, card, revealed, onReveal, surface = "review", mediaUrls = {} }: NoteCardContentProps) {
  const [theme, setTheme] = React.useState(readTheme);
  const [presentation, setPresentation] = React.useState<{ question: NotePresentationResult; options: Array<{ id: string; html: string }>; speech: Record<"question" | "answer", Speech>; mathCss: string } | null>(null);
  const [answer, setAnswer] = React.useState<{ result: NotePresentationResult; typed: string | undefined } | null>(null);
  const [error, setError] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [selectedText, setSelectedText] = React.useState("");
  const [speechError, setSpeechError] = React.useState("");

  const interaction = note.content.interaction;
  const prompt = interaction.kind === "reveal" ? interaction.prompts.find((item) => item.key === card.promptKey) : null;
  const typedField = prompt?.typeInFieldId ? note.content.fields.find((field) => field.id === prompt.typeInFieldId) : null;
  const typeIn = Boolean(typedField && (typedField.role === "prompt" || typedField.role === "answer"));
  // The answer side is rendered again once the typed input is final, so the comparison replaces the type-in field.
  const typedAnswer = typeIn && revealed ? typed : undefined;

  React.useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-core-theme"] });
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    if (!theme) return;
    let active = true;
    void (async () => {
      const mathCss = await loadMathCss(note);
      const [question, options, questionSpeech, answerSpeech] = await Promise.all([
        renderCard({ note, card, side: "question", surface, theme, mathCss }),
        renderNoteChoiceOptions(note, theme),
        renderNoteSpeech(note, card, "question", theme),
        renderNoteSpeech(note, card, "answer", theme),
      ]);
      if (active) { setPresentation({ question, options, speech: { question: questionSpeech, answer: answerSpeech }, mathCss }); setError(""); }
    })().catch(() => { if (active) setError("Die Karte konnte nicht dargestellt werden."); });
    return () => { active = false; };
  }, [card, note, surface, theme]);
  React.useEffect(() => {
    if (!theme) return;
    let active = true;
    void (async () => {
      const result = await renderCard({ note, card, side: "answer", surface, theme, mathCss: await loadMathCss(note), typedAnswer });
      if (active) setAnswer({ result, typed: typedAnswer });
    })().catch(() => { if (active) setError("Die Karte konnte nicht dargestellt werden."); });
    return () => { active = false; };
  }, [card, note, surface, theme, typedAnswer]);

  if (error) return <StatusMessage tone="error" announce="assertive">{error}</StatusMessage>;
  if (!presentation) return <StatusMessage tone="info" announce="polite">Kartendarstellung wird vorbereitet …</StatusMessage>;
  // Until the answer side matches the final input, the question stays visible instead of a loading state.
  const answerResult = revealed && answer && answer.typed === typedAnswer ? answer.result : null;
  const choiceResult = interaction.kind === "choice" ? evaluateNoteChoice(interaction, selected) : null;
  const oneFrame = interaction.kind === "cloze" || interaction.kind === "image-occlusion" || surface !== "review";
  const diagnostics = [...presentation.question.diagnostics, ...(answerResult?.diagnostics ?? [])].filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code && candidate.detail === item.detail) === index);
  const speech = presentation.speech[revealed ? "answer" : "question"];
  const frameProps = { surface: "review" as const, showCompatibility: false, mediaUrls, onTextSelectionChange: setSelectedText };
  const speak = (item: Speech[number]) => {
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.language;
    utterance.onerror = (event) => { if (event.error !== "canceled" && event.error !== "interrupted") setSpeechError("Der Text konnte nicht vorgelesen werden."); };
    setSpeechError("");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return <div className="grid min-w-0 gap-4" data-note-card={card.promptKey}>
    {presentation.mathCss && interaction.kind === "choice" ? <style>{presentation.mathCss}</style> : null}
    <CardPresentationSurface {...frameProps} presentation={oneFrame && answerResult ? answerResult : presentation.question} title={oneFrame && answerResult ? "Aufgedeckte Karte" : "Frage"} />

    {typeIn && !revealed ? <div className="grid gap-2">
      <label className="core-field-label" htmlFor={`typed-${card.id}`}>Antwort eingeben</label>
      <input id={`typed-${card.id}`} className="core-field" value={typed} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" aria-describedby={`typed-hint-${card.id}`}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onReveal(); } }} />
      <p id={`typed-hint-${card.id}`} className="core-field-hint">Mit Enter aufdecken und vergleichen.</p>
    </div> : null}

    {interaction.kind === "choice" ? <div className="grid gap-2" role="group" aria-label="Antwortoptionen">
      {interaction.options.map((option, index) => {
        const result = choiceResult!.options[index];
        const isSelected = selected[option.id] === true;
        const letter = String.fromCharCode(65 + index);
        const tone: OptionTone = !revealed ? (isSelected && interaction.mode !== "kprim" ? "selected" : "idle")
          : interaction.mode === "kprim" ? (result.selected === null ? "idle" : result.correct ? "correct" : "wrong")
            : option.correct ? "correct" : isSelected ? "wrong" : "muted";
        const StateIcon = tone === "correct" ? CheckCircle2 : tone === "wrong" ? XCircle : null;
        const stateIcon = StateIcon ? <StateIcon className="shrink-0 text-core-text" size={20} aria-hidden="true" /> : null;
        const badge = <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-inset border core-caption font-semibold ${tone === "selected" ? "border-core-action bg-core-action text-core-on-accent" : "border-core-border text-core-muted"}`}>{letter}</span>;
        const html = resolvePresentationMedia(presentation.options.find((item) => item.id === option.id)?.html ?? "", mediaUrls).replace(/\s(?:src|poster)="(?!data:|blob:)[^"]*"/gi, "");
        const text = <div className="card-html min-w-0 flex-1 overflow-x-auto core-body text-inherit" dangerouslySetInnerHTML={{ __html: html }} />;
        const plain = notePlainText(option.html);
        if (interaction.mode === "kprim") return <div key={option.id} className={`grid gap-3 rounded-control border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${OPTION_TONE[tone]}`}>
          <div className="flex min-w-0 items-start gap-3">{badge}{text}</div>
          <div className="grid gap-2 sm:justify-items-end">
            <CoreSegmentedControl className="w-full sm:w-52" disabled={revealed} ariaLabel={`Aussage ${letter}`} value={result.selected === null ? "" : result.selected ? "richtig" : "falsch"} options={[{ value: "richtig", label: "richtig" }, { value: "falsch", label: "falsch" }]} onValueChange={(value) => setSelected((current) => ({ ...current, [option.id]: value === "richtig" }))} />
            {revealed ? <p className="flex items-center gap-1.5 core-caption font-semibold text-core-text">{stateIcon}Lösung: {option.correct ? "richtig" : "falsch"}</p> : null}
          </div>
        </div>;
        return <button key={option.id} type="button" disabled={revealed} aria-pressed={isSelected}
          aria-label={`Antwortoption ${letter}: ${plain}${tone === "correct" ? " (richtig)" : tone === "wrong" ? " (falsch gewählt)" : ""}`}
          className={`core-mcq-option flex min-h-12 w-full items-center gap-3 rounded-control border px-3 py-2.5 text-left text-core-text ${OPTION_TONE[tone]}`}
          onClick={() => {
            setSelected((current) => interaction.mode === "single" ? { [option.id]: true } : { ...current, [option.id]: !current[option.id] });
            if (interaction.mode === "single") onReveal();
          }}>{badge}{text}{stateIcon}</button>;
      })}
      {!revealed && interaction.mode !== "single" ? <ActionButton variant="primary" className="mt-1 w-fit" disabled={!choiceResult!.complete} onClick={onReveal}>Antwort prüfen</ActionButton> : null}
      {revealed ? <StatusMessage className="mt-1" tone={!choiceResult!.complete ? "info" : choiceResult!.correct ? "success" : "error"} announce="polite">{!choiceResult!.complete ? "Lösung aufgedeckt." : choiceResult!.correct ? "Richtig ausgewählt." : "Nicht ganz. Vergleiche deine Auswahl mit der Lösung."}</StatusMessage> : null}
    </div> : null}

    {answerResult && !oneFrame ? <CardPresentationSurface {...frameProps} presentation={answerResult} title="Antwort" /> : null}
    {diagnostics.length ? <StatusMessage tone="warning">{diagnostics.map((item, index) => <p key={index}>{item.message}</p>)}</StatusMessage> : null}

    {speech.length || surface === "review" ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-core-border pt-4">
      {speech.map((item) => <ActionButton key={item.fieldId} variant="secondary" icon={Volume2} disabled={typeof window === "undefined" || !("speechSynthesis" in window)} onClick={() => speak(item)}>{item.label} vorlesen</ActionButton>)}
      {surface === "review" && selectedText ? <>
        <ActionButton variant="secondary" icon={ExternalLink} aria-describedby={`amboss-${card.id}`} onClick={() => window.open(`https://next.amboss.com/de/search?q=${encodeURIComponent(selectedText)}`, "_blank", "noopener,noreferrer")}>In AMBOSS nachschlagen</ActionButton>
        <span id={`amboss-${card.id}`} className="min-w-0 max-w-full truncate core-caption text-core-muted">„{selectedText}“</span>
      </> : null}
      {surface === "review" && !selectedText ? <p className="flex min-h-11 items-center gap-2 core-caption text-core-muted"><ExternalLink className="shrink-0" size={16} aria-hidden="true" />Begriff auf der Karte markieren, um ihn in AMBOSS nachzuschlagen.</p> : null}
    </div> : null}
    {speechError ? <StatusMessage tone="error" announce="assertive">{speechError}</StatusMessage> : null}
  </div>;
}
