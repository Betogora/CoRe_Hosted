import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FlagDot, FlagPicker, flagName } from "./flagUi.tsx";

test("flag names fall back to the Anki color names", () => {
  assert.equal(flagName(1), "Rot");
  assert.equal(flagName(7, ["", "", "", "", "", "", "Prüfung"]), "Prüfung");
  assert.equal(flagName(6, ["", "", "", "", "", "  ", ""]), "Türkis");
  assert.equal(flagName(0), "");
});

test("FlagPicker names every flag with its shortcut and never relies on color alone", () => {
  const markup = renderToStaticMarkup(<FlagPicker value={3} names={["Wichtig"]} onValueChange={() => undefined} onEditNames={() => undefined} />);
  assert.equal((markup.match(/aria-label="Flagge /g) ?? []).length, 7);
  assert.match(markup, /aria-pressed="true" aria-label="Flagge Grün"/);
  assert.match(markup, /aria-label="Flagge Wichtig"/);
  assert.match(markup, /data-core-tooltip="Wichtig · Strg\+1"/);
  assert.match(markup, /var\(--core-flag-7\)/);
  assert.match(markup, /grid-cols-4/);
  assert.match(markup, />Keine</);
  assert.match(markup, /Namen bearbeiten/);
});

test("FlagDot renders only a set flag, with an accessible name", () => {
  assert.equal(renderToStaticMarkup(<FlagDot flag={0} />), "");
  assert.match(renderToStaticMarkup(<FlagDot flag={2} />), /role="img" aria-label="Flagge Orange"/);
});
