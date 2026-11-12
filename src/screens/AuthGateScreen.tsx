import React from "react";
import { Mail } from "lucide-react";
import { CoreWordmark } from "../ui/CoreWordmark.tsx";

export function AuthGateScreen({
  configured = true,
  recoveryMode = false,
  busy = false,
  message = "",
  messageType = "status",
  showMagicLink = false,
  onSignIn,
  onSignUp,
  onResetPassword,
  onMagicLink,
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
  const title = isRecovery ? "Neues Passwort setzen" : isMagicLink ? "Magic Link senden" : isReset ? "Passwort zurücksetzen" : isSignUp ? "Account erstellen" : "Login";
  const primaryLabel = isRecovery ? "Passwort speichern" : isMagicLink ? "Magic Link senden" : isReset ? "Reset-Link senden" : isSignUp ? "Account erstellen" : "Anmelden";
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
    <main className="core-centered-viewport grid min-h-dvh min-w-0 grid-cols-[minmax(0,1fr)] place-items-center bg-core-canvas px-6 py-10 text-core-text">
      <div className="min-w-0 w-full max-w-md">
          <div className="mb-8 text-center">
            <img src="/core-brain.svg" alt="" className="core-auth-mascot mx-auto mb-6 w-auto" />
            <h1 className="core-auth-wordmark"><CoreWordmark /></h1>
            <p className="mt-2 core-body-large text-core-muted">Content Repetition</p>
          </div>

          <div className="core-auth-panel">
            <h2 className={mode === "sign-in" ? "sr-only" : "mb-5 core-heading-2 min-w-0 break-words text-core-text"}>{title}</h2>

            {!configured ? (
              <p className="mb-4 core-status-error core-body font-semibold" role="alert">
                Supabase ist für diese Umgebung noch nicht konfiguriert.
              </p>
            ) : null}

            <form ref={formRef} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" onSubmit={submit} aria-busy={busy}>
              {isSignUp ? (
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-field-label">
                  Anzeigename
                  <input className="core-field min-w-0 max-w-full" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
                </label>
              ) : null}

              {needsEmail ? (
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-field-label">
                  E-Mail
                  <span className="relative flex min-w-0 items-center">
                    <Mail size={16} className="pointer-events-none absolute left-3 text-core-muted" aria-hidden="true" />
                    <input className="core-field min-w-0 pl-9" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                  </span>
                </label>
              ) : null}

              {needsPassword ? (
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-field-label">
                  {isRecovery ? "Neues Passwort" : "Passwort"}
                  <input
                    className="core-field min-w-0 max-w-full"
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
                <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 core-field-label">
                  Passwort wiederholen
                  <input
                    className="core-field min-w-0 max-w-full"
                    type="password"
                    value={passwordRepeat}
                    onChange={(event) => setPasswordRepeat(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              ) : null}

              <button type="submit" disabled={!configured || busy} className="core-action-primary">
                {busy ? `${primaryLabel} läuft` : primaryLabel}
              </button>
            </form>

            {!isRecovery ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {mode !== "sign-in" ? (
                  <button type="button" onClick={() => setMode("sign-in")} className="min-h-control rounded-control px-2 core-body font-semibold text-core-action transition-colors hover:bg-core-subtle" aria-pressed={false}>
                    Anmelden
                  </button>
                ) : null}
                {showMagicLink ? (
                  <button type="button" onClick={() => setMode("magic-link")} className="min-h-control rounded-control px-2 core-body font-semibold text-core-action transition-colors hover:bg-core-subtle" aria-pressed={isMagicLink}>
                    Magic Link
                  </button>
                ) : null}
                <button type="button" onClick={() => setMode("sign-up")} className="min-h-control rounded-control px-2 core-body font-semibold text-core-action transition-colors hover:bg-core-subtle" aria-pressed={isSignUp}>
                  Account erstellen
                </button>
                <button type="button" onClick={() => setMode("reset")} className="min-h-control rounded-control px-2 core-body font-semibold text-core-action transition-colors hover:bg-core-subtle" aria-pressed={isReset}>
                  Passwort vergessen
                </button>
              </div>
            ) : null}

            {message ? (
              <p className={`mt-4 core-body ${messageType === "alert" ? "core-status-error font-semibold" : "core-status-info"}`} role={messageType}>
                {message}
              </p>
            ) : null}
          </div>
      </div>
    </main>
  );
}
