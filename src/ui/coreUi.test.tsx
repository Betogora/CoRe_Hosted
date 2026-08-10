import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionDialog, CardMarkButton, CoreSwitch, DonutValue, ThemeToggle } from "./coreUi.tsx";

test("action dialog exposes its accessible three-action contract", () => {
  const markup = renderToStaticMarkup(
    <ActionDialog
      open
      title="Änderungen übernehmen?"
      description="Ungespeicherte Kartenänderungen."
      confirmLabel="Speichern"
      discardLabel="Verwerfen"
      cancelLabel="Weiter bearbeiten"
      onConfirm={() => undefined}
      onDiscard={() => undefined}
      onCancel={() => undefined}
    />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Speichern/);
  assert.match(markup, /Verwerfen/);
  assert.match(markup, /Weiter bearbeiten/);
});

test("action dialog presents a prompt without description in one compact row", () => {
  const markup = renderToStaticMarkup(
    <ActionDialog
      open
      title="Karte löschen?"
      description={null}
      confirmLabel="Ja"
      cancelLabel="Nein"
      onConfirm={() => undefined}
      onCancel={() => undefined}
    />,
  );

  assert.match(markup, /flex flex-wrap items-center gap-3/);
  assert.equal(markup.match(/core-action-secondary/g)?.length, 2);
});

test("theme toggle exposes its icon state as an accessible switch", () => {
  const markup = renderToStaticMarkup(<ThemeToggle />);

  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="false"/);
  assert.match(markup, /Dark Mode einschalten/);
  assert.match(markup, /lucide-sun/);
  assert.doesNotMatch(markup, />Aus</);
});

test("shared study-state controls expose switch and pressed semantics", () => {
  const markup = renderToStaticMarkup(
    <>
      <CoreSwitch checked ariaLabel="Karte reaktivieren" onCheckedChange={() => undefined} />
      <CardMarkButton marked onMarkedChange={() => undefined} />
    </>,
  );

  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="true"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-label="Markierung entfernen"/);
  assert.match(markup, /fill="currentColor"/);
});

test("responsive donut delegates its size to the deck-row container", () => {
  const markup = renderToStaticMarkup(<DonutValue value={42} size="responsive" />);

  assert.match(markup, /core-donut-responsive/);
  assert.match(markup, /core-donut-responsive-center/);
  assert.doesNotMatch(markup, /md:size-/);
});
