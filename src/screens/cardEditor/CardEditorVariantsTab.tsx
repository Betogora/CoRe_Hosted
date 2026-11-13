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
import { CardEditorSection as Section } from "./CardEditorSection.tsx";

function readinessLabel(coreMode: Deck["deckSettings"]["coreMode"], ready: boolean): string {
  if (coreMode === "off") return "CoRe-Modus aus";
  return ready ? "Varianten werden abgefragt" : "Varianten noch nicht im Review";
}

/** One variant, edited in its row and saved at once, independent of the content draft (W12). */
function VariantRow({ variant, typedAnswer, index, busy, reactivationBlocked, canGenerate, onEdit, onRegenerate, onUpdate, onDelete }: {
  variant: CardVariant;
  /** The card's own answer when it is typed: the variant only rephrases the question then (`variantPresentation`). */
  typedAnswer: string | null;
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
            {marks.map((mark) => <span key={mark.label} className={`inline-flex rounded-control px-3 py-1 core-status-label text-core-text ${VARIANT_STATE_TONE[mark.tone]}`}>{mark.label}</span>)}
          </span>
          {editing ? null : (
            <>
              <p className="mt-2 break-words core-body font-semibold text-core-text">{stripHtml(variant.front)}</p>
              <p className="break-words core-body text-core-muted">{typedAnswer ?? stripHtml(variant.back)}</p>
              {(variant.performance?.attempts ?? 0) > 0 ? <p className="mt-1 core-body text-core-muted">{variant.performance.attempts}× abgefragt · {variant.performance.correctCount} richtig</p> : null}
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
              <IconButton icon={Trash2} variant="destructive-quiet" label={`Variante ${number} löschen`} disabled={busy} onClick={onDelete} />
            </CoreTooltip>
          </div>
        )}
      </div>
      {editing ? (
        <div className="grid min-w-0 gap-2" data-testid="card-variant-edit">
          <RichTextEditor value={editing.front} ariaLabel={`Frage von Variante ${number}`} toolbarOnFocus minHeightClass="min-h-16" onChange={(front) => setEditing((current) => current && { ...current, front })} />
          {typedAnswer === null ? <RichTextEditor value={editing.back} ariaLabel={`Antwort von Variante ${number}`} toolbarOnFocus minHeightClass="min-h-16" onChange={(back) => setEditing((current) => current && { ...current, back })} /> : null}
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

/** The original for comparison, then each variant with its state marks and actions (specs.md#karteneditor). */
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
    <div className="core-card-editor-sections" data-testid="card-variant-tools">
      <Section title="Original" testId="card-variant-original">
        {original ? (
          <div className="grid min-w-0 gap-0.5">
            <p className="break-words core-body font-semibold text-core-text">{stripHtml(original.front)}</p>
            <p className="break-words core-body text-core-muted">{stripHtml(original.back)}</p>
          </div>
        ) : <p className="core-body text-core-muted">{eligibility.reasons[0] ?? "Diese Karte hat keine Frage und Antwort."}</p>}
      </Section>
      <Section title="Varianten" testId="card-variants" aside={<p className="core-body font-semibold text-core-muted" data-testid="variant-active-count">{readiness.activeCount} von {readiness.maxActive} aktiv</p>}>
        <p className="-mt-2 core-body text-core-muted" data-testid="variant-readiness">Haltbarkeit {readiness.durabilityDays} von {readiness.thresholdDays} Tagen · {readinessLabel(deck.deckSettings.coreMode, readiness.ready)}</p>
        {variants.length ? (
          <ul className="grid divide-y divide-core-border border-y border-core-border">
            {variants.map((variant, index) => (
              <VariantRow
                key={variant.id}
                variant={variant}
                typedAnswer={original?.kind === "type-in" ? original.back : null}
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
        {eligibility.eligible ? null : <p className="core-body text-core-muted">{eligibility.reasons[0] ?? "Varianten sind für diese Karte nicht verfügbar."}</p>}
        {status ? <p className="core-body text-core-warning" role="status" aria-live="polite">{status}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActionButton variant="secondary" icon={Sparkles} loading={generating} disabled={!eligibility.eligible || busyId !== null}
            onClick={() => void act("generate", () => onGenerateVariant(card.id), hasOutdated ? "Veraltete Variante wurde ersetzt." : "Variante wurde generiert.", "Die Variante konnte nicht generiert werden.")}>
            {hasOutdated ? "Variante neu generieren" : variants.length ? "Weitere Variante generieren" : "Variante generieren"}
          </ActionButton>
          <CrossLinkButton onSelect={onOpenDeckSettings}><Settings size={15} aria-hidden="true" />Stapeleinstellungen</CrossLinkButton>
        </div>
      </Section>
      <ActionDialog
        open={Boolean(pendingDeletion)}
        title="Variante löschen?"
        description="Die Variante wird auf allen Geräten entfernt. Grundkarte und Lernstand bleiben unverändert."
        confirmLabel="Variante löschen"
        cancelLabel="Abbrechen"
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
