import React from "react";
import { Layers } from "lucide-react";
import type { GlobalCardSettingsScreenProps, GlobalLearningSettingsSaveScope, SettingsSaveOutcome } from "../appScreenProps.ts";
import { normalizeLearnAheadMinutes } from "../deckSettings.ts";
import { EASY_DAY_KEYS, normalizeEasyDays } from "../easyDays.ts";
import type { EasyDayLevel, EasyDays } from "../coreTypes.ts";
import { normalizeDayStartHour } from "../learningDay.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { createDeckLearningSettingsDraft, createGlobalCardSettingsDraft, settingsDraftsEqual, type GlobalCardSettingsDraft } from "../settingsDraft.ts";
import { CrossLinkButton } from "../ui/actionUi.tsx";
import { flagName } from "../ui/flagUi.tsx";
import { normalizeFlagNames } from "../uiPreferences.ts";
import { CoreNumberField } from "../ui/CoreNumberField.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { LearningSettingsPanel } from "../ui/LearningSettingsPanel.tsx";
import { PomodoroTimerControl } from "../ui/pomodoroTimerUi.tsx";
import { DeckSelect } from "../ui/selectUi.tsx";

const sectionIds = {
  planning: "card-settings-planning",
  flags: "card-settings-flags",
  focus: "card-settings-focus",
} as const;

const headingIds: Record<GlobalCardSettingsScreenProps["section"], string> = {
  lerntag: "card-settings-planning-heading",
  tagesrunde: "learning-settings-daily-heading",
  scheduler: "learning-settings-scheduler-heading",
  flaggen: "card-settings-flags-heading",
  fokus: "card-settings-focus-heading",
};

const easyDayOptions: ReadonlyArray<{ value: EasyDayLevel; label: string }> = [
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

export function GlobalCardSettingsScreen({ section, decks, onOpenDeckSettings, timeZone, globalSchedulerPreferences, flagNames, learningProfiles, onSaveLearningProfiles, onSaveSettings, onDraftStateChange, onNavigate, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onStartPomodoro }: GlobalCardSettingsScreenProps) {
  const persistedDraft = createGlobalCardSettingsDraft(globalSchedulerPreferences, flagNames);
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
  const saveDraft = React.useCallback(async (scope: GlobalLearningSettingsSaveScope = "new-decks"): Promise<SettingsSaveOutcome> => {
    const normalized: GlobalCardSettingsDraft = {
      dayStartHour: normalizeDayStartHour(draft.dayStartHour),
      learnAheadMinutes: normalizeLearnAheadMinutes(draft.learnAheadMinutes),
      easyDays: normalizeEasyDays(draft.easyDays),
      learning: createDeckLearningSettingsDraft(draft.learning),
      flagNames: normalizeFlagNames(draft.flagNames),
    };
    try {
      const saved = await onSaveSettings(normalized, scope);
      if (!saved) throw new Error("Lerneinstellungen konnten nicht gespeichert werden.");
      setBaseline(normalized);
      setDraft(normalized);
      setErrorMessage("");
      setSuccessToast(scope === "all-decks"
        ? "Lerneinstellungen wurden auf alle Stapel angewandt und als Standard gespeichert."
        : "Lerneinstellungen wurden als Standard für neue Stapel gespeichert.", { appearance: "neutral" });
      return "saved";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Lerneinstellungen konnten nicht gespeichert werden.");
      return "failed";
    }
  }, [draft, onSaveSettings, setSuccessToast]);

  const saveDraftRef = React.useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const discardDraft = React.useCallback(() => {
    setDraft(baseline);
    setErrorMessage("");
  }, [baseline]);
  const discardDraftRef = React.useRef(discardDraft);
  discardDraftRef.current = discardDraft;
  const draftGuard = React.useMemo(() => ({
    save: (scope = "new-decks") => saveDraftRef.current(scope === "all-decks" ? "all-decks" : "new-decks"),
    discard: () => discardDraftRef.current(),
  }), []);

  React.useEffect(() => {
    onDraftStateChange(dirty ? draftGuard : null);
    return () => onDraftStateChange(null);
  }, [dirty, draftGuard, onDraftStateChange]);

  React.useEffect(() => {
    document.getElementById(headingIds[section])?.focus();
  }, [section]);

  return (
    <>
      {section === "lerntag" ? (
        <section id={sectionIds.planning} className="core-settings-section" aria-labelledby="card-settings-planning-heading">
          <h2 id="card-settings-planning-heading" tabIndex={-1} className="core-heading-2 font-semibold text-core-text outline-none">Lerntag & Planung</h2>
          <p className="core-settings-row-hint">Gilt kontoweit. Stapel und Lernprofile ändern diese Werte nicht.</p>
          <div className="core-settings-list">
            <div className="core-settings-row">
              <div className="core-settings-row-text">
                <label htmlFor="card-settings-day-start-hour" className="core-settings-row-title">Neuer Tag beginnt um</label>
                <p id="card-settings-day-start-hint" className="core-settings-row-hint">Davor zählt die Zeit noch zum Vortag.</p>
              </div>
              <div className="core-settings-row-control">
                <CoreNumberField id="card-settings-day-start-hour" value={draft.dayStartHour} min={0} max={23} unit="Uhr" ariaDescribedBy="card-settings-day-start-hint" className="w-32" onChange={(dayStartHour) => setDraft((current) => ({ ...current, dayStartHour }))} />
              </div>
            </div>
            <div className="core-settings-row">
              <div className="core-settings-row-text">
                <label htmlFor="card-settings-learn-ahead" className="core-settings-row-title">Lernkarten vorziehen</label>
                <p id="card-settings-learn-ahead-hint" className="core-settings-row-hint">Lernkarten, die in diesem Zeitraum fällig werden, erscheinen schon jetzt. 0 schaltet aus.</p>
              </div>
              <div className="core-settings-row-control">
                <CoreNumberField id="card-settings-learn-ahead" value={draft.learnAheadMinutes} min={0} max={720} unit="Min." ariaDescribedBy="card-settings-learn-ahead-hint" className="w-32" onChange={(learnAheadMinutes) => setDraft((current) => ({ ...current, learnAheadMinutes }))} />
              </div>
            </div>
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Profilzeitzone</span>
              <div className="core-settings-row-control"><span className="core-settings-row-value">{timeZone || "Nicht festgelegt"}</span></div>
            </div>
          </div>

          <fieldset className="core-settings-group">
            <legend className="float-left w-full core-heading-3 text-core-text">Wochenrhythmus</legend>
            <p className="core-settings-row-hint">Verteilt neu berechnete Wiederholungen auf passendere Tage. Sieben gleiche Werte ändern nichts.</p>
            <table className="core-settings-matrix mt-2">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Wochentag</span></th>
                  {easyDayOptions.map((option) => <th key={option.value} scope="col">{option.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {EASY_DAY_KEYS.map((key) => (
                  <tr key={key} data-testid={`card-settings-easy-day-${key}`}>
                    <th scope="row">{weekdayLabels[key]}</th>
                    {easyDayOptions.map((option) => (
                      <td key={option.value}>
                        <label className="core-settings-matrix-cell" data-level={option.value}>
                          <input
                            type="radio"
                            name={`card-settings-easy-day-${key}`}
                            value={option.value}
                            checked={draft.easyDays[key] === option.value}
                            aria-label={`${weekdayLabels[key]}: ${option.label}`}
                            className="size-4 cursor-pointer accent-core-action"
                            onChange={() => setDraft((current) => ({ ...current, easyDays: { ...current.easyDays, [key]: option.value } }))}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>
        </section>
      ) : null}

      {section === "tagesrunde" || section === "scheduler" ? (
        <LearningSettingsPanel
          context="global"
          section={section === "tagesrunde" ? "daily" : "scheduler"}
          draft={draft.learning}
          profiles={learningProfiles}
          defaultProfileName="Eigenes globales Lernprofil"
          onProfilesChange={onSaveLearningProfiles}
          onDraftChange={(learning) => setDraft((current) => ({ ...current, learning }))}
          onApplyProfile={(learning) => {
            setDraft((current) => ({ ...current, learning }));
            return true;
          }}
        />
      ) : null}

      {section === "tagesrunde" ? (
        <div className="core-settings-group">
          <h3 className="core-heading-3 text-core-text">Einzelne Stapel</h3>
          <div className="core-settings-list">
            <div className="core-settings-row" data-layout="inline">
              <div className="core-settings-row-text">
                <span className="core-settings-row-title">Stapeleinstellungen</span>
                <p className="core-settings-row-hint">Werte einzelner Stapel weichen vom Standard ab.</p>
              </div>
              <div className="core-settings-row-control md:w-72">
                <DeckSelect ariaLabel="Stapeleinstellungen öffnen" value="" decks={decks} specialOption={{ value: "", label: "Stapel wählen", icon: Layers }} onValueChange={(deckId) => { if (deckId) onOpenDeckSettings(deckId); }} testId="card-settings-open-deck" className="w-full" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {section === "flaggen" ? (
        <section id={sectionIds.flags} className="core-settings-section" aria-labelledby="card-settings-flags-heading">
          <h2 id="card-settings-flags-heading" tabIndex={-1} className="core-heading-2 font-semibold text-core-text outline-none">Flaggen</h2>
          <p className="core-settings-row-hint">Eigene Namen gelten kontoweit. Ein leeres Feld zeigt den Farbnamen.</p>
          <div className="core-settings-list">
            {draft.flagNames.map((name, index) => {
              const colorName = flagName(index + 1);
              return (
                <div key={colorName} className="core-settings-row">
                  <span className="core-settings-row-title flex items-center gap-3">
                    <span aria-hidden="true" className="size-4 shrink-0 rounded-round" style={{ background: `var(--core-flag-${index + 1})` }} />
                    {colorName}
                  </span>
                  <div className="core-settings-row-control">
                    <input
                      className="core-field min-w-0 md:w-72"
                      value={name}
                      maxLength={40}
                      placeholder={colorName}
                      aria-label={`Name für Flagge ${colorName}`}
                      data-testid={`card-settings-flag-${index + 1}`}
                      onChange={(event) => setDraft((current) => ({ ...current, flagNames: current.flagNames.map((value, position) => position === index ? event.target.value : value) }))}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {section === "fokus" ? (
        <section id={sectionIds.focus} className="core-settings-section" aria-labelledby="card-settings-focus-heading">
          <h2 id="card-settings-focus-heading" tabIndex={-1} className="core-heading-2 font-semibold text-core-text outline-none">Fokuswerkzeuge</h2>
          <div className="core-settings-list">
            <div className="core-settings-row" data-layout="inline">
              <div className="core-settings-row-text">
                <span className="core-settings-row-title">Simulator</span>
                {simulationOffsetMinutes > 0 ? <p className="core-settings-row-hint">{`Aktiv: ${simulationDateLabel} · +${formatSimulationDuration(simulationOffsetMinutes)}`}</p> : null}
              </div>
              <div className="core-settings-row-control">
                <CrossLinkButton onSelect={() => onNavigate("simulator")}>Simulator öffnen</CrossLinkButton>
              </div>
            </div>
            <PomodoroTimerControl timer={pomodoroTimer} variant="settings" onStart={onStartPomodoro} />
          </div>
        </section>
      ) : null}
      {errorMessage ? <p className="core-status-error mt-4 core-body" role="alert">{errorMessage}</p> : null}
    </>
  );
}
