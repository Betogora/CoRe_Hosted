import React from "react";
import { createStudyRoute, createViewRoute, settingsSectionGroup, type AppRoute, type DeckSettingsOverlay, type DeckSettingsSection, type SettingsSection } from "./appNavigation.ts";
import type { SettingsDraftGuard, SettingsSaveScope } from "./appScreenProps.ts";
import type { useNavigationGuard } from "./useNavigationGuard.ts";

type SettingsOverlay = { settingsSection?: SettingsSection; deckSettings?: DeckSettingsOverlay };
type SettingsNavigation = Pick<ReturnType<typeof useNavigationGuard>, "settingsSection" | "deckSettings" | "navigateToRoute" | "getCurrentRoute" | "leaveCardDraft">;

/** Identifies the open settings dialog and its draft: the general or learning group, or one deck. */
function settingsOverlayKey(route: SettingsOverlay): string | null {
  if (route.deckSettings) return `deck:${route.deckSettings.deckId}`;
  return route.settingsSection ? `settings:${settingsSectionGroup(route.settingsSection)}` : null;
}

function withSettingsOverlay(route: AppRoute, overlay: SettingsOverlay): AppRoute {
  if (route.mode === "study") return createStudyRoute(route.deckId, { returnContext: route.returnContext, deckSettings: overlay.deckSettings });
  // The deck whose settings are open becomes the focus of the deck lists underneath and stays it after closing.
  const focusedDeckId = !route.deckContent && (route.viewId === "lernen" || route.viewId === "kartenstapel") ? overlay.deckSettings?.deckId : undefined;
  return createViewRoute(route.viewId, {
    ...route,
    ...(focusedDeckId ? { focusedDeckId } : {}),
    settingsSection: overlay.settingsSection,
    deckSettings: overlay.deckSettings,
  });
}

/**
 * The general, learning and deck settings dialogs over the current view or session, with their history entries and the
 * guard of an open settings draft: it holds back every navigation outside its dialog until saved or discarded.
 */
export function useSettingsOverlay({ settingsSection, deckSettings, navigateToRoute, getCurrentRoute, leaveCardDraft }: SettingsNavigation) {
  const settingsDraftGuardRef = React.useRef<SettingsDraftGuard | null>(null);
  const settingsOverlayKeyRef = React.useRef<string | null>(null);
  const settingsHistoryPushedRef = React.useRef(false);
  const [settingsDraftOpen, setSettingsDraftOpen] = React.useState(false);
  const [settingsNavigationBlocked, setSettingsNavigationBlocked] = React.useState(false);
  const [savingSettingsDraft, setSavingSettingsDraft] = React.useState<SettingsSaveScope | "global" | null>(null);
  const [settingsSaveFailed, setSettingsSaveFailed] = React.useState(false);

  const settingsOverlay = settingsOverlayKey({ settingsSection: settingsSection ?? undefined, deckSettings: deckSettings ?? undefined });
  settingsOverlayKeyRef.current = settingsOverlay;
  React.useEffect(() => {
    if (!settingsOverlay) settingsHistoryPushedRef.current = false;
  }, [settingsOverlay]);

  /** With a settings draft open only a change within its dialog passes; undefined while no draft is open. */
  const blocksNavigation = React.useCallback((route: AppRoute) => {
    if (!settingsDraftGuardRef.current) return undefined;
    const openOverlay = settingsOverlayKeyRef.current;
    if (openOverlay && settingsOverlayKey(route) === openOverlay) {
      setSettingsNavigationBlocked(false);
      return false;
    }
    setSettingsNavigationBlocked(true);
    return true;
  }, []);

  /** Settings dialogs lie over the current view or session; from the card editor they first leave the card. Switching between them replaces the entry. */
  const openSettingsOverlay = React.useCallback((overlay: SettingsOverlay) => {
    const current = getCurrentRoute();
    const replace = Boolean(settingsOverlayKey(current));
    const base = current.mode === "view" ? createViewRoute(current.viewId, { ...current, selectedCardId: undefined, cardEditorReturnContext: undefined }) : current;
    const open = () => {
      const opened = navigateToRoute(withSettingsOverlay(base, overlay), { replace });
      if (!replace && settingsOverlayKey(opened)) settingsHistoryPushedRef.current = true;
    };
    if (current.mode === "view" && current.selectedCardId) leaveCardDraft(open);
    else open();
  }, [getCurrentRoute, leaveCardDraft, navigateToRoute]);

  const openSettings = React.useCallback((section: SettingsSection) => openSettingsOverlay({ settingsSection: section }), [openSettingsOverlay]);
  const openDeckSettings = React.useCallback((deckId: string, section: DeckSettingsSection = "start") => openSettingsOverlay({ deckSettings: { deckId, section } }), [openSettingsOverlay]);

  const selectSettingsOverlay = React.useCallback((overlay: SettingsOverlay) => {
    navigateToRoute(withSettingsOverlay(getCurrentRoute(), overlay), { replace: true });
  }, [getCurrentRoute, navigateToRoute]);

  const closeSettings = React.useCallback(() => {
    if (settingsDraftGuardRef.current) {
      setSettingsNavigationBlocked(true);
      return;
    }
    const current = getCurrentRoute();
    // Closing a deck dialog keeps that deck as focus, so it replaces the entry instead of going back.
    if (settingsHistoryPushedRef.current && !current.deckSettings) {
      settingsHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    navigateToRoute(withSettingsOverlay(current, {}), { replace: true });
  }, [getCurrentRoute, navigateToRoute]);

  const handleSettingsDraftStateChange = React.useCallback((guard: SettingsDraftGuard | null) => {
    settingsDraftGuardRef.current = guard;
    setSettingsDraftOpen(Boolean(guard));
    if (!guard) {
      setSettingsNavigationBlocked(false);
      setSettingsSaveFailed(false);
    }
  }, []);

  /** Runs an action that leaves the dialog only while no settings draft is open. */
  const requestSettingsContextAction = React.useCallback(<T>(action: () => T): T | undefined => {
    if (settingsDraftGuardRef.current) {
      setSettingsNavigationBlocked(true);
      return undefined;
    }
    return action();
  }, []);

  async function saveSettingsDraft(scope?: SettingsSaveScope) {
    const guard = settingsDraftGuardRef.current;
    if (!guard) return;
    setSavingSettingsDraft(scope ?? "global");
    setSettingsSaveFailed(false);
    try {
      const outcome = await guard.save(scope).catch(() => "failed" as const);
      if (outcome !== "saved") {
        setSettingsSaveFailed(outcome === "failed");
        return;
      }
      settingsDraftGuardRef.current = null;
      setSettingsDraftOpen(false);
      setSettingsNavigationBlocked(false);
    } finally {
      setSavingSettingsDraft(null);
    }
  }

  function discardSettingsDraft() {
    const guard = settingsDraftGuardRef.current;
    if (!guard || savingSettingsDraft !== null) return;
    guard.discard();
    settingsDraftGuardRef.current = null;
    setSettingsSaveFailed(false);
    setSettingsDraftOpen(false);
    setSettingsNavigationBlocked(false);
  }

  React.useEffect(() => {
    if (!settingsDraftOpen) return undefined;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [settingsDraftOpen]);

  return {
    blocksNavigation,
    openSettings,
    openDeckSettings,
    selectSettingsOverlay,
    closeSettings,
    handleSettingsDraftStateChange,
    requestSettingsContextAction,
    settingsDraftOpen,
    /** State and actions of the save bar shown while a settings draft is open. */
    saveBar: {
      savingScope: savingSettingsDraft,
      navigationBlocked: settingsNavigationBlocked,
      failed: settingsSaveFailed,
      onSave: (scope?: SettingsSaveScope) => { void saveSettingsDraft(scope); },
      onDiscard: discardSettingsDraft,
    },
  };
}
