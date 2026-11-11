import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudyAiHelp } from "./StudyAiHelp.tsx";

const props = { card: { prompt: "Was ist ATP?", answer: "Ein Energieträger" }, onAsk: async () => "", onOpenChange: () => undefined };

test("StudyAiHelp stays a single floating entry while closed", () => {
  const markup = renderToStaticMarkup(<StudyAiHelp {...props} open={false} />);

  assert.match(markup, /core-study-ai-entry[^>]*aria-haspopup="dialog" aria-expanded="false"[^>]*>.*KI hilft<\/button>$/);
  assert.doesNotMatch(markup, /role="dialog"/);
});

test("StudyAiHelp opens a modal chat with greeting, both quick questions and a free question", () => {
  const markup = renderToStaticMarkup(<StudyAiHelp {...props} open />);

  assert.match(markup, /role="dialog" aria-modal="true" aria-label="KI hilft"/);
  assert.match(markup, /bg-\[var\(--core-backdrop\)\]/);
  assert.match(markup, /Hi! Stell mir eine Frage zu dieser Karte\./);
  assert.match(markup, /aria-label="KI hilft schließen"/);
  assert.match(markup, />Erklären</);
  assert.match(markup, />Beispiel</);
  assert.match(markup, /placeholder="Stelle eine Frage …"/);
  assert.match(markup, /aria-label="Frage senden"[^>]*disabled=""/);
});
