import { createMenuModel, type MenuViewId } from "./menuModel.ts";

export const APP_HISTORY_STATE_KEY = "coreAppRoute";

const menu = createMenuModel();
const defaultViewId = menu.defaultViewId;
const studyFallbackViewId: AppViewId = "lernen";
const extraRoutableViewIds = ["stapel-einstellungen"] as const;
const reviewReturnViews = ["today", "learn", "decks"] as const;
const settingsReturnViews = [...reviewReturnViews, "review"] as const;
const settingsTargets = ["new-cards-per-day"] as const;

export type AppViewId = MenuViewId | typeof extraRoutableViewIds[number];
export type ReviewReturnView = typeof reviewReturnViews[number];
export type SettingsReturnView = typeof settingsReturnViews[number];
export type SettingsTarget = typeof settingsTargets[number];

export interface ReviewReturnContext {
  view: ReviewReturnView;
  deckId?: string;
  cardId?: string;
}

export type ReviewResumeContext = Omit<StudyRoute, "mode">;

export type SettingsReturnContext =
  | { view: "today" | "learn" }
  | { view: "decks"; cardId?: string }
  | { view: "review"; reviewReturnContext: ReviewResumeContext };

export interface ViewRoute {
  mode: "view";
  viewId: AppViewId;
  focusedDeckId?: string;
  selectedCardId?: string;
  deckCreationParentId?: string;
  creationMethod?: "manual" | "import";
  creationDeckId?: string;
  completedDeckId?: string;
  completedCount?: number;
  completionKind?: "import" | "manual";
  settingsTarget?: SettingsTarget;
  settingsReturnContext?: SettingsReturnContext;
  cardEditorReturnContext?: ReviewResumeContext;
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
}

interface ReviewReturnContextInput {
  view?: unknown;
  deckId?: unknown;
  cardId?: unknown;
}

interface ReviewResumeContextInput {
  deckId?: unknown;
  variantSession?: unknown;
  variantId?: unknown;
  returnContext?: ReviewReturnContextInput;
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
  completedCount?: unknown;
  completionKind?: unknown;
  settingsTarget?: unknown;
  settingsReturnContext?: {
    view?: unknown;
    cardId?: unknown;
    reviewReturnContext?: ReviewResumeContextInput;
  };
  cardEditorReturnContext?: ReviewResumeContextInput;
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

function cleanCompletedCount(value: unknown): number | null {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function normalizeViewId(value: unknown): AppViewId {
  const routableViewIds = new Set<AppViewId>([
    ...createMenuModel().listRoutableViewIds(),
    ...extraRoutableViewIds,
  ]);
  const rawViewId = String(value ?? defaultViewId) as AppViewId;
  return routableViewIds.has(rawViewId) ? rawViewId : defaultViewId;
}

function normalizeViewRoute(
  route: ViewRouteInput = {},
): ViewRoute {
  const viewId = normalizeViewId(route.viewId);
  const focusedDeckId = cleanIdentifier(route.focusedDeckId);
  const selectedCardId = cleanIdentifier(route.selectedCardId);
  const deckCreationParentId = cleanIdentifier(route.deckCreationParentId);
  const creationMethod = ["manual", "import"].includes(String(route.creationMethod))
    ? route.creationMethod as "manual" | "import"
    : "";
  const creationDeckId = cleanIdentifier(route.creationDeckId);
  const completedDeckId = cleanIdentifier(route.completedDeckId);
  const completedCount = cleanCompletedCount(route.completedCount);
  const completionKind = route.completionKind === "import" || route.completionKind === "manual" ? route.completionKind : null;
  const settingsTarget = settingsTargets.includes(String(route.settingsTarget) as SettingsTarget)
    ? String(route.settingsTarget) as SettingsTarget
    : null;
  const settingsReturnView = settingsReturnViews.includes(String(route.settingsReturnContext?.view) as SettingsReturnView)
    ? String(route.settingsReturnContext?.view) as SettingsReturnView
    : null;
  const settingsReturnCardId = cleanIdentifier(route.settingsReturnContext?.cardId);
  const settingsReviewReturnContext = normalizeReviewResumeContext(route.settingsReturnContext?.reviewReturnContext);
  const cardEditorReturnContext = normalizeReviewResumeContext(route.cardEditorReturnContext);
  const settingsReturnContext: SettingsReturnContext | null = settingsReturnView === "review"
    ? settingsReviewReturnContext
      ? { view: "review", reviewReturnContext: settingsReviewReturnContext }
      : null
    : settingsReturnView === "decks"
      ? { view: "decks", ...(settingsReturnCardId ? { cardId: settingsReturnCardId } : {}) }
      : settingsReturnView
        ? { view: settingsReturnView }
        : null;

  return {
    mode: "view",
    viewId,
    ...(["lernen", "kartenstapel", "stapel-einstellungen"].includes(viewId) && focusedDeckId ? { focusedDeckId } : {}),
    ...(viewId === "kartenstapel" && focusedDeckId && selectedCardId ? { selectedCardId } : {}),
    ...(viewId === "lernen" && deckCreationParentId ? { deckCreationParentId } : {}),
    ...(viewId === "neue-karten" && creationMethod ? { creationMethod } : {}),
    ...(viewId === "neue-karten" && creationDeckId ? { creationDeckId } : {}),
    ...(viewId === "neue-karten" && completedDeckId ? { completedDeckId } : {}),
    ...(viewId === "neue-karten" && completedDeckId && completedCount !== null ? { completedCount } : {}),
    ...(viewId === "neue-karten" && completedDeckId && completionKind ? { completionKind } : {}),
    ...(viewId === "stapel-einstellungen" && settingsTarget ? { settingsTarget } : {}),
    ...(viewId === "stapel-einstellungen" && settingsReturnContext ? { settingsReturnContext } : {}),
    ...(viewId === "kartenstapel" && focusedDeckId && selectedCardId && cardEditorReturnContext
      ? { cardEditorReturnContext }
      : {}),
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

function normalizeReviewResumeContext(
  context: ReviewResumeContextInput | undefined,
): ReviewResumeContext | null {
  const deckId = cleanIdentifier(context?.deckId);
  if (
    !deckId
    || typeof context?.variantSession !== "boolean"
    || !reviewReturnViews.includes(String(context.returnContext?.view) as ReviewReturnView)
  ) return null;
  const variantId = cleanIdentifier(context?.variantId);
  return {
    deckId,
    variantSession: context?.variantSession === true || Boolean(variantId),
    ...(variantId ? { variantId } : {}),
    returnContext: normalizeReviewReturnContext(context?.returnContext, deckId),
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
  return normalizeViewRoute({ ...fields, mode: "view", viewId });
}

export function normalizeAppRoute(route: unknown = {}, options: RouteOptions = {}): AppRoute {
  const routeInput = route && typeof route === "object" ? route as AppRouteInput : {};
  if (routeInput?.mode === "study") {
    const studyRoute = routeInput as StudyRouteInput;
    const deckId = cleanIdentifier(studyRoute.deckId);
    if (!deckId) return normalizeViewRoute({ viewId: studyFallbackViewId });
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
  return normalizeViewRoute(routeInput ?? {});
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
  const reviewReturnValue = url.searchParams.get("reviewReturn");
  const reviewReturnRoute = reviewReturnValue ? parseAppRouteFromUrl(reviewReturnValue, options) : null;
  const cardEditorReturnContext = reviewReturnRoute?.mode === "study" ? {
    deckId: reviewReturnRoute.deckId,
    variantSession: reviewReturnRoute.variantSession,
    variantId: reviewReturnRoute.variantId,
    returnContext: reviewReturnRoute.returnContext,
  } : undefined;
  return normalizeAppRoute({
    mode: "view",
    viewId: pathSegments[0],
    focusedDeckId: url.searchParams.get("deck") ?? undefined,
    selectedCardId: url.searchParams.get("card") ?? undefined,
    deckCreationParentId: url.searchParams.get("parent") ?? undefined,
    creationMethod: url.searchParams.get("method") ?? undefined,
    creationDeckId: url.searchParams.get("deck") ?? undefined,
    completedDeckId: url.searchParams.get("done") ?? undefined,
    completedCount: url.searchParams.get("doneCount") ?? undefined,
    completionKind: url.searchParams.get("doneKind") ?? undefined,
    settingsTarget: url.searchParams.get("target") ?? undefined,
    settingsReturnContext: pathSegments[0] === "stapel-einstellungen" ? {
      view: reviewReturnRoute?.mode === "study" ? "review" : url.searchParams.get("returnView") ?? undefined,
      cardId: url.searchParams.get("returnCard") ?? undefined,
      reviewReturnContext: reviewReturnRoute?.mode === "study" ? cardEditorReturnContext : undefined,
    } : undefined,
    cardEditorReturnContext,
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
  if (normalized.viewId === "neue-karten" && normalized.completedDeckId && normalized.completedCount != null) params.set("doneCount", String(normalized.completedCount));
  if (normalized.viewId === "neue-karten" && normalized.completedDeckId && normalized.completionKind) params.set("doneKind", normalized.completionKind);
  if (normalized.viewId === "stapel-einstellungen" && normalized.settingsTarget) params.set("target", normalized.settingsTarget);
  const settingsReturnContext = normalized.settingsReturnContext;
  if (normalized.viewId === "stapel-einstellungen" && settingsReturnContext) {
    params.set("returnView", settingsReturnContext.view);
    if (settingsReturnContext.view === "decks" && settingsReturnContext.cardId) {
      params.set("returnCard", settingsReturnContext.cardId);
    }
    if (settingsReturnContext.view === "review" && settingsReturnContext.reviewReturnContext) {
      params.set("reviewReturn", appRouteToUrl({
        mode: "study",
        ...settingsReturnContext.reviewReturnContext,
      }));
    }
  }
  if (normalized.viewId === "kartenstapel" && normalized.cardEditorReturnContext) {
    params.set("reviewReturn", appRouteToUrl({
      mode: "study",
      ...normalized.cardEditorReturnContext,
    }));
  }
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
