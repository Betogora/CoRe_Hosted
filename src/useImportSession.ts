import React from "react";
import { createEmptyApkgImportSession, disposeApkgImportPreview, hasVisibleApkgImportSession, type ApkgImportSession } from "./apkgImportSession.ts";
import type { ImportCommands } from "./importCommands.ts";
import { useSuccessToast } from "./ui/feedbackUi.tsx";

/**
 * The APKG import session, which keeps parsing and its preview while the creation screen is left and ends with the
 * account, plus the import upkeep of the open workspace: cloud confirmations follow the sync status, and once the
 * workspace is ready unedited imports are re-translated after a translator release.
 */
export function useImportSession(commands: ImportCommands | null, accountId: string | null, retranslationReady: boolean) {
  const setSuccessToast = useSuccessToast();
  const [session, setSessionState] = React.useState<ApkgImportSession>(() => createEmptyApkgImportSession());
  const sessionRef = React.useRef(session);
  const accountIdRef = React.useRef<string | null>(null);

  const setSession = React.useCallback((update: React.SetStateAction<ApkgImportSession>) => {
    setSessionState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      sessionRef.current = next;
      return next;
    });
  }, []);

  const reset = React.useCallback((disposeWorker = true) => {
    const current = sessionRef.current;
    if (disposeWorker && !current.isParsing) disposeApkgImportPreview(current);
    setSession(createEmptyApkgImportSession(current.version + 1));
  }, [setSession]);

  const isCurrent = React.useCallback(
    (version: number) => sessionRef.current.version === version,
    [],
  );

  React.useEffect(() => {
    if (accountIdRef.current === accountId) return;
    disposeApkgImportPreview(sessionRef.current);
    accountIdRef.current = accountId;
    reset(false);
  }, [accountId, reset]);

  React.useEffect(() => commands?.followSyncStatus(), [commands]);

  React.useEffect(() => {
    if (!retranslationReady || !commands) return undefined;
    let active = true;
    void commands.retranslate()
      .then((count) => {
        if (!active || count === 0) return;
        setSuccessToast(`${count.toLocaleString("de-DE")} ${count === 1 ? "Inhalt" : "Inhalte"} mit verbesserter Darstellung aktualisiert.`);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [commands, retranslationReady, setSuccessToast]);

  return {
    session,
    setSession,
    reset,
    isCurrent,
    hasVisibleSession: () => hasVisibleApkgImportSession(sessionRef.current),
    /** Ends the session with its preview, at once on sign-out. */
    discard() {
      disposeApkgImportPreview(sessionRef.current);
      reset(false);
    },
  };
}
