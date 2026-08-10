import React from "react";
import { Brain, Clock3, Gauge, Save, Sparkles } from "lucide-react";
import { LEARNING_SETTING_PRESETS, applyLearningPreset, markLearningSettingsCustom, normalizeLearningSettings, type LearningSettings, type LearningSettingsInput } from "../deckSettings.ts";
import type { CoreMode } from "../coreTypes.ts";
import { ActionButton } from "./actionUi.tsx";
import { CoreModeControl, CoreSwitch, SoftPanel } from "./coreUi.tsx";
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

const variantThresholdOptions = [
  { value: "81", label: "Stabil · früher" },
  { value: "121", label: "CoRe-ready · Standard" },
  { value: "181", label: "Sicher · später" },
];

const activeVariantOptions = [1, 2, 3]
  .map((count) => ({ value: String(count), label: `${count} ${count === 1 ? "Variante" : "Varianten"}` }));

type LearningSettingsDraft = LearningSettings & {
  coreMode: CoreMode;
  variantThresholdXp?: number;
  maxActiveVariantsPerCard?: number;
};

function optionalFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function createLearningSettingsDraft(settings: LearningSettingsInput | undefined, coreMode: CoreMode): LearningSettingsDraft {
  const variantThresholdXp = optionalFiniteNumber(settings?.variantThresholdXp);
  const maxActiveVariantsPerCard = optionalFiniteNumber(settings?.maxActiveVariantsPerCard);

  return {
    ...normalizeLearningSettings(settings),
    coreMode,
    ...(variantThresholdXp !== undefined ? { variantThresholdXp } : {}),
    ...(maxActiveVariantsPerCard !== undefined ? { maxActiveVariantsPerCard } : {}),
  };
}

function mergeCustomSettings(current: LearningSettingsDraft, patch: LearningSettingsInput): LearningSettingsDraft {
  const next = markLearningSettingsCustom({
    ...current,
    ...patch,
    schedulerProfile: {
      ...current.schedulerProfile,
      ...(patch.schedulerProfile ?? {}),
    },
  });

  return {
    ...next,
    coreMode: current.coreMode,
    ...(current.variantThresholdXp !== undefined ? { variantThresholdXp: current.variantThresholdXp } : {}),
    ...(current.maxActiveVariantsPerCard !== undefined ? { maxActiveVariantsPerCard: current.maxActiveVariantsPerCard } : {}),
  };
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
      <span>
        <span className="block text-[var(--core-text-secondary)]">{label}</span>
        {hint ? <span className="mt-1 block core-caption font-normal leading-5 text-[var(--core-text-muted)]">{hint}</span> : null}
      </span>
      <span className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-3">
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
        <span className="flex min-w-0 items-center rounded-xl border border-[var(--core-border)] bg-core-surface text-[var(--core-text)]">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 text-right text-[var(--core-text)] outline-none"
            aria-label={`${label} als Zahl`}
          />
          {suffix ? <span className="shrink-0 pr-3 font-normal" aria-hidden="true">{suffix.trim()}</span> : null}
        </span>
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
        className="w-full font-semibold"
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
  const [draft, setDraft] = React.useState<LearningSettingsDraft>(() => createLearningSettingsDraft(settings, coreMode));
  const setSuccessToast = useSuccessToast();
  const settingsSignature = JSON.stringify({ settings, coreMode });

  React.useEffect(() => {
    setDraft(createLearningSettingsDraft(settings, coreMode));
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
  const showCoreParameters = draft.variantThresholdXp !== undefined && draft.maxActiveVariantsPerCard !== undefined;
  const variantThresholdValue = String(draft.variantThresholdXp ?? 121);
  const knownVariantThreshold = variantThresholdOptions.some((option) => option.value === variantThresholdValue);
  const visibleVariantThresholdOptions = knownVariantThreshold ? variantThresholdOptions : [
    { value: variantThresholdValue, label: `Eigener Wert · ${variantThresholdValue} XP` },
    ...variantThresholdOptions,
  ];
  const activeVariantValue = String(draft.maxActiveVariantsPerCard ?? 2);
  const knownActiveVariantCount = activeVariantOptions.some((option) => option.value === activeVariantValue);
  const visibleActiveVariantOptions = knownActiveVariantCount ? activeVariantOptions : [
    { value: activeVariantValue, label: `Eigener Wert · ${activeVariantValue}` },
    ...activeVariantOptions,
  ];

  function selectPreset(presetId: string) {
    if (presetId === "custom") return;
    setDraft((current) => ({
      ...applyLearningPreset(current, presetId),
      coreMode: current.coreMode,
      ...(current.variantThresholdXp !== undefined ? { variantThresholdXp: current.variantThresholdXp } : {}),
      ...(current.maxActiveVariantsPerCard !== undefined ? { maxActiveVariantsPerCard: current.maxActiveVariantsPerCard } : {}),
    }));
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

  function updateCoreSetting(key: "variantThresholdXp" | "maxActiveVariantsPerCard", value: number) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSuccessToast("");
  }

  function save() {
    onSave?.({
      ...normalizeLearningSettings(draft),
      coreMode: draft.coreMode,
      ...(draft.variantThresholdXp !== undefined ? { variantThresholdXp: draft.variantThresholdXp } : {}),
      ...(draft.maxActiveVariantsPerCard !== undefined ? { maxActiveVariantsPerCard: draft.maxActiveVariantsPerCard } : {}),
    });
    setSuccessToast(affectedDeckCount == null
      ? "Lernoptionen wurden gespeichert."
      : `Globale Lernvorgaben für ${affectedDeckCount} Stapel wurden erfolgreich gespeichert.`);
  }

  return (
    <SoftPanel className="overflow-hidden">
      <div className="border-b border-[var(--core-border)] bg-core-subtle p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-[1_1_28rem]">
            <h3 className="core-heading-2 font-semibold text-[var(--core-text)]">{scopeTitle}</h3>
            <p className="mt-1 max-w-3xl core-body leading-6 text-[var(--core-text-muted)]">{scopeDescription}</p>
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

      <div className="grid gap-5 p-4 sm:p-5">
        <fieldset className="grid gap-4">
          <legend className="mb-1 flex items-center gap-2 core-body-large font-semibold text-[var(--core-text)]">
            <Gauge size={19} className="text-[var(--core-action-secondary)]" aria-hidden="true" />
            Tagespensum und Reihenfolge
          </legend>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <RangeField
              label="Neue Karten pro Tag"
              value={draft.newCardsPerDay}
              min={0}
              max={500}
              onChange={(value: any) => updateSetting("newCardsPerDay", value)}
              testId="learning-settings-new-cards"
            />
            <RangeField
              label="Wiederholungen pro Tag"
              value={draft.maximumReviewsPerDay}
              min={0}
              max={2000}
              step={10}
              onChange={(value: any) => updateSetting("maximumReviewsPerDay", value)}
              testId="learning-settings-max-reviews"
            />
            <RangeField
              label="Lernkarten vorziehen"
              hint="Zeigt vorgemerkte Lernwiederholungen am Sitzungsende bis zu diesem Zeitraum früher. 0 Min. wartet bis zum gespeicherten Termin."
              value={draft.learnAheadMinutes}
              min={0}
              max={720}
              suffix=" Min."
              onChange={(value: any) => updateSetting("learnAheadMinutes", value)}
              testId="learning-settings-learn-ahead"
            />
            <SelectField
              label="Reihenfolge in der Tagesrunde"
              value={draft.newReviewOrder}
              onChange={(value: any) => updateSetting("newReviewOrder", value)}
              options={reviewOrderOptions}
              testId="learning-settings-order"
            />
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
              hint="Der erste Wert gilt nach „Nochmal“, mit „Gut“ geht es zum nächsten Schritt. „Leicht“ beendet die Lernphase sofort."
              value={stepValue}
              onChange={(value: string) => updateSchedulerSetting("learningStepsMinutes", value.split(",").map(Number))}
              options={stepOptions}
              testId="learning-settings-steps"
            />
            <SelectField
              label="Nach einem Fehler erneut zeigen"
              value={draft.schedulerProfile.relearningStepMinutes}
              onChange={(value: any) => updateSchedulerSetting("relearningStepMinutes", Number(value))}
              options={relearningStepOptions}
              testId="learning-settings-relearning"
            />
            <label className="flex min-h-20 items-start justify-between gap-4 rounded-2xl border border-[var(--core-border)] bg-core-surface p-4 core-body font-semibold text-[var(--core-text-secondary)] lg:col-span-2">
              <span>
                <span className="block">Kurze Abstände verdoppeln</span>
                <span className="mt-1 block core-caption font-normal leading-5 text-[var(--core-text-muted)]">Verdoppelt kurze Lern- und Wiederlern-Abstände. Das reduziert unmittelbare Wiedererkennung, verlängert aber die Lernrunde.</span>
              </span>
              <span data-testid="learning-settings-short-bias">
                <CoreSwitch
                  checked={draft.schedulerProfile.lessShortIntervalBias}
                  ariaLabel="Kurze Abstände verdoppeln"
                  onCheckedChange={(checked) => updateSchedulerSetting("lessShortIntervalBias", checked)}
                />
              </span>
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
              label="Gewünschte Erinnerungsrate"
              hint="Höhere Werte erzeugen kürzere Intervalle und mehr tägliche Wiederholungen. 90 % ist ein ausgewogener Startpunkt."
              value={Math.round(draft.schedulerProfile.desiredRetention * 100)}
              min={70}
              max={99}
              suffix=" %"
              onChange={(value: number) => updateSchedulerSetting("desiredRetention", value / 100)}
              testId="learning-settings-retention"
            />
            <SelectField
              label="Maximales Intervall"
              value={draft.schedulerProfile.maximumIntervalDays}
              onChange={(value: any) => updateSchedulerSetting("maximumIntervalDays", Number(value))}
              options={intervalOptions}
              testId="learning-settings-maximum-interval"
            />
          </div>
          {draft.schedulerProfile.desiredRetention > 0.97 ? (
            <p className="rounded-xl border border-core-warning bg-core-warning-soft px-4 py-3 core-body leading-6 text-core-text" role="alert">
              Über 97 % steigt die tägliche Belastung meist sehr stark. Nutze diesen Bereich nur bewusst und beobachte dein Wiederholungspensum.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-4 border-t border-[var(--core-border)] pt-5">
          <legend className="mb-1 flex items-center gap-2 core-body-large font-semibold text-[var(--core-text)]">
            <Sparkles size={19} className="text-[var(--core-action-secondary)]" aria-hidden="true" />
            Content Repetition
          </legend>
          <div className={`grid gap-4 ${showCoreParameters ? "lg:grid-cols-2 xl:grid-cols-3" : ""}`}>
            <div className="rounded-2xl border border-[var(--core-border)] bg-core-surface p-4">
              <p className="core-body font-semibold text-[var(--core-text-secondary)]">CoRe-Modus</p>
              <p className="mb-3 mt-1 core-caption leading-5 text-[var(--core-text-muted)]">Steuert, ob Varianten automatisch, nur gezielt oder gar nicht eingesetzt werden.</p>
              <CoreModeControl value={draft.coreMode} onChange={(value: any) => setDraft((current) => ({ ...current, coreMode: value }))} />
            </div>
            {showCoreParameters ? (
              <>
                <SelectField
                  label="Varianten einsetzen ab Lernstufe"
                  value={variantThresholdValue}
                  onChange={(value) => updateCoreSetting("variantThresholdXp", Number(value))}
                  options={visibleVariantThresholdOptions}
                  testId="learning-settings-variant-threshold"
                />
                <SelectField
                  label="Aktive Varianten pro Karte"
                  value={activeVariantValue}
                  onChange={(value) => updateCoreSetting("maxActiveVariantsPerCard", Number(value))}
                  options={visibleActiveVariantOptions}
                  testId="learning-settings-active-variants"
                />
              </>
            ) : null}
          </div>
        </fieldset>

        <div className="flex justify-end border-t border-[var(--core-border)] pt-5">
          <ActionButton type="button" variant="primary" icon={Save} onClick={save}>Lernoptionen speichern</ActionButton>
        </div>
      </div>
    </SoftPanel>
  );
}
