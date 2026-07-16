import React from "react";
import { Check, ChevronRight, Copy, FolderPlus, Layers, MoveRight, Network, Pencil, Play, PlusSquare, RotateCcw, Save, Search, Share2, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { getCardEditorValue, getOriginalVariant, getVariantAnchor, validateCardEditorValue } from "../coreModel.ts";
import { buildCardVariationPrompt, createVariantReviewModel } from "../coreVariantService.ts";
import { stripHtml } from "../htmlSafety.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.tsx";
import { ActionDialog, CoreModeControl, EmptyState, LabsNotice, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { cardTypeOptions, formatLevelList, getStateValue, maturityStageLabels } from "./screenConstants.ts";
import type { CardEditorField, CardEditorFieldErrors, CardEditorValue, CardType, CardVariant, CoreMode, Deck, LearningItem, MaturityBand } from "../coreTypes.ts";
import type { ProductSurface } from "../productSurfaces.ts";

function FieldError({ errors, field }: { errors: CardEditorFieldErrors; field: CardEditorField }) {
  const message = errors[field];
  return message ? <p className="text-sm font-medium text-red-700" role="alert">{message}</p> : null;
}

function versionContent(value: unknown, fallback: LearningItem) {
  const snapshot = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    front: typeof snapshot.originalFront === "string" ? snapshot.originalFront : fallback.originalFront,
    back: typeof snapshot.originalBack === "string" ? snapshot.originalBack : fallback.originalBack,
    tags: Array.isArray(snapshot.originalTags) ? snapshot.originalTags.map(String) : fallback.originalTags,
    kind: typeof snapshot.kind === "string" ? snapshot.kind : fallback.kind,
  };
}

function DeckCardEditor({ deck, cards = [], selectedCardId, mediaUrls = {}, onSaveCard, onDeleteCard, onRestoreCard, onAddVariant, onApplyVariantJson, showExternalVariantFlow = false, externalVariantSurface }: any) {
  const card = cards.find((item: any) => item.id === selectedCardId) ?? null;
  const [form, setForm] = React.useState<CardEditorValue | null>(() => card ? getCardEditorValue(card) : null);
  const [fieldErrors, setFieldErrors] = React.useState<CardEditorFieldErrors>({});
  const [saveStatus, setSaveStatus] = React.useState("");
  const [saveError, setSaveError] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [variantForm, setVariantForm] = React.useState({ front: "", back: "", variantLevel: 2 });
  const [showPrompt, setShowPrompt] = React.useState(false);
  const [jsonResponse, setJsonResponse] = React.useState("");
  const [variantStatus, setVariantStatus] = React.useState("");
  const [restoreVersionId, setRestoreVersionId] = React.useState("");
  const [confirmRestore, setConfirmRestore] = React.useState(false);
  const [restoreStatus, setRestoreStatus] = React.useState("");
  const restoreSelectRef = React.useRef<HTMLSelectElement | null>(null);
  const restoreConfirmRef = React.useRef<HTMLButtonElement | null>(null);
  const restoreActionRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    setForm(card ? getCardEditorValue(card) : null);
    setFieldErrors({});
    setSaveError(false);
    setVariantForm({ front: "", back: "", variantLevel: 2 });
    setShowPrompt(false);
    setJsonResponse("");
    setVariantStatus("");
  }, [card?.id, card?.updatedAt]);

  React.useEffect(() => {
    setSaveStatus("");
    setSaveError(false);
  }, [card?.id]);

  React.useEffect(() => {
    setRestoreVersionId("");
    setConfirmRestore(false);
    setRestoreStatus("");
  }, [card?.id]);

  React.useEffect(() => {
    if (confirmRestore) restoreActionRef.current?.focus();
  }, [confirmRestore]);

  if (!card) return null;

  const reviewEvents = deck?.reviewEvents ?? [];
  const variantReviewModel = createVariantReviewModel(card, reviewEvents);
  const { maturity, readiness, coverage, generationRecommendation: recommendation } = variantReviewModel;
  const generationPlan = variantReviewModel.generationPlan as { canGenerate: boolean; promptOptions: Parameters<typeof buildCardVariationPrompt>[1] };
  const promptOptions = generationPlan.canGenerate
    ? generationPlan.promptOptions
    : { ...generationPlan.promptOptions, numberOfVariants: 1, maxVariantLevel: Math.max(1, generationPlan.promptOptions?.maxVariantLevel || 1) };
  const promptPreview = buildCardVariationPrompt(card, promptOptions);
  const originalVariant = getOriginalVariant(card);
  const variants = card.variants ?? [];
  const restorableVersions = [...(card.versionLog ?? [])].reverse().filter((entry: any) => entry.before && typeof entry.before === "object");
  const selectedVersion = restorableVersions.find((entry: any) => entry.id === restoreVersionId) ?? null;
  const currentContent = versionContent({
    originalFront: card.originalFront,
    originalBack: card.originalBack,
    originalTags: card.originalTags,
    kind: card.kind,
  }, card);
  const restoredContent = selectedVersion ? versionContent(selectedVersion.before, card) : null;

  function update(key: string, value: string | string[] | number) {
    setForm((current) => current ? ({ ...current, [key]: value } as CardEditorValue) : current);
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setSaveStatus("");
    setSaveError(false);
  }

  function updateMcOption(index: number, option: string) {
    if (form?.cardType !== "multiple-choice") return;
    update("options", form.options.map((current, optionIndex) => optionIndex === index ? option : current));
  }

  function addMcOption() {
    if (form?.cardType !== "multiple-choice") return;
    update("options", [...form.options, ""]);
  }

  function removeMcOption(index: number) {
    if (form?.cardType !== "multiple-choice" || form.options.length <= 2) return;
    const options = form.options.filter((_, optionIndex) => optionIndex !== index);
    const correctOptionIndex = form.correctOptionIndex === index ? 0 : form.correctOptionIndex > index ? form.correctOptionIndex - 1 : form.correctOptionIndex;
    setForm({ ...form, options, correctOptionIndex });
    setFieldErrors((current) => ({ ...current, options: undefined, correctOptionIndex: undefined }));
  }

  async function saveEditorValue() {
    if (!form) return;
    const validation = validateCardEditorValue(form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setSaveError(true);
      setSaveStatus("Bitte die markierten Felder prüfen.");
      return;
    }
    setIsSaving(true);
    setSaveError(false);
    setSaveStatus("Karte wird gespeichert …");
    try {
      await onSaveCard(card.id, validation.value);
      setFieldErrors({});
      setSaveStatus("Karte gespeichert. Reviewdarstellung, Varianten und Cloudstand wurden aktualisiert.");
    } catch {
      setSaveError(true);
      setSaveStatus("Karte ist lokal gespeichert, aber die Cloud-Synchronisierung ist fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateVariantForm(key: string, value: string|number) {
    setVariantForm((current) => ({ ...current, [key]: value }));
  }

  function addManualVariant() {
    if (!variantForm.front.trim() || !variantForm.back.trim()) {
      setVariantStatus("Bitte Frage und Antwort für die Umformulierung ausfüllen.");
      return;
    }
    onAddVariant(card.id, {
      ...variantForm,
      variantLevel: Number(variantForm.variantLevel) || 2,
      generationSource: "user_edited",
    });
    setVariantForm({ front: "", back: "", variantLevel: 2 });
    setVariantStatus("Umformulierung gespeichert.");
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard?.writeText(promptPreview);
      setVariantStatus("Prompt kopiert.");
    } catch {
      setVariantStatus("Prompt ist sichtbar und kann manuell kopiert werden.");
    }
  }

  function applyJsonResponse() {
    if (!jsonResponse.trim()) {
      setVariantStatus("Füge zuerst eine JSON-Antwort ein.");
      return;
    }
    const result = onApplyVariantJson(card.id, jsonResponse, promptOptions);
    const created = result?.result?.createdVariants?.length ?? 0;
    const skipped = result?.result?.skippedVariants?.length ?? 0;
    const errors = result?.result?.errors ?? [];
    const warnings = [...(result?.result?.warnings ?? []), ...(errors ?? [])];
    setVariantStatus(`${created} Varianten übernommen. ${skipped} übersprungen.${warnings.length ? ` ${warnings.join(" ")}` : ""}`);
    if (created > 0) setJsonResponse("");
  }

  function restoreSelectedVersion() {
    if (!selectedVersion) return;
    const result = onRestoreCard(card.id, selectedVersion.id);
    if (!result) {
      setRestoreStatus("Die Version konnte nicht wiederhergestellt werden.");
      return;
    }
    setConfirmRestore(false);
    setRestoreVersionId("");
    setRestoreStatus("Version wiederhergestellt. Der Restore wurde als neuer Versionseintrag gespeichert.");
    window.requestAnimationFrame(() => restoreSelectRef.current?.focus());
  }

  return (
    <SoftPanel className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Karten-Detail</p>
          <h3 className="mt-1 break-words text-xl font-semibold text-[#17214f]">Karte typgerecht bearbeiten</h3>
          <p className="mt-1 text-sm text-[#66709a]">{cardTypeOptions.find((option) => option.value === card.cardType)?.label ?? card.cardType}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {form ? (
            <button type="button" onClick={() => void saveEditorValue()} disabled={isSaving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Save size={16} aria-hidden="true" />
              {isSaving ? "Speichert …" : "Speichern"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDeleteCard(card.id)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700"
          >
            <Trash2 size={16} aria-hidden="true" />
            Löschen
          </button>
        </div>
      </div>
      {form ? (
        <div className="grid min-w-0 gap-4">
          {form.cardType === "basic" || form.cardType === "basic-reversed" ? (
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                <span>Vorderseite</span>
                <RichTextEditor value={form.front} onChange={(value) => update("front", value)} ariaLabel="Karten-Vorderseite" ariaInvalid={Boolean(fieldErrors.front)} minHeightClass="min-h-32" />
                <FieldError errors={fieldErrors} field="front" />
              </div>
              <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                <span>Rückseite</span>
                <RichTextEditor value={form.back} onChange={(value) => update("back", value)} ariaLabel="Karten-Rückseite" ariaInvalid={Boolean(fieldErrors.back)} minHeightClass="min-h-32" />
                <FieldError errors={fieldErrors} field="back" />
              </div>
            </div>
          ) : null}
          {form.cardType === "cloze" ? (
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                <span>Cloze-Text</span>
                <RichTextEditor value={form.textWithClozes} onChange={(value) => update("textWithClozes", value)} ariaLabel="Cloze-Text" ariaInvalid={Boolean(fieldErrors.textWithClozes)} minHeightClass="min-h-32" />
                <p className="text-sm font-normal text-[#66709a]">Lücken mit <code>{"{{c1::Begriff}}"}</code> markieren. Gleiche Nummern gehören zu einer Reviewrichtung.</p>
                <FieldError errors={fieldErrors} field="textWithClozes" />
              </div>
              <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                <span>Zusatzinfo</span>
                <RichTextEditor value={form.extra} onChange={(value) => update("extra", value)} ariaLabel="Cloze-Zusatzinfo" minHeightClass="min-h-32" />
              </div>
            </div>
          ) : null}
          {form.cardType === "multiple-choice" ? (
            <div className="grid min-w-0 gap-4">
              <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                <span>Frage</span>
                <RichTextEditor value={form.question} onChange={(value) => update("question", value)} ariaLabel="Multiple-Choice-Frage" ariaInvalid={Boolean(fieldErrors.question)} minHeightClass="min-h-32" />
                <FieldError errors={fieldErrors} field="question" />
              </div>
              <fieldset className="grid gap-3 rounded-xl border border-[#dfe4f5] p-4">
                <legend className="px-1 text-sm font-semibold text-[#4e5b8c]">Antwortoptionen und richtige Antwort</legend>
                {form.options.map((option, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-2">
                    <input type="radio" name={`correct-option-${card.id}`} checked={form.correctOptionIndex === index} onChange={() => update("correctOptionIndex", index)} aria-label={`Option ${index + 1} als richtig markieren`} aria-invalid={Boolean(fieldErrors.correctOptionIndex)} />
                    <input className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#dfe4f5] px-3" value={option} onChange={(event) => updateMcOption(index, event.target.value)} aria-label={`Antwortoption ${index + 1}`} aria-invalid={Boolean(fieldErrors.options)} />
                    <button type="button" onClick={() => removeMcOption(index)} disabled={form.options.length <= 2} className="grid size-10 place-items-center rounded-xl border border-[#dfe4f5] text-[#66709a] disabled:opacity-40" aria-label={`Antwortoption ${index + 1} entfernen`}><X size={16} aria-hidden="true" /></button>
                  </div>
                ))}
                <button type="button" onClick={addMcOption} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]"><PlusSquare size={16} aria-hidden="true" />Option hinzufügen</button>
                <FieldError errors={fieldErrors} field="options" />
                <FieldError errors={fieldErrors} field="correctOptionIndex" />
              </fieldset>
              <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                <span>Erklärung (optional)</span>
                <RichTextEditor value={form.explanation} onChange={(value) => update("explanation", value)} ariaLabel="Erklärung zur richtigen Antwort" minHeightClass="min-h-28" />
              </div>
            </div>
          ) : null}
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Tags
            <input className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3" value={form.tags.join(" ")} onChange={(event) => update("tags", event.target.value.split(/\s+/).filter(Boolean))} />
          </label>
          {saveStatus ? <p className={saveError ? "core-status-error" : "core-status-success"} role={saveError ? "alert" : "status"}>{saveStatus}</p> : null}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900" role="status">
          Dieser importierte Kartentyp wird hier nur angezeigt. Typgerechtes Bearbeiten ist für Basic, Reverse, Cloze und Multiple Choice verfügbar.
        </div>
      )}
      <details className="mt-5 min-w-0 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#4f5eb1]">Details, Herkunft und Versionen</summary>
      <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Initialer Anker</p>
          <CardHtml html={card.immutableOriginal?.front} mediaUrls={mediaUrls} />
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Quellenanker</p>
          <p className="mt-2 break-words text-sm text-[#17214f]">{card.sourceAnchors?.[0]?.documentName || "Kein Dokumentanker"}</p>
          <p className="mt-1 break-words text-sm text-[#66709a]">{card.sourceAnchors?.[0]?.textQuote || "Import- oder manuelle Originalkarte"}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Versionen</p>
          <p className="mt-2 text-2xl font-semibold text-[#17214f]">{card.versionLog?.length ?? 0}</p>
          <p className="mt-1 text-sm text-[#66709a]">Änderungslogeinträge</p>
        </div>
      </div>
      {card.originalFields.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Importierte Rohfelder (read-only)</p>
          <dl className="mt-3 grid gap-3">
            {card.originalFields.map((field: { name: string; value: string }, index: number) => (
              <div key={`${field.name}-${index}`} className="grid gap-1">
                <dt className="text-sm font-semibold text-[#4e5b8c]">{field.name}</dt>
                <dd className="break-words text-sm text-[#66709a]"><CardHtml html={field.value} mediaUrls={mediaUrls} /></dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <section className="mt-5 min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4" aria-labelledby={`version-restore-${card.id}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold text-[#4e5b8c]" htmlFor={`version-select-${card.id}`}>
            <span id={`version-restore-${card.id}`}>Frühere Version wiederherstellen</span>
            <select
              ref={restoreSelectRef}
              id={`version-select-${card.id}`}
              className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm text-[#17214f]"
              value={restoreVersionId}
              onChange={(event) => {
                setRestoreVersionId(event.target.value);
                setConfirmRestore(false);
                setRestoreStatus("");
              }}
              aria-label="Version zum Wiederherstellen"
            >
              <option value="">Version auswählen</option>
              {restorableVersions.map((entry: any) => (
                <option key={entry.id} value={entry.id}>
                  Stand vor {new Date(entry.createdAt).toLocaleString("de-DE")} · {entry.reason || entry.changeType}
                </option>
              ))}
            </select>
          </label>
          {selectedVersion && !confirmRestore ? (
            <button ref={restoreConfirmRef} type="button" onClick={() => setConfirmRestore(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
              <RotateCcw size={16} aria-hidden="true" />
              Restore bestätigen
            </button>
          ) : null}
        </div>
        {restoredContent ? (
          <div className="mt-4 grid min-w-0 gap-3" data-testid="version-restore-summary">
            <p className="text-sm text-[#66709a]">Vergleiche den aktuellen Inhalt mit dem Stand, der als neue Version übernommen wird.</p>
            {[
              ["Vorderseite", currentContent.front, restoredContent.front],
              ["Rückseite", currentContent.back, restoredContent.back],
              ["Tags", currentContent.tags.join(" "), restoredContent.tags.join(" ")],
              ["Kartentyp", currentContent.kind, restoredContent.kind],
            ].map(([label, current, restored]) => (
              <div key={label} className="grid min-w-0 gap-2 rounded-xl border border-[#e3e7f5] p-3 md:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">{label}</span>
                <span className="break-words text-sm text-[#17214f]"><span className="font-semibold">Aktuell:</span> {current || "—"}</span>
                <span className="break-words text-sm text-[#17214f]"><span className="font-semibold">Nach Restore:</span> {restored || "—"}</span>
              </div>
            ))}
          </div>
        ) : null}
        {confirmRestore && selectedVersion ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" role="group" aria-label="Restore endgültig bestätigen">
            <p className="text-sm font-semibold text-amber-900">Der gezeigte Stand ersetzt den aktuellen Karteninhalt. Der aktuelle Stand bleibt im Versionsverlauf erhalten.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button ref={restoreActionRef} type="button" onClick={restoreSelectedVersion} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white">
                <RotateCcw size={16} aria-hidden="true" />
                Wiederherstellen
              </button>
              <button type="button" onClick={() => {
                setConfirmRestore(false);
                window.requestAnimationFrame(() => restoreConfirmRef.current?.focus());
              }} className="min-h-10 rounded-xl border border-[#dfe4f5] bg-white px-4 text-sm font-semibold text-[#4f5eb1]">
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}
        {restoreStatus ? <p className="core-status-success mt-3 text-sm font-semibold" role="status">{restoreStatus}</p> : null}
      </section>
      </details>
      <details className="mt-5 min-w-0 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] p-4" data-testid="card-labs-tools">
        <summary className="cursor-pointer text-sm font-semibold text-[#4f5eb1]">Labs / Erweitert: Varianten und technische Lernwerte</summary>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Reifegrad</p>
          <p className="mt-2 break-words text-lg font-semibold text-[#17214f]">{(maturityStageLabels as Record<string, string>)[maturity.stage] ?? maturity.label}</p>
          <p className="mt-1 text-sm text-[#66709a]">Score {maturity.score} · {maturity.description}</p>
          <p className="mt-2 text-xs text-[#66709a]">Stability {getStateValue(card.reviewState, "stability")} · Difficulty {getStateValue(card.reviewState, "difficulty")} · Reps {getStateValue(card.reviewState, "reps", getStateValue(card.reviewState, "repetitions"))}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Variantenbereitschaft</p>
          <p className="mt-2 break-words text-lg font-semibold text-[#17214f]">{formatLevelList(readiness.allowedLevels)}</p>
          <p className="mt-1 break-words text-sm text-[#66709a]">Bevorzugt Level {readiness.preferredLevel}. {readiness.reason}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Variantenabdeckung</p>
          <p className="mt-2 break-words text-lg font-semibold text-[#17214f]">{coverage.activeRephraseCount} nahe Varianten</p>
          <p className="mt-1 break-words text-sm text-[#66709a]">{coverage.hasEnoughVariants ? "Genug Varianten vorhanden." : "Weitere nahe Umformulierungen möglich."}</p>
        </div>
        </div>
      {showExternalVariantFlow ? (
        <div className="mt-5 grid gap-3">
          <LabsNotice surfaces={externalVariantSurface as ProductSurface} />
          <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">KI-Variantenempfehlung</p>
                <p className="mt-1 break-words text-sm text-[#17214f]">{recommendation.shouldSuggest ? `${recommendation.recommendedVariantCount} nahe Umformulierung empfohlen.` : recommendation.reason}</p>
              </div>
              <button type="button" onClick={() => setShowPrompt((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]">
                <WandSparkles size={16} aria-hidden="true" />
                KI-Prompt für Varianten
              </button>
            </div>
            {showPrompt ? (
              <div className="mt-4 grid min-w-0 gap-3">
                {!generationPlan.canGenerate ? <p className="text-sm text-[#66709a]">Diese Karte ist noch nicht reif für automatische Varianten. Der Prompt kann trotzdem als Vorschau angezeigt werden.</p> : null}
                <textarea className="min-h-56 min-w-0 rounded-xl border border-[#dfe4f5] bg-white p-3 font-mono text-xs leading-5" value={promptPreview} readOnly aria-label="KI-Prompt für Varianten" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copyPrompt} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]">
                    <Copy size={16} aria-hidden="true" />
                    Prompt kopieren
                  </button>
                </div>
                <textarea className="min-h-32 min-w-0 rounded-xl border border-[#dfe4f5] bg-white p-3 font-mono text-xs leading-5" value={jsonResponse} onChange={(event) => setJsonResponse(event.target.value)} placeholder='{"variants":[{"front":"...","back":"...","variantType":"basic","variantLevel":2,"relationToOriginal":"same_card_rephrasing","containsNewFacts":false,"abstractionLevel":1}]}' aria-label="Varianten-JSON" />
                <button type="button" onClick={applyJsonResponse} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl bg-indigo-700 px-3 text-sm font-semibold text-white">
                  <Sparkles size={16} aria-hidden="true" />
                  Varianten aus JSON übernehmen
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
        <div className="mt-5 min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Varianten dieser Grundkarte</p>
            <p className="mt-1 break-words text-sm text-[#66709a]">Varianten sind Umformulierungen derselben Wissenseinheit; der Hauptfortschritt bleibt auf der Grundkarte.</p>
          </div>
          <span className="rounded-xl bg-[#eef1fb] px-3 py-1 text-xs font-semibold text-[#4f5eb1]">{variants.length} Formen</span>
        </div>
        <div className="mt-4 grid gap-3">
          {variants.filter((variant: any): variant is CardVariant => variant != null).map((variant: CardVariant) => {
            const anchor = getVariantAnchor(card, variant);
            return (
              <article key={variant.id} className={`min-w-0 rounded-xl border p-3 ${variant.isOriginal ? "border-[#8c96dc] bg-[#f3f5fd]" : variant.isActive === false || variant.qualityStatus !== "active" ? "border-slate-200 bg-slate-50" : "border-[#e3e7f5] bg-[#f8f9fe]"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#66709a]">
                  <span className="rounded-lg bg-white px-2 py-1">{variant.isOriginal ? "Original" : "Variante"}</span>
                  <span>{variant.variantType}</span>
                  <span>Level {variant.variantLevel}</span>
                  <span>{variant.generationSource}</span>
                  <span>{variant.isActive === false || variant.qualityStatus !== "active" ? "inaktiv" : "aktiv"}</span>
                </div>
                <p className="break-words text-sm font-semibold text-[#17214f]">{variant.front}</p>
                <p className="mt-1 break-words text-sm text-[#66709a]">{variant.back}</p>
                <p className="mt-2 text-xs text-[#66709a]">{variant.isOriginal ? "Originalanker dieser Grundkarte." : `Verankert an ${anchor?.id === originalVariant?.id ? "Originalkarte" : anchor?.id ?? "Originalkarte"}.`} Attempts {variant.performance?.attempts ?? 0} · Richtig {variant.performance?.correctCount ?? 0} · Falsch {variant.performance?.wrongCount ?? 0}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 border-t border-[#e3e7f5] pt-4">
          <p className="text-sm font-semibold text-[#17214f]">Nahe Umformulierung hinzufügen</p>
          <p className="text-sm text-[#66709a]">Prüfe dieselbe Wissenseinheit. Keine neuen Fakten, keine neuen Konzepte.</p>
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3 text-sm" value={variantForm.front} onChange={(event) => updateVariantForm("front", event.target.value)} placeholder="Frage / Front" aria-label="Variantenfrage" />
            <input className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3 text-sm" value={variantForm.back} onChange={(event) => updateVariantForm("back", event.target.value)} placeholder="Antwort / Back" aria-label="Variantenantwort" />
            <select className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3 text-sm" value={variantForm.variantLevel} onChange={(event) => updateVariantForm("variantLevel", Number(event.target.value))} aria-label="Variantenlevel">
              {[1, 2, 3].map((level) => (
                <option key={level} value={level}>Level {level}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={addManualVariant} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl bg-[#4f5eb1] px-3 text-sm font-semibold text-white">
            <PlusSquare size={16} aria-hidden="true" />
            Umformulierung hinzufügen
          </button>
          {variantStatus ? <p className="text-sm text-[#66709a]" role="status" aria-live="polite">{variantStatus}</p> : null}
        </div>
        </div>
      </details>
    </SoftPanel>
  );
}

export function DecksScreen({ decks, mediaStore, selectedDeckId = null, selectedCardId = null, onSelectDeck, onSelectCard, onSetDeckCoreMode, onSaveCard, onDeleteCard, onUndoDeleteCard, onRestoreCard, onAddVariant, onApplyVariantJson, onStartDeck, onDeleteDeck, onRenameDeck, onMoveDeck, onOpenCardCreation, onPrepareSubdeckCreation, onOpenLearn, onOpenGraph, onShareDeck, showGraph = false, showCommunity = false, showExternalVariantFlow = false, externalVariantSurface }: any) {
  const [query, setQuery] = React.useState("");
  const [modeFilter, setModeFilter] = React.useState<CoreMode | "all">("all");
  const [deckStatus, setDeckStatus] = React.useState("");
  const [deckStatusType, setDeckStatusType] = React.useState<"status" | "alert">("status");
  const [editingDeckId, setEditingDeckId] = React.useState<any>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [movingDeckId, setMovingDeckId] = React.useState<any>(null);
  const [moveTargetId, setMoveTargetId] = React.useState("");
  const [pendingCardDelete, setPendingCardDelete] = React.useState<{ deckId: string; card: LearningItem } | null>(null);
  const [deletedCardUndo, setDeletedCardUndo] = React.useState<{ deckId: string; card: LearningItem; description: string } | null>(null);
  const [pendingDeckDelete, setPendingDeckDelete] = React.useState<{ deck: Deck; row: any } | null>(null);
  const library = createDeckLibraryModel(decks, { query, coreMode: modeFilter, selectedDeckId });
  const filteredRows = library.filteredRows;
  const selectedRow = selectedDeckId ? library.rows.find((row) => row.id === selectedDeckId) ?? null : null;
  const selectedDeck = selectedRow?.deck ?? null;
  const selectedCard = selectedRow?.activeCards.find((card) => card.id === selectedCardId) ?? null;
  const selectedDeckMissing = Boolean(selectedDeckId && !selectedDeck);
  const selectedCardMissing = Boolean(selectedDeck && selectedCardId && !selectedCard);
  const { urls: selectedDeckMediaUrls, missing: selectedDeckMissingMedia } = useDeckMediaUrls(selectedDeck, mediaStore);

  function updateCoreMode(deck: Deck, coreMode: any) {
    onSetDeckCoreMode(deck.id, coreMode);
  }

  function saveCard(cardId: string, value: CardEditorValue) {
    if (!selectedDeck) return;
    return onSaveCard(selectedDeck.id, cardId, value);
  }

  function deleteCard(cardId: any) {
    if (!selectedDeck) return;
    const card = selectedDeck.cards.find((candidate) => candidate.id === cardId);
    if (card) setPendingCardDelete({ deckId: selectedDeck.id, card });
  }

  async function confirmCardDelete() {
    if (!pendingCardDelete) return;
    const description = stripHtml(pendingCardDelete.card.originalFront).replace(/\s+/g, " ").trim() || "Karte ohne Vorderseitentext";
    try {
      const result = await onDeleteCard(pendingCardDelete.deckId, pendingCardDelete.card.id);
      const deletedCard = result?.cards.find((card: LearningItem) => card.id === pendingCardDelete.card.id);
      if (deletedCard) {
        setDeletedCardUndo({
          deckId: pendingCardDelete.deckId,
          card: deletedCard,
          description,
        });
      }
      setPendingCardDelete(null);
    } catch {
      setDeckStatus("Die Karte konnte nicht sicher gelöscht werden.");
      setDeckStatusType("alert");
    }
  }

  async function undoCardDelete() {
    if (!deletedCardUndo) return;
    try {
      const result = await onUndoDeleteCard(deletedCardUndo.deckId, deletedCardUndo.card);
      if (!result) throw new Error("Undo fehlgeschlagen.");
      onSelectDeck(deletedCardUndo.deckId, deletedCardUndo.card.id);
      setDeckStatus("Kartenlöschung rückgängig gemacht.");
      setDeckStatusType("status");
      setDeletedCardUndo(null);
    } catch {
      setDeckStatus("Die Kartenlöschung konnte nicht rückgängig gemacht werden.");
      setDeckStatusType("alert");
    }
  }

  function prepareSubdeck(deck: Deck) {
    onPrepareSubdeckCreation?.(deck.id);
  }

  function beginRename(deck: Deck) {
    setEditingDeckId(deck.id);
    setRenameDraft(deck.name);
    setDeckStatusType("status");
    setDeckStatus(`"${deck.name}" umbenennen.`);
  }

  function cancelRename() {
    const deckId = editingDeckId;
    setEditingDeckId(null);
    setRenameDraft("");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="deck-rename-button-${deckId}"]`)?.focus());
  }

  function beginMove(deck: Deck) {
    setMovingDeckId(deck.id);
    setMoveTargetId(deck.parentDeckId ?? "");
    setDeckStatusType("status");
    setDeckStatus(`Ziel für "${deck.name}" auswählen.`);
  }

  function cancelMove() {
    const deckId = movingDeckId;
    setMovingDeckId(null);
    setMoveTargetId("");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="deck-move-button-${deckId}"]`)?.focus());
  }

  function submitMove(event: React.SubmitEvent<HTMLFormElement>, deck: Deck) {
    event.preventDefault();
    const result = onMoveDeck?.(deck.id, moveTargetId || null);
    if (result?.error) {
      setDeckStatus(result.error);
      setDeckStatusType("alert");
      return;
    }
    if (result?.changedDeckIds?.length === 0) {
      setMovingDeckId(null);
      setMoveTargetId("");
      setDeckStatus(`Stapel "${deck.name}" bleibt an der bisherigen Stelle.`);
      setDeckStatusType("status");
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="deck-move-button-${deck.id}"]`)?.focus());
      return;
    }

    const target = library.rows.find((row) => row.id === moveTargetId)?.deck ?? null;
    setMovingDeckId(null);
    setMoveTargetId("");
    setDeckStatus(target ? `Stapel "${deck.name}" unter "${target.name}" verschoben.` : `Stapel "${deck.name}" auf die Hauptebene verschoben.`);
    setDeckStatusType("status");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="deck-move-button-${deck.id}"]`)?.focus());
  }

  function submitRename(event: React.SubmitEvent<HTMLFormElement>, deck: Deck) {
    event.preventDefault();
    const name = renameDraft.trim();
    if (!name) {
      setDeckStatus("Bitte gib einen Stapelnamen ein.");
      setDeckStatusType("alert");
      return;
    }

    const result = onRenameDeck?.(deck.id, name);
    if (result?.error) {
      setDeckStatus(result.error);
      setDeckStatusType("alert");
      return;
    }
    const renamedDeck = result?.deck ?? deck;
    setEditingDeckId(null);
    setRenameDraft("");
    setDeckStatus(`Stapel "${renamedDeck.name}" umbenannt.`);
    setDeckStatusType("status");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="deck-rename-button-${renamedDeck.id}"]`)?.focus());
  }

  function deleteDeckTree(deck: Deck, row: { id?: string; deck?: Deck; name?: string; path?: string; parentDeckId?: string|null; depth?: number; childrenCount?: number; hasChildren?: boolean; scopeDeckIds: any; coreMode?: CoreMode; summary?: { totalCards: number; dueCards: number; newCards: number; matureCards: number; activeVariants: number; averageMaturityXp: number; }; directSummary?: { totalCards: number; dueCards: number; newCards: number; matureCards: number; activeVariants: number; averageMaturityXp: number; }; progress?: number; activeCards?: LearningItem[]; cardRows?: { id: string; card: LearningItem; frontPreview: string; kind: CardType; maturityBand: MaturityBand; }[]; }) {
    setPendingDeckDelete({ deck, row });
  }

  async function confirmDeckDelete() {
    if (!pendingDeckDelete) return;
    const result = await onDeleteDeck(pendingDeckDelete.deck.id);
    if (!result) return;
    onSelectDeck(null);
    setDeckStatus(`${result.deletedDeckIds.length} Stapel gelöscht.`);
    setDeckStatusType("status");
    setPendingDeckDelete(null);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-screen-heading]")?.focus();
    });
  }

  function clearCardSelection(focusTarget: "deck" | "cards") {
    onSelectCard(null);
    window.requestAnimationFrame(() => {
      const selector = focusTarget === "deck"
        ? `[data-testid="deck-select-${selectedDeckId}"]`
        : `[data-testid="deck-card-list-${selectedDeckId}"]`;
      document.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Bibliothek"
        title="Kartenstapel"
      />

      <SoftPanel className="p-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm text-[#66709a]">
            <Search size={17} aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen" aria-label="Kartenstapel durchsuchen" />
          </label>
          <select className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]" value={modeFilter} onChange={(event) => setModeFilter(event.target.value as CoreMode | "all")} aria-label="Kartenstapel nach CoRe-Modus filtern">
            <option value="all">Alle Modi</option>
            <option value="off">Aus</option>
            <option value="auto">Auto</option>
            <option value="manual">Manuell</option>
          </select>
          <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white">
            <PlusSquare size={17} aria-hidden="true" />
            Neue Karten
          </button>
        </div>
        {deckStatus ? <p className={`mt-3 text-sm font-semibold ${deckStatusType === "alert" ? "core-status-error" : "core-status-info"}`} role={deckStatusType}>{deckStatus}</p> : null}
        {deletedCardUndo ? (
          <div className="core-status-success mt-3 flex flex-wrap items-center justify-between gap-3 text-sm" role="status" aria-live="assertive">
            <span>Karte „{deletedCardUndo.description.slice(0, 90)}“ gelöscht.</span>
            <button type="button" onClick={() => void undoCardDelete()} className="min-h-10 rounded-xl border border-teal-300 bg-white px-3 font-semibold text-teal-800">
              Rückgängig
            </button>
          </div>
        ) : null}
      </SoftPanel>

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Noch keine passenden Stapel"
          body="Importiere oder erstelle Karten, damit die Bibliothek gefüllt wird."
          action={
            <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
              Karten erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {filteredRows.map((row) => {
            const deck = row.deck;
            const summary = row.summary;
            const isSelected = selectedRow?.id === row.id;
            const isRenaming = editingDeckId === deck.id;
            const isMoving = movingDeckId === deck.id;
            const moveTarget = library.rows.find((candidate) => candidate.id === moveTargetId)?.deck ?? null;
            return (
              <SoftPanel
                key={row.id}
                data-testid={`deck-row-${deck.id}`}
                className={`p-4 transition sm:p-5 ${isSelected ? "ring-2 ring-[#8c96dc]" : ""}`}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-4" style={{ paddingLeft: `${Math.min(row.depth, 4) * 1.1}rem` }}>
                  <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-3">
                    <DeckAppearanceIcon deck={deck} className="size-12 rounded-full bg-[#eef1fb]" iconSize={22} />
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <form onSubmit={(event) => submitRename(event, deck)} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto_auto]">
                          <label className="sr-only" htmlFor={`deck-rename-${deck.id}`}>Stapelname</label>
                          <input
                            id={`deck-rename-${deck.id}`}
                            className="min-h-10 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#17214f] outline-none"
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            autoFocus
                            data-testid={`deck-rename-input-${deck.id}`}
                          />
                          <button type="submit" className="grid size-10 place-items-center rounded-xl bg-[#4f5eb1] text-white" aria-label="Stapelname speichern" data-testid={`deck-rename-save-${deck.id}`}>
                            <Check size={17} aria-hidden="true" />
                          </button>
                          <button type="button" onClick={cancelRename} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label="Umbenennen abbrechen">
                            <X size={17} aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        <button type="button" onClick={() => onSelectDeck(deck.id)} className="block min-w-0 text-left" data-testid={`deck-select-${deck.id}`}>
                          <span className="block truncate text-lg font-semibold text-[#17214f]">{deck.name}</span>
                          <span className="block truncate text-sm text-[#66709a]">{row.path}</span>
                          {row.hasChildren ? <span className="mt-1 block text-xs font-semibold text-[#66709a]">{row.childrenCount} Unterstapel</span> : null}
                        </button>
                      )}
                    </div>
                  </div>
                  <CoreModeControl value={deck.deckSettings.coreMode} onChange={(mode: any) => updateCoreMode(deck, mode)} />
                  <div className="flex flex-[1_1_14rem] flex-wrap items-center gap-4 sm:flex-none">
                    <div className="grid min-w-14 gap-1">
                      <span className="text-xs font-semibold text-[#66709a]">Karten im Stapel</span>
                      <span className="text-xl font-semibold text-[#17214f]">{summary.totalCards}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => beginRename(deck)} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label={`${row.path} umbenennen`} data-testid={`deck-rename-button-${deck.id}`}>
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => beginMove(deck)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#f8f9fe] px-3 text-sm font-semibold text-[#4f5eb1]" aria-label={`${row.path} verschieben`} data-testid={`deck-move-button-${deck.id}`}>
                      <MoveRight size={17} aria-hidden="true" />
                      Verschieben
                    </button>
                    <button type="button" onClick={() => onStartDeck(deck, false)} className="grid size-10 place-items-center rounded-xl bg-[#eef1fb] text-[#4f5eb1]" aria-label={`${row.path} lernen`}>
                      <Play size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onStartDeck(deck, true)} className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700" aria-label={`${row.path} mit Varianten lernen`}>
                      <Sparkles size={17} aria-hidden="true" />
                    </button>
                    {showGraph ? (
                      <button type="button" onClick={() => onOpenGraph(deck)} className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700" aria-label="Graph">
                        <Network size={17} aria-hidden="true" />
                      </button>
                    ) : null}
                    {showCommunity ? (
                      <button type="button" onClick={() => onShareDeck(deck)} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label="Teilen">
                        <Share2 size={17} aria-hidden="true" />
                      </button>
                    ) : null}
                    <button type="button" onClick={() => prepareSubdeck(deck)} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label={`Unterstapel in ${row.path} anlegen`}>
                      <FolderPlus size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => deleteDeckTree(deck, row)} className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-700" aria-label={`${row.path} löschen`}>
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {isMoving ? (
                  <form onSubmit={(event) => submitMove(event, deck)} className="mt-4 grid min-w-0 gap-3 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] p-4" data-testid={`deck-move-form-${deck.id}`}>
                    <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
                      Neuer Elternstapel für „{deck.name}“
                      <select className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm text-[#17214f]" value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)} aria-label={`Ziel für ${deck.name}`} autoFocus>
                        <option value="">Hauptebene</option>
                        {library.rows.filter((candidate) => !row.scopeDeckIds.includes(candidate.id)).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{"— ".repeat(candidate.depth)}{candidate.path}</option>
                        ))}
                      </select>
                    </label>
                    <p className="text-sm text-[#66709a]" data-testid={`deck-move-summary-${deck.id}`}>
                      {moveTarget ? `„${deck.name}“ wird unter „${moveTarget.name}“ verschoben.` : `„${deck.name}“ wird auf die Hauptebene verschoben.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white">
                        <MoveRight size={16} aria-hidden="true" />
                        Verschieben bestätigen
                      </button>
                      <button type="button" onClick={cancelMove} className="min-h-10 rounded-xl border border-[#dfe4f5] bg-white px-4 text-sm font-semibold text-[#4f5eb1]">Abbrechen</button>
                    </div>
                  </form>
                ) : null}
              </SoftPanel>
            );
          })}
        </div>
      )}

      {selectedDeckMissing ? (
        <EmptyState
          icon={Layers}
          title="Stapel nicht gefunden oder nicht verfügbar."
          body="Der verlinkte Stapel wurde gelöscht oder steht in diesem Account nicht zur Verfügung."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => onOpenLearn(null)} className="inline-flex min-h-11 items-center rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
                Zu Lernen
              </button>
              <button type="button" onClick={() => onSelectDeck(null)} className="inline-flex min-h-11 items-center rounded-xl border border-[#dfe4f5] bg-white px-5 text-sm font-semibold text-[#4f5eb1]">
                Zur Kartenverwaltung
              </button>
            </div>
          }
        />
      ) : null}

      {selectedDeck ? (
        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,0.85fr)_minmax(22rem,1.15fr)]">
          <SoftPanel className="p-5 outline-none sm:p-6" data-testid={`deck-card-list-${selectedDeck.id}`} tabIndex={-1}>
            <h3 className="break-words text-xl font-semibold text-[#17214f]">Karten in {selectedDeck.name}</h3>
            {selectedDeckMissingMedia.length > 0 ? <p className="mt-2 text-sm text-amber-800" role="status">{selectedDeckMissingMedia[0].status}{selectedDeckMissingMedia.length > 1 ? ` (${selectedDeckMissingMedia.length} Medien)` : ""}</p> : null}
            <div className="mt-5 grid max-h-[28rem] min-w-0 gap-3 overflow-y-auto overflow-x-hidden pr-1">
              {(selectedRow?.cardRows ?? []).map((cardRow) => {
                const card = cardRow.card;
                return (
                  <button
                    key={cardRow.id}
                    type="button"
                    data-testid={`deck-card-${cardRow.id}`}
                    onClick={() => onSelectCard(cardRow.id)}
                    aria-pressed={selectedCardId === cardRow.id}
                    className={`min-w-0 rounded-xl border px-4 py-3 text-left ${
                      selectedCardId === cardRow.id ? "border-[#8c96dc] bg-[#f3f5fd]" : "border-[#e3e7f5] bg-white/70"
                    }`}
                  >
                    <span className="block truncate text-sm font-semibold text-[#17214f]">{cardRow.frontPreview}</span>
                    <span className="mt-1 block text-xs uppercase tracking-wide text-[#66709a]">{card.kind} · {card.reviewState.maturityBand}</span>
                  </button>
                );
              })}
            </div>
          </SoftPanel>
          {selectedCardMissing ? (
            <EmptyState
              icon={Layers}
              title="Karte nicht gefunden oder nicht verfügbar."
              body="Die verlinkte Karte wurde gelöscht oder gehört nicht zu diesem Stapel."
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={() => clearCardSelection("deck")} className="inline-flex min-h-11 items-center rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
                    Zum Stapel
                  </button>
                  <button type="button" onClick={() => clearCardSelection("cards")} className="inline-flex min-h-11 items-center rounded-xl border border-[#dfe4f5] bg-white px-5 text-sm font-semibold text-[#4f5eb1]">
                    Alle Karten
                  </button>
                </div>
              }
            />
          ) : selectedCard ? (
            <DeckCardEditor
              deck={selectedDeck}
              cards={selectedRow?.activeCards ?? []}
              selectedCardId={selectedCardId}
              mediaUrls={selectedDeckMediaUrls}
              onSaveCard={saveCard}
              onDeleteCard={deleteCard}
              onRestoreCard={(cardId: any, versionId: any) => onRestoreCard(selectedDeck.id, cardId, versionId)}
              onAddVariant={(cardId: any, variant: any) => onAddVariant(selectedDeck.id, cardId, variant)}
              onApplyVariantJson={(cardId: any, response: any, options: any) => onApplyVariantJson(selectedDeck.id, cardId, response, options)}
              showExternalVariantFlow={showExternalVariantFlow}
              externalVariantSurface={externalVariantSurface}
            />
          ) : (
            <EmptyState
              icon={Layers}
              title="Karte auswählen"
              body="Wähle links eine Karte aus, um sie typgerecht zu bearbeiten."
            />
          )}
        </div>
      ) : null}
      <ActionDialog
        open={Boolean(pendingCardDelete)}
        title="Karte löschen?"
        description={pendingCardDelete ? (
          <p>„{(stripHtml(pendingCardDelete.card.originalFront).replace(/\s+/g, " ").trim() || "Karte ohne Vorderseitentext").slice(0, 180)}“ wird als gelöscht markiert. Du kannst die Löschung unmittelbar danach rückgängig machen.</p>
        ) : null}
        confirmLabel="Karte löschen"
        cancelLabel="Abbrechen"
        destructive
        onCancel={() => setPendingCardDelete(null)}
        onConfirm={() => void confirmCardDelete()}
      />
      <ActionDialog
        open={Boolean(pendingDeckDelete)}
        title="Stapelbaum löschen?"
        description={pendingDeckDelete ? (
          <div className="grid gap-2">
            <p>„{pendingDeckDelete.deck.name}“ und alle Inhalte dieses Stapelbaums werden als gelöscht markiert.</p>
            <ul className="list-disc pl-5">
              <li>{Math.max(0, (pendingDeckDelete.row.scopeDeckIds?.length ?? 1) - 1)} Unterstapel</li>
              <li>
                {pendingDeckDelete.row.summary?.totalCards ?? 0}{" "}
                {(pendingDeckDelete.row.summary?.totalCards ?? 0) === 1 ? "aktive Karte" : "aktive Karten"}
              </li>
            </ul>
          </div>
        ) : null}
        confirmLabel="Stapelbaum löschen"
        cancelLabel="Abbrechen"
        destructive
        onCancel={() => setPendingDeckDelete(null)}
        onConfirm={() => void confirmDeckDelete()}
      />
    </div>
  );
}
