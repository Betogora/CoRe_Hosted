import type { Profile, UiPreferences } from "./coreTypes.ts";
import { withGlobalSchedulerPreferences, type GlobalSchedulerPreferencesInput } from "./learningProfiles.ts";
import type { SyncOutboxMutation } from "./syncEngine.ts";
import { mergeStudyDays, normalizeUiPreferences } from "./uiPreferences.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function readUiPreferences(value: unknown): UiPreferences | null {
  if (!isRecord(value)
    || !isStringArray(value.learnCollapsedDeckIds)
    || typeof value.syncIntervalMinutes !== "number"
    || !isStringArray(value.flagNames)
    || value.flagNames.length !== 7) return null;
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

/** Changed profile fields and, within both preference objects, changed top-level keys only. */
export interface ProfilePatch {
  displayName?: string;
  timezone?: string;
  onboardingComplete?: boolean;
  schedulerPreferences?: Record<string, unknown>;
  uiPreferences?: Partial<UiPreferences>;
}

const PATCH_FIELDS = ["displayName", "timezone", "onboardingComplete"] as const;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function changedKeys<T extends object>(base: T, next: T): Partial<T> | undefined {
  const changed = Object.fromEntries(Object.entries(next).filter(([key, value]) => !same((base as Record<string, unknown>)[key], value)));
  return Object.keys(changed).length ? changed as Partial<T> : undefined;
}

/** Null when nothing changed. */
export function profilePatchBetween(base: Profile, next: Profile): ProfilePatch | null {
  const patch: ProfilePatch = {};
  for (const field of PATCH_FIELDS) if (!same(base[field], next[field])) Object.assign(patch, { [field]: next[field] });
  const schedulerPreferences = changedKeys(base.schedulerPreferences, next.schedulerPreferences);
  const uiPreferences = changedKeys(base.uiPreferences, next.uiPreferences);
  if (schedulerPreferences) patch.schedulerPreferences = schedulerPreferences;
  if (uiPreferences) patch.uiPreferences = uiPreferences;
  return Object.keys(patch).length ? patch : null;
}

function mergeUiPreferences(base: Partial<UiPreferences> | undefined, patch: Partial<UiPreferences> | undefined) {
  if (!patch) return base;
  const merged = { ...base, ...patch };
  if (patch.dashboardStudyDays) merged.dashboardStudyDays = mergeStudyDays(base?.dashboardStudyDays, patch.dashboardStudyDays);
  return merged;
}

/** A later patch wins per key; study days are united. */
export function mergeProfilePatches(earlier: ProfilePatch | null, later: ProfilePatch): ProfilePatch {
  if (!earlier) return later;
  const merged: ProfilePatch = { ...earlier, ...later };
  if (earlier.schedulerPreferences || later.schedulerPreferences) merged.schedulerPreferences = { ...earlier.schedulerPreferences, ...later.schedulerPreferences };
  const uiPreferences = mergeUiPreferences(earlier.uiPreferences, later.uiPreferences);
  if (uiPreferences) merged.uiPreferences = uiPreferences;
  return merged;
}

export function applyProfilePatch(profile: Profile, patch: ProfilePatch): Profile {
  return {
    ...profile,
    ...Object.fromEntries(PATCH_FIELDS.filter((field) => field in patch).map((field) => [field, patch[field]])),
    schedulerPreferences: { ...profile.schedulerPreferences, ...patch.schedulerPreferences },
    uiPreferences: normalizeUiPreferences(mergeUiPreferences(profile.uiPreferences, patch.uiPreferences)),
  };
}

/** Outbox entries written before field patches carry only the whole profile; they apply as a patch of every field. */
export function readProfilePatch(mutation: SyncOutboxMutation): ProfilePatch | null {
  if (!isRecord(mutation.payload)) return null;
  if (isRecord(mutation.payload.patch)) return mutation.payload.patch as ProfilePatch;
  const profile = readCompleteProfile(mutation.payload.profile);
  return profile && {
    displayName: profile.displayName,
    timezone: profile.timezone,
    onboardingComplete: profile.onboardingComplete,
    schedulerPreferences: profile.schedulerPreferences,
    uiPreferences: profile.uiPreferences,
  };
}

export function profileForBootstrap(
  cloudProfileValue: unknown,
  pendingMutations: SyncOutboxMutation[],
  expectedUserId: string,
): Profile {
  let profile = requireCompleteProfile(cloudProfileValue, expectedUserId);
  for (const mutation of pendingMutations) {
    if (mutation.type !== "profile-patch") continue;
    const patch = readProfilePatch(mutation);
    if (patch) profile = applyProfilePatch(profile, patch);
  }
  return profile;
}

export interface ProfileChange {
  displayName?: string;
  uiPreferences?: Partial<UiPreferences>;
  schedulerPreferences?: GlobalSchedulerPreferencesInput;
}

/**
 * The profile after the change and the patch to queue, merged into the pending profile patch; the patch holds only
 * the keys that changed and is null when nothing did.
 */
export function changeProfile(base: Profile, change: ProfileChange | ((profile: Profile) => ProfileChange | null), pending: readonly SyncOutboxMutation[], userId: string) {
  const requested = typeof change === "function" ? change(base) : change;
  if (!requested) return { profile: base, patch: null };
  const profile = requireCompleteProfile(withGlobalSchedulerPreferences({
    ...base,
    ...(requested.displayName === undefined ? {} : { displayName: requested.displayName }),
    uiPreferences: normalizeUiPreferences({ ...base.uiPreferences, ...requested.uiPreferences }),
  }, requested.schedulerPreferences ?? {}), userId);
  const patch = profilePatchBetween(base, profile);
  if (!patch) return { profile: base, patch: null };
  const queued = pending.find((mutation) => mutation.type === "profile-patch");
  return { profile, patch: mergeProfilePatches(queued ? readProfilePatch(queued) : null, patch) };
}
