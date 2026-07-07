import { stableContentHash } from "./coreModel.js";

export function createLocalAccount({
  displayName = "",
  email = "",
  password = "",
  university = "",
  fieldOfStudy = "",
  preferredLanguage = "de",
  now = new Date().toISOString(),
} = {}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Eine gültige E-Mail-Adresse ist erforderlich.");
  }
  if (String(password).length < 8) {
    throw new Error("Das lokale Passwort muss mindestens 8 Zeichen haben.");
  }

  return {
    userId: stableContentHash({ normalizedEmail }, "user"),
    email: normalizedEmail,
    displayName: displayName.trim() || normalizedEmail.split("@")[0],
    university,
    fieldOfStudy,
    preferredLanguage,
    onboardingComplete: true,
    account: {
      status: "signed-in",
      authProvider: "local-demo",
      passwordVerifier: stableContentHash({ normalizedEmail, password }, "pw"),
      createdAt: now,
      lastSignedInAt: now,
    },
    privacy: {
      shareLearningProgress: false,
      showOnlineStatus: false,
      showStreaksToOthers: false,
    },
  };
}

export function signInLocalAccount(profile, { email = "", password = "", now = new Date().toISOString() } = {}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const verifier = stableContentHash({ normalizedEmail, password }, "pw");

  if (!profile?.account?.passwordVerifier || profile.account.passwordVerifier !== verifier) {
    throw new Error("E-Mail oder lokales Passwort passt nicht zum gespeicherten Profil.");
  }

  return {
    ...profile,
    email: normalizedEmail,
    onboardingComplete: true,
    account: {
      ...profile.account,
      status: "signed-in",
      lastSignedInAt: now,
    },
  };
}

export function signOutLocalAccount(profile, now = new Date().toISOString()) {
  return {
    ...profile,
    account: {
      ...(profile.account ?? {}),
      status: "signed-out",
      signedOutAt: now,
    },
  };
}

export function connectOAuthPlaceholder(profile, provider, now = new Date().toISOString()) {
  return {
    ...profile,
    account: {
      ...(profile.account ?? {}),
      status: "signed-in",
      authProvider: provider,
      oauthPlaceholder: true,
      lastSignedInAt: now,
    },
  };
}

