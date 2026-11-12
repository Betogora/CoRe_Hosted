import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogFrame } from "./DialogFrame.tsx";

test("dialog frame names the modal by its title and offers a borderless close button", () => {
  const markup = renderToStaticMarkup(
    <DialogFrame open title="Tags verwalten" onClose={() => undefined} size="s" testId="tag-dialog" footer={<button type="button">Speichern</button>}>
      <p>Inhalt</p>
    </DialogFrame>,
  );

  const titleId = markup.match(/<h2 id="([^"]+)" class="core-dialog-frame-title">Tags verwalten<\/h2>/)?.[1];
  assert.ok(titleId);
  assert.match(markup, new RegExp(`role="dialog" aria-modal="true" aria-labelledby="${titleId}" data-size="s" data-testid="tag-dialog" class="core-dialog-frame"`));
  assert.match(markup, /aria-label="Schließen"[^>]*class="core-action-ghost/);
  assert.match(markup, /<div class="core-dialog-frame-body"><p>Inhalt<\/p><\/div><footer class="core-dialog-frame-footer"><button type="button">Speichern<\/button><\/footer>/);
  assert.doesNotMatch(markup, /core-dialog-frame-tabs/);
});

test("dialog frame places tabs between title and content and renders nothing while closed", () => {
  const markup = renderToStaticMarkup(
    <DialogFrame open title="Karte bearbeiten" onClose={() => undefined} tabs={<div role="tablist" aria-label="Bereiche" />} closeLabel="Editor schließen">
      Inhalt
    </DialogFrame>,
  );

  assert.match(markup, /data-size="m"/);
  assert.match(markup, /<header class="core-dialog-frame-header" data-tabs="true">[\s\S]*aria-label="Editor schließen"[\s\S]*<\/header><div class="core-dialog-frame-tabs"><div role="tablist" aria-label="Bereiche"><\/div><\/div><div class="core-dialog-frame-body">Inhalt<\/div>/);
  assert.doesNotMatch(markup, /<footer/);
  assert.equal(renderToStaticMarkup(<DialogFrame open={false} title="Zu" onClose={() => undefined}>Inhalt</DialogFrame>), "");
});
