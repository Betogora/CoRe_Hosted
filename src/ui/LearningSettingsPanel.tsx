import React from "react";
import { Brain, Clock3, Gauge, Save, SlidersHorizontal } from "lucide-react";
import { LEARNING_SETTING_PRESETS, applyLearningPreset, markLearningSettingsCustom, normalizeLearningSettings, type LearningSettings, type LearningSettingsInput } from "../deckSettings.ts";
import type { CoreMode } from "../coreTypes.ts";
import { ActionButton } from "./actionUi.tsx";
import { CoreModeControl, OrbIcon, SoftPanel } from "./coreUi.tsx";
import { useSuccessToast } from "./feedbackUi.tsx";
import { CoreSelect, type CoreSelectOption } from "./selectUi.tsx";

const learningStepOptions = [
  { value: "1,10", label: "Kompakt · 1 Min. → 10 Min." },
  { value: "5,15", label: "Standard · 5 Min. → 15 Min." },
  { value: "10,30", label: "Ruhig · 10 Min. → 30 Min." },
];

const maximumIntervalOptions = [
  { value: "180", label: "6 Monate" },
  { value: "365", label: "1 Jahr" },
  { value: "1825", label: "5 Jahre" },
  { value: "36500", label: "Praktisch unbegrenzt" },
];

const learningPresetOptions = [
  ...LEARNING_SETTING_PRESETS.map((preset) => ({ value: preset.id, label: `${preset.label} · ${preset.description}` })),
  { value: "custom", label: "Eigene Einstellungen" },
];

const reviewOrderOptions = [
  { value: "reviews-first", label: "Fällige Karten zuerst" },
  { value: "mixed", label: "Neue und fällige mischen" },
  { value: "new-first", label: "Neue Karten zuerst" },
];

const relearningStepOptions = [1, 3, 5, 10, 20, 30]
  .map((minutes) => ({ value: String(minutes), label: `${minutes} Min.` }));

type LearningSettingsDraft = LearningSettings & { coreMode: CoreMode };

function mergeCustomSettings(current: LearningSettingsDraft, patch: LearningSettingsInput): LearningSettingsDraft {
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

interface RangeFieldProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  testId?: string;
}

function RangeField({ label, hint, value, min, max, step = 1, suffix = "", onChange, testId }: RangeFieldProps) {
  return (
    <label className="grid gap-3 rounded-2xl border border-[var(--core-border)] bg-core-surface p-4 core-body font-semibold text-[var(--core-text-secondary)]">
      <span className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-[var(--core-text-secondary)]">{label}</span>
          {hint ? <span className="mt-1 block core-caption font-normal leading-5 text-[var(--core-text-muted)]">{hint}</span> : null}
        </span>
        <span className="shrink-0 rounded-lg bg-[var(--core-surface-muted)] px-2.5 py-1 text-[var(--core-action-primary)]">{value}{suffix}</span>
      </span>
      <span className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-[var(--core-action-primary)]"
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
          className="min-h-11 w-full rounded-xl border border-[var(--core-border)] bg-core-surface px-3 text-right text-[var(--core-text)] outline-none"
          aria-label={`${label} als Zahl`}
        />
      </span>
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  hint?: string;
  value: string | number;
  onChange: (value: string) => void;
  options: readonly CoreSelectOption[];
  testId?: string;
}

function SelectField({ label, hint, value, onChange, options, testId }: SelectFieldProps) {
  return (
    <label className="grid gap-2 rounded-2xl border border-[var(--core-border)] bg-core-surface p-4 core-body font-semibold text-[var(--core-text-secondary)]">
      <span className="text-[var(--core-text-secondary)]">{label}</span>
      {hint ? <span className="core-caption font-normal leading-5 text-[var(--core-text-muted)]">{hint}</span> : null}
      <CoreSelect
        ariaLabel={label}
        className="mt-1 w-full font-semibold"
        value={String(value)}
        options={options}
        onValueChange={onChange}
        testId={testId}
      />
    </label>
  );
}

interface LearningSettingsPanelProps {
  settings?: LearningSettingsInput;
  coreMode?: CoreMode;
  scopeTitle: string;
  scopeDescription: string;
  affectedDeckCount?: number | null;
  onSave?: (settings: LearningSettingsDraft) => void;
}

export function LearningSettingsPanel({ settings, coreMode = "auto", scopeTitle, scopeDescription, affectedDeckCount = null, onSave }: LearningSettingsPanelProps) {
  const [draft, setDraft] = React.useState<LearningSettingsDraft>(() => ({ ...normalizeLearningSettings(settings), coreMode }));
  const setSuccessToast = useSuccessToast();
  const settingsSignature = JSON.stringify({ settings, coreMode });

  React.useEffect(() => {
    setDraft({ ...normalizeLearningSettings(settings), coreMode });
  }, [settingsSignature]);

  const stepValue = draft.schedulerProfile.learningStepsMinutes.join(",");
  const knownStepValue = learningStepOptions.some((option) => option.value === stepValue);
  const maximumIntervalValue = String(draft.schedulerProfile.maximumIntervalDays);
  const knownMaximumInterval = maximumIntervalOptions.some((option) => option.value === maximumIntervalValue);
  const stepOptions = knownStepValue ? learningStepOptions : [
    { value: stepValue, label: `Eigene · ${draft.schedulerProfile.learningStepsMinutes[0]} Min. → ${draft.schedulerProfile.learningStepsMinutes[1]} Min.` },
    ...learningStepOptions,
  ];
  const intervalOptions = knownMaximumInterval ? maximumIntervalOptions : [
    { value: maximumIntervalValue, label: `Eigene · ${maximumIntervalValue} Tage` },
    ...maximumIntervalOptions,
  ];

  function selectPreset(presetId: string) {
    if (presetId === "custom") return;
    setDraft((current) => ({ ...applyLearningPreset(current, presetId), coreMode: current.coreMode }));
    setSuccessToast("");
  }

  function updateSetting(key: string, value: any) {
    setDraft((current) => mergeCustomSettings(current, { [key]: value }));
    setSuccessToast("");
  }

  function updateSchedulerSetting(key: keyof LearningSettingsDraft["schedulerProfile"], value: unknown) {
    setDraft((current) => mergeCustomSettings(current, { schedulerProfile: { [key]: value } }));
    setSuccessToast("");
  }

  function save() {
    onSave?.({ ...normalizeLearningSettings(draft), coreMode: draft.coreMode });
    setSuccessToast(affectedDeckCount == null
      ? "Stapel-Einstellungen wurden erfolgreich gespeichert."
      : `Globale Lernvorgaben für ${affectedDeckCount} Stapel wurden erfolgreich gespeichert.`);
  }

  return (
    <SoftPanel className="overflow-hidden">
      <div className="border-b border-[var(--core-border)] bg-core-subtle p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <OrbIcon icon={SlidersHorizontal} />
            <div className="min-w-0">
              <p className="core-body font-semibold uppercase tracking-wide text-[var(--core-action-secondary)]">Lernoptionen</p>
              <h3 className="mt-1 core-heading-2 font-semibold text-[var(--core-text)]">{scopeTitle}</h3>
              <p className="mt-2 max-w-3xl core-body leading-6 text-[var(--core-text-muted)]">{scopeDescription}</p>
            </div>
          </div>
          <label className="grid min-w-52 gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Lernprofil
            <CoreSelect
              ariaLabel="Lernprofil"
              className="w-full"
              value={draft.schedulerProfile.presetId}
              options={learningPresetOptions}
              onValueChange={selectPreset}
              testId="learning-settings-preset"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6">
        <fieldset className="grid gap-4">
          <legend className="mb-1 flex items-center gap-2 core-body-large font-semibold text-[var(--core-text)]">
            <Gauge size={19} className="text-[var(--core-action-secondary)]" aria-hidden="true" />
            Tagespensum und Reihenfolge
          </legend>
          <div className="grid gap-4 lg:grid-cols-2">
            <RangeField
              label="Neue Karten pro Tag"
              hint="Begrenzt, wie viele bisher ungesehene Karten in die Tagesrunde kommen."
              value={draft.newCardsPerDay}
              min={0}
              max={100}
              onChange={(value: any) => updateSetting("newCardsPerDay", value)}
              testId="learning-settings-new-cards"
            />
            <RangeField
              label="Reviews pro Tag"
              hint="Deckelt fällige Wiederholungen und glättet Belastungsspitzen."
              value={draft.maximumReviewsPerDay}
              min={0}
              max={500}
              step={10}
              onChange={(value: any) => updateSetting("maximumReviewsPerDay", value)}
              testId="learning-settings-max-reviews"
            />
            <SelectField
              label="Reihenfolge in der Tagesrunde"
              hint="Legt fest, wie neue und fällige Karten zusammengestellt werden."
              value={draft.newReviewOrder}
              onChange={(value: any) => updateSetting("newReviewOrder", value)}
              options={reviewOrderOptions}
              testId="learning-settings-order"
            />
            <div className="rounded-2xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4">
              <p className="core-body font-semibold text-[var(--core-text-secondary)]">CoRe-Modus</p>
              <p className="mb-3 mt-1 core-caption leading-5 text-[var(--core-text-muted)]">Steuert, ob und wie nahe Varianten in diesem Geltungsbereich eingesetzt werden.</p>
              <CoreModeControl value={draft.coreMode} onChange={(value: any) => setDraft((current) => ({ ...current, coreMode: value }))} />
            </div>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 border-t border-[var(--core-border)] pt-6">
          <legend className="mb-1 flex items-center gap-2 core-body-large font-semibold text-[var(--core-text)]">
            <Clock3 size={19} className="text-[var(--core-action-secondary)]" aria-hidden="true" />
            Lernschritte und Intervalle
          </legend>
          <div className="grid gap-4 lg:grid-cols-2">
            <SelectField
              label="Lernschritte für neue Karten"
              hint="Der erste Wert gilt nach ‚Nochmal‘, der zweite für den verpflichtenden zweiten Kontakt am selben Tag. Auch ‚Leicht‘ überspringt ihn nicht."
              value={stepValue}
              onChange={(value: string) => updateSchedulerSetting("learningStepsMinutes", value.split(",").map(Number))}
              options={stepOptions}
              testId="learning-settings-steps"
            />
            <SelectField
              label="Wiederlern-Abstand nach Fehler"
              hint="Wann eine bereits gelernte Karte nach „Nochmal“ erneut erscheint."
              value={draft.schedulerProfile.relearningStepMinutes}
              onChange={(value: any) => updateSchedulerSetting("relearningStepMinutes", Number(value))}
              options={relearningStepOptions}
              testId="learning-settings-relearning"
            />
            <label className="flex min-h-20 items-start justify-between gap-4 rounded-2xl border border-[var(--core-border)] bg-core-surface p-4 core-body font-semibold text-[var(--core-text-secondary)] lg:col-span-2">
              <span>
                <span className="block">Weniger sehr kurze Intervalle</span>
                <span className="mt-1 block core-caption font-normal leading-5 text-[var(--core-text-muted)]">Verdoppelt kurze Lern- und Wiederlern-Abstände. Das reduziert unmittelbare Wiedererkennung, verlängert aber die Lernrunde.</span>
              </span>
              <input
                type="checkbox"
                checked={draft.schedulerProfile.lessShortIntervalBias}
                onChange={(event) => updateSchedulerSetting("lessShortIntervalBias", event.target.checked)}
                className="mt-1 size-5 accent-[var(--core-action-primary)]"
                data-testid="learning-settings-short-bias"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 border-t border-[var(--core-border)] pt-6">
          <legend className="mb-1 flex items-center gap-2 core-body-large font-semibold text-[var(--core-text)]">
            <Brain size={19} className="text-[var(--core-action-secondary)]" aria-hidden="true" />
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
              onChange={(value: number) => updateSchedulerSetting("desiredRetention", value / 100)}
              testId="learning-settings-retention"
            />
            <SelectField
              label="Maximales Intervall"
              hint="Kein einzelner Abstand wird größer als diese Obergrenze."
              value={draft.schedulerProfile.maximumIntervalDays}
              onChange={(value: any) => updateSchedulerSetting("maximumIntervalDays", Number(value))}
              options={intervalOptions}
              testId="learning-settings-maximum-interval"
            />
          </div>
          {draft.schedulerProfile.desiredRetention > 0.97 ? (
            <p className="rounded-xl border border-core-warning bg-core-warning-soft px-4 py-3 core-body leading-6 text-core-text" role="alert">
              Über 97 % steigt die tägliche Belastung meist sehr stark. Nutze diesen Bereich nur bewusst und beobachte dein Review-Pensum.
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--core-border)] pt-5">
          <p className="core-body text-[var(--core-text-muted)]">Änderungen werden erst mit dem Speichern übernommen.</p>
          <ActionButton type="button" variant="primary" icon={Save} onClick={save}>Änderungen speichern</ActionButton>
        </div>
      </div>
    </SoftPanel>
  );
}
