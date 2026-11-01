import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionDialog, CardMarkButton, CoreIconSegmentedControl, CoreModeControl, CoreSegmentedControl, CoreSlidingTabs, PageHeader, SegmentedDonut } from "./coreUi.tsx";
import { FileText, NotebookPen } from "lucide-react";

test("sliding tabs keep every icon and accessible label but show only the selected label", () => {
  const markup = renderToStaticMarkup(<CoreSlidingTabs ariaLabel="Stapelinhalte" options={[
    { value: "cards", label: "Karteikarten", icon: FileText },
    { value: "notes", label: "Notizen", icon: NotebookPen },
  ]} value="notes" onValueChange={() => undefined} />);
  assert.match(markup, /role="group" aria-label="Stapelinhalte"/);
  assert.match(markup, /aria-pressed="false" aria-label="Karteikarten"/);
  assert.match(markup, /<span class="sr-only">Karteikarten<\/span>/);
  assert.match(markup, /aria-pressed="true" aria-label="Notizen"/);
  assert.match(markup, />Notizen<\/span>/);
  assert.doesNotMatch(markup, /<span class="sr-only">Notizen<\/span>/);
  assert.equal((markup.match(/<svg/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /disabled=/);
});

test("icon segmented control names every option without visible labels and adds tooltips", () => {
  const markup = renderToStaticMarkup(<CoreIconSegmentedControl ariaLabel="Stapelansicht" options={[
    { value: "tiles", label: "Als Kacheln anzeigen", icon: FileText },
    { value: "list", label: "Als Liste anzeigen", icon: NotebookPen },
  ]} value="list" onValueChange={() => undefined} />);
  assert.match(markup, /role="group" aria-label="Stapelansicht"/);
  assert.match(markup, /aria-pressed="false" aria-label="Als Kacheln anzeigen"/);
  assert.match(markup, /aria-pressed="true" aria-label="Als Liste anzeigen"/);
  assert.match(markup, /data-core-tooltip="Als Kacheln anzeigen"/);
  assert.doesNotMatch(markup, /<span/);
  assert.equal((markup.match(/<svg/g) ?? []).length, 2);
});

test("page header keeps an optional action inside the header after its title", () => {
  const markup = renderToStaticMarkup(
    <PageHeader eyebrow="Review" title="Lernen" action={<button type="button">Bereich</button>} />,
  );

  const header = markup.match(/<header[\s\S]*<\/header>/)?.[0] ?? "";
  assert.match(header, /<h2[^>]*data-screen-heading[^>]*>Lernen<\/h2>/);
  assert.match(header, /<button type="button">Bereich<\/button>/);
  assert.ok(header.indexOf("Lernen") < header.indexOf("Bereich"));
});

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

test("action dialog presents a prompt without description with two equal secondary actions", () => {
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

  assert.doesNotMatch(markup, /aria-describedby=/);
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

test("shared card mark control exposes pressed semantics", () => {
  const markup = renderToStaticMarkup(<CardMarkButton marked onMarkedChange={() => undefined} />);

  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-label="Markierung entfernen"/);
  assert.match(markup, /fill="currentColor"/);
});

test("segmented controls expose one icon-free pressed brick", () => {
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
      />
      <CoreModeControl value="on" onChange={() => undefined} />
    </>,
  );

  assert.equal((markup.match(/role="group"/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-pressed="(true|false)"/g) ?? []).length, 5);
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

  assert.match(markup, /role="img" aria-label="Gesamtfortschritt: 97 von 100 Karten gelernt\."/);
  assert.ok(markup.indexOf('data-donut-segment="new"') < markup.indexOf('data-donut-segment="in-progress"'));
  assert.ok(markup.indexOf('data-donut-segment="in-progress"') < markup.indexOf('data-donut-segment="learned"'));
  assert.match(markup, /data-donut-segment="new" data-donut-value="1"/);
  assert.match(markup, /data-donut-segment="in-progress" data-donut-value="2"/);
  assert.match(markup, /data-donut-segment="learned" data-donut-value="97"/);
  assert.doesNotMatch(markup, /data-donut-segment="due"/);
  assert.match(markup, /stroke="var\(--core-border\)" stroke-width="1"/);
  assert.equal((markup.match(/<path/g) ?? []).length, 3);
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
});
