import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../coreModel.ts";
import { VariantGenerationBar } from "./VariantGenerationBar.tsx";

const deck = createCoreDeck({ id: "deck-bio", name: "Biochemie" });

test("running bar shows the count with cancel and a determinate progress bar", () => {
  const html = renderToStaticMarkup(<VariantGenerationBar deck={deck} done={7} total={18} onCancel={() => undefined} onClose={() => undefined} />);
  assert.match(html, />Varianten generieren 7 von 18</);
  assert.match(html, /aria-label="Abbrechen"/);
  assert.match(html, /role="progressbar"[^>]*aria-valuemax="18"[^>]*aria-valuenow="7"/);
  assert.match(html, /aria-label="Varianten für Biochemie"/);
});

test("an outcome replaces the count and offers closing instead of cancelling", () => {
  const html = renderToStaticMarkup(<VariantGenerationBar deck={deck} done={18} total={18} outcome="16 Varianten generiert, 2 fehlgeschlagen" onCancel={() => undefined} onClose={() => undefined} />);
  assert.match(html, />16 Varianten generiert, 2 fehlgeschlagen</);
  assert.match(html, /aria-label="Schließen"/);
  assert.doesNotMatch(html, /aria-label="Abbrechen"/);
});
