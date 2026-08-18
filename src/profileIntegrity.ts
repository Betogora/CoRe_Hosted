import type { Profile, UiPreferences } from "./coreTypes.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import { normalizeUiPreferences } from "./uiPreferences.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function readUiPreferences(value: unknown): UiPreferences | null {
  if (!isRecord(value)
    || !isStringArray(value.dashboardCollapsedDeckIds)
    || !isStringArray(value.learnCollapsedDeckIds)
    || !isStringArray(value.deckManagerExpandedDeckIds)
    || typeof value.syncIntervalMinutes !== "number") return null;
  const preferences = normalizeUiPreferences(value);
  return preferences.syncIntervalMinutes === value.syncIntervalMinutes ? preferences : null;
}

export function readCompleteProfile(value: unknown, expectedUserId?: string): Profile | null {
  if (!isRecord(value)
    || typeof value.userId !== "string"
    || !value.userId.trim()
    || (expectedUserId !== undefined && value.userId !== expectedUserId)
    || typeof value.email !== "string"
    || typeof value.displayName !== "string"
    || typeof value.timezone !== "string"
    || typeof value.onboardingComplete !== "boolean"
    || !isRecord(value.schedulerPreferences)) return null;
  const uiPreferences = readUiPreferences(value.uiPreferences);
  if (!uiPreferences) return null;
  return { ...value, uiPreferences } as unknown as Profile;
}

export function requireCompleteProfile(value: unknown, expectedUserId?: string): Profile {
  const profile = readCompleteProfile(value, expectedUserId);
  if (profile) return profile;
  const error = new Error("Profiländerungen müssen ein vollständiges Profil enthalten.") as Error & { code: string };
  error.code = "invalid_profile_mutation";
  throw error;
}

function profileFromMutation(mutation: SyncOutboxMutation, expectedUserId: string): Profile | null {
  if (!isRecord(mutation.payload)) return null;
  return readCompleteProfile(mutation.payload.profile, expectedUserId);
}

export function profileForBootstrap(
  cloudProfileValue: unknown,
  pendingMutations: SyncOutboxMutation[],
  expectedUserId: string,
): Profile {
  let profile = requireCompleteProfile(cloudProfileValue, expectedUserId);
  for (const mutation of pendingMutations) {
    if (mutation.type !== "profile-patch") continue;
    profile = profileFromMutation(mutation, expectedUserId) ?? profile;
  }
  return profile;
}
