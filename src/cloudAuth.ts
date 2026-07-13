import * as v from "valibot";
import type { Tables, TablesInsert } from "./database.types.ts";

const SESSION_MISSING_CODES = new Set(["AuthSessionMissingError", "session_not_found"]);

type ProfileRow = Tables<"profiles">;
type ProfileInsert = TablesInsert<"profiles">;
const profileRowSchema = v.looseObject({
  id: v.string(),
  email: v.optional(v.string()),
  display_name: v.optional(v.string()),
  university: v.optional(v.nullable(v.string())),
  field_of_study: v.optional(v.nullable(v.string())),
  preferred_language: v.optional(v.string()),
  timezone: v.optional(v.string()),
  onboarding_complete: v.optional(v.boolean()),
  privacy: v.optional(v.record(v.string(), v.unknown())),
  scheduler_preferences: v.optional(v.record(v.string(), v.unknown())),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
});

function validateProfileRow(input: unknown): ProfileRow {
  const result = v.safeParse(profileRowSchema, input);
  if (!result.success) throw new Error("Cloud-Profildaten hatten ein ungültiges Format.");
  return result.output as ProfileRow;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: any) {
  return String(email ?? "").trim().toLowerCase();
}

function mergePrivacy(profile: any) {
  return {
    shareLearningProgress: false,
    showOnlineStatus: false,
    showStreaksToOthers: false,
    ...(profile?.privacy ?? {}),
  };
}

function accountFromUser(user: any, status: any = "signed-in", timestamp: any = nowIso()) {
  return {
    status,
    authProvider: "supabase",
    userId: user?.id ?? null,
    createdAt: user?.created_at ?? timestamp,
    lastSignedInAt: timestamp,
  };
}

function isSessionMissing(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    SESSION_MISSING_CODES.has(error?.name) ||
    SESSION_MISSING_CODES.has(error?.code) ||
    message.includes("auth session missing") ||
    message.includes("session not found")
  );
}

export function formatCloudAuthError(error: any, fallback: any = "Aktion konnte nicht abgeschlossen werden.") {
  const code = String(error?.code ?? error?.status ?? error?.name ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  const causeCode = String(error?.cause?.code ?? error?.cause?.status ?? error?.cause?.name ?? "").toLowerCase();
  const causeMessage = String(error?.cause?.message ?? "").toLowerCase();
  const combined = `${code} ${message} ${causeCode} ${causeMessage}`;

  if (combined.includes("cloud_revision_conflict")) {
    return "Auf einem anderen Gerät liegt bereits eine neuere Version vor. Bitte lade die Cloud-Daten neu.";
  }

  if (
    combined.includes("session_expired") ||
    combined.includes("session expired") ||
    combined.includes("refresh_token_not_found") ||
    combined.includes("invalid refresh token")
  ) {
    return "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.";
  }
  if (isSessionMissing(error) || isSessionMissing(error?.cause)) {
    return "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.";
  }
  if (
    combined.includes("failed to fetch") ||
    combined.includes("fetch failed") ||
    combined.includes("networkerror") ||
    combined.includes("network request failed") ||
    combined.includes("err_network")
  ) {
    return "Supabase ist momentan nicht erreichbar. Prüfe deine Internetverbindung und versuche es erneut.";
  }
  if (combined.includes("sync_device_registration_failed")) {
    return "Dieses Gerät konnte nicht für die Synchronisierung registriert werden.";
  }
  if (message.includes("invalid login credentials")) return "E-Mail oder Passwort stimmt nicht.";
  if (combined.includes("email rate limit") || (combined.includes("rate limit") && combined.includes("email"))) {
    return "Supabase hat gerade zu viele Auth-E-Mails versendet. Bitte warte kurz oder richte einen eigenen SMTP-Versand ein.";
  }
  if (combined.includes("email not confirmed") || combined.includes("not confirmed")) {
    return "Bitte bestätige zuerst die E-Mail-Adresse. Prüfe auch Spam und Werbung.";
  }
  if (combined.includes("user already registered") || combined.includes("already registered") || combined.includes("already exists")) {
    return "Dieser Account existiert wahrscheinlich schon. Melde dich an oder nutze „Passwort vergessen“.";
  }
  if ((combined.includes("signup") || combined.includes("signups")) && (combined.includes("disabled") || combined.includes("not allowed"))) {
    return "E-Mail-Registrierung ist in Supabase aktuell deaktiviert.";
  }
  if (combined.includes("unable to validate email") || combined.includes("invalid email") || combined.includes("email address is invalid")) {
    return "Die E-Mail-Adresse wirkt ungültig. Bitte prüfe Schreibweise und Sonderzeichen.";
  }
  if (message.includes("password")) return "Bitte nutze ein gültiges Passwort mit mindestens 8 Zeichen.";
  if (message.includes("email")) return `Supabase meldet ein E-Mail-Problem: ${error.message}`;
  return error?.message || fallback;
}

export function createCloudAuthRedirectUrl(origin: any) {
  try {
    return new URL("/", origin).toString();
  } catch {
    return undefined;
  }
}

function getDefaultAuthRedirectTo() {
  if (typeof window === "undefined" || !window.location?.origin) return undefined;
  return createCloudAuthRedirectUrl(window.location.origin);
}

export function createProfileRow(profile: any, user: any, timestamp: any = nowIso()): ProfileInsert {
  const email = normalizeEmail(user?.email ?? profile?.email);

  return {
    id: user.id,
    email,
    display_name: String(profile?.displayName ?? "").trim() || email.split("@")[0] || "",
    university: profile?.university ?? "",
    field_of_study: profile?.fieldOfStudy ?? "",
    preferred_language: profile?.preferredLanguage ?? "de",
    timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Berlin",
    onboarding_complete: Boolean(profile?.onboardingComplete ?? true),
    privacy: mergePrivacy(profile),
    scheduler_preferences: profile?.schedulerPreferences ?? { profile: "standard" },
    updated_at: timestamp,
  };
}

export function createCloudProfile(row: any, user: any, fallback: any = {}, timestamp: any = nowIso()) {
  const validatedRow = row == null ? null : validateProfileRow(row);
  const email = normalizeEmail(validatedRow?.email ?? user?.email ?? fallback?.email);

  return {
    ...fallback,
    userId: user?.id ?? validatedRow?.id ?? fallback?.userId ?? "local-user",
    email,
    displayName: validatedRow?.display_name ?? fallback?.displayName ?? email.split("@")[0] ?? "",
    university: validatedRow?.university ?? fallback?.university ?? "",
    fieldOfStudy: validatedRow?.field_of_study ?? fallback?.fieldOfStudy ?? "",
    preferredLanguage: validatedRow?.preferred_language ?? fallback?.preferredLanguage ?? "de",
    timezone: validatedRow?.timezone ?? fallback?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Berlin",
    onboardingComplete: validatedRow?.onboarding_complete ?? fallback?.onboardingComplete ?? true,
    privacy: { ...mergePrivacy(fallback), ...((validatedRow?.privacy as Record<string, unknown> | undefined) ?? {}) },
    schedulerPreferences: validatedRow?.scheduler_preferences ?? fallback?.schedulerPreferences ?? { profile: "standard" },
    account: accountFromUser(user ?? { id: validatedRow?.id, email, created_at: validatedRow?.created_at }, "signed-in", timestamp),
  };
}

export function createPendingCloudProfile(profile: any, user: any, timestamp: any = nowIso()) {
  const email = normalizeEmail(user?.email ?? profile?.email);

  return {
    ...profile,
    userId: user?.id ?? profile?.userId ?? "local-user",
    email,
    displayName: profile?.displayName || email.split("@")[0] || "",
    account: accountFromUser(user, "pending-email-confirmation", timestamp),
  };
}

export function markCloudSignedOut(profile: any, timestamp: any = nowIso()) {
  return {
    ...profile,
    account: {
      ...(profile?.account ?? {}),
      status: "signed-out",
      authProvider: profile?.account?.authProvider ?? "supabase",
      signedOutAt: timestamp,
    },
  };
}

async function assertCloudClient(client: any) {
  if (!client?.auth || !client?.from) {
    throw new Error("Supabase ist noch nicht konfiguriert.");
  }
}

async function getCurrentUser(client: any) {
  await assertCloudClient(client);
  const { data, error } = await client.auth.getUser();
  if (error && !isSessionMissing(error)) throw error;
  return data?.user ?? null;
}

export async function getCloudUser(client: any) {
  return getCurrentUser(client);
}

export async function saveCloudProfile(client: any, profile: any, timestamp: any = nowIso()) {
  const user = await getCurrentUser(client);
  if (!user) throw new Error("Bitte melde dich zuerst an.");

  const row = createProfileRow(profile, user, timestamp);
  const { data, error } = await client.from("profiles").upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw error;

  return createCloudProfile(data, user, profile, timestamp);
}

export async function signUpCloudAccount(client: any, profile: any, password: any, timestamp: any = nowIso(), redirectTo: any = getDefaultAuthRedirectTo()) {
  await assertCloudClient(client);
  const email = normalizeEmail(profile?.email);
  if (!email || !email.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");
  if (String(password ?? "").length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
      data: {
        display_name: profile?.displayName ?? "",
      },
    },
  });
  if (error) throw error;
  if (!data?.session) return createPendingCloudProfile(profile, data?.user, timestamp);

  return saveCloudProfile(client, createCloudProfile(null, data.user, profile, timestamp), timestamp);
}

export async function signInCloudAccount(client: any, profile: any, password: any, timestamp: any = nowIso()) {
  await assertCloudClient(client);
  const email = normalizeEmail(profile?.email);
  if (!email || !email.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;

  return saveCloudProfile(client, createCloudProfile(null, data.user, profile, timestamp), timestamp);
}

export async function signInWithMagicLink(client: any, email: any, redirectTo: any = getDefaultAuthRedirectTo()) {
  await assertCloudClient(client);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");

  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
      shouldCreateUser: false,
    },
  });
  if (error) throw error;

  return { email: normalizedEmail };
}

export async function signInWithGoogle(client: any, redirectTo: any = getDefaultAuthRedirectTo()) {
  await assertCloudClient(client);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) throw error;

  return data;
}

export async function signOutCloudAccount(client: any, profile: any, timestamp: any = nowIso()) {
  await assertCloudClient(client);
  const { error } = await client.auth.signOut();
  if (error) throw error;

  return markCloudSignedOut(profile, timestamp);
}

export async function resetCloudPassword(client: any, email: any, redirectTo: any = getDefaultAuthRedirectTo()) {
  await assertCloudClient(client);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");

  const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
  return { email: normalizedEmail };
}

export async function updateCloudPassword(client: any, password: any) {
  await assertCloudClient(client);
  if (String(password ?? "").length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");

  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;

  return data?.user ?? null;
}
