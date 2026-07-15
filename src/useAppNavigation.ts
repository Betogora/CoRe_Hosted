import React from "react";
import type { AuthPhase } from "./accountSession.ts";
import { shouldShowAppShell } from "./accountSession.ts";
import type { AppRoute, StudyRoute, ViewRoute } from "./appNavigation.ts";
import {
  appRouteToUrl,
  areAppRoutesEqual,
  createAppHistoryState,
  createViewRoute,
  normalizeAppRoute,
  parseAppRouteFromUrl,
  readAppRouteFromHistoryState,
} from "./appNavigation.ts";
import type { Deck } from "./coreTypes.ts";

export type CreationMethod = "manual" | "import" | "ai" | "";

export interface AppNavigationProjection {
  activeView: string;
  studyRequest: StudyRoute | null;
  focusedDeckId: string | null;
  deckCreationParentId: string;
  creationMethod: CreationMethod;
  completedDeckId: string;
}

interface BrowserHistoryTarget {
  location: Location;
  history: History;
  addEventListener(type: "popstate", listener: (event: PopStateEvent) => void): void;
  removeEventListener(type: "popstate", listener: (event: PopStateEvent) => void): void;
}

const focusedDeckViewIds = new Set(["kartenstapel", "stapel-einstellungen"]);

function asCreationMethod(value: string | undefined): CreationMethod {
  return value === "manual" || value === "import" || value === "ai" ? value : "";
}

export function projectAppRoute(route: AppRoute): AppNavigationProjection {
  const viewRoute = route.mode === "study"
    ? route.returnRoute ?? createViewRoute("lernen")
    : route;
  return {
    activeView: viewRoute.viewId,
    studyRequest: route.mode === "study" ? route : null,
    focusedDeckId: focusedDeckViewIds.has(viewRoute.viewId) ? (viewRoute.focusedDeckId ?? null) : null,
    deckCreationParentId: viewRoute.viewId === "lernen" ? (viewRoute.deckCreationParentId ?? "") : "",
    creationMethod: viewRoute.viewId === "neue-karten" ? asCreationMethod(viewRoute.creationMethod) : "",
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
  decks: Deck[];
  defaultViewId: string;
}

export function useAppNavigation({ authPhase, decks, defaultViewId }: UseAppNavigationOptions) {
  const validDeckIds = React.useMemo(() => decks.map((deck) => deck.id), [decks]);
  const historyInitializedRef = React.useRef(false);
  const currentRouteRef = React.useRef<AppRoute>(createViewRoute(defaultViewId));
  const [projection, setProjection] = React.useState<AppNavigationProjection>(() => projectAppRoute(currentRouteRef.current));

  const applyRoute = React.useCallback((route: unknown) => {
    const normalized = normalizeAppRoute(route, { validDeckIds });
    currentRouteRef.current = normalized;
    setProjection(projectAppRoute(normalized));
    return normalized;
  }, [validDeckIds]);

  const writeBrowserRoute = React.useCallback((route: unknown, { replace = false, apply = true }: { replace?: boolean; apply?: boolean } = {}) => {
    const normalized = normalizeAppRoute(route, { validDeckIds });
    const url = appRouteToUrl(normalized, { validDeckIds });
    const historyState = createAppHistoryState(normalized, { validDeckIds, currentState: window.history.state });
    if (replace) window.history.replaceState(historyState, "", url);
    else window.history.pushState(historyState, "", url);
    currentRouteRef.current = normalized;
    if (apply) setProjection(projectAppRoute(normalized));
    return normalized;
  }, [validDeckIds]);

  const navigateToRoute = React.useCallback((route: unknown, { replace = false }: { replace?: boolean } = {}) => {
    const normalized = normalizeAppRoute(route, { validDeckIds });
    const nextUrl = appRouteToUrl(normalized, { validDeckIds });
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (!replace && currentUrl === nextUrl && areAppRoutesEqual(currentRouteRef.current, normalized, { validDeckIds })) {
      return applyRoute(normalized);
    }
    return writeBrowserRoute(normalized, { replace });
  }, [applyRoute, validDeckIds, writeBrowserRoute]);

  const navigateToView = React.useCallback((viewId: string | undefined, fields: Parameters<typeof createViewRoute>[1] = {}, options: { replace?: boolean } = {}) => (
    navigateToRoute(createViewRoute(viewId, fields, { validDeckIds }), options)
  ), [navigateToRoute, validDeckIds]);

  const getStudyReturnRoute = React.useCallback((): ViewRoute => {
    const currentRoute = currentRouteRef.current;
    return currentRoute.mode === "view" ? currentRoute : currentRoute.returnRoute ?? createViewRoute("lernen");
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
    const normalized = normalizeAppRoute(parseAppRouteFromUrl(window.location.href, { validDeckIds }), { validDeckIds });
    historyInitializedRef.current = true;
    writeBrowserRoute(normalized, { replace: true });
  }, [authPhase, validDeckIds, writeBrowserRoute]);

  React.useEffect(() => {
    if (!shouldShowAppShell(authPhase)) return undefined;
    return subscribeToBrowserNavigation(window, (historyState, url) => {
      const route = readAppRouteFromHistoryState(historyState, { validDeckIds })
        ?? parseAppRouteFromUrl(url, { validDeckIds });
      applyRoute(route);
    });
  }, [applyRoute, authPhase, validDeckIds]);

  return {
    ...projection,
    validDeckIds,
    navigateToRoute,
    navigateToView,
    getStudyReturnRoute,
    resetBrowserRouteToDefault,
    setFocusedDeckId: (focusedDeckId: string | null) => setProjection((current) => ({ ...current, focusedDeckId })),
    setDeckCreationParentId: (deckCreationParentId: string) => setProjection((current) => ({ ...current, deckCreationParentId })),
  };
}
