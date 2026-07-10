import { createMenuModel } from "./menuModel.js";

export const APP_HISTORY_STATE_KEY = "coreAppRoute";

const menu = createMenuModel();
const defaultViewId = menu.defaultViewId;
const studyFallbackViewId = "lernen";
const extraRoutableViewIds = ["assistent", "stapel-einstellungen"];
const routableViewIds = new Set([...menu.listViews().map((view) => view.id), ...extraRoutableViewIds]);

function deckIdSetFrom(validDeckIds) {
  if (!validDeckIds) return null;
  if (validDeckIds instanceof Set) return validDeckIds;
  return new Set(validDeckIds);
}

function cleanDeckId(value, validDeckIds) {
  const deckId = String(value ?? "").trim();
  if (!deckId) return "";
  if (validDeckIds && !validDeckIds.has(deckId)) return "";
  return deckId;
}

function normalizeViewRoute(route = {}, validDeckIds = null) {
  const rawViewId = String(route.viewId ?? defaultViewId);
  const viewId = routableViewIds.has(rawViewId) ? rawViewId : defaultViewId;
  const focusedDeckId = cleanDeckId(route.focusedDeckId, validDeckIds);
  const deckCreationParentId = cleanDeckId(route.deckCreationParentId, validDeckIds);
  const normalized = { mode: "view", viewId };

  if (focusedDeckId) normalized.focusedDeckId = focusedDeckId;
  if (deckCreationParentId) normalized.deckCreationParentId = deckCreationParentId;

  return normalized;
}

export function createViewRoute(viewId = defaultViewId, fields = {}, options = {}) {
  return normalizeViewRoute({ ...fields, mode: "view", viewId }, deckIdSetFrom(options.validDeckIds));
}

export function normalizeAppRoute(route = {}, options = {}) {
  const validDeckIds = deckIdSetFrom(options.validDeckIds);

  if (route?.mode === "study") {
    const deckId = cleanDeckId(route.deckId, validDeckIds);
    if (!deckId) return normalizeViewRoute({ mode: "view", viewId: studyFallbackViewId }, validDeckIds);

    return {
      mode: "study",
      deckId,
      variantSession: route.variantSession === true,
      returnRoute: normalizeViewRoute(route.returnRoute ?? { mode: "view", viewId: studyFallbackViewId }, validDeckIds),
    };
  }

  return normalizeViewRoute(route, validDeckIds);
}

export function createStudyRoute(deckId, fields = {}, options = {}) {
  return normalizeAppRoute({ ...fields, mode: "study", deckId }, options);
}

function createUrl(input) {
  if (typeof input === "string") return new URL(input, "http://core.local");
  return new URL(`${input?.pathname ?? "/"}${input?.search ?? ""}${input?.hash ?? ""}`, "http://core.local");
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseAppRouteFromUrl(input = "/", options = {}) {
  const url = createUrl(input);
  const pathSegments = url.pathname.split("/").filter(Boolean).map(decodePathSegment);

  if (pathSegments.length === 0) {
    return normalizeAppRoute({ mode: "view", viewId: defaultViewId }, options);
  }

  if (pathSegments.length === 3 && pathSegments[0] === "decks" && pathSegments[2] === "review") {
    return normalizeAppRoute(
      {
        mode: "study",
        deckId: pathSegments[1],
        variantSession: url.searchParams.get("variant") === "1",
        returnRoute: { mode: "view", viewId: studyFallbackViewId },
      },
      options,
    );
  }

  return normalizeAppRoute(
    {
      mode: "view",
      viewId: pathSegments[0],
      focusedDeckId: url.searchParams.get("deck"),
      deckCreationParentId: url.searchParams.get("parent"),
    },
    options,
  );
}

export function appRouteToUrl(route, options = {}) {
  const normalized = normalizeAppRoute(route, options);

  if (normalized.mode === "study") {
    const params = new URLSearchParams();
    if (normalized.variantSession) params.set("variant", "1");
    const search = params.toString();
    return `/decks/${encodeURIComponent(normalized.deckId)}/review${search ? `?${search}` : ""}`;
  }

  const path = normalized.viewId === defaultViewId ? "/" : `/${encodeURIComponent(normalized.viewId)}`;
  const params = new URLSearchParams();
  if (["kartenstapel", "stapel-einstellungen"].includes(normalized.viewId) && normalized.focusedDeckId) params.set("deck", normalized.focusedDeckId);
  if (normalized.viewId === "lernen" && normalized.deckCreationParentId) params.set("parent", normalized.deckCreationParentId);
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}`;
}

export function createAppHistoryState(route, options = {}) {
  const currentState = options.currentState && typeof options.currentState === "object" ? options.currentState : {};
  return {
    ...currentState,
    [APP_HISTORY_STATE_KEY]: normalizeAppRoute(route, options),
  };
}

export function readAppRouteFromHistoryState(historyState, options = {}) {
  const route = historyState?.[APP_HISTORY_STATE_KEY];
  return route ? normalizeAppRoute(route, options) : null;
}

export function areAppRoutesEqual(left, right, options = {}) {
  return JSON.stringify(normalizeAppRoute(left, options)) === JSON.stringify(normalizeAppRoute(right, options));
}
