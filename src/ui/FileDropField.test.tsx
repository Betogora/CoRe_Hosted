import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FileDropField } from "./FileDropField.tsx";

test("FileDropField is configured by its caller and shows prompt and action without an icon tile", () => {
  const markup = renderToStaticMarkup(
    <FileDropField accept=".pdf" ariaLabel="Quelldatei auswählen oder ablegen" label="Quelle" prompt="PDF hier ablegen" actionLabel="Datei auswählen" onFile={() => undefined} />,
  );
  assert.match(markup, /data-file-drop-field="true"/);
  assert.match(markup, /aria-label="Quelldatei auswählen oder ablegen"/);
  assert.match(markup, /accept="\.pdf"/);
  assert.match(markup, /border border-dashed border-core-border-strong bg-core-subtle/);
  assert.match(markup, /data-drop-state="idle"/);
  for (const pattern of [/>Quelle<\/span>/, />PDF hier ablegen<\/p>/, />Datei auswählen<\/span>/]) assert.match(markup, pattern);
  assert.equal((markup.match(/<svg/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /tabindex="0"/);
});

test("FileDropField replaces the prompt with details and locks while busy", () => {
  const markup = renderToStaticMarkup(
    <FileDropField accept="image/*" pasteImages busy ariaLabel="Bild einfügen oder ablegen" prompt="Bild hier ablegen" actionLabel="Bild ersetzen" onFile={() => undefined}>
      <p>herz.png</p>
    </FileDropField>,
  );
  assert.match(markup, /aria-disabled="true".*aria-busy="true"/);
  assert.match(markup, /accept="image\/\*".*disabled=""/);
  assert.match(markup, /herz\.png/);
  assert.doesNotMatch(markup, /Bild hier ablegen/);
});
