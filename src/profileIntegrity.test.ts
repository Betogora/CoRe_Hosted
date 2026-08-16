import assert from "node:assert/strict";
import test from "node:test";
import type { Profile } from "./coreTypes.ts";
import { planProfileBootstrapRepair, readCompleteProfile, requireCompleteProfile } from "./profileIntegrity.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";

const cloudProfile: Profile = {
  userId: "user-1",
  email: "cloud@example.com",
  displayName: "Cloud Name",
  timezone: "Europe/Berlin",
  onboardingComplete: true,
  schedulerPreferences: { settingsVersion: 2, dayStartHour: 0 },
  uiPreferences: {
    dashboardCollapsedDeckIds: [],
    learnCollapsedDeckIds: [],
    deckManagerExpandedDeckIds: [],
    syncIntervalMinutes: 5,
  },
};

function mutation(id: string, type: string, payload: unknown): SyncOutboxMutation {
  return {
    id,
    userId: "user-1",
    deviceId: null,
    type,
    table: type === "profile-patch" ? "profiles" : "cards",
    entityId: type === "profile-patch" ? "user-1" : "card-1",
    baseRevision: null,
    payload,
    createdAt: `2026-08-15T10:00:0${id.length}.000Z`,
    flushedAt: null,
    retryCount: 0,
  };
}

test("erkennt nur vollständige Profile für den erwarteten Account", () => {
  assert.deepEqual(readCompleteProfile(cloudProfile, "user-1"), cloudProfile);
  assert.deepEqual(readCompleteProfile({ ...cloudProfile, timezone: "" }, "user-1"), { ...cloudProfile, timezone: "" });
  assert.equal(readCompleteProfile({ uiPreferences: cloudProfile.uiPreferences }, "user-1"), null);
  assert.equal(readCompleteProfile({ ...cloudProfile, userId: "user-2" }, "user-1"), null);
  assert.equal(readCompleteProfile({ ...cloudProfile, timezone: undefined }, "user-1"), null);
  assert.equal(readCompleteProfile({ ...cloudProfile, timezone: 42 }, "user-1"), null);
  assert.equal(readCompleteProfile({
    ...cloudProfile,
    uiPreferences: { ...cloudProfile.uiPreferences, syncIntervalMinutes: "5" },
  }, "user-1"), null);
  assert.throws(
    () => requireCompleteProfile({ ...cloudProfile, schedulerPreferences: null }),
    (error: any) => error?.code === "invalid_profile_mutation",
  );
});

test("rettet UI-Präferenzen aus einem alten Teilpatch und lässt andere Mutationen unverändert", () => {
  const cardMutation = mutation("card", "entity-mutation", { table: "cards", entity: { id: "card-1", originalFront: "Unverändert" } });
  const invalidProfileMutation = mutation("profile-invalid", "profile-patch", {
    profile: {
      uiPreferences: {
        ...cloudProfile.uiPreferences,
        dashboardCollapsedDeckIds: ["deck-1"],
      },
    },
  });
  const pending = [cardMutation, invalidProfileMutation];
  const before = JSON.stringify(pending);

  const plan = planProfileBootstrapRepair(cloudProfile, pending, "user-1");

  assert.deepEqual(plan.invalidMutationIds, ["profile-invalid"]);
  assert.equal(plan.enqueueProfile, true);
  assert.deepEqual(plan.profileToApply, {
    ...cloudProfile,
    uiPreferences: { ...cloudProfile.uiPreferences, dashboardCollapsedDeckIds: ["deck-1"] },
  });
  assert.equal(JSON.stringify(pending), before);
});

test("ein vollständiger Offline-Profilpatch gewinnt weiterhin gegen das Cloud-Profil", () => {
  const localProfile = { ...cloudProfile, displayName: "Lokal geändert" };
  const invalidOlderPatch = mutation("profile-invalid", "profile-patch", { profile: { uiPreferences: cloudProfile.uiPreferences } });
  const validPatch = mutation("profile-valid", "profile-patch", { profile: localProfile });

  const plan = planProfileBootstrapRepair(cloudProfile, [invalidOlderPatch, validPatch], "user-1");

  assert.deepEqual(plan.invalidMutationIds, ["profile-invalid"]);
  assert.deepEqual(plan.profileToApply, localProfile);
  assert.equal(plan.enqueueProfile, false);
});

test("identische gerettete UI-Präferenzen erzeugen keinen neuen Profilpatch", () => {
  const invalidPatch = mutation("profile-invalid", "profile-patch", { profile: { uiPreferences: cloudProfile.uiPreferences } });
  const plan = planProfileBootstrapRepair(cloudProfile, [invalidPatch], "user-1");

  assert.deepEqual(plan.invalidMutationIds, ["profile-invalid"]);
  assert.deepEqual(plan.profileToApply, cloudProfile);
  assert.equal(plan.enqueueProfile, false);
});
