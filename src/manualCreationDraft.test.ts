import assert from "node:assert/strict";
import test from "node:test";
import type { ManualImageAttachment } from "./creationWorkflow.ts";
import { clearManualDraft, restoredDraftDeck, restoreManualDraft, storeManualDraft, type ManualDraftSnapshot } from "./manualCreationDraft.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const SHA = "a".repeat(40);
const image: ManualImageAttachment = { sha1: SHA, name: SHA, originalName: "zelle.png", size: 3, mimeType: "image/png", blob: new Blob(["png"]) };

function snapshot(patch: Partial<ManualDraftSnapshot> = {}): ManualDraftSnapshot {
  return {
    targetDeckId: "deck-1",
    useNewDeck: false,
    deckName: "Manueller Kartenstapel",
    draft: { kind: "basic-reversed", front: `<p>Zelle <img src="${SHA}" alt=""></p>`, back: "<p>Antwort</p>", answerOptions: ["", ""], correctOptionIndices: [0], tags: ["bio"] },
    pinnedFields: { front: false, back: true },
    additionalFields: [{ id: "f1", name: "Hinweis", value: "<p>Merke</p>", role: "hint" }],
    typeIn: true,
    occlusion: null,
    ...patch,
  };
}

test("ein Entwurf übersteht den Bereichswechsel samt Bildern im Speicher dieser Seite", () => {
  const storage = new MemoryStorage();
  storeManualDraft("konto-a", snapshot(), [image], storage);
  const restored = restoreManualDraft("konto-a", storage);
  assert.deepEqual(restored?.snapshot, snapshot());
  assert.deepEqual(restored?.images, [image]);
  assert.equal(restored?.imagesLost, false);
  clearManualDraft("konto-a", storage);
  assert.equal(restoreManualDraft("konto-a", storage), null, "nach Speichern oder Verwerfen bleibt nichts zurück");
  assert.equal(storage.length, 0);
});

test("nach dem Neuladen fehlen die Bilder; der Entwurf zeigt sie nicht als vorhanden an", () => {
  const storage = new MemoryStorage();
  storeManualDraft("konto-a", snapshot({ occlusion: { image: SHA, mode: "hide-all-guess-one", masks: [{ id: "m1", ordinal: 1, alwaysOccluded: false, shape: { kind: "rect", left: 0.1, top: 0.1, width: 0.2, height: 0.2, angle: 0 } }] } }), [image], storage);
  // Ein anderes Konto belegt den Seitenspeicher: wie nach einem Neuladen sind die Bilder von Konto A fort.
  storeManualDraft("konto-b", snapshot(), [], new MemoryStorage());
  const restored = restoreManualDraft("konto-a", storage);
  assert.equal(restored?.imagesLost, true);
  assert.deepEqual(restored?.images, []);
  assert.equal(restored?.snapshot.draft.front, "<p>Zelle </p>");
  assert.deepEqual(restored?.snapshot.occlusion, { image: null, mode: "hide-all-guess-one", masks: [] });
  assert.equal(restored?.snapshot.draft.back, "<p>Antwort</p>");
});

test("Entwürfe anderer Konten, alter Schemata und unlesbare Werte werden verworfen", () => {
  const storage = new MemoryStorage();
  storeManualDraft("konto-b", snapshot(), [image], storage);
  assert.equal(restoreManualDraft("konto-a", storage), null);
  assert.equal(storage.getItem("core.manualDraft.v1.konto-b"), null, "der Entwurf eines anderen Kontos verlässt den Tab");

  storage.setItem("core.manualDraft.v1.konto-a", JSON.stringify({ version: 0, accountId: "konto-a", snapshot: snapshot() }));
  assert.equal(restoreManualDraft("konto-a", storage), null);
  assert.equal(storage.length, 0);

  storage.setItem("core.manualDraft.v1.konto-a", JSON.stringify({ version: 1, accountId: "konto-b", snapshot: snapshot() }));
  assert.equal(restoreManualDraft("konto-a", storage), null);

  storage.setItem("core.manualDraft.v1.konto-a", JSON.stringify({ version: 1, accountId: "konto-a", snapshot: { ...snapshot(), draft: { ...snapshot().draft, kind: "kprim" } } }));
  assert.equal(restoreManualDraft("konto-a", storage), null);

  storage.setItem("core.manualDraft.v1.konto-a", "{kaputt");
  assert.equal(restoreManualDraft("konto-a", storage), null);
  assert.equal(storage.length, 0);
});

test("ohne zugänglichen Speicher bleibt der Entwurf nur auf der Seite", () => {
  const blocked = { length: 0, key: () => null, getItem: () => null, removeItem: () => undefined, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(storeManualDraft("konto-a", snapshot(), [], blocked), false, "der Bereichswechsel muss dann nachfragen");
  assert.equal(restoreManualDraft("konto-a", null), null);
  clearManualDraft("konto-a", null);
});

test("ein voller Speicher stellt keinen älteren Entwurf wieder her", () => {
  const storage = new MemoryStorage();
  assert.equal(storeManualDraft("konto-a", snapshot(), [], storage), true);
  const full = Object.assign(storage, { setItem: () => { throw new Error("QuotaExceededError"); } });
  assert.equal(storeManualDraft("konto-a", snapshot({ deckName: "Neuer Stand" }), [], full), false);
  assert.equal(restoreManualDraft("konto-a", storage), null);
  clearManualDraft("konto-a", storage);
});

test("aus einem Stapel geöffnet gewinnt dieser Stapel, sonst kehrt der Entwurf in seinen zurück", () => {
  assert.equal(restoredDraftDeck("deck-y", "deck-x", ["deck-x", "deck-y"]), null);
  assert.equal(restoredDraftDeck("deck-y", "", ["deck-x", "deck-y"]), "deck-y");
  assert.equal(restoredDraftDeck("deck-y", "", ["deck-x"]), null, "ein gelöschter Stapel wird nicht gewählt");
  assert.equal(restoredDraftDeck("", "", ["deck-x"]), null, "ein Entwurf für einen neuen Stapel bleibt bei der Standardwahl");
});
