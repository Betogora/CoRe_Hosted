import React from "react";
import type { AuthPhase } from "./accountSession.ts";
import { shouldShowAppShell } from "./accountSession.ts";
import type { AppRoute, AppViewId, StudyRoute, ViewRoute } from "./appNavigation.ts";
import {
  appRouteToUrl,
  areAppRoutesEqual,
  createAppHistoryState,
  createViewRoute,
  normalizeAppRoute,
  parseAppRouteFromUrl,
} from "./appNavigation.ts";

export type CreationMethod = "manual" | "import" | "ai" | "";

export interface AppNavigationProjection {
  activeView: AppViewId;
  studyRequest: StudyRoute | null;
  focusedDeckId: string | null;
  selectedCardId: string | null;
  deckCreationParentId: string;
  creationMethod: CreationMethod;
  creationDeckId: string;
  completedDeckId: string;
}

interface BrowserHistoryTarget {
  location: Location;
  history: History;
  addEventListener(type: "popstate", listener: (event: PopStateEvent) => void): void;
  removeEventListener(type: "popstate", listener: (event: PopStateEvent) => void): void;
}

const focusedDeckViewIds = new Set<AppViewId>(["lernen", "kartenstapel", "stapel-einstellungen"]);

function asCreationMethod(value: string | undefined): CreationMethod {
  return value === "manual" || value === "import" || value === "ai" ? value : "";
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

interface UseAppNavigationOptions {
  authPhase: AuthPhase;
  defaultViewId: AppViewId;
}

export function useAppNavigation({ authPhase, defaultViewId }: UseAppNavigationOptions) {
  const historyInitializedRef = React.useRef(false);
  const currentRouteRef = React.useRef<AppRoute>(createViewRoute(defaultViewId));
  const [projection, setProjection] = React.useState<AppNavigationProjection>(() => projectAppRoute(currentRouteRef.current));

  const applyRoute = React.useCallback((route: unknown) => {
    const normalized = normalizeAppRoute(route);
    currentRouteRef.current = normalized;
    setProjection(projectAppRoute(normalized));
    return normalized;
  }, []);

  const writeBrowserRoute = React.useCallback((route: unknown, { replace = false, apply = true }: { replace?: boolean; apply?: boolean } = {}) => {
    const normalized = normalizeAppRoute(route);
    const url = appRouteToUrl(normalized);
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
    if (!replace && currentUrl === nextUrl && areAppRoutesEqual(currentRouteRef.current, normalized)) {
      return applyRoute(normalized);
    }
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
    writeBrowserRoute(normalized, { replace: true });
  }, [authPhase, writeBrowserRoute]);

  React.useEffect(() => {
    if (!shouldShowAppShell(authPhase)) return undefined;
    return subscribeToBrowserNavigation(window, (_historyState, url) => {
      applyRoute(parseAppRouteFromUrl(url));
    });
  }, [applyRoute, authPhase]);

  return {
    ...projection,
    navigateToRoute,
    navigateToView,
    getStudyReturnRoute,
    resetBrowserRouteToDefault,
  };
}
