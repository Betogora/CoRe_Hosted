import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Languages } from "lucide-react";
import { CoreSelect } from "./selectUi.tsx";

test("CoreSelect renders the controlled value with an accessible combobox trigger", () => {
  const ref = React.createRef<HTMLButtonElement>();
  const markup = renderToStaticMarkup(
    <CoreSelect
      ref={ref}
      ariaLabel="Kartentyp"
      value="basic"
      options={[
        { value: "basic", label: "Basic" },
        { value: "cloze", label: "Lückentext" },
      ]}
      onValueChange={() => undefined}
      leadingIcon={Languages}
    />,
  );

  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-label="Kartentyp"/);
  assert.match(markup, />Basic</);
  assert.match(markup, /px-4/);
  assert.match(markup, /lucide-languages/);
  assert.equal(ref.current, null);
});

test("CoreSelect accepts an empty external value without losing its label", () => {
  const markup = renderToStaticMarkup(
    <CoreSelect
      ariaLabel="Ebene"
      value=""
      options={[
        { value: "", label: "Als Hauptstapel" },
        { value: "deck-parent", label: "Bereich / Unterstapel" },
      ]}
      onValueChange={() => undefined}
    />,
  );

  assert.match(markup, />Als Hauptstapel</);
});
