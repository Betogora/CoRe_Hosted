import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { CalendarRange, Download, FolderPlus, Layers, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { DeckSettingsSection } from "../appNavigation.ts";
import type { DeckSettingsSaveScope, DeckSettingsScreenProps, SettingsSaveOutcome } from "../appScreenProps.ts";
import { CARD_VARIANT_BATCH_LIMIT } from "../cardVariantBatch.ts";
import { createDefaultDeckSettings, normalizeDeckAppearance } from "../coreModel.ts";
import { createDeckLibraryModel } from "../libraryModel.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { ColorPicker } from "../ui/ColorPicker.tsx";
import { DeckAppearanceIcon, deckIconOptions, getDeckIcon } from "../ui/deckAppearance.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { CoreNumberField } from "../ui/CoreNumberField.tsx";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { ActionDialog, CoreModeControl, CoreSegmentedControl, EmptyState } from "../ui/coreUi.tsx";
import { SettingsDialogFrame } from "./SettingsDialogFrame.tsx";
import { DeckSelect } from "../ui/selectUi.tsx";
import { createDeckLearningSettingsDraft, createDeckSettingsDraft, normalizeDeckSettingsDraft, settingsDraftsEqual, type DeckLearningSettingsDraft, type DeckSettingsDraft } from "../settingsDraft.ts";

type DeckSettingsArea = Exclude<DeckSettingsSection, "start" | "neue-karten">;

const deckSettingsGroups = [{
  items: [
    { section: "stapel", label: "Stapel", icon: Layers },
    { section: "tagesrunde", label: "Tagesrunde & Lernprofile", icon: CalendarRange },
    { section: "scheduler", label: "Scheduler & CoRe", icon: Sparkles },
  ],
}] as const;

const areaHeadingIds: Record<DeckSettingsArea, string> = {
  stapel: "deck-identity-heading",
  tagesrunde: "deck-daily-heading",
  scheduler: "deck-scheduler-heading",
};

function DeckIconPicker({ value, color, onChange }: { value: string; color: string; onChange: (iconKey: string) => void }) {
  const SelectedIcon = getDeckIcon(value);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label="Icon auswählen" className="grid size-control shrink-0 place-items-center rounded-control border border-core-border bg-core-surface shadow-soft transition-colors hover:border-core-action" style={{ color }}>
          <SelectedIcon size={20} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} collisionPadding={12} aria-label="Icon auswählen" data-testid="deck-icon-popover" className="core-overlay z-[90] w-[min(17rem,calc(100vw-1.5rem))] rounded-panel p-2 outline-none" style={{ color }}>
          <div className="grid grid-cols-5 gap-1" role="group" aria-label="Icon-Auswahl" data-testid="deck-icon-grid">
            {deckIconOptions.map((option) => {
              const Icon = option.icon;
              const selected = option.key === value;
              return (
                <Popover.Close asChild key={option.key}>
                  <button type="button" aria-label={option.label} aria-pressed={selected} className={`grid size-11 place-items-center rounded-control border transition-colors ${selected ? "border-core-action bg-core-subtle" : "border-transparent hover:bg-core-subtle"}`} onClick={() => onChange(option.key)}>
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


const LEECH_ACTION_OPTIONS = [
  { value: "tag", label: "Nur kennzeichnen" },
  { value: "suspend", label: "Aussetzen" },
] as const;

export function DeckSettingsScreen({ section, onSelectSection, deck, decks, learningProfiles, onSaveSettings, onApplyLearningProfile, onSaveLearningProfiles, onDraftStateChange, onRequestContextAction, onCreateSubdeck, onDeleteDeck, onSelectDeck, onOpenGlobalSettings, offlineDeck = null, bodyCache = null, onDownloadDeck, onRemoveDeckDownload, variantGeneration, onClose, footer }: DeckSettingsScreenProps) {
  const { running: variantGenerationRunning = false, cardsWithoutVariant = null } = variantGeneration ?? {};
  const initialDraft = deck ? createDeckSettingsDraft(deck) : null;
  const [baseline, setBaseline] = React.useState<DeckSettingsDraft | null>(initialDraft);
  const [draft, setDraft] = React.useState<DeckSettingsDraft | null>(initialDraft);
  const draftDeckIdRef = React.useRef(deck?.id ?? null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [refreshDialogOpen, setRefreshDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");
  const [offlineBusy, setOfflineBusy] = React.useState(false);
  const targetsNewCards = section === "neue-karten";
  const area: DeckSettingsArea = section === "start" ? "stapel" : targetsNewCards ? "tagesrunde" : section;
  const showAreaList = section === "start";
  const setSuccessToast = useSuccessToast();
  const deckSummaries = useWorkspaceValue((snapshot) => snapshot.deckSummaries);
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
    if (deck) document.getElementById(areaHeadingIds[area])?.focus();
  }, [area, deck?.id]);

  React.useEffect(() => {
    if (!deck || !targetsNewCards) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const field = document.getElementById("learning-settings-new-cards");
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deck?.id, targetsNewCards]);

  const activeDraft = deck && draftDeckIdRef.current === deck.id && draft ? draft : persistedDraft;
  const draftBelongsToDeck = draftDeckIdRef.current === deck?.id;
  const dirty = Boolean(draftBelongsToDeck && activeDraft && baseline && !settingsDraftsEqual(activeDraft, baseline));

  const saveDraft = React.useCallback(async (scope: DeckSettingsSaveScope = "deck"): Promise<SettingsSaveOutcome> => {
    if (!deck || !activeDraft || !baseline) return "failed";
    const normalized = normalizeDeckSettingsDraft(activeDraft);
    if (!normalized.name) {
      setFeedback("Bitte gib einen Stapelnamen ein.");
      return "invalid";
    }
    const result = onSaveSettings(deck.id, normalized, scope, baseline);
    if (!result?.ok || !result.deck) {
      setFeedback(result?.error ?? "Die Stapeleinstellungen konnten nicht gespeichert werden.");
      return "failed";
    }
    const savedDraft = createDeckSettingsDraft(result.deck);
    setBaseline(savedDraft);
    setDraft(savedDraft);
    setFeedback("");
    setSuccessToast(scope === "deck-tree"
      ? "Stapeleinstellungen wurden für den Stapel und alle Unterstapel gespeichert."
      : "Stapeleinstellungen wurden für den Stapel gespeichert.", { appearance: "neutral" });
    return "saved";
  }, [activeDraft, baseline, deck, onSaveSettings, setSuccessToast]);

  const saveDraftRef = React.useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const discardDraft = React.useCallback(() => {
    setDraft(baseline);
    setFeedback("");
  }, [baseline]);
  const discardDraftRef = React.useRef(discardDraft);
  discardDraftRef.current = discardDraft;
  const draftGuard = React.useMemo(() => ({
    save: (scope = "deck") => saveDraftRef.current(scope === "deck-tree" ? "deck-tree" : "deck"),
    discard: () => discardDraftRef.current(),
  }), []);

  React.useEffect(() => {
    onDraftStateChange(dirty ? draftGuard : null);
    return () => onDraftStateChange(null);
  }, [dirty, draftGuard, onDraftStateChange]);

  const deckSwitch = (
    <DeckSelect ariaLabel="Stapel für Einstellungen auswählen" value={deck?.id ?? ""} decks={decks} specialOption={deck ? undefined : { value: "", label: "Stapel auswählen", icon: Layers }} onValueChange={(deckId) => { if (deckId && deckId !== deck?.id) onSelectDeck(deckId); }} testId="deck-settings-select" className="w-full" />
  );

  if (!deck) {
    return (
      <SettingsDialogFrame<DeckSettingsArea>
        title="Stapeleinstellungen"
        closeLabel="Stapeleinstellungen schließen"
        navigationLabel="Bereiche der Stapeleinstellungen"
        testId="deck-settings-dialog"
        groups={[]}
        activeSection="stapel"
        showAreaList={false}
        onSelectSection={onSelectSection}
        onClose={onClose}
      >
        {decks.length > 0 ? (
          <section className="core-settings-section" aria-labelledby="deck-settings-select-heading">
            <h2 id="deck-settings-select-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Stapel auswählen</h2>
            <div className="core-settings-list">
              <div className="core-settings-row">
                <span className="core-settings-row-title">Stapel</span>
                <div className="core-settings-row-control md:w-72">{deckSwitch}</div>
              </div>
            </div>
          </section>
        ) : (
          <EmptyState icon={Layers} title="Noch kein Stapel vorhanden" body="Erstelle oder importiere zuerst einen Stapel." />
        )}
      </SettingsDialogFrame>
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
        : offlineDeck?.state === "error" ? "Download nicht abgeschlossen"
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
    <SettingsDialogFrame<DeckSettingsArea>
      title={<><DeckAppearanceIcon appearance={activeDraft.appearance} className="size-8 shrink-0" iconSize={18} data-testid="deck-settings-title-icon" /><span className="min-w-0 truncate" data-testid="deck-settings-title-name">{deck.name}</span></>}
      closeLabel="Stapeleinstellungen schließen"
      navigationLabel="Bereiche der Stapeleinstellungen"
      testId="deck-settings-dialog"
      groups={deckSettingsGroups}
      activeSection={area}
      showAreaList={showAreaList}
      onSelectSection={onSelectSection}
      onShowAreaList={() => onSelectSection("start")}
      onClose={onClose}
      navigationHeader={<>{deckSwitch}<CrossLinkButton className="w-fit" onSelect={onOpenGlobalSettings}>Standardwerte</CrossLinkButton></>}
      footer={footer}
    >
    <div className="min-w-0" data-testid={`deck-settings-${deck.id}`}>
      {area === "stapel" ? (
        <section id="deck-identity" className="core-settings-section" aria-labelledby="deck-identity-heading">
          <h2 id="deck-identity-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Stapel</h2>
          <div className="core-settings-list" data-testid="deck-settings-primary-controls">
            <div className="core-settings-row">
              <div className="core-settings-row-text">
                <label htmlFor="deck-settings-name" className="core-settings-row-title">Name</label>
                {feedback ? <p className="core-field-error" role="alert">{feedback}</p> : null}
              </div>
              <div className="core-settings-row-control">
                <input id="deck-settings-name" className="core-field min-w-0 md:w-72" value={activeDraft.name} aria-label="Stapelname" data-testid="deck-settings-name-input" onChange={(event) => { setDraft((current) => current ? { ...current, name: event.target.value } : current); setFeedback(""); }} />
              </div>
            </div>
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Icon</span>
              <div className="core-settings-row-control">
                <DeckIconPicker value={activeDraft.appearance.iconKey} color={activeDraft.appearance.iconColor} onChange={(iconKey) => setDraft((current) => current ? { ...current, appearance: normalizeDeckAppearance({ ...current.appearance, iconKey }) } : current)} />
              </div>
            </div>
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Farbe</span>
              <div className="core-settings-row-control">
                <ColorPicker value={activeDraft.appearance.iconColor} ariaLabel="Farbe auswählen" onValueCommit={(iconColor) => setDraft((current) => current ? { ...current, appearance: normalizeDeckAppearance({ ...current.appearance, iconColor }) } : current)} />
              </div>
            </div>
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">CoRe-Modus</span>
              <div className="core-settings-row-control">
                <CoreModeControl value={activeDraft.learning.coreMode} onChange={(coreMode) => changeLearningDraft({ ...activeDraft.learning, coreMode })} />
              </div>
            </div>
            {variantGeneration && createDefaultDeckSettings(deck.deckSettings).coreMode === "on" ? (
              <div className="core-settings-row" data-testid="deck-settings-variant-generation">
                <div className="core-settings-row-text">
                  <span className="core-settings-row-title">Kartenvarianten</span>
                  <p className="core-settings-row-hint" data-testid="deck-settings-variant-count">{variantGenerationRunning ? "Es läuft bereits eine Generierung."
                    : cardsWithoutVariant === null ? `Je eine Variante für bis zu ${CARD_VARIANT_BATCH_LIMIT} Karten, nacheinander im Hintergrund.`
                      : cardsWithoutVariant === 0 ? "Alle Karten haben eine Variante."
                        : `${cardsWithoutVariant.toLocaleString("de-DE")} ${cardsWithoutVariant === 1 ? "Karte" : "Karten"} ohne Variante`}</p>
                </div>
                <div className="core-settings-row-control">
                  {cardsWithoutVariant === 0 ? null : <ActionButton type="button" variant="secondary" icon={Sparkles} disabled={variantGenerationRunning} onClick={() => variantGeneration.start(deck, "missing")}>Varianten generieren</ActionButton>}
                  <ActionButton type="button" variant="secondary" icon={RefreshCw} disabled={variantGenerationRunning} onClick={() => setRefreshDialogOpen(true)}>Varianten neu generieren</ActionButton>
                </div>
              </div>
            ) : null}
            <div className="core-settings-row" data-testid="deck-settings-leech">
              <label htmlFor="deck-settings-leech-threshold" className="core-settings-row-title">Lernbremse ab Fehlern</label>
              <div className="core-settings-row-control">
                <CoreNumberField id="deck-settings-leech-threshold" value={activeDraft.leech.leechThreshold} min={1} max={99} unit="Fehler" className="w-32"
                  onChange={(leechThreshold) => setDraft((current) => current ? { ...current, leech: { ...current.leech, leechThreshold } } : current)} />
                <CoreSegmentedControl
                  ariaLabel="Aktion der Lernbremse"
                  className="core-segmented-touch"
                  options={LEECH_ACTION_OPTIONS}
                  value={activeDraft.leech.leechAction}
                  onValueChange={(leechAction) => setDraft((current) => current ? { ...current, leech: { ...current.leech, leechAction } } : current)}
                />
              </div>
            </div>
            {onDownloadDeck && onRemoveDeckDownload ? (
              <div className="core-settings-row">
                <div className="core-settings-row-text">
                  <span className="core-settings-row-title">Offline-Nutzung</span>
                  <p className="core-settings-row-hint">{offlineLabel}{offlineDeck?.state === "downloading" && offlineDeck.expectedCardCount > 0 ? ` · ${offlineDeck.verifiedCardCount} von ${offlineDeck.expectedCardCount} Karten` : ""}</p>
                </div>
                <div className="core-settings-row-control">
                  {offlineDeck && offlineDeck.state !== "none" ? (
                    <>
                      {offlineDeck.state === "outdated" || offlineDeck.state === "error" ? <ActionButton type="button" variant="primary" icon={Download} disabled={offlineBusy} onClick={() => void updateOfflineDownload(false)}>{offlineDeck.state === "error" ? "Download fortsetzen" : "Aktualisieren"}</ActionButton> : null}
                      <ActionButton type="button" variant="secondary" icon={Trash2} disabled={offlineBusy || offlineDeck.state === "downloading"} onClick={() => void updateOfflineDownload(true)}>Offline-Daten entfernen</ActionButton>
                    </>
                  ) : <ActionButton type="button" variant="primary" icon={Download} disabled={offlineBusy} onClick={() => void updateOfflineDownload(false)}>Offline verfügbar machen</ActionButton>}
                </div>
              </div>
            ) : null}
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Unterstapel</span>
              <div className="core-settings-row-control">
                <ActionButton type="button" variant="secondary" icon={FolderPlus} onClick={() => onRequestContextAction(() => onCreateSubdeck(deck.id))}>Unterstapel anlegen</ActionButton>
              </div>
            </div>
            <div className="core-settings-row" data-layout="inline">
              <div className="core-settings-row-text">
                <span className="core-settings-row-title">Stapel löschen</span>
                <p className="core-settings-row-hint">Markiert den Stapel mit Unterstapeln und Karten als gelöscht.</p>
              </div>
              <div className="core-settings-row-control">
                <ActionButton type="button" variant="destructive" icon={Trash2} onClick={() => onRequestContextAction(() => setDeleteDialogOpen(true))}>Löschen</ActionButton>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <LearningSettingsPanel section={area === "tagesrunde" ? "daily" : "scheduler"} draft={activeDraft.learning} profiles={learningProfiles} defaultProfileName={deck.name} onProfilesChange={onSaveLearningProfiles} onDraftChange={changeLearningDraft} onApplyProfile={applyLearningProfile} />
      )}
    </div>

      <ActionDialog open={deleteDialogOpen} title="Stapelbaum löschen?" description={<div className="grid gap-2"><p>„{deck.name}“ und alle Inhalte dieses Stapelbaums werden als gelöscht markiert.</p><ul className="list-disc pl-6"><li>{deckRow?.descendantCount ?? 0} Unterstapel</li><li>{deckRow?.summary.totalCards ?? 0} {(deckRow?.summary.totalCards ?? 0) === 1 ? "aktive Karte" : "aktive Karten"}</li></ul></div>} confirmLabel="Stapelbaum löschen" cancelLabel="Abbrechen" confirmLoading={deleting} destructive onCancel={() => setDeleteDialogOpen(false)} onConfirm={() => void confirmDelete()} />
      <ActionDialog
        open={refreshDialogOpen}
        title="Varianten neu generieren?"
        description={`Karten, deren Varianten aus einer älteren Version der Generierung stammen, erhalten je eine neue Variante – bis zu ${CARD_VARIANT_BATCH_LIMIT} pro Durchgang. Ihre bisherigen Varianten werden dabei gelöscht, auch abgeschaltete und gemeldete. Lernstand und Karten bleiben unverändert.`}
        confirmLabel="Neu generieren"
        cancelLabel="Abbrechen"
        actionIcons={{ confirm: RefreshCw }}
        onCancel={() => setRefreshDialogOpen(false)}
        onConfirm={() => {
          setRefreshDialogOpen(false);
          variantGeneration?.start(deck, "refresh");
        }}
      />
    </SettingsDialogFrame>
  );
}
