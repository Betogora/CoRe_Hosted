import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { ArrowLeft, CalendarRange, FolderPlus, Layers, Play, Save, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { DeckSettingsScreenProps } from "../appScreenProps.ts";
import { normalizeDeckAppearance } from "../coreModel.ts";
import { getLearningProfileTemplate } from "../deckSettings.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { ColorWheelPicker } from "../ui/ColorWheelPicker.tsx";
import { DeckAppearanceIcon, deckIconOptions, getDeckIcon } from "../ui/deckAppearance.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { ActionDialog, EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { DeckSelect } from "../ui/selectUi.tsx";
import { SettingsSectionNavigation } from "../ui/settingsNavigation.tsx";

function DeckIconPicker({ value, color, onChange }: { value: string; color: string; onChange: (iconKey: string) => void }) {
  const SelectedIcon = getDeckIcon(value);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label="Icon auswählen" className="grid size-11 shrink-0 place-items-center rounded-xl border border-core-border bg-core-surface shadow-sm transition hover:border-core-action" style={{ color }}>
          <SelectedIcon size={20} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} aria-label="Icon auswählen" className="core-overlay z-50 w-[min(17rem,calc(100vw-1.5rem))] rounded-xl p-3 outline-none">
          <div className="grid grid-cols-5 gap-1" role="group" aria-label="Icon-Auswahl" data-testid="deck-icon-grid">
            {deckIconOptions.map((option) => {
              const Icon = option.icon;
              const selected = option.key === value;
              return (
                <Popover.Close asChild key={option.key}>
                  <button type="button" aria-label={option.label} aria-pressed={selected} className={`grid size-11 place-items-center rounded-xl border transition ${selected ? "border-core-action bg-core-info-soft" : "border-transparent bg-core-surface hover:bg-core-subtle"}`} onClick={() => onChange(option.key)}>
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

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function DeckSettingsScreen({ deck, decks, deckSummaries, learningProfiles, settingsTarget = null, onSave, onSaveLearningProfiles, onSaveAppearance, onRenameDeck, onCreateSubdeck, onStartDeck, onDeleteDeck, onSelectDeck, onOpenGlobalSettings, onBack, backLabel = "Zurück zu Lernen" }: DeckSettingsScreenProps) {
  const [appearance, setAppearance] = React.useState(() => normalizeDeckAppearance(deck?.deckSettings?.appearance));
  const [nameDraft, setNameDraft] = React.useState(deck?.name ?? "");
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const setSuccessToast = useSuccessToast();
  const deckRow = React.useMemo(() => deleteDialogOpen && deck ? createDeckLibraryModel(decks, { deckSummaries }).rows.find((row) => row.id === deck.id) ?? null : null, [deck, decks, deckSummaries, deleteDialogOpen]);

  React.useEffect(() => {
    setAppearance(normalizeDeckAppearance(deck?.deckSettings?.appearance));
    setNameDraft(deck?.name ?? "");
    setFeedback("");
  }, [deck?.id, deck?.name, deck?.deckSettings?.appearance?.iconKey, deck?.deckSettings?.appearance?.iconColor]);

  React.useEffect(() => {
    if (!deck || settingsTarget !== "new-cards-per-day") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const field = document.getElementById("learning-settings-new-cards");
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deck?.id, settingsTarget]);

  if (!deck) {
    return (
      <div className="grid min-w-0 gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4"><PageHeader eyebrow="Stapel" title="Stapeleinstellungen" /><CrossLinkButton onSelect={onOpenGlobalSettings}>Globale Einstellungen</CrossLinkButton></div>
        {decks.length > 0 ? (
          <SoftPanel className="p-6 sm:p-8">
            <div className="mx-auto grid max-w-xl gap-4 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-core-info-soft text-core-action"><SlidersHorizontal size={22} aria-hidden="true" /></span>
              <h2 className="core-heading-2 font-semibold text-core-text">Stapel auswählen</h2>
              <p className="core-body text-core-muted">Wähle einen vorhandenen Stapel, um seine Darstellung, Lernprofile und CoRe-Parameter zu bearbeiten.</p>
              <DeckSelect ariaLabel="Stapel für Einstellungen auswählen" value="" decks={decks} specialOption={{ value: "", label: "Stapel auswählen", icon: Layers }} onValueChange={(deckId) => { if (deckId) onSelectDeck(deckId); }} testId="deck-settings-select" />
              <button type="button" onClick={onBack} className="mx-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-core-border bg-core-surface px-4 core-body font-semibold text-core-action"><ArrowLeft size={17} aria-hidden="true" />{backLabel}</button>
            </div>
          </SoftPanel>
        ) : (
          <EmptyState icon={Layers} title="Noch kein Stapel vorhanden" body="Erstelle oder importiere zuerst einen Stapel." action={<button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-core-subtle px-4 core-body font-semibold text-core-action"><ArrowLeft size={17} aria-hidden="true" />{backLabel}</button>} />
        )}
      </div>
    );
  }
  const activeDeck = deck;

  const activeProfile = activeDeck.deckSettings.learningProfileSource
    ? getLearningProfileTemplate(learningProfiles, activeDeck.deckSettings.learningProfileSource.id)
    : null;
  const coreModeLabel = { off: "Aus", auto: "Automatisch", manual: "Manuell" }[activeDeck.deckSettings.coreMode];
  const sectionItems = [
    { id: "deck", title: "Stapel", status: activeDeck.name, icon: Layers, tone: "success" as const, onSelect: () => scrollToSection("deck-identity") },
    { id: "daily", title: "Tagesrunde & Lernprofile", status: activeProfile?.name ?? "Eigene Einstellungen", icon: CalendarRange, tone: "info" as const, onSelect: () => scrollToSection("deck-daily-profiles") },
    { id: "scheduler", title: "Scheduler & CoRe", status: `${Math.round(activeDeck.deckSettings.schedulerProfile.desiredRetention * 100)} % · CoRe ${coreModeLabel}`, icon: Sparkles, tone: "warning" as const, onSelect: () => scrollToSection("deck-scheduler-core") },
  ];

  function saveIdentity(event: React.FormEvent) {
    event.preventDefault();
    const nextName = nameDraft.trim();
    if (!nextName) {
      setFeedback("Bitte gib einen Stapelnamen ein.");
      return;
    }
    if (nextName !== activeDeck.name) {
      const result = onRenameDeck(activeDeck.id, nextName);
      if (!result || result.error) {
        setFeedback(result?.error ?? "Der Stapel konnte nicht umbenannt werden.");
        return;
      }
      setNameDraft(result.deck?.name ?? nextName);
    }
    onSaveAppearance(activeDeck.id, appearance);
    setFeedback("");
    setSuccessToast("Name und Darstellung wurden gespeichert.");
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await onDeleteDeck(activeDeck.id);
    if (!result) {
      setDeleting(false);
      setFeedback("Der Stapel konnte nicht gelöscht werden.");
      return;
    }
    setDeleteDialogOpen(false);
    setDeleting(false);
  }

  return (
    <div className="grid min-w-0 gap-7" data-testid={`deck-settings-${deck.id}`}>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Stapel-Einstellungen" title={<span className="flex min-w-0 items-center gap-3"><DeckAppearanceIcon appearance={appearance} className="size-11" iconSize={20} data-testid="deck-settings-title-icon" /><span className="min-w-0 break-words" data-testid="deck-settings-title-name">{deck.name}</span></span>} />
        <div className="flex flex-wrap gap-2"><CrossLinkButton onSelect={onOpenGlobalSettings}>Globale Einstellungen</CrossLinkButton><button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-core-border bg-core-surface px-4 core-body font-semibold text-core-action"><ArrowLeft size={17} aria-hidden="true" />{backLabel}</button></div>
      </div>

      <SettingsSectionNavigation ariaLabel="Bereiche der Stapeleinstellungen" items={sectionItems} />

      <section id="deck-identity" className="scroll-mt-6 grid gap-4" aria-labelledby="deck-identity-heading">
        <h2 id="deck-identity-heading" className="core-heading-2 font-semibold text-core-text">Stapel</h2>
        <SoftPanel className="p-5 sm:p-6">
          <form className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end" onSubmit={saveIdentity}>
            <label className="grid min-w-0 gap-2 core-body font-semibold text-core-muted">Name<input className="min-h-11 min-w-0 rounded-xl border border-core-border px-3 text-core-text" value={nameDraft} aria-label="Stapelname" data-testid="deck-settings-name-input" onChange={(event) => { setNameDraft(event.target.value); setFeedback(""); }} /></label>
            <label className="grid gap-2 core-body font-semibold text-core-muted">Icon<DeckIconPicker value={appearance.iconKey} color={appearance.iconColor} onChange={(iconKey) => setAppearance((current) => normalizeDeckAppearance({ ...current, iconKey }))} /></label>
            <label className="grid gap-2 core-body font-semibold text-core-muted">Farbe<ColorWheelPicker value={appearance.iconColor} ariaLabel="Farbe auswählen" className="justify-self-start" onValueCommit={(iconColor) => setAppearance((current) => normalizeDeckAppearance({ ...current, iconColor }))} /></label>
            <ActionButton type="submit" variant="primary" icon={Save} className="md:col-span-3 md:w-fit">Name und Darstellung speichern</ActionButton>
          </form>
          {feedback ? <p className="core-status-error mt-3 core-body" role="alert">{feedback}</p> : null}
          <div className="mt-6 grid gap-3 border-t border-core-border pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <ActionButton type="button" variant="secondary" icon={FolderPlus} className="justify-start" onClick={() => onCreateSubdeck(deck.id)}>Unterstapel anlegen</ActionButton>
            <ActionButton type="button" variant="secondary" icon={Play} className="justify-start" onClick={() => onStartDeck(deck, false)}>Lernen</ActionButton>
            <ActionButton type="button" variant="secondary" icon={Sparkles} className="justify-start" onClick={() => onStartDeck(deck, true)}>Varianten lernen</ActionButton>
            <ActionButton type="button" variant="destructive" icon={Trash2} className="justify-start" onClick={() => setDeleteDialogOpen(true)}>Löschen</ActionButton>
          </div>
        </SoftPanel>
      </section>

      <LearningSettingsPanel settings={deck.deckSettings} profiles={learningProfiles} defaultProfileName={deck.name} onProfilesChange={onSaveLearningProfiles} onSave={(settings) => onSave(deck.id, settings)} />

      <ActionDialog open={deleteDialogOpen} title="Stapelbaum löschen?" description={<div className="grid gap-2"><p>„{deck.name}“ und alle Inhalte dieses Stapelbaums werden als gelöscht markiert.</p><ul className="list-disc pl-5"><li>{Math.max(0, (deckRow?.scopeDeckIds.length ?? 1) - 1)} Unterstapel</li><li>{deckRow?.summary.totalCards ?? 0} {(deckRow?.summary.totalCards ?? 0) === 1 ? "aktive Karte" : "aktive Karten"}</li></ul></div>} confirmLabel="Stapelbaum löschen" cancelLabel="Abbrechen" confirmLoading={deleting} destructive onCancel={() => setDeleteDialogOpen(false)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
