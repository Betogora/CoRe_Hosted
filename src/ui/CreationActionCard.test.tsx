import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PenLine } from "lucide-react";
import { CreationActionCard } from "./CreationActionCard.tsx";

test("creation action card lies flat with a free icon, the title first and no lift or shadow", () => {
  const markup = renderToStaticMarkup(<CreationActionCard title="Karten selbst erstellen" description="Frage und Antwort direkt eingeben." icon={PenLine} onSelect={() => undefined} />);

  assert.match(markup, /^<button type="button" class="grid grid-cols-\[auto_minmax\(0,1fr\)\][^"]*rounded-control[^"]*hover:border-core-border-strong hover:bg-core-subtle">/);
  assert.match(markup, /<svg[^>]*class="lucide lucide-pen-line text-core-action"[^>]*width="24"|<svg[^>]*width="24"[^>]*class="lucide lucide-pen-line text-core-action"/);
  assert.match(markup, /<span class="block max-w-full break-words core-heading-3 text-core-text">Karten selbst erstellen<\/span><span class="block core-body text-core-secondary">Frage und Antwort direkt eingeben\.<\/span>/);
  assert.doesNotMatch(markup, /shadow|translate|size-12|bg-core-action/);
});
