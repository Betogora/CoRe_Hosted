import React from "react";
import { clearPomodoroTimer, createPomodoroTimerFromSeconds, getPomodoroTimerStorageKey, pausePomodoroTimer, readPomodoroTimer, resumePomodoroTimer, writePomodoroTimer, type PomodoroTimer } from "./pomodoroTimer.ts";
import { useSuccessToast } from "./ui/feedbackUi.tsx";

/**
 * The account's focus timer: stored per account, followed across tabs, and announced with a toast when it runs out,
 * also when it ran out while the app was closed.
 */
export function usePomodoroTimer(userId: string | undefined) {
  const setSuccessToast = useSuccessToast();
  const [pomodoroTimer, setPomodoroTimer] = React.useState<PomodoroTimer | null>(null);
  const pomodoroTimerRef = React.useRef<PomodoroTimer | null>(null);

  const startPomodoro = React.useCallback((minutes: number) => {
    if (!userId) return;
    const timer = createPomodoroTimerFromSeconds(Math.round(minutes * 60));
    if (!timer) return;
    pomodoroTimerRef.current = timer;
    setPomodoroTimer(timer);
    writePomodoroTimer(userId, timer);
  }, [userId]);

  const changePomodoroPause = React.useCallback((paused: boolean) => {
    if (!userId) return;
    const timer = paused ? pausePomodoroTimer(pomodoroTimerRef.current) : resumePomodoroTimer(pomodoroTimerRef.current);
    if (!timer) return;
    pomodoroTimerRef.current = timer;
    setPomodoroTimer(timer);
    writePomodoroTimer(userId, timer);
  }, [userId]);

  const resetPomodoro = React.useCallback(() => {
    const timer = pomodoroTimerRef.current;
    if (!userId || !timer) return;
    pomodoroTimerRef.current = null;
    setPomodoroTimer(null);
    clearPomodoroTimer(userId, timer.id);
  }, [userId]);

  React.useEffect(() => {
    if (!userId) {
      pomodoroTimerRef.current = null;
      setPomodoroTimer(null);
      return;
    }

    const storedTimer = readPomodoroTimer(userId);
    if (storedTimer && storedTimer.pausedAt === undefined && storedTimer.endsAt <= Date.now()) {
      const removed = clearPomodoroTimer(userId, storedTimer.id);
      pomodoroTimerRef.current = null;
      setPomodoroTimer(null);
      if (removed) setSuccessToast("Timer abgelaufen.");
      return;
    }
    pomodoroTimerRef.current = storedTimer;
    setPomodoroTimer(storedTimer);
  }, [userId, setSuccessToast]);

  React.useEffect(() => {
    if (!userId || typeof window === "undefined") return undefined;
    const accountUserId = userId;
    let storageKey = "";
    try {
      storageKey = getPomodoroTimerStorageKey(accountUserId);
    } catch {
      return undefined;
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey) return;
      const nextTimer = readPomodoroTimer(accountUserId);
      if (nextTimer && nextTimer.pausedAt === undefined && nextTimer.endsAt <= Date.now()) {
        const removed = clearPomodoroTimer(accountUserId, nextTimer.id);
        pomodoroTimerRef.current = null;
        setPomodoroTimer(null);
        if (removed) setSuccessToast("Timer abgelaufen.");
        return;
      }
      pomodoroTimerRef.current = nextTimer;
      setPomodoroTimer(nextTimer);
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [userId, setSuccessToast]);

  React.useEffect(() => {
    const timer = pomodoroTimer;
    if (!userId || !timer || timer.pausedAt !== undefined) return undefined;
    const accountUserId = userId;
    const activeTimer = timer;
    let timeoutId = 0;
    let cancelled = false;

    function checkExpiry() {
      if (cancelled || pomodoroTimerRef.current !== activeTimer) return;
      const remainingMilliseconds = activeTimer.endsAt - Date.now();
      if (remainingMilliseconds > 0) {
        timeoutId = window.setTimeout(checkExpiry, Math.min(remainingMilliseconds, 60_000));
        return;
      }

      clearPomodoroTimer(accountUserId, activeTimer.id);
      pomodoroTimerRef.current = null;
      setPomodoroTimer(null);
      setSuccessToast("Timer abgelaufen.");
    }

    checkExpiry();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [userId, pomodoroTimer, setSuccessToast]);

  return { pomodoroTimer, startPomodoro, changePomodoroPause, resetPomodoro };
}
