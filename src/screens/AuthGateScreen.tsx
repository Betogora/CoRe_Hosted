import React from "react";
import { Chrome, KeyRound, Link2, Lock, Mail, RotateCcw, ShieldCheck, UserPlus } from "lucide-react";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";

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
  const isSignIn = !isSignUp && !isReset && !isMagicLink && !isRecovery;
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
    <main className="grid min-h-screen place-items-center bg-[#e5e5e5] p-5 text-[#17214f]">
      <SoftPanel className="w-full max-w-[404px] bg-white/90 p-5 shadow-[0_2px_4px_rgba(91,105,154,0.08)]">
        <div className={`flex items-center gap-3 ${isSignIn ? "mb-1" : "mb-5"}`}>
          <OrbIcon icon={Lock} />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Login</p>
            {!isSignIn ? <h2 className="text-2xl font-semibold text-[#17214f]">{title}</h2> : null}
          </div>
        </div>

        {!configured ? (
          <p className="core-status-error text-sm font-semibold" role="alert">
            Supabase ist für diese Umgebung noch nicht konfiguriert.
          </p>
        ) : null}

        <form ref={formRef} className="grid gap-4" onSubmit={submit} aria-busy={busy}>
          {isSignUp ? (
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Anzeigename
              <input className="min-h-10 rounded-xl border border-[#dfe4f5] px-3" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
            </label>
          ) : null}

          {needsEmail ? (
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              E-Mail-Adresse
              <span className="flex min-h-10 items-center overflow-hidden rounded-xl border border-[#dfe4f5]">
                <span className="grid w-9 self-stretch place-items-center border-r border-[#edf0f8] bg-[#fafbfe]">
                  <Mail size={17} className="text-[#66709a]" aria-hidden="true" />
                </span>
                <input className="min-w-0 flex-1 px-3 outline-none" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </span>
            </label>
          ) : null}

          {needsPassword ? (
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              {isRecovery ? "Neues Passwort" : "Passwort"}
              <input
                className="min-h-10 rounded-xl border border-[#dfe4f5] px-3"
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
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Passwort wiederholen
              <input
                className="min-h-10 rounded-xl border border-[#dfe4f5] px-3"
                type="password"
                value={passwordRepeat}
                onChange={(event) => setPasswordRepeat(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          ) : null}

          <button type="submit" disabled={!configured || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white disabled:bg-slate-300">
            <PrimaryIcon size={17} aria-hidden="true" />
            {busy ? `${primaryLabel} läuft` : primaryLabel}
          </button>
        </form>

        {!isRecovery && showGoogleSignIn ? (
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={!configured || busy}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#24327a] disabled:text-slate-400"
          >
            <Chrome size={17} aria-hidden="true" />
            Mit Google anmelden
          </button>
        ) : null}

        {!isRecovery ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {!isSignIn ? (
              <button type="button" onClick={() => setMode("sign-in")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={isSignIn}>
                Anmelden
              </button>
            ) : null}
            {showMagicLink && !isMagicLink ? (
              <button type="button" onClick={() => setMode("magic-link")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={isMagicLink}>
                Magic Link
              </button>
            ) : null}
            {!isSignUp ? (
              <button type="button" onClick={() => setMode("sign-up")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={isSignUp}>
                Account erstellen
              </button>
            ) : null}
            {!isReset ? (
              <button type="button" onClick={() => setMode("reset")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={isReset}>
                Passwort vergessen
              </button>
            ) : null}
          </div>
        ) : null}

        {message ? (
          <p className={`mt-4 text-sm ${messageType === "alert" ? "core-status-error font-semibold" : "core-status-info"}`} role={messageType}>
            {message}
          </p>
        ) : null}
      </SoftPanel>
    </main>
  );
}
