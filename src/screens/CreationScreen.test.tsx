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
