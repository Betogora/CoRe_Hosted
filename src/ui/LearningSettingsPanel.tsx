import React from "react";
import { Brain, CopyCheck, Flame, Leaf, Pencil, Plus, Save, Scale, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { DeckSettings, LearningProfileSource, LearningProfileTemplate } from "../coreTypes.ts";
import {
  applyLearningProfileTemplateToDeckSettings,
  BUILT_IN_LEARNING_PROFILE_TEMPLATES,
  createLearningProfileTemplate,
  deleteLearningProfileTemplate,
  markLearningSettingsCustom,
  normalizeLearningProfileSource,
  normalizeLearningSettings,
  renameLearningProfileTemplate,
  updateLearningProfileTemplate,
  type LearningSettingsInput,
} from "../deckSettings.ts";
import { ActionButton } from "./actionUi.tsx";
import { ActionDialog, CoreModeControl, CoreSwitch, SoftPanel } from "./coreUi.tsx";
import { useSuccessToast } from "./feedbackUi.tsx";
import { CoreSelect } from "./selectUi.tsx";

const learningStepOptions = [
  { value: "1,10", label: "Kompakt · 1 Min. → 10 Min." },
  { value: "5,15", label: "Standard · 5 Min. → 15 Min." },
  { value: "10,30", label: "Ruhig · 10 Min. → 30 Min." },
];
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
const relearningStepOptions = [1, 3, 5, 10, 20, 30].map((minutes) => ({ value: String(minutes), label: `${minutes} Min.` }));
const variantThresholdOptions = [
  { value: "81", label: "Stabil · früher" },
  { value: "121", label: "CoRe-ready · Standard" },
  { value: "181", label: "Sicher · später" },
];
const activeVariantOptions = [1, 2, 3].map((count) => ({ value: String(count), label: `${count} ${count === 1 ? "Variante" : "Varianten"}` }));

type DeckLearningDraft = ReturnType<typeof normalizeLearningSettings> & {
  coreMode: DeckSettings["coreMode"];
  variantThresholdXp: number;
  maxActiveVariantsPerCard: number;
  learningProfileSource: LearningProfileSource | null;
};

interface LearningSettingsPanelProps {
  settings: DeckSettings;
  profiles: LearningProfileTemplate[];
  defaultProfileName: string;
  onProfilesChange: (profiles: LearningProfileTemplate[]) => unknown;
  onSave: (settings: LearningSettingsInput) => unknown;
}

function createDraft(settings: LearningSettingsInput & Pick<DeckLearningDraft, "coreMode" | "variantThresholdXp" | "maxActiveVariantsPerCard" | "learningProfileSource">): DeckLearningDraft {
  return {
    ...normalizeLearningSettings(settings),
    coreMode: settings.coreMode,
    variantThresholdXp: Number.isFinite(Number(settings.variantThresholdXp)) ? Number(settings.variantThresholdXp) : 121,
    maxActiveVariantsPerCard: Number.isFinite(Number(settings.maxActiveVariantsPerCard)) ? Number(settings.maxActiveVariantsPerCard) : 2,
    learningProfileSource: normalizeLearningProfileSource(settings.learningProfileSource),
  };
}

function NumberField({ label, value, min, max, testId, onChange }: { label: string; value: number; min: number; max: number; testId: string; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-2 core-body font-semibold text-core-muted">
      {label}
      <input type="number" min={min} max={max} step="1" value={value} data-testid={testId} className="min-h-11 rounded-xl border border-core-border px-3 text-core-text" onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SelectField({ label, value, options, testId, onChange }: { label: string; value: string | number; options: Array<{ value: string; label: string }>; testId: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 core-body font-semibold text-core-muted">
      {label}
      <CoreSelect ariaLabel={label} value={String(value)} options={options} testId={testId} onValueChange={onChange} />
    </label>
  );
}

export function LearningSettingsPanel({ settings, profiles, defaultProfileName, onProfilesChange, onSave }: LearningSettingsPanelProps) {
  const [draft, setDraft] = React.useState(() => createDraft(settings));
  const [selectedProfileId, setSelectedProfileId] = React.useState(draft.learningProfileSource?.id ?? "custom");
  const [profileName, setProfileName] = React.useState(defaultProfileName);
  const [deleteProfileId, setDeleteProfileId] = React.useState<string | null>(null);
  const setSuccessToast = useSuccessToast();
  const settingsDraftKey = JSON.stringify(createDraft(settings));

  React.useEffect(() => {
    const nextDraft = createDraft(settings);
    setDraft(nextDraft);
    setSelectedProfileId(nextDraft.learningProfileSource?.id ?? "custom");
  }, [settingsDraftKey]);

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

  function editLearning(patch: LearningSettingsInput) {
    setDraft((current) => ({
      ...current,
      ...markLearningSettingsCustom({
        ...current,
        ...patch,
        schedulerProfile: { ...current.schedulerProfile, ...(patch.schedulerProfile ?? {}) },
      }),
      learningProfileSource: null,
    }));
    setSelectedProfileId("custom");
  }

  function editCore(patch: Partial<Pick<DeckLearningDraft, "coreMode" | "variantThresholdXp" | "maxActiveVariantsPerCard">>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function applySelectedProfile() {
    if (!selectedProfile) return;
    const next = applyLearningProfileTemplateToDeckSettings({ ...draft }, selectedProfile);
    const nextDraft = createDraft(next);
    setDraft(nextDraft);
    setSelectedProfileId(selectedProfile.id);
    onSave(nextDraft);
    setSuccessToast(`Lernprofil „${selectedProfile.name}“ wurde auf diesen Stapel angewandt.`);
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
    setSuccessToast("Lernprofil wurde mit den aktuellen Stapelwerten aktualisiert. Andere Stapel bleiben unverändert.");
  }

  function confirmDeleteProfile() {
    if (!deleteProfileId) return;
    onProfilesChange(deleteLearningProfileTemplate(profiles, deleteProfileId));
    setSelectedProfileId("custom");
    setDeleteProfileId(null);
    setSuccessToast("Lernprofil wurde gelöscht. Bereits kopierte Stapelwerte bleiben erhalten.");
  }

  function save() {
    onSave(draft);
    setSuccessToast("Stapeleinstellungen wurden gespeichert.");
  }

  return (
    <>
      <section id="deck-daily-profiles" className="scroll-mt-6 grid gap-4" aria-labelledby="deck-daily-heading">
        <h2 id="deck-daily-heading" className="core-heading-2 font-semibold text-core-text">Tagesrunde & Lernprofile</h2>
        <SoftPanel className="p-5 sm:p-6">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <SelectField label="Lernprofil-Vorlage" value={selectedProfileId} options={profileOptions} testId="learning-profile-select" onChange={(value) => { setSelectedProfileId(value); setProfileName(profiles.find((profile) => profile.id === value)?.name ?? defaultProfileName); }} />
            <ActionButton type="button" variant="primary" icon={CopyCheck} disabled={!selectedProfile} onClick={applySelectedProfile}>Auf diesen Stapel anwenden</ActionButton>
          </div>
          <p className="mt-3 core-caption leading-5 text-core-muted">
            Das Anwenden kopiert die Werte nur in diesen Stapel. Spätere Änderungen an der Vorlage wirken nicht automatisch weiter.
          </p>
          {draft.learningProfileSource ? (
            <p className={`mt-3 rounded-xl border px-4 py-3 core-body ${appliedProfileIsStale ? "border-core-warning bg-core-warning-soft" : "border-core-info bg-core-info-soft"}`} role={appliedProfileIsStale ? "status" : undefined}>
              Herkunft: {appliedProfile?.name ?? "Gelöschtes Lernprofil"} · Version {draft.learningProfileSource.contentVersion}{appliedProfileIsStale ? " · Neuere Vorlage verfügbar" : ""}
            </p>
          ) : null}

          <div className="mt-5 grid min-w-0 gap-3 border-t border-core-border pt-5 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
            <label className="grid gap-2 core-body font-semibold text-core-muted">Name des eigenen Lernprofils<input className="min-h-11 min-w-0 rounded-xl border border-core-border px-3 text-core-text" value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label>
            <ActionButton type="button" variant="secondary" icon={Plus} onClick={createProfile}>Anlegen</ActionButton>
            <ActionButton type="button" variant="secondary" icon={Pencil} disabled={!selectedCustomProfile} onClick={renameProfile}>Umbenennen</ActionButton>
            <ActionButton type="button" variant="destructive" icon={Trash2} disabled={!selectedCustomProfile} onClick={() => setDeleteProfileId(selectedCustomProfile?.id ?? null)}>Löschen</ActionButton>
          </div>
          <ActionButton type="button" variant="secondary" icon={Save} className="mt-3" disabled={!selectedCustomProfile} onClick={updateProfile}>Vorlage mit aktuellen Werten aktualisieren</ActionButton>

          <fieldset className="mt-6 grid gap-4 border-t border-core-border pt-5">
            <legend className="mb-1 core-body-large font-semibold text-core-text">Tagespensum und Reihenfolge</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField label="Neue Karten pro Tag" value={draft.newCardsPerDay} min={0} max={500} testId="learning-settings-new-cards" onChange={(value) => editLearning({ newCardsPerDay: value })} />
              <NumberField label="Wiederholungen pro Tag" value={draft.maximumReviewsPerDay} min={0} max={2000} testId="learning-settings-max-reviews" onChange={(value) => editLearning({ maximumReviewsPerDay: value })} />
            </div>
            <p className="core-caption leading-5 text-core-muted">Umfasst fällige, tagesübergreifende Lern- und neue Karten. Wiederholungen haben Vorrang.</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SelectField label="Neue und fällige Karten" value={draft.newReviewOrder} options={reviewOrderOptions} testId="learning-settings-order" onChange={(value) => editLearning({ newReviewOrder: value })} />
              <SelectField label="Neue Karten sortieren" value={draft.newCardSortOrder} options={newCardSortOptions} testId="learning-settings-new-sort" onChange={(value) => editLearning({ newCardSortOrder: value })} />
              <SelectField label="Fällige Karten sortieren" value={draft.reviewCardSortOrder} options={reviewCardSortOptions} testId="learning-settings-review-sort" onChange={(value) => editLearning({ reviewCardSortOrder: value })} />
            </div>
            {draft.reviewCardSortOrder === "lowest-retrievability" ? <p className="core-caption leading-5 text-core-muted">Zeigt zuerst Karten, die du wahrscheinlich eher vergessen hast.</p> : null}
          </fieldset>
        </SoftPanel>
      </section>

      <section id="deck-scheduler-core" className="scroll-mt-6 grid gap-4" aria-labelledby="deck-scheduler-heading">
        <h2 id="deck-scheduler-heading" className="core-heading-2 font-semibold text-core-text">Scheduler & CoRe</h2>
        <SoftPanel className="p-5 sm:p-6">
          <fieldset className="grid gap-4">
            <legend className="mb-1 flex items-center gap-2 core-body-large font-semibold text-core-text"><Brain size={19} aria-hidden="true" />Lernablauf</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="Lernschritte" value={draft.schedulerProfile.learningStepsMinutes.join(",")} options={learningStepOptions} testId="learning-settings-steps" onChange={(value) => editLearning({ schedulerProfile: { learningStepsMinutes: value.split(",").map(Number) } })} />
              <SelectField label="Nach einem Fehler erneut zeigen" value={draft.schedulerProfile.relearningStepMinutes} options={relearningStepOptions} testId="learning-settings-relearning" onChange={(value) => editLearning({ schedulerProfile: { relearningStepMinutes: Number(value) } })} />
              <label className="flex min-h-20 items-start justify-between gap-4 rounded-2xl border border-core-border bg-core-surface p-4 core-body font-semibold text-core-muted md:col-span-2">
                <span><span className="block">Kurze Abstände verdoppeln</span><span className="mt-1 block core-caption font-normal leading-5">Reduziert unmittelbare Wiedererkennung, verlängert aber die Lernrunde.</span></span>
                <CoreSwitch checked={draft.schedulerProfile.lessShortIntervalBias} ariaLabel="Kurze Abstände verdoppeln" onCheckedChange={(checked) => editLearning({ schedulerProfile: { lessShortIntervalBias: checked } })} />
              </label>
            </div>
          </fieldset>

          <fieldset className="mt-6 grid gap-4 border-t border-core-border pt-5">
            <legend className="mb-1 core-body-large font-semibold text-core-text">Erinnerungsziel</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 core-body font-semibold text-core-muted">Gewünschte Erinnerungsrate<span className="flex items-center gap-3"><input type="range" min="70" max="99" value={Math.round(draft.schedulerProfile.desiredRetention * 100)} data-testid="learning-settings-retention" className="min-w-0 flex-1" onChange={(event) => editLearning({ schedulerProfile: { desiredRetention: Number(event.target.value) / 100 } })} /><output>{Math.round(draft.schedulerProfile.desiredRetention * 100)} %</output></span></label>
              <NumberField label="Maximales Intervall in Tagen" value={draft.schedulerProfile.maximumIntervalDays} min={30} max={36500} testId="learning-settings-maximum-interval" onChange={(value) => editLearning({ schedulerProfile: { maximumIntervalDays: value } })} />
            </div>
            {draft.schedulerProfile.desiredRetention > 0.97 ? <p className="rounded-xl border border-core-warning bg-core-warning-soft px-4 py-3 core-body" role="alert">Über 97 % steigt die tägliche Belastung meist sehr stark.</p> : null}
          </fieldset>

          <fieldset className="mt-6 grid gap-4 border-t border-core-border pt-5">
            <legend className="mb-1 flex items-center gap-2 core-body-large font-semibold text-core-text"><Sparkles size={19} aria-hidden="true" />Content Repetition</legend>
            <p className="core-caption leading-5 text-core-muted">Diese Werte gehören direkt zum Stapel und werden von Lernprofilen nicht verändert.</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-core-border bg-core-surface p-4"><p className="mb-3 core-body font-semibold text-core-muted">CoRe-Modus</p><CoreModeControl value={draft.coreMode} onChange={(value) => editCore({ coreMode: value })} /></div>
              <SelectField label="Varianten einsetzen ab Lernstufe" value={draft.variantThresholdXp} options={variantThresholdOptions} testId="learning-settings-variant-threshold" onChange={(value) => editCore({ variantThresholdXp: Number(value) })} />
              <SelectField label="Aktive Varianten pro Karte" value={draft.maxActiveVariantsPerCard} options={activeVariantOptions} testId="learning-settings-active-variants" onChange={(value) => editCore({ maxActiveVariantsPerCard: Number(value) })} />
            </div>
          </fieldset>

          <div className="mt-6 flex justify-end border-t border-core-border pt-5"><ActionButton type="button" variant="primary" icon={Save} onClick={save}>Stapeleinstellungen speichern</ActionButton></div>
        </SoftPanel>
      </section>

      <ActionDialog open={Boolean(deleteProfileId)} title="Lernprofil löschen?" description="Bereits kopierte Stapelwerte bleiben unverändert. Nur die wiederverwendbare Vorlage wird gelöscht." confirmLabel="Lernprofil löschen" cancelLabel="Abbrechen" destructive onCancel={() => setDeleteProfileId(null)} onConfirm={confirmDeleteProfile} />
    </>
  );
}
