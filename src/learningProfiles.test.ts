import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLearningProfileTemplateToDeckSettings,
  BUILT_IN_LEARNING_PROFILE_TEMPLATES,
  createLearningProfileTemplate,
  deleteLearningProfileTemplate,
  getLearningProfileTemplate,
  renameLearningProfileTemplate,
  updateLearningProfileTemplate,
} from "./learningProfiles.ts";

test("built-in learning profiles have stable identities, versions and canonical settings", () => {
  assert.deepEqual(
    BUILT_IN_LEARNING_PROFILE_TEMPLATES.map((profile) => [profile.id, profile.name, profile.contentVersion, profile.settings.newCardsPerDay]),
    [
      ["builtin:standard", "Standard", 1, 20],
      ["builtin:intensive", "Intensiv", 1, 30],
      ["builtin:relaxed", "Entspannt", 1, 10],
    ],
  );
});

test("custom profile CRUD keeps ids stable, names unique and versions content-based", () => {
  const created = createLearningProfileTemplate([], {
    id: "profile-1",
    defaultName: "Biologie",
    settings: { newCardsPerDay: 42 },
  });
  const second = createLearningProfileTemplate(created.profiles, {
    id: "profile-2",
    name: "biologie",
    settings: { newCardsPerDay: 12 },
  });
  const renamed = renameLearningProfileTemplate(second.profiles, "profile-1", "Intensiv");
  const unchanged = updateLearningProfileTemplate(renamed, "profile-1", created.template.settings);
  const changed = updateLearningProfileTemplate(unchanged, "profile-1", { newCardsPerDay: 55 });

  assert.equal(created.template.name, "Biologie");
  assert.equal(second.template.name, "biologie (2)");
  assert.equal(renamed[0].name, "Intensiv (2)");
  assert.equal(unchanged[0].contentVersion, 1);
  assert.equal(changed[0].id, "profile-1");
  assert.equal(changed[0].contentVersion, 2);
  assert.equal(changed[0].settings.newCardsPerDay, 55);
  assert.equal(getLearningProfileTemplate(changed, "profile-1")?.name, "Intensiv (2)");
  assert.deepEqual(deleteLearningProfileTemplate(changed, "profile-2").map((profile) => profile.id), ["profile-1"]);
});

test("copy-on-apply changes exactly one settings object and records source provenance", () => {
  const template = createLearningProfileTemplate([], {
    id: "profile-exam",
    name: "Prüfung",
    settings: { newCardsPerDay: 60, maximumReviewsPerDay: 400 },
  }).template;
  const first = {
    coreMode: "manual",
    newCardsPerDay: 20,
    newCardsTodayOverride: { date: "2026-08-11", limit: 5 },
  };
  const second = { newCardsPerDay: 10 };
  const applied = applyLearningProfileTemplateToDeckSettings(first, template);

  assert.equal(applied.newCardsPerDay, 60);
  assert.equal(applied.maximumReviewsPerDay, 400);
  assert.equal(applied.coreMode, "manual");
  assert.equal(applied.newCardsTodayOverride, null);
  assert.deepEqual(applied.learningProfileSource, { id: "profile-exam", contentVersion: 1 });
  assert.deepEqual(second, { newCardsPerDay: 10 });
});
