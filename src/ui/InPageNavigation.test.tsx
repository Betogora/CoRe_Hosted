import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Clock3, Database, User } from "lucide-react";
import { InPageNavigation } from "./InPageNavigation.tsx";

test("in-page navigation renders icon links for desktop and compact layouts", () => {
  const markup = renderToStaticMarkup(
    <InPageNavigation
      ariaLabel="Einstellungsbereiche"
      items={[
        { id: "konto", label: "Konto", icon: User },
        { id: "lerntag", label: "Lerntag & Fokus", icon: Clock3 },
        { id: "daten", label: "Daten & Synchronisierung", icon: Database },
      ]}
    >
      <section id="konto"><h2>Konto</h2></section>
    </InPageNavigation>,
  );

  assert.equal(markup.match(/<nav aria-label="Einstellungsbereiche"/g)?.length, 2);
  assert.match(markup, /data-in-page-navigation="desktop"/);
  assert.match(markup, /data-in-page-navigation="compact"/);
  assert.equal(markup.match(/href="#konto"/g)?.length, 2);
  assert.equal(markup.match(/href="#lerntag"/g)?.length, 2);
  assert.equal(markup.match(/href="#daten"/g)?.length, 2);
  assert.equal(markup.match(/aria-current="location"/g)?.length, 1);
  assert.match(markup, /lucide-user/);
  assert.match(markup, /lucide-clock3/);
  assert.match(markup, /lucide-database/);
  assert.doesNotMatch(markup, /Profil und Darstellung|Tagesbeginn und Fokus|Sync und Privatsphäre/);
  assert.doesNotMatch(markup, /Alle Bereiche|\d+\s*\/\s*\d+|bg-core-info-soft|md:grid-cols-3/);
});
