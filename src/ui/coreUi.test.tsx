import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionDialog, CardMarkButton, CoreIconSegmentedControl, CoreModeControl, CoreSegmentedControl, CoreSlidingTabs, CoreTag, EmptyState, PageHeader, StatTile } from "./coreUi.tsx";
import { FileText, NotebookPen, Star } from "lucide-react";

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
    <PageHeader title="Lernen" action={<button type="button">Bereich</button>} />,
  );

  const header = markup.match(/<header[\s\S]*<\/header>/)?.[0] ?? "";
  assert.match(header, /<h2[^>]*data-screen-heading[^>]*>Lernen<\/h2>/);
  assert.match(header, /<button type="button">Bereich<\/button>/);
  assert.ok(header.indexOf("Lernen") < header.indexOf("Bereich"));
  assert.doesNotMatch(header, /<p/, "kein Eyebrow über dem Titel");
});

test("page header reads the greeting as the start of the heading and keeps a page tag outside its name", () => {
  const greeting = renderToStaticMarkup(<PageHeader greeting="Willkommen zurück," title="Noemi!" />);
  assert.match(greeting, /<p aria-hidden="true"[^>]*>Willkommen zurück,<\/p><h2[^>]*><span class="sr-only">Willkommen zurück, <\/span>Noemi!<\/h2>/);

  const tagged = renderToStaticMarkup(<PageHeader title="Simulator" tag={<CoreTag tone="neutral">Nur lokal</CoreTag>} />);
  assert.match(tagged, /<h2[^>]*>Simulator<\/h2><span class="core-tag core-tag-neutral">Nur lokal<\/span>/);
});

test("core tag offers five tones and an optional domain-colour dot", () => {
  for (const tone of ["neutral", "info", "warning", "success", "outline"] as const) {
    assert.match(renderToStaticMarkup(<CoreTag tone={tone}>Status</CoreTag>), new RegExp(`class="core-tag core-tag-${tone}">Status<`));
  }
  const dotted = renderToStaticMarkup(<CoreTag tone="neutral" dot="var(--core-exam-color-1)">Geografie</CoreTag>);
  assert.match(dotted, /<span aria-hidden="true" class="core-tag-dot" style="background:var\(--core-exam-color-1\)"><\/span>Geografie/);
});

test("stat tile renders a definition list without an icon tile, boxed or plain", () => {
  const boxed = renderToStaticMarkup(<StatTile size="compact" label="Reviews" value="12" />);
  assert.match(boxed, /<dl data-size="compact" data-variant="boxed" class="[^"]*border[^"]*"><dt class="core-status-label text-core-muted">Reviews<\/dt><dd class="core-metric[^"]*">12<\/dd><\/dl>/);
  const plain = renderToStaticMarkup(<StatTile variant="plain" label="Erfolgsrate" value="83,3 %" />);
  assert.match(plain, /<dl data-size="default" data-variant="plain" class="flex flex-col min-w-0">/);
  assert.doesNotMatch(plain, /border|rounded|shadow|<svg/);
});

test("empty state stands on a hairline surface with a free icon", () => {
  const markup = renderToStaticMarkup(<EmptyState icon={Star} title="Noch keine Karten" body="Erstelle deine erste Karte." />);
  assert.match(markup, /<section class="min-w-0 rounded-panel border border-core-border bg-core-surface p-7">/);
  assert.doesNotMatch(markup, /border-dashed|rounded-round|bg-core-subtle/);
  assert.match(markup, /<h3 class="core-heading-3 text-core-text">Noch keine Karten<\/h3>/);
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

test("segmented controls expose one icon-free pressed brick and the CoRe mode is a switch", () => {
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

  assert.equal((markup.match(/role="group"/g) ?? []).length, 1);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((markup.match(/aria-pressed="(true|false)"/g) ?? []).length, 3);
  assert.doesNotMatch(markup, /<svg/);
  assert.match(markup, /<input type="checkbox" role="switch" aria-label="CoRe-Modus" checked=""\/>/);
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
