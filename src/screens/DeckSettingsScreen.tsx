import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { ArrowLeft, CalendarRange, Download, FolderPlus, Layers, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { DeckSettingsScreenProps } from "../appScreenProps.ts";
import { normalizeDeckAppearance } from "../coreModel.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { ColorWheelPicker } from "../ui/ColorWheelPicker.tsx";
import { DeckAppearanceIcon, deckIconOptions, getDeckIcon } from "../ui/deckAppearance.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { ActionDialog, CoreModeControl, EmptyState, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { InPageNavigation } from "../ui/InPageNavigation.tsx";
import { DeckSelect } from "../ui/selectUi.tsx";
import { createDeckLearningSettingsDraft, createDeckSettingsDraft, normalizeDeckSettingsDraft, settingsDraftsEqual, type DeckLearningSettingsDraft, type DeckSettingsDraft } from "../settingsDraft.ts";

const deckSettingsSections = [
  { id: "deck-identity", label: "Stapel", icon: Layers },
  { id: "deck-daily-profiles", label: "Tagesrunde & Lernprofile", icon: CalendarRange },
  { id: "deck-scheduler-core", label: "Scheduler & CoRe", icon: Sparkles },
] as const;

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
        <Popover.Content align="end" sideOffset={6} collisionPadding={12} aria-label="Icon auswählen" data-testid="deck-icon-popover" className="core-overlay z-50 w-[min(17rem,calc(100vw-1.5rem))] rounded-xl p-3 outline-none" style={{ color }}>
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

export function DeckSettingsScreen({ deck, decks, deckSummaries, learningProfiles, settingsTarget = null, onSaveSettings, onApplyLearningProfile, onSaveLearningProfiles, onDraftStateChange, onRequestContextAction, onCreateSubdeck, onDeleteDeck, onSelectDeck, onOpenGlobalSettings, offlineDeck = null, bodyCache = null, onDownloadDeck, onRemoveDeckDownload, onBack, backLabel = "Zurück zu Lernen" }: DeckSettingsScreenProps) {
  const initialDraft = deck ? createDeckSettingsDraft(deck) : null;
  const [baseline, setBaseline] = React.useState<DeckSettingsDraft | null>(initialDraft);
  const [draft, setDraft] = React.useState<DeckSettingsDraft | null>(initialDraft);
  const draftDeckIdRef = React.useRef(deck?.id ?? null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [offlineBusy, setOfflineBusy] = React.useState(false);
  const setSuccessToast = useSuccessToast();
  const deckRow = React.useMemo(() => deleteDialogOpen && deck ? createDeckLibraryModel(decks, { deckSummaries }).rows.find((row) => row.id === deck.id) ?? null : null, [deck, decks, deckSummaries, deleteDialogOpen]);

  const persistedDraft = deck ? createDeckSettingsDraft(deck) : null;
  const persistedDraftKey = JSON.stringify(persistedDraft);

  React.useEffect(() => {
    if (!persistedDraft || !deck) {
      draftDeckIdRef.current = null;
      setBaseline(null);
      setDraft(null);
      return;
    }
    const changedDeck = draftDeckIdRef.current !== deck.id;
    setDraft((current) => changedDeck || (current && baseline && settingsDraftsEqual(current, baseline)) ? persistedDraft : current);
    setBaseline(persistedDraft);
    draftDeckIdRef.current = deck.id;
    setFeedback("");
  }, [deck?.id, persistedDraftKey]);

  React.useEffect(() => {
    if (!deck || settingsTarget !== "new-cards-per-day") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const field = document.getElementById("learning-settings-new-cards");
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deck?.id, settingsTarget]);

  const activeDraft = deck && draftDeckIdRef.current === deck.id && draft ? draft : persistedDraft;
  const draftBelongsToDeck = draftDeckIdRef.current === deck?.id;
  const dirty = Boolean(draftBelongsToDeck && activeDraft && baseline && !settingsDraftsEqual(activeDraft, baseline));

  const saveDraft = React.useCallback(async () => {
    if (!deck || !activeDraft) return false;
    const normalized = normalizeDeckSettingsDraft(activeDraft);
    if (!normalized.name) {
      setFeedback("Bitte gib einen Stapelnamen ein.");
      return false;
    }
    const result = onSaveSettings(deck.id, normalized);
    if (!result?.ok || !result.deck) {
      setFeedback(result?.error ?? "Die Stapeleinstellungen konnten nicht gespeichert werden.");
      return false;
    }
    const savedDraft = createDeckSettingsDraft(result.deck);
    setBaseline(savedDraft);
    setDraft(savedDraft);
    setFeedback("");
    setSuccessToast("Stapeleinstellungen wurden gespeichert.");
    return true;
  }, [activeDraft, deck, onSaveSettings, setSuccessToast]);

  const saveDraftRef = React.useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const draftGuard = React.useMemo(() => ({
    save: () => saveDraftRef.current(),
  }), []);

  React.useEffect(() => {
    onDraftStateChange(dirty ? draftGuard : null);
    return () => onDraftStateChange(null);
  }, [dirty, draftGuard, onDraftStateChange]);

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
  if (!activeDraft) return null;
  const activeDeck = deck;

  function changeLearningDraft(learning: DeckLearningSettingsDraft) {
    setDraft((current) => current ? { ...current, learning } : current);
  }

  function applyLearningProfile(learning: DeckLearningSettingsDraft): boolean {
    const savedDeck = onApplyLearningProfile(activeDeck.id, learning);
    if (!savedDeck) {
      setFeedback("Das Lernprofil konnte nicht auf diesen Stapel angewandt werden.");
      return false;
    }
    const savedLearning = createDeckLearningSettingsDraft(savedDeck.deckSettings);
    setBaseline((current) => current ? { ...current, learning: savedLearning } : current);
    setDraft((current) => current ? { ...current, learning: savedLearning } : current);
    setFeedback("");
    return true;
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

  const offlineLabel = offlineDeck?.state === "downloading" ? "Wird heruntergeladen …"
    : offlineDeck?.state === "available" ? "Offline verfügbar"
      : offlineDeck?.state === "outdated" ? "Aktualisierung ausstehend"
        : offlineDeck?.state === "error" ? "Download fehlgeschlagen"
          : bodyCache && bodyCache.cached + bodyCache.downloaded > 0 ? "Teilweise zwischengespeichert" : "Nur online";

  async function updateOfflineDownload(remove = false) {
    if (!onDownloadDeck || !onRemoveDeckDownload) return;
    setOfflineBusy(true);
    setFeedback("");
    try {
      if (remove) await onRemoveDeckDownload(activeDeck.id);
      else await onDownloadDeck(activeDeck.id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Offline-Daten konnten nicht aktualisiert werden.");
    } finally {
      setOfflineBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-7" data-testid={`deck-settings-${deck.id}`}>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Stapel-Einstellungen" title={<span className="flex min-w-0 items-center gap-3"><DeckAppearanceIcon appearance={activeDraft.appearance} className="size-11" iconSize={20} data-testid="deck-settings-title-icon" /><span className="min-w-0 break-words" data-testid="deck-settings-title-name">{deck.name}</span></span>} />
        <div className="flex flex-wrap gap-2"><CrossLinkButton onSelect={onOpenGlobalSettings}>Globale Einstellungen</CrossLinkButton><button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-core-border bg-core-surface px-4 core-body font-semibold text-core-action"><ArrowLeft size={17} aria-hidden="true" />{backLabel}</button></div>
      </div>

      <InPageNavigation ariaLabel="Bereiche der Stapeleinstellungen" items={deckSettingsSections}>
      <section id="deck-identity" className="grid gap-4" aria-labelledby="deck-identity-heading">
        <h2 id="deck-identity-heading" tabIndex={-1} className="core-heading-2 rounded-lg font-semibold text-core-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4">Stapel</h2>
        <SoftPanel className="p-5 sm:p-6">
          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <label className="grid min-w-0 gap-2 core-body font-semibold text-core-muted">Name<input className="min-h-11 min-w-0 rounded-xl border border-core-border px-3 text-core-text" value={activeDraft.name} aria-label="Stapelname" data-testid="deck-settings-name-input" onChange={(event) => { setDraft((current) => current ? { ...current, name: event.target.value } : current); setFeedback(""); }} /></label>
            <label className="grid gap-2 core-body font-semibold text-core-muted">Icon<DeckIconPicker value={activeDraft.appearance.iconKey} color={activeDraft.appearance.iconColor} onChange={(iconKey) => setDraft((current) => current ? { ...current, appearance: normalizeDeckAppearance({ ...current.appearance, iconKey }) } : current)} /></label>
            <label className="grid gap-2 core-body font-semibold text-core-muted">Farbe<ColorWheelPicker value={activeDraft.appearance.iconColor} ariaLabel="Farbe auswählen" className="justify-self-start" onValueCommit={(iconColor) => setDraft((current) => current ? { ...current, appearance: normalizeDeckAppearance({ ...current.appearance, iconColor }) } : current)} /></label>
          </div>
          {feedback ? <p className="core-status-error mt-3 core-body" role="alert">{feedback}</p> : null}
          <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end" data-testid="deck-settings-primary-controls">
            <ActionButton type="button" variant="secondary" icon={FolderPlus} className="justify-start" onClick={() => onRequestContextAction(() => onCreateSubdeck(deck.id))}>Unterstapel anlegen</ActionButton>
            <div className="grid gap-2">
              <span className="core-body font-semibold text-core-muted">CoRe-Modus</span>
              <CoreModeControl value={activeDraft.learning.coreMode} onChange={(coreMode) => changeLearningDraft({ ...activeDraft.learning, coreMode })} />
            </div>
            <ActionButton type="button" variant="destructive" icon={Trash2} className="justify-start" onClick={() => onRequestContextAction(() => setDeleteDialogOpen(true))}>Löschen</ActionButton>
          </div>
          {onDownloadDeck && onRemoveDeckDownload ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-core-border bg-core-subtle p-4">
              <div>
                <p className="core-body font-semibold text-core-text">Offline-Nutzung</p>
                <p className="mt-1 core-caption text-core-muted">{offlineLabel}{offlineDeck?.state === "downloading" && offlineDeck.expectedCardCount > 0 ? ` · ${offlineDeck.verifiedCardCount} von ${offlineDeck.expectedCardCount} Karten` : ""}</p>
              </div>
              {offlineDeck && offlineDeck.state !== "none" ? (
                <div className="flex flex-wrap gap-2">
                  {offlineDeck.state === "outdated" || offlineDeck.state === "error" ? <ActionButton type="button" variant="primary" icon={Download} disabled={offlineBusy} onClick={() => void updateOfflineDownload(false)}>Aktualisieren</ActionButton> : null}
                  <ActionButton type="button" variant="secondary" icon={Trash2} disabled={offlineBusy || offlineDeck.state === "downloading"} onClick={() => void updateOfflineDownload(true)}>Offline-Daten entfernen</ActionButton>
                </div>
              ) : <ActionButton type="button" variant="primary" icon={Download} disabled={offlineBusy} onClick={() => void updateOfflineDownload(false)}>Offline verfügbar machen</ActionButton>}
            </div>
          ) : null}
        </SoftPanel>
      </section>

      <LearningSettingsPanel draft={activeDraft.learning} profiles={learningProfiles} defaultProfileName={deck.name} onProfilesChange={onSaveLearningProfiles} onDraftChange={changeLearningDraft} onApplyProfile={applyLearningProfile} />
      </InPageNavigation>

      <ActionDialog open={deleteDialogOpen} title="Stapelbaum löschen?" description={<div className="grid gap-2"><p>„{deck.name}“ und alle Inhalte dieses Stapelbaums werden als gelöscht markiert.</p><ul className="list-disc pl-5"><li>{Math.max(0, (deckRow?.scopeDeckIds.length ?? 1) - 1)} Unterstapel</li><li>{deckRow?.summary.totalCards ?? 0} {(deckRow?.summary.totalCards ?? 0) === 1 ? "aktive Karte" : "aktive Karten"}</li></ul></div>} confirmLabel="Stapelbaum löschen" cancelLabel="Abbrechen" confirmLoading={deleting} destructive onCancel={() => setDeleteDialogOpen(false)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
