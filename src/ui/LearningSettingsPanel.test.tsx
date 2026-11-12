import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createDeckLearningSettingsDraft, type DeckLearningSettingsDraft } from "../settingsDraft.ts";
import { LearningSettingsPanel } from "./LearningSettingsPanel.tsx";

function renderPanel(draft: DeckLearningSettingsDraft) {
  return (["daily", "scheduler"] as const).map((section) => renderToStaticMarkup(
    <LearningSettingsPanel section={section} draft={draft} profiles={[]} defaultProfileName="Biologie" onProfilesChange={() => undefined} onDraftChange={() => undefined} onApplyProfile={() => true} />,
  )).join("");
}

test("each call renders exactly the requested section", () => {
  const draft = createDeckLearningSettingsDraft({});
  const daily = renderToStaticMarkup(<LearningSettingsPanel section="daily" draft={draft} profiles={[]} defaultProfileName="Biologie" onProfilesChange={() => undefined} onDraftChange={() => undefined} onApplyProfile={() => true} />);
  assert.match(daily, /id="deck-daily-profiles"/);
  assert.doesNotMatch(daily, /id="deck-scheduler-core"/);
});

function segmentGroup(html: string, label: string) {
  const start = html.indexOf(`aria-label="${label}"`);
  return html.slice(start, html.indexOf("</div>", start));
}

test("learning settings render as rows without boxed panels", () => {
  const html = renderPanel(createDeckLearningSettingsDraft({}));

  assert.ok((html.match(/class="core-settings-row"/g)?.length ?? 0) >= 12);
  assert.doesNotMatch(html, /core-surface-raised|rounded-panel|bg-core-subtle p-4/);
  for (const testId of ["learning-settings-bury-new", "learning-settings-bury-review", "learning-settings-bury-interday"]) assert.match(html, new RegExp(`type="checkbox" role="switch" data-testid="${testId}"`));
});

test("preset choices mark the stored preset and show its value", () => {
  const html = renderPanel(createDeckLearningSettingsDraft({ variantThresholdDays: 21, maxActiveVariantsPerCard: 2 }));

  assert.match(segmentGroup(html, "Varianten einsetzen ab Haltbarkeit"), /aria-pressed="true"[^>]*>Standard</);
  assert.match(html, /data-testid="learning-settings-variant-threshold"[\s\S]*?>21 Tage</);
  assert.match(segmentGroup(html, "Aktive Varianten pro Karte"), /aria-pressed="true"[^>]*>2</);
  assert.match(segmentGroup(html, "Lernschritte"), /aria-pressed="true"[^>]*>Standard</);
  assert.match(html, />1 → 10 Min\.</);
});

test("stored values outside the presets stay visible as own values", () => {
  const html = renderPanel(createDeckLearningSettingsDraft({ variantThresholdDays: 14, maxActiveVariantsPerCard: 5, schedulerProfile: { learningStepsMinutes: [2, 20] } }));

  for (const label of ["Varianten einsetzen ab Haltbarkeit", "Aktive Varianten pro Karte", "Lernschritte"]) assert.doesNotMatch(segmentGroup(html, label), /aria-pressed="true"/);
  assert.match(html, />Eigene · 14 Tage</);
  assert.match(html, />Eigene · 5</);
  assert.match(html, />Eigene · 2 → 20 Min\.</);
});

test("a high retention target warns in the row text instead of an alert", () => {
  const draft = createDeckLearningSettingsDraft({});
  const html = renderPanel({ ...draft, schedulerProfile: { ...draft.schedulerProfile, desiredRetention: 0.98 } });

  assert.match(html, /aria-valuetext="98 %"/);
  assert.match(html, /Über 97 % steigt die tägliche Belastung meist sehr stark\./);
  assert.doesNotMatch(html, /role="alert"/);
});
