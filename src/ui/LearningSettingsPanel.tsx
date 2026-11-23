import * as Popover from "@radix-ui/react-popover";
import React from "react";
import { AlertTriangle, Check, CopyCheck, Flame, Leaf, MoreHorizontal, Pencil, Plus, Save, Scale, SlidersHorizontal, Trash2, X } from "lucide-react";
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
import { ActionDialog, CoreSegmentedControl, CoreTag } from "./coreUi.tsx";
import { CoreNumberField } from "./CoreNumberField.tsx";
import { useSuccessToast } from "./feedbackUi.tsx";
import { CoreSlider, CoreSwitch } from "./formControls.tsx";
import { InfoHint } from "./InfoHint.tsx";
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
  section: "daily" | "scheduler";
  onProfilesChange: (profiles: LearningProfileTemplate[]) => unknown;
  onDraftChange: (draft: DeckLearningSettingsDraft) => void;
  onApplyProfile: (settings: DeckLearningSettingsDraft) => boolean;
}

function SettingsRow({ title, htmlFor, info, note, children }: { title: string; htmlFor?: string; info?: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="core-settings-row">
      <div className="core-settings-row-text">
        <div className="core-settings-row-heading">
          {htmlFor ? <label htmlFor={htmlFor} className="core-settings-row-title">{title}</label> : <span className="core-settings-row-title">{title}</span>}
          {info ? <InfoHint label={title}>{info}</InfoHint> : null}
        </div>
        {note}
      </div>
      <div className="core-settings-row-control">{children}</div>
    </div>
  );
}

function SelectRow({ title, value, options, testId, onChange }: { title: string; value: string | number; options: Array<{ value: string; label: string }>; testId: string; onChange: (value: string) => void }) {
  return (
    <SettingsRow title={title}>
      <CoreSelect ariaLabel={title} value={String(value)} options={options} testId={testId} className="w-full md:w-auto" menuAlign="end" onValueChange={onChange} />
    </SettingsRow>
  );
}

function PresetRow({ title, info, value, options, valueText, testId, onChange }: { title: string; info?: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; valueText: (isPreset: boolean) => string | null; testId: string; onChange: (value: string) => void }) {
  const isPreset = options.some((option) => option.value === value);
  const text = valueText(isPreset);
  return (
    <SettingsRow title={title} info={info}>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-3 max-md:w-full" data-testid={testId}>
        {text ? <span className="core-settings-row-value max-md:mr-auto">{text}</span> : null}
        <CoreSegmentedControl ariaLabel={title} value={isPreset ? value : ""} options={options} className="max-md:min-w-0 max-md:flex-1 max-md:basis-56" onValueChange={(next) => { if (next) onChange(next); }} />
      </span>
    </SettingsRow>
  );
}

function SectionTitle({ id, global, children }: { id: string; global: boolean; children: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 id={id} tabIndex={-1} className="core-heading-2 text-core-text outline-none">{children}</h2>
      {global ? <CoreTag tone="neutral">Standard für neue Stapel</CoreTag> : null}
    </div>
  );
}

export function LearningSettingsPanel({ draft, profiles, defaultProfileName, context = "deck", section, onProfilesChange, onDraftChange, onApplyProfile }: LearningSettingsPanelProps) {
  const [selectedProfileId, setSelectedProfileId] = React.useState(draft.learningProfileSource?.id ?? "custom");
  /** Null while the row shows the selection; otherwise the name being typed for a new or the selected own profile. */
  const [profileEdit, setProfileEdit] = React.useState<{ mode: "create" | "rename"; name: string } | null>(null);
  const [deleteProfileId, setDeleteProfileId] = React.useState<string | null>(null);
  const setSuccessToast = useSuccessToast();
  const profileNameRef = React.useRef<HTMLInputElement>(null);
  const profileMenuRef = React.useRef<HTMLButtonElement>(null);
  // The menu keeps the focus away from its button while its action opens the name field or a dialog.
  const menuHandsFocusOn = React.useRef(false);
  const editMode = profileEdit?.mode ?? null;
  const leftEdit = React.useRef(false);
  React.useEffect(() => {
    setSelectedProfileId(draft.learningProfileSource?.id ?? "custom");
  }, [draft.learningProfileSource?.contentVersion, draft.learningProfileSource?.id]);

  React.useEffect(() => {
    if (editMode) {
      leftEdit.current = true;
      profileNameRef.current?.focus();
      profileNameRef.current?.select();
    } else if (leftEdit.current) {
      leftEdit.current = false;
      profileMenuRef.current?.focus();
    }
  }, [editMode]);

  const allProfiles = [...BUILT_IN_LEARNING_PROFILE_TEMPLATES, ...profiles];
  const selectedProfile = allProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedCustomProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const appliedProfile = draft.learningProfileSource ? allProfiles.find((profile) => profile.id === draft.learningProfileSource?.id) ?? null : null;
  const appliedProfileIsStale = Boolean(appliedProfile && draft.learningProfileSource && appliedProfile.contentVersion > draft.learningProfileSource.contentVersion);
  const selectedIsApplied = Boolean(selectedProfile && selectedProfile.id === draft.learningProfileSource?.id && !appliedProfileIsStale);
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

  function submitProfileEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!profileEdit?.name.trim()) return;
    if (profileEdit.mode === "create") {
      const result = createLearningProfileTemplate(profiles, { name: profileEdit.name, defaultName: defaultProfileName, settings: draft });
      onProfilesChange(result.profiles);
      setSelectedProfileId(result.template.id);
      setSuccessToast(`Lernprofil „${result.template.name}“ wurde angelegt.`);
    } else if (selectedCustomProfile) {
      onProfilesChange(renameLearningProfileTemplate(profiles, selectedCustomProfile.id, profileEdit.name));
      setSuccessToast("Lernprofil wurde umbenannt.");
    }
    setProfileEdit(null);
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

  function handOn(action: () => void) {
    return () => {
      menuHandsFocusOn.current = true;
      action();
    };
  }

  return (
    <>
      {section === "daily" ? (
        <section id={dailySectionId} className="core-settings-section" aria-labelledby={dailyHeadingId}>
          <SectionTitle id={dailyHeadingId} global={context === "global"}>Tagesrunde & Lernprofile</SectionTitle>
          <div className="core-settings-list">
            <div className="core-settings-row md:grid-cols-[auto_minmax(0,1fr)]" data-testid="learning-profile-row" data-profile-edit={editMode ?? undefined}>
              <div className="core-settings-row-heading">
                <span className="core-settings-row-title">Lernprofil</span>
                {context === "deck" ? <InfoHint label="Lernprofil">Anwenden kopiert die Werte des Profils in diesen Stapel. Änderst du das Profil später, bleibt der Stapel unverändert, bis du es erneut anwendest.</InfoHint> : null}
                {appliedProfileIsStale ? <CoreTag tone="warning" role="status">Neuere Fassung</CoreTag> : null}
              </div>
              {profileEdit ? (
                <form className="core-settings-row-control flex-nowrap" onSubmit={submitProfileEdit}>
                  <input
                    ref={profileNameRef}
                    aria-label={profileEdit.mode === "create" ? "Name des neuen Lernprofils" : "Neuer Name des Lernprofils"}
                    className="core-field min-w-0 flex-1 md:w-64 md:flex-none"
                    maxLength={60}
                    value={profileEdit.name}
                    data-testid="learning-profile-name"
                    onChange={(event) => setProfileEdit({ ...profileEdit, name: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      // Escape leaves the name field, not the settings dialog around it.
                      event.stopPropagation();
                      setProfileEdit(null);
                    }}
                  />
                  <ActionButton type="submit" variant="primary" icon={Check} disabled={!profileEdit.name.trim()}>{profileEdit.mode === "create" ? "Anlegen" : "Speichern"}</ActionButton>
                  <IconButton type="button" variant="ghost" icon={X} label="Abbrechen" onClick={() => setProfileEdit(null)} />
                </form>
              ) : (
                <div className="core-settings-row-control md:flex-nowrap">
                  <CoreSelect ariaLabel="Lernprofil" value={selectedProfile ? selectedProfileId : "custom"} options={profileOptions} testId="learning-profile-select" className="w-full md:w-auto" menuAlign="end" onValueChange={setSelectedProfileId} />
                  <ActionButton type="button" variant="secondary" icon={CopyCheck} disabled={!selectedProfile || selectedIsApplied} data-testid="learning-profile-apply" onClick={applySelectedProfile}>Anwenden</ActionButton>
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <IconButton ref={profileMenuRef} type="button" icon={MoreHorizontal} label="Weitere Aktionen für Lernprofile" data-testid="learning-profile-menu" />
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        align="end"
                        sideOffset={6}
                        collisionPadding={12}
                        data-testid="learning-profile-menu-content"
                        className="core-overlay z-[90] grid w-max max-w-[calc(100vw-1.5rem)] gap-0.5 rounded-panel p-1.5 outline-none"
                        onCloseAutoFocus={(event) => {
                          if (!menuHandsFocusOn.current) return;
                          menuHandsFocusOn.current = false;
                          event.preventDefault();
                        }}
                      >
                        <Popover.Close asChild>
                          <button type="button" className="core-menu-row" onClick={handOn(() => setProfileEdit({ mode: "create", name: defaultProfileName }))}><Plus size={16} aria-hidden="true" />Als neues Profil speichern</button>
                        </Popover.Close>
                        {selectedCustomProfile ? (
                          <>
                            <Popover.Close asChild>
                              <button type="button" className="core-menu-row" onClick={handOn(() => setProfileEdit({ mode: "rename", name: selectedCustomProfile.name }))}><Pencil size={16} aria-hidden="true" />Umbenennen</button>
                            </Popover.Close>
                            <Popover.Close asChild>
                              <button type="button" className="core-menu-row" onClick={updateProfile}><Save size={16} aria-hidden="true" />Mit aktuellen Werten aktualisieren</button>
                            </Popover.Close>
                            <div aria-hidden="true" className="core-menu-separator" />
                            <Popover.Close asChild>
                              <button type="button" className="core-menu-row" data-tone="danger" onClick={handOn(() => setDeleteProfileId(selectedCustomProfile.id))}><Trash2 size={16} aria-hidden="true" />Löschen</button>
                            </Popover.Close>
                          </>
                        ) : null}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              )}
            </div>
          </div>

          <div className="core-settings-group">
            <h3 className="core-heading-3 text-core-text">Tagesrunde</h3>
            <div className="core-settings-list">
              <SettingsRow title="Neue Karten pro Tag" htmlFor="learning-settings-new-cards">
                <CoreNumberField id="learning-settings-new-cards" value={draft.newCardsPerDay} min={0} max={500} className="w-32" onChange={(value) => editLearning({ newCardsPerDay: value })} />
              </SettingsRow>
              <SettingsRow title="Wiederholungen pro Tag" htmlFor="learning-settings-max-reviews">
                <CoreNumberField id="learning-settings-max-reviews" value={draft.maximumReviewsPerDay} min={0} max={2000} className="w-32" onChange={(value) => editLearning({ maximumReviewsPerDay: value })} />
              </SettingsRow>
              <SelectRow title="Kartenreihenfolge" value={draft.newReviewOrder} options={reviewOrderOptions} testId="learning-settings-order" onChange={(value) => editLearning({ newReviewOrder: value })} />
              <PresetRow title="Neue Karten sortieren" value={draft.newCardSortOrder} options={newCardSortOptions} valueText={() => null} testId="learning-settings-new-sort" onChange={(value) => editLearning({ newCardSortOrder: value })} />
              <SelectRow title="Fällige Karten sortieren" value={draft.reviewCardSortOrder} options={reviewCardSortOptions} testId="learning-settings-review-sort" onChange={(value) => editLearning({ reviewCardSortOrder: value })} />
            </div>
          </div>

          <fieldset className="core-settings-group">
            <legend className="float-left w-full">
              <span className="core-settings-row-heading">
                <span className="core-heading-3 text-core-text">Geschwisterkarten</span>
                <InfoHint label="Geschwisterkarten">Geschwisterkarten stammen aus derselben Notiz, etwa Vorder- und Rückrichtung. War eine davon heute dran, warten die anderen bis zum nächsten Lerntag, damit sie sich nicht gegenseitig verraten. Lernstand und Fälligkeit ändern sich dadurch nicht.</InfoHint>
              </span>
            </legend>
            <div className="core-settings-list">
              {buryOptions.map((option) => (
                <label key={option.key} className="core-settings-row cursor-pointer" data-layout="inline">
                  <span className="core-settings-row-title">{option.label}</span>
                  <span className="core-settings-row-control">
                    <CoreSwitch checked={draft[option.key]} data-testid={option.testId} onCheckedChange={(checked) => editLearning({ [option.key]: checked })} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      ) : null}

      {section === "scheduler" ? (
        <section id={schedulerSectionId} className="core-settings-section" aria-labelledby={schedulerHeadingId}>
          <SectionTitle id={schedulerHeadingId} global={context === "global"}>Scheduler & CoRe</SectionTitle>
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
                info="So sicher willst du eine Karte bei ihrer Wiederholung noch wissen. Ein höherer Wert plant kürzere Abstände und damit mehr Wiederholungen pro Tag."
                note={draft.schedulerProfile.desiredRetention > 0.97 ? <p className="core-settings-row-hint flex items-center gap-1 text-core-text"><AlertTriangle className="shrink-0 text-core-warning" size={14} aria-hidden="true" />Über 97 % steigt die Last stark.</p> : null}
              >
                <CoreSlider id="learning-settings-retention" className="w-full md:w-72" min={70} max={99} value={retentionPercent} formatValue={(percent) => `${percent} %`} data-testid="learning-settings-retention" onValueChange={(percent) => editLearning({ schedulerProfile: { desiredRetention: percent / 100 } })} />
              </SettingsRow>
              <SettingsRow title="Maximales Intervall" htmlFor="learning-settings-maximum-interval">
                <CoreNumberField id="learning-settings-maximum-interval" value={draft.schedulerProfile.maximumIntervalDays} min={30} max={36500} unit="Tage" className="w-36" onChange={(value) => editLearning({ schedulerProfile: { maximumIntervalDays: value } })} />
              </SettingsRow>
            </div>
          </div>

          <div className="core-settings-group">
            <div className="core-settings-row-heading">
              <h3 className="core-heading-3 text-core-text">Content Repetition</h3>
              <InfoHint label="Content Repetition">Diese Werte gehören nicht zum Lernprofil. Wendest du ein Profil an, bleiben sie unverändert.</InfoHint>
            </div>
            <div className="core-settings-list">
              <PresetRow
                title="Varianten ab Haltbarkeit"
                info="Behältst du eine Karte voraussichtlich mindestens so viele Tage, fragt CoRe statt der Originalkarte eine ihrer Varianten ab. So prüfst du, ob du den Inhalt beherrschst und nicht nur die Formulierung wiedererkennst."
                value={String(draft.variantThresholdDays)}
                options={variantThresholdOptions}
                valueText={(isPreset) => `${isPreset ? "" : "Eigene · "}${draft.variantThresholdDays} Tage`}
                testId="learning-settings-variant-threshold"
                onChange={(value) => editCore({ variantThresholdDays: Number(value) })}
              />
              <PresetRow
                title="Aktive Varianten pro Karte"
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
