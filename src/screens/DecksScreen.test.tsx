import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createManualCoreDeck, updateCardContent } from "../coreModel.ts";
import { DecksScreen } from "./DecksScreen.tsx";

test("deck management exposes explicit move, restore and collapsed Labs tools", () => {
  const originalDeck = createManualCoreDeck({
    deckName: "Biologie",
    card: { cardType: "basic", front: "Was ist ATP?", back: "Ein Energieträger." },
  });
  const editedCard = updateCardContent(originalDeck.cards[0], { originalFront: "Welche Funktion hat ATP?" });
  const deck = { ...originalDeck, cards: [editedCard] };
  const markup = renderToStaticMarkup(
    <DecksScreen
      decks={[deck]}
      onSetDeckCoreMode={() => undefined}
      onSaveCard={() => undefined}
      onDeleteCard={() => undefined}
      onRestoreCard={() => undefined}
      onAddVariant={() => undefined}
      onApplyVariantJson={() => undefined}
      onStartDeck={() => undefined}
      onDeleteDeck={() => undefined}
      onRenameDeck={() => undefined}
      onMoveDeck={() => undefined}
      onOpenCardCreation={() => undefined}
      onPrepareSubdeckCreation={() => undefined}
    />,
  );

  assert.match(markup, /Biologie verschieben/);
  assert.match(markup, /aria-label="Kartenstapel durchsuchen"/);
  assert.match(markup, /aria-label="Kartenstapel nach CoRe-Modus filtern"/);
  assert.match(markup, /aria-label="Biologie lernen"/);
  assert.match(markup, /aria-label="Biologie mit Varianten lernen"/);
  assert.match(markup, /Version zum Wiederherstellen/);
  assert.match(markup, /Labs \/ Erweitert: Varianten und technische Lernwerte/);
  assert.match(markup, /<details[^>]*data-testid="card-labs-tools"/);
  assert.doesNotMatch(markup, /draggable=/);
});
