import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createDemoAnatomyDeck } from "../coreWorkspace.ts";
import { CreationScreen } from "./CreationScreen.tsx";

test("completed first creation offers study and card-review actions", () => {
  const deck = createDemoAnatomyDeck();
  const markup = renderToStaticMarkup(
    <CreationScreen
      decks={[deck]}
      completedDeckId={deck.id}
      onMethodChange={() => undefined}
      onCreated={() => undefined}
      onAppendManualCard={() => undefined}
      onImportCompleted={() => undefined}
      onStartDeck={() => undefined}
      onReviewDeck={() => undefined}
    />,
  );

  assert.match(markup, /Deine Karten sind bereit/);
  assert.match(markup, /Jetzt lernen/);
  assert.match(markup, /Karten prüfen/);
});

test("creation entry marks core and labs surfaces without external-model or cost claims", () => {
  const markup = renderToStaticMarkup(
    <CreationScreen
      decks={[]}
      onMethodChange={() => undefined}
      onCreated={() => undefined}
      onAppendManualCard={() => undefined}
      onImportCompleted={() => undefined}
      onStartDeck={() => undefined}
      onReviewDeck={() => undefined}
      onJob={() => undefined}
      showAiDrafts
      aiDraftSurface={{
        id: "local-ai-drafts",
        maturity: "labs",
        mainNavigation: false,
        reason: "Die Entwürfe werden lokal deterministisch erzeugt; es wird kein externes Modell aufgerufen.",
      }}
    />,
  );

  assert.match(markup, /Core · Manuell/);
  assert.match(markup, /Core · APKG/);
  assert.match(markup, /Lokaler Entwurfsassistent/);
  assert.match(markup, /kein externes Modell aufgerufen/);
  assert.doesNotMatch(markup, /Kostenprofil|Quality-ready|Balanced/);
});

test("manual and local-draft pickers accept only readable source documents", () => {
  const commonProps = {
    decks: [],
    onMethodChange: () => undefined,
    onCreated: () => undefined,
    onAppendManualCard: () => undefined,
    onImportCompleted: () => undefined,
    onStartDeck: () => undefined,
    onReviewDeck: () => undefined,
    onJob: () => undefined,
  };
  const manualMarkup = renderToStaticMarkup(<CreationScreen {...commonProps} initialMethod="manual" />);
  const draftMarkup = renderToStaticMarkup(
    <CreationScreen
      {...commonProps}
      initialMethod="ai"
      showAiDrafts
      aiDraftSurface={{ id: "local-ai-drafts", maturity: "labs", mainNavigation: false }}
    />,
  );

  for (const markup of [manualMarkup, draftMarkup]) {
    assert.match(markup, /accept="\.txt,\.md,\.markdown,\.csv,\.tsv,\.pdf"/);
    assert.doesNotMatch(markup, /\.docx/i);
  }
});
