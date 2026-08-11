import React from "react";
import { CalendarClock, ChevronRight, CircleHelp, Database, Download, GraduationCap, Languages, Lock, RefreshCw, Save, Upload, User, X } from "lucide-react";
import { formatSyncStatusText } from "../accountSession.ts";
import type { SettingsScreenProps } from "../appScreenProps.ts";
import { mergePortableExportIntoState, PORTABLE_EXPORT_FILE_NAME, stringifyPortableExport, validatePortableExport } from "../dataPortability.ts";
import { getCustomGlobalDeckSettings } from "../deckSettings.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { ActionButton } from "../ui/actionUi.tsx";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { PomodoroTimerControl } from "../ui/pomodoroTimerUi.tsx";
import { ReleaseInfo } from "../ui/ReleaseInfo.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { SyncConflictPanel } from "./SyncConflictPanel.tsx";

const languageOptions = [{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }];

export function SettingsScreen({ appState, profile, syncStatus, globalDeckSettings, onSaveProfile, onSaveGlobalLearningSettings, onSaveState, onSyncNow, onListConflicts, onResolveConflict, onSignOut, onNavigate, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onStartPomodoro }: SettingsScreenProps) {
  const [form, setForm] = React.useState(profile);
  const [accountMessage, setAccountMessage] = React.useState("");
  const [accountBusy, setAccountBusy] = React.useState(false);
  const setSuccessToast = useSuccessToast();
  const [exportText, setExportText] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [portabilityMessage, setPortabilityMessage] = React.useState("");

  React.useEffect(() => {
    setForm(profile);
  }, [profile]);

  function update(key: string, value: string) {
    setForm((current: any) => ({ ...current, [key]: value }));
  }

  function save() {
    onSaveProfile({ ...form, email: profile.email });
    setAccountMessage("");
    setSuccessToast("Profil wurde erfolgreich gespeichert. Die Cloud-Synchronisierung läuft automatisch.");
  }

  async function syncNow() {
    setAccountBusy(true);
    setSuccessToast("");
    try {
      await onSyncNow?.();
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
      await onSignOut?.();
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Abmeldung fehlgeschlagen.");
    } finally {
      setAccountBusy(false);
    }
  }

  function createExportText() {
    const text = stringifyPortableExport(appState);
    setExportText(text);
    return text;
  }

  function downloadExport() {
    const text = createExportText();
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = PORTABLE_EXPORT_FILE_NAME;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setPortabilityMessage("");
    setSuccessToast(`Export wurde erfolgreich als ${PORTABLE_EXPORT_FILE_NAME} heruntergeladen.`);
  }

  function showRawExport() {
    createExportText();
    setPortabilityMessage("");
    setSuccessToast("Roh-JSON wurde erfolgreich erstellt.");
  }

  function importExport() {
    try {
      const validation = validatePortableExport(importText);
      if (!validation.valid) {
        setSuccessToast("");
        setPortabilityMessage(validation.errors.join(" "));
        return;
      }
      const nextState = mergePortableExportIntoState(appState, validation.payload);
      onSaveState(nextState);
      setImportText("");
      setPortabilityMessage("");
      setSuccessToast("Export wurde erfolgreich validiert und in deine Bibliothek übernommen.");
    } catch (error) {
      setSuccessToast("");
      setPortabilityMessage(error instanceof Error ? error.message : "Import konnte nicht gelesen werden.");
    }
  }

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Profil" title="Einstellungen" />

      <section className="grid gap-4" aria-labelledby="settings-app-heading">
        <h2 id="settings-app-heading" className="core-heading-2 font-semibold text-[var(--core-text)]">App und Bedienung</h2>
        <SoftPanel className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => onNavigate("simulator")}
            className="flex min-h-[4.75rem] w-full items-center gap-3 border-b border-[var(--core-border)] px-4 py-3 text-left transition hover:bg-[var(--core-surface-hover)] sm:px-6"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-core-warning-soft text-[var(--core-text)]">
              <CalendarClock size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block core-body-large font-semibold text-[var(--core-text)]">Simulator</span>
              <span className="block truncate core-caption text-[var(--core-text-muted)]">
                {simulationOffsetMinutes > 0 ? `Aktiv: ${simulationDateLabel} · +${formatSimulationDuration(simulationOffsetMinutes)}` : "Lernfortschritt über simulierte Zeitpunkte prüfen"}
              </span>
            </span>
            <ChevronRight className="shrink-0 text-[var(--core-action-primary)]" size={18} aria-hidden="true" />
          </button>
          <PomodoroTimerControl timer={pomodoroTimer} variant="settings" onStart={onStartPomodoro} />
          <button
            type="button"
            onClick={() => onNavigate("hilfe")}
            className="flex min-h-[4.75rem] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--core-surface-hover)] sm:px-6"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-core-success-soft text-[var(--core-text)]">
              <CircleHelp size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block core-body-large font-semibold text-[var(--core-text)]">Hilfe</span>
              <span className="block truncate core-caption text-[var(--core-text-muted)]">Wie CoRe und FSRS funktionieren</span>
            </span>
            <ChevronRight className="shrink-0 text-[var(--core-action-primary)]" size={18} aria-hidden="true" />
          </button>
        </SoftPanel>
      </section>

      <section className="grid gap-4" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" className="core-heading-2 font-semibold text-[var(--core-text)]">Account</h2>
        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={User} />
              <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Profil</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Anzeigename
                <input className="min-h-11 rounded-xl border border-[var(--core-border)] px-3" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} />
              </label>
              <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Login-E-Mail
                <input className="min-h-11 rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] px-3 text-[var(--core-text-muted)]" value={profile.email} readOnly aria-describedby="login-email-help" />
                <span id="login-email-help" className="font-normal leading-5 text-[var(--core-text-muted)]">Eine Änderung der Login-E-Mail wird derzeit nicht in CoRe angeboten.</span>
              </label>
              <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Hochschule
                <span className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] px-3">
                  <GraduationCap size={17} className="text-[var(--core-text-muted)]" aria-hidden="true" />
                  <input className="min-w-0 flex-1 outline-none" value={form.university} onChange={(event) => update("university", event.target.value)} />
                </span>
              </label>
              <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                Sprache
                <CoreSelect
                  ariaLabel="Sprache"
                  className="w-full"
                  value={form.preferredLanguage}
                  options={languageOptions}
                  onValueChange={(preferredLanguage) => update("preferredLanguage", preferredLanguage)}
                  leadingIcon={Languages}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton type="button" variant="primary" icon={Save} onClick={save} disabled={accountBusy}>Profil speichern</ActionButton>
              <ActionButton type="button" variant="destructive" icon={X} onClick={signOut} disabled={accountBusy}>Abmelden</ActionButton>
            </div>
            {accountMessage ? (
              <p className="core-status-error mt-3 core-body" role="alert">
                {accountMessage}
              </p>
            ) : null}
          </SoftPanel>

          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={Lock} className="bg-core-success-soft text-core-text" />
              <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Privatsphäre</h3>
            </div>
            <p className="rounded-xl border border-core-success bg-core-success-soft px-4 py-4 core-body leading-6 text-core-text">
              Dein Lernstand, dein Online-Status und deine Streaks werden derzeit nicht mit anderen Nutzern geteilt.
            </p>
          </SoftPanel>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="settings-learning-heading">
        <h2 id="settings-learning-heading" className="core-heading-2 font-semibold text-[var(--core-text)]">Lernen</h2>
        <LearningSettingsPanel
          settings={globalDeckSettings}
          customSettings={getCustomGlobalDeckSettings(profile)}
          coreMode={globalDeckSettings?.coreMode}
          dayStartHour={globalDeckSettings?.dayStartHour}
          scopeTitle="Globale Lernvorgaben"
          scopeDescription="Je Stapel noch änderbar."
          autoSave
          onSave={onSaveGlobalLearningSettings}
        />
      </section>

      <section className="grid gap-4" aria-labelledby="settings-data-heading">
        <h2 id="settings-data-heading" className="core-heading-2 font-semibold text-[var(--core-text)]">Daten und Sync</h2>
        <SoftPanel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Synchronisierung</h3>
              <p className={`mt-2 core-body ${syncStatus?.status === "error" ? "core-status-error" : syncStatus?.status === "offline" || syncStatus?.status === "conflict" ? "core-status-warning" : "core-status-info"}`} role={syncStatus?.status === "error" ? "alert" : syncStatus?.status === "idle" ? undefined : "status"}>
                {formatSyncStatusText(syncStatus)}
              </p>
            </div>
            <ActionButton type="button" variant="secondary" icon={RefreshCw} onClick={syncNow} loading={syncStatus?.status === "saving"} disabled={accountBusy}>Jetzt synchronisieren</ActionButton>
          </div>
        </SoftPanel>

        <SyncConflictPanel onListConflicts={onListConflicts} onResolveConflict={onResolveConflict} />

        <SoftPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <OrbIcon icon={Database} className="bg-core-info-soft text-core-text" />
            <div>
              <p className="core-body font-semibold uppercase tracking-wide text-core-text">Datenportabilität</p>
              <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Export und Import</h3>
            </div>
          </div>
          <div className="rounded-xl border border-core-warning bg-core-warning-soft px-4 py-4 core-body text-core-text">
            <p className="font-semibold">Dieser Export ist kein vollständiges Backup oder DSGVO-Auskunftspaket. Er enthält keine:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Medienbytes</li>
              <li>Authdaten</li>
              <li>serverseitige Sicherungskopien</li>
              <li>vollständiges DSGVO-Auskunftspaket nach Art. 15</li>
            </ul>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="grid content-start gap-3">
              <h4 className="font-semibold text-[var(--core-text)]">Daten exportieren</h4>
              <p className="core-body leading-6 text-[var(--core-text-muted)]">CoRe erstellt eine JSON-Datei mit dem bestehenden Portabilitätsschema.</p>
              <ActionButton type="button" variant="primary" icon={Download} onClick={downloadExport} className="w-fit">Export herunterladen</ActionButton>
            </div>
            <div className="grid gap-3">
              <h4 className="font-semibold text-[var(--core-text)]">Daten importieren</h4>
              <textarea
                className="min-h-48 rounded-xl border border-[var(--core-border)] p-3 font-mono core-caption leading-5"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="CoRe Export hier einfügen"
                aria-label="CoRe Export JSON importieren"
                data-testid="portable-import-json"
              />
              <ActionButton type="button" variant="secondary" icon={Upload} onClick={importExport} disabled={!importText.trim()} className="w-fit">JSON importieren</ActionButton>
            </div>
          </div>
          {portabilityMessage ? (
            <p className="core-status-error mt-3 core-body" role="alert">
              {portabilityMessage}
            </p>
          ) : null}
        </SoftPanel>
      </section>

      <section className="grid gap-4" aria-labelledby="settings-advanced-heading">
        <h2 id="settings-advanced-heading" className="core-heading-2 font-semibold text-[var(--core-text)]">Erweitert</h2>
        <SoftPanel className="p-6">
          <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Roh-JSON</h3>
          <p className="mt-2 core-body leading-6 text-[var(--core-text-muted)]">Für technische Prüfungen kannst du den Inhalt des Portabilitätsexports hier anzeigen.</p>
          <ActionButton type="button" variant="secondary" icon={Database} onClick={showRawExport} className="mt-4">Roh-JSON anzeigen</ActionButton>
          {exportText ? (
            <textarea
              className="mt-4 min-h-72 w-full rounded-xl border border-[var(--core-border)] p-3 font-mono core-caption leading-5"
              value={exportText}
              readOnly
              aria-label="Portabilitätsexport als Roh-JSON"
              data-testid="portable-export-json"
            />
          ) : null}
        </SoftPanel>
        <ReleaseInfo className="text-center" />
      </section>
    </div>
  );
}
