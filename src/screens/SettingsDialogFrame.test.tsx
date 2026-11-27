import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Layers, Settings, Sparkles } from "lucide-react";
import { SettingsDialogFrame } from "./SettingsDialogFrame.tsx";

function renderFrame({ showAreaList = false, withBack = true, parent = false }: { showAreaList?: boolean; withBack?: boolean; parent?: boolean } = {}) {
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
      back={parent ? { label: "Einstellungen", icon: Settings, onSelect: () => undefined } : undefined}
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

test("a dialog below another one leads back to it before its title: narrow by its icon, wide by its name", () => {
  assert.doesNotMatch(renderFrame(), /data-settings-back/);
  const back = (html: string) => html.match(/<button type="button" aria-label="Zurück zu Einstellungen" data-settings-back="true" class="([^"]*)">(.*?)<\/button>(<svg[^>]*>)/) ?? [];
  const [, areaClass, content, separator] = back(renderFrame({ parent: true }));
  assert.match(content, /^<svg[^>]*lucide-settings shrink-0 md:hidden[^>]*>.*?<\/svg><svg[^>]*lucide-chevron-left hidden shrink-0 md:block[^>]*>.*?<\/svg><span class="hidden core-heading-3 md:inline">Einstellungen<\/span>$/);
  assert.match(separator, /lucide-chevron-right/);
  assert.match(areaClass, /^flex .*max-md:-ml-2$/, "schmal steht das Icon direkt hinter dem Pfeil zur Bereichsliste");
  assert.match(renderFrame({ parent: true }), /aria-label="Zurück zu den Bereichen"/);
  const areas = renderFrame({ parent: true, showAreaList: true });
  assert.doesNotMatch(back(areas)[1], /max-md:-ml-2/);
  assert.doesNotMatch(areas, /Zurück zu den Bereichen/);
});
