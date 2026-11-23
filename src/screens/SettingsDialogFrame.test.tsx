import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Layers, Sparkles } from "lucide-react";
import { SettingsDialogFrame } from "./SettingsDialogFrame.tsx";

function renderFrame({ showAreaList = false, withBack = true }: { showAreaList?: boolean; withBack?: boolean } = {}) {
  return renderToStaticMarkup(
    <SettingsDialogFrame<"a" | "b">
      title="Rahmen"
      closeLabel="Rahmen schließen"
      navigationLabel="Bereiche des Rahmens"
      testId="frame"
      groups={[{ items: [{ section: "a", label: "Erster Bereich", icon: Layers }, { section: "b", label: "Zweiter Bereich", icon: Sparkles }] }]}
      activeSection="b"
      showAreaList={showAreaList}
      onSelectSection={() => undefined}
      onShowAreaList={withBack ? () => undefined : undefined}
      onClose={() => undefined}
      navigationHeader={<span>Kopfinhalt</span>}
      footer="Fußzeile"
    >
      <p>Inhalt</p>
    </SettingsDialogFrame>,
  );
}

test("the frame labels its dialog, areas and close action from its caller", () => {
  const html = renderFrame();
  assert.match(html, /data-testid="frame-backdrop"/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="[^"]+" data-testid="frame" data-settings-view="area"/);
  assert.match(html, /aria-label="Rahmen schließen"/);
  assert.match(html, /<nav aria-label="Bereiche des Rahmens"[^>]*><div class="grid gap-2 md:w-0 md:min-w-full"><span>Kopfinhalt<\/span><\/div>/, "der Spaltenkopf weitet die Spalte nicht");
  assert.match(html, /<nav [^>]*class="[^"]*lg:w-max/, "die Spalte ist so breit wie ihr längster Bereich");
  assert.equal(html.match(/data-label="(?:Erster|Zweiter) Bereich" class="[^"]*after:font-semibold after:content-\[attr\(data-label\)\]/g)?.length, 2, "jeder Bereich reserviert seine fette Breite");
  assert.match(html, /<header class="core-dialog-header [^"]*">.*<button type="button" aria-label="Rahmen schließen" class="core-action-ghost core-close-button"/);
  assert.doesNotMatch(html, /core-caption font-medium text-core-muted/);
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.match(html, /aria-current="page" data-settings-section="b"/);
  assert.match(html, />Inhalt</);
  assert.match(html, />Fußzeile</);
});

test("the area list marks no current area and the back button needs a target", () => {
  const areas = renderFrame({ showAreaList: true });
  assert.match(areas, /data-settings-view="areas"/);
  assert.doesNotMatch(areas, /aria-current="page"|Zurück zu den Bereichen/);
  assert.match(renderFrame(), /aria-label="Zurück zu den Bereichen"/);
  assert.doesNotMatch(renderFrame({ withBack: false }), /Zurück zu den Bereichen/);
});
