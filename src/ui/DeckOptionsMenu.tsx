import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { Layers, MoreHorizontal, MoveRight, Settings } from "lucide-react";
import { createDeckPlacementValidator, MAX_INTERACTIVE_DECK_LEVELS, type DeckMutationResult } from "../coreWorkspace.ts";
import type { CoreMode, Deck } from "../coreTypes.ts";
import type { DeckLibraryRow } from "../libraryModel.ts";
import { IconButton } from "./actionUi.tsx";
import { ActionDialog, CoreModeControl } from "./coreUi.tsx";
import { DeckAppearanceIcon } from "./deckAppearance.tsx";
import { useSuccessToast } from "./feedbackUi.tsx";
import { DeckSelect } from "./selectUi.tsx";
import { CoreTooltip } from "./tooltipUi.tsx";

type DeckOptionsRow = Pick<DeckLibraryRow, "id" | "deck" | "path" | "coreMode">;

export interface DeckOptionsMenuProps {
  row: DeckOptionsRow;
  decks: Deck[];
  onSetCoreMode: (deckId: string, mode: CoreMode) => unknown;
  onOpenSettings: (deckId: string) => unknown;
  onMoveDeck: (deckId: string, parentDeckId: string | null) => DeckMutationResult | null;
}

const menuActionClass = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left core-body font-semibold text-[var(--core-text-secondary)] hover:bg-[var(--core-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--core-border-interactive)]";

export const DeckOptionsMenu = React.memo(function DeckOptionsMenu({ row, decks, onSetCoreMode, onOpenSettings, onMoveDeck }: DeckOptionsMenuProps) {
  const [moveDialogOpen, setMoveDialogOpen] = React.useState(false);
  const [moveTargetId, setMoveTargetId] = React.useState(row.deck.parentDeckId ?? "");
  const [moveError, setMoveError] = React.useState("");
  const setSuccessToast = useSuccessToast();
  const validMoveTargetDeckIds = React.useMemo(() => {
    if (!moveDialogOpen) return [];
    const validatePlacement = createDeckPlacementValidator(decks, row.id);
    const validIds: string[] = [];
    for (const candidate of decks) {
      if (validatePlacement(candidate.id) === null) validIds.push(candidate.id);
    }
    return validIds;
  }, [decks, moveDialogOpen, row.id]);

  function openMoveDialog() {
    setMoveTargetId(row.deck.parentDeckId ?? "");
    setMoveError("");
    setMoveDialogOpen(true);
  }

  function confirmMove() {
    const result = onMoveDeck(row.id, moveTargetId || null);
    if (result?.error) {
      setMoveError(result.error);
      return;
    }

    const target = decks.find((candidate) => candidate.id === moveTargetId);
    setSuccessToast(result?.changedDeckIds.length === 0
      ? `Stapel „${row.deck.name}“ bleibt an der bisherigen Stelle.`
      : target
        ? `Stapel „${row.deck.name}“ unter „${target.name}“ verschoben.`
        : `Stapel „${row.deck.name}“ auf die Hauptebene verschoben.`);
    setMoveDialogOpen(false);
  }

  return (
    <>
      <Popover.Root>
        <CoreTooltip label={`Stapeloptionen für ${row.path}`}>
          <Popover.Trigger asChild>
            <IconButton
              label={`Stapeloptionen für ${row.path}`}
              icon={MoreHorizontal}
              variant="ghost"
              className="pointer-events-auto"
              data-testid={`deck-options-${row.id}`}
            />
          </Popover.Trigger>
        </CoreTooltip>
        <Popover.Portal>
          <Popover.Content
            data-testid={`deck-options-menu-${row.id}`}
            align="end"
            sideOffset={8}
            collisionPadding={16}
            className="core-overlay z-[60] grid w-72 gap-3 rounded-2xl border border-[var(--core-border)] bg-core-surface p-3 shadow-xl"
          >
            <div className="flex min-w-0 items-center gap-3 px-2">
              <DeckAppearanceIcon deck={row.deck} className="size-9" iconSize={17} data-deck-icon="true" />
              <p className="min-w-0 break-words core-body font-semibold text-[var(--core-text)]">{row.path}</p>
            </div>
            <div className="grid gap-2 px-2">
              <span className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">CoRe-Modus</span>
              <CoreModeControl value={row.coreMode} onChange={(mode) => onSetCoreMode(row.id, mode)} />
            </div>
            <div className="grid gap-1 border-t border-[var(--core-border)] pt-2">
              <Popover.Close asChild>
                <button type="button" className={menuActionClass} onClick={() => onOpenSettings(row.id)}>
                  <Settings size={16} aria-hidden="true" />Einstellungen
                </button>
              </Popover.Close>
              <Popover.Close asChild>
                <button type="button" className={menuActionClass} data-testid={`deck-move-button-${row.id}`} onClick={openMoveDialog}>
                  <MoveRight size={16} aria-hidden="true" />Verschieben
                </button>
              </Popover.Close>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {moveDialogOpen ? (
        <ActionDialog
          open
          title="Stapel verschieben"
          description={(
            <div className="grid gap-3">
              <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Neuer übergeordneter Stapel
                <DeckSelect
                  ariaLabel={`Ziel für ${row.deck.name}`}
                  className="w-full"
                  value={moveTargetId}
                  decks={decks}
                  selectableDeckIds={validMoveTargetDeckIds}
                  specialOption={{ value: "", label: "Hauptebene", icon: Layers }}
                  onValueChange={(value) => {
                    setMoveTargetId(value);
                    setMoveError("");
                  }}
                />
              </label>
              <p className="core-caption text-[var(--core-text-muted)]">Maximal {MAX_INTERACTIVE_DECK_LEVELS} Ebenen. Ein Stapel kann nicht in sich selbst oder seine Unterstapel verschoben werden.</p>
              {moveError ? <p className="core-body font-semibold text-[var(--core-status-error-text)]" role="alert">{moveError}</p> : null}
            </div>
          )}
          confirmLabel="Verschieben bestätigen"
          cancelLabel="Abbrechen"
          actionIcons={{ confirm: MoveRight, cancel: Layers }}
          onCancel={() => {
            setMoveDialogOpen(false);
            setMoveError("");
          }}
          onConfirm={confirmMove}
        />
      ) : null}
    </>
  );
});
