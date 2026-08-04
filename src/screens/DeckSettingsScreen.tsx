import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { ArrowLeft, Pencil, Save, SlidersHorizontal } from "lucide-react";
import type { DeckSettingsScreenProps } from "../appScreenProps.ts";
import { normalizeDeckAppearance } from "../coreModel.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ColorWheelPicker } from "../ui/ColorWheelPicker.tsx";
import { deckIconOptions, getDeckIcon } from "../ui/deckAppearance.tsx";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";

interface DeckIconPickerProps {
  value: string;
  color: string;
  onChange: (iconKey: string) => void;
}

function DeckIconPicker({ value, color, onChange }: DeckIconPickerProps) {
  const SelectedIcon = getDeckIcon(value);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Icon auswählen"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--core-border-interactive)] bg-core-surface shadow-sm transition hover:border-[var(--core-action-primary)]"
          style={{ color }}
        >
          <SelectedIcon size={20} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label="Icon auswählen"
          className="core-overlay z-50 w-[min(17rem,calc(100vw-1.5rem))] rounded-xl p-3 outline-none"
        >
          <div className="grid grid-cols-5 gap-1" role="group" aria-label="Icon-Auswahl" data-testid="deck-icon-grid">
            {deckIconOptions.map((option) => {
              const Icon = option.icon;
              const selected = option.key === value;
              return (
                <Popover.Close asChild key={option.key}>
                  <button
                    type="button"
                    aria-label={option.label}
                    aria-pressed={selected}
                    title={option.label}
                    data-icon-key={option.key}
                    className={`grid size-11 place-items-center rounded-xl border text-[var(--core-action-primary)] transition hover:bg-[var(--core-surface-muted)] ${
                      selected
                        ? "border-[var(--core-border-interactive)] bg-[var(--core-info-surface)]"
                        : "border-transparent bg-core-surface"
                    }`}
                    onClick={() => onChange(option.key)}
                  >
                    <Icon size={20} aria-hidden="true" />
                  </button>
                </Popover.Close>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DeckSettingsScreen({ deck, onSave, onSaveAppearance, onRenameDeck, onBack, backLabel = "Zurück zu Lernen" }: DeckSettingsScreenProps) {
  const [appearance, setAppearance] = React.useState(() => normalizeDeckAppearance(deck?.deckSettings?.appearance));
  const [nameDraft, setNameDraft] = React.useState(deck?.name ?? "");
  const [editingName, setEditingName] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ message: string; role: "alert" | "status" } | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const renameButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setAppearance(normalizeDeckAppearance(deck?.deckSettings?.appearance));
  }, [deck?.id, deck?.deckSettings?.appearance?.iconKey, deck?.deckSettings?.appearance?.iconColor]);

  React.useEffect(() => {
    setEditingName(false);
    setFeedback(null);
  }, [deck?.id]);

  React.useEffect(() => {
    if (!editingName) setNameDraft(deck?.name ?? "");
  }, [deck?.name, editingName]);

  React.useEffect(() => {
    if (!editingName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [editingName]);

  if (!deck) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Stapel nicht gefunden"
        body="Der ausgewählte Stapel ist nicht mehr verfügbar."
        action={
          <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--core-surface-muted)] px-4 core-body font-semibold text-[var(--core-action-primary)]">
            <ArrowLeft size={17} aria-hidden="true" />
            {backLabel}
          </button>
        }
      />
    );
  }
  const activeDeck = deck;

  function cancelNameEdit() {
    setNameDraft(activeDeck.name);
    setEditingName(false);
    setFeedback(null);
    window.requestAnimationFrame(() => renameButtonRef.current?.focus());
  }

  function updateAppearance(patch: Partial<typeof appearance>) {
    setAppearance((current) => normalizeDeckAppearance({ ...current, ...patch }));
    setFeedback(null);
  }

  function saveSettings(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = nameDraft.trim();
    if (!nextName) {
      setFeedback({ message: "Bitte gib einen Stapelnamen ein.", role: "alert" });
      nameInputRef.current?.focus();
      return;
    }

    const renameResult = nextName === activeDeck.name ? null : onRenameDeck(activeDeck.id, nextName);
    if (nextName !== activeDeck.name && !renameResult) {
      setFeedback({ message: "Der Stapel konnte nicht umbenannt werden.", role: "alert" });
      return;
    }
    if (renameResult?.error) {
      setFeedback({ message: renameResult.error, role: "alert" });
      return;
    }

    onSaveAppearance(activeDeck.id, appearance);
    setNameDraft(renameResult?.deck?.name ?? activeDeck.name);
    setEditingName(false);
    setFeedback({ message: "Stapeleinstellungen gespeichert.", role: "status" });
  }

  return (
    <div className="grid min-w-0 gap-7" data-testid={`deck-settings-${deck.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Stapel-Einstellungen" title={deck.name} />
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)] transition hover:bg-core-surface">
          <ArrowLeft size={17} aria-hidden="true" />
          {backLabel}
        </button>
      </div>

      <SoftPanel className="p-4 sm:p-5">
        <form className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" onSubmit={saveSettings}>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                ref={nameInputRef}
                value={nameDraft}
                aria-label="Stapelname"
                data-testid="deck-settings-name-input"
                className="h-11 w-full min-w-0 rounded-xl border border-[var(--core-border-interactive)] bg-core-surface px-3 core-heading-3 text-[var(--core-text)] outline-none"
                onChange={(event) => {
                  setNameDraft(event.target.value);
                  setFeedback(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  cancelNameEdit();
                }}
              />
            ) : (
              <h2 className="break-words core-heading-3 font-semibold text-[var(--core-text)]">{deck.name}</h2>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <IconButton
              ref={renameButtonRef}
              type="button"
              icon={Pencil}
              label="Stapel umbenennen"
              aria-pressed={editingName}
              className="size-11 shrink-0"
              onClick={() => {
                setEditingName(true);
                setFeedback(null);
              }}
            />
            <div className="grid gap-1 core-caption font-semibold text-[var(--core-text-secondary)]">
              <span>Icon</span>
              <DeckIconPicker
                value={appearance.iconKey}
                color={appearance.iconColor}
                onChange={(iconKey) => updateAppearance({ iconKey })}
              />
            </div>
            <div className="grid gap-1 core-caption font-semibold text-[var(--core-text-secondary)]">
              <span>Farbe</span>
              <ColorWheelPicker
                value={appearance.iconColor}
                ariaLabel="Farbe auswählen"
                className="justify-self-start"
                onValueCommit={(iconColor) => updateAppearance({ iconColor })}
              />
            </div>
            <ActionButton type="submit" variant="primary" icon={Save} className="shrink-0">
              Speichern
            </ActionButton>
          </div>

          {feedback ? (
            <p className={`basis-full core-body font-semibold ${feedback.role === "alert" ? "text-[var(--core-status-error-text)]" : "text-[var(--core-text)]"}`} role={feedback.role} aria-live={feedback.role === "status" ? "polite" : undefined}>
              {feedback.message}
            </p>
          ) : null}
        </form>
      </SoftPanel>

      <LearningSettingsPanel
        settings={deck.deckSettings}
        coreMode={deck.deckSettings?.coreMode}
        scopeTitle={`Lernen mit „${deck.name}“`}
        scopeDescription="Passe Tagespensum, Kartenreihenfolge und Intervalle gezielt für diesen Stapel an. Die vorhandenen Lernstände bleiben erhalten; neue Einstellungen wirken bei den nächsten Einplanungen."
        onSave={(settings: any) => onSave(deck.id, settings)}
      />
    </div>
  );
}
