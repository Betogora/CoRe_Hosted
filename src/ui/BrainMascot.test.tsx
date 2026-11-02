import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAIN_MASCOTS } from "../brainMascots.ts";
import { BrainMascot } from "./BrainMascot.tsx";

test("all 37 source motifs render with accessible descriptions and collision-free SVG references", () => {
  assert.equal(BRAIN_MASCOTS.length, 37);
  assert.equal(new Set(BRAIN_MASCOTS.map((mascot) => mascot.id)).size, 37);
  assert.equal(BRAIN_MASCOTS.filter((mascot) => mascot.collection === "adventure").length, 12);
  const markup = renderToStaticMarkup(<>{BRAIN_MASCOTS.map((mascot) => <BrainMascot key={mascot.id} id={mascot.id} interactive />)}</>);
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const reference of markup.matchAll(/url\(#([^\)]+)\)/g)) assert.ok(ids.includes(reference[1]));
  for (const reference of markup.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) for (const id of reference[1].split(" ")) assert.ok(ids.includes(id));
  assert.equal((markup.match(/aria-label="Gehirn begrüßen"/g) ?? []).length, 37);
  assert.equal((markup.match(/<desc /g) ?? []).length, 37);
});
