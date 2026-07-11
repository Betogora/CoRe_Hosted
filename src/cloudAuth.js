const SESSION_MISSING_CODES = new Set(["AuthSessionMissingError", "session_not_found"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function mergePrivacy(profile) {
  return {
    shareLearningProgress: false,
    showOnlineStatus: false,
    showStreaksToOthers: false,
    ...(profile?.privacy ?? {}),
  };
}

function accountFromUser(user, status = "signed-in", timestamp = nowIso()) {
  return {
    status,
    authProvider: "supabase",
    userId: user?.id ?? null,
    createdAt: user?.created_at ?? timestamp,
    lastSignedInAt: timestamp,
  };
}

function isSessionMissing(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    SESSION_MISSING_CODES.has(error?.name) ||
    SESSION_MISSING_CODES.has(error?.code) ||
    message.includes("auth session missing") ||
    message.includes("session not found")
  );
}

export function formatCloudAuthError(error, fallback = "Aktion konnte nicht abgeschlossen werden.") {
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

export function createCloudAuthRedirectUrl(origin) {
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

export function createProfileRow(profile, user, timestamp = nowIso()) {
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

export function createCloudProfile(row, user, fallback = {}, timestamp = nowIso()) {
  const email = normalizeEmail(row?.email ?? user?.email ?? fallback?.email);

  return {
    ...fallback,
    userId: user?.id ?? row?.id ?? fallback?.userId ?? "local-user",
    email,
    displayName: row?.display_name ?? fallback?.displayName ?? email.split("@")[0] ?? "",
    university: row?.university ?? fallback?.university ?? "",
    fieldOfStudy: row?.field_of_study ?? fallback?.fieldOfStudy ?? "",
    preferredLanguage: row?.preferred_language ?? fallback?.preferredLanguage ?? "de",
    timezone: row?.timezone ?? fallback?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Berlin",
    onboardingComplete: row?.onboarding_complete ?? fallback?.onboardingComplete ?? true,
    privacy: { ...mergePrivacy(fallback), ...(row?.privacy ?? {}) },
    schedulerPreferences: row?.scheduler_preferences ?? fallback?.schedulerPreferences ?? { profile: "standard" },
    account: accountFromUser(user ?? { id: row?.id, email, created_at: row?.created_at }, "signed-in", timestamp),
  };
}

export function createPendingCloudProfile(profile, user, timestamp = nowIso()) {
  const email = normalizeEmail(user?.email ?? profile?.email);

  return {
    ...profile,
    userId: user?.id ?? profile?.userId ?? "local-user",
    email,
    displayName: profile?.displayName || email.split("@")[0] || "",
    account: accountFromUser(user, "pending-email-confirmation", timestamp),
  };
}

export function markCloudSignedOut(profile, timestamp = nowIso()) {
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

async function assertCloudClient(client) {
  if (!client?.auth || !client?.from) {
    throw new Error("Supabase ist noch nicht konfiguriert.");
  }
}

async function getCurrentUser(client) {
  await assertCloudClient(client);
  const { data, error } = await client.auth.getUser();
  if (error && !isSessionMissing(error)) throw error;
  return data?.user ?? null;
}

export async function getCloudUser(client) {
  return getCurrentUser(client);
}

export async function saveCloudProfile(client, profile, timestamp = nowIso()) {
  const user = await getCurrentUser(client);
  if (!user) throw new Error("Bitte melde dich zuerst an.");

  const row = createProfileRow(profile, user, timestamp);
  const { data, error } = await client.from("profiles").upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw error;

  return createCloudProfile(data, user, profile, timestamp);
}

export async function loadCloudProfile(client, fallback = {}, timestamp = nowIso()) {
  const user = await getCurrentUser(client);
  if (!user) return markCloudSignedOut(fallback, timestamp);

  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (data) return createCloudProfile(data, user, fallback, timestamp);

  return saveCloudProfile(client, createCloudProfile(null, user, fallback, timestamp), timestamp);
}

export async function signUpCloudAccount(client, profile, password, timestamp = nowIso(), redirectTo = getDefaultAuthRedirectTo()) {
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

export async function signInCloudAccount(client, profile, password, timestamp = nowIso()) {
  await assertCloudClient(client);
  const email = normalizeEmail(profile?.email);
  if (!email || !email.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;

  return saveCloudProfile(client, createCloudProfile(null, data.user, profile, timestamp), timestamp);
}

export async function signInWithMagicLink(client, email, redirectTo = getDefaultAuthRedirectTo()) {
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

export async function signInWithGoogle(client, redirectTo = getDefaultAuthRedirectTo()) {
  await assertCloudClient(client);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) throw error;

  return data;
}

export async function signOutCloudAccount(client, profile, timestamp = nowIso()) {
  await assertCloudClient(client);
  const { error } = await client.auth.signOut();
  if (error) throw error;

  return markCloudSignedOut(profile, timestamp);
}

export async function resetCloudPassword(client, email, redirectTo = getDefaultAuthRedirectTo()) {
  await assertCloudClient(client);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");

  const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
  return { email: normalizedEmail };
}

export async function updateCloudPassword(client, password) {
  await assertCloudClient(client);
  if (String(password ?? "").length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");

  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;

  return data?.user ?? null;
}
