import React from "react";
import { AlertTriangle, CopyCheck, Flame, Leaf, Pencil, Plus, Save, Scale, SlidersHorizontal, Trash2 } from "lucide-react";
import type { LearningProfileTemplate } from "../coreTypes.ts";
import {
  applyLearningProfileTemplateToDeckSettings,
  BUILT_IN_LEARNING_PROFILE_TEMPLATES,
  createLearningProfileTemplate,
  deleteLearningProfileTemplate,
  markLearningSettingsCustom,
  renameLearningProfileTemplate,
  updateLearningProfileTemplate,
  type LearningSettingsInput,
} from "../deckSettings.ts";
import { createDeckLearningSettingsDraft, type DeckLearningSettingsDraft } from "../settingsDraft.ts";
import { ActionButton, IconButton } from "./actionUi.tsx";
import { ActionDialog, CoreSegmentedControl } from "./coreUi.tsx";
import { CoreNumberField } from "./CoreNumberField.tsx";
import { useSuccessToast } from "./feedbackUi.tsx";
import { CoreSelect } from "./selectUi.tsx";

const learningStepOptions = [
  { value: "1,10", label: "Standard" },
  { value: "5,15", label: "Länger" },
  { value: "10,30", label: "Ruhig" },
];
/** Keeps a stored value that is not one of the presets (from a template or an import) visible and selectable. */
function withCurrentOption(options: Array<{ value: string; label: string }>, value: string, label: string) {
  return options.some((option) => option.value === value) ? options : [...options, { value, label }];
}
const reviewOrderOptions = [
  { value: "reviews-first", label: "Fällige Karten zuerst" },
  { value: "mixed", label: "Neue und fällige mischen" },
  { value: "new-first", label: "Neue Karten zuerst" },
];
const newCardSortOptions = [
  { value: "oldest-first", label: "Älteste zuerst" },
  { value: "random", label: "Zufällig" },
];
const reviewCardSortOptions = [
  { value: "most-overdue", label: "Längst fällig zuerst" },
  { value: "lowest-retrievability", label: "Wahrscheinlich vergessen zuerst" },
];
const buryOptions = [
  { key: "buryNewSiblings", label: "Neue Geschwisterkarten begraben", testId: "learning-settings-bury-new" },
  { key: "buryReviewSiblings", label: "Fällige Geschwisterkarten begraben", testId: "learning-settings-bury-review" },
  { key: "buryInterdayLearningSiblings", label: "Tagesübergreifende Lern-Geschwisterkarten begraben", testId: "learning-settings-bury-interday" },
] as const;
const relearningStepOptions =[1, 3, 5, 10, 20, 30].map((minutes) => ({ value: String(minutes), label: `${minutes} Min.` }));
const variantThresholdOptions = [
  { value: "7", label: "Früher" },
  { value: "21", label: "Standard" },
  { value: "60", label: "Später" },
];
const activeVariantOptions = [1, 2, 3].map((count) => ({ value: String(count), label: String(count) }));

interface LearningSettingsPanelProps {
  draft: DeckLearningSettingsDraft;
  profiles: LearningProfileTemplate[];
  defaultProfileName: string;
  context?: "deck" | "global";
  /** The settings dialogs show one area at a time. */
  section: "daily" | "scheduler";
  onProfilesChange: (profiles: LearningProfileTemplate[]) => unknown;
  onDraftChange: (draft: DeckLearningSettingsDraft) => void;
  onApplyProfile: (settings: DeckLearningSettingsDraft) => boolean;
}

function SettingsRow({ title, htmlFor, hint, hintId, children }: { title: string; htmlFor?: string; hint?: React.ReactNode; hintId?: string; children: React.ReactNode }) {
  return (
    <div className="core-settings-row">
      <div className="core-settings-row-text">
        {htmlFor ? <label htmlFor={htmlFor} className="core-settings-row-title">{title}</label> : <span className="core-settings-row-title">{title}</span>}
        {hint ? <div id={hintId} className="core-settings-row-hint">{hint}</div> : null}
      </div>
      <div className="core-settings-row-control">{children}</div>
    </div>
  );
}

function SelectRow({ title, value, options, testId, onChange }: { title: string; value: string | number; options: Array<{ value: string; label: string }>; testId: string; onChange: (value: string) => void }) {
  return (
    <SettingsRow title={title}>
      <CoreSelect ariaLabel={title} value={String(value)} options={options} testId={testId} className="w-full md:w-72" onValueChange={onChange} />
    </SettingsRow>
  );
}

/** Preset segments plus the stored value as text; a stored value outside the presets selects no segment and reads `Eigene · …`. */
function PresetRow({ title, hint, value, options, valueText, testId, onChange }: { title: string; hint?: React.ReactNode; value: string; options: ReadonlyArray<{ value: string; label: string }>; valueText: (isPreset: boolean) => string | null; testId: string; onChange: (value: string) => void }) {
  const isPreset = options.some((option) => option.value === value);
  const text = valueText(isPreset);
  return (
    <SettingsRow title={title} hint={hint}>
      <span className="flex min-w-0 flex-wrap items-center gap-3" data-testid={testId}>
        <CoreSegmentedControl ariaLabel={title} value={isPreset ? value : ""} options={options} onValueChange={(next) => { if (next) onChange(next); }} />
        {text ? <span className="core-settings-row-value">{text}</span> : null}
      </span>
    </SettingsRow>
  );
}

export function LearningSettingsPanel({ draft, profiles, defaultProfileName, context = "deck", section, onProfilesChange, onDraftChange, onApplyProfile }: LearningSettingsPanelProps) {
  const [selectedProfileId, setSelectedProfileId] = React.useState(draft.learningProfileSource?.id ?? "custom");
  const [profileName, setProfileName] = React.useState(defaultProfileName);
  const [deleteProfileId, setDeleteProfileId] = React.useState<string | null>(null);
  const setSuccessToast = useSuccessToast();
  React.useEffect(() => {
    setSelectedProfileId(draft.learningProfileSource?.id ?? "custom");
  }, [draft.learningProfileSource?.contentVersion, draft.learningProfileSource?.id]);

  React.useEffect(() => setProfileName(defaultProfileName), [defaultProfileName]);

  const allProfiles = [...BUILT_IN_LEARNING_PROFILE_TEMPLATES, ...profiles];
  const selectedProfile = allProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedCustomProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const appliedProfile = draft.learningProfileSource ? allProfiles.find((profile) => profile.id === draft.learningProfileSource?.id) ?? null : null;
  const appliedProfileIsStale = Boolean(appliedProfile && draft.learningProfileSource && appliedProfile.contentVersion > draft.learningProfileSource.contentVersion);
  const profileOptions = [
    ...allProfiles.map((profile) => ({ value: profile.id, label: profile.name, icon: profile.id === "builtin:standard" ? Scale : profile.id === "builtin:intensive" ? Flame : profile.id === "builtin:relaxed" ? Leaf : Pencil })),
    { value: "custom", label: "Eigene Einstellungen", icon: SlidersHorizontal },
  ];
  const retentionPercent = Math.round(draft.schedulerProfile.desiredRetention * 100);
  const sectionPrefix = context === "global" ? "learning-settings" : "deck";
  const dailySectionId = `${sectionPrefix}-daily-profiles`;
  const schedulerSectionId = `${sectionPrefix}-scheduler-core`;
  const dailyHeadingId = `${sectionPrefix}-daily-heading`;
  const schedulerHeadingId = `${sectionPrefix}-scheduler-heading`;

  function editLearning(patch: LearningSettingsInput) {
    onDraftChange({
      ...draft,
      ...markLearningSettingsCustom({
        ...draft,
        ...patch,
        schedulerProfile: { ...draft.schedulerProfile, ...(patch.schedulerProfile ?? {}) },
      }),
      learningProfileSource: null,
    });
    setSelectedProfileId("custom");
  }

  function editCore(patch: Partial<Pick<DeckLearningSettingsDraft, "variantThresholdDays" | "maxActiveVariantsPerCard">>) {
    onDraftChange({ ...draft, ...patch });
  }

  function applySelectedProfile() {
    if (!selectedProfile) return;
    const next = applyLearningProfileTemplateToDeckSettings({ ...draft }, selectedProfile);
    const nextDraft = createDeckLearningSettingsDraft(next);
    if (!onApplyProfile(nextDraft)) return;
    setSelectedProfileId(selectedProfile.id);
    setSuccessToast(context === "global"
      ? `Lernprofil „${selectedProfile.name}“ ist ausgewählt. Speichere die Änderungen, um es als Standard zu übernehmen.`
      : `Lernprofil „${selectedProfile.name}“ wurde auf diesen Stapel angewandt.`);
  }

  function createProfile() {
    const result = createLearningProfileTemplate(profiles, { name: profileName, defaultName: defaultProfileName, settings: draft });
    onProfilesChange(result.profiles);
    setSelectedProfileId(result.template.id);
    setProfileName(result.template.name);
    setSuccessToast(`Lernprofil „${result.template.name}“ wurde angelegt.`);
  }

  function renameProfile() {
    if (!selectedCustomProfile) return;
    const next = renameLearningProfileTemplate(profiles, selectedCustomProfile.id, profileName);
    onProfilesChange(next);
    setProfileName(next.find((profile) => profile.id === selectedCustomProfile.id)?.name ?? profileName);
    setSuccessToast("Lernprofil wurde umbenannt.");
  }

  function updateProfile() {
    if (!selectedCustomProfile) return;
    onProfilesChange(updateLearningProfileTemplate(profiles, selectedCustomProfile.id, draft));
    setSuccessToast(context === "global"
      ? "Lernprofil wurde mit den aktuellen globalen Werten aktualisiert. Vorhandene Stapel bleiben unverändert."
      : "Lernprofil wurde mit den aktuellen Stapelwerten aktualisiert. Andere Stapel bleiben unverändert.");
  }

  function confirmDeleteProfile() {
    if (!deleteProfileId) return;
    onProfilesChange(deleteLearningProfileTemplate(profiles, deleteProfileId));
    setSelectedProfileId("custom");
    setDeleteProfileId(null);
    setSuccessToast("Lernprofil wurde gelöscht. Bereits kopierte Stapelwerte bleiben erhalten.");
  }

  return (
    <>
      {section === "daily" ? (
        <section id={dailySectionId} className="core-settings-section" aria-labelledby={dailyHeadingId}>
          <h2 id={dailyHeadingId} tabIndex={-1} className="core-heading-2 text-core-text outline-none">Tagesrunde & Lernprofile</h2>
          <div className="core-settings-list">
            <SettingsRow
              title="Lernprofil-Vorlage"
              hint={<>
                <p>{context === "global"
                  ? "Gilt für neue Stapel. Vorhandene Stapel ändern sich erst über „Auf alle Stapel anwenden“."
                  : "Kopiert die Werte in diesen Stapel. Spätere Änderungen an der Vorlage wirken nicht automatisch weiter."}</p>
                {draft.learningProfileSource ? (
                  <p className={appliedProfileIsStale ? "mt-1 flex items-center gap-1 text-core-text" : "mt-1"} role={appliedProfileIsStale ? "status" : undefined}>
                    {appliedProfileIsStale ? <AlertTriangle className="shrink-0 text-core-warning" size={14} aria-hidden="true" /> : null}
                    Herkunft: {appliedProfile?.name ?? "Gelöschtes Lernprofil"} · Version {draft.learningProfileSource.contentVersion}{appliedProfileIsStale ? " · Neuere Vorlage verfügbar" : ""}
                  </p>
                ) : null}
              </>}
            >
              <CoreSelect ariaLabel="Lernprofil-Vorlage" value={selectedProfileId} options={profileOptions} testId="learning-profile-select" className="w-full md:w-60" onValueChange={(value) => { setSelectedProfileId(value); setProfileName(profiles.find((profile) => profile.id === value)?.name ?? defaultProfileName); }} />
              <ActionButton type="button" variant="primary" icon={CopyCheck} disabled={!selectedProfile} onClick={applySelectedProfile}>{context === "global" ? "Als Standardprofil verwenden" : "Auf diesen Stapel anwenden"}</ActionButton>
            </SettingsRow>
            <SettingsRow title="Eigenes Lernprofil" htmlFor={`${sectionPrefix}-profile-name`}>
              <input id={`${sectionPrefix}-profile-name`} aria-label="Name des eigenen Lernprofils" className="core-field min-w-0 basis-full md:w-56 md:basis-auto" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
              <ActionButton type="button" variant="secondary" icon={Plus} onClick={createProfile}>Anlegen</ActionButton>
              <ActionButton type="button" variant="secondary" icon={Pencil} disabled={!selectedCustomProfile} onClick={renameProfile}>Umbenennen</ActionButton>
              <IconButton type="button" variant="destructive-quiet" icon={Trash2} label="Lernprofil löschen" disabled={!selectedCustomProfile} onClick={() => setDeleteProfileId(selectedCustomProfile?.id ?? null)} />
            </SettingsRow>
            <SettingsRow title="Vorlage aktualisieren" hint="Übernimmt die aktuellen Werte in die gewählte eigene Vorlage. Stapel bleiben unverändert.">
              <ActionButton type="button" variant="secondary" icon={Save} disabled={!selectedCustomProfile} onClick={updateProfile}>Mit aktuellen Werten aktualisieren</ActionButton>
            </SettingsRow>
          </div>

          <div className="core-settings-group">
            <h3 className="core-heading-3 text-core-text">Tagespensum und Reihenfolge</h3>
            <div className="core-settings-list">
              <SettingsRow title="Neue Karten pro Tag" htmlFor="learning-settings-new-cards">
                <CoreNumberField id="learning-settings-new-cards" value={draft.newCardsPerDay} min={0} max={500} className="w-32" onChange={(value) => editLearning({ newCardsPerDay: value })} />
              </SettingsRow>
              <SettingsRow title="Wiederholungen pro Tag" htmlFor="learning-settings-max-reviews" hintId="learning-settings-max-reviews-hint" hint="Umfasst fällige, tagesübergreifende Lern- und neue Karten. Wiederholungen haben Vorrang.">
                <CoreNumberField id="learning-settings-max-reviews" value={draft.maximumReviewsPerDay} min={0} max={2000} ariaDescribedBy="learning-settings-max-reviews-hint" className="w-32" onChange={(value) => editLearning({ maximumReviewsPerDay: value })} />
              </SettingsRow>
              <SelectRow title="Kartenreihenfolge" value={draft.newReviewOrder} options={reviewOrderOptions} testId="learning-settings-order" onChange={(value) => editLearning({ newReviewOrder: value })} />
              <PresetRow title="Neue Karten sortieren" value={draft.newCardSortOrder} options={newCardSortOptions} valueText={() => null} testId="learning-settings-new-sort" onChange={(value) => editLearning({ newCardSortOrder: value })} />
              <SelectRow title="Fällige Karten sortieren" value={draft.reviewCardSortOrder} options={reviewCardSortOptions} testId="learning-settings-review-sort" onChange={(value) => editLearning({ reviewCardSortOrder: value })} />
            </div>
          </div>

          <fieldset className="core-settings-group">
            <legend className="float-left w-full core-heading-3 text-core-text">Geschwisterkarten begraben</legend>
            <p className="core-settings-row-hint">Karten aus demselben Inhalt warten nach einer Antwort bis zum nächsten Lerntag. Lernstand und Fälligkeit bleiben.</p>
            <div className="core-settings-list">
              {buryOptions.map((option) => (
                <label key={option.key} className="core-settings-row cursor-pointer" data-layout="inline">
                  <span className="core-settings-row-title">{option.label}</span>
                  <span className="core-settings-row-control">
                    <input type="checkbox" className="size-4 shrink-0 cursor-pointer accent-core-action" checked={draft[option.key]} data-testid={option.testId} onChange={(event) => editLearning({ [option.key]: event.target.checked })} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      ) : null}

      {section === "scheduler" ? (
        <section id={schedulerSectionId} className="core-settings-section" aria-labelledby={schedulerHeadingId}>
          <h2 id={schedulerHeadingId} tabIndex={-1} className="core-heading-2 text-core-text outline-none">Scheduler & CoRe</h2>
          <div className="core-settings-group mt-2">
            <h3 className="core-heading-3 text-core-text">Lernablauf</h3>
            <div className="core-settings-list">
              <PresetRow
                title="Lernschritte"
                value={draft.schedulerProfile.learningStepsMinutes.join(",")}
                options={learningStepOptions}
                valueText={(isPreset) => `${isPreset ? "" : "Eigene · "}${draft.schedulerProfile.learningStepsMinutes.join(" → ")} Min.`}
                testId="learning-settings-steps"
                onChange={(value) => editLearning({ schedulerProfile: { learningStepsMinutes: value.split(",").map(Number) } })}
              />
              <SelectRow title="Nach einem Fehler erneut zeigen" value={draft.schedulerProfile.relearningStepMinutes} options={withCurrentOption(relearningStepOptions, String(draft.schedulerProfile.relearningStepMinutes), `${draft.schedulerProfile.relearningStepMinutes} Min.`)} testId="learning-settings-relearning" onChange={(value) => editLearning({ schedulerProfile: { relearningStepMinutes: Number(value) } })} />
            </div>
          </div>

          <div className="core-settings-group">
            <h3 className="core-heading-3 text-core-text">Erinnerungsziel</h3>
            <div className="core-settings-list">
              <SettingsRow
                title="Gewünschte Erinnerungsrate"
                htmlFor="learning-settings-retention"
                hint={<>
                  <p>Höhere Werte bedeuten kürzere Abstände und mehr Wiederholungen.</p>
                  {draft.schedulerProfile.desiredRetention > 0.97 ? <p className="mt-1 flex items-center gap-1 text-core-text"><AlertTriangle className="shrink-0 text-core-warning" size={14} aria-hidden="true" />Über 97 % steigt die tägliche Belastung meist sehr stark.</p> : null}
                </>}
              >
                <span className="flex min-h-control w-full items-center gap-3 md:w-72">
                  <input id="learning-settings-retention" type="range" min="70" max="99" value={retentionPercent} aria-valuetext={`${retentionPercent} %`} data-testid="learning-settings-retention" className="min-w-0 flex-1 cursor-pointer accent-core-action" onChange={(event) => editLearning({ schedulerProfile: { desiredRetention: Number(event.target.value) / 100 } })} />
                  <output htmlFor="learning-settings-retention" className="min-w-12 text-right core-body tabular-nums text-core-text">{retentionPercent} %</output>
                </span>
              </SettingsRow>
              <SettingsRow title="Maximales Intervall" htmlFor="learning-settings-maximum-interval">
                <CoreNumberField id="learning-settings-maximum-interval" value={draft.schedulerProfile.maximumIntervalDays} min={30} max={36500} unit="Tage" className="w-36" onChange={(value) => editLearning({ schedulerProfile: { maximumIntervalDays: value } })} />
              </SettingsRow>
            </div>
          </div>

          <div className="core-settings-group">
            <h3 className="core-heading-3 text-core-text">Content Repetition</h3>
            <p className="core-settings-row-hint">{context === "global" ? "Standard für neue Stapel." : "Gehört zu diesem Stapel."} Lernprofile ändern diese Werte nicht.</p>
            <div className="core-settings-list">
              <PresetRow
                title="Varianten einsetzen ab Haltbarkeit"
                hint="Ab dieser Haltbarkeit wechseln sich Karte und Variante ab."
                value={String(draft.variantThresholdDays)}
                options={variantThresholdOptions}
                valueText={(isPreset) => `${isPreset ? "" : "Eigene · "}${draft.variantThresholdDays} Tage`}
                testId="learning-settings-variant-threshold"
                onChange={(value) => editCore({ variantThresholdDays: Number(value) })}
              />
              <PresetRow
                title="Aktive Varianten pro Karte"
                hint="Höchstzahl für Erzeugen und Abfragen."
                value={String(draft.maxActiveVariantsPerCard)}
                options={activeVariantOptions}
                valueText={(isPreset) => isPreset ? null : `Eigene · ${draft.maxActiveVariantsPerCard}`}
                testId="learning-settings-active-variants"
                onChange={(value) => editCore({ maxActiveVariantsPerCard: Number(value) })}
              />
            </div>
          </div>
        </section>
      ) : null}

      <ActionDialog open={Boolean(deleteProfileId)} title="Lernprofil löschen?" description="Bereits kopierte Stapelwerte bleiben unverändert. Nur die wiederverwendbare Vorlage wird gelöscht." confirmLabel="Lernprofil löschen" cancelLabel="Abbrechen" destructive onCancel={() => setDeleteProfileId(null)} onConfirm={confirmDeleteProfile} />
    </>
  );
}
