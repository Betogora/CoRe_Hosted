import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { appRouteToUrl, createViewRoute, HELP_TOPICS, parseAppRouteFromUrl, type HelpTopic } from "../appNavigation.ts";
import { projectAppRoute } from "../useAppNavigation.ts";
import { HelpScreen } from "./HelpScreen.tsx";

const render = (topic: HelpTopic | null) => renderToStaticMarkup(<HelpScreen topic={topic} onSelectTopic={() => undefined} />);

test("the help entry shows the essentials and links every topic as its own page", () => {
  const markup = render(null);

  assert.match(markup, /<h2[^>]*data-screen-heading[^>]*>Hilfe<\/h2>/);
  assert.doesNotMatch(markup, /Hilfe<\/button>/);
  assert.match(markup, /<section[^>]*aria-labelledby="help-intro-heading"[\s\S]*?<h3 id="help-intro-heading"[^>]*>So lernst du mit CoRe<\/h3>/);
  assert.match(markup, /<h3 id="help-rating-heading"[^>]*>So bewertest du<\/h3>/);
  // The rating guide takes its example from the real scheduler at the default deck settings.
  assert.match(markup, /Mit 93 % Zielerinnerung kommt eine neue Karte, immer mit „Gut“ bewertet, nach 10 Minuten und dann nach 4, 16, 44 und 112 Tagen wieder\./);
  assert.match(markup, /<nav[^>]*aria-labelledby="help-topics-heading"/);
  for (const topic of HELP_TOPICS) {
    assert.match(markup, new RegExp(`<a href="/hilfe\\?topic=${topic}"[^>]*data-help-topic-link="${topic}"`));
  }
  // Depth stays on the topic pages.
  assert.doesNotMatch(markup, /data-testid="active-recall-visual"|data-testid="spaced-repetition-visual"|help-card-management|help-exam-session|ABC of FSRS/);
});

test("a topic page carries its title, a way back to the entry and the full depth", () => {
  const pages: ReadonlyArray<[HelpTopic, string, RegExp]> = [
    ["active-recall", "Active Recall wird Smarter Recall", /data-testid="active-recall-visual"[\s\S]*CoRe verändert die Frage, nicht das Wissen/],
    ["spaced-repetition", "Spaced Repetition wird Content Repetition", /CoRe nutzt dafür den FSRS-Algorithmus[\s\S]*data-testid="spaced-repetition-visual"/],
    ["planung", "So plant CoRe deine Wiederholungen", /So arbeitet ein Spaced-Repetition-Scheduler[\s\S]*Transparenz zum aktuellen Scheduler[\s\S]*R · Abrufwahrscheinlichkeit[\s\S]*href="https:\/\/github\.com\/open-spaced-repetition\/awesome-fsrs\/wiki\/ABC-of-FSRS"/],
    ["varianten", "Was bei Varianten geschützt bleibt", /Genau eine Originalkarte bleibt als Vertrauensanker erhalten\./],
    ["pruefungssitzung", "So läuft eine Prüfungssitzung", /Die Zielkarten eines Tages bleiben fest\./],
    ["kartenverwaltung", "So arbeitest du in der Kartenverwaltung", /<code>is:due<\/code>[\s\S]*<kbd>Strg<\/kbd>\+<kbd>Z<\/kbd>/],
  ];
  for (const [topic, title, content] of pages) {
    const markup = render(topic);
    assert.match(markup, new RegExp(`data-help-topic="${topic}"`));
    assert.match(markup, /<button[^>]*>[\s\S]*?Hilfe<\/button>/, `${topic}: Rücklink fehlt`);
    assert.match(markup, new RegExp(`<h2[^>]*data-screen-heading[^>]*>${title}</h2>`));
    assert.match(markup, content);
    assert.doesNotMatch(markup, /So lernst du mit CoRe|data-help-topic-link/);
    // Below the page title the levels continue at three, so the outline stays intact.
    assert.doesNotMatch(markup, /<h2(?![^>]*data-screen-heading)/);
  }
});

test("entry, topic and back are browser history entries with shareable URLs", () => {
  const entry = parseAppRouteFromUrl("/hilfe");
  assert.equal(projectAppRoute(entry).helpTopic, null);

  const topic = createViewRoute("hilfe", { helpTopic: "spaced-repetition" });
  assert.equal(appRouteToUrl(topic), "/hilfe?topic=spaced-repetition");
  assert.deepEqual(parseAppRouteFromUrl(appRouteToUrl(topic)), topic);
  assert.equal(projectAppRoute(parseAppRouteFromUrl("/hilfe?topic=spaced-repetition")).helpTopic, "spaced-repetition");

  assert.equal(appRouteToUrl(createViewRoute("hilfe")), "/hilfe");
  assert.equal(projectAppRoute(parseAppRouteFromUrl("/hilfe?topic=unbekannt")).helpTopic, null);
  assert.equal(projectAppRoute(parseAppRouteFromUrl("/lernen?topic=planung")).helpTopic, null);
});
