import React from "react";
import { createViewRoute, type AppRoute } from "./appNavigation.ts";
import type { CardDraftGuard } from "./appScreenProps.ts";
import { useAppNavigation } from "./useAppNavigation.ts";

/** An unsaved draft of a view; `save` lets leaving keep it, without it leaving discards it. */
interface DraftGuard {
  saving: boolean;
  focus: (() => void) | null;
  save?: () => Promise<boolean>;
}

const GUARD_SOURCES = { "neue-karten": "creation", kartenstapel: "card", pruefungen: "exams" } as const;
type GuardedView = keyof typeof GUARD_SOURCES;
type PendingNavigation = { run: () => void; view: GuardedView };

/** The view whose draft leaving `activeView` for `targetView` settles first; moves within a view settle nothing. */
export function draftToSettle(activeView: string, targetView: string | undefined, guards: Partial<Record<GuardedView, DraftGuard>>): GuardedView | null {
  const view = activeView in GUARD_SOURCES && targetView !== activeView ? activeView as GuardedView : null;
  return view && guards[view] ? view : null;
}

interface NavigationGuardOptions extends Omit<Parameters<typeof useAppNavigation>[0], "onBeforeNavigation"> {
  /** Decides first while a settings draft is open; undefined lets the other drafts decide. */
  settingsBlocksNavigation: (route: AppRoute) => boolean | undefined;
}

export function useNavigationGuard({ settingsBlocksNavigation, ...options }: NavigationGuardOptions) {
  const draftGuards = React.useRef<Partial<Record<GuardedView, DraftGuard>>>({});
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingNavigation | null>(null);
  const [savingPendingNavigation, setSavingPendingNavigation] = React.useState(false);

  const navigation = useAppNavigation({
    ...options,
    onBeforeNavigation(route, source) {
      const settingsDecision = settingsBlocksNavigation(route);
      if (settingsDecision !== undefined) return settingsDecision;
      const creation = draftGuards.current["neue-karten"];
      if (source === "browser" && creation?.saving) {
        creation.focus?.();
        return true;
      }
      if (source === "browser" && creation) {
        setPendingNavigation({ view: "neue-karten", run: () => navigation.navigateToRoute(route) });
        return true;
      }
      return false;
    },
  });
  const { activeView, navigateToView: navigateUnguarded } = navigation;

  const navigateToView = React.useCallback((...args: Parameters<typeof navigateUnguarded>) => {
    const leaving = draftToSettle(activeView, args[0], draftGuards.current);
    const guard = leaving ? draftGuards.current[leaving] : undefined;
    if (!leaving || !guard) return navigateUnguarded(...args);
    if (guard.saving) guard.focus?.();
    else setPendingNavigation({ view: leaving, run: () => { navigateUnguarded(...args); } });
    return createViewRoute(activeView);
  }, [activeView, navigateUnguarded]);

  const leaveCardDraft = React.useCallback((leave: () => void) => {
    if (draftGuards.current.kartenstapel) setPendingNavigation({ view: "kartenstapel", run: leave });
    else leave();
  }, []);

  const setDraftGuard = (view: GuardedView, guard: DraftGuard | null) => {
    if (guard) draftGuards.current[view] = guard;
    else delete draftGuards.current[view];
  };

  const handleCreationDraftStateChange = React.useCallback((dirty: boolean, focusDraft: (() => void) | null, saving: boolean) => {
    setDraftGuard("neue-karten", dirty || saving ? { saving, focus: focusDraft } : null);
  }, []);

  const handleExamDraftStateChange = React.useCallback((dirty: boolean) => {
    setDraftGuard("pruefungen", dirty ? { saving: false, focus: null } : null);
  }, []);

  const handleCardDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    setDraftGuard("kartenstapel", guard ? { saving: false, focus: guard.focus, save: guard.save } : null);
  }, []);

  function runPendingNavigation() {
    const pending = pendingNavigation;
    setPendingNavigation(null);
    pending?.run();
  }

  async function confirmPendingNavigation() {
    const guard = pendingNavigation ? draftGuards.current[pendingNavigation.view] : undefined;
    if (!guard?.save) {
      if (pendingNavigation) delete draftGuards.current[pendingNavigation.view];
      runPendingNavigation();
      return;
    }
    setSavingPendingNavigation(true);
    try {
      if (await guard.save()) runPendingNavigation();
    } finally {
      setSavingPendingNavigation(false);
    }
  }

  function focusPendingDraft() {
    if (pendingNavigation) draftGuards.current[pendingNavigation.view]?.focus?.();
  }

  return {
    ...navigation,
    navigateToView,
    leaveCardDraft,
    handleCreationDraftStateChange,
    handleExamDraftStateChange,
    handleCardDraftStateChange,
    pendingNavigation: pendingNavigation ? GUARD_SOURCES[pendingNavigation.view] : null,
    savingPendingNavigation,
    cancelPendingNavigation: () => setPendingNavigation(null),
    discardPendingNavigation: runPendingNavigation,
    confirmPendingNavigation,
    focusPendingDraft,
  };
}
