import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../../coreModel.ts";
import { AdvancedCardSearch, suggestedSearchName } from "./AdvancedCardSearch.tsx";
import { CardSearchBar } from "./CardSearchBar.tsx";
import { cardSearchConflicts } from "./cardSearchExpression.ts";
import { cardSearchConflictMessage, cardSearchTermLabel, createCardSearchMenu } from "./cardSearchMenu.ts";

const parent = createCoreDeck({ id: "deck-bio", name: "Biologie", source: "manual" });
const child = createCoreDeck({ id: "deck-zell", name: "Zellbiologie", source: "manual", parentDeckId: parent.id, hierarchyPath: ["Biologie", "Zellbiologie"] });
const menu = createCardSearchMenu({
  decks: [parent, child],
  tags: [{ tag: "Anatomie::Kopf", noteCount: 3, importedCount: 0 }, { tag: "Anatomie", noteCount: 5, importedCount: 0 }],
  flagNames: ["", "", "", "", "Prüfung", "", ""],
});

test("das Menü spiegelt Ankis Seitenleiste mit Begriffen je Zeile", () => {
  assert.deepEqual(menu.map((category) => category.label), ["Heute", "Kartenstatus", "Flaggen", "Stapel", "Tags", "Inhalt", "Zeitraum", "Werte", "Felder", "Gespeichert & Syntax"]);
  const items = (id: string) => menu.find((category) => category.id === id)!.items;
  assert.deepEqual(items("stapel").map((item) => [item.label, item.term, item.depth]), [["Biologie", "did:deck-bio", 0], ["Zellbiologie", "did:deck-zell", 1]]);
  assert.ok(items("stapel").every((item) => item.hideTerm), "Stapelzeilen zeigen keine technische ID");
  assert.deepEqual(items("tags").map((item) => [item.label, item.term, item.depth]), [["Anatomie", "tag:Anatomie", 0], ["Kopf", "tag:Anatomie::Kopf", 1], ["Ohne Tags", "tag:none", undefined]]);
  assert.equal(items("flaggen")[4].label, "Prüfung", "eigene Flaggennamen");
  const withTypes = createCardSearchMenu({ decks: [], tags: [], flagNames: [], noteTypes: [{ id: "a", name: "CoRe Lückentext" }, { id: "b", name: "CoRe Lückentext" }] });
  assert.deepEqual(withTypes.find((category) => category.id === "inhalt")!.items.filter((item) => item.term.startsWith("note:")).map((item) => item.term), ["note:CoRe_Lückentext"], "gleichnamige Notiztypen aus zwei Importen sind eine Zeile");
  assert.deepEqual(cardSearchTermLabel("-tag:Anatomie::Kopf", menu), { label: "Anatomie::Kopf", category: "Tags", negated: true });
  assert.deepEqual(cardSearchTermLabel("is:due", menu), { label: "Fällig", category: "Heute", negated: false });
  assert.deepEqual(cardSearchTermLabel("ursprung:scaleni", menu), { label: "ursprung:scaleni", category: null, negated: false });
  assert.deepEqual(cardSearchTermLabel("rated:1:1", menu), { label: "Nochmal", category: "Heute", negated: false });
  assert.deepEqual(cardSearchTermLabel("rated:7:1", menu), { label: "Nochmal, letzte 7 Tage", category: "Zeitraum", negated: false });
  assert.deepEqual(cardSearchTermLabel("-prop:ivl>=21", menu), { label: "Intervall ≥ 21 Tage", category: "Werte", negated: true });
  assert.deepEqual(cardSearchTermLabel("prop:d<7.5", menu), { label: "Schwierigkeit < 7,5", category: "Werte", negated: false });
  assert.equal(cardSearchTermLabel("prop:ivl=1", menu).label, "Intervall = 1 Tag");
});

test("Mit, Egal und Ohne zeigen den Stand des Suchausdrucks", () => {
  const markup = renderToStaticMarkup(<AdvancedCardSearch id="menu" query="herz is:due -prop:due&lt;0" onQueryChange={() => undefined} categories={menu} resultCount={12} onClose={() => undefined} savedSearches={[]} onSavedSearchesChange={() => undefined} />);
  assert.match(markup, /data-testid="card-search-expression"[\s\S]*?herz is:due -prop:due&lt;0/);
  assert.match(markup, /role="radiogroup" aria-label="Fällig"[^>]*data-tri-value="in"/);
  assert.match(markup, /role="radiogroup" aria-label="Morgen fällig"[^>]*data-tri-value="any"/);
  assert.match(markup, /role="radiogroup" aria-label="Überfällig"[^>]*data-tri-value="out"/);
  assert.match(markup, /Heute<\/span><span[^>]*aria-label="2 aktiv"/, "Mit und Ohne zählen als aktive Filter der Kategorie");
  assert.match(markup, /12 Karten anzeigen/);
});

test("Chips nennen Kategorie, Wert und Ausschluss; der Stapelfilter zeigt den Namen", () => {
  const markup = renderToStaticMarkup(<CardSearchBar
    query="lunge did:deck-zell is:due -tag:Anatomie::Kopf"
    onQueryChange={() => undefined}
    decks={[parent, child]}
    categories={menu}
    advancedOpen={false}
    onAdvancedOpenChange={() => undefined}
    advancedId="menu"
    resultCount={3}
    placeholder="Suchen"
  />);
  assert.match(markup, /value="lunge"/, "das Suchfeld zeigt nur den Text");
  assert.match(markup, /aria-label="2 Filter aktiv"/, "der Stapelfilter zählt nicht im Menüzähler");
  assert.match(markup, />3 Karten</);
  assert.match(markup, /Stapel<\/span><span[^>]*>Zellbiologie/);
  assert.match(markup, /Heute<\/span><span[^>]*>Fällig/);
  assert.match(markup, /ohne Tags<\/span><span[^>]*>Anatomie::Kopf/);
  assert.match(markup, /Alle zurücksetzen/);
});

test("Zeitraum und Werte zählen nur Begriffe, die keine feste Zeile haben", () => {
  const markup = renderToStaticMarkup(<AdvancedCardSearch id="menu" query="rated:1 rated:7 -prop:lapses>3" onQueryChange={() => undefined} categories={menu} resultCount={null} onClose={() => undefined} savedSearches={[]} onSavedSearchesChange={() => undefined} />);
  assert.match(markup, /Heute<\/span><span[^>]*aria-label="1 aktiv"/, "rated:1 ist die Zeile Gelernt unter Heute");
  assert.match(markup, /Zeitraum<\/span><span[^>]*aria-label="1 aktiv"/);
  assert.match(markup, /Werte<\/span><span[^>]*aria-label="1 aktiv"/);
});

test("eine neue gespeicherte Suche heißt wie ihre Filter und ihr Text", () => {
  assert.equal(suggestedSearchName("lunge did:deck-zell rated:7:1 -is:cloze", menu), "Zellbiologie, Nochmal, letzte 7 Tage, ohne Lückentext, lunge");
  assert.equal(suggestedSearchName("x".repeat(80), menu).length, 60);
  const markup = renderToStaticMarkup(<AdvancedCardSearch id="menu" query="" onQueryChange={() => undefined} categories={menu} resultCount={null} onClose={() => undefined} savedSearches={[]} onSavedSearchesChange={() => undefined} />);
  assert.match(markup, /disabled=""[^>]*aria-label="Suche speichern"/, "ein leerer Ausdruck lässt sich nicht speichern");
  assert.match(markup, />Keine Filter</);
  assert.match(markup, /Alle Karten anzeigen/, "ohne Suchausdruck zeigt der Knopf alle Karten");
  assert.doesNotMatch(markup, />Zurücksetzen<|aria-label="Zurücksetzen"/, "ohne Suchausdruck gibt es nichts zurückzusetzen");
});

test("eine reine Textsuche nennt ihre Trefferzahl ohne Filterchips", () => {
  const markup = renderToStaticMarkup(<CardSearchBar query="lunge" onQueryChange={() => undefined} decks={[parent]} categories={menu} advancedOpen={false} onAdvancedOpenChange={() => undefined} advancedId="menu" resultCount={3} placeholder="Suchen" />);
  assert.match(markup, />3 Karten</);
  assert.doesNotMatch(markup, /Aktive Filter|Alle zurücksetzen/);
});

test("eine Menügruppe ist ein Chip mit „oder“, ihre Zeilen stehen auf Mit (KV2d)", () => {
  assert.deepEqual(cardSearchTermLabel("(flag:5 or flag:0)", menu), { label: "Prüfung oder Ohne Flagge", category: "Flaggen", negated: false });
  const bar = renderToStaticMarkup(<CardSearchBar query="herz (flag:5 or flag:0)" onQueryChange={() => undefined} decks={[parent]} categories={menu} advancedOpen={false} onAdvancedOpenChange={() => undefined} advancedId="menu" resultCount={2} placeholder="Suchen" />);
  assert.match(bar, /Flaggen<\/span><span[^>]*>Prüfung oder Ohne Flagge/);
  assert.match(bar, /aria-label="1 Filter aktiv"/, "eine Gruppe zählt als ein Filter");
  const menuMarkup = renderToStaticMarkup(<AdvancedCardSearch id="menu" query="(is:due or prop:due=1)" onQueryChange={() => undefined} categories={menu} resultCount={null} onClose={() => undefined} savedSearches={[]} onSavedSearchesChange={() => undefined} />);
  assert.match(menuMarkup, /role="radiogroup" aria-label="Fällig"[^>]*data-tri-value="in"/);
  assert.match(menuMarkup, /role="radiogroup" aria-label="Morgen fällig"[^>]*data-tri-value="in"/);
});

test("jede Stellung nennt ausführlich, was der Filter mit den Karten macht (5.4)", () => {
  const markup = renderToStaticMarkup(<AdvancedCardSearch id="menu" query="-prop:due&lt;0" onQueryChange={() => undefined} categories={menu} resultCount={null} onClose={() => undefined} savedSearches={[]} onSavedSearchesChange={() => undefined} />);
  assert.match(markup, /aria-checked="false" aria-label="Überfällig: nur überfällige Karten zeigen"/);
  assert.match(markup, /aria-checked="false" aria-label="Überfällig: nicht filtern"/);
  assert.match(markup, /aria-checked="true" aria-label="Überfällig: überfällige Karten ausblenden"/);
  assert.match(markup, /aria-label="Fällig: nur heute fällige Karten zeigen"/);
  const items = menu.flatMap((category) => category.items);
  assert.ok(items.length && items.every((item) => item.description.trim()), "jeder Menüeintrag beschreibt seine Karten");
});

test("Filter, die sich ausschließen, bleiben erlaubt und werden benannt (5.5)", () => {
  assert.deepEqual(cardSearchConflicts("is:new prop:due<0"), [["is:new", "prop:due<0"]]);
  assert.deepEqual(cardSearchConflicts("is:suspended herz -is:suspended"), [["is:suspended", "-is:suspended"]]);
  assert.deepEqual(cardSearchConflicts("is:new is:mature"), [["is:new", "is:mature"]]);
  assert.deepEqual(cardSearchConflicts("is:young is:mature flag:1 flag:2"), [["is:young", "is:mature"], ["flag:1", "flag:2"]]);
  assert.deepEqual(cardSearchConflicts("is:due prop:due=1"), [["is:due", "prop:due=1"]]);
  assert.deepEqual(cardSearchConflicts("is:due is:suspended"), [["is:due", "is:suspended"]]);
  assert.deepEqual(cardSearchConflicts("tag:none tag:Anatomie is:cloze is:choice card:1 card:2"), [["tag:none", "tag:Anatomie"], ["is:cloze", "is:choice"], ["card:1", "card:2"]]);
  assert.deepEqual(cardSearchConflicts("is:new prop:ivl>=21"), [["is:new", "prop:ivl>=21"]], "neue Karten haben kein Intervall");
  assert.deepEqual(cardSearchConflicts("(is:new or is:learn) -is:new -is:learn"), [["(is:new or is:learn)", "-is:new", "-is:learn"]]);
  assert.deepEqual(cardSearchConflicts("(is:new or is:learn) -(is:new or is:learn)"), [["(is:new or is:learn)", "-(is:new or is:learn)"]]);
  for (const query of [
    "is:new prop:reps=0",
    "prop:due<0 is:due",
    "prop:due<0 is:suspended",
    "(is:new or is:learn) prop:due<0",
    "(is:new or is:learn) -is:new",
    "(flag:1 or flag:2) flag:2",
    "is:new or prop:due<0",
    "is:learn is:due tag:Anatomie tag:Kopf",
    "is:new -prop:due<0",
  ]) assert.deepEqual(cardSearchConflicts(query), [], query);
});

test("der Hinweis nennt die widersprüchlichen Filter samt Kategorie im Menü und unter der Suchzeile (5.5)", () => {
  assert.equal(cardSearchConflictMessage("is:new prop:due<0", menu), "So passt keine Karte: „Neu“ (Kartenstatus) und „Überfällig“ (Heute) schließen sich aus.");
  assert.equal(cardSearchConflictMessage("is:suspended -is:suspended is:due prop:due=1", menu), "So passt keine Karte: „Ausgesetzt“ (Kartenstatus) und „Fällig“ (Heute) schließen sich aus. „Ausgesetzt“ und „ohne Ausgesetzt“ (Kartenstatus) schließen sich aus. „Fällig“ und „Morgen fällig“ (Heute) schließen sich aus.");
  assert.equal(cardSearchConflictMessage("is:new herz", menu), null);
  const advanced = renderToStaticMarkup(<AdvancedCardSearch id="menu" query="is:new prop:due&lt;0" onQueryChange={() => undefined} categories={menu} resultCount={0} onClose={() => undefined} savedSearches={[]} onSavedSearchesChange={() => undefined} />);
  assert.match(advanced, /data-testid="card-search-conflict" role="status"[\s\S]*?„Neu“ \(Kartenstatus\) und „Überfällig“ \(Heute\) schließen sich aus\./);
  const bar = (advancedOpen: boolean) => renderToStaticMarkup(<CardSearchBar query="is:new prop:due&lt;0" onQueryChange={() => undefined} decks={[parent]} categories={menu} advancedOpen={advancedOpen} onAdvancedOpenChange={() => undefined} advancedId="menu" resultCount={0} placeholder="Suchen" />);
  assert.match(bar(false), /data-testid="card-search-conflict"/);
  assert.doesNotMatch(bar(true), /card-search-conflict/, "das offene Menü zeigt den Hinweis selbst");
  assert.match(bar(false), /Alle zurücksetzen/);
  assert.doesNotMatch(bar(true), /Alle zurücksetzen/, "das offene Menü setzt mit seiner eigenen Aktion zurück");
});
