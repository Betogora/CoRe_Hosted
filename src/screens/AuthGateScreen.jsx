import React from "react";
import { Chrome, KeyRound, Link2, Lock, Mail, RotateCcw, ShieldCheck, UserPlus } from "lucide-react";
import { OrbIcon, SoftPanel } from "../ui/coreUi.jsx";

export function AuthGateScreen({
  configured = true,
  recoveryMode = false,
  busy = false,
  message = "",
  messageType = "status",
  onSignIn,
  onSignUp,
  onResetPassword,
  onMagicLink,
  onGoogleSignIn,
  onUpdatePassword,
}) {
  const [mode, setMode] = React.useState(recoveryMode ? "recovery" : "sign-in");
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordRepeat, setPasswordRepeat] = React.useState("");

  React.useEffect(() => {
    if (recoveryMode) setMode("recovery");
  }, [recoveryMode]);

  const isSignUp = mode === "sign-up";
  const isReset = mode === "reset";
  const isMagicLink = mode === "magic-link";
  const isRecovery = mode === "recovery";
  const title = isRecovery ? "Neues Passwort setzen" : isMagicLink ? "Magic Link senden" : isReset ? "Passwort zurücksetzen" : isSignUp ? "Account erstellen" : "Bei CoRe anmelden";
  const primaryLabel = isRecovery ? "Passwort speichern" : isMagicLink ? "Magic Link senden" : isReset ? "Reset-Link senden" : isSignUp ? "Account erstellen" : "Anmelden";
  const PrimaryIcon = isRecovery ? KeyRound : isMagicLink ? Link2 : isReset ? RotateCcw : isSignUp ? UserPlus : ShieldCheck;
  const needsEmail = !isRecovery;
  const needsPassword = !isReset && !isMagicLink;

  async function submit(event) {
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[#dce2f4] bg-white/52 px-5 py-10 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-5xl font-semibold tracking-normal text-[#17214f]">CoRe</h1>
            <p className="mt-2 text-base text-[#66709a]">Content Repetition</p>
          </div>

          <SoftPanel className="p-6">
            <div className="mb-6 flex items-center gap-3">
              <OrbIcon icon={Lock} />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Login</p>
                <h2 className="text-2xl font-semibold text-[#17214f]">{title}</h2>
              </div>
            </div>

            {!configured ? (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
                Supabase ist für diese Umgebung noch nicht konfiguriert.
              </p>
            ) : null}

            <form className="grid gap-4" onSubmit={submit}>
              {isSignUp ? (
                <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                  Anzeigename
                  <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
                </label>
              ) : null}

              {needsEmail ? (
                <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                  E-Mail
                  <span className="flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3">
                    <Mail size={17} className="text-[#66709a]" aria-hidden="true" />
                    <input className="min-w-0 flex-1 outline-none" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                  </span>
                </label>
              ) : null}

              {needsPassword ? (
                <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                  {isRecovery ? "Neues Passwort" : "Passwort"}
                  <input
                    className="min-h-11 rounded-xl border border-[#dfe4f5] px-3"
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
                    className="min-h-11 rounded-xl border border-[#dfe4f5] px-3"
                    type="password"
                    value={passwordRepeat}
                    onChange={(event) => setPasswordRepeat(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              ) : null}

              <button type="submit" disabled={!configured || busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white disabled:bg-slate-300">
                <PrimaryIcon size={17} aria-hidden="true" />
                {busy ? "Bitte warten" : primaryLabel}
              </button>
            </form>

            {!isRecovery ? (
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
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setMode("sign-in")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={!isSignUp && !isReset && !isMagicLink}>
                  Anmelden
                </button>
                <button type="button" onClick={() => setMode("magic-link")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={isMagicLink}>
                  Magic Link
                </button>
                <button type="button" onClick={() => setMode("sign-up")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={isSignUp}>
                  Account erstellen
                </button>
                <button type="button" onClick={() => setMode("reset")} className="text-sm font-semibold text-[#4f5eb1]" aria-pressed={isReset}>
                  Passwort vergessen
                </button>
              </div>
            ) : null}

            {message ? (
              <p className={`mt-4 text-sm ${messageType === "alert" ? "font-semibold text-red-700" : "text-[#66709a]"}`} role={messageType} aria-live={messageType === "alert" ? "assertive" : "polite"}>
                {message}
              </p>
            ) : null}
          </SoftPanel>
        </div>
      </div>
    </main>
  );
}
