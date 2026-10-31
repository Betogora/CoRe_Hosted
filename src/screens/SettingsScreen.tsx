import React from "react";
import { CircleHelp, Database, FileText, Info, RefreshCw, User, X } from "lucide-react";
import { formatSyncStatusText } from "../accountSession.ts";
import { APP_RUNTIME_INFO } from "../appRuntime.ts";
import type { SettingsSaveOutcome, SettingsScreenProps } from "../appScreenProps.ts";
import type { SyncIntervalMinutes } from "../coreTypes.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { InPageNavigation } from "../ui/InPageNavigation.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { createGeneralSettingsDraft, settingsDraftsEqual, type GeneralSettingsDraft } from "../settingsDraft.ts";
import { SyncConflictPanel } from "./SyncConflictPanel.tsx";
import { formatStorageBytes } from "../workspaceStorage.ts";

const sectionIds = {
  account: "settings-account",
  data: "settings-data-sync",
  conflicts: "settings-sync-conflicts",
  about: "settings-about",
} as const;

const settingsSections = [
  { id: sectionIds.account, label: "Konto", icon: User },
  { id: sectionIds.data, label: "Daten & Synchronisierung", icon: Database },
  { id: sectionIds.about, label: "Über uns", icon: Info },
] as const;

const syncIntervalOptions = [
  { value: "0", label: "Aus – nur manuell" },
  { value: "1", label: "Jede Minute" },
  { value: "5", label: "Alle 5 Minuten" },
  { value: "15", label: "Alle 15 Minuten" },
  { value: "30", label: "Alle 30 Minuten" },
];

export function SettingsScreen({ profile, syncStatus, settingsTarget = null, lastSyncedAt = null, storageStatus = null, onSaveSettings, onDraftStateChange, onSyncNow, onListConflicts, onResolveConflict, onSignOut, onNavigate }: SettingsScreenProps) {
  const persistedDraft = createGeneralSettingsDraft(profile);
  const persistedDraftKey = JSON.stringify(persistedDraft);
  const [baseline, setBaseline] = React.useState<GeneralSettingsDraft>(persistedDraft);
  const [draft, setDraft] = React.useState<GeneralSettingsDraft>(persistedDraft);
  const [accountMessage, setAccountMessage] = React.useState("");
  const [accountBusy, setAccountBusy] = React.useState(false);
  const setSuccessToast = useSuccessToast();
  React.useEffect(() => {
    setDraft((current) => settingsDraftsEqual(current, baseline) ? persistedDraft : current);
    setBaseline(persistedDraft);
  }, [persistedDraftKey]);

  const dirty = !settingsDraftsEqual(draft, baseline);

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
    <div className="grid min-w-0 gap-6">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Profil" title="Allgemeine Einstellungen" />
        <CrossLinkButton onSelect={() => onNavigate("karten-einstellungen")}>
          Lerneinstellungen
        </CrossLinkButton>
      </div>

      <InPageNavigation ariaLabel="Bereiche der allgemeinen Einstellungen" items={settingsSections} targetId={settingsTarget === "sync-conflicts" ? sectionIds.conflicts : settingsTarget === "sync" ? sectionIds.data : null}>
      <section id={sectionIds.account} className="grid gap-4" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" tabIndex={-1} className="core-heading-2 font-semibold text-core-text outline-none">Konto</h2>
        <SoftPanel className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <OrbIcon icon={User} />
            <h3 className="core-heading-3 font-semibold text-core-text">Profil</h3>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="grid content-start gap-2 core-field-label">
              Anzeigename
              <input className="core-field min-w-0" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} />
            </label>
            <label className="grid content-start gap-2 core-field-label">
              Login-E-Mail
              <input className="core-field min-w-0 bg-core-subtle text-core-muted shadow-none" value={profile.email} readOnly aria-describedby="login-email-help" />
              <span id="login-email-help" className="core-caption text-core-muted">Die Login-E-Mail kann derzeit nicht in CoRe geändert werden.</span>
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <ActionButton type="button" variant="destructive" icon={X} onClick={() => void signOut()} disabled={accountBusy}>Abmelden</ActionButton>
          </div>
          {accountMessage ? <p className="core-status-error mt-3 core-body" role="alert">{accountMessage}</p> : null}
        </SoftPanel>
      </section>

      <section id={sectionIds.data} className="grid gap-4" aria-labelledby="settings-data-heading">
        <h2 id="settings-data-heading" tabIndex={-1} className="core-heading-2 font-semibold text-core-text outline-none">Daten & Synchronisierung</h2>
        <SoftPanel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="core-heading-3 font-semibold text-core-text">Synchronisierung</h3>
              <p className="mt-1 core-body text-core-secondary">{formatSyncStatusText(syncStatus)}</p>
              {lastSyncedAt ? <p className="mt-1 core-caption text-core-muted">Zuletzt erfolgreich: {new Date(lastSyncedAt).toLocaleString("de-DE")}</p> : null}
              {(syncStatus.status === "pending" || syncStatus.status === "offline") && syncStatus.pendingCount ? <p className="mt-1 core-caption text-core-muted">Ausstehende Änderungen: {syncStatus.pendingCount}</p> : null}
            </div>
            <ActionButton type="button" variant="primary" icon={RefreshCw} onClick={() => void syncNow()} loading={syncStatus.status === "saving"} disabled={accountBusy}>Jetzt synchronisieren</ActionButton>
          </div>
          <div className="mt-6 grid gap-3 border-t border-core-border pt-6 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-end">
            <label className="grid gap-2 core-field-label">
              Automatisch synchronisieren
              <CoreSelect
                ariaLabel="Intervall der automatischen Synchronisierung"
                value={String(draft.syncIntervalMinutes)}
                options={syncIntervalOptions}
                testId="settings-sync-interval"
                onValueChange={(value) => setDraft((current) => ({ ...current, syncIntervalMinutes: Number(value) as SyncIntervalMinutes }))}
              />
            </label>
          </div>
          <p className="mt-2 core-caption text-core-muted">Lokale Änderungen bleiben sicher in diesem Browser gespeichert. Beim nächsten vollständigen Abgleich werden nur Änderungen übertragen und neue Cloud-Daten geladen.</p>
          {storageStatus ? (
            <div className="mt-4 grid gap-1 rounded-control border border-core-border bg-core-subtle px-4 py-3 core-caption text-core-muted" data-testid="workspace-storage-status">
              <p className="core-field-label">Lokaler Gerätespeicher: {storageStatus.persisted ? "dauerhaft freigegeben" : storageStatus.supported ? "Best Effort" : "nicht unterstützt"}</p>
              <p>Belegt: {formatStorageBytes(storageStatus.usage)} von {formatStorageBytes(storageStatus.quota)}. Medien werden im Browser weiterhin selektiv offline gehalten.</p>
            </div>
          ) : null}
        </SoftPanel>
        <SyncConflictPanel id={sectionIds.conflicts} onListConflicts={onListConflicts} onResolveConflict={onResolveConflict} />
      </section>

      <section id={sectionIds.about} className="grid gap-4" aria-labelledby="settings-about-heading">
        <h2 id="settings-about-heading" tabIndex={-1} className="core-heading-2 font-semibold text-core-text outline-none">Über uns</h2>
        <SoftPanel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <OrbIcon icon={CircleHelp} />
              <div className="min-w-0">
                <h3 className="core-heading-3 font-semibold text-core-text">Über CoRe</h3>
                <p className="mt-1 core-body text-core-secondary">Erfahre, wie CoRe nachhaltiges Lernen mit Active Recall, FSRS und Kartenvarianten unterstützt.</p>
              </div>
            </div>
            <CrossLinkButton onSelect={() => onNavigate("hilfe")}>Info-Seite öffnen</CrossLinkButton>
          </div>

          <div className="mt-6 border-t border-core-border pt-6">
            <h3 className="core-heading-3 font-semibold text-core-text">Rechtliches</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {["Impressum", "Datenschutzerklärung"].map((label) => (
                <div key={label} className="rounded-control border border-core-border bg-core-subtle px-4 py-3">
                  <dt className="flex items-center gap-2 core-control-label text-core-text"><FileText className="text-core-muted" size={16} aria-hidden="true" />{label}</dt>
                  <dd className="mt-1 pl-6 core-caption text-core-muted">In Vorbereitung</dd>
                </div>
              ))}
            </dl>
          </div>

          <dl className="mt-6 border-t border-core-border pt-6">
            <div className="flex items-center justify-between gap-4">
              <dt className="core-field-label">Version</dt>
              <dd className="core-body tabular-nums text-core-muted" aria-label="Aktuelle Version">{`v${APP_RUNTIME_INFO.version}`}</dd>
            </div>
          </dl>
        </SoftPanel>
      </section>
      </InPageNavigation>
    </div>
  );
}
