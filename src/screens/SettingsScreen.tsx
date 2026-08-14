import React from "react";
import { CalendarClock, Database, Download, RefreshCw, Save, ShieldCheck, Upload, User, X } from "lucide-react";
import { formatSyncStatusText } from "../accountSession.ts";
import type { SettingsScreenProps } from "../appScreenProps.ts";
import { normalizeLearnAheadMinutes } from "../deckSettings.ts";
import { EASY_DAY_KEYS, normalizeEasyDays } from "../easyDays.ts";
import type { EasyDayLevel, EasyDays, SyncIntervalMinutes } from "../coreTypes.ts";
import { PORTABLE_EXPORT_FILE_NAME, validatePortableExport } from "../dataPortability.ts";
import { normalizeDayStartHour } from "../learningDay.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { ActionButton, CrossLinkButton } from "../ui/actionUi.tsx";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { PomodoroTimerControl } from "../ui/pomodoroTimerUi.tsx";
import { ReleaseInfo } from "../ui/ReleaseInfo.tsx";
import { InPageNavigation } from "../ui/InPageNavigation.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { SyncConflictPanel } from "./SyncConflictPanel.tsx";

const sectionIds = {
  account: "settings-account",
  focus: "settings-learning-day",
  data: "settings-data-sync",
} as const;

const settingsSections = [
  { id: sectionIds.account, label: "Konto", icon: User },
  { id: sectionIds.focus, label: "Lerntag & Fokus", icon: CalendarClock },
  { id: sectionIds.data, label: "Daten & Synchronisierung", icon: Database },
] as const;

const easyDayOptions = [
  { value: "normal", label: "Normal" },
  { value: "reduced", label: "Weniger" },
  { value: "minimum", label: "Minimal" },
];
const weekdayLabels: Record<keyof EasyDays, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};
const easyDayToneClasses: Record<EasyDayLevel, string> = {
  normal: "border-core-border bg-core-subtle",
  reduced: "border-core-warning bg-core-warning-soft",
  minimum: "border-core-info bg-core-info-soft",
};

const syncIntervalOptions = [
  { value: "0", label: "Aus – nur manuell" },
  { value: "1", label: "Jede Minute" },
  { value: "5", label: "Alle 5 Minuten" },
  { value: "15", label: "Alle 15 Minuten" },
  { value: "30", label: "Alle 30 Minuten" },
];

export function SettingsScreen({ profile, syncStatus, globalSchedulerPreferences, onSaveProfile, onSaveGlobalSchedulerPreferences, onCreateExport, onImportExport, onSyncNow, onSaveSyncInterval, onListConflicts, onResolveConflict, onSignOut, onNavigate, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onStartPomodoro }: SettingsScreenProps) {
  const [displayName, setDisplayName] = React.useState(profile.displayName);
  const [dayStartHour, setDayStartHour] = React.useState(globalSchedulerPreferences.dayStartHour);
  const [learnAheadMinutes, setLearnAheadMinutes] = React.useState(globalSchedulerPreferences.learnAheadMinutes);
  const [easyDays, setEasyDays] = React.useState(globalSchedulerPreferences.easyDays);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = React.useState<SyncIntervalMinutes>(profile.uiPreferences.syncIntervalMinutes);
  const [accountMessage, setAccountMessage] = React.useState("");
  const [accountBusy, setAccountBusy] = React.useState(false);
  const [exportText, setExportText] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [portabilityMessage, setPortabilityMessage] = React.useState("");
  const setSuccessToast = useSuccessToast();
  const easyDaysDependency = EASY_DAY_KEYS.map((key) => globalSchedulerPreferences.easyDays[key]).join("|");

  React.useEffect(() => setDisplayName(profile.displayName), [profile.displayName]);
  React.useEffect(() => setSyncIntervalMinutes(profile.uiPreferences.syncIntervalMinutes), [profile.uiPreferences.syncIntervalMinutes]);
  React.useEffect(() => {
    setDayStartHour(globalSchedulerPreferences.dayStartHour);
    setLearnAheadMinutes(globalSchedulerPreferences.learnAheadMinutes);
    setEasyDays(globalSchedulerPreferences.easyDays);
  }, [easyDaysDependency, globalSchedulerPreferences.dayStartHour, globalSchedulerPreferences.learnAheadMinutes]);

  function saveProfile() {
    onSaveProfile({ ...profile, displayName });
    setAccountMessage("");
    setSuccessToast("Profil wurde gespeichert. Die Cloud-Synchronisierung läuft automatisch.");
  }

  function saveLearningDay() {
    const next = {
      dayStartHour: normalizeDayStartHour(dayStartHour),
      learnAheadMinutes: normalizeLearnAheadMinutes(learnAheadMinutes),
      easyDays: normalizeEasyDays(easyDays),
    };
    setDayStartHour(next.dayStartHour);
    setLearnAheadMinutes(next.learnAheadMinutes);
    setEasyDays(next.easyDays);
    onSaveGlobalSchedulerPreferences(next);
    setSuccessToast("Lerntag, Vorziehfenster und Wochenrhythmus wurden gespeichert.");
  }

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

  async function saveSyncInterval() {
    setAccountBusy(true);
    setSuccessToast("");
    try {
      await onSaveSyncInterval(syncIntervalMinutes);
      setSuccessToast(syncIntervalMinutes === 0 ? "Automatische Synchronisierung ist ausgeschaltet." : "Synchronisierungsintervall wurde gespeichert.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Synchronisierungsintervall konnte nicht gespeichert werden.");
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

  async function createExportText() {
    setAccountBusy(true);
    try {
      const text = await onCreateExport();
      setExportText(text);
      return text;
    } finally {
      setAccountBusy(false);
    }
  }

  async function downloadExport() {
    const text = await createExportText();
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = PORTABLE_EXPORT_FILE_NAME;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setPortabilityMessage("");
    setSuccessToast(`Export wurde als ${PORTABLE_EXPORT_FILE_NAME} heruntergeladen.`);
  }

  async function importExport() {
    const validation = validatePortableExport(importText);
    if (!validation.valid || !validation.payload) {
      setPortabilityMessage(validation.errors.join(" "));
      return;
    }
    setAccountBusy(true);
    try {
      await onImportExport(importText);
      setImportText("");
      setPortabilityMessage("");
      setSuccessToast("Export wurde validiert und in deine Bibliothek übernommen.");
    } catch (error) {
      setPortabilityMessage(error instanceof Error ? error.message : "Export konnte nicht importiert werden.");
    } finally {
      setAccountBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-7">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Profil" title="Globale Einstellungen" />
        <CrossLinkButton onSelect={() => onNavigate("stapel-einstellungen", { focusedDeckId: null })}>
          Stapeleinstellungen
        </CrossLinkButton>
      </div>

      <InPageNavigation ariaLabel="Bereiche der globalen Einstellungen" items={settingsSections}>
      <section id={sectionIds.account} className="grid gap-4" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" tabIndex={-1} className="core-heading-2 rounded-lg font-semibold text-core-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4">Konto</h2>
        <SoftPanel className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <OrbIcon icon={User} />
            <h3 className="core-heading-3 font-semibold text-core-text">Profil</h3>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="grid gap-2 core-body font-semibold text-core-muted">
              Anzeigename
              <input className="min-h-11 min-w-0 rounded-xl border border-core-border px-3 text-core-text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="grid gap-2 core-body font-semibold text-core-muted">
              Login-E-Mail
              <input className="min-h-11 min-w-0 rounded-xl border border-core-border bg-core-subtle px-3 text-core-muted" value={profile.email} readOnly aria-describedby="login-email-help" />
              <span id="login-email-help" className="font-normal leading-5">Die Login-E-Mail kann derzeit nicht in CoRe geändert werden.</span>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <ActionButton type="button" variant="primary" icon={Save} onClick={saveProfile} disabled={accountBusy}>Profil speichern</ActionButton>
            <ActionButton type="button" variant="destructive" icon={X} onClick={() => void signOut()} disabled={accountBusy}>Abmelden</ActionButton>
          </div>
          {accountMessage ? <p className="core-status-error mt-3 core-body" role="alert">{accountMessage}</p> : null}
        </SoftPanel>
      </section>

      <section id={sectionIds.focus} className="grid gap-4" aria-labelledby="settings-focus-heading">
        <h2 id="settings-focus-heading" tabIndex={-1} className="core-heading-2 rounded-lg font-semibold text-core-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4">Lerntag & Fokus</h2>
        <SoftPanel className="p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 core-body font-semibold text-core-muted">
              Neuer Tag beginnt um
              <span className="flex min-h-11 items-center gap-2 rounded-xl border border-core-border px-3">
                <input type="number" min="0" max="23" step="1" value={dayStartHour} data-testid="settings-day-start-hour" className="min-w-0 flex-1 bg-transparent text-core-text outline-none" onChange={(event) => setDayStartHour(Number(event.target.value))} />
                <span className="font-normal">Uhr</span>
              </span>
            </label>
            <label className="grid gap-2 core-body font-semibold text-core-muted">
              Lernkarten vorziehen
              <span className="flex min-h-11 items-center gap-2 rounded-xl border border-core-border px-3">
                <input type="number" min="0" max="720" step="1" value={learnAheadMinutes} data-testid="settings-learn-ahead" className="min-w-0 flex-1 bg-transparent text-core-text outline-none" onChange={(event) => setLearnAheadMinutes(Number(event.target.value))} />
                <span className="font-normal">Min.</span>
              </span>
            </label>
            <div className="grid gap-2 core-body font-semibold text-core-muted">
              Profilzeitzone
              <span className="flex min-h-11 items-center rounded-xl border border-core-border bg-core-subtle px-3 font-normal text-core-text">{profile.timezone || "Nicht festgelegt"}</span>
            </div>
          </div>
          <p className="mt-3 core-caption leading-5 text-core-muted">Tagesbeginn und Vorziehfenster gelten für alle Stapel. Lernprofile und CoRe-Parameter bleiben stapelspezifisch.</p>
          <fieldset className="mt-6 border-t border-core-border pt-5">
            <legend className="core-body-large font-semibold text-core-text">Wochenrhythmus</legend>
            <p className="mt-2 core-caption leading-5 text-core-muted">CoRe verteilt neu berechnete Wiederholungen möglichst auf passendere Tage. Sind alle Tage gleich, bleibt die Planung unverändert.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {EASY_DAY_KEYS.map((key) => (
                <label key={key} className={`grid min-w-0 gap-2 rounded-2xl border p-4 core-body font-semibold text-core-text ${easyDayToneClasses[easyDays[key]]}`}>
                  {weekdayLabels[key]}
                  <CoreSelect
                    ariaLabel={`${weekdayLabels[key]} im Wochenrhythmus`}
                    value={easyDays[key]}
                    options={easyDayOptions}
                    testId={`settings-easy-day-${key}`}
                    onValueChange={(value) => setEasyDays((current) => ({ ...current, [key]: value as EasyDayLevel }))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <ActionButton type="button" variant="primary" icon={Save} className="mt-4" onClick={saveLearningDay}>Lerntag speichern</ActionButton>
        </SoftPanel>

        <SoftPanel className="overflow-hidden p-0">
          <button type="button" onClick={() => onNavigate("simulator")} className="flex min-h-[4.75rem] w-full items-center gap-3 border-b border-core-border px-4 py-3 text-left transition hover:bg-[var(--core-surface-hover)] sm:px-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-core-warning-soft text-core-text"><CalendarClock size={20} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block core-body-large font-semibold text-core-text">Simulator</span><span className="block core-caption text-core-muted">{simulationOffsetMinutes > 0 ? `Aktiv: ${simulationDateLabel} · +${formatSimulationDuration(simulationOffsetMinutes)}` : "Lernfortschritt über simulierte Zeitpunkte prüfen"}</span></span>
          </button>
          <PomodoroTimerControl timer={pomodoroTimer} variant="settings" onStart={onStartPomodoro} />
        </SoftPanel>
      </section>

      <section id={sectionIds.data} className="grid gap-4" aria-labelledby="settings-data-heading">
        <h2 id="settings-data-heading" tabIndex={-1} className="core-heading-2 rounded-lg font-semibold text-core-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4">Daten & Synchronisierung</h2>
        <SoftPanel className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="core-heading-3 font-semibold text-core-text">Synchronisierung</h3>
              <p className="mt-2 core-body text-core-muted">{formatSyncStatusText(syncStatus)}</p>
              {syncStatus.status === "saved" ? <p className="mt-1 core-caption text-core-muted">Zuletzt erfolgreich: {new Date(syncStatus.savedAt).toLocaleString("de-DE")}</p> : null}
              {syncStatus.status === "pending" && syncStatus.pendingCount ? <p className="mt-1 core-caption text-core-muted">Ausstehende Änderungen: {syncStatus.pendingCount}</p> : null}
            </div>
            <ActionButton type="button" variant="primary" icon={RefreshCw} onClick={() => void syncNow()} loading={syncStatus.status === "saving"} disabled={accountBusy}>Jetzt synchronisieren</ActionButton>
          </div>
          <div className="mt-5 grid gap-3 border-t border-core-border pt-5 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-end">
            <label className="grid gap-2 core-body font-semibold text-core-text">
              Automatisch synchronisieren
              <CoreSelect
                ariaLabel="Intervall der automatischen Synchronisierung"
                value={String(syncIntervalMinutes)}
                options={syncIntervalOptions}
                testId="settings-sync-interval"
                onValueChange={(value) => setSyncIntervalMinutes(Number(value) as SyncIntervalMinutes)}
              />
            </label>
            <ActionButton type="button" variant="secondary" icon={Save} onClick={() => void saveSyncInterval()} disabled={accountBusy || syncIntervalMinutes === profile.uiPreferences.syncIntervalMinutes}>Automatik speichern</ActionButton>
          </div>
          <p className="mt-3 core-caption leading-5 text-core-muted">Lokale Änderungen bleiben sicher in diesem Browser gespeichert. Beim nächsten vollständigen Abgleich werden nur Änderungen übertragen und neue Cloud-Daten geladen.</p>
        </SoftPanel>
        <SyncConflictPanel onListConflicts={onListConflicts} onResolveConflict={onResolveConflict} />
        <SoftPanel className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><OrbIcon icon={ShieldCheck} className="bg-core-info-soft text-core-text" /><div><p className="core-body font-semibold uppercase tracking-wide text-core-text">Datenportabilität</p><h3 className="core-heading-3 font-semibold text-core-text">Export und Import</h3></div></div>
          <div className="rounded-xl border border-core-warning bg-core-warning-soft px-4 py-4 core-body text-core-text">
            <p className="font-semibold">Dieser Export ist kein vollständiges Backup oder DSGVO-Auskunftspaket. Er enthält keine:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5"><li>Medienbytes</li><li>Authdaten</li><li>serverseitigen Sicherungskopien</li><li>vollständigen DSGVO-Auskunftsdaten nach Art. 15</li></ul>
          </div>
          <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-2">
            <div className="grid content-start gap-3"><h4 className="font-semibold text-core-text">Daten exportieren</h4><p className="core-body text-core-muted">Eigene Lernprofile werden zusammen mit deinem Profil transportiert.</p><ActionButton type="button" variant="primary" icon={Download} onClick={() => void downloadExport()} loading={accountBusy} className="w-fit">Export herunterladen</ActionButton></div>
            <div className="grid min-w-0 gap-3"><h4 className="font-semibold text-core-text">Daten importieren</h4><textarea className="min-h-48 min-w-0 rounded-xl border border-core-border p-3 font-mono core-caption" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="CoRe Export hier einfügen" aria-label="CoRe Export JSON importieren" data-testid="portable-import-json" /><ActionButton type="button" variant="secondary" icon={Upload} onClick={() => void importExport()} disabled={!importText.trim()} loading={accountBusy} className="w-fit">JSON importieren</ActionButton></div>
          </div>
          {portabilityMessage ? <p className="core-status-error mt-3 core-body" role="alert">{portabilityMessage}</p> : null}
        </SoftPanel>
        <SoftPanel className="p-5 sm:p-6">
          <h3 className="core-heading-3 font-semibold text-core-text">Roh-JSON</h3>
          <p className="mt-2 core-body text-core-muted">Für technische Prüfungen kannst du den Inhalt des Portabilitätsexports anzeigen.</p>
          <ActionButton type="button" variant="secondary" icon={Database} onClick={() => { void createExportText().then(() => setSuccessToast("Roh-JSON wurde erstellt.")); }} loading={accountBusy} className="mt-4">Roh-JSON anzeigen</ActionButton>
          {exportText ? <textarea className="mt-4 min-h-72 w-full rounded-xl border border-core-border p-3 font-mono core-caption" value={exportText} readOnly aria-label="Portabilitätsexport als Roh-JSON" data-testid="portable-export-json" /> : null}
        </SoftPanel>
        <ReleaseInfo className="text-center" />
      </section>
      </InPageNavigation>
    </div>
  );
}
