import React from "react";
import { CheckCircle2, ExternalLink, Volume2, XCircle } from "lucide-react";
import type { Card, Note } from "../coreTypes.ts";
import { resolvePresentationMedia } from "../presentationFrame.ts";
import { NOTE_THEME_COLORS, evaluateNoteChoice, noteHasMath, notePlainText, renderCard, renderNoteChoiceOptions, renderNoteSpeech, type NotePresentationResult, type NotePresentationTheme } from "../notePresentation.ts";
import { ActionButton } from "./actionUi.tsx";
import { CoreVerdictControl } from "./coreUi.tsx";
import { StatusMessage } from "./feedbackUi.tsx";
import { CardPresentationSurface } from "./CardPresentationSurface.tsx";
import { NoteLayoutContext, type NoteLayoutSource } from "./noteLayoutContext.ts";

export interface NoteCardContentProps {
  note: Note;
  card: Card;
  revealed: boolean;
  onReveal: () => void;
  surface?: "review" | "preview" | "management";
  mediaUrls?: Record<string, string>;
}

type Speech = Awaited<ReturnType<typeof renderNoteSpeech>>;
/** `missed`: a correct option that was not chosen. */
type OptionTone = "idle" | "selected" | "correct" | "missed" | "wrong" | "muted";

function readTheme(): NotePresentationTheme | null {
  if (typeof document === "undefined") return null;
  const style = getComputedStyle(document.documentElement);
  const colors = Object.fromEntries(NOTE_THEME_COLORS.map((name) => [name, style.getPropertyValue(`--core-${name}`).trim()]));
  return { mode: document.documentElement.dataset.coreTheme === "dark" ? "dark" : "light", colors: colors as NotePresentationTheme["colors"] };
}

const loadMathCss = (note: Note) => noteHasMath(note) ? import("../noteMathAssets.ts").then((assets) => assets.loadNoteMathCss()) : Promise.resolve("");

interface CardBundle {
  question: NotePresentationResult;
  /** The answer side without typed input; a typed answer renders its comparison separately. */
  answer: NotePresentationResult;
  options: Array<{ id: string; html: string }>;
  speech: Record<"question" | "answer", Speech>;
  mathCss: string;
}
type BundleEntry = { promise: Promise<CardBundle>; value?: CardBundle };

// Only the generic translator's contents can show their template's own layout; others never read a template.
const noteTypeSourceFor = (note: Note, layout: NoteLayoutSource) =>
  note.translator?.id === "generic" && note.noteTypeSourceId ? layout.loadNoteTypeSource(note.noteTypeSourceId).catch(() => null) : null;
// Rendered sides per content object: a prefetched card shows at once, and a variant (its own object) never mixes up.
const bundleCache = new WeakMap<Note, Map<string, BundleEntry>>();

function cardBundle(note: Note, card: Card, surface: NonNullable<NoteCardContentProps["surface"]>, theme: NotePresentationTheme, layout: NoteLayoutSource): BundleEntry {
  const deckName = layout.deckName(card.deckId);
  const key = JSON.stringify([card.id, card.promptKey, card.ankiFlag, deckName, surface, theme]);
  let entries = bundleCache.get(note);
  if (!entries) bundleCache.set(note, entries = new Map());
  const known = entries.get(key);
  if (known) return known;
  const promise = (async (): Promise<CardBundle> => {
    const [mathCss, noteTypeSource] = await Promise.all([loadMathCss(note), noteTypeSourceFor(note, layout)]);
    const side = (side: "question" | "answer") => renderCard({ note, card, side, surface, theme, mathCss, noteTypeSource, deckName });
    const [question, answer, options, questionSpeech, answerSpeech] = await Promise.all([
      side("question"), side("answer"), renderNoteChoiceOptions(note, theme), renderNoteSpeech(note, card, "question", theme), renderNoteSpeech(note, card, "answer", theme),
    ]);
    return { question, answer, options, speech: { question: questionSpeech, answer: answerSpeech }, mathCss };
  })();
  const entry: BundleEntry = { promise };
  promise.then((value) => { entry.value = value; }, () => entries.delete(key));
  entries.set(key, entry);
  return entry;
}

/** Renders upcoming review cards ahead, so each appears without a loading state once it is due. */
export function useNoteCardPrefetch(items: ReadonlyArray<{ note: Note; card: Card }>) {
  const layout = React.useContext(NoteLayoutContext);
  React.useEffect(() => {
    const theme = readTheme();
    if (theme) for (const { note, card } of items) void cardBundle(note, card, "review", theme, layout).promise.catch(() => undefined);
  }, [items, layout]);
}

/**
 * Whether the review loads the answer side unseen while the question is read. Not where the answer side follows input
 * made before revealing: typed comparison, or the host's choice selection. Nor where a hidden frame could play sound or
 * video: an original layout's template may carry `autoplay`, which the CoRe design never renders.
 */
export function preparesAnswerAhead(note: Note, card: Card, surface: NonNullable<NoteCardContentProps["surface"]>, answer: NotePresentationResult): boolean {
  const interaction = note.content.interaction;
  if (surface !== "review" || interaction.kind === "choice") return false;
  if (answer.layout === "original" && answer.interactions.some((item) => item === "audio" || item === "video")) return false;
  if (interaction.kind !== "reveal") return true;
  const prompt = interaction.prompts.find((item) => item.key === card.promptKey);
  return Boolean(prompt && !prompt.typeInFieldId);
}

export type AnswerAhead = "none" | "loading" | "ready";

/**
 * The answer frame loaded ahead: hidden until revealed, then shown. A single frame that turns to its back (cloze,
 * image occlusion, original layout) takes the prepared one only once it has loaded, otherwise it turns as without one.
 */
export function preparedAnswerFrame(ahead: AnswerAhead, revealed: boolean, oneFrame: boolean): "hidden" | "shown" | null {
  if (ahead === "none") return null;
  if (!revealed) return "hidden";
  return ahead === "ready" || !oneFrame ? "shown" : null;
}

/** Runs once the frame just loaded is drawn and the browser is idle; returns the cancel. */
function whenDrawnAndIdle(run: () => void) {
  let idle: number | undefined;
  const frame = requestAnimationFrame(() => {
    idle = typeof requestIdleCallback === "function" ? requestIdleCallback(run) : window.setTimeout(run, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (idle !== undefined) (typeof cancelIdleCallback === "function" ? cancelIdleCallback : window.clearTimeout)(idle);
  };
}

export function NoteCardContent(props: NoteCardContentProps) {
  return <NoteCardContentBody key={`${props.card.id}:${props.note.contentRevision}`} {...props} />;
}

function NoteCardContentBody({ note, card, revealed, onReveal, surface = "review", mediaUrls = {} }: NoteCardContentProps) {
  const [theme, setTheme] = React.useState(readTheme);
  const layout = React.useContext(NoteLayoutContext);
  const bundle = theme ? cardBundle(note, card, surface, theme, layout) : null;
  const [presentation, setPresentation] = React.useState<CardBundle | null>(() => bundle?.value ?? null);
  const [typedResult, setTypedResult] = React.useState<{ result: NotePresentationResult; typed: string } | null>(null);
  const [error, setError] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [selectedText, setSelectedText] = React.useState("");
  const [speechError, setSpeechError] = React.useState("");
  // At most one answer frame is prepared, per card: a new card starts a new body.
  const [answerAhead, setAnswerAhead] = React.useState<AnswerAhead>("none");
  const cancelPreparation = React.useRef<(() => void) | null>(null);

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
    if (!bundle) return;
    let active = true;
    bundle.promise.then((value) => { if (active) { setPresentation(value); setError(""); } })
      .catch(() => { if (active) setError("Die Karte konnte nicht dargestellt werden."); });
    return () => { active = false; };
  }, [bundle]);
  React.useEffect(() => {
    if (!theme || typedAnswer === undefined) return;
    let active = true;
    void (async () => {
      const [mathCss, noteTypeSource] = await Promise.all([loadMathCss(note), noteTypeSourceFor(note, layout)]);
      const result = await renderCard({ note, card, side: "answer", surface, theme, mathCss, typedAnswer, noteTypeSource, deckName: layout.deckName(card.deckId) });
      if (active) setTypedResult({ result, typed: typedAnswer });
    })().catch(() => { if (active) setError("Die Karte konnte nicht dargestellt werden."); });
    return () => { active = false; };
  }, [card, layout, note, surface, theme, typedAnswer]);
  React.useEffect(() => () => cancelPreparation.current?.(), []);

  if (error) return <StatusMessage tone="error" announce="assertive">{error}</StatusMessage>;
  if (!presentation) return <StatusMessage tone="info" announce="polite">Kartendarstellung wird vorbereitet …</StatusMessage>;
  // Until the answer side matches the final input, the question stays visible instead of a loading state.
  const answerResult = !revealed ? null : typedAnswer === undefined ? presentation.answer : typedResult?.typed === typedAnswer ? typedResult.result : null;
  const choiceResult = interaction.kind === "choice" ? evaluateNoteChoice(interaction, selected) : null;
  // An original layout turns to its back like in Anki; the back repeats the front through `{{FrontSide}}`.
  const original = presentation.question.layout === "original";
  const oneFrame = interaction.kind === "cloze" || interaction.kind === "image-occlusion" || surface !== "review" || original;
  const diagnostics = [...presentation.question.diagnostics, ...(answerResult?.diagnostics ?? [])].filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code && candidate.detail === item.detail) === index);
  const speech = presentation.speech[revealed ? "answer" : "question"];
  const frameProps = { surface: "review" as const, mediaUrls, onTextSelectionChange: setSelectedText };
  const prepared = preparedAnswerFrame(answerAhead, revealed, oneFrame);
  // Never in the same step as the card change: only once the question has loaded, is drawn and the browser is idle.
  const prepareAnswer = preparesAnswerAhead(note, card, surface, presentation.answer) && !revealed && answerAhead === "none" ? () => {
    cancelPreparation.current ??= whenDrawnAndIdle(() => setAnswerAhead("loading"));
  } : undefined;
  const speak = (item: Speech[number]) => {
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.language;
    utterance.onerror = (event) => { if (event.error !== "canceled" && event.error !== "interrupted") setSpeechError("Der Text konnte nicht vorgelesen werden."); };
    setSpeechError("");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return <div className="relative grid min-w-0 gap-4" data-note-card={card.promptKey}>
    {presentation.mathCss && interaction.kind === "choice" ? <style>{presentation.mathCss}</style> : null}
    {oneFrame && prepared === "shown" ? null : <CardPresentationSurface {...frameProps} presentation={oneFrame && answerResult ? answerResult : presentation.question} title={oneFrame && answerResult ? "Aufgedeckte Karte" : "Frage"} scrollTargetId={original && answerResult && surface === "review" ? "answer" : undefined} onLoad={prepareAnswer} />}

    {typeIn && !revealed ? <div className="grid gap-2">
      <label className="core-field-label" htmlFor={`typed-${card.id}`}>Antwort eingeben</label>
      <input id={`typed-${card.id}`} className="core-field" value={typed} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done"
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onReveal(); } }} />
    </div> : null}

    {interaction.kind === "choice" ? <div className="grid gap-2" role="group" aria-label="Antwortoptionen">
      {interaction.options.map((option, index) => {
        const result = choiceResult!.options[index];
        const isSelected = selected[option.id] === true;
        const letter = String.fromCharCode(65 + index);
        const tone: OptionTone = !revealed ? (isSelected && interaction.mode !== "kprim" ? "selected" : "idle")
          : interaction.mode === "kprim" ? (result.selected === null ? "idle" : result.correct ? "correct" : "wrong")
            : option.correct ? (isSelected ? "correct" : "missed") : isSelected ? "wrong" : "muted";
        const StateIcon = tone === "correct" || tone === "missed" ? CheckCircle2 : tone === "wrong" ? XCircle : null;
        const stateIcon = StateIcon ? <StateIcon className="core-mcq-state-icon" size={20} aria-hidden="true" /> : null;
        const badge = <span aria-hidden="true" className="core-mcq-letter">{letter}</span>;
        const html = resolvePresentationMedia(presentation.options.find((item) => item.id === option.id)?.html ?? "", mediaUrls).replace(/\s(?:src|poster)="(?!data:|blob:)[^"]*"/gi, "");
        const text = <div className="card-html min-w-0 flex-1 overflow-x-auto core-body text-inherit" dangerouslySetInnerHTML={{ __html: html }} />;
        const plain = notePlainText(option.html);
        const feedback = tone === "correct" ? "core-mcq-option-correct" : tone === "wrong" ? "core-mcq-option-wrong" : "";
        if (interaction.mode === "kprim") return <div key={option.id} data-tone={tone} className={`core-kprim-option grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${feedback}`}>
          <div className="flex min-w-0 items-center gap-3">{badge}{text}</div>
          <div className="grid justify-items-start gap-2 sm:justify-items-end">
            <CoreVerdictControl label={`Aussage ${letter}`} disabled={revealed} value={result.selected} onValueChange={(value) => setSelected((current) => ({ ...current, [option.id]: value }))} />
            {revealed ? <p className="flex items-center gap-1.5 core-caption font-semibold text-core-text">{stateIcon}Lösung: {option.correct ? "richtig" : "falsch"}</p> : null}
          </div>
        </div>;
        const indicator = stateIcon ?? <span aria-hidden="true" className="core-mcq-indicator" data-shape={interaction.mode === "single" ? "dot" : "box"}>
          {interaction.mode === "single" ? null : <svg viewBox="0 0 17 18"><polyline points="1 9 7 14 15 4" /></svg>}
        </span>;
        return <button key={option.id} type="button" disabled={revealed} aria-pressed={isSelected} data-tone={tone}
          aria-label={`Antwortoption ${letter}: ${plain}${tone === "correct" ? " (richtig)" : tone === "missed" ? " (richtig, nicht gewählt)" : tone === "wrong" ? " (falsch gewählt)" : ""}`}
          className={`core-mcq-option ${feedback}`}
          onClick={() => {
            setSelected((current) => interaction.mode === "single" ? { [option.id]: true } : { ...current, [option.id]: !current[option.id] });
            if (interaction.mode === "single") onReveal();
          }}>{badge}{text}{indicator}</button>;
      })}
      {!revealed && interaction.mode !== "single" ? <ActionButton variant="primary" className="mt-1 w-fit" disabled={!choiceResult!.complete} onClick={onReveal}>Antwort prüfen</ActionButton> : null}
    </div> : null}

    {prepared || (answerResult && !oneFrame) ? <CardPresentationSurface {...frameProps} presentation={answerResult ?? presentation.answer} title={oneFrame ? "Aufgedeckte Karte" : "Antwort"} concealed={prepared === "hidden"} scrollTargetId={original ? "answer" : undefined} onLoad={revealed ? undefined : () => setAnswerAhead("ready")} /> : null}
    {diagnostics.length ? <StatusMessage tone="warning">{diagnostics.map((item, index) => <p key={index}>{item.message}</p>)}</StatusMessage> : null}

    {speech.length || (surface === "review" && selectedText) ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {speech.map((item) => <ActionButton key={item.fieldId} variant="secondary" icon={Volume2} disabled={typeof window === "undefined" || !("speechSynthesis" in window)} onClick={() => speak(item)}>{item.label} vorlesen</ActionButton>)}
      {surface === "review" && selectedText ? <>
        <ActionButton variant="secondary" icon={ExternalLink} aria-describedby={`amboss-${card.id}`} onClick={() => window.open(`https://next.amboss.com/de/search?q=${encodeURIComponent(selectedText)}`, "_blank", "noopener,noreferrer")}>In AMBOSS nachschlagen</ActionButton>
        <span id={`amboss-${card.id}`} className="min-w-0 max-w-full truncate core-caption text-core-muted">„{selectedText}“</span>
      </> : null}
    </div> : null}
    {speechError ? <StatusMessage tone="error" announce="assertive">{speechError}</StatusMessage> : null}
  </div>;
}
