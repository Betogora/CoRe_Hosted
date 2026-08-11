import React from "react";
import { Brain, Clock3, Flame, Gauge, Leaf, Save, Scale, SlidersHorizontal, Sparkles } from "lucide-react";
import { LEARNING_SETTING_PRESETS, applyLearningPreset, markLearningSettingsCustom, normalizeLearningSettings, type LearningSettings, type LearningSettingsInput } from "../deckSettings.ts";
import type { CoreMode } from "../coreTypes.ts";
import { normalizeDayStartHour } from "../learningDay.ts";
import { ActionButton } from "./actionUi.tsx";
import { CoreModeControl, CoreSwitch, SoftPanel } from "./coreUi.tsx";
import { useSuccessToast } from "./feedbackUi.tsx";
import { CoreSelect, type CoreSelectOption } from "./selectUi.tsx";

const learningStepOptions = [
  { value: "1,10", label: "Kompakt · 1 Min. → 10 Min." },
  { value: "5,15", label: "Standard · 5 Min. → 15 Min." },
  { value: "10,30", label: "Ruhig · 10 Min. → 30 Min." },
];

const learningPresetOptions = [
  ...LEARNING_SETTING_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
    icon: preset.id === "standard" ? Scale : preset.id === "intensive" ? Flame : Leaf,
  })),
  { value: "custom", label: "Eigene Einstellungen", icon: SlidersHorizontal },
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
  dayStartHour?: number;
  variantThresholdXp?: number;
  maxActiveVariantsPerCard?: number;
};

function optionalFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function createLearningSettingsDraft(settings: LearningSettingsInput | undefined, coreMode: CoreMode, dayStartHour?: number): LearningSettingsDraft {
  const variantThresholdXp = optionalFiniteNumber(settings?.variantThresholdXp);
  const maxActiveVariantsPerCard = optionalFiniteNumber(settings?.maxActiveVariantsPerCard);

  return {
    ...normalizeLearningSettings(settings),
    coreMode,
    ...(dayStartHour !== undefined ? { dayStartHour: normalizeDayStartHour(dayStartHour) } : {}),
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
    ...(current.dayStartHour !== undefined ? { dayStartHour: current.dayStartHour } : {}),
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

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  testId?: string;
}

function NumberField({ label, value, min, max, onChange, testId }: NumberFieldProps) {
  const [inputValue, setInputValue] = React.useState(String(value));
  const editingRef = React.useRef(false);

  React.useEffect(() => {
    if (!editingRef.current) setInputValue(String(value));
  }, [value]);

  function commit() {
    editingRef.current = false;
    const rawValue = inputValue.trim();
    const parsed = Number(rawValue);
    if (!rawValue || !Number.isFinite(parsed)) {
      setInputValue(String(value));
      return;
    }

    const normalized = Math.min(max, Math.max(min, Math.round(parsed)));
    setInputValue(String(normalized));
    if (normalized !== value) onChange(normalized);
  }

  return (
    <label className="grid min-h-20 gap-3 rounded-2xl border border-[var(--core-border)] bg-core-surface p-4 core-body font-semibold text-[var(--core-text-secondary)] sm:grid-cols-[minmax(0,1fr)_5.5rem] sm:items-center">
      <span className="min-w-0 text-[var(--core-text-secondary)]">{label}</span>
      <span className="flex min-h-11 min-w-0 items-center rounded-xl border border-[var(--core-border)] bg-core-surface text-[var(--core-text)] sm:w-[5.5rem]">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          inputMode="numeric"
          value={inputValue}
          onFocus={() => { editingRef.current = true; }}
          onChange={(event) => setInputValue(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="min-h-11 min-w-0 w-full border-0 bg-transparent px-3 text-right text-[var(--core-text)] outline-none"
          aria-label={`${label} als Zahl`}
          data-testid={testId}
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
  customSettings?: LearningSettingsInput;
  coreMode?: CoreMode;
  dayStartHour?: number;
  scopeTitle: string;
  scopeDescription: string;
  autoSave?: boolean;
  onSave?: (settings: LearningSettingsDraft) => void;
}

export function LearningSettingsPanel({ settings, customSettings, coreMode = "auto", dayStartHour, scopeTitle, scopeDescription, autoSave = false, onSave }: LearningSettingsPanelProps) {
  const [draft, setDraft] = React.useState<LearningSettingsDraft>(() => createLearningSettingsDraft(settings, coreMode, dayStartHour));
  const setSuccessToast = useSuccessToast();
  const settingsSignature = JSON.stringify({ settings, coreMode, dayStartHour });

  React.useEffect(() => {
    setDraft(createLearningSettingsDraft(settings, coreMode, dayStartHour));
  }, [settingsSignature]);

  const stepValue = draft.schedulerProfile.learningStepsMinutes.join(",");
  const knownStepValue = learningStepOptions.some((option) => option.value === stepValue);
  const stepOptions = knownStepValue ? learningStepOptions : [
    { value: stepValue, label: `Eigene · ${draft.schedulerProfile.learningStepsMinutes[0]} Min. → ${draft.schedulerProfile.learningStepsMinutes[1]} Min.` },
    ...learningStepOptions,
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

  function savableSettings(nextDraft: LearningSettingsDraft): LearningSettingsDraft {
    return {
      ...normalizeLearningSettings(nextDraft),
      coreMode: nextDraft.coreMode,
      ...(nextDraft.dayStartHour !== undefined ? { dayStartHour: nextDraft.dayStartHour } : {}),
      ...(nextDraft.variantThresholdXp !== undefined ? { variantThresholdXp: nextDraft.variantThresholdXp } : {}),
      ...(nextDraft.maxActiveVariantsPerCard !== undefined ? { maxActiveVariantsPerCard: nextDraft.maxActiveVariantsPerCard } : {}),
    };
  }

  function changeDraft(nextDraft: LearningSettingsDraft) {
    setDraft(nextDraft);
    setSuccessToast("");
    if (autoSave) onSave?.(savableSettings(nextDraft));
  }

  function selectPreset(presetId: string) {
    if (presetId === "custom") {
      changeDraft(customSettings
        ? createLearningSettingsDraft(customSettings, draft.coreMode, draft.dayStartHour)
        : {
            ...markLearningSettingsCustom(draft),
            coreMode: draft.coreMode,
            ...(draft.dayStartHour !== undefined ? { dayStartHour: draft.dayStartHour } : {}),
            ...(draft.variantThresholdXp !== undefined ? { variantThresholdXp: draft.variantThresholdXp } : {}),
            ...(draft.maxActiveVariantsPerCard !== undefined ? { maxActiveVariantsPerCard: draft.maxActiveVariantsPerCard } : {}),
          });
      return;
    }
    changeDraft({
      ...applyLearningPreset(draft, presetId),
      coreMode: draft.coreMode,
      ...(draft.dayStartHour !== undefined ? { dayStartHour: draft.dayStartHour } : {}),
      ...(draft.variantThresholdXp !== undefined ? { variantThresholdXp: draft.variantThresholdXp } : {}),
      ...(draft.maxActiveVariantsPerCard !== undefined ? { maxActiveVariantsPerCard: draft.maxActiveVariantsPerCard } : {}),
    });
  }

  function updateSetting(key: string, value: any) {
    changeDraft(mergeCustomSettings(draft, { [key]: value }));
  }

  function updateSchedulerSetting(key: keyof LearningSettingsDraft["schedulerProfile"], value: unknown) {
    changeDraft(mergeCustomSettings(draft, { schedulerProfile: { [key]: value } }));
  }

  function updateCoreSetting(key: "variantThresholdXp" | "maxActiveVariantsPerCard", value: number) {
    changeDraft({ ...draft, [key]: value });
  }

  function save() {
    onSave?.(savableSettings(draft));
    setSuccessToast("Lernoptionen wurden gespeichert.");
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
            <NumberField
              label="Neue Karten pro Tag"
              value={draft.newCardsPerDay}
              min={0}
              max={500}
              onChange={(value) => updateSetting("newCardsPerDay", value)}
              testId="learning-settings-new-cards"
            />
            <NumberField
              label="Wiederholungen pro Tag"
              value={draft.maximumReviewsPerDay}
              min={0}
              max={2000}
              onChange={(value) => updateSetting("maximumReviewsPerDay", value)}
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
          {draft.dayStartHour !== undefined ? (
            <label className="flex min-h-20 flex-col justify-center gap-3 rounded-2xl border border-[var(--core-border)] bg-core-surface p-4 core-body font-semibold text-[var(--core-text-secondary)] sm:flex-row sm:items-center sm:justify-between">
              <span>Neuer Tag beginnt um</span>
              <span className="flex flex-wrap items-center gap-3 font-normal text-[var(--core-text)]">
                <span className="flex min-h-11 w-24 items-center rounded-xl border border-[var(--core-border)] bg-core-surface">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    step={1}
                    inputMode="numeric"
                    value={draft.dayStartHour}
                    onChange={(event) => changeDraft({ ...draft, dayStartHour: normalizeDayStartHour(event.target.value) })}
                    className="min-h-11 min-w-0 w-full border-0 bg-transparent px-3 text-right text-[var(--core-text)] outline-none"
                    aria-label="Neuer Tag beginnt um, Stunden nach Mitternacht"
                    data-testid="learning-settings-day-start-hour"
                  />
                </span>
                <span>Stunden nach Mitternacht</span>
              </span>
            </label>
          ) : null}
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
            <NumberField
              label="Maximales Intervall in Tagen"
              value={draft.schedulerProfile.maximumIntervalDays}
              min={30}
              max={36500}
              onChange={(value: number) => updateSchedulerSetting("maximumIntervalDays", value)}
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
              <CoreModeControl value={draft.coreMode} onChange={(value: any) => changeDraft({ ...draft, coreMode: value })} />
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

        {autoSave ? null : (
          <div className="flex justify-end border-t border-[var(--core-border)] pt-5">
            <ActionButton type="button" variant="primary" icon={Save} onClick={save}>Lernoptionen speichern</ActionButton>
          </div>
        )}
      </div>
    </SoftPanel>
  );
}
