import assert from "node:assert/strict";
import test from "node:test";
import { draftToSettle } from "./useNavigationGuard.ts";

test("ein Entwurf hält nur das Verlassen seiner Ansicht auf", () => {
  const card = { kartenstapel: { saving: false, focus: null } };
  assert.equal(draftToSettle("kartenstapel", "lernen", card), "kartenstapel");
  assert.equal(draftToSettle("kartenstapel", "kartenstapel", card), null, "Wechsel innerhalb der Ansicht regelt der Bildschirm selbst");
  assert.equal(draftToSettle("lernen", "kartenstapel", card), null, "eine Ansicht ohne Entwurf hält nichts auf");
  assert.equal(draftToSettle("kartenstapel", "lernen", {}), null);
  assert.equal(draftToSettle("neue-karten", "uebersicht", { "neue-karten": { saving: true, focus: null } }), "neue-karten");
});
