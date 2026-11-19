import React from "react";
import { ArrowLeft, ArrowRight, CircleDot, FileText, Layers3, ListChecks, MessageSquare, Pencil, Sparkles, TextCursorInput, X } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import { describeAiSourceCardsRun, readAiSource, runAiSourceCards, type AiSourceCardsRequester, type AiSourceCardsRunResult } from "../aiSourceCards.ts";
import {
  AI_SOURCE_ACCEPT, AI_SOURCE_ANSWER_LENGTHS, AI_SOURCE_CARD_FORMS, AI_SOURCE_FORMAT_LABEL, AI_SOURCE_AMOUNTS, AI_SOURCE_LANGUAGES, AI_SOURCE_PRIOR_KNOWLEDGE, AI_SOURCE_REGISTERS, MAX_AI_SOURCE_WISHES_CHARS,
  aiSourceFileError, createAiSourceCreationDraft, describeAiSourceSettings, suggestSourceDeckName, validateAiSourceCreation,
  type AiSourceSettings,
} from "../aiSourceCreation.ts";
import { ActionButton, Disclosure, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreCheckbox, CoreSwitch } from "../ui/formControls.tsx";
import { FileDropField } from "../ui/FileDropField.tsx";
import { SectionHeader } from "../ui/SectionHeader.tsx";
import { CoreSelect, DeckSelect } from "../ui/selectUi.tsx";
import { Steps } from "../ui/Steps.tsx";
import { AiSourceProposalList } from "./AiSourceProposalList.tsx";
import { formatBytes } from "./screenConstants.ts";

type AiSourceCreationPanelProps = Pick<CreationScreenProps, "decks" | "initialTargetDeckId" | "onDraftStateChange"> & { onRequestSourceCards?: AiSourceCardsRequester };
type SourceCardsRun = { phase: "running"; done: number; total: number | null; cancelling: boolean } | { phase: "done"; result: AiSourceCardsRunResult; notices: string[] };

const learningQuestions = [
  { key: "amount", label: "Kartenmenge", options: AI_SOURCE_AMOUNTS },
  { key: "answerLength", label: "Antwortlänge", options: AI_SOURCE_ANSWER_LENGTHS },
  { key: "language", label: "Sprache", options: AI_SOURCE_LANGUAGES },
  { key: "register", label: "Formulierung", options: AI_SOURCE_REGISTERS },
  { key: "priorKnowledge", label: "Vorwissen", options: AI_SOURCE_PRIOR_KNOWLEDGE },
] as const;
const steps = ["Quelle und Stapel", "Vorgaben", "Karten"];
const STEP_ITEMS = steps.map((label) => ({ label }));
const cardFormIcons = { basic: MessageSquare, cloze: TextCursorInput, "single-choice": CircleDot, "multiple-choice": ListChecks };

export function AiSourceCreationPanel({ decks, initialTargetDeckId, onDraftStateChange, onRequestSourceCards }: AiSourceCreationPanelProps) {
  const [draft, setDraft] = React.useState(() => createAiSourceCreationDraft(initialTargetDeckId));
  const initialDraft = React.useRef(draft);
  const nameEdited = React.useRef(false);
  // The review heading, or the section of the current step, takes the focus after each change of view.
  const focusRef = React.useRef<HTMLElement | null>(null);
  const targetRef = React.useRef<HTMLDivElement | null>(null);
  const [review, setReview] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [run, setRun] = React.useState<SourceCardsRun | null>(null);
  const [runError, setRunError] = React.useState("");
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const runRef = React.useRef<AbortController | null>(null);
  const { settings } = draft;
  const errors = validateAiSourceCreation(draft, decks);
  const valid = !Object.values(errors).some(Boolean);
  const dirty = Boolean(draft.file) || JSON.stringify(draft) !== JSON.stringify(initialDraft.current);
  const targetDeck = decks.find(({ id }) => id === draft.deckId);
  const targetLabel = draft.targetMode === "new"
    ? draft.deckName.trim() ? `${draft.deckName.trim()} (neuer Stapel)` : "Noch kein Stapelname eingegeben"
    : targetDeck ? (targetDeck.hierarchyPath.length ? targetDeck.hierarchyPath : [targetDeck.name]).join(" / ") : "Zielstapel nicht verfügbar";
  const focusDraft = React.useCallback(() => {
    const target = focusRef.current;
    target?.focus({ preventScroll: true });
    (target?.querySelector("h3") ?? target)?.scrollIntoView({ block: "nearest" });
  }, []);

  React.useEffect(() => {
    onDraftStateChange(dirty, focusDraft, false);
    return () => onDraftStateChange(false, null, false);
  }, [dirty, focusDraft, onDraftStateChange]);

  React.useEffect(() => { focusDraft(); }, [review, step, run?.phase, focusDraft]);
  React.useEffect(() => () => runRef.current?.abort(), []);

  React.useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function changeSetting<K extends keyof AiSourceSettings>(key: K, value: AiSourceSettings[K]) {
    setDraft((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  }

  function selectFile(file: File) {
    const error = aiSourceFileError(file);
    setFileError(error);
    if (error) return;
    setDraft((current) => ({ ...current, file, deckName: nameEdited.current ? current.deckName : suggestSourceDeckName(file.name) }));
  }

  function advance() {
    setShowErrors(true);
    if (step === 0 && (errors.source || errors.target)) return;
    setStep((current) => Math.min(current + 1, 2));
    setShowErrors(false);
  }

  async function createCards() {
    if (!onRequestSourceCards || runRef.current) return;
    const controller = new AbortController();
    runRef.current = controller;
    setRunError("");
    setRun({ phase: "running", done: 0, total: null, cancelling: false });
    try {
      const source = await readAiSource(draft);
      if (controller.signal.aborted) { setRun(null); return; }
      const result = await runAiSourceCards({
        units: source.units, settings: draft.settings, request: onRequestSourceCards, signal: controller.signal,
        onProgress: ({ done, total }) => { if (!controller.signal.aborted) setRun({ phase: "running", done, total, cancelling: false }); },
      });
      if (result.proposals.length) { setRun({ phase: "done", result, notices: source.notices }); return; }
      // Without a single proposal there is no list to look at: back to the order, with the reason unless cancelled.
      setRun(null);
      if (result.stopped?.reason !== "cancelled") setRunError(describeAiSourceCardsRun(result).join(" "));
    } catch (error) {
      setRun(null);
      if (!controller.signal.aborted) setRunError(error instanceof Error ? error.message : "Die Karten konnten nicht erstellt werden.");
    } finally {
      runRef.current = null;
    }
  }

  const settingsRows = [
    ...learningQuestions.map(({ key, label, options }) => [label, options.find(({ value }) => value === settings[key])!.label]),
    ["Kartenformate", AI_SOURCE_CARD_FORMS.filter(({ value }) => settings.cardForms.includes(value)).map(({ label }) => label).join(", ")],
    ["Weitere Hinweise", settings.wishes.trim() || "Keine besonderen Wünsche"],
  ];

  return (
    <section className={`core-ai-source grid w-full min-w-0 gap-6 ${review ? "max-w-3xl" : "max-w-7xl"}`} data-testid="ai-source-creation">
      {onRequestSourceCards ? null : <StatusMessage tone="info">Die automatische Erstellung ist noch nicht verfügbar.</StatusMessage>}
      {run?.phase === "running" ? (
        <SoftPanel className="grid min-w-0 gap-4 p-4 sm:p-6" data-testid="ai-source-progress">
          <h3 ref={(element) => { focusRef.current = element; }} tabIndex={-1} className="min-w-0 scroll-mt-24 core-heading-3 text-core-text outline-none">Karten werden erstellt</h3>
          <p className="core-body text-core-text" role="status" aria-live="polite">{run.cancelling ? "Wird abgebrochen …" : run.total === null ? "Quelle wird gelesen …" : `Abschnitt ${Math.min(run.done + 1, run.total).toLocaleString("de-DE")} von ${run.total.toLocaleString("de-DE")}`}</p>
          <div className="h-1.5 overflow-hidden rounded-round bg-core-subtle" role="progressbar" aria-label="Fortschritt der Kartenerstellung" {...run.total === null ? {} : { "aria-valuemin": 0, "aria-valuemax": run.total, "aria-valuenow": run.done }}>
            <div className="h-full rounded-round bg-core-action transition-[width] duration-300 ease-out" style={{ width: `${run.total ? run.done / run.total * 100 : 0}%` }} aria-hidden="true" />
          </div>
          <div><ActionButton type="button" variant="secondary" icon={X} disabled={run.cancelling} onClick={() => { runRef.current?.abort(); setRun((current) => current?.phase === "running" ? { ...current, cancelling: true } : current); }}>Abbrechen</ActionButton></div>
        </SoftPanel>
      ) : run?.phase === "done" ? (
        <AiSourceProposalList result={run.result} notices={run.notices} headingRef={(element) => { focusRef.current = element; }} onDiscard={() => setConfirmDiscard(true)} />
      ) : review ? (
        <SoftPanel className="grid min-w-0 gap-6 p-4 sm:p-6" data-testid="ai-source-summary">
          <h3 ref={(element) => { focusRef.current = element; }} tabIndex={-1} className="min-w-0 scroll-mt-24 core-heading-3 text-core-text outline-none">Auftrag prüfen</h3>
          <p className="core-body-large text-core-text">{describeAiSourceSettings(settings)}</p>
          <dl className="grid min-w-0 overflow-hidden rounded-panel border border-core-border">
            {[
              ["Quelle", draft.sourceMode === "text" ? `Eingefügter Text · ${draft.sourceText.trim().length} Zeichen` : draft.file ? `${draft.file.name} · ${formatBytes(draft.file.size)}` : "Keine Quelle ausgewählt"],
              ["Zielstapel", targetLabel],
              ...settingsRows,
            ].map(([label, value]) => (
              <div key={label} className="grid min-w-0 gap-1 border-b border-core-border px-4 py-3 last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                <dt className="core-body text-core-muted">{label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] core-body font-medium text-core-text">{value}</dd>
              </div>
            ))}
          </dl>
          {draft.sourceMode === "text" ? <Disclosure summary="Quelltext ansehen"><p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] core-body text-core-text">{draft.sourceText.trim()}</p></Disclosure> : null}
          {!valid ? <StatusMessage tone="warning">{Object.values(errors).filter(Boolean).join(" ")}</StatusMessage> : null}
          {runError ? <StatusMessage tone="error" announce="assertive">{runError}</StatusMessage> : null}
          <div className="flex flex-wrap gap-3">
            <ActionButton type="button" variant="secondary" icon={ArrowLeft} onClick={() => { setReview(false); setRunError(""); }}>Einstellungen bearbeiten</ActionButton>
            <ActionButton type="button" variant="primary" icon={Sparkles} disabled={!onRequestSourceCards || !valid} onClick={() => void createCards()}>Karten erstellen</ActionButton>
          </div>
        </SoftPanel>
      ) : (
        <form className="grid min-w-0 gap-6" noValidate onSubmit={(event) => {
          event.preventDefault();
          if (!window.matchMedia("(min-width: 1280px)").matches && step < 2) { advance(); return; }
          setShowErrors(true);
          if (valid) setReview(true);
          else setStep(errors.source || errors.target ? 0 : 2);
        }}>
          <Steps ariaLabel="Schritte der automatischen Erstellung" items={STEP_ITEMS} current={step} className="xl:hidden" />
          <div className="grid min-w-0 gap-4 xl:grid-cols-3 xl:items-start" data-testid="ai-source-steps">
            <section ref={step === 0 ? focusRef : undefined} tabIndex={-1} aria-labelledby="ai-source-step-1" className={`core-ai-source-column min-w-0 scroll-mt-24 content-start outline-none ${step === 0 ? "grid" : "hidden xl:grid"}`}>
              <SectionHeader level={3} id="ai-source-step-1" title={steps[0]} />
              <fieldset className="grid min-w-0 gap-3">
                <legend className="mb-3 core-field-label">Quelle</legend>
                <CoreSegmentedControl ariaLabel="Art der Quelle" className="w-full" value={draft.sourceMode} options={[{ value: "file", label: "Datei" }, { value: "text", label: "Text einfügen" }]} onValueChange={(value) => { setFileError(null); setDraft((current) => ({ ...current, sourceMode: value as "file" | "text" })); }} />
                {draft.sourceMode === "file" ? <>
                  <FileDropField accept={AI_SOURCE_ACCEPT} ariaLabel="Quelle für automatische Karten auswählen oder ablegen" prompt={`Quelldatei hier ablegen (${AI_SOURCE_FORMAT_LABEL})`} actionLabel={draft.file ? "Ersetzen" : "Datei auswählen"} onFile={selectFile}>
                    {draft.file ? (
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText size={22} className="shrink-0 text-core-action" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="[overflow-wrap:anywhere] core-body font-semibold text-core-text" data-testid="ai-source-file-name">{draft.file.name}</p>
                          <p className="core-caption text-core-muted">{formatBytes(draft.file.size)}</p>
                        </div>
                        <IconButton type="button" label="Datei entfernen" variant="ghost" icon={X} onClick={() => {
                          setDraft((current) => ({ ...current, file: null, deckName: nameEdited.current ? current.deckName : "" }));
                          setFileError(null);
                        }} />
                      </div>
                    ) : null}
                  </FileDropField>
                  <p className="core-field-hint">Deine Datei bleibt vorerst nur in diesem Browser.</p>
                </> : <label className="core-field-group min-w-0"><span className="core-field-label">Dein Quelltext</span><textarea className="core-field min-h-40 w-full resize-y" rows={7} value={draft.sourceText} aria-invalid={showErrors && Boolean(errors.source)} onChange={(event) => setDraft((current) => ({ ...current, sourceText: event.target.value }))} placeholder="Füge hier den Text ein, aus dem deine Karten entstehen sollen." /></label>}
                {fileError || (showErrors && errors.source) ? <p className="core-field-error" role="alert">{fileError || errors.source}</p> : null}
              </fieldset>
              <div ref={targetRef} className="grid min-w-0 scroll-mt-24 gap-3">
                <CoreSwitch label="Neuen Stapel anlegen" checked={draft.targetMode === "new"} onCheckedChange={(createDeck) => setDraft((current) => ({ ...current, targetMode: createDeck ? "new" : "existing" }))} />
                {draft.targetMode === "new" ? (
                  <label className="core-field-group min-w-0">
                    <span className="core-field-label">Stapelname</span>
                    <input className="core-field w-full" value={draft.deckName} aria-invalid={showErrors && Boolean(errors.target)} onChange={(event) => {
                      nameEdited.current = true;
                      setDraft((current) => ({ ...current, deckName: event.target.value }));
                    }} />
                  </label>
                ) : decks.length ? (
                  <div className="core-field-group min-w-0">
                    <label className="core-field-label" htmlFor="ai-source-deck">Stapel</label>
                    <DeckSelect id="ai-source-deck" ariaLabel="Stapel" value={draft.deckId} decks={decks} specialOption={{ value: "", label: "Stapel auswählen", icon: FileText }} onValueChange={(deckId) => setDraft((current) => ({ ...current, deckId }))} />
                  </div>
                ) : <p className="core-field-hint">Du hast noch keine Stapel. Lege einen neuen an.</p>}
                {(showErrors || draft.targetMode === "existing") && errors.target ? <p className="core-field-error" role="alert">{errors.target}</p> : null}
              </div>
            </section>
            <section ref={step === 1 ? focusRef : undefined} tabIndex={-1} aria-labelledby="ai-source-step-2" className={`core-ai-source-column min-w-0 scroll-mt-24 content-start outline-none ${step === 1 ? "grid" : "hidden xl:grid"}`}>
              <SectionHeader level={3} id="ai-source-step-2" title={steps[1]} />
              {learningQuestions.map(({ key, label, options }) => <div key={key} className="core-field-group min-w-0">
                <label className="core-field-label" htmlFor={`ai-source-${key}`}>{label}</label>
                <CoreSelect id={`ai-source-${key}`} ariaLabel={label} value={settings[key]} options={options} onValueChange={(value) => changeSetting(key, value as AiSourceSettings[typeof key])} />
              </div>)}
              <label className="core-field-group min-w-0">
                <span className="core-field-label">Weitere Hinweise <span className="font-normal text-core-muted">(optional)</span></span>
                <textarea className="core-field min-h-20 w-full resize-y" rows={2} maxLength={MAX_AI_SOURCE_WISHES_CHARS} value={settings.wishes} onChange={(event) => changeSetting("wishes", event.target.value)} placeholder="Zum Beispiel: Zellatmung vertiefen, Abkürzungen erklären …" />
              </label>
            </section>
            <section ref={step === 2 ? focusRef : undefined} tabIndex={-1} aria-labelledby="ai-source-step-3" className={`core-ai-source-column min-w-0 scroll-mt-24 content-start outline-none ${step === 2 ? "grid" : "hidden xl:grid"}`}>
              <SectionHeader level={3} id="ai-source-step-3" title={steps[2]} />
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-3 core-field-label">Kartenformate</legend>
                <div className="core-ai-source-formats">
                  {AI_SOURCE_CARD_FORMS.map(({ value, label }) => {
                    const Icon = cardFormIcons[value];
                    return <label key={value} className="core-ai-source-format">
                      <Icon size={16} aria-hidden="true" />
                      <span className="core-ai-source-format-label">{label}</span>
                      <CoreCheckbox checked={settings.cardForms.includes(value)} onCheckedChange={(checked) => {
                        const selected = checked ? [...settings.cardForms, value] : settings.cardForms.filter((form) => form !== value);
                        changeSetting("cardForms", AI_SOURCE_CARD_FORMS.filter((form) => selected.includes(form.value)).map((form) => form.value));
                      }} />
                    </label>;
                  })}
                </div>
                {errors.cardForms ? <p className="core-field-error" role="alert">{errors.cardForms}</p> : null}
              </fieldset>
              <div className="grid min-w-0 gap-3">
                <p className="core-field-label">Zielstapel</p>
                <div className="core-ai-source-target"><Layers3 size={19} className="shrink-0 text-core-action" aria-hidden="true" /><p className="min-w-0 flex-1 [overflow-wrap:anywhere] core-body text-core-text" data-testid="ai-source-target">{targetLabel}</p><IconButton type="button" label="Stapel ändern" variant="ghost" icon={Pencil} onClick={() => { setStep(0); requestAnimationFrame(() => { targetRef.current?.querySelector("input")?.focus(); targetRef.current?.scrollIntoView({ block: "nearest" }); }); }} /></div>
              </div>
            </section>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            {step > 0 ? <ActionButton type="button" variant="secondary" icon={ArrowLeft} className="xl:hidden" onClick={() => setStep((current) => current - 1)}>Zurück</ActionButton> : null}
            {step < 2 ? <ActionButton type="button" variant="primary" icon={ArrowRight} className="xl:hidden" onClick={advance}>Weiter</ActionButton> : null}
            <ActionButton className={`w-full sm:w-fit ${step === 2 ? "" : "hidden xl:inline-flex"}`} type="submit" variant="primary" icon={ArrowRight}>Auftrag prüfen</ActionButton>
          </div>
        </form>
      )}
      <ActionDialog
        open={confirmDiscard}
        destructive
        title="Vorschläge verwerfen?"
        description="Die Vorschläge wurden nicht gespeichert und gehen verloren. Der Auftrag bleibt erhalten."
        confirmLabel="Verwerfen"
        cancelLabel="Behalten"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); setRun(null); }}
      />
    </section>
  );
}
