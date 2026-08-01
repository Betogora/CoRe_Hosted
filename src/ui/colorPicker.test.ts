import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultHighlightColors,
  defaultTextColors,
  highlightPaletteColors,
  textPaletteColors,
} from "./colorPicker.tsx";
import { richTextColorStorageKeys } from "./RichTextEditor.tsx";

test("rich text presets use the CoRe palette and versioned preference slots", () => {
  assert.deepEqual(defaultTextColors, ["#181d25", "#262e3a", "#667492"]);
  assert.deepEqual(textPaletteColors, ["#181d25", "#262e3a", "#667492", "#5e6b86", "#55617a"]);
  assert.deepEqual(defaultHighlightColors, ["#dde3ec", "#d6a3d2", "#e4bf63"]);
  assert.deepEqual(highlightPaletteColors, ["#dde3ec", "#a9b5c7", "#e28b68", "#d6a3d2", "#e4bf63"]);
  assert.deepEqual(richTextColorStorageKeys, {
    text: "core.richText.textColors.v2",
    highlight: "core.richText.highlightColors.v2",
  });
});
