import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Clock3, Database, User } from "lucide-react";
import { SettingsSectionNavigation } from "./settingsNavigation.tsx";

test("settings section navigation renders responsive native actions with three semantic tones", () => {
  const markup = renderToStaticMarkup(
    <SettingsSectionNavigation
      ariaLabel="Einstellungsbereiche"
      items={[
        { id: "konto", title: "Konto", status: "Profil und Darstellung", icon: User, tone: "info", onSelect: () => undefined },
        { id: "lerntag", title: "Lerntag", status: "Tagesbeginn und Fokus", icon: Clock3, tone: "success", onSelect: () => undefined },
        { id: "daten", title: "Daten", status: "Sync und Privatsphäre", icon: Database, tone: "warning", href: "#daten" },
      ]}
    />,
  );

  assert.match(markup, /<nav aria-label="Einstellungsbereiche"/);
  assert.match(markup, /grid gap-3 md:grid-cols-3/);
  assert.equal(markup.match(/<li class="min-w-0">/g)?.length, 3);
  assert.match(markup, /<button type="button"/);
  assert.match(markup, /<a href="#daten"/);
  for (const tone of ["info", "success", "warning"]) {
    assert.match(markup, new RegExp(`bg-core-${tone}-soft`));
  }
  for (const text of ["Konto", "Profil und Darstellung", "Lerntag", "Tagesbeginn und Fokus", "Daten", "Sync und Privatsphäre"]) {
    assert.match(markup, new RegExp(`>${text}<`));
  }
});
