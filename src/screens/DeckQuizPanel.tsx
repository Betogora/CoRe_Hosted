import React from "react";
import { CircleDot, FileText, ListChecks, Sparkles, Trash2, X } from "lucide-react";
import { MAX_AI_SOURCE_WISHES_CHARS } from "../aiSourceCreation.ts";
import type { CreationScreenProps } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { QUIZ_QUESTION_COUNT, QUIZ_QUESTION_FORMS, createRetryQuiz, scoreQuizAttempt, type Quiz, type QuizQuestion, type QuizQuestionForm, type QuizSettings, type QuizSource } from "../quiz.ts";
import { IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl } from "../ui/coreUi.tsx";
import { CreationMenu, CreationMenuForm } from "../ui/CreationMenu.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { FileDropField } from "../ui/FileDropField.tsx";
import { CoreCheckbox, CoreSlider } from "../ui/formControls.tsx";
import { QuizResult, QuizSaveCards } from "./QuizResult.tsx";
import { QuizRun, type QuizRunState } from "./QuizRun.tsx";
import { formatBytes } from "./screenConstants.ts";
import type { AskCardHelp } from "./StudyAiHelp.tsx";

const SOURCES = [{ value: "cards", label: "Aus Karten" }, { value: "file", label: "Aus PDF" }] as const;
const SCOPES = [{ value: "deck", label: "Nur dieser Stapel" }, { value: "tree", label: "Mit Unterstapeln" }] as const;
const formIcons = { "single-choice": CircleDot, "multiple-choice": ListChecks };
const dateLabel = (value: string) => new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export interface QuizCreationDraft {
  source: "cards" | "file";
  withSubdecks: boolean;
  file: File | null;
  questionCount: number;
  cardForms: QuizQuestionForm[];
  wishes: string;
  trackTime: boolean;
}

export interface QuizGenerationInput {
  deckId: string;
  source: QuizSource;
  /** The PDF of a file source; it is read for the questions and never stored. */
  file: File | null;
  settings: QuizSettings;
}

/** Where the panel opens; the catalog shows single states with it. */
export type QuizPanelStart =
  | { view: "list"; draft?: Partial<QuizCreationDraft>; advanced?: boolean; generate?: boolean }
  | { view: "run"; quizId: string; answers?: Record<string, number[]>; elapsedMs?: number; help?: string; confirm?: "submit" | "leave" }
  | { view: "result"; quizId: string; expanded?: string[] }
  | { view: "save"; quizId: string };

export interface QuizPanelServices {
  quizzes: Quiz[];
  onGenerateQuiz: (input: QuizGenerationInput, signal: AbortSignal, onProgress: (done: number, total: number) => void) => Promise<QuizQuestion[]>;
  onAskHelp: AskCardHelp;
  onSaveCard: CreationScreenProps["onSaveManualNote"];
  start?: QuizPanelStart;
}

type View = { name: "list" | "run" } | { name: "result" | "save"; quizId: string };

export function DeckQuizPanel({ deck, treeDecks, decks, quizzes: storedQuizzes, onGenerateQuiz, onAskHelp, onSaveCard, start = { view: "list" } }: QuizPanelServices & {
  deck: Deck;
  /** The opened deck and its subdecks. */
  treeDecks: readonly Deck[];
  /** Target decks for questions saved as cards. */
  decks: readonly Deck[];
}) {
  const hasSubdecks = treeDecks.some((item) => item.id !== deck.id && !item.deletedAt);
  const emptyDraft = (): QuizCreationDraft => ({ source: "cards", withSubdecks: hasSubdecks, file: null, questionCount: QUIZ_QUESTION_COUNT.initial, cardForms: QUIZ_QUESTION_FORMS.map((form) => form.value), wishes: "", trackTime: false });
  const newRun = (quizId: string): QuizRunState => ({ quizId, startedAt: Date.now(), answers: {}, helped: [], help: null, confirm: null });
  const [quizzes, setQuizzes] = React.useState(storedQuizzes);
  const [view, setView] = React.useState<View>(start.view === "list" || start.view === "run" ? { name: start.view } : { name: start.view, quizId: start.quizId });
  const [draft, setDraft] = React.useState<QuizCreationDraft | null>(start.view === "list" && start.draft ? { ...emptyDraft(), ...start.draft } : null);
  const [advanced, setAdvanced] = React.useState(start.view === "list" && Boolean(start.advanced));
  const [generation, setGeneration] = React.useState<{ done: number; total: number } | null>(null);
  const [error, setError] = React.useState("");
  const [run, setRun] = React.useState<QuizRunState | null>(start.view === "run"
    ? { ...newRun(start.quizId), startedAt: Date.now() - (start.elapsedMs ?? 0), answers: start.answers ?? {}, help: start.help ?? null, confirm: start.confirm ?? null } : null);
  const [expanded, setExpanded] = React.useState<string[]>(start.view === "result" ? start.expanded ?? [] : []);
  const [deleting, setDeleting] = React.useState<Quiz | null>(null);
  const generationRef = React.useRef<AbortController | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const formRef = React.useRef<HTMLDivElement>(null);
  const toast = useSuccessToast();
  const quizOf = (quizId: string) => quizzes.find((quiz) => quiz.id === quizId) ?? null;
  const runQuiz = view.name === "run" && run ? quizOf(run.quizId) : null;
  const shownQuiz = view.name === "result" || view.name === "save" ? quizOf(view.quizId) : null;

  React.useEffect(() => () => generationRef.current?.abort(), []);

  function startRun(quizId: string) { setRun(newRun(quizId)); setView({ name: "run" }); }
  function showList() { setRun(null); setExpanded([]); setView({ name: "list" }); }
  function closeMenu() { setDraft(null); setAdvanced(false); setError(""); triggerRef.current?.focus(); }
  function changeDraft(patch: Partial<QuizCreationDraft>) { setDraft((current) => current ? { ...current, ...patch } : current); setError(""); }

  async function generate(input: QuizCreationDraft) {
    if (generationRef.current) return;
    if (input.source === "file" && !input.file) { setError("Wähle eine PDF-Datei aus."); return; }
    if (!input.cardForms.length) { setAdvanced(true); setError("Wähle mindestens einen Fragetyp."); return; }
    const controller = new AbortController();
    generationRef.current = controller;
    setError("");
    setGeneration({ done: 0, total: input.questionCount });
    const scopeDecks = input.withSubdecks ? treeDecks : [deck];
    const source: QuizSource = input.source === "file"
      ? { kind: "file", fileName: input.file!.name }
      : { kind: "cards", withSubdecks: input.withSubdecks, cardCount: scopeDecks.reduce((sum, item) => sum + item.cards.length, 0) };
    const settings: QuizSettings = { questionCount: input.questionCount, cardForms: input.cardForms, wishes: input.wishes.trim(), trackTime: input.trackTime };
    try {
      const questions = await onGenerateQuiz({ deckId: deck.id, source, file: input.file, settings }, controller.signal, (done, total) => {
        if (!controller.signal.aborted) setGeneration({ done, total });
      });
      if (controller.signal.aborted) return;
      const now = new Date().toISOString();
      const quiz: Quiz = { version: 1, id: crypto.randomUUID(), deckId: deck.id, title: input.file ? input.file.name.replace(/\.pdf$/i, "") : deck.name, source, settings, createdAt: now, updatedAt: now, questions, attempts: [] };
      setQuizzes((current) => [quiz, ...current]);
      setDraft(null); setAdvanced(false);
      startRun(quiz.id);
      toast("Quiz erstellt.");
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Das Quiz konnte nicht erstellt werden.");
    } finally {
      if (generationRef.current === controller) { generationRef.current = null; setGeneration(null); }
    }
  }

  React.useEffect(() => { if (start.view === "list" && start.generate && draft) void generate(draft); }, []);
  React.useEffect(() => { if (generation) formRef.current?.querySelector<HTMLElement>(".core-creation-menu-wait button")?.focus(); }, [Boolean(generation)]);

  function submitRun() {
    if (!run || !runQuiz) return;
    const finishedAt = Date.now();
    const attempt = {
      startedAt: new Date(run.startedAt).toISOString(), finishedAt: new Date(finishedAt).toISOString(),
      ...runQuiz.settings.trackTime ? { durationMs: finishedAt - run.startedAt } : {},
      answers: Object.fromEntries(Object.entries(run.answers).filter(([, chosen]) => chosen.length)), helped: run.helped,
    };
    setQuizzes((current) => current.map((quiz) => quiz.id === runQuiz.id ? { ...quiz, updatedAt: attempt.finishedAt, attempts: [...quiz.attempts, attempt] } : quiz));
    setRun(null); setExpanded([]);
    setView({ name: "result", quizId: runQuiz.id });
  }

  function retryWrong(quiz: Quiz) {
    const retry = createRetryQuiz(quiz, quiz.attempts.at(-1)!, crypto.randomUUID(), new Date().toISOString());
    setQuizzes((current) => [retry, ...current]);
    startRun(retry.id);
  }

  const state = view.name === "save" ? "karten-speichern"
    : shownQuiz && view.name === "result" ? expanded.length ? "auswertung-offen" : scoreQuizAttempt(shownQuiz, shownQuiz.attempts.at(-1)!).percent === 100 ? "auswertung-fehlerfrei" : "auswertung"
      : view.name === "run" && run ? run.confirm === "submit" ? "lauf-luecken" : run.confirm === "leave" ? "lauf-verlassen" : run.help ? "lauf-hilfe" : Object.values(run.answers).some((chosen) => chosen.length) ? "lauf-teilweise" : "lauf-leer"
        : generation ? "erstellung" : draft ? advanced ? "menue-erweitert" : draft.source === "file" ? "menue-pdf" : "menue-karten"
          : quizzes.length ? "liste" : "leer";

  const quizRow = (quiz: Quiz) => {
    const attempt = quiz.attempts.at(-1);
    const score = attempt ? scoreQuizAttempt(quiz, attempt) : null;
    const date = attempt?.finishedAt ?? quiz.createdAt;
    return <li key={quiz.id} className="core-quiz-row">
      <button type="button" className="core-quiz-row-open" aria-label={attempt ? `Auswertung von „${quiz.title}“ öffnen` : `Quiz „${quiz.title}“ starten`}
        onClick={() => attempt ? setView({ name: "result", quizId: quiz.id }) : startRun(quiz.id)}>
        <strong>{quiz.title}</strong>
        {score ? <><b>{score.percent} %</b><span>{score.correct} von {score.total} richtig</span></> : <em>Noch nicht gemacht</em>}
        <time dateTime={date}>{dateLabel(date)}</time>
      </button>
      <IconButton variant="destructive-quiet" icon={Trash2} label={`Quiz „${quiz.title}“ löschen`} onClick={() => setDeleting(quiz)} />
    </li>;
  };

  return <section className="core-quiz-panel grid min-w-0 gap-6" aria-label="Quiz" data-testid="deck-quiz-panel" data-quiz-state={state}>
    {runQuiz && run ? <QuizRun quiz={runQuiz} run={run} onChange={(patch) => setRun((current) => current ? { ...current, ...patch } : current)} onSubmit={submitRun} onLeave={showList} onAskHelp={onAskHelp} />
      : shownQuiz && view.name === "save" ? <QuizSaveCards quiz={shownQuiz} attempt={shownQuiz.attempts.at(-1)!} decks={decks} deckId={deck.id} onSaveCard={onSaveCard}
        onBack={() => setView({ name: "result", quizId: shownQuiz.id })}
        onSaved={(createdCards, deckName) => { setView({ name: "result", quizId: shownQuiz.id }); toast(`${createdCards === 1 ? "1 Karte" : `${createdCards.toLocaleString("de-DE")} Karten`} in „${deckName}“ gespeichert.`); }} />
      : shownQuiz ? <QuizResult quiz={shownQuiz} expanded={expanded} onExpandedChange={setExpanded} onBack={showList} onRepeat={() => startRun(shownQuiz.id)} onRetryWrong={() => retryWrong(shownQuiz)}
        onSaveCards={() => setView({ name: "save", quizId: shownQuiz.id })} />
      : <>
        <CreationMenu>
          <CreationMenuForm icon={Sparkles} label="Quiz mit KI erstellen" open={Boolean(draft)} onOpenChange={(open) => open ? setDraft(emptyDraft()) : closeMenu()} triggerRef={triggerRef} formRef={formRef}
            wait={generation ? {
              message: `Frage ${Math.min(generation.done + 1, generation.total)} von ${generation.total} wird erstellt …`,
              progress: generation, onCancel: () => { generationRef.current?.abort(); generationRef.current = null; setGeneration(null); },
            } : null}
            advancedOpen={advanced} onAdvancedOpenChange={setAdvanced} error={error} submitLabel="Quiz erstellen" submitIcon={Sparkles} onSubmit={() => { if (draft) void generate(draft); }}
            advanced={draft ? <>
              <fieldset className="grid min-w-0">
                <legend className="mb-2 core-field-label">Fragetypen</legend>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  {QUIZ_QUESTION_FORMS.map(({ value, label }) => {
                    const Icon = formIcons[value];
                    return <label key={value} className="core-ai-source-format">
                      <Icon size={16} aria-hidden="true" />
                      <span className="core-ai-source-format-label">{label}</span>
                      <CoreCheckbox checked={draft.cardForms.includes(value)} onCheckedChange={(checked) => changeDraft({ cardForms: QUIZ_QUESTION_FORMS.map((form) => form.value).filter((form) => form === value ? checked : draft.cardForms.includes(form)) })} />
                    </label>;
                  })}
                </div>
              </fieldset>
              <label className="core-field-group min-w-0">
                <span className="core-field-label">Wünsche <span className="font-normal text-core-muted">(optional)</span></span>
                <textarea className="core-field min-h-20 w-full resize-y" rows={2} maxLength={MAX_AI_SOURCE_WISHES_CHARS} value={draft.wishes} onChange={(event) => changeDraft({ wishes: event.target.value })} placeholder="Zum Beispiel: Schwerpunkt Flüsse und Gebirge" />
              </label>
              <CoreCheckbox className="core-creation-menu-wide" label="Dauer mitmessen" checked={draft.trackTime} onCheckedChange={(trackTime) => changeDraft({ trackTime })} />
            </> : null}>
            {draft ? <>
              <div className="grid min-w-0 gap-2"><span className="core-field-label">Quelle</span><CoreSegmentedControl ariaLabel="Quelle" options={SOURCES} value={draft.source} onValueChange={(source) => changeDraft({ source })} /></div>
              {draft.source === "file" ? <FileDropField accept=".pdf,application/pdf" ariaLabel="PDF für das Quiz auswählen oder ablegen" prompt="PDF hier ablegen" detail="PDF mit Textebene" actionLabel={draft.file ? "Ersetzen" : "Datei auswählen"} onFile={(file) => changeDraft({ file })}>
                {draft.file ? <div className="flex min-w-0 items-center gap-3">
                  <FileText size={22} className="shrink-0 text-core-action" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="[overflow-wrap:anywhere] core-body font-semibold text-core-text">{draft.file.name}</p>
                    <p className="core-caption text-core-muted">{formatBytes(draft.file.size)}</p>
                  </div>
                  <IconButton type="button" label="Datei entfernen" variant="ghost" icon={X} onClick={() => changeDraft({ file: null })} />
                </div> : null}
              </FileDropField>
                : hasSubdecks ? <div className="grid min-w-0 gap-2"><span className="core-field-label">Umfang</span><CoreSegmentedControl ariaLabel="Umfang" options={SCOPES} value={draft.withSubdecks ? "tree" : "deck"} onValueChange={(scope) => changeDraft({ withSubdecks: scope === "tree" })} /></div> : null}
              <CoreSlider label="Fragenzahl" min={QUIZ_QUESTION_COUNT.min} max={QUIZ_QUESTION_COUNT.max} value={draft.questionCount} onValueChange={(questionCount) => changeDraft({ questionCount })} />
            </> : null}
          </CreationMenuForm>
        </CreationMenu>
        {quizzes.length ? <ul className="core-quiz-list" data-testid="quiz-list">{quizzes.map(quizRow)}</ul> : null}
      </>}
    <ActionDialog open={Boolean(deleting)} destructive title="Quiz löschen?" description={`„${deleting?.title ?? ""}“ wird mit allen Durchgängen gelöscht.`} confirmLabel="Löschen" cancelLabel="Abbrechen"
      onCancel={() => setDeleting(null)} onConfirm={() => { setQuizzes((current) => current.filter((quiz) => quiz.id !== deleting?.id)); setDeleting(null); toast("Quiz gelöscht."); }} />
  </section>;
}
