import assert from "node:assert/strict";
import test from "node:test";
import type { Profile } from "./coreTypes.ts";
import { profileForBootstrap, readCompleteProfile, requireCompleteProfile } from "./profileIntegrity.ts";
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

test("der letzte vollständige Offline-Profilpatch gewinnt gegen das Cloud-Profil", () => {
  const localProfile = { ...cloudProfile, displayName: "Lokal geändert" };
  const cardMutation = mutation("card", "entity-mutation", { table: "cards", entity: { id: "card-1" } });
  const validPatch = mutation("profile-valid", "profile-patch", { profile: localProfile });

  const profile = profileForBootstrap(cloudProfile, [cardMutation, validPatch], "user-1");

  assert.deepEqual(profile, localProfile);
});
