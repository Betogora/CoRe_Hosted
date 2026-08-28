import React from "react";
import { CalendarClock, Timer } from "lucide-react";
import type { GlobalCardSettingsScreenProps } from "../appScreenProps.ts";
import { normalizeLearnAheadMinutes } from "../deckSettings.ts";
import { EASY_DAY_KEYS, normalizeEasyDays } from "../easyDays.ts";
import type { EasyDayLevel, EasyDays } from "../coreTypes.ts";
import { normalizeDayStartHour } from "../learningDay.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { createGlobalCardSettingsDraft, settingsDraftsEqual, type GlobalCardSettingsDraft } from "../settingsDraft.ts";
import { CrossLinkButton } from "../ui/actionUi.tsx";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { InPageNavigation } from "../ui/InPageNavigation.tsx";
import { PomodoroTimerControl } from "../ui/pomodoroTimerUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";

const sectionIds = {
  planning: "card-settings-planning",
  focus: "card-settings-focus",
} as const;

const settingsSections = [
  { id: sectionIds.planning, label: "Lerntag & Planung", icon: CalendarClock },
  { id: sectionIds.focus, label: "Fokuswerkzeuge", icon: Timer },
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

export function GlobalCardSettingsScreen({ timeZone, globalSchedulerPreferences, onSaveSettings, onDraftStateChange, onNavigate, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onStartPomodoro }: GlobalCardSettingsScreenProps) {
  const persistedDraft = createGlobalCardSettingsDraft(globalSchedulerPreferences);
  const persistedDraftKey = JSON.stringify(persistedDraft);
  const [baseline, setBaseline] = React.useState<GlobalCardSettingsDraft>(persistedDraft);
  const [draft, setDraft] = React.useState<GlobalCardSettingsDraft>(persistedDraft);
  const [errorMessage, setErrorMessage] = React.useState("");
  const setSuccessToast = useSuccessToast();

  React.useEffect(() => {
    setDraft((current) => settingsDraftsEqual(current, baseline) ? persistedDraft : current);
    setBaseline(persistedDraft);
  }, [persistedDraftKey]);

  const dirty = !settingsDraftsEqual(draft, baseline);
  const saveDraft = React.useCallback(async () => {
    const normalized: GlobalCardSettingsDraft = {
      dayStartHour: normalizeDayStartHour(draft.dayStartHour),
      learnAheadMinutes: normalizeLearnAheadMinutes(draft.learnAheadMinutes),
      easyDays: normalizeEasyDays(draft.easyDays),
    };
    try {
      const saved = await onSaveSettings(normalized);
      if (!saved) throw new Error("Karteneinstellungen konnten nicht gespeichert werden.");
      setBaseline(normalized);
      setDraft(normalized);
      setErrorMessage("");
      setSuccessToast("Karteneinstellungen wurden gespeichert.", { appearance: "neutral" });
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Karteneinstellungen konnten nicht gespeichert werden.");
      return false;
    }
  }, [draft, onSaveSettings, setSuccessToast]);

  const saveDraftRef = React.useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const draftGuard = React.useMemo(() => ({ save: () => saveDraftRef.current() }), []);

  React.useEffect(() => {
    onDraftStateChange(dirty ? draftGuard : null);
    return () => onDraftStateChange(null);
  }, [dirty, draftGuard, onDraftStateChange]);

  return (
    <div className="grid min-w-0 gap-7">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Lernen" title="Karteneinstellungen" />
        <CrossLinkButton onSelect={() => onNavigate("stapel-einstellungen", { focusedDeckId: null })}>
          Stapeleinstellungen
        </CrossLinkButton>
      </div>

      <InPageNavigation ariaLabel="Bereiche der Karteneinstellungen" items={settingsSections}>
        <section id={sectionIds.planning} className="grid gap-4" aria-labelledby="card-settings-planning-heading">
          <h2 id="card-settings-planning-heading" tabIndex={-1} className="core-heading-2 rounded-lg font-semibold text-core-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4">Lerntag & Planung</h2>
          <SoftPanel className="p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 core-body font-semibold text-core-muted">
                Neuer Tag beginnt um
                <span className="flex min-h-11 items-center gap-2 rounded-xl border border-core-border px-3">
                  <input type="number" min="0" max="23" step="1" value={draft.dayStartHour} data-testid="card-settings-day-start-hour" className="min-w-0 flex-1 bg-transparent text-core-text outline-none" onChange={(event) => setDraft((current) => ({ ...current, dayStartHour: Number(event.target.value) }))} />
                  <span className="font-normal">Uhr</span>
                </span>
              </label>
              <label className="grid gap-2 core-body font-semibold text-core-muted">
                Lernkarten vorziehen
                <span className="flex min-h-11 items-center gap-2 rounded-xl border border-core-border px-3">
                  <input type="number" min="0" max="720" step="1" value={draft.learnAheadMinutes} data-testid="card-settings-learn-ahead" className="min-w-0 flex-1 bg-transparent text-core-text outline-none" onChange={(event) => setDraft((current) => ({ ...current, learnAheadMinutes: Number(event.target.value) }))} />
                  <span className="font-normal">Min.</span>
                </span>
              </label>
              <div className="grid gap-2 core-body font-semibold text-core-muted">
                Profilzeitzone
                <span className="flex min-h-11 items-center rounded-xl border border-core-border bg-core-subtle px-3 font-normal text-core-text">{timeZone || "Nicht festgelegt"}</span>
              </div>
            </div>
            <p className="mt-3 core-caption leading-5 text-core-muted">Diese Einstellungen gelten global für alle Karten und Stapel. Lernprofile und CoRe-Parameter bleiben stapelspezifisch.</p>
            <fieldset className="mt-6 border-t border-core-border pt-5">
              <legend className="core-body-large font-semibold text-core-text">Wochenrhythmus</legend>
              <p className="mt-2 core-caption leading-5 text-core-muted">CoRe verteilt neu berechnete Wiederholungen möglichst auf passendere Tage. Sind alle Tage gleich, bleibt die Planung unverändert.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {EASY_DAY_KEYS.map((key) => (
                  <label key={key} className={`grid min-w-0 gap-2 rounded-2xl border p-4 core-body font-semibold text-core-text ${easyDayToneClasses[draft.easyDays[key]]}`}>
                    {weekdayLabels[key]}
                    <CoreSelect
                      ariaLabel={`${weekdayLabels[key]} im Wochenrhythmus`}
                      value={draft.easyDays[key]}
                      options={easyDayOptions}
                      testId={`card-settings-easy-day-${key}`}
                      onValueChange={(value) => setDraft((current) => ({ ...current, easyDays: { ...current.easyDays, [key]: value as EasyDayLevel } }))}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          </SoftPanel>
        </section>

        <section id={sectionIds.focus} className="grid gap-4" aria-labelledby="card-settings-focus-heading">
          <h2 id="card-settings-focus-heading" tabIndex={-1} className="core-heading-2 rounded-lg font-semibold text-core-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-4">Fokuswerkzeuge</h2>
          <SoftPanel className="overflow-hidden p-0">
            <button type="button" onClick={() => onNavigate("simulator")} className="flex min-h-[4.75rem] w-full items-center gap-3 border-b border-core-border px-4 py-3 text-left transition hover:bg-[var(--core-surface-hover)] sm:px-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-core-warning-soft text-core-text"><CalendarClock size={20} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block core-body-large font-semibold text-core-text">Simulator</span><span className="block core-caption text-core-muted">{simulationOffsetMinutes > 0 ? `Aktiv: ${simulationDateLabel} · +${formatSimulationDuration(simulationOffsetMinutes)}` : "Lernfortschritt über simulierte Zeitpunkte prüfen"}</span></span>
            </button>
            <PomodoroTimerControl timer={pomodoroTimer} variant="settings" onStart={onStartPomodoro} />
          </SoftPanel>
          {errorMessage ? <p className="core-status-error core-body" role="alert">{errorMessage}</p> : null}
        </section>
      </InPageNavigation>
    </div>
  );
}
