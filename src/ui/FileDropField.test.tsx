import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FileDropField } from "./FileDropField.tsx";

test("FileDropField owns variant copy, file semantics, shared tokens and details", () => {
  const documentMarkup = renderToStaticMarkup(
    <FileDropField kind="document" selected onFile={() => undefined}>
      <p>beispiel.pdf</p>
    </FileDropField>,
  );
  const imageMarkup = renderToStaticMarkup(
    <FileDropField kind="image" label="Vorderseite" selected busy onFile={() => undefined} />,
  );

  assert.match(documentMarkup, /data-file-drop-field="true"/);
  assert.match(documentMarkup, /aria-label="Quelldatei auswählen oder ablegen"/);
  assert.match(documentMarkup, /accept="\.txt,\.md,\.markdown,\.csv,\.tsv,\.pdf"/);
  assert.match(documentMarkup, /border-2 border-dashed bg-\[var\(--core-surface-muted\)\]/);
  assert.match(documentMarkup, /border-\[var\(--core-border-interactive\)\]/);
  assert.match(documentMarkup, /focus-visible:ring-\[var\(--core-focus-ring\)\]/);
  for (const pattern of [/lucide-file-text/, />Andere Datei auswählen<\/span>/, /beispiel\.pdf/]) assert.match(documentMarkup, pattern);
  assert.match(imageMarkup, /aria-label="Vorderseite: Bild einfügen oder ablegen"/);
  assert.match(imageMarkup, /aria-disabled="true".*aria-busy="true"/);
  assert.match(imageMarkup, /accept="image\/\*".*disabled=""/);
  for (const pattern of [/lucide-image-plus/, />Bild ersetzen<\/span>/]) assert.match(imageMarkup, pattern);
});
