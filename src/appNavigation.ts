import { createMenuModel, type MenuViewId } from "./menuModel.ts";
import { productSurfaces, type ProductSurfaceRegistry } from "./productSurfaces.ts";

export const APP_HISTORY_STATE_KEY = "coreAppRoute";

const menu = createMenuModel();
const defaultViewId = menu.defaultViewId;
const studyFallbackViewId: AppViewId = "lernen";
const extraRoutableViewIds = ["stapel-einstellungen"] as const;
const reviewReturnViews = ["today", "learn", "decks"] as const;

export type AppViewId = MenuViewId | typeof extraRoutableViewIds[number];
export type ReviewReturnView = typeof reviewReturnViews[number];

export interface ReviewReturnContext {
  view: ReviewReturnView;
  deckId?: string;
  cardId?: string;
}

export interface ViewRoute {
  mode: "view";
  viewId: AppViewId;
  focusedDeckId?: string;
  selectedCardId?: string;
  deckCreationParentId?: string;
  creationMethod?: "manual" | "import" | "ai";
  creationDeckId?: string;
  completedDeckId?: string;
}

export interface StudyRoute {
  mode: "study";
  deckId: string;
  variantSession: boolean;
  variantId?: string;
  returnContext: ReviewReturnContext;
}

export type AppRoute = ViewRoute | StudyRoute;

interface RouteOptions {
  currentState?: unknown;
  surfaceRegistry?: ProductSurfaceRegistry;
}

interface ViewRouteInput {
  mode?: unknown;
  viewId?: unknown;
  focusedDeckId?: unknown;
  selectedCardId?: unknown;
  deckCreationParentId?: unknown;
  creationMethod?: unknown;
  creationDeckId?: unknown;
  completedDeckId?: unknown;
}

interface ReviewReturnContextInput {
  view?: unknown;
  deckId?: unknown;
  cardId?: unknown;
}

type StudyRouteInput = {
  mode?: unknown;
  deckId?: unknown;
  variantSession?: unknown;
  variantId?: unknown;
  returnContext?: ReviewReturnContextInput;
  returnRoute?: ViewRouteInput;
};
type AppRouteInput = ViewRouteInput | StudyRouteInput | null | undefined;

function cleanIdentifier(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeViewId(value: unknown, surfaceRegistry: ProductSurfaceRegistry): AppViewId {
  const routableViewIds = new Set<AppViewId>([
    ...createMenuModel(surfaceRegistry).listRoutableViewIds(),
    ...extraRoutableViewIds,
  ]);
  const rawViewId = String(value ?? defaultViewId) as AppViewId;
  return routableViewIds.has(rawViewId) ? rawViewId : defaultViewId;
}

function normalizeViewRoute(
  route: ViewRouteInput = {},
  surfaceRegistry: ProductSurfaceRegistry = productSurfaces,
): ViewRoute {
  const viewId = normalizeViewId(route.viewId, surfaceRegistry);
  const focusedDeckId = cleanIdentifier(route.focusedDeckId);
  const selectedCardId = cleanIdentifier(route.selectedCardId);
  const deckCreationParentId = cleanIdentifier(route.deckCreationParentId);
  const creationMethod = ["manual", "import", "ai"].includes(String(route.creationMethod))
    ? route.creationMethod as "manual" | "import" | "ai"
    : "";
  const creationDeckId = cleanIdentifier(route.creationDeckId);
  const completedDeckId = cleanIdentifier(route.completedDeckId);

  return {
    mode: "view",
    viewId,
    ...(["lernen", "kartenstapel", "stapel-einstellungen"].includes(viewId) && focusedDeckId ? { focusedDeckId } : {}),
    ...(viewId === "kartenstapel" && focusedDeckId && selectedCardId ? { selectedCardId } : {}),
    ...(viewId === "lernen" && deckCreationParentId ? { deckCreationParentId } : {}),
    ...(viewId === "neue-karten" && creationMethod ? { creationMethod } : {}),
    ...(viewId === "neue-karten" && creationDeckId ? { creationDeckId } : {}),
    ...(viewId === "neue-karten" && completedDeckId ? { completedDeckId } : {}),
  };
}

function legacyViewRouteToReturnContext(route: ViewRouteInput | undefined, fallbackDeckId = ""): ReviewReturnContext {
  const viewId = String(route?.viewId ?? studyFallbackViewId);
  const focusedDeckId = cleanIdentifier(route?.focusedDeckId) || fallbackDeckId;
  if (viewId === "uebersicht") return { view: "today" };
  if (viewId === "kartenstapel") {
    const selectedCardId = cleanIdentifier(route?.selectedCardId);
    return {
      view: "decks",
      ...(focusedDeckId ? { deckId: focusedDeckId } : {}),
      ...(focusedDeckId && selectedCardId ? { cardId: selectedCardId } : {}),
    };
  }
  return {
    view: "learn",
    ...(focusedDeckId ? { deckId: focusedDeckId } : {}),
  };
}

function normalizeReviewReturnContext(
  context: ReviewReturnContextInput | undefined,
  fallbackDeckId = "",
): ReviewReturnContext {
  const view = reviewReturnViews.includes(String(context?.view) as ReviewReturnView)
    ? String(context?.view) as ReviewReturnView
    : "learn";
  const deckId = cleanIdentifier(context?.deckId) || (view === "learn" ? fallbackDeckId : "");
  const cardId = cleanIdentifier(context?.cardId);
  return {
    view,
    ...(view !== "today" && deckId ? { deckId } : {}),
    ...(view === "decks" && deckId && cardId ? { cardId } : {}),
  };
}

export function createReviewReturnContext(route: ViewRoute, fallbackDeckId = ""): ReviewReturnContext {
  return legacyViewRouteToReturnContext(route, fallbackDeckId);
}

export function reviewReturnContextToViewRoute(
  context: ReviewReturnContext,
  options: RouteOptions = {},
): ViewRoute {
  if (context.view === "today") return createViewRoute("uebersicht", {}, options);
  if (context.view === "decks") {
    return createViewRoute("kartenstapel", {
      focusedDeckId: context.deckId,
      selectedCardId: context.cardId,
    }, options);
  }
  return createViewRoute("lernen", { focusedDeckId: context.deckId }, options);
}

export function createViewRoute(
  viewId: AppViewId = defaultViewId,
  fields: Omit<ViewRouteInput, "viewId"> = {},
  options: RouteOptions = {},
): ViewRoute {
  return normalizeViewRoute({ ...fields, mode: "view", viewId }, options.surfaceRegistry);
}

export function normalizeAppRoute(route: unknown = {}, options: RouteOptions = {}): AppRoute {
  const routeInput = route && typeof route === "object" ? route as AppRouteInput : {};
  if (routeInput?.mode === "study") {
    const studyRoute = routeInput as StudyRouteInput;
    const deckId = cleanIdentifier(studyRoute.deckId);
    if (!deckId) return normalizeViewRoute({ viewId: studyFallbackViewId }, options.surfaceRegistry);
    const legacyReturnContext = studyRoute.returnRoute
      ? legacyViewRouteToReturnContext(studyRoute.returnRoute, deckId)
      : undefined;
    const returnContext = normalizeReviewReturnContext(studyRoute.returnContext ?? legacyReturnContext, deckId);
    const variantId = cleanIdentifier(studyRoute.variantId);
    return {
      mode: "study",
      deckId,
      variantSession: studyRoute.variantSession === true || Boolean(variantId),
      ...(variantId ? { variantId } : {}),
      returnContext,
    };
  }
  return normalizeViewRoute(routeInput ?? {}, options.surfaceRegistry);
}

export function createStudyRoute(
  deckId: string,
  fields: Omit<StudyRouteInput, "deckId"> = {},
  options: RouteOptions = {},
): AppRoute {
  return normalizeAppRoute({ ...fields, mode: "study", deckId }, options);
}

function createUrl(input: string | URL): URL {
  if (typeof input === "string") return new URL(input, "http://core.local");
  return new URL(`${input.pathname}${input.search}${input.hash}`, "http://core.local");
}

function decodePathSegment(segment: string): string {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

function isReviewPath(pathSegments: string[]): boolean {
  return (pathSegments.length === 3 && pathSegments[0] === "decks" && pathSegments[2] === "review")
    || (pathSegments.length === 2 && pathSegments[0] === "review");
}

export function parseAppRouteFromUrl(input: string | URL = "/", options: RouteOptions = {}): AppRoute {
  const url = createUrl(input);
  const pathSegments = url.pathname.split("/").filter(Boolean).map(decodePathSegment);
  if (pathSegments.length === 0) return createViewRoute(defaultViewId, {}, options);
  if (isReviewPath(pathSegments)) {
    const deckId = pathSegments[1];
    const variant = cleanIdentifier(url.searchParams.get("variant"));
    return normalizeAppRoute({
      mode: "study",
      deckId,
      variantSession: variant === "1" || Boolean(variant),
      variantId: variant && variant !== "1" ? variant : undefined,
      returnContext: {
        view: url.searchParams.get("returnView") ?? undefined,
        deckId: url.searchParams.get("returnDeck") ?? undefined,
        cardId: url.searchParams.get("returnCard") ?? undefined,
      },
    }, options);
  }
  return normalizeAppRoute({
    mode: "view",
    viewId: pathSegments[0],
    focusedDeckId: url.searchParams.get("deck") ?? undefined,
    selectedCardId: url.searchParams.get("card") ?? undefined,
    deckCreationParentId: url.searchParams.get("parent") ?? undefined,
    creationMethod: url.searchParams.get("method") ?? undefined,
    creationDeckId: url.searchParams.get("deck") ?? undefined,
    completedDeckId: url.searchParams.get("done") ?? undefined,
  }, options);
}

export function appRouteToUrl(route: unknown, options: RouteOptions = {}): string {
  const normalized = normalizeAppRoute(route, options);
  if (normalized.mode === "study") {
    const params = new URLSearchParams();
    if (normalized.variantId) params.set("variant", normalized.variantId);
    else if (normalized.variantSession) params.set("variant", "1");
    params.set("returnView", normalized.returnContext.view);
    if (normalized.returnContext.deckId) params.set("returnDeck", normalized.returnContext.deckId);
    if (normalized.returnContext.cardId) params.set("returnCard", normalized.returnContext.cardId);
    return `/decks/${encodeURIComponent(normalized.deckId)}/review?${params.toString()}`;
  }
  const path = normalized.viewId === defaultViewId ? "/" : `/${encodeURIComponent(normalized.viewId)}`;
  const params = new URLSearchParams();
  if (["lernen", "kartenstapel", "stapel-einstellungen"].includes(normalized.viewId) && normalized.focusedDeckId) {
    params.set("deck", normalized.focusedDeckId);
  }
  if (normalized.viewId === "kartenstapel" && normalized.selectedCardId) params.set("card", normalized.selectedCardId);
  if (normalized.viewId === "lernen" && normalized.deckCreationParentId) params.set("parent", normalized.deckCreationParentId);
  if (normalized.viewId === "neue-karten" && normalized.creationMethod) params.set("method", normalized.creationMethod);
  if (normalized.viewId === "neue-karten" && normalized.creationDeckId) params.set("deck", normalized.creationDeckId);
  if (normalized.viewId === "neue-karten" && normalized.completedDeckId) params.set("done", normalized.completedDeckId);
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
