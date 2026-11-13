import assert from "node:assert/strict";
import test from "node:test";
import { createBasicNote, createNote } from "../coreModel.ts";
import type { NoteContent, NoteField } from "../coreTypes.ts";
import type { NotePresentationResult } from "../notePresentation.ts";
import { preparedAnswerFrame, preparesAnswerAhead, revealLabel } from "./NoteCardContent.tsx";

const field = (id: string, role: NoteField["role"], html: string): NoteField => ({ id, name: id, role, html });
const graph = (fields: NoteField[], interaction: NoteContent["interaction"]) => createNote({ deckId: "deck", content: { schemaVersion: 1, fields, interaction, speech: [], tags: [] } });
const answer = (layout: NotePresentationResult["layout"], interactions: NotePresentationResult["interactions"] = []): NotePresentationResult => ({ srcdoc: "", accessibleText: "", mediaReferences: [], interactions, diagnostics: [], layout });
const reveal = (typeInFieldId: string | null): NoteContent["interaction"] => ({ kind: "reveal", prompts: [{ key: "forward", name: "Vorwärts", instruction: "", questionFieldIds: ["Frage"], answerFieldIds: ["Antwort"], requires: null, typeInFieldId }] });

test("the answer side is prepared ahead only where it does not follow input made before revealing", () => {
  const basic = createBasicNote("deck", "Hauptstadt von Portugal?", "Lissabon");
  const cloze = graph([field("Text", "prompt", "{{c1::Insulin}} senkt den Blutzucker.")], { kind: "cloze" });
  const occlusion = graph([field("Frage", "prompt", "Welcher Bereich?")], { kind: "image-occlusion", image: "herz.png", mode: "hide-one-guess-one", masks: [
    { id: "a", ordinal: 1, shape: { kind: "rect", left: 0.1, top: 0.1, width: 0.2, height: 0.2, angle: 0 }, alwaysOccluded: false },
  ] });
  const typed = graph([field("Frage", "prompt", "Welches Organ pumpt Blut?"), field("Antwort", "answer", "Herz")], reveal("Antwort"));
  const prepared = (item: { note: Parameters<typeof preparesAnswerAhead>[0]; cards: Array<Parameters<typeof preparesAnswerAhead>[1]> }, surface: "review" | "preview" | "management" = "review", side = answer("core")) => preparesAnswerAhead(item.note, item.cards[0], surface, side);

  assert.equal(prepared(basic), true);
  assert.equal(prepared(cloze), true);
  assert.equal(prepared(occlusion), true);
  // The typed comparison needs the final input; single, multiple choice and Kprim need the host's selection.
  assert.equal(prepared(typed), false);
  for (const mode of ["single", "multiple", "kprim"] as const) {
    const choice = graph([field("Frage", "prompt", "Welche Aussagen treffen zu?"), field("Antwort", "answer", "A")], { kind: "choice", mode, options: ["A", "B", "C", "D"].map((html, index) => ({ id: `o${index}`, html, correct: index === 0 })) });
    assert.equal(prepared(choice), false, mode);
  }
  // The CoRe design renders no `autoplay`; an original layout's template may, so its media never load hidden.
  assert.equal(prepared(basic, "review", answer("core", ["audio", "video"])), true);
  assert.equal(prepared(basic, "review", answer("original")), true);
  assert.equal(prepared(basic, "review", answer("original", ["audio"])), false);
  assert.equal(prepared(basic, "review", answer("original", ["video"])), false);
  // Preview and card management show both sides at once.
  assert.equal(prepared(basic, "preview"), false);
  assert.equal(prepared(basic, "management"), false);
});

test("a prepared answer frame stays hidden until revealed and never replaces a single frame before it has loaded", () => {
  // Every card starts its own body without a prepared frame; the previous card's one leaves with its body.
  assert.equal(preparedAnswerFrame("none", false, false), null);
  assert.equal(preparedAnswerFrame("none", true, true), null);
  assert.equal(preparedAnswerFrame("loading", false, false), "hidden");
  assert.equal(preparedAnswerFrame("ready", false, true), "hidden");
  assert.equal(preparedAnswerFrame("ready", true, false), "shown");
  assert.equal(preparedAnswerFrame("ready", true, true), "shown");
  // Below the question, a frame still loading appears in place like one created on reveal.
  assert.equal(preparedAnswerFrame("loading", true, false), "shown");
  // A single frame turns to its back as without preparation.
  assert.equal(preparedAnswerFrame("loading", true, true), null);
});

test("the host's reveal action checks choices with several answers and shows everything else", () => {
  const choice = (mode: "single" | "multiple" | "kprim") => graph([field("Frage", "prompt", "Welche Aussagen treffen zu?"), field("Antwort", "answer", "A")], { kind: "choice", mode, options: ["A", "B", "C", "D"].map((html, index) => ({ id: `o${index}`, html, correct: index === 0 })) }).note;
  assert.equal(revealLabel(choice("multiple")), "Antwort prüfen");
  assert.equal(revealLabel(choice("kprim")), "Antwort prüfen");
  assert.equal(revealLabel(choice("single")), "Antwort anzeigen");
  assert.equal(revealLabel(createBasicNote("deck", "Hauptstadt von Portugal?", "Lissabon").note), "Antwort anzeigen");
  assert.equal(revealLabel(undefined), "Antwort anzeigen");
});
