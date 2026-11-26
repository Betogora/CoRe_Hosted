import React from "react";
import { createViewRoute, type AppRoute } from "./appNavigation.ts";
import type { CardDraftGuard } from "./appScreenProps.ts";
import { useAppNavigation } from "./useAppNavigation.ts";

/** An unsaved draft of a view; `save` lets leaving keep it, without it leaving discards it. */
interface DraftGuard {
  saving: boolean;
  focus: (() => void) | null;
  save?: () => Promise<boolean>;
  /** The question of a draft that can only be given up. */
  leave?: { title: string; description: string };
}

const GUARD_SOURCES = { "neue-karten": "creation", kartenstapel: "card", pruefungen: "exams" } as const;
type GuardedView = keyof typeof GUARD_SOURCES;
type PendingNavigation = { run: () => void; view: GuardedView };

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
      // A running quiz has nothing to keep, so going back would lose its answers without a word.
      if (source === "browser" && draftGuards.current.kartenstapel?.leave) {
        setPendingNavigation({ view: "kartenstapel", run: () => navigation.navigateToRoute(route) });
        return true;
      }
      return false;
    },
  });
  const { activeView, navigateToView: navigateToViewNow } = navigation;

  const navigateToView = React.useCallback((...args: Parameters<typeof navigateToViewNow>) => {
    const view = activeView in GUARD_SOURCES ? activeView as GuardedView : null;
    const guard = view ? draftGuards.current[view] : undefined;
    if (!view || !guard) return navigateToViewNow(...args);
    if (guard.saving) guard.focus?.();
    else setPendingNavigation({ view, run: () => { navigateToViewNow(...args); } });
    return createViewRoute(activeView);
  }, [activeView, navigateToViewNow]);

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
    setDraftGuard("kartenstapel", guard ? { saving: false, focus: guard.focus, ..."save" in guard ? { save: guard.save } : { leave: guard.leave } } : null);
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
    navigateToViewNow,
    leaveCardDraft,
    handleCreationDraftStateChange,
    handleExamDraftStateChange,
    handleCardDraftStateChange,
    pendingNavigation: pendingNavigation ? GUARD_SOURCES[pendingNavigation.view] : null,
    pendingLeave: pendingNavigation ? draftGuards.current[pendingNavigation.view]?.leave ?? null : null,
    savingPendingNavigation,
    cancelPendingNavigation: () => setPendingNavigation(null),
    discardPendingNavigation: runPendingNavigation,
    confirmPendingNavigation,
    focusPendingDraft,
  };
}
