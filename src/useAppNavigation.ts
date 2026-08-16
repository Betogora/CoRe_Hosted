import React from "react";
import type { AuthPhase } from "./accountSession.ts";
import { shouldShowAppShell } from "./accountSession.ts";
import type { AppRoute, AppViewId, ReviewResumeContext, SettingsReturnContext, SettingsTarget, StudyRoute, ViewRoute } from "./appNavigation.ts";
import {
  appRouteToUrl,
  areAppRoutesEqual,
  createAppHistoryState,
  createViewRoute,
  normalizeAppRoute,
  parseAppRouteFromUrl,
} from "./appNavigation.ts";

export type CreationMethod = "manual" | "import" | "";

export interface AppNavigationProjection {
  activeView: AppViewId;
  studyRequest: StudyRoute | null;
  focusedDeckId: string | null;
  selectedCardId: string | null;
  deckCreationParentId: string;
  creationMethod: CreationMethod;
  creationDeckId: string;
  completedDeckId: string;
  completedCount: number;
  completionKind: "import" | "manual" | "";
  settingsTarget: SettingsTarget | null;
  settingsReturnContext: SettingsReturnContext | null;
  cardEditorReturnContext: ReviewResumeContext | null;
}

interface BrowserHistoryTarget {
  location: Location;
  history: History;
  addEventListener(type: "popstate", listener: (event: PopStateEvent) => void): void;
  removeEventListener(type: "popstate", listener: (event: PopStateEvent) => void): void;
}

const focusedDeckViewIds = new Set<AppViewId>(["lernen", "kartenstapel", "stapel-einstellungen"]);

function asCreationMethod(value: string | undefined): CreationMethod {
  return value === "manual" || value === "import" ? value : "";
}

export function projectAppRoute(route: AppRoute): AppNavigationProjection {
  const viewRoute = route.mode === "study"
    ? route.returnContext.view === "today"
      ? createViewRoute("uebersicht")
      : route.returnContext.view === "decks"
        ? createViewRoute("kartenstapel", {
            focusedDeckId: route.returnContext.deckId,
            selectedCardId: route.returnContext.cardId,
          })
        : createViewRoute("lernen", { focusedDeckId: route.returnContext.deckId })
    : route;
  return {
    activeView: viewRoute.viewId,
    studyRequest: route.mode === "study" ? route : null,
    focusedDeckId: focusedDeckViewIds.has(viewRoute.viewId) ? (viewRoute.focusedDeckId ?? null) : null,
    selectedCardId: viewRoute.viewId === "kartenstapel" ? (viewRoute.selectedCardId ?? null) : null,
    deckCreationParentId: viewRoute.viewId === "lernen" ? (viewRoute.deckCreationParentId ?? "") : "",
    creationMethod: viewRoute.viewId === "neue-karten" ? asCreationMethod(viewRoute.creationMethod) : "",
    creationDeckId: viewRoute.viewId === "neue-karten" ? (viewRoute.creationDeckId ?? "") : "",
    completedDeckId: viewRoute.viewId === "neue-karten" ? (viewRoute.completedDeckId ?? "") : "",
    completedCount: viewRoute.viewId === "neue-karten" ? (viewRoute.completedCount ?? 0) : 0,
    completionKind: viewRoute.viewId === "neue-karten" ? (viewRoute.completionKind ?? "") : "",
    settingsTarget: viewRoute.viewId === "stapel-einstellungen" ? (viewRoute.settingsTarget ?? null) : null,
    settingsReturnContext: viewRoute.viewId === "stapel-einstellungen" ? (viewRoute.settingsReturnContext ?? null) : null,
    cardEditorReturnContext: viewRoute.viewId === "kartenstapel" ? (viewRoute.cardEditorReturnContext ?? null) : null,
  };
}

export function subscribeToBrowserNavigation(
  target: BrowserHistoryTarget,
  onPopState: (historyState: unknown, url: string) => void,
): () => void {
  const handlePopState = (event: PopStateEvent) => onPopState(event.state, target.location.href);
  target.addEventListener("popstate", handlePopState);
  return () => target.removeEventListener("popstate", handlePopState);
}

export interface AppNavigationRequest {
  currentRoute: AppRoute;
  nextRoute: AppRoute;
  source: "app" | "browser";
  proceed: () => void;
}

interface UseAppNavigationOptions {
  authPhase: AuthPhase;
  defaultViewId: AppViewId;
  onBeforeNavigation?: (request: AppNavigationRequest) => boolean;
}

export function useAppNavigation({ authPhase, defaultViewId, onBeforeNavigation }: UseAppNavigationOptions) {
  const historyInitializedRef = React.useRef(false);
  const currentRouteRef = React.useRef<AppRoute>(createViewRoute(defaultViewId));
  const onBeforeNavigationRef = React.useRef(onBeforeNavigation);
  const [projection, setProjection] = React.useState<AppNavigationProjection>(() => projectAppRoute(currentRouteRef.current));
  onBeforeNavigationRef.current = onBeforeNavigation;

  const applyRoute = React.useCallback((route: unknown) => {
    const normalized = normalizeAppRoute(route);
    currentRouteRef.current = normalized;
    setProjection(projectAppRoute(normalized));
    return normalized;
  }, []);

  const writeBrowserRoute = React.useCallback((route: unknown, { replace = false, apply = true, preserveHash = false }: { replace?: boolean; apply?: boolean; preserveHash?: boolean } = {}) => {
    const normalized = normalizeAppRoute(route);
    const url = `${appRouteToUrl(normalized)}${preserveHash ? window.location.hash : ""}`;
    const historyState = createAppHistoryState(normalized, { currentState: window.history.state });
    if (replace) window.history.replaceState(historyState, "", url);
    else window.history.pushState(historyState, "", url);
    currentRouteRef.current = normalized;
    if (apply) setProjection(projectAppRoute(normalized));
    return normalized;
  }, []);

  const navigateToRoute = React.useCallback((route: unknown, { replace = false }: { replace?: boolean } = {}) => {
    const normalized = normalizeAppRoute(route);
    const nextUrl = appRouteToUrl(normalized);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (!replace && currentUrl === nextUrl) {
      return areAppRoutesEqual(currentRouteRef.current, normalized)
        ? applyRoute(normalized)
        : writeBrowserRoute(normalized, { replace: true });
    }
    const currentRoute = currentRouteRef.current;
    if (!areAppRoutesEqual(currentRoute, normalized) && onBeforeNavigationRef.current?.({
      currentRoute,
      nextRoute: normalized,
      source: "app",
      proceed: () => { writeBrowserRoute(normalized, { replace }); },
    })) return currentRoute;
    return writeBrowserRoute(normalized, { replace });
  }, [applyRoute, writeBrowserRoute]);

  const navigateToView = React.useCallback((viewId: AppViewId | undefined, fields: Parameters<typeof createViewRoute>[1] = {}, options: { replace?: boolean } = {}) => (
    navigateToRoute(createViewRoute(viewId, fields), options)
  ), [navigateToRoute]);

  const getStudyReturnRoute = React.useCallback((): ViewRoute => {
    const currentRoute = currentRouteRef.current;
    if (currentRoute.mode === "view") return currentRoute;
    if (currentRoute.returnContext.view === "today") return createViewRoute("uebersicht");
    if (currentRoute.returnContext.view === "decks") {
      return createViewRoute("kartenstapel", {
        focusedDeckId: currentRoute.returnContext.deckId,
        selectedCardId: currentRoute.returnContext.cardId,
      });
    }
    return createViewRoute("lernen", { focusedDeckId: currentRoute.returnContext.deckId });
  }, []);

  const resetBrowserRouteToDefault = React.useCallback(() => {
    historyInitializedRef.current = false;
    writeBrowserRoute(createViewRoute(defaultViewId), { replace: true, apply: false });
    setProjection(projectAppRoute(createViewRoute(defaultViewId)));
  }, [defaultViewId, writeBrowserRoute]);

  React.useEffect(() => {
    if (!shouldShowAppShell(authPhase)) {
      historyInitializedRef.current = false;
      return;
    }
    if (historyInitializedRef.current) return;
    const normalized = normalizeAppRoute(parseAppRouteFromUrl(window.location.href));
    historyInitializedRef.current = true;
    writeBrowserRoute(normalized, { replace: true, preserveHash: true });
  }, [authPhase, writeBrowserRoute]);

  React.useEffect(() => {
    if (!shouldShowAppShell(authPhase)) return undefined;
    return subscribeToBrowserNavigation(window, (_historyState, url) => {
      const nextRoute = parseAppRouteFromUrl(url);
      const currentRoute = currentRouteRef.current;
      if (areAppRoutesEqual(currentRoute, nextRoute)) {
        applyRoute(nextRoute);
        return;
      }
      if (onBeforeNavigationRef.current?.({
        currentRoute,
        nextRoute,
        source: "browser",
        proceed: () => { writeBrowserRoute(nextRoute, { replace: true }); },
      })) {
        writeBrowserRoute(currentRoute, { replace: true, preserveHash: true });
        return;
      }
      applyRoute(nextRoute);
    });
  }, [applyRoute, authPhase, writeBrowserRoute]);

  return {
    ...projection,
    navigateToRoute,
    navigateToView,
    getStudyReturnRoute,
    resetBrowserRouteToDefault,
  };
}
