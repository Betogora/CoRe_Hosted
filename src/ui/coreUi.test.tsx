import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionDialog, CardMarkButton, CoreIconSegmentedControl, CoreModeControl, CoreSegmentedControl, CoreSlidingTabs, PageHeader } from "./coreUi.tsx";
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
