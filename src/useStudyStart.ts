import React from "react";
import { createReviewReturnContext, createStudyRoute, createViewRoute, reviewReturnContextToViewRoute } from "./appNavigation.ts";
import type { DeckCommands } from "./deckCommands.ts";
import { EXAM_SESSION_DECK_ID } from "./examPlanSettings.ts";
import { HIT_SESSION_DECK_ID, type HitStudyOrder } from "./hitStudySession.ts";
import type { EmptyStudyStart, StudyPreparationCommands, StudyPreparationFailure } from "./studyPreparation.ts";
import type { useLearningClock } from "./useLearningClock.ts";
import type { useNavigationGuard } from "./useNavigationGuard.ts";
import type { useStudySession } from "./useStudySession.ts";
import { useWorkspaceValue } from "./useWorkspaceStore.ts";

type StudyNavigation = Pick<ReturnType<typeof useNavigationGuard>,
  "studyRequest" | "activeView" | "focusedDeckId" | "selectedCardId" | "deckContent" | "deckContentTab" | "navigateToRoute" | "navigateToViewNow" | "getStudyReturnRoute">;

interface StudyStartContext {
  preparation: StudyPreparationCommands | null;
  session: ReturnType<typeof useStudySession>;
  navigation: StudyNavigation;
  deckCommands: DeckCommands | null;
  clock: Pick<ReturnType<typeof useLearningClock>, "learningNow" | "getLearningNow">;
}

/**
 * Starts of study sessions from the screens and from a study route: a deck, more new cards for today, today's exam
 * unit and `Treffer lernen`. A deck without cards for today and a failed preparation are kept for their dialogs; a
 * study route that cannot start returns to where it came from.
 */
export function useStudyStart({ preparation, session, navigation, deckCommands, clock }: StudyStartContext) {
  const [emptyStudyStart, setEmptyStudyStart] = React.useState<EmptyStudyStart | null>(null);
  const [studyPreparationFailure, setStudyPreparationFailure] = React.useState<StudyPreparationFailure | null>(null);
  const state = useWorkspaceValue((snapshot) => snapshot.state);
  const { studyRequest, activeView, focusedDeckId, selectedCardId, deckContent, deckContentTab, navigateToRoute, navigateToViewNow, getStudyReturnRoute } = navigation;
  const { adopt, reset, setDecks } = session;
  const now = clock.learningNow;

  React.useEffect(() => {
    if (!preparation || !state || !studyRequest) {
      reset();
      return;
    }
    const preparationKey = studyRequest.deckId;
    if (session.preparedKeyRef.current === preparationKey && session.decks) return;
    let active = true;
    void preparation.prepareStart(studyRequest.deckId, now).then((outcome) => {
      if (!active || !outcome) return;
      if (outcome.status === "missing") {
        adopt(outcome.preparation, null);
        return;
      }
      if (outcome.status === "ready") {
        adopt(outcome.preparation, preparationKey);
        return;
      }
      if (outcome.status === "empty") {
        setEmptyStudyStart(outcome.emptyStart);
        setDecks(null);
      } else {
        setStudyPreparationFailure(outcome.failure);
      }
      navigateToRoute(reviewReturnContextToViewRoute(studyRequest.returnContext), { replace: true });
    });
    return () => { active = false; };
  }, [adopt, navigateToRoute, now, preparation, reset, session.decks, setDecks, state, studyRequest]);

  async function prepareDeckStart(deck: { id: string; }) {
    const currentRoute = getStudyReturnRoute();
    const returnRoute = activeView === "kartenstapel"
      ? createViewRoute("kartenstapel", {
          focusedDeckId: focusedDeckId ?? deck.id,
          selectedCardId,
          deckContent,
          deckContentTab,
        })
      : activeView === "lernen"
        ? createViewRoute("lernen", { focusedDeckId: deck.id })
        : currentRoute;
    const returnContext = createReviewReturnContext(returnRoute, deck.id);
    const preparationKey = deck.id;
    if (session.preparingKeyRef.current === preparationKey) return;
    session.preparingKeyRef.current = preparationKey;
    try {
      setStudyPreparationFailure(null);
      const outcome = await preparation?.prepareStart(deck.id, now);
      if (outcome?.status === "failed") {
        setStudyPreparationFailure(outcome.failure);
        return;
      }
      if (session.preparingKeyRef.current !== preparationKey) return;
      if (outcome?.status === "empty") setEmptyStudyStart(outcome.emptyStart);
      if (outcome?.status !== "ready") return;
      adopt(outcome.preparation, preparationKey);
      navigateToRoute(createStudyRoute(deck.id, { returnContext }));
    } finally {
      if (session.preparingKeyRef.current === preparationKey) session.preparingKeyRef.current = "";
    }
  }

  function startDeck(deck: { id: string; }) {
    void prepareDeckStart(deck);
  }

  function startAdditionalCards(deckId: string, requestedCount: number): { ok: boolean; message?: string } {
    if (!deckCommands) return { ok: false, message: "Die zusätzlichen Karten konnten nicht vorbereitet werden." };
    const added = deckCommands.addAdditionalNewCards(deckId, requestedCount, clock.getLearningNow());
    if (!added.ok) return added;
    startDeck(added.deck);
    return { ok: true };
  }

  async function startExamUnit(blockId: string | null) {
    const { getExamSummaryTaskDeckId } = await import("./examDailyTasks.ts");
    const summaryDeckId = blockId ? getExamSummaryTaskDeckId(blockId) : null;
    if (summaryDeckId) {
      navigateToViewNow("kartenstapel", { focusedDeckId: summaryDeckId, deckContent: true, deckContentTab: "summary" });
      return;
    }
    if (!preparation || session.preparingKeyRef.current === EXAM_SESSION_DECK_ID) return;
    session.preparingKeyRef.current = EXAM_SESSION_DECK_ID;
    try {
      const prepared = await preparation.prepareExamUnit(blockId);
      adopt(prepared, EXAM_SESSION_DECK_ID);
      const returnRoute = createViewRoute(activeView === "pruefungen" ? "pruefungen" : "uebersicht");
      navigateToRoute(createStudyRoute(EXAM_SESSION_DECK_ID, { returnContext: createReviewReturnContext(returnRoute) }));
    } finally {
      session.preparingKeyRef.current = "";
    }
  }

  async function startHitSession(cardIds: string[], order: HitStudyOrder) {
    if (!preparation || session.preparingKeyRef.current === HIT_SESSION_DECK_ID) return;
    session.preparingKeyRef.current = HIT_SESSION_DECK_ID;
    try {
      adopt(await preparation.prepareHitSession(cardIds, order), HIT_SESSION_DECK_ID);
      navigateToRoute(createStudyRoute(HIT_SESSION_DECK_ID, { returnContext: createReviewReturnContext(getStudyReturnRoute()) }));
    } finally {
      session.preparingKeyRef.current = "";
    }
  }

  return {
    emptyStudyStart,
    dismissEmptyStudyStart: () => setEmptyStudyStart(null),
    studyPreparationFailure,
    dismissStudyPreparationFailure: () => setStudyPreparationFailure(null),
    startDeck,
    startAdditionalCards,
    startExamUnit,
    startHitSession,
  };
}
