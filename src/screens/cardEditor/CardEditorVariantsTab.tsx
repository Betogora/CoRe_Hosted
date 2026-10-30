import React from "react";
import { Pencil, PowerOff, RefreshCw, RotateCcw, Settings, Sparkles, Trash2 } from "lucide-react";
import type { CardEditorServices, DecksScreenProps } from "../../appScreenProps.ts";
import { cardVariantSource, classifyCardEligibility, describeVariantReadiness, isEditedVariant } from "../../coreVariantService.ts";
import type { Card, CardVariant, Deck, Note } from "../../coreTypes.ts";
import { stripHtml } from "../../htmlSafety.ts";
import { ActionButton, CrossLinkButton, IconButton } from "../../ui/actionUi.tsx";
import { ActionDialog } from "../../ui/coreUi.tsx";
import { useSuccessToast } from "../../ui/feedbackUi.tsx";
import { RichTextEditor } from "../../ui/RichTextEditor.tsx";
import { CoreTooltip } from "../../ui/tooltipUi.tsx";
import { VARIANT_STATE_TONE, variantStateMarks } from "./cardEditorModel.ts";

function readinessLabel(coreMode: Deck["deckSettings"]["coreMode"], ready: boolean): string {
  if (coreMode === "off") return "CoRe-Modus aus";
  return ready ? "Varianten werden abgefragt" : "Varianten noch nicht im Review";
}

/** One variant, edited in its row and saved at once, independent of the content draft (W12). */
function VariantRow({ variant, index, busy, reactivationBlocked, canGenerate, onEdit, onRegenerate, onUpdate, onDelete }: {
  variant: CardVariant;
  index: number;
  busy: boolean;
  reactivationBlocked: boolean;
  canGenerate: boolean;
  onEdit: (text: { front: string; back: string }) => Promise<boolean>;
  onRegenerate: () => void;
  onUpdate: (action: "reactivate" | "deactivate") => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState<{ front: string; back: string } | null>(null);
  const { marks, reactivatable } = variantStateMarks(variant, isEditedVariant(variant));
  const active = variant.isActive && variant.qualityStatus === "active" && variant.meta.outdated !== true;
  const number = index + 1;
  return (
    <li className="grid min-w-0 gap-2 py-3" data-testid="card-variant">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap gap-1.5">
            {marks.map((mark) => <span key={mark.label} className={`inline-flex rounded-inset px-2 py-0.5 core-caption font-semibold text-core-text ${VARIANT_STATE_TONE[mark.tone]}`}>{mark.label}</span>)}
          </span>
          {editing ? null : (
            <>
              <p className="mt-1.5 break-words core-body font-semibold text-core-text">{stripHtml(variant.front)}</p>
              <p className="break-words core-body text-core-muted">{stripHtml(variant.back)}</p>
              {(variant.performance?.attempts ?? 0) > 0 ? <p className="mt-1 core-caption text-core-muted">{variant.performance.attempts}× abgefragt · {variant.performance.correctCount} richtig</p> : null}
            </>
          )}
        </div>
        {editing ? null : (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <CoreTooltip label="Bearbeiten">
              <IconButton icon={Pencil} variant="ghost" label={`Variante ${number} bearbeiten`} disabled={busy} onClick={() => setEditing({ front: variant.front, back: variant.back })} />
            </CoreTooltip>
            <CoreTooltip label="Neu generieren">
              <IconButton icon={RefreshCw} variant="ghost" label={`Variante ${number} neu generieren`} disabled={busy || !canGenerate} onClick={onRegenerate} />
            </CoreTooltip>
            {active ? (
              <CoreTooltip label="Abschalten">
                <IconButton icon={PowerOff} variant="ghost" label={`Variante ${number} abschalten`} disabled={busy} onClick={() => onUpdate("deactivate")} />
              </CoreTooltip>
            ) : reactivatable ? (
              <CoreTooltip label={reactivationBlocked ? "Höchstzahl aktiver Varianten erreicht" : "Reaktivieren"}>
                <IconButton icon={RotateCcw} variant="ghost" label={`Variante ${number} reaktivieren`} disabled={busy || reactivationBlocked} onClick={() => onUpdate("reactivate")} />
              </CoreTooltip>
            ) : null}
            <CoreTooltip label="Löschen">
              <button type="button" aria-label={`Variante ${number} löschen`} disabled={busy} className="core-action-ghost min-w-control p-2 text-core-danger-text" onClick={onDelete}>
                <Trash2 size={20} aria-hidden="true" />
              </button>
            </CoreTooltip>
          </div>
        )}
      </div>
      {editing ? (
        <div className="grid min-w-0 gap-2" data-testid="card-variant-edit">
          <RichTextEditor value={editing.front} ariaLabel={`Frage von Variante ${number}`} toolbarOnFocus minHeightClass="min-h-16" onChange={(front) => setEditing((current) => current && { ...current, front })} />
          <RichTextEditor value={editing.back} ariaLabel={`Antwort von Variante ${number}`} toolbarOnFocus minHeightClass="min-h-16" onChange={(back) => setEditing((current) => current && { ...current, back })} />
          <div className="flex justify-end gap-2">
            <ActionButton variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Abbrechen</ActionButton>
            <ActionButton variant="primary" loading={busy} onClick={() => void onEdit(editing).then((saved) => { if (saved) setEditing(null); })}>Speichern</ActionButton>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export interface CardEditorVariantsTabProps {
  deck: Deck;
  note: Note;
  card: Card;
  services: CardEditorServices;
  onGenerateVariant: (cardId: string) => Promise<unknown>;
  onUpdateVariant: DecksScreenProps["onUpdateVariant"];
  onOpenDeckSettings: () => void;
}

/** The original for comparison, then each variant with its state marks and actions (specs §5.3 `Varianten`). */
export function CardEditorVariantsTab({ deck, note, card, services, onGenerateVariant, onUpdateVariant, onOpenDeckSettings }: CardEditorVariantsTabProps) {
  const setSuccessToast = useSuccessToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("");
  const [pendingDeletion, setPendingDeletion] = React.useState<CardVariant | null>(null);
  const readiness = describeVariantReadiness(card, deck.deckSettings);
  const eligibility = classifyCardEligibility(note, card, deck.deckSettings);
  const original = cardVariantSource(note, card);
  const variants = card.variants.filter((variant) => !variant.deletedAt);
  const hasOutdated = variants.some((variant) => variant.meta.outdated === true);
  const reactivationBlocked = readiness.activeCount >= readiness.maxActive;
  const generating = busyId === "generate";

  async function act(id: string, action: () => Promise<unknown>, success: string, failure: string): Promise<boolean> {
    setBusyId(id);
    setStatus("");
    try {
      await action();
      setSuccessToast(success);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : failure);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid min-w-0 content-start gap-4 p-4 sm:p-6" data-testid="card-variant-tools">
      <section className="grid min-w-0 gap-2 rounded-panel border border-core-border bg-core-surface p-4" aria-label="Original">
        <span className="w-fit rounded-inset bg-core-subtle px-2 py-0.5 core-caption font-semibold text-core-text">Original</span>
        {original ? (
          <>
            <p className="break-words core-body font-semibold text-core-text">{stripHtml(original.front)}</p>
            <p className="break-words core-body text-core-muted">{stripHtml(original.back)}</p>
          </>
        ) : <p className="core-body text-core-muted">{eligibility.reasons[0] ?? "Diese Karte hat keine Frage und Antwort."}</p>}
      </section>
      <section className="grid min-w-0 gap-3 rounded-panel border border-core-border bg-core-surface p-4" aria-labelledby="card-variants-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id="card-variants-heading" className="core-body font-semibold text-core-text">Varianten</h3>
          <p className="core-caption font-semibold text-core-muted" data-testid="variant-active-count">{readiness.activeCount} von {readiness.maxActive} aktiv</p>
        </div>
        <p className="core-caption text-core-muted" data-testid="variant-readiness">Haltbarkeit {readiness.durabilityDays} von {readiness.thresholdDays} Tagen · {readinessLabel(deck.deckSettings.coreMode, readiness.ready)}</p>
        {variants.length ? (
          <ul className="grid divide-y divide-core-border border-y border-core-border">
            {variants.map((variant, index) => (
              <VariantRow
                key={variant.id}
                variant={variant}
                index={index}
                busy={busyId !== null}
                reactivationBlocked={reactivationBlocked}
                canGenerate={eligibility.eligible}
                onEdit={(text) => act(variant.id, () => services.editVariant(card.id, variant.id, text), "Die Variante wurde gespeichert.", "Die Variante konnte nicht gespeichert werden.")}
                onRegenerate={() => void act(variant.id, async () => {
                  await onGenerateVariant(card.id);
                  await onUpdateVariant(card.id, variant.id, "delete");
                }, "Die Variante wurde neu generiert.", "Die Variante konnte nicht neu generiert werden.")}
                onUpdate={(action) => void act(variant.id, () => onUpdateVariant(card.id, variant.id, action), action === "reactivate" ? "Die Variante wird wieder abgefragt." : "Die Variante wird nicht mehr abgefragt.", "Die Variante konnte nicht geändert werden.")}
                onDelete={() => setPendingDeletion(variant)}
              />
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ActionButton variant="secondary" icon={Sparkles} loading={generating} disabled={!eligibility.eligible || busyId !== null}
            onClick={() => void act("generate", () => onGenerateVariant(card.id), hasOutdated ? "Veraltete Variante wurde ersetzt." : "Variante wurde generiert.", "Die Variante konnte nicht generiert werden.")}>
            {hasOutdated ? "Variante neu generieren" : variants.length ? "Weitere Variante generieren" : "Variante generieren"}
          </ActionButton>
          <p className="min-w-0 flex-1 basis-56 core-caption text-core-muted">
            {eligibility.eligible ? "Sendet nur Frage und Antwort an GPT-6 Luna; der Anbieter speichert nichts." : eligibility.reasons[0] ?? "Varianten sind für diese Karte nicht verfügbar."}
          </p>
        </div>
        {status ? <p className="core-body text-core-warning" role="status" aria-live="polite">{status}</p> : null}
        <CrossLinkButton className="w-fit" onSelect={onOpenDeckSettings}><Settings size={15} aria-hidden="true" />Stapeleinstellungen</CrossLinkButton>
      </section>
      <ActionDialog
        open={Boolean(pendingDeletion)}
        title="Variante löschen?"
        description="Die Variante wird auf allen Geräten entfernt. Grundkarte und Lernstand bleiben unverändert."
        confirmLabel="Variante löschen"
        cancelLabel="Behalten"
        destructive
        onCancel={() => setPendingDeletion(null)}
        onConfirm={() => {
          const variant = pendingDeletion;
          setPendingDeletion(null);
          if (variant) void act(variant.id, () => onUpdateVariant(card.id, variant.id, "delete"), "Die Variante wurde gelöscht.", "Die Variante konnte nicht geändert werden.");
        }}
      />
    </div>
  );
}
