import React from "react";
import { Copy, RefreshCw, X } from "lucide-react";
import { formatSyncStatusText } from "../accountSession.ts";
import { APP_RUNTIME_INFO } from "../appRuntime.ts";
import type { SettingsSaveOutcome, SettingsScreenProps } from "../appScreenProps.ts";
import type { SyncIntervalMinutes } from "../coreTypes.ts";
import { readFieldTimings } from "../fieldTimings.ts";
import { formatFieldTimingsReport, readFieldTimingContext } from "../fieldTimingsReport.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { CoreSegmentedControl } from "../ui/coreUi.tsx";
import { ColorPicker } from "../ui/ColorPicker.tsx";
import { useHeatmapHistoryColor } from "../ui/StudyHeatmap.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { createGeneralSettingsDraft, settingsDraftsEqual, type GeneralSettingsDraft } from "../settingsDraft.ts";
import { SyncConflictPanel } from "./SyncConflictPanel.tsx";
import { formatStorageBytes } from "../workspaceStorage.ts";
import { useWorkspaceStore, useWorkspaceValue } from "../useWorkspaceStore.ts";

const sectionIds = {
  account: "settings-account",
  appearance: "settings-appearance",
  data: "settings-data-sync",
  conflicts: "settings-sync-conflicts",
  about: "settings-about",
} as const;

const headingIds = {
  konto: "settings-account-heading",
  darstellung: "settings-appearance-heading",
  daten: "settings-data-heading",
  ueber: "settings-about-heading",
} as const;

const syncIntervalOptions = [
  { value: "0", label: "Aus" },
  { value: "1", label: "1" },
  { value: "5", label: "5" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
];

export function SettingsScreen({ section, focusConflicts = false, profile, onSaveSettings, onDraftStateChange, onSyncNow, onListConflicts, onResolveConflict, onSignOut, onNavigate }: SettingsScreenProps) {
  const { syncStatus, lastSyncedAt, storageStatus } = useWorkspaceValue(({ syncStatus, lastSyncedAt, storageStatus }) => ({ syncStatus, lastSyncedAt, storageStatus }));
  const persistedDraft = createGeneralSettingsDraft(profile);
  const persistedDraftKey = JSON.stringify(persistedDraft);
  const [baseline, setBaseline] = React.useState<GeneralSettingsDraft>(persistedDraft);
  const [draft, setDraft] = React.useState<GeneralSettingsDraft>(persistedDraft);
  const [accountMessage, setAccountMessage] = React.useState("");
  const [accountBusy, setAccountBusy] = React.useState(false);
  const setSuccessToast = useSuccessToast();
  const [heatmapColor, setHeatmapColor] = useHeatmapHistoryColor();
  const workspaceStore = useWorkspaceStore();
  const fieldTimingsAvailable = React.useMemo(() => section === "ueber" && Object.keys(readFieldTimings()).length > 0, [section]);
  React.useEffect(() => {
    setDraft((current) => settingsDraftsEqual(current, baseline) ? persistedDraft : current);
    setBaseline(persistedDraft);
  }, [persistedDraftKey]);

  const dirty = !settingsDraftsEqual(draft, baseline);

  React.useEffect(() => {
    const target = document.getElementById(focusConflicts ? `${sectionIds.conflicts}-heading` : headingIds[section]);
    target?.focus();
    if (focusConflicts) target?.scrollIntoView({ block: "start" });
  }, [focusConflicts, section]);

  const saveDraft = React.useCallback(async (): Promise<SettingsSaveOutcome> => {
    const normalized: GeneralSettingsDraft = {
      displayName: draft.displayName.trim(),
      syncIntervalMinutes: draft.syncIntervalMinutes,
    };
    try {
      const saved = await onSaveSettings(normalized);
      if (!saved) throw new Error("Allgemeine Einstellungen konnten nicht gespeichert werden.");
      const savedDraft = { ...normalized, displayName: saved.displayName };
      setBaseline(savedDraft);
      setDraft(savedDraft);
      setAccountMessage("");
      setSuccessToast("Allgemeine Einstellungen wurden gespeichert.", { appearance: "neutral" });
      return "saved";
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Allgemeine Einstellungen konnten nicht gespeichert werden.");
      return "failed";
    }
  }, [draft, onSaveSettings, setSuccessToast]);

  const saveDraftRef = React.useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const discardDraft = React.useCallback(() => {
    setDraft(baseline);
    setAccountMessage("");
  }, [baseline]);
  const discardDraftRef = React.useRef(discardDraft);
  discardDraftRef.current = discardDraft;
  const draftGuard = React.useMemo(() => ({
    save: () => saveDraftRef.current(),
    discard: () => discardDraftRef.current(),
  }), []);

  React.useEffect(() => {
    onDraftStateChange(dirty ? draftGuard : null);
    return () => onDraftStateChange(null);
  }, [dirty, draftGuard, onDraftStateChange]);

  async function syncNow() {
    setAccountBusy(true);
    setSuccessToast("");
    try {
      await onSyncNow();
      setAccountMessage("");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Synchronisierung fehlgeschlagen.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function copyFieldTimings() {
    try {
      await navigator.clipboard.writeText(formatFieldTimingsReport(readFieldTimings(), readFieldTimingContext(workspaceStore.get().deckSummaries)));
      setSuccessToast("Leistungsdaten kopiert.");
    } catch {
      setSuccessToast("Leistungsdaten konnten nicht kopiert werden.", { appearance: "neutral" });
    }
  }

  async function signOut() {
    setAccountBusy(true);
    try {
      await onSignOut();
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Abmeldung fehlgeschlagen.");
    } finally {
      setAccountBusy(false);
    }
  }

  return (
    <>
      {section === "konto" ? (
        <section id={sectionIds.account} className="core-settings-section" aria-labelledby="settings-account-heading">
          <h2 id="settings-account-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Konto</h2>
          <div className="core-settings-list">
            <div className="core-settings-row">
              <label htmlFor="settings-display-name" className="core-settings-row-title">Anzeigename</label>
              <div className="core-settings-row-control">
                <input id="settings-display-name" className="core-field min-w-0 md:w-72" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} />
              </div>
            </div>
            <div className="core-settings-row">
              <div className="core-settings-row-text">
                <label htmlFor="settings-login-email" className="core-settings-row-title">Login-E-Mail</label>
                <p id="login-email-help" className="core-settings-row-hint">Derzeit in CoRe nicht änderbar.</p>
              </div>
              <div className="core-settings-row-control">
                <input id="settings-login-email" readOnly className="core-settings-row-value w-full min-w-0 bg-transparent outline-none md:w-72 md:text-right" value={profile.email} aria-describedby="login-email-help" />
              </div>
            </div>
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Abmelden</span>
              <div className="core-settings-row-control">
                <ActionButton type="button" variant="destructive-secondary" icon={X} onClick={() => void signOut()} disabled={accountBusy}>Abmelden</ActionButton>
              </div>
            </div>
          </div>
          {accountMessage ? <p className="core-status-error core-body" role="alert">{accountMessage}</p> : null}
        </section>
      ) : null}

      {section === "darstellung" ? (
        <section id={sectionIds.appearance} className="core-settings-section" aria-labelledby="settings-appearance-heading">
          <h2 id="settings-appearance-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Darstellung</h2>
          <div className="core-settings-list">
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Heatmap-Farbe</span>
              <div className="core-settings-row-control">
                <ColorPicker ariaLabel="Heatmap-Farbe ändern" value={heatmapColor} onValueCommit={setHeatmapColor} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {section === "daten" ? (
        <section id={sectionIds.data} className="core-settings-section" aria-labelledby="settings-data-heading">
          <h2 id="settings-data-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Daten & Synchronisierung</h2>
          <div className="core-settings-list">
            <div className="core-settings-row">
              <div className="core-settings-row-text">
                <span className="core-settings-row-title">Synchronisierung</span>
                <p className="core-settings-row-hint">{formatSyncStatusText(syncStatus)}</p>
                {lastSyncedAt ? <p className="core-settings-row-hint">Zuletzt erfolgreich: {new Date(lastSyncedAt).toLocaleString("de-DE")}</p> : null}
                {(syncStatus.status === "pending" || syncStatus.status === "offline") && syncStatus.pendingCount ? <p className="core-settings-row-hint">Ausstehende Änderungen: {syncStatus.pendingCount}</p> : null}
              </div>
              <div className="core-settings-row-control">
                <ActionButton type="button" variant="primary" icon={RefreshCw} onClick={() => void syncNow()} loading={syncStatus.status === "saving"} disabled={accountBusy}>Jetzt synchronisieren</ActionButton>
              </div>
            </div>
            <div className="core-settings-row">
              <div className="core-settings-row-text">
                <span className="core-settings-row-title">Automatisch synchronisieren</span>
                <p className="core-settings-row-hint">Abstand in Minuten. Bis zum Abgleich bleiben Änderungen in diesem Browser.</p>
              </div>
              <div className="core-settings-row-control" data-testid="settings-sync-interval">
                <CoreSegmentedControl
                  ariaLabel="Intervall der automatischen Synchronisierung"
                  value={String(draft.syncIntervalMinutes)}
                  options={syncIntervalOptions}
                  className="w-full md:w-auto"
                  onValueChange={(value) => setDraft((current) => ({ ...current, syncIntervalMinutes: Number(value) as SyncIntervalMinutes }))}
                />
              </div>
            </div>
            {storageStatus ? (
              <div className="core-settings-row" data-layout="inline" data-testid="workspace-storage-status">
                <div className="core-settings-row-text">
                  <span className="core-settings-row-title">Lokaler Gerätespeicher</span>
                  <p className="core-settings-row-hint">Belegt: {formatStorageBytes(storageStatus.usage)} von {formatStorageBytes(storageStatus.quota)}</p>
                </div>
                <div className="core-settings-row-control">
                  <span className="core-settings-row-value">{storageStatus.persisted ? "Dauerhaft" : storageStatus.supported ? "Nicht dauerhaft" : "Nicht unterstützt"}</span>
                </div>
              </div>
            ) : null}
          </div>
          <SyncConflictPanel id={sectionIds.conflicts} onListConflicts={onListConflicts} onResolveConflict={onResolveConflict} />
        </section>
      ) : null}

      {section === "ueber" ? (
        <section id={sectionIds.about} className="core-settings-section" aria-labelledby="settings-about-heading">
          <h2 id="settings-about-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Über uns</h2>
          <dl className="core-settings-list">
            <div className="core-settings-row" data-layout="inline">
              <dt className="core-settings-row-title">Über CoRe</dt>
              <dd className="core-settings-row-control">
                <CrossLinkButton onSelect={() => onNavigate("hilfe")}>Info-Seite öffnen</CrossLinkButton>
              </dd>
            </div>
            {["Impressum", "Datenschutzerklärung"].map((label) => (
              <div key={label} className="core-settings-row" data-layout="inline">
                <dt className="core-settings-row-title">{label}</dt>
                <dd className="core-settings-row-control core-settings-row-value">In Vorbereitung</dd>
              </div>
            ))}
            <div className="core-settings-row" data-layout="inline">
              <dt className="core-settings-row-title">Version</dt>
              <dd className="core-settings-row-control core-settings-row-value" aria-label="Aktuelle Version">{`v${APP_RUNTIME_INFO.version}`}</dd>
            </div>
            <div className="core-settings-row">
              <dt className="core-settings-row-title">Leistungsdaten</dt>
              <dd className="core-settings-row-control">
                <ActionButton type="button" variant="secondary" icon={Copy} disabled={!fieldTimingsAvailable} onClick={() => void copyFieldTimings()}>Leistungsdaten kopieren</ActionButton>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </>
  );
}
