import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionDialog, CardMarkButton, CoreModeControl, CoreSegmentedControl, CoreSwitch, SegmentedDonut } from "./coreUi.tsx";

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

test("action dialog supports information without a confirm action", () => {
  const markup = renderToStaticMarkup(
    <ActionDialog
      open
      title="Keine fälligen Karten"
      description="Dieser Stapel hat für heute keine Karten in der Lern-Queue."
      cancelLabel="Schließen"
      onCancel={() => undefined}
    />,
  );

  assert.match(markup, /Keine fälligen Karten/);
  assert.match(markup, />Schließen</);
  assert.equal(markup.match(/<button/g)?.length, 1);
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
  assert.match(markup, /text-\[var\(--core-warning\)\]/);
  assert.match(markup, /fill="currentColor"/);
});

test("segmented controls expose one icon-free pressed brick in both densities", () => {
  const markup = renderToStaticMarkup(
    <>
      <CoreSegmentedControl
        ariaLabel="Zeitraum"
        options={[
          { value: "week", label: "Woche" },
          { value: "month", label: "Monat" },
          { value: "year", label: "Jahr" },
        ]}
        value="month"
        onValueChange={() => undefined}
        size="compact"
      />
      <CoreModeControl value="auto" onChange={() => undefined} />
    </>,
  );

  assert.equal((markup.match(/role="group"/g) ?? []).length, 2);
  assert.match(markup, /aria-label="Zeitraum"[^>]*data-size="compact"[^>]*core-segmented-control/);
  assert.match(markup, /aria-label="CoRe-Modus"[^>]*data-size="regular"[^>]*core-segmented-control/);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 2);
  assert.equal((markup.match(/core-segmented-control-option/g) ?? []).length, 6);
  assert.doesNotMatch(markup, /<svg/);
});

test("segmented controls disable every option together", () => {
  const markup = renderToStaticMarkup(
    <CoreSegmentedControl
      ariaLabel="Aussetzstatus"
      options={[{ value: "active", label: "Nicht aussetzen" }, { value: "suspended", label: "Aussetzen" }]}
      value="active"
      disabled
      onValueChange={() => undefined}
    />,
  );

  assert.equal(markup.match(/disabled=""/g)?.length, 2);
});

test("segmented donut renders exact ordered values with a transparent framed center", () => {
  const markup = renderToStaticMarkup(
    <SegmentedDonut
      segments={[
        { key: "new", value: 1, color: "var(--core-learning-status-new)" },
        { key: "in-progress", value: 2, color: "var(--core-learning-status-in-progress)" },
        { key: "due", value: 0, color: "var(--core-learning-status-due)" },
        { key: "learned", value: 97, color: "var(--core-learning-status-learned)" },
      ]}
      ariaLabel="Gesamtfortschritt: 97 von 100 Karten gelernt."
      size="responsive"
    />,
  );

  assert.match(markup, /core-donut-responsive/);
  assert.match(markup, /role="img" aria-label="Gesamtfortschritt: 97 von 100 Karten gelernt\."/);
  assert.ok(markup.indexOf('data-donut-segment="new"') < markup.indexOf('data-donut-segment="in-progress"'));
  assert.ok(markup.indexOf('data-donut-segment="in-progress"') < markup.indexOf('data-donut-segment="learned"'));
  assert.match(markup, /data-donut-segment="new" data-donut-value="1"/);
  assert.match(markup, /data-donut-segment="in-progress" data-donut-value="2"/);
  assert.match(markup, /data-donut-segment="learned" data-donut-value="97"/);
  assert.doesNotMatch(markup, /data-donut-segment="due"/);
  assert.match(markup, /stroke="var\(--core-border\)" stroke-width="1"/);
  assert.doesNotMatch(markup, /bg-core-surface|core-donut-responsive-center|conic-gradient/);
  assert.doesNotMatch(markup, /md:size-/);
});

test("segmented donut renders full and empty distributions without inventing segments", () => {
  const full = renderToStaticMarkup(
    <SegmentedDonut
      segments={[{ key: "learned", value: 1, color: "var(--core-learning-status-learned)" }]}
      ariaLabel="Eine Karte gelernt."
    />,
  );
  const empty = renderToStaticMarkup(<SegmentedDonut segments={[]} ariaLabel="Keine aktiven Karten" size="compact" />);

  assert.match(full, /data-donut-segment="learned" data-donut-value="1"/);
  assert.doesNotMatch(full, /data-donut-empty/);
  assert.match(empty, /data-donut-empty="true"/);
  assert.match(empty, /fill="var\(--core-surface-muted\)"/);
  assert.match(empty, /aria-label="Keine aktiven Karten"/);
  assert.match(empty, /size-8/);
});
