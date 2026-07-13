import React from "react";
import { Brain, Clock3, Gauge, Save, SlidersHorizontal } from "lucide-react";
import { LEARNING_SETTING_PRESETS, applyLearningPreset, markLearningSettingsCustom, normalizeLearningSettings } from "../deckSettings.ts";
import { CoreModeControl, OrbIcon, SoftPanel } from "./coreUi.jsx";

const learningStepOptions = [
  { value: "1,10", label: "Kompakt · 1 Min. → 10 Min." },
  { value: "5,15", label: "Standard · 5 Min. → 15 Min." },
  { value: "10,30", label: "Ruhig · 10 Min. → 30 Min." },
];

const maximumIntervalOptions = [
  { value: 180, label: "6 Monate" },
  { value: 365, label: "1 Jahr" },
  { value: 1825, label: "5 Jahre" },
  { value: 36500, label: "Praktisch unbegrenzt" },
];

function mergeCustomSettings(current, patch) {
  const next = markLearningSettingsCustom({
    ...current,
    ...patch,
    schedulerProfile: {
      ...current.schedulerProfile,
      ...(patch.schedulerProfile ?? {}),
    },
  });

  return { ...next, coreMode: current.coreMode };
}

function RangeField({ label, hint, value, min, max, step = 1, suffix = "", onChange, testId }) {
  return (
    <label className="grid gap-3 rounded-2xl border border-[#e3e7f5] bg-white/75 p-4 text-sm font-semibold text-[#4e5b8c]">
      <span className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-[#26315f]">{label}</span>
          {hint ? <span className="mt-1 block text-xs font-normal leading-5 text-[#66709a]">{hint}</span> : null}
        </span>
        <span className="shrink-0 rounded-lg bg-[#eef1fb] px-2.5 py-1 text-[#4f5eb1]">{value}{suffix}</span>
      </span>
      <span className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-[#4f5eb1]"
          aria-label={label}
          data-testid={testId}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-h-10 w-full rounded-xl border border-[#dfe4f5] bg-white px-3 text-right text-[#17214f] outline-none focus:border-[#8c96dc] focus:ring-2 focus:ring-[#dfe3ff]"
          aria-label={`${label} als Zahl`}
        />
      </span>
    </label>
  );
}

function SelectField({ label, hint, value, onChange, children, testId }) {
  return (
    <label className="grid gap-2 rounded-2xl border border-[#e3e7f5] bg-white/75 p-4 text-sm font-semibold text-[#4e5b8c]">
      <span className="text-[#26315f]">{label}</span>
      {hint ? <span className="text-xs font-normal leading-5 text-[#66709a]">{hint}</span> : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#17214f] outline-none focus:border-[#8c96dc] focus:ring-2 focus:ring-[#dfe3ff]"
        data-testid={testId}
      >
        {children}
      </select>
    </label>
  );
}

export function LearningSettingsPanel({ settings, coreMode = "auto", scopeTitle, scopeDescription, affectedDeckCount = null, onSave }) {
  const [draft, setDraft] = React.useState(() => ({ ...normalizeLearningSettings(settings), coreMode }));
  const [status, setStatus] = React.useState("");
  const settingsSignature = JSON.stringify({ settings, coreMode });

  React.useEffect(() => {
    setDraft({ ...normalizeLearningSettings(settings), coreMode });
  }, [settingsSignature]);

  const stepValue = draft.schedulerProfile.learningStepsMinutes.join(",");
  const knownStepValue = learningStepOptions.some((option) => option.value === stepValue);
  const knownMaximumInterval = maximumIntervalOptions.some((option) => option.value === draft.schedulerProfile.maximumIntervalDays);

  function selectPreset(presetId) {
    if (presetId === "custom") return;
    setDraft((current) => ({ ...applyLearningPreset(current, presetId), coreMode: current.coreMode }));
    setStatus("");
  }

  function updateSetting(key, value) {
    setDraft((current) => mergeCustomSettings(current, { [key]: value }));
    setStatus("");
  }

  function updateSchedulerSetting(key, value) {
    setDraft((current) => mergeCustomSettings(current, { schedulerProfile: { [key]: value } }));
    setStatus("");
  }

  function save() {
    onSave?.({ ...normalizeLearningSettings(draft), coreMode: draft.coreMode });
    setStatus(affectedDeckCount == null ? "Stapel-Einstellungen gespeichert." : `Globale Lernvorgaben für ${affectedDeckCount} Stapel gespeichert.`);
  }

  return (
    <SoftPanel className="overflow-hidden">
      <div className="border-b border-[#e3e7f5] bg-[linear-gradient(135deg,rgba(238,241,251,0.9),rgba(255,255,255,0.72))] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <OrbIcon icon={SlidersHorizontal} />
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Lernoptionen</p>
              <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">{scopeTitle}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66709a]">{scopeDescription}</p>
            </div>
          </div>
          <label className="grid min-w-52 gap-2 text-sm font-semibold text-[#4e5b8c]">
            Lernprofil
            <select
              value={draft.schedulerProfile.presetId}
              onChange={(event) => selectPreset(event.target.value)}
              className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3 text-[#17214f] outline-none focus:border-[#8c96dc] focus:ring-2 focus:ring-[#dfe3ff]"
              data-testid="learning-settings-preset"
            >
              {LEARNING_SETTING_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label} · {preset.description}</option>
              ))}
              <option value="custom">Eigene Einstellungen</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6">
        <fieldset className="grid gap-4">
          <legend className="mb-1 flex items-center gap-2 text-lg font-semibold text-[#17214f]">
            <Gauge size={19} className="text-[#6672bf]" aria-hidden="true" />
            Tagespensum und Reihenfolge
          </legend>
          <div className="grid gap-4 lg:grid-cols-2">
            <RangeField
              label="Neue Karten pro Tag"
              hint="Begrenzt, wie viele bisher ungesehene Karten in die Tagesrunde kommen."
              value={draft.newCardsPerDay}
              min={0}
              max={100}
              onChange={(value) => updateSetting("newCardsPerDay", value)}
              testId="learning-settings-new-cards"
            />
            <RangeField
              label="Reviews pro Tag"
              hint="Deckelt fällige Wiederholungen und glättet Belastungsspitzen."
              value={draft.maximumReviewsPerDay}
              min={0}
              max={500}
              step={10}
              onChange={(value) => updateSetting("maximumReviewsPerDay", value)}
              testId="learning-settings-max-reviews"
            />
            <SelectField
              label="Reihenfolge in der Tagesrunde"
              hint="Legt fest, wie neue und fällige Karten zusammengestellt werden."
              value={draft.newReviewOrder}
              onChange={(value) => updateSetting("newReviewOrder", value)}
              testId="learning-settings-order"
            >
              <option value="reviews-first">Fällige Karten zuerst</option>
              <option value="mixed">Neue und fällige mischen</option>
              <option value="new-first">Neue Karten zuerst</option>
            </SelectField>
            <div className="rounded-2xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
              <p className="text-sm font-semibold text-[#26315f]">CoRe-Modus</p>
              <p className="mb-3 mt-1 text-xs leading-5 text-[#66709a]">Steuert, ob und wie nahe Varianten in diesem Geltungsbereich eingesetzt werden.</p>
              <CoreModeControl value={draft.coreMode} onChange={(value) => setDraft((current) => ({ ...current, coreMode: value }))} />
            </div>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 border-t border-[#e3e7f5] pt-6">
          <legend className="mb-1 flex items-center gap-2 text-lg font-semibold text-[#17214f]">
            <Clock3 size={19} className="text-[#6672bf]" aria-hidden="true" />
            Lernschritte und Intervalle
          </legend>
          <div className="grid gap-4 lg:grid-cols-2">
            <SelectField
              label="Lernschritte für neue Karten"
              hint="Kurze Abstände, bevor eine Karte in den normalen Rhythmus wechselt."
              value={stepValue}
              onChange={(value) => updateSchedulerSetting("learningStepsMinutes", value.split(",").map(Number))}
              testId="learning-settings-steps"
            >
              {!knownStepValue ? <option value={stepValue}>Eigene · {draft.schedulerProfile.learningStepsMinutes[0]} Min. → {draft.schedulerProfile.learningStepsMinutes[1]} Min.</option> : null}
              {learningStepOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
            <SelectField
              label="Wiederlern-Abstand nach Fehler"
              hint="Wann eine bereits gelernte Karte nach „Nochmal“ erneut erscheint."
              value={draft.schedulerProfile.relearningStepMinutes}
              onChange={(value) => updateSchedulerSetting("relearningStepMinutes", Number(value))}
              testId="learning-settings-relearning"
            >
              {[1, 3, 5, 10, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes} Min.</option>)}
            </SelectField>
            <RangeField
              label="Erstes reguläres Intervall"
              hint="Abstand nach erfolgreichem Abschluss der Lernschritte."
              value={draft.schedulerProfile.graduatingIntervalDays}
              min={1}
              max={7}
              suffix=" T."
              onChange={(value) => updateSchedulerSetting("graduatingIntervalDays", value)}
              testId="learning-settings-graduating"
            />
            <RangeField
              label="Erstes Leicht-Intervall"
              hint="Größerer Startabstand, wenn eine neue Karte sehr leicht war."
              value={draft.schedulerProfile.easyGraduatingIntervalDays}
              min={1}
              max={14}
              suffix=" T."
              onChange={(value) => updateSchedulerSetting("easyGraduatingIntervalDays", value)}
              testId="learning-settings-easy-graduating"
            />
            <label className="flex min-h-20 items-start justify-between gap-4 rounded-2xl border border-[#e3e7f5] bg-white/75 p-4 text-sm font-semibold text-[#26315f] lg:col-span-2">
              <span>
                <span className="block">Weniger sehr kurze Intervalle</span>
                <span className="mt-1 block text-xs font-normal leading-5 text-[#66709a]">Verdoppelt kurze Lern- und Wiederlern-Abstände. Das reduziert unmittelbare Wiedererkennung, verlängert aber die Lernrunde.</span>
              </span>
              <input
                type="checkbox"
                checked={draft.schedulerProfile.lessShortIntervalBias}
                onChange={(event) => updateSchedulerSetting("lessShortIntervalBias", event.target.checked)}
                className="mt-1 size-5 accent-[#4f5eb1]"
                data-testid="learning-settings-short-bias"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 border-t border-[#e3e7f5] pt-6">
          <legend className="mb-1 flex items-center gap-2 text-lg font-semibold text-[#17214f]">
            <Brain size={19} className="text-[#6672bf]" aria-hidden="true" />
            Erinnerungsziel
          </legend>
          <div className="grid gap-4 lg:grid-cols-2">
            <RangeField
              label="Zielerinnerung"
              hint="Höhere Werte erzeugen kürzere Intervalle und mehr tägliche Reviews. 90 % ist ein ausgewogener Startpunkt."
              value={Math.round(draft.schedulerProfile.desiredRetention * 100)}
              min={70}
              max={99}
              suffix=" %"
              onChange={(value) => updateSchedulerSetting("desiredRetention", value / 100)}
              testId="learning-settings-retention"
            />
            <SelectField
              label="Maximales Intervall"
              hint="Kein einzelner Abstand wird größer als diese Obergrenze."
              value={draft.schedulerProfile.maximumIntervalDays}
              onChange={(value) => updateSchedulerSetting("maximumIntervalDays", Number(value))}
              testId="learning-settings-maximum-interval"
            >
              {!knownMaximumInterval ? <option value={draft.schedulerProfile.maximumIntervalDays}>Eigene · {draft.schedulerProfile.maximumIntervalDays} Tage</option> : null}
              {maximumIntervalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
          </div>
          {draft.schedulerProfile.desiredRetention > 0.97 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" role="alert">
              Über 97 % steigt die tägliche Belastung meist sehr stark. Nutze diesen Bereich nur bewusst und beobachte dein Review-Pensum.
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e7f5] pt-5">
          <p className="text-sm text-[#66709a]" role="status" aria-live="polite">{status || "Änderungen werden erst mit dem Speichern übernommen."}</p>
          <button type="button" onClick={save} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4352a4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c96dc] focus-visible:ring-offset-2">
            <Save size={17} aria-hidden="true" />
            Änderungen speichern
          </button>
        </div>
      </div>
    </SoftPanel>
  );
}
