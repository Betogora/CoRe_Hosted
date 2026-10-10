import { normalizeCoreDeck } from "./coreModel.ts";
import type { WorkspaceState } from "./coreWorkspace.ts";
import { withGlobalSchedulerPreferences } from "./deckSettings.ts";
import { DEFAULT_UI_PREFERENCES, normalizeUiPreferences } from "./uiPreferences.ts";

function createDefaultProfile() {
  return {
    userId: "local-user",
    email: "",
    displayName: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    onboardingComplete: false,
    schedulerPreferences: { ...withGlobalSchedulerPreferences({}).schedulerPreferences },
    uiPreferences: DEFAULT_UI_PREFERENCES,
  };
}

function createDefaultState(): WorkspaceState {
  return {
    version: 6,
    profile: createDefaultProfile(),
    decks: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWorkspaceState(rawState: any): WorkspaceState {
  const fallback = createDefaultState();
  const profile = rawState?.profile ?? {};
  return {
    version: 6,
    profile: withGlobalSchedulerPreferences({
      ...fallback.profile,
      userId: profile.userId ?? fallback.profile.userId,
      email: profile.email ?? fallback.profile.email,
      displayName: profile.displayName ?? fallback.profile.displayName,
      timezone: profile.timezone ?? fallback.profile.timezone,
      onboardingComplete: profile.onboardingComplete ?? fallback.profile.onboardingComplete,
      schedulerPreferences: profile.schedulerPreferences,
      uiPreferences: normalizeUiPreferences(profile.uiPreferences),
      ...(profile.account && typeof profile.account === "object" ? { account: profile.account } : {}),
    }),
    decks: Array.isArray(rawState?.decks) ? rawState.decks.map(normalizeCoreDeck) : [],
    notes: Array.isArray(rawState?.notes) ? rawState.notes : [],
    updatedAt: typeof rawState?.updatedAt === "string" ? rawState.updatedAt : fallback.updatedAt,
  };
}

/** An empty account workspace; tests that need content add the world capitals seed themselves. */
export function createCoreRepository(): { getState(): WorkspaceState } {
  return { getState: () => createDefaultState() };
}
