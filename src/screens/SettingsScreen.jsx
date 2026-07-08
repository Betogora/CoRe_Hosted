import React from "react";
import { Database, GraduationCap, Languages, Lock, Save, ShieldCheck, Upload, User, X } from "lucide-react";
import { connectOAuthPlaceholder, createLocalAccount, signInLocalAccount, signOutLocalAccount } from "../authModel.js";
import { createPortableExport, mergePortableExportIntoState, stringifyPortableExport, validatePortableExport } from "../dataPortability.js";
import { CoreModeControl, OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.jsx";

export function SettingsScreen({ appState, profile, decks, onSaveProfile, onUpdateAllDecks, onSaveState }) {
  const [form, setForm] = React.useState(profile);
  const [password, setPassword] = React.useState("");
  const [accountMessage, setAccountMessage] = React.useState("");
  const [exportText, setExportText] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [portabilityMessage, setPortabilityMessage] = React.useState("");
  const [portabilityMessageType, setPortabilityMessageType] = React.useState("status");

  React.useEffect(() => {
    setForm(profile);
  }, [profile]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePrivacy(key, value) {
    setForm((current) => ({ ...current, privacy: { ...current.privacy, [key]: value } }));
  }

  function save() {
    onSaveProfile(form);
  }

  function setAllMode(coreMode) {
    onUpdateAllDecks((deck) => ({ ...deck, deckSettings: { ...deck.deckSettings, coreMode } }));
  }

  function createAccount() {
    try {
      const nextProfile = createLocalAccount({ ...form, password });
      onSaveProfile(nextProfile);
      setPassword("");
      setAccountMessage("Lokaler Account erstellt und angemeldet.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Account konnte nicht erstellt werden.");
    }
  }

  function signIn() {
    try {
      const nextProfile = signInLocalAccount(profile, { email: form.email, password });
      onSaveProfile(nextProfile);
      setPassword("");
      setAccountMessage("Lokale Anmeldung erfolgreich.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen.");
    }
  }

  function signOut() {
    onSaveProfile(signOutLocalAccount(profile));
    setAccountMessage("Abgemeldet.");
  }

  function connectProvider(provider) {
    onSaveProfile(connectOAuthPlaceholder(profile, provider));
    setAccountMessage(`${provider} als OAuth-Platzhalter verbunden.`);
  }

  function prepareExport() {
    const text = stringifyPortableExport(appState);
    const payload = createPortableExport(appState);
    setExportText(text);
    setPortabilityMessageType("status");
    setPortabilityMessage(`Export vorbereitet: ${payload.decks.length} Decks, Hash ${payload.contentHash}.`);
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
      setPortabilityMessage("Export validiert und in die lokale Bibliothek gemergt.");
    } catch (error) {
      setPortabilityMessageType("alert");
      setPortabilityMessage(error instanceof Error ? error.message : "Import konnte nicht gelesen werden.");
    }
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Profil" title="Einstellungen" />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <SoftPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <OrbIcon icon={User} />
            <h3 className="text-xl font-semibold text-[#17214f]">Account</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Anzeigename
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              E-Mail
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.email} onChange={(event) => update("email", event.target.value)} />
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
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Lokales Passwort
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="button" onClick={createAccount} className="mt-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white">
              <User size={17} aria-hidden="true" />
              Account erstellen
            </button>
            <button type="button" onClick={signIn} className="mt-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              <ShieldCheck size={17} aria-hidden="true" />
              Anmelden
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={save} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
              <Save size={16} aria-hidden="true" />
              Profil speichern
            </button>
            <button type="button" onClick={() => connectProvider("oauth-demo")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              <Lock size={16} aria-hidden="true" />
              OAuth-Platzhalter
            </button>
            <button type="button" onClick={signOut} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700">
              <X size={16} aria-hidden="true" />
              Abmelden
            </button>
          </div>
          <p className="mt-3 text-sm text-[#66709a]">
            Status: {profile.account?.status ?? "lokales Profil"} {profile.account?.authProvider ? `· ${profile.account.authProvider}` : ""}
          </p>
          {accountMessage ? <p className="mt-2 text-sm text-[#66709a]" role="status" aria-live="polite">{accountMessage}</p> : null}
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <OrbIcon icon={Lock} className="bg-emerald-50 text-emerald-700" />
            <h3 className="text-xl font-semibold text-[#17214f]">Datenschutz</h3>
          </div>
          <div className="grid gap-3">
            {[
              ["shareLearningProgress", "Lernstand teilen"],
              ["showOnlineStatus", "Online-Status zeigen"],
              ["showStreaksToOthers", "Streaks für andere"],
            ].map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center justify-between rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] px-4 text-sm font-semibold text-[#4e5b8c]">
                {label}
                <input type="checkbox" checked={Boolean(form.privacy?.[key])} onChange={(event) => updatePrivacy(key, event.target.checked)} />
              </label>
            ))}
          </div>
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-[#4e5b8c]">CoRe-Modus für alle Stapel</p>
            <CoreModeControl value="auto" onChange={setAllMode} />
            <p className="mt-3 text-sm text-[#66709a]">{decks.length} Stapel betroffen.</p>
          </div>
        </SoftPanel>
      </div>
      <SoftPanel className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrbIcon icon={Database} className="bg-sky-50 text-sky-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Datenportabilität</p>
            <h3 className="text-xl font-semibold text-[#17214f]">Lokaler Export und Import</h3>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid gap-3">
            <button type="button" onClick={prepareExport} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white">
              <Database size={17} aria-hidden="true" />
              Export vorbereiten
            </button>
            <textarea
              className="min-h-72 rounded-xl border border-[#dfe4f5] p-3 font-mono text-xs leading-5"
              value={exportText}
              onChange={(event) => setExportText(event.target.value)}
              placeholder="Export-JSON"
              aria-label="Vorbereiteter Export als JSON"
              data-testid="portable-export-json"
            />
          </div>
          <div className="grid gap-3">
            <button type="button" onClick={importExport} disabled={!importText.trim()} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
              <Upload size={17} aria-hidden="true" />
              JSON importieren
            </button>
            <textarea
              className="min-h-72 rounded-xl border border-[#dfe4f5] p-3 font-mono text-xs leading-5"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="CoRe Export hier einfügen"
              aria-label="CoRe Export JSON importieren"
              data-testid="portable-import-json"
            />
          </div>
        </div>
        {portabilityMessage ? (
          <p className="mt-3 text-sm text-[#66709a]" role={portabilityMessageType} aria-live={portabilityMessageType === "alert" ? "assertive" : "polite"}>
            {portabilityMessage}
          </p>
        ) : null}
      </SoftPanel>
    </div>
  );
}
