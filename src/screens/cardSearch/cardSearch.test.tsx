import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreDeck } from "../../coreModel.ts";
import { AdvancedCardSearch, suggestedSearchName } from "./AdvancedCardSearch.tsx";
import { CardSearchBar } from "./CardSearchBar.tsx";
import { cardSearchTermLabel, createCardSearchMenu } from "./cardSearchMenu.ts";

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
});
