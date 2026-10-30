import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TagInput, tagLeaf } from "./TagInput.tsx";

test("chips show the last path part and keep the full path in the tooltip", () => {
  assert.equal(tagLeaf("Medizin::Herz::Klappen"), "Klappen");
  assert.equal(tagLeaf("#AK_Step1"), "#AK_Step1");
  const markup = renderToStaticMarkup(<TagInput tags={["Medizin::Herz", "eigen"]} onChange={() => undefined} />);
  assert.match(markup, /data-core-tooltip="Medizin::Herz"[^>]*>Herz</);
  assert.match(markup, /aria-label="Tag eigen entfernen"/);
  assert.match(markup, /role="combobox"/);
});

test("imported tags start collapsed with their count, own tags stay visible", () => {
  const markup = renderToStaticMarkup(<TagInput tags={["eigen", "#AK::Herz", "AK::Lunge"]} importedTags={["#ak::herz", "AK::Lunge", "entfernt"]} onChange={() => undefined} />);
  assert.match(markup, /aria-expanded="false"[^>]*>[\s\S]*?Importiert \(2\)/);
  assert.match(markup, /Tag eigen entfernen/);
  assert.doesNotMatch(markup, /Tag AK::Lunge entfernen/);
});
