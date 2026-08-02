import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionDialog, ThemeToggle } from "./coreUi.tsx";

test("action dialog exposes an accessible modal contract and explicit actions", () => {
  const markup = renderToStaticMarkup(
    <ActionDialog
      open
      title="Entwurf verlassen?"
      description="Ungespeicherte Inhalte würden verworfen."
      confirmLabel="Verwerfen und verlassen"
      cancelLabel="Weiter bearbeiten"
      onConfirm={() => undefined}
      onCancel={() => undefined}
      destructive
    />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Verwerfen und verlassen/);
  assert.match(markup, /Weiter bearbeiten/);
});

test("theme toggle exposes its icon state as an accessible switch", () => {
  const markup = renderToStaticMarkup(<ThemeToggle />);

  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="false"/);
  assert.match(markup, /Dark Mode einschalten/);
  assert.match(markup, /lucide-sun/);
  assert.doesNotMatch(markup, />Aus</);
});
