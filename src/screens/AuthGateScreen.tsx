import React from "react";
import { Chrome, KeyRound, Link2, Lock, Mail, RotateCcw, ShieldCheck, UserPlus } from "lucide-react";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { ReleaseInfo } from "../ui/ReleaseInfo.tsx";

export function AuthGateScreen({
  configured = true,
  recoveryMode = false,
  busy = false,
  message = "",
  messageType = "status",
  showGoogleSignIn = false,
  showMagicLink = false,
  onSignIn,
  onSignUp,
  onResetPassword,
  onMagicLink,
  onGoogleSignIn,
  onUpdatePassword,
}: any) {
  const [mode, setMode] = React.useState(recoveryMode ? "recovery" : "sign-in");
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordRepeat, setPasswordRepeat] = React.useState("");
  const formRef = React.useRef<HTMLFormElement | null>(null);

  React.useEffect(() => {
    if (recoveryMode) setMode("recovery");
  }, [recoveryMode]);

  React.useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input")?.focus();
  }, [mode]);

  const isSignUp = mode === "sign-up";
  const isReset = mode === "reset";
  const isMagicLink = mode === "magic-link";
  const isRecovery = mode === "recovery";
  const title = isRecovery ? "Neues Passwort setzen" : isMagicLink ? "Magic Link senden" : isReset ? "Passwort zurücksetzen" : isSignUp ? "Account erstellen" : "Bei CoRe anmelden";
  const primaryLabel = isRecovery ? "Passwort speichern" : isMagicLink ? "Magic Link senden" : isReset ? "Reset-Link senden" : isSignUp ? "Account erstellen" : "Anmelden";
  const PrimaryIcon = isRecovery ? KeyRound : isMagicLink ? Link2 : isReset ? RotateCcw : isSignUp ? UserPlus : ShieldCheck;
  const needsEmail = !isRecovery;
  const needsPassword = !isReset && !isMagicLink;

  async function submit(event: { preventDefault: () => void; }) {
    event.preventDefault();
    if (isRecovery) {
      await onUpdatePassword?.({ password, passwordRepeat });
      return;
    }
    if (isMagicLink) {
      await onMagicLink?.({ email });
      return;
    }
    if (isReset) {
      await onResetPassword?.({ email });
      return;
    }
    if (isSignUp) {
      await onSignUp?.({ displayName, email, password });
      return;
    }
    await onSignIn?.({ email, password });
  }

  return (
    <main className="core-auth-shell min-h-screen min-w-0 bg-core-canvas p-4 text-[var(--core-text)] sm:p-8">
      <div className="core-auth-frame grid min-w-0 min-h-[calc(100vh-2rem)] grid-cols-[minmax(0,1fr)] place-items-center rounded-[22px] border border-[var(--core-border)] bg-core-surface px-5 py-10 shadow-[var(--core-shadow-raised)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <div className="min-w-0 w-full max-w-md">
          <div className="mb-8">
            <h1 className="core-heading-1 font-semibold tracking-normal text-[var(--core-text)]">CoRe</h1>
            <p className="mt-2 core-body-large text-[var(--core-text-muted)]">Content Repetition</p>
          </div>

          <SoftPanel className="core-auth-panel p-6">
            <div className="core-auth-heading mb-6 flex min-w-0 items-center gap-3">
              <OrbIcon icon={Lock} className="core-auth-heading-icon" />
              <div className="min-w-0">
                <p className="core-body font-semibold uppercase tracking-wide text-[var(--core-action-secondary)]">Login</p>
                <h2 className="core-heading-2 break-words font-semibold text-[var(--core-text)]">{title}</h2>
              </div>
            </div>

            {!configured ? (
              <p className="core-status-error core-body font-semibold" role="alert">
                Supabase ist für diese Umgebung noch nicht konfiguriert.
              </p>
            ) : null}

            <form ref={formRef} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" onSubmit={submit} aria-busy={busy}>
              {isSignUp ? (
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                  Anzeigename
                  <input className="min-h-11 min-w-0 w-full max-w-full rounded-xl border border-[var(--core-border)] px-3" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
                </label>
              ) : null}

              {needsEmail ? (
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                  E-Mail
                  <span className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-[var(--core-border)] px-3">
                    <Mail size={17} className="text-[var(--core-text-muted)]" aria-hidden="true" />
                    <input className="min-w-0 flex-1 outline-none" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                  </span>
                </label>
              ) : null}

              {needsPassword ? (
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                  {isRecovery ? "Neues Passwort" : "Passwort"}
                  <input
                    className="min-h-11 min-w-0 w-full max-w-full rounded-xl border border-[var(--core-border)] px-3"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isSignUp || isRecovery ? "new-password" : "current-password"}
                    minLength={8}
                    required
                  />
                </label>
              ) : null}

              {isRecovery ? (
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
                  Passwort wiederholen
                  <input
                    className="min-h-11 min-w-0 w-full max-w-full rounded-xl border border-[var(--core-border)] px-3"
                    type="password"
                    value={passwordRepeat}
                    onChange={(event) => setPasswordRepeat(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              ) : null}

              <button type="submit" disabled={!configured || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--core-action-primary)] px-5 core-body font-semibold text-[var(--core-text-on-accent)] disabled:bg-[var(--core-action-disabled-bg)]">
                <PrimaryIcon size={17} aria-hidden="true" />
                {busy ? `${primaryLabel} läuft` : primaryLabel}
              </button>
            </form>

            {!isRecovery && showGoogleSignIn ? (
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={!configured || busy}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--core-border)] px-4 core-body font-semibold text-[var(--core-text)] disabled:text-[var(--core-action-disabled-text)]"
              >
                <Chrome size={17} aria-hidden="true" />
                Mit Google anmelden
              </button>
            ) : null}

            {!isRecovery ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setMode("sign-in")} className="core-body font-semibold text-[var(--core-action-primary)]" aria-pressed={!isSignUp && !isReset && !isMagicLink}>
                  Anmelden
                </button>
                {showMagicLink ? (
                  <button type="button" onClick={() => setMode("magic-link")} className="core-body font-semibold text-[var(--core-action-primary)]" aria-pressed={isMagicLink}>
                    Magic Link
                  </button>
                ) : null}
                <button type="button" onClick={() => setMode("sign-up")} className="core-body font-semibold text-[var(--core-action-primary)]" aria-pressed={isSignUp}>
                  Account erstellen
                </button>
                <button type="button" onClick={() => setMode("reset")} className="core-body font-semibold text-[var(--core-action-primary)]" aria-pressed={isReset}>
                  Passwort vergessen
                </button>
              </div>
            ) : null}

            {message ? (
              <p className={`mt-4 core-body ${messageType === "alert" ? "core-status-error font-semibold" : "core-status-info"}`} role={messageType}>
                {message}
              </p>
            ) : null}
          </SoftPanel>
          <ReleaseInfo className="mt-5 text-center" />
        </div>
      </div>
    </main>
  );
}
