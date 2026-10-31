import React from "react";
import { ArrowLeft, ArrowRight, CircleDot, FileText, FileUp, Info, Layers3, ListChecks, MessageSquare, Pencil, SlidersHorizontal, Sparkles, TextCursorInput, X } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import {
  AI_SOURCE_ANSWER_LENGTHS, AI_SOURCE_CARD_FORMS, AI_SOURCE_COVERAGE, AI_SOURCE_LANGUAGES, AI_SOURCE_PRIOR_KNOWLEDGE, AI_SOURCE_REGISTERS,
  aiSourceFileError, createAiSourceCreationDraft, describeAiSourceSettings, suggestSourceDeckName, validateAiSourceCreation,
  type AiSourceSettings,
} from "../aiSourceCreation.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { FileDropField } from "../ui/FileDropField.tsx";
import { CoreSelect, DeckSelect } from "../ui/selectUi.tsx";
import { formatBytes } from "./screenConstants.ts";

type AiSourceCreationPanelProps = Pick<CreationScreenProps, "decks" | "initialTargetDeckId" | "onDraftStateChange">;

const learningQuestions = [
  { key: "coverage", label: "Wie ausführlich soll der Stoff abgedeckt werden?", options: AI_SOURCE_COVERAGE },
  { key: "answerLength", label: "Wie ausführlich sollen die Antworten sein?", options: AI_SOURCE_ANSWER_LENGTHS },
  { key: "language", label: "In welcher Sprache sollen die Karten sein?", options: AI_SOURCE_LANGUAGES },
  { key: "register", label: "Wie sollen die Karten formuliert sein?", options: AI_SOURCE_REGISTERS },
  { key: "priorKnowledge", label: "Wie gut kennst du das Thema bereits?", options: AI_SOURCE_PRIOR_KNOWLEDGE },
] as const;
const steps = ["Quelle & Stapel", "Deine Lernwünsche", "Deine Karten"];
const cardFormIcons = { basic: MessageSquare, cloze: TextCursorInput, "single-choice": CircleDot, "multiple-choice": ListChecks };
const extraInformationQuestion = "Dürfen Informationen ergänzt werden, die in deiner Quelle fehlen?";

export function AiSourceCreationPanel({ decks, initialTargetDeckId, onDraftStateChange }: AiSourceCreationPanelProps) {
  const [draft, setDraft] = React.useState(() => createAiSourceCreationDraft(initialTargetDeckId));
  const initialDraft = React.useRef(draft);
  const nameEdited = React.useRef(false);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const targetHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const [review, setReview] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const { settings } = draft;
  const errors = validateAiSourceCreation(draft, decks);
  const valid = !Object.values(errors).some(Boolean);
  const dirty = Boolean(draft.file) || JSON.stringify(draft) !== JSON.stringify(initialDraft.current);
  const targetDeck = decks.find(({ id }) => id === draft.deckId);
  const targetLabel = draft.targetMode === "new"
    ? draft.deckName.trim() ? `${draft.deckName.trim()} (neuer Stapel)` : "Noch kein Stapelname eingegeben"
    : targetDeck ? (targetDeck.hierarchyPath.length ? targetDeck.hierarchyPath : [targetDeck.name]).join(" / ") : "Zielstapel nicht verfügbar";
  const focusDraft = React.useCallback(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  React.useEffect(() => {
    onDraftStateChange(dirty, focusDraft, false);
    return () => onDraftStateChange(false, null, false);
  }, [dirty, focusDraft, onDraftStateChange]);

  React.useEffect(() => { focusDraft(); }, [review, step, focusDraft]);

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

  const settingsRows = [
    ...learningQuestions.map(({ key, label, options }) => [label, options.find(({ value }) => value === settings[key])!.label]),
    ["Welche Kartenformate möchtest du?", AI_SOURCE_CARD_FORMS.filter(({ value }) => settings.cardForms.includes(value)).map(({ label }) => label).join(", ")],
    ["Was sollen wir außerdem beachten?", settings.wishes.trim() || "Keine besonderen Wünsche"],
    [extraInformationQuestion, settings.allowExtraInformation ? "Ergänzungen erlauben und kennzeichnen" : "Nur meine Quelle verwenden"],
  ];

  return (
    <section className={`core-ai-source mx-auto grid w-full min-w-0 gap-6 ${review ? "max-w-3xl" : "max-w-7xl"}`} data-testid="ai-source-creation">
      <header className="core-ai-source-intro">
        <div className="grid min-w-0 gap-3">
          <p className="flex items-center gap-2 core-caption font-semibold text-core-secondary"><Sparkles size={16} aria-hidden="true" /> Automatische Kartenerstellung</p>
          <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-24 core-heading-1 text-core-text outline-none">
            {review ? "Auftrag prüfen" : "Dein Stoff. Deine Lernkarten."}
          </h2>
          {!review ? <p className="core-body text-core-muted">Du bringst den Stoff mit. Wir bereiten ihn so vor, wie du lernen möchtest.</p> : null}
          <p className="flex items-start gap-2 core-caption text-core-muted"><Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Die automatische Erstellung ist noch nicht verfügbar.</span></p>
        </div>
        {!review ? <div className="core-ai-source-illustration" aria-hidden="true"><span /><span /><span><Sparkles size={24} /><i /><i /></span></div> : null}
      </header>
      {review ? (
        <SoftPanel className="grid min-w-0 gap-6 p-4 sm:p-6" data-testid="ai-source-summary">
          <p className="core-body-large text-core-text">{describeAiSourceSettings(settings)}</p>
          <dl className="grid min-w-0 gap-4">
            {[
              ["Woraus sollen die Karten entstehen?", draft.sourceMode === "text" ? `Eingefügter Text · ${draft.sourceText.trim().length} Zeichen` : draft.file ? `${draft.file.name} · ${formatBytes(draft.file.size)}` : "Keine Quelle ausgewählt"],
              ["In welchem Stapel werden die Karten gespeichert?", targetLabel],
              ...settingsRows,
            ].map(([label, value]) => (
              <div key={label} className="grid min-w-0 gap-1 sm:grid-cols-2 sm:gap-4">
                <dt className="core-body font-semibold text-core-secondary">{label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] core-body text-core-text">{value}</dd>
              </div>
            ))}
          </dl>
          {draft.sourceMode === "text" ? <details className="min-w-0"><summary className="min-h-control cursor-pointer core-body text-core-action">Quelltext ansehen</summary><p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] core-body text-core-text">{draft.sourceText.trim()}</p></details> : null}
          {!valid ? <StatusMessage tone="warning">{Object.values(errors).filter(Boolean).join(" ")}</StatusMessage> : null}
          <div className="flex flex-wrap gap-3">
            <ActionButton type="button" variant="secondary" icon={ArrowLeft} onClick={() => setReview(false)}>Einstellungen bearbeiten</ActionButton>
            <ActionButton type="button" variant="primary" icon={Sparkles} disabled>Karten erstellen</ActionButton>
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
          <div className="flex items-center justify-between gap-4 xl:hidden"><p className="core-caption text-core-muted" aria-live="polite">Schritt {step + 1} von 3</p><div className="core-ai-source-progress" aria-hidden="true">{steps.map((label, index) => <span key={label} data-complete={index <= step} />)}</div></div>
          <div className="grid min-w-0 gap-4 xl:grid-cols-3 xl:items-start" data-testid="ai-source-steps">
            <section aria-labelledby="ai-source-step-1" data-tone="source" data-file-selected={Boolean(draft.file)} className={`core-ai-source-column min-w-0 content-start gap-6 ${step === 0 ? "grid" : "hidden xl:grid"}`}>
              <div className="core-ai-source-section-heading"><span className="core-ai-source-section-icon" aria-hidden="true"><FileUp size={21} /></span><div><p className="core-caption text-core-muted" aria-hidden="true">Schritt 01</p><h3 id="ai-source-step-1" className="core-heading-3 text-core-text">{steps[0]}</h3></div></div>
              <fieldset className="grid min-w-0 gap-3">
                <legend className="mb-3 core-field-label">Woraus sollen die Karten entstehen?</legend>
                <CoreSegmentedControl ariaLabel="Art der Quelle" className="w-full" value={draft.sourceMode} options={[{ value: "file", label: "Datei" }, { value: "text", label: "Text einfügen" }]} onValueChange={(value) => { setFileError(null); setDraft((current) => ({ ...current, sourceMode: value as "file" | "text" })); }} />
                {draft.sourceMode === "file" ? <>
                  <FileDropField kind="ai-source" label="" selected={Boolean(draft.file)} onFile={selectFile}>
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
              <div className="grid min-w-0 gap-3">
                <h4 ref={targetHeadingRef} tabIndex={-1} className="scroll-mt-24 core-field-label outline-none">Möchtest du einen neuen Stapel anlegen?</h4>
                <CoreSegmentedControl ariaLabel="Möchtest du einen neuen Stapel anlegen?" className="w-full" value={draft.targetMode} options={[
                  { value: "new", label: "Ja" }, { value: "existing", label: "Nein" },
                ]} onValueChange={(value) => setDraft((current) => ({ ...current, targetMode: value as "new" | "existing" }))} />
                {draft.targetMode === "new" ? (
                  <label className="core-field-group min-w-0">
                    <span className="core-field-label">Wie soll der neue Stapel heißen?</span>
                    <input className="core-field w-full" value={draft.deckName} aria-invalid={showErrors && Boolean(errors.target)} onChange={(event) => {
                      nameEdited.current = true;
                      setDraft((current) => ({ ...current, deckName: event.target.value }));
                    }} />
                  </label>
                ) : decks.length ? (
                  <div className="core-field-group min-w-0">
                    <label className="core-field-label" htmlFor="ai-source-deck">Welchen vorhandenen Stapel möchtest du verwenden?</label>
                    <DeckSelect id="ai-source-deck" ariaLabel="Welchen vorhandenen Stapel möchtest du verwenden?" value={draft.deckId} decks={decks} specialOption={{ value: "", label: "Stapel auswählen", icon: FileText }} onValueChange={(deckId) => setDraft((current) => ({ ...current, deckId }))} />
                  </div>
                ) : <p className="core-field-hint">Du hast noch keine Stapel. Wähle „Ja“, um einen neuen anzulegen.</p>}
                {(showErrors || draft.targetMode === "existing") && errors.target ? <p className="core-field-error" role="alert">{errors.target}</p> : null}
              </div>
            </section>
            <section aria-labelledby="ai-source-step-2" data-tone="wishes" className={`core-ai-source-column min-w-0 content-start gap-6 ${step === 1 ? "grid" : "hidden xl:grid"}`}>
              <div className="core-ai-source-section-heading"><span className="core-ai-source-section-icon" aria-hidden="true"><SlidersHorizontal size={21} /></span><div><p className="core-caption text-core-muted" aria-hidden="true">Schritt 02</p><h3 id="ai-source-step-2" className="core-heading-3 text-core-text">{steps[1]}</h3></div></div>
              {learningQuestions.map(({ key, label, options }) => <div key={key} className="core-field-group min-w-0">
                <label className="core-field-label" htmlFor={`ai-source-${key}`}>{label}</label>
                <CoreSelect id={`ai-source-${key}`} ariaLabel={label} value={settings[key]} options={options} onValueChange={(value) => changeSetting(key, value as AiSourceSettings[typeof key])} />
                {key === "answerLength" ? <p className="core-field-hint">Kurze Antworten, Erklärungen separat. Mehr Stoff ergibt bei Bedarf mehr Karten.</p> : null}
              </div>)}
              <label className="core-field-group min-w-0">
                <span className="core-field-label">Was sollen wir außerdem beachten? <span className="font-normal text-core-muted">(optional)</span></span>
                <textarea className="core-field min-h-20 w-full resize-y" rows={2} value={settings.wishes} onChange={(event) => changeSetting("wishes", event.target.value)} placeholder="Zum Beispiel: Zellatmung vertiefen, Abkürzungen erklären …" />
              </label>
            </section>
            <section aria-labelledby="ai-source-step-3" data-tone="cards" className={`core-ai-source-column min-w-0 content-start gap-6 ${step === 2 ? "grid" : "hidden xl:grid"}`}>
              <div className="core-ai-source-section-heading"><span className="core-ai-source-section-icon" aria-hidden="true"><Layers3 size={21} /></span><div><p className="core-caption text-core-muted" aria-hidden="true">Schritt 03</p><h3 id="ai-source-step-3" className="core-heading-3 text-core-text">{steps[2]}</h3></div></div>
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-3 core-field-label">Welche Kartenformate möchtest du?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {AI_SOURCE_CARD_FORMS.map(({ value, label }) => {
                    const Icon = cardFormIcons[value];
                    return <label key={value} className="core-ai-source-format core-body text-core-text">
                      <Icon size={20} className="text-core-action" aria-hidden="true" />
                      <input type="checkbox" className="size-5 shrink-0 accent-core-action" checked={settings.cardForms.includes(value)} onChange={(event) => {
                        const selected = event.target.checked ? [...settings.cardForms, value] : settings.cardForms.filter((form) => form !== value);
                        changeSetting("cardForms", AI_SOURCE_CARD_FORMS.filter((form) => selected.includes(form.value)).map((form) => form.value));
                      }} />
                      <span className="col-span-2 core-caption font-semibold">{label}</span>
                    </label>;
                  })}
                </div>
                <p className="core-field-hint">Mehrfachauswahl möglich. Die KI wählt passende Formate daraus.</p>
                {errors.cardForms ? <p className="core-field-error" role="alert">{errors.cardForms}</p> : null}
              </fieldset>
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-3 core-field-label">{extraInformationQuestion}</legend>
                {[
                  { value: false, label: "Nur meine Quelle verwenden" },
                  { value: true, label: "Ergänzungen erlauben und kennzeichnen" },
                ].map(({ value, label }) => <label key={String(value)} className="core-ai-source-radio flex min-h-control cursor-pointer items-start gap-3 py-2 core-body text-core-text"><input type="radio" name="ai-source-extra-information" className="mt-0.5 size-5 shrink-0 accent-core-action" checked={settings.allowExtraInformation === value} onChange={() => changeSetting("allowExtraInformation", value)} /><span>{label}</span></label>)}
                <p className="core-field-hint">Ergänzungen schließen fachliche Lücken und werden deutlich gekennzeichnet.</p>
              </fieldset>
              <div className="grid min-w-0 gap-3">
                <p className="core-field-label">In welchem Stapel werden die Karten gespeichert?</p>
                <div className="core-ai-source-target"><Layers3 size={19} className="shrink-0 text-core-action" aria-hidden="true" /><p className="min-w-0 flex-1 [overflow-wrap:anywhere] core-body text-core-text" data-testid="ai-source-target">{targetLabel}</p><IconButton type="button" label="Stapel ändern" variant="ghost" icon={Pencil} onClick={() => { setStep(0); requestAnimationFrame(() => { targetHeadingRef.current?.focus(); targetHeadingRef.current?.scrollIntoView({ block: "nearest" }); }); }} /></div>
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
    </section>
  );
}
