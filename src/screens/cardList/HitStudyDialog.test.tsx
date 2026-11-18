import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HitStudyDialog } from "./HitStudyDialog.tsx";

const noCards = async () => [];
const noStart = async () => undefined;

test("Treffer lernen bietet Vorziehen und Nur üben, beide in der Reihenfolge des Stapels oder gemischt (KV5)", () => {
  const markup = renderToStaticMarkup(<HitStudyDialog title="Treffer lernen" loadCardIds={noCards} onStart={noStart} onClose={() => undefined} />);
  assert.match(markup, /aria-label="Lernweg"/);
  assert.match(markup, />Wie im Stapel</);
  assert.match(markup, />Gemischt</);
  assert.match(markup, />Lernen<\/span>/);
});

test("Alle Karten frei üben fragt nur nach der Reihenfolge und übt, ohne vorzuziehen", () => {
  const markup = renderToStaticMarkup(<HitStudyDialog title="Alle Karten frei üben" practiceDeckName="Anatomie" loadCardIds={noCards} onStart={noStart} onClose={() => undefined} />);
  assert.doesNotMatch(markup, /Lernweg|Vorziehen|Nur üben/);
  assert.match(markup, />Wie im Stapel</);
  assert.match(markup, />Üben<\/span>/);
});
