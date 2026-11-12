import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricRow } from "./MetricRow.tsx";

test("metric row is one definition list with label before value, dots and muted zeros", () => {
  const markup = renderToStaticMarkup(
    <MetricRow
      aria-label="Heute"
      items={[
        { label: "Gelernt", value: 9, dot: "var(--core-learning-progress-completed)" },
        { label: "Neu", value: "107", dot: "var(--core-learning-status-new)" },
        { label: "Fällig", value: 0 },
      ]}
    />,
  );

  assert.equal(markup.match(/<dl/g)?.length, 1);
  assert.match(markup, /<dl aria-label="Heute" style="--core-metric-columns:3;--core-metric-columns-medium:3">/);
  assert.match(markup, /<dt class="core-metric-row-label"><span aria-hidden="true" class="core-metric-row-dot" style="background:var\(--core-learning-status-new\)"><\/span>Neu<\/dt><dd class="core-metric text-core-text">107<\/dd>/);
  assert.match(markup, /<dt class="core-metric-row-label">Fällig<\/dt><dd class="core-metric text-core-muted" data-zero="true">0<\/dd>/);
  assert.doesNotMatch(markup, /<svg|rounded/);
});

test("metric row caps the medium layout at four columns", () => {
  const items = ["Reviews", "Erfolgsrate", "Wahre Quote", "Lernzeit", "Zeit pro Antwort", "Lerntage", "Serie"].map((label, index) => ({ label, value: index + 1 }));
  const markup = renderToStaticMarkup(<MetricRow items={items} />);

  assert.match(markup, /--core-metric-columns:7;--core-metric-columns-medium:4/);
  assert.equal(markup.match(/<dt /g)?.length, 7);
});
