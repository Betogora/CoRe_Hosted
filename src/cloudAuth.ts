import * as v from "valibot";
import type { Tables } from "./database.types.ts";
import { withGlobalSchedulerPreferences } from "./deckSettings.ts";
import { normalizeUiPreferences } from "./uiPreferences.ts";

const SESSION_MISSING_CODES = new Set(["AuthSessionMissingError", "session_not_found"]);

type CloudAuthRedirectOutcome =
  | { kind: "none" }
  | { kind: "recovery" }
  | { kind: "error"; code: string; message: string };

interface CloudAuthLocation {
  href?: string;
  hash?: string;
  search?: string;
}

interface CloudAuthHistory {
  state?: unknown;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

type ProfileRow = Tables<"profiles">;

/** A Supabase user as far as this module reads it; callers get back their own user type. */
interface CloudAuthUser {
  id: string;
  email?: string | null;
  created_at?: string;
}

/** Profile fields the auth calls read; other fields of the caller's profile are ignored. */
interface ProfileFields {
  userId?: string;
  email?: string | null;
  displayName?: string;
  timezone?: string;
  onboardingComplete?: boolean;
  schedulerPreferences?: unknown;
  uiPreferences?: unknown;
  account?: { authProvider?: string; [field: string]: unknown };
}

interface AuthAnswer<Data> {
  data: Data | null;
  error: unknown;
}

/** The Supabase client as far as these calls use it; `from` stays `unknown` as in `CloudClient` (cloudRepository.ts). */
interface UserClient<User extends CloudAuthUser> {
  auth: {
    getUser(): PromiseLike<AuthAnswer<{ user: User | null }>>;
    getSession?(): PromiseLike<AuthAnswer<{ session: { user: User } | null }>>;
  };
  from(table: string): unknown;
}

interface AuthClient<Auth> {
  auth: Auth;
  from(table: string): unknown;
}

type RedirectOptions = { emailRedirectTo?: string };

/** The `profiles` calls of the query builder; the answer stays `unknown` until `validateProfileRow`. */
interface ProfilesTable {
  upsert(row: object, options: { onConflict: string; ignoreDuplicates?: boolean }): PromiseLike<{ error: unknown }> & {
    select(columns: string): { single(): PromiseLike<{ data: unknown; error: unknown }> };
  };
}
const profileRowSchema = v.looseObject({
  id: v.string(),
  email: v.optional(v.string()),
  display_name: v.optional(v.string()),
  timezone: v.optional(v.string()),
  onboarding_complete: v.optional(v.boolean()),
  scheduler_preferences: v.optional(v.record(v.string(), v.unknown())),
  ui_preferences: v.optional(v.record(v.string(), v.unknown())),
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

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function accountFromUser(user: Partial<CloudAuthUser> | null | undefined, status = "signed-in", timestamp = nowIso()) {
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

export function formatCloudAuthError(error: any, fallback = "Aktion konnte nicht abgeschlossen werden."): string {
  const code = String(error?.code ?? error?.status ?? error?.name ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  const causeCode = String(error?.cause?.code ?? error?.cause?.status ?? error?.cause?.name ?? "").toLowerCase();
  const causeMessage = String(error?.cause?.message ?? "").toLowerCase();
  const combined = `${code} ${message} ${causeCode} ${causeMessage}`;

  if (combined.includes("cloud_revision_conflict")) {
    return "Auf einem anderen Gerät liegt bereits eine neuere Version vor. Bitte lade die Cloud-Daten neu.";
  }

  if (
    combined.includes("otp_expired") ||
    combined.includes("flow_state_expired") ||
    combined.includes("flow_state_not_found") ||
    combined.includes("invite_not_found") ||
    combined.includes("email link is invalid") ||
    combined.includes("link is invalid") ||
    combined.includes("link has expired")
  ) {
    return "Dieser Anmelde- oder Wiederherstellungslink ist abgelaufen oder wurde bereits verwendet. Fordere bitte einen neuen Link an.";
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
    combined.includes("authretryablefetcherror") ||
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
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "E-Mail oder Passwort stimmt nicht.";
  if (combined.includes("over_email_send_rate_limit") || combined.includes("email rate limit") || (combined.includes("rate limit") && combined.includes("email"))) {
    return "Es wurde gerade bereits eine Auth-E-Mail angefordert. Bitte warte kurz und versuche es danach erneut.";
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
  if (combined.includes("reauthentication_needed")) {
    return "Bitte bestätige deine Identität erneut, bevor du das Passwort änderst.";
  }
  if (combined.includes("reauthentication_not_valid")) {
    return "Der Bestätigungscode ist ungültig oder abgelaufen. Fordere bitte einen neuen Code an.";
  }
  if (combined.includes("weak_password") || combined.includes("authweakpassworderror")) {
    if (combined.includes("pwned") || combined.includes("leak") || combined.includes("compromised")) {
      return "Dieses Passwort ist aus einem Datenleck bekannt. Bitte wähle ein anderes Passwort.";
    }
    return "Das Passwort erfüllt die Sicherheitsanforderungen nicht. Nutze mindestens 8 Zeichen.";
  }
  if (message.includes("password")) return "Bitte nutze ein gültiges Passwort mit mindestens 8 Zeichen.";
  if (message.includes("email")) return `Supabase meldet ein E-Mail-Problem: ${error.message}`;
  return error?.message || fallback;
}

export function createCloudAuthRedirectUrl(origin: string) {
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

export function createProfileRow<Fields extends ProfileFields>(profile: Fields | null | undefined, user: CloudAuthUser, timestamp = nowIso()) {
  const email = normalizeEmail(user?.email ?? profile?.email);

  return {
    id: user.id,
    email,
    display_name: String(profile?.displayName ?? "").trim() || email.split("@")[0] || "",
    timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Berlin",
    onboarding_complete: Boolean(profile?.onboardingComplete ?? true),
    scheduler_preferences: withGlobalSchedulerPreferences(profile ?? {}).schedulerPreferences,
    ui_preferences: { ...normalizeUiPreferences(profile?.uiPreferences) },
    updated_at: timestamp,
  };
}

export function createCloudProfile<Fields extends ProfileFields>(row: unknown, user: CloudAuthUser | null | undefined, fallback: Fields | ProfileFields = {}, timestamp = nowIso()) {
  const validatedRow = row == null ? null : validateProfileRow(row);
  const email = normalizeEmail(validatedRow?.email ?? user?.email ?? fallback?.email);

  return withGlobalSchedulerPreferences({
    userId: user?.id ?? validatedRow?.id ?? fallback?.userId ?? "local-user",
    email,
    displayName: validatedRow?.display_name ?? fallback?.displayName ?? email.split("@")[0] ?? "",
    timezone: validatedRow?.timezone ?? fallback?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Berlin",
    onboardingComplete: validatedRow?.onboarding_complete ?? fallback?.onboardingComplete ?? true,
    schedulerPreferences: validatedRow?.scheduler_preferences ?? fallback?.schedulerPreferences,
    uiPreferences: normalizeUiPreferences(validatedRow?.ui_preferences ?? fallback?.uiPreferences),
    account: accountFromUser(user ?? { id: validatedRow?.id, email, created_at: validatedRow?.created_at }, "signed-in", timestamp),
  });
}

function isConnectivityFailure(error: any) {
  const combined = `${String(error?.code ?? "")} ${String(error?.message ?? "")} ${String(error?.cause?.message ?? "")}`.toLowerCase();
  return combined.includes("failed to fetch")
    || combined.includes("fetch failed")
    || combined.includes("networkerror")
    || combined.includes("network request failed")
    || combined.includes("offline");
}

export function createPendingCloudProfile<Fields extends ProfileFields>(profile: Fields | null | undefined, user: CloudAuthUser | null | undefined, timestamp = nowIso()) {
  const email = normalizeEmail(user?.email ?? profile?.email);

  return withGlobalSchedulerPreferences({
    userId: user?.id ?? profile?.userId ?? "local-user",
    email,
    displayName: profile?.displayName || email.split("@")[0] || "",
    timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Berlin",
    onboardingComplete: Boolean(profile?.onboardingComplete),
    schedulerPreferences: profile?.schedulerPreferences,
    uiPreferences: normalizeUiPreferences(profile?.uiPreferences),
    account: accountFromUser(user, "pending-email-confirmation", timestamp),
  });
}

export function markCloudSignedOut<Fields extends ProfileFields>(profile: Fields, timestamp = nowIso()) {
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

async function assertCloudClient(client: { auth?: unknown; from?: unknown } | null | undefined) {
  if (!client?.auth || !client?.from) {
    throw new Error("Supabase ist noch nicht konfiguriert.");
  }
}

async function getCurrentUser<User extends CloudAuthUser>(client: UserClient<User>) {
  await assertCloudClient(client);
  const { data, error } = await client.auth.getUser();
  if (error && !isSessionMissing(error)) throw error;
  return data?.user ?? null;
}

export async function getCloudUser<User extends CloudAuthUser>(client: UserClient<User>) {
  return getCurrentUser(client);
}

export async function getPersistedCloudUser<User extends CloudAuthUser>(client: UserClient<User>) {
  await assertCloudClient(client);
  if (typeof client?.auth?.getSession !== "function") return null;
  const { data, error } = await client.auth.getSession();
  if (error && !isSessionMissing(error)) throw error;
  return data?.session?.user ?? null;
}

export async function getCloudWorkspaceUser<User extends CloudAuthUser>(
  client: UserClient<User>,
  online = typeof navigator === "undefined" || navigator.onLine !== false,
) {
  if (!online) return getPersistedCloudUser(client);
  try {
    return await getCurrentUser(client);
  } catch (error) {
    if (!isConnectivityFailure(error) || typeof client?.auth?.getSession !== "function") throw error;
    return getPersistedCloudUser(client);
  }
}

export async function saveCloudProfile<User extends CloudAuthUser>(client: UserClient<User>, profile: ProfileFields, timestamp = nowIso()) {
  const user = await getCurrentUser(client);
  if (!user) throw new Error("Bitte melde dich zuerst an.");

  const row = createProfileRow(profile, user, timestamp);
  const { data, error } = await (client.from("profiles") as ProfilesTable).upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw error;

  return createCloudProfile(data, user, profile, timestamp);
}

export async function signUpCloudAccount<User extends CloudAuthUser>(
  client: UserClient<User> & AuthClient<{
    signUp(credentials: { email: string; password: string; options: RedirectOptions & { data: Record<string, unknown> } }): PromiseLike<AuthAnswer<{ user: User | null; session: unknown }>>;
  }>,
  profile: ProfileFields,
  password: string,
  timestamp = nowIso(),
  redirectTo = getDefaultAuthRedirectTo(),
) {
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

export async function signInCloudAccount(
  client: AuthClient<{ signInWithPassword(credentials: { email: string; password: string }): PromiseLike<{ data: { user: CloudAuthUser | null }; error: unknown }> }>,
  profile: ProfileFields,
  password: string,
  timestamp = nowIso(),
) {
  await assertCloudClient(client);
  const email = normalizeEmail(profile?.email);
  if (!email || !email.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const initialProfile = createCloudProfile(null, data.user, profile, timestamp);
  const { error: profileError } = await (client.from("profiles") as ProfilesTable).upsert(
    createProfileRow(initialProfile, data.user!, timestamp),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) throw profileError;
  return initialProfile;
}

export async function signInWithMagicLink(
  client: AuthClient<{ signInWithOtp(credentials: { email: string; options: RedirectOptions & { shouldCreateUser: boolean } }): PromiseLike<{ error: unknown }> }>,
  email: string,
  redirectTo = getDefaultAuthRedirectTo(),
) {
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

export async function signOutCloudAccount<Fields extends ProfileFields>(client: AuthClient<{ signOut(): PromiseLike<{ error: unknown }> }>, profile: Fields, timestamp = nowIso()) {
  await assertCloudClient(client);
  const { error } = await client.auth.signOut();
  if (error) throw error;

  return markCloudSignedOut(profile, timestamp);
}

export async function resetCloudPassword(
  client: AuthClient<{ resetPasswordForEmail(email: string, options?: { redirectTo: string }): PromiseLike<{ error: unknown }> }>,
  email: string,
  redirectTo = getDefaultAuthRedirectTo(),
) {
  await assertCloudClient(client);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");

  const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
  return { email: normalizedEmail };
}

export async function updateCloudPassword<User extends CloudAuthUser>(
  client: AuthClient<{ updateUser(attributes: { password: string }): PromiseLike<AuthAnswer<{ user: User | null }>> }>,
  password: string,
) {
  await assertCloudClient(client);
  if (String(password ?? "").length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");

  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;

  return data?.user ?? null;
}

function authRedirectParameters(location: CloudAuthLocation) {
  const search = new URLSearchParams(String(location.search ?? "").replace(/^\?/, ""));
  const hash = new URLSearchParams(String(location.hash ?? "").replace(/^#/, ""));
  return {
    get(name: string) {
      return search.get(name) ?? hash.get(name);
    },
  };
}

export function readCloudAuthRedirectOutcome(location: CloudAuthLocation | null = typeof window === "undefined" ? null : window.location): CloudAuthRedirectOutcome {
  if (!location) return { kind: "none" };
  const parameters = authRedirectParameters(location);
  const code = parameters.get("error_code") ?? parameters.get("error") ?? "";
  const description = parameters.get("error_description") ?? "";
  if (code || description) {
    return {
      kind: "error",
      code: code || "auth_redirect_error",
      message: formatCloudAuthError({ code, message: description }, "Der Anmeldelink konnte nicht verarbeitet werden."),
    };
  }

  const type = parameters.get("type")?.toLowerCase();
  if (type === "recovery" || type === "password_recovery") return { kind: "recovery" };
  return { kind: "none" };
}

export function clearCloudAuthRedirectParams(
  location: CloudAuthLocation | null = typeof window === "undefined" ? null : window.location,
  history: CloudAuthHistory | null = typeof window === "undefined" ? null : window.history,
) {
  if (!location?.href || !history?.replaceState) return undefined;
  const url = new URL(location.href);
  url.hash = "";
  for (const name of ["code", "type", "error", "error_code", "error_description"]) url.searchParams.delete(name);
  const cleanUrl = `${url.pathname}${url.search}`;
  history.replaceState(history.state, "", cleanUrl);
  return cleanUrl;
}
