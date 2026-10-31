import React from "react";
import { ArrowLeft, ArrowRight, ChevronDown, FileText, Sparkles, X } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import {
  AI_SOURCE_ANSWER_LENGTHS, AI_SOURCE_CARD_FORMS, AI_SOURCE_COVERAGE, AI_SOURCE_GOALS, AI_SOURCE_PRIOR_KNOWLEDGE,
  aiSourceFileError, createAiSourceCreationDraft, describeAiSourceSettings, suggestSourceDeckName, validateAiSourceCreation,
  type AiSourceSettings,
} from "../aiSourceCreation.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl, OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { FileDropField } from "../ui/FileDropField.tsx";
import { CoreSelect, DeckSelect } from "../ui/selectUi.tsx";
import { formatBytes } from "./screenConstants.ts";

type AiSourceCreationPanelProps = Pick<CreationScreenProps, "decks" | "initialTargetDeckId" | "onDraftStateChange">;

export function AiSourceCreationPanel({ decks, initialTargetDeckId, onDraftStateChange }: AiSourceCreationPanelProps) {
  const [draft, setDraft] = React.useState(() => createAiSourceCreationDraft(initialTargetDeckId));
  const initialDraft = React.useRef(draft);
  const nameEdited = React.useRef(false);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const [review, setReview] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const { settings } = draft;
  const errors = validateAiSourceCreation(draft, decks);
  const valid = !Object.values(errors).some(Boolean);
  const dirty = Boolean(draft.file) || JSON.stringify(draft) !== JSON.stringify(initialDraft.current);
  const targetDeck = decks.find(({ id }) => id === draft.deckId);
  const targetLabel = draft.targetMode === "new"
    ? `${draft.deckName.trim()} (neuer Stapel)`
    : targetDeck ? (targetDeck.hierarchyPath.length ? targetDeck.hierarchyPath : [targetDeck.name]).join(" / ") : "Zielstapel nicht verfügbar";
  const focusDraft = React.useCallback(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  React.useEffect(() => {
    onDraftStateChange(dirty, focusDraft, false);
    return () => onDraftStateChange(false, null, false);
  }, [dirty, focusDraft, onDraftStateChange]);

  React.useEffect(() => { focusDraft(); }, [review, focusDraft]);

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

  const settingsRows = [
    ["Lernziel", AI_SOURCE_GOALS.find(({ value }) => value === settings.goal)!.label],
    ["Stoffabdeckung", AI_SOURCE_COVERAGE.find(({ value }) => value === settings.coverage)!.label],
    ["Antwortumfang", AI_SOURCE_ANSWER_LENGTHS.find(({ value }) => value === settings.answerLength)!.label],
    ["Kartenformen", AI_SOURCE_CARD_FORMS.filter(({ value }) => settings.cardForms.includes(value)).map(({ label }) => label).join(", ")],
    ["Vorwissen", AI_SOURCE_PRIOR_KNOWLEDGE.find(({ value }) => value === settings.priorKnowledge)!.label],
    ["Lernkontext und Wünsche", settings.wishes.trim() || "Keine besonderen Wünsche"],
    ["Zusätzliche Erklärungen", settings.allowExtraExplanations ? "Erlaubt, außerhalb der Quelle gesondert gekennzeichnet" : "Nur Erklärungen aus der Quelle"],
  ];

  return (
    <SoftPanel className="mx-auto grid w-full min-w-0 max-w-3xl gap-6 p-6" data-testid="ai-source-creation">
      <div className="flex min-w-0 items-center gap-3">
        <OrbIcon icon={Sparkles} />
        <h2 ref={headingRef} tabIndex={-1} className="min-w-0 scroll-mt-24 core-heading-2 text-core-text outline-none">
          {review ? "Auftrag prüfen" : "Karten automatisch erstellen lassen"}
        </h2>
      </div>
      <StatusMessage tone="info">Die automatische Erstellung ist noch nicht verfügbar.</StatusMessage>
      {review ? (
        <div className="grid min-w-0 gap-6" data-testid="ai-source-summary">
          <p className="core-body-large text-core-text">{describeAiSourceSettings(settings)}</p>
          <dl className="grid min-w-0 overflow-hidden rounded-panel border border-core-border">
            {[
              ["Quelle", draft.file ? `${draft.file.name} · ${formatBytes(draft.file.size)}` : "Keine Quelle ausgewählt"],
              ["Zielstapel", targetLabel],
              ...settingsRows,
            ].map(([label, value]) => (
              <div key={label} className="grid min-w-0 gap-1 border-b border-core-border px-4 py-3 last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                <dt className="core-body text-core-muted">{label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] core-body font-medium text-core-text">{value}</dd>
              </div>
            ))}
          </dl>
          {!valid ? <StatusMessage tone="warning">{Object.values(errors).filter(Boolean).join(" ")}</StatusMessage> : null}
          <div className="flex flex-wrap gap-3">
            <ActionButton type="button" variant="secondary" icon={ArrowLeft} onClick={() => setReview(false)}>Einstellungen bearbeiten</ActionButton>
            <ActionButton type="button" variant="primary" icon={Sparkles} disabled>Karten erstellen</ActionButton>
          </div>
        </div>
      ) : (
        <form className="grid min-w-0 gap-6" noValidate onSubmit={(event) => {
          event.preventDefault();
          setShowErrors(true);
          if (valid) setReview(true);
        }}>
          <div className="grid min-w-0 gap-2">
            <FileDropField kind="ai-source" selected={Boolean(draft.file)} onFile={selectFile}>
              {draft.file ? (
                <div className="flex min-w-0 items-center gap-3 rounded-control border border-core-border bg-core-surface py-2 pl-3 pr-2 shadow-soft">
                  <div className="min-w-0 flex-1">
                    <p className="[overflow-wrap:anywhere] core-body font-semibold text-core-text" data-testid="ai-source-file-name">{draft.file.name}</p>
                    <p className="core-caption text-core-muted">{formatBytes(draft.file.size)}</p>
                  </div>
                  <IconButton label="Datei entfernen" icon={X} onClick={() => {
                    setDraft((current) => ({ ...current, file: null, deckName: nameEdited.current ? current.deckName : "" }));
                    setFileError(null);
                  }} />
                </div>
              ) : null}
            </FileDropField>
            {fileError || (showErrors && errors.file) ? <p className="core-field-error" role="alert">{fileError || errors.file}</p> : null}
            <p className="core-field-hint">Die Datei bleibt vorerst in diesem Browser und wird noch nicht ausgelesen oder hochgeladen.</p>
          </div>

          <div className="grid min-w-0 gap-4">
            <h3 className="core-heading-3 text-core-text">Deine Lernwünsche</h3>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="core-field-group min-w-0">
                <label className="core-field-label" htmlFor="ai-source-goal">Lernziel</label>
                <CoreSelect id="ai-source-goal" ariaLabel="Lernziel" value={settings.goal} options={AI_SOURCE_GOALS} onValueChange={(value) => changeSetting("goal", value as AiSourceSettings["goal"])} />
              </div>
              <div className="core-field-group min-w-0">
                <label className="core-field-label" htmlFor="ai-source-coverage">Stoffabdeckung</label>
                <CoreSelect id="ai-source-coverage" ariaLabel="Stoffabdeckung" value={settings.coverage} options={AI_SOURCE_COVERAGE} onValueChange={(value) => changeSetting("coverage", value as AiSourceSettings["coverage"])} />
              </div>
              <div className="core-field-group min-w-0 sm:col-span-2">
                <label className="core-field-label" htmlFor="ai-source-answer-length">Antwortumfang</label>
                <CoreSelect id="ai-source-answer-length" ariaLabel="Antwortumfang" value={settings.answerLength} options={AI_SOURCE_ANSWER_LENGTHS} onValueChange={(value) => changeSetting("answerLength", value as AiSourceSettings["answerLength"])} />
                <p className="core-field-hint">Mehr Stoff bedeutet mehr gezielte Karten. Die erwartete Antwort bleibt kurz; Erklärungen stehen getrennt darunter.</p>
              </div>
            </div>
            <fieldset className="grid min-w-0 gap-2">
              <legend className="mb-2 core-field-label">Erlaubte Kartenformen</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {AI_SOURCE_CARD_FORMS.map(({ value, label }) => (
                  <label key={value} className="core-ai-card-form flex min-h-control cursor-pointer items-center gap-3 rounded-control border border-core-border bg-core-surface px-3 py-2 core-body font-medium text-core-text shadow-soft">
                    <input type="checkbox" className="size-5 shrink-0 accent-core-action" checked={settings.cardForms.includes(value)} onChange={(event) => {
                      const selected = event.target.checked ? [...settings.cardForms, value] : settings.cardForms.filter((form) => form !== value);
                      changeSetting("cardForms", AI_SOURCE_CARD_FORMS.filter((form) => selected.includes(form.value)).map((form) => form.value));
                    }} />
                    {label}
                  </label>
                ))}
              </div>
              <p className="core-field-hint">Die KI wählt später passende Formen aus deiner Auswahl.</p>
              {errors.cardForms ? <p className="core-field-error" role="alert">{errors.cardForms}</p> : null}
            </fieldset>
          </div>

          <details className="group min-w-0 overflow-hidden rounded-panel border border-core-border bg-core-surface shadow-soft">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 core-body font-semibold text-core-text hover:bg-core-subtle [&::-webkit-details-marker]:hidden">
              Weitere Einstellungen <ChevronDown size={16} className="shrink-0 text-core-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="grid min-w-0 gap-4 border-t border-core-border p-4">
              <div className="core-field-group min-w-0">
                <label className="core-field-label" htmlFor="ai-source-knowledge">Vorwissen</label>
                <CoreSelect id="ai-source-knowledge" ariaLabel="Vorwissen" value={settings.priorKnowledge} options={AI_SOURCE_PRIOR_KNOWLEDGE} onValueChange={(value) => changeSetting("priorKnowledge", value as AiSourceSettings["priorKnowledge"])} />
              </div>
              <label className="core-field-group min-w-0">
                <span className="core-field-label">Lernkontext und Wünsche <span className="font-normal text-core-muted">(optional)</span></span>
                <textarea className="core-field min-h-24 w-full resize-y" rows={3} value={settings.wishes} onChange={(event) => changeSetting("wishes", event.target.value)} placeholder="Biologie-Abitur; Schwerpunkt Zellatmung; historische Entdeckungen weglassen" />
              </label>
              <label className="flex min-h-control cursor-pointer items-start gap-3 py-2 core-body text-core-text">
                <input type="checkbox" aria-label="Zusätzliche Erklärungen erlauben" className="mt-0.5 size-5 shrink-0 accent-core-action" checked={settings.allowExtraExplanations} onChange={(event) => changeSetting("allowExtraExplanations", event.target.checked)} />
                <span>Zusätzliche Erklärungen erlauben<span className="mt-1 block core-field-hint">Ergänzungen außerhalb deiner Quelle werden gesondert gekennzeichnet.</span></span>
              </label>
            </div>
          </details>

          <div className="grid min-w-0 gap-3">
            <h3 className="core-heading-3 text-core-text">Zielstapel</h3>
            <CoreSegmentedControl ariaLabel="Zielstapel" className="w-full sm:w-fit" value={draft.targetMode} options={[
              { value: "new", label: "Neuer Stapel" }, { value: "existing", label: "Vorhandener Stapel" },
            ]} onValueChange={(value) => setDraft((current) => ({ ...current, targetMode: value as "new" | "existing" }))} />
            {draft.targetMode === "new" ? (
              <label className="core-field-group min-w-0">
                <span className="core-field-label">Name des neuen Stapels</span>
                <input className="core-field w-full" value={draft.deckName} aria-invalid={showErrors && Boolean(errors.target)} onChange={(event) => {
                  nameEdited.current = true;
                  setDraft((current) => ({ ...current, deckName: event.target.value }));
                }} />
              </label>
            ) : decks.length ? (
              <div className="core-field-group min-w-0">
                <label className="core-field-label" htmlFor="ai-source-deck">Kartenstapel</label>
                <DeckSelect id="ai-source-deck" ariaLabel="Kartenstapel" value={draft.deckId} decks={decks} specialOption={{ value: "", label: "Stapel auswählen", icon: FileText }} onValueChange={(deckId) => setDraft((current) => ({ ...current, deckId }))} />
              </div>
            ) : <p className="core-field-hint">Du hast noch keine Stapel. Wähle „Neuer Stapel“.</p>}
            {(showErrors || draft.targetMode === "existing") && errors.target ? <p className="core-field-error" role="alert">{errors.target}</p> : null}
          </div>
          <ActionButton className="w-full sm:w-fit" type="submit" variant="primary" icon={ArrowRight}>Auftrag prüfen</ActionButton>
        </form>
      )}
    </SoftPanel>
  );
}
