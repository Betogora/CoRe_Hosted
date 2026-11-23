import React from "react";
import { Layers } from "lucide-react";
import type { GlobalCardSettingsScreenProps, GlobalLearningSettingsSaveScope, SettingsSaveOutcome } from "../appScreenProps.ts";
import { normalizeLearnAheadMinutes, normalizeLeechThreshold } from "../deckSettings.ts";
import { EASY_DAY_KEYS, normalizeEasyDays } from "../easyDays.ts";
import type { EasyDayLevel, EasyDays } from "../coreTypes.ts";
import { normalizeDayStartHour } from "../learningDay.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { createDeckLearningSettingsDraft, createGlobalCardSettingsDraft, settingsDraftsEqual, type GlobalCardSettingsDraft } from "../settingsDraft.ts";
import { CrossLinkButton } from "../ui/actionUi.tsx";
import { CoreTag } from "../ui/coreUi.tsx";
import { FlagIcon, flagName } from "../ui/flagUi.tsx";
import { InfoHint } from "../ui/InfoHint.tsx";
import { normalizeFlagNames } from "../uiPreferences.ts";
import { CoreNumberField } from "../ui/CoreNumberField.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { CoreRadio } from "../ui/formControls.tsx";
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
  flaggen: "card-settings-flags-heading",
  fokus: "card-settings-focus-heading",
  stapel: "card-settings-decks-heading",
  tagesrunde: "learning-settings-daily-heading",
  scheduler: "learning-settings-scheduler-heading",
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

export function GlobalCardSettingsScreen({ section, decks, onOpenDeckSettings, timeZone, globalSchedulerPreferences, flagNames, learningProfiles, onSaveLearningProfiles, onSaveSettings, onDraftStateChange, onNavigate, simulationOffsetMinutes, pomodoroTimer, onStartPomodoro }: GlobalCardSettingsScreenProps) {
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
      leechThreshold: normalizeLeechThreshold(draft.leechThreshold),
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
          <h2 id="card-settings-planning-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Lerntag & Planung</h2>
          <div className="core-settings-list">
            <div className="core-settings-row">
              <label htmlFor="card-settings-day-start-hour" className="core-settings-row-title">Neuer Tag beginnt um</label>
              <div className="core-settings-row-control">
                <CoreNumberField id="card-settings-day-start-hour" value={draft.dayStartHour} min={0} max={23} unit="Uhr" className="w-32" onChange={(dayStartHour) => setDraft((current) => ({ ...current, dayStartHour }))} />
              </div>
            </div>
            <div className="core-settings-row">
              <div className="core-settings-row-heading">
                <label htmlFor="card-settings-learn-ahead" className="core-settings-row-title">Lernkarten vorziehen</label>
                <InfoHint label="Lernkarten vorziehen" id="card-settings-learn-ahead-hint">Ist sonst keine Karte mehr dran, zeigt dir CoRe Lernschritte, die innerhalb dieser Zeit fällig würden, schon jetzt. So musst du nicht warten oder für wenige Karten später zurückkommen. Wiederholungen werden nie vorgezogen; 0 schaltet das aus.</InfoHint>
              </div>
              <div className="core-settings-row-control">
                <CoreNumberField id="card-settings-learn-ahead" value={draft.learnAheadMinutes} min={0} max={720} unit="Min." ariaDescribedBy="card-settings-learn-ahead-hint" className="w-32" onChange={(learnAheadMinutes) => setDraft((current) => ({ ...current, learnAheadMinutes }))} />
              </div>
            </div>
            <div className="core-settings-row" data-testid="card-settings-leech">
              <div className="core-settings-row-heading">
                <label htmlFor="card-settings-leech-threshold" className="core-settings-row-title">Lernbremse ab Fehlern</label>
                <InfoHint label="Lernbremse ab Fehlern" id="card-settings-leech-hint">Vergisst du eine Karte in der Wiederholung so oft, markiert CoRe sie als Lernbremse, danach erneut nach jeweils der halben Zahl weiterer Fehler. Die Karte bleibt im Lernplan; die Markierung zeigt dir, dass sich eine Überarbeitung lohnen kann.</InfoHint>
              </div>
              <div className="core-settings-row-control">
                <CoreNumberField id="card-settings-leech-threshold" value={draft.leechThreshold} min={1} max={99} unit="Fehler" ariaDescribedBy="card-settings-leech-hint" className="w-32" onChange={(leechThreshold) => setDraft((current) => ({ ...current, leechThreshold }))} />
              </div>
            </div>
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Profilzeitzone</span>
              <div className="core-settings-row-control"><span className="core-settings-row-value">{timeZone || "Nicht festgelegt"}</span></div>
            </div>
          </div>

          <fieldset className="core-settings-group">
            <legend className="float-left w-full">
              <span className="core-settings-row-heading">
                <span className="core-heading-3 text-core-text">Wochenrhythmus</span>
                <InfoHint label="Wochenrhythmus">Stell Tage, an denen du wenig Zeit hast, auf ‚Weniger‘ oder ‚Minimal‘. CoRe plant neue Wiederholungen dann bevorzugt auf die übrigen Tage; bereits geplante Karten bleiben, wo sie sind.</InfoHint>
              </span>
            </legend>
            <div className="core-settings-matrix-frame mt-2">
              <table className="core-settings-matrix">
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
                            <CoreRadio
                              name={`card-settings-easy-day-${key}`}
                              value={option.value}
                              checked={draft.easyDays[key] === option.value}
                              aria-label={`${weekdayLabels[key]}: ${option.label}`}
                              onCheckedChange={() => setDraft((current) => ({ ...current, easyDays: { ...current.easyDays, [key]: option.value } }))}
                            />
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {section === "stapel" ? (
        <section className="core-settings-section" aria-labelledby="card-settings-decks-heading">
          <h2 id="card-settings-decks-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Einzelne Stapel</h2>
          <div className="core-settings-list">
            <div className="core-settings-row" data-layout="inline">
              <span className="core-settings-row-title">Stapeleinstellungen</span>
              <div className="core-settings-row-control">
                <DeckSelect ariaLabel="Stapeleinstellungen öffnen" value="" decks={decks} specialOption={{ value: "", label: "Stapel wählen", icon: Layers }} onValueChange={(deckId) => { if (deckId) onOpenDeckSettings(deckId); }} testId="card-settings-open-deck" menuAlign="end" />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {section === "flaggen" ? (
        <section id={sectionIds.flags} className="core-settings-section" aria-labelledby="card-settings-flags-heading">
          <h2 id="card-settings-flags-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Flaggen</h2>
          <div className="mt-2 grid gap-2">
            {draft.flagNames.map((name, index) => {
              const colorName = flagName(index + 1);
              return (
                <div key={colorName} className="flex items-center gap-3">
                  <FlagIcon flag={index + 1} size={22} />
                  <input
                    className="core-field min-w-0"
                    value={name}
                    maxLength={40}
                    placeholder={colorName}
                    aria-label={`Name für Flagge ${colorName}`}
                    data-testid={`card-settings-flag-${index + 1}`}
                    onChange={(event) => setDraft((current) => ({ ...current, flagNames: current.flagNames.map((value, position) => position === index ? event.target.value : value) }))}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {section === "fokus" ? (
        <section id={sectionIds.focus} className="core-settings-section" aria-labelledby="card-settings-focus-heading">
          <h2 id="card-settings-focus-heading" tabIndex={-1} className="core-heading-2 text-core-text outline-none">Fokuswerkzeuge</h2>
          <div className="core-settings-list">
            <div className="core-settings-row" data-layout="inline">
              <div className="core-settings-row-heading">
                <span className="core-settings-row-title">Simulator</span>
                {simulationOffsetMinutes > 0 ? <CoreTag tone="info" data-testid="card-settings-simulation-state">{`Aktiv · +${formatSimulationDuration(simulationOffsetMinutes)}`}</CoreTag> : null}
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
