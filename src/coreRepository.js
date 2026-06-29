const STORAGE_KEY = "core.importedDecks.v1";

function readStoredDecks() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredDecks(decks) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

export function createCoreRepository() {
  return {
    listDecks() {
      return readStoredDecks();
    },
    saveDeck(deck) {
      const existingDecks = readStoredDecks().filter((storedDeck) => storedDeck.id !== deck.id);
      const nextDecks = [deck, ...existingDecks];
      writeStoredDecks(nextDecks);
      return deck;
    },
    clear() {
      writeStoredDecks([]);
    },
  };
}
