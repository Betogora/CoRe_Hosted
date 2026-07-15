import React from "react";
import { Database, Download, GraduationCap, Languages, Lock, RefreshCw, Save, Upload, User, X } from "lucide-react";
import { formatSyncStatusText } from "../accountSession.ts";
import { mergePortableExportIntoState, PORTABLE_EXPORT_FILE_NAME, stringifyPortableExport, validatePortableExport } from "../dataPortability.ts";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { ReleaseInfo } from "../ui/ReleaseInfo.tsx";
import { SyncConflictPanel } from "./SyncConflictPanel.tsx";

export function SettingsScreen({ appState, profile, decks, syncStatus, globalDeckSettings, onSaveProfile, onSaveGlobalLearningSettings, onSaveState, onSyncNow, onListConflicts, onResolveConflict, onSignOut }: any) {
  const [form, setForm] = React.useState(profile);
  const [accountMessage, setAccountMessage] = React.useState("");
  const [accountMessageType, setAccountMessageType] = React.useState<"status" | "alert">("status");
  const [accountBusy, setAccountBusy] = React.useState(false);
  const [exportText, setExportText] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [portabilityMessage, setPortabilityMessage] = React.useState("");
  const [portabilityMessageType, setPortabilityMessageType] = React.useState("status");

  React.useEffect(() => {
    setForm(profile);
  }, [profile]);

  function update(key: string, value: string) {
    setForm((current: any) => ({ ...current, [key]: value }));
  }

  function save() {
    onSaveProfile({ ...form, email: profile.email });
    setAccountMessageType("status");
    setAccountMessage("Profil gespeichert. Die Cloud-Synchronisierung läuft automatisch.");
  }

  async function syncNow() {
    setAccountBusy(true);
    try {
      await onSyncNow?.();
      setAccountMessage("");
    } catch (error) {
      setAccountMessageType("alert");
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
      setAccountMessageType("alert");
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
    setPortabilityMessageType("status");
    setPortabilityMessage(`Export als ${PORTABLE_EXPORT_FILE_NAME} heruntergeladen.`);
  }

  function showRawExport() {
    createExportText();
    setPortabilityMessageType("status");
    setPortabilityMessage("Roh-JSON wurde erstellt.");
  }

  function importExport() {
    try {
      const validation = validatePortableExport(importText);
      if (!validation.valid) {
        setPortabilityMessageType("alert");
        setPortabilityMessage(validation.errors.join(" "));
        return;
      }
      const nextState = mergePortableExportIntoState(appState, validation.payload);
      onSaveState(nextState);
      setImportText("");
      setPortabilityMessageType("status");
      setPortabilityMessage("Export validiert und in deine Bibliothek übernommen.");
    } catch (error) {
      setPortabilityMessageType("alert");
      setPortabilityMessage(error instanceof Error ? error.message : "Import konnte nicht gelesen werden.");
    }
  }

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Profil" title="Einstellungen" />

      <section className="grid gap-4" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" className="text-2xl font-semibold text-[#17214f]">Account</h2>
        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={User} />
              <h3 className="text-xl font-semibold text-[#17214f]">Profil</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Anzeigename
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Login-E-Mail
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] px-3 text-[#66709a]" value={profile.email} readOnly aria-describedby="login-email-help" />
                <span id="login-email-help" className="font-normal leading-5 text-[#66709a]">Eine Änderung der Login-E-Mail wird derzeit nicht in CoRe angeboten.</span>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Hochschule
                <span className="flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3">
                  <GraduationCap size={17} className="text-[#66709a]" aria-hidden="true" />
                  <input className="min-w-0 flex-1 outline-none" value={form.university} onChange={(event) => update("university", event.target.value)} />
                </span>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Sprache
                <span className="flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3">
                  <Languages size={17} className="text-[#66709a]" aria-hidden="true" />
                  <select className="min-w-0 flex-1 outline-none" value={form.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value)}>
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={save} disabled={accountBusy} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
                <Save size={16} aria-hidden="true" />
                Profil speichern
              </button>
              <button type="button" onClick={signOut} disabled={accountBusy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 disabled:text-slate-400">
                <X size={16} aria-hidden="true" />
                Abmelden
              </button>
            </div>
            {accountMessage ? (
              <p className={`mt-3 text-sm ${accountMessageType === "alert" ? "core-status-error" : "core-status-info"}`} role={accountMessageType}>
                {accountMessage}
              </p>
            ) : null}
          </SoftPanel>

          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={Lock} className="bg-emerald-50 text-emerald-700" />
              <h3 className="text-xl font-semibold text-[#17214f]">Privatsphäre</h3>
            </div>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
              Dein Lernstand, dein Online-Status und deine Streaks werden derzeit nicht mit anderen Nutzern geteilt.
            </p>
          </SoftPanel>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="settings-learning-heading">
        <h2 id="settings-learning-heading" className="text-2xl font-semibold text-[#17214f]">Lernen</h2>
        <LearningSettingsPanel
          settings={globalDeckSettings}
          coreMode={globalDeckSettings?.coreMode}
          scopeTitle="Globale Lernvorgaben"
          scopeDescription="Diese Werte werden auf alle vorhandenen Stapel angewendet und dienen als Vorgabe für neue oder importierte Stapel. Einzelne Stapel kannst du danach weiterhin über das Zahnrad im Lernen-Menü abweichend einstellen."
          affectedDeckCount={decks.length}
          onSave={onSaveGlobalLearningSettings}
        />
      </section>

      <section className="grid gap-4" aria-labelledby="settings-data-heading">
        <h2 id="settings-data-heading" className="text-2xl font-semibold text-[#17214f]">Daten und Sync</h2>
        <SoftPanel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[#17214f]">Synchronisierung</h3>
              <p className={`mt-2 text-sm ${syncStatus?.status === "error" ? "core-status-error" : syncStatus?.status === "offline" || syncStatus?.status === "conflict" ? "core-status-warning" : "core-status-info"}`} role={syncStatus?.status === "error" ? "alert" : syncStatus?.status === "idle" ? undefined : "status"}>
                {formatSyncStatusText(syncStatus)}
              </p>
            </div>
            <button type="button" onClick={syncNow} disabled={accountBusy || syncStatus?.status === "saving"} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
              <RefreshCw size={16} aria-hidden="true" />
              Jetzt synchronisieren
            </button>
          </div>
        </SoftPanel>

        <SyncConflictPanel onListConflicts={onListConflicts} onResolveConflict={onResolveConflict} />

        <SoftPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <OrbIcon icon={Database} className="bg-sky-50 text-sky-700" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Datenportabilität</p>
              <h3 className="text-xl font-semibold text-[#17214f]">Export und Import</h3>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <p className="font-semibold">Dieser Export ist kein vollständiges Backup oder DSGVO-Auskunftspaket. Er enthält keine:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Medienbytes</li>
              <li>Authdaten</li>
              <li>Community- oder Serverrechte</li>
              <li>vollständiges DSGVO-Auskunftspaket nach Art. 15</li>
            </ul>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="grid content-start gap-3">
              <h4 className="font-semibold text-[#17214f]">Daten exportieren</h4>
              <p className="text-sm leading-6 text-[#66709a]">CoRe erstellt eine JSON-Datei mit dem bestehenden Portabilitätsschema.</p>
              <button type="button" onClick={downloadExport} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white">
                <Download size={17} aria-hidden="true" />
                Export herunterladen
              </button>
            </div>
            <div className="grid gap-3">
              <h4 className="font-semibold text-[#17214f]">Daten importieren</h4>
              <textarea
                className="min-h-48 rounded-xl border border-[#dfe4f5] p-3 font-mono text-xs leading-5"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="CoRe Export hier einfügen"
                aria-label="CoRe Export JSON importieren"
                data-testid="portable-import-json"
              />
              <button type="button" onClick={importExport} disabled={!importText.trim()} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
                <Upload size={17} aria-hidden="true" />
                JSON importieren
              </button>
            </div>
          </div>
          {portabilityMessage ? (
            <p className={`mt-3 text-sm ${portabilityMessageType === "alert" ? "core-status-error" : "core-status-success"}`} role={portabilityMessageType}>
              {portabilityMessage}
            </p>
          ) : null}
        </SoftPanel>
      </section>

      <section className="grid gap-4" aria-labelledby="settings-advanced-heading">
        <h2 id="settings-advanced-heading" className="text-2xl font-semibold text-[#17214f]">Erweitert</h2>
        <SoftPanel className="p-6">
          <h3 className="text-xl font-semibold text-[#17214f]">Roh-JSON</h3>
          <p className="mt-2 text-sm leading-6 text-[#66709a]">Für technische Prüfungen kannst du den Inhalt des Portabilitätsexports hier anzeigen.</p>
          <button type="button" onClick={showRawExport} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
            <Database size={16} aria-hidden="true" />
            Roh-JSON anzeigen
          </button>
          {exportText ? (
            <textarea
              className="mt-4 min-h-72 w-full rounded-xl border border-[#dfe4f5] p-3 font-mono text-xs leading-5"
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
