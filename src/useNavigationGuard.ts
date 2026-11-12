import React from "react";
import { createViewRoute, type AppRoute } from "./appNavigation.ts";
import type { CardDraftGuard } from "./appScreenProps.ts";
import { useAppNavigation } from "./useAppNavigation.ts";

type PendingNavigation = { run: () => void; source: "creation" | "card" | "exams" };

interface NavigationGuardOptions extends Omit<Parameters<typeof useAppNavigation>[0], "onBeforeNavigation"> {
  /** Decides first while a settings draft is open; undefined lets the other drafts decide. */
  settingsBlocksNavigation: (route: AppRoute) => boolean | undefined;
}

/**
 * App navigation guarded by the open drafts: an unsaved creation, exam planning or card draft asks before it is left,
 * and the asked navigation runs only after saving or discarding. `navigateToViewNow` skips the question.
 */
export function useNavigationGuard({ settingsBlocksNavigation, ...options }: NavigationGuardOptions) {
  const creationDraftDirtyRef = React.useRef(false);
  const examDraftDirtyRef = React.useRef(false);
  const creationSavingRef = React.useRef(false);
  const creationDraftFocusRef = React.useRef<(() => void) | null>(null);
  const cardDraftGuardRef = React.useRef<CardDraftGuard | null>(null);
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingNavigation | null>(null);
  const [savingPendingNavigation, setSavingPendingNavigation] = React.useState(false);

  const navigation = useAppNavigation({
    ...options,
    onBeforeNavigation(route, source) {
      const settingsDecision = settingsBlocksNavigation(route);
      if (settingsDecision !== undefined) return settingsDecision;
      if (source === "browser" && creationSavingRef.current) {
        creationDraftFocusRef.current?.();
        return true;
      }
      if (source === "browser" && creationDraftDirtyRef.current) {
        setPendingNavigation({ source: "creation", run: () => navigation.navigateToRoute(route) });
        return true;
      }
      return false;
    },
  });
  const { activeView, navigateToView: navigateToViewNow } = navigation;

  const navigateToView = React.useCallback((...args: Parameters<typeof navigateToViewNow>) => {
    if (activeView === "neue-karten" && creationSavingRef.current) {
      creationDraftFocusRef.current?.();
      return createViewRoute(activeView);
    }
    if (activeView === "neue-karten" && creationDraftDirtyRef.current) {
      setPendingNavigation({ source: "creation", run: () => { navigateToViewNow(...args); } });
      return createViewRoute(activeView);
    }
    if (activeView === "kartenstapel" && cardDraftGuardRef.current) {
      setPendingNavigation({ source: "card", run: () => { navigateToViewNow(...args); } });
      return createViewRoute(activeView);
    }
    if (activeView === "pruefungen" && examDraftDirtyRef.current) {
      setPendingNavigation({ source: "exams", run: () => { navigateToViewNow(...args); } });
      return createViewRoute(activeView);
    }
    return navigateToViewNow(...args);
  }, [activeView, navigateToViewNow]);

  /** Runs `leave` at once, or after the open card draft was saved or discarded. */
  const leaveCardDraft = React.useCallback((leave: () => void) => {
    if (cardDraftGuardRef.current) setPendingNavigation({ source: "card", run: leave });
    else leave();
  }, []);

  const handleCreationDraftStateChange = React.useCallback((dirty: boolean, focusDraft: (() => void) | null, saving: boolean) => {
    creationDraftDirtyRef.current = dirty;
    creationDraftFocusRef.current = focusDraft;
    creationSavingRef.current = saving;
  }, []);

  const handleExamDraftStateChange = React.useCallback((dirty: boolean) => {
    examDraftDirtyRef.current = dirty;
  }, []);

  const handleCardDraftStateChange = React.useCallback((guard: CardDraftGuard | null) => {
    cardDraftGuardRef.current = guard;
  }, []);

  const pendingCardNavigation = pendingNavigation?.source === "card";

  function runPendingNavigation() {
    const pending = pendingNavigation;
    setPendingNavigation(null);
    pending?.run();
  }

  async function confirmPendingNavigation() {
    if (!pendingCardNavigation) {
      creationDraftDirtyRef.current = false;
      examDraftDirtyRef.current = false;
      runPendingNavigation();
      return;
    }
    setSavingPendingNavigation(true);
    try {
      if (await cardDraftGuardRef.current?.save()) runPendingNavigation();
    } finally {
      setSavingPendingNavigation(false);
    }
  }

  /** Back to the draft that asked, when its question was cancelled. */
  function focusPendingDraft() {
    if (pendingCardNavigation) cardDraftGuardRef.current?.focus();
    else creationDraftFocusRef.current?.();
  }

  return {
    ...navigation,
    navigateToView,
    navigateToViewNow,
    leaveCardDraft,
    handleCreationDraftStateChange,
    handleExamDraftStateChange,
    handleCardDraftStateChange,
    pendingNavigation: pendingNavigation?.source ?? null,
    savingPendingNavigation,
    cancelPendingNavigation: () => setPendingNavigation(null),
    discardPendingNavigation: runPendingNavigation,
    confirmPendingNavigation,
    focusPendingDraft,
  };
}
