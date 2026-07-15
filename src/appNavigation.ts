import { createMenuModel } from "./menuModel.ts";
import { productSurfaces, type ProductSurfaceRegistry } from "./productSurfaces.ts";

export const APP_HISTORY_STATE_KEY = "coreAppRoute";

const menu = createMenuModel();
const defaultViewId = menu.defaultViewId;
const studyFallbackViewId = "lernen";
const extraRoutableViewIds = ["stapel-einstellungen"];

export interface ViewRoute {
  mode: "view";
  viewId: string;
  focusedDeckId?: string;
  deckCreationParentId?: string;
}

export interface StudyRoute {
  mode: "study";
  deckId: string;
  variantSession: boolean;
  returnRoute: ViewRoute;
}

export type AppRoute = ViewRoute | StudyRoute;

interface RouteOptions {
  validDeckIds?: Iterable<string> | null;
  currentState?: unknown;
  surfaceRegistry?: ProductSurfaceRegistry;
}

interface ViewRouteInput {
  mode?: unknown;
  viewId?: unknown;
  focusedDeckId?: unknown;
  deckCreationParentId?: unknown;
}
type StudyRouteInput = Partial<Omit<StudyRoute, "mode" | "returnRoute">> & {
  mode?: unknown;
  returnRoute?: ViewRouteInput;
};
type AppRouteInput = ViewRouteInput | StudyRouteInput | null | undefined;

function deckIdSetFrom(validDeckIds: Iterable<string> | null | undefined): Set<string> | null {
  if (!validDeckIds) return null;
  if (validDeckIds instanceof Set) return validDeckIds;
  return new Set(validDeckIds);
}

function cleanDeckId(value: unknown, validDeckIds: Set<string> | null): string {
  const deckId = String(value ?? "").trim();
  if (!deckId || (validDeckIds && !validDeckIds.has(deckId))) return "";
  return deckId;
}

function normalizeViewRoute(
  route: ViewRouteInput = {},
  validDeckIds: Set<string> | null = null,
  surfaceRegistry: ProductSurfaceRegistry = productSurfaces,
): ViewRoute {
  const routableViewIds = new Set([...createMenuModel(surfaceRegistry).listRoutableViewIds(), ...extraRoutableViewIds]);
  const rawViewId = String(route.viewId ?? defaultViewId);
  const viewId = routableViewIds.has(rawViewId) ? rawViewId : defaultViewId;
  const focusedDeckId = cleanDeckId(route.focusedDeckId, validDeckIds);
  const deckCreationParentId = cleanDeckId(route.deckCreationParentId, validDeckIds);
  return {
    mode: "view",
    viewId,
    ...(focusedDeckId ? { focusedDeckId } : {}),
    ...(deckCreationParentId ? { deckCreationParentId } : {}),
  };
}

export function createViewRoute(viewId = defaultViewId, fields: Omit<ViewRouteInput, "viewId"> = {}, options: RouteOptions = {}): ViewRoute {
  return normalizeViewRoute({ ...fields, mode: "view", viewId }, deckIdSetFrom(options.validDeckIds), options.surfaceRegistry);
}

export function normalizeAppRoute(route: unknown = {}, options: RouteOptions = {}): AppRoute {
  const validDeckIds = deckIdSetFrom(options.validDeckIds);
  const routeInput = route && typeof route === "object" ? route as AppRouteInput : {};
  if (routeInput?.mode === "study") {
    const studyRoute = routeInput as StudyRouteInput;
    const deckId = cleanDeckId(studyRoute.deckId, validDeckIds);
    if (!deckId) return normalizeViewRoute({ viewId: studyFallbackViewId }, validDeckIds, options.surfaceRegistry);
    return {
      mode: "study",
      deckId,
      variantSession: studyRoute.variantSession === true,
      returnRoute: normalizeViewRoute(studyRoute.returnRoute ?? { viewId: studyFallbackViewId }, validDeckIds, options.surfaceRegistry),
    };
  }
  return normalizeViewRoute(routeInput ?? {}, validDeckIds, options.surfaceRegistry);
}

export function createStudyRoute(deckId: string, fields: Omit<StudyRouteInput, "deckId"> = {}, options: RouteOptions = {}): AppRoute {
  return normalizeAppRoute({ ...fields, mode: "study", deckId }, options);
}

function createUrl(input: string | URL): URL {
  if (typeof input === "string") return new URL(input, "http://core.local");
  return new URL(`${input.pathname}${input.search}${input.hash}`, "http://core.local");
}

function decodePathSegment(segment: string): string {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

export function parseAppRouteFromUrl(input: string | URL = "/", options: RouteOptions = {}): AppRoute {
  const url = createUrl(input);
  const pathSegments = url.pathname.split("/").filter(Boolean).map(decodePathSegment);
  if (pathSegments.length === 0) return createViewRoute(defaultViewId, {}, options);
  if (pathSegments.length === 3 && pathSegments[0] === "decks" && pathSegments[2] === "review") {
    return normalizeAppRoute({
      mode: "study",
      deckId: pathSegments[1],
      variantSession: url.searchParams.get("variant") === "1",
      returnRoute: { viewId: studyFallbackViewId },
    }, options);
  }
  return normalizeAppRoute({
    mode: "view",
    viewId: pathSegments[0],
    focusedDeckId: url.searchParams.get("deck") ?? undefined,
    deckCreationParentId: url.searchParams.get("parent") ?? undefined,
  }, options);
}

export function appRouteToUrl(route: unknown, options: RouteOptions = {}): string {
  const normalized = normalizeAppRoute(route, options);
  if (normalized.mode === "study") {
    const search = normalized.variantSession ? "?variant=1" : "";
    return `/decks/${encodeURIComponent(normalized.deckId)}/review${search}`;
  }
  const path = normalized.viewId === defaultViewId ? "/" : `/${encodeURIComponent(normalized.viewId)}`;
  const params = new URLSearchParams();
  if (["kartenstapel", "stapel-einstellungen"].includes(normalized.viewId) && normalized.focusedDeckId) params.set("deck", normalized.focusedDeckId);
  if (normalized.viewId === "lernen" && normalized.deckCreationParentId) params.set("parent", normalized.deckCreationParentId);
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}`;
}

export function createAppHistoryState(route: unknown, options: RouteOptions = {}): Record<string, unknown> {
  const currentState = options.currentState && typeof options.currentState === "object" ? options.currentState : {};
  return { ...currentState, [APP_HISTORY_STATE_KEY]: normalizeAppRoute(route, options) };
}

export function readAppRouteFromHistoryState(historyState: unknown, options: RouteOptions = {}): AppRoute | null {
  if (!historyState || typeof historyState !== "object") return null;
  const route = (historyState as Record<string, unknown>)[APP_HISTORY_STATE_KEY];
  return route ? normalizeAppRoute(route, options) : null;
}

export function areAppRoutesEqual(left: unknown, right: unknown, options: RouteOptions = {}): boolean {
  return JSON.stringify(normalizeAppRoute(left, options)) === JSON.stringify(normalizeAppRoute(right, options));
}
