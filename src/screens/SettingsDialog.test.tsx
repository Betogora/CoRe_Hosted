import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { SettingsSection } from "../appNavigation.ts";
import { SettingsDialog } from "./SettingsDialog.tsx";

function renderDialog(section: SettingsSection) {
  return renderToStaticMarkup(
    <SettingsDialog section={section} onSelectSection={() => undefined} onClose={() => undefined}>
      <p>Bereichsinhalt</p>
    </SettingsDialog>,
  );
}

test("the settings dialog is one labelled modal with its three area groups in the sidebar", () => {
  const html = renderDialog("lerntag");
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="[^"]+" data-testid="settings-dialog"/);
  assert.match(html, /<h2[^>]*>Einstellungen<\/h2>/);
  assert.match(html, /aria-label="Einstellungen schließen"/);
  assert.match(html, /<nav aria-label="Bereiche der Einstellungen"/);
  for (const label of ["Allgemein", "Konto", "Darstellung", "Daten &amp; Synchronisierung", "Über uns", "Lernen", "Lerntag &amp; Planung", "Flaggen", "Fokuswerkzeuge", "Stapel", "Einzelne Stapel", "Tagesrunde &amp; Lernprofile", "Scheduler &amp; CoRe"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.ok(html.indexOf(">Stapel</p>") < html.indexOf('data-settings-section="stapel"') && html.indexOf('data-settings-section="stapel"') < html.indexOf('data-settings-section="tagesrunde"'), "die Stapelwerte stehen in der Gruppe Stapel");
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.match(html, /aria-current="page" data-settings-section="lerntag"/);
  assert.match(html, />Bereichsinhalt</);
});

test("the start area shows the area list on narrow screens and Konto beside it on wide ones", () => {
  const start = renderDialog("start");
  assert.match(start, /data-settings-view="areas"/);
  assert.doesNotMatch(start, /aria-current="page"|Zurück zu den Bereichen/);
  assert.match(start, /data-settings-section="konto"[^>]*class="[^"]*md:bg-core-subtle/);

  const area = renderDialog("konflikte");
  assert.match(area, /data-settings-view="area"/);
  assert.match(area, /aria-label="Zurück zu den Bereichen"/);
  assert.match(area, /aria-current="page" data-settings-section="daten"/);
});
