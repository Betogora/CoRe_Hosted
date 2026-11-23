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
  assert.equal(markup.match(/lucide-flag/g)?.length, 7, "jede Flagge ist ein Flaggen-Icon in ihrer Farbe");
  assert.match(markup, /grid-cols-4/);
  assert.match(markup, /aria-pressed="false" aria-label="Keine Flagge"/);
  assert.match(markup, /lucide-ban/, "Keine zeigt ein Symbol statt einer Farbe");
  assert.match(markup, /<span class="max-w-full truncate">Keine<\/span>/, "Namen stehen auf jeder Breite unter dem Icon");
  assert.doesNotMatch(markup, /sr-only/, "Namen werden auf keiner Breite ausgeblendet");
  assert.match(markup, /aria-pressed="true" aria-label="Flagge Grün" class="[^"]*border-core-action/, "die gewählte Flagge trägt den Auswahlrahmen");
  assert.match(markup, />Grün<\/span>/);
  assert.match(markup, /Namen bearbeiten/);
  const none = renderToStaticMarkup(<FlagPicker value={0} onValueChange={() => undefined} />);
  assert.match(none, /aria-pressed="true" aria-label="Keine Flagge"/, "ohne Flagge ist Keine gewählt markiert");
  assert.doesNotMatch(renderToStaticMarkup(<FlagPicker value={2} withNone={false} onValueChange={() => undefined} />), /Keine/);
});

test("FlagDot renders only a set flag, with an accessible name", () => {
  assert.equal(renderToStaticMarkup(<FlagDot flag={0} />), "");
  assert.match(renderToStaticMarkup(<FlagDot flag={2} />), /role="img" aria-label="Flagge Orange"[^>]*><svg[^>]*width="16"[^>]*fill="currentColor"[^>]*lucide-flag[^>]*style="color:var\(--core-flag-2\)"/);
});
