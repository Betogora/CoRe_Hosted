import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_CHAINS, EXAMPLE_RETENTIONS, EXAMPLE_SITUATIONS, exampleRatingEffects, runExampleChain, type ExampleOutcome } from "./schedulerExampleChains.ts";

const interval = (outcome: ExampleOutcome) => outcome.intervalMinutes != null ? `${outcome.intervalMinutes} min` : `${outcome.intervalDays} d`;

/** Per contact: day, rating, the variant asked at the deck thresholds 7/21/60 (0 = the card), next interval, durability and band afterwards. */
function chainLines(ratings: Parameters<typeof runExampleChain>[0], retention: number): string[] {
  return runExampleChain(ratings, retention).map((contact) => `Tag ${contact.day.toFixed(2)} ${contact.rating} V:${contact.variants.join("/")} → ${interval(contact)} H ${contact.durabilityDays} ${contact.band}`);
}

/** Per chain at the default target retention 0.93. */
const EXPECTED_CHAINS: Record<string, string[]> = {
  "Immer Gut": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 4.27 d H 10.07 young",
    "Tag 4.27 good V:1/0/0 → 15.83 d H 32.34 mature",
    "Tag 20.10 good V:2/1/0 → 43.94 d H 85.97 mature",
    "Tag 64.05 good V:3/2/1 → 111.83 d H 214.12 mature",
    "Tag 175.88 good V:1/3/2 → 272.66 d H 515.52 mature",
  ],
  "Leicht, dann Gut": [
    "Tag 0.00 easy V:0/0/0 → 25.96 d H 53.87 mature",
    "Tag 25.96 good V:1/1/0 → 91.37 d H 176.79 mature",
    "Tag 117.33 good V:2/2/1 → 269.99 d H 511.46 mature",
    "Tag 387.32 good V:3/3/2 → 756.74 d H 1418.96 mature",
  ],
  "Mit Schwer dazwischen": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 4.27 d H 10.07 young",
    "Tag 4.27 good V:1/0/0 → 15.83 d H 32.34 mature",
    "Tag 20.10 hard V:2/1/0 → 16.11 d H 32.46 mature",
    "Tag 36.22 good V:2/1/0 → 33.92 d H 66.58 mature",
    "Tag 70.14 hard V:3/2/1 → 36.78 d H 71.83 mature",
    "Tag 106.92 good V:3/2/1 → 62.7 d H 121.01 mature",
    "Tag 169.62 good V:1/3/2 → 106.2 d H 203.07 mature",
  ],
  "Gut mit einem Fehler": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 4.27 d H 10.07 young",
    "Tag 4.27 good V:1/0/0 → 15.83 d H 32.34 mature",
    "Tag 20.10 good V:2/1/0 → 43.94 d H 85.97 mature",
    "Tag 64.05 again V:3/2/1 → 10 min H 0.49 learning",
    "Tag 64.05 good V:0/0/0 → 1 d H 1.43 young",
    "Tag 65.05 good V:0/0/0 → 2 d H 3.68 young",
    "Tag 67.05 good V:0/0/0 → 3.02 d H 6.91 young",
    "Tag 70.08 good V:0/0/0 → 5.32 d H 11.5 young",
    "Tag 75.39 good V:2/0/0 → 8.94 d H 18.63 young",
  ],
  "Nochmal am Anfang": [
    "Tag 0.00 again V:0/0/0 → 1 min H 0 learning",
    "Tag 0.00 good V:0/0/0 → 10 min H 0.02 learning",
    "Tag 0.01 good V:0/0/0 → 1 d H 0.1 young",
    "Tag 1.01 good V:0/0/0 → 2 d H 1.57 young",
    "Tag 3.01 good V:0/0/0 → 2.67 d H 5.89 young",
    "Tag 5.68 good V:0/0/0 → 6.53 d H 13.62 young",
    "Tag 12.20 good V:1/0/0 → 14.79 d H 29.75 mature",
    "Tag 26.99 good V:2/1/0 → 31.87 d H 62.52 mature",
  ],
  "Wackeliger Start": [
    "Tag 0.00 again V:0/0/0 → 1 min H 0 learning",
    "Tag 0.00 good V:0/0/0 → 10 min H 0.02 learning",
    "Tag 0.01 again V:0/0/0 → 1 min H 0 learning",
    "Tag 0.01 good V:0/0/0 → 10 min H 0 learning",
    "Tag 0.02 good V:0/0/0 → 1 d H 0.01 young",
    "Tag 1.02 good V:0/0/0 → 2 d H 0.15 young",
    "Tag 3.02 good V:0/0/0 → 2 d H 0.69 young",
    "Tag 5.02 good V:0/0/0 → 2 d H 1.83 young",
    "Tag 7.02 good V:0/0/0 → 2.09 d H 3.64 young",
  ],
};

/** The first chain at the other target retentions of the comparison table. */
const EXPECTED_RETENTIONS: Record<string, string[]> = {
  "0.9": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 10.07 d H 10.07 young",
    "Tag 10.08 good V:1/0/0 → 42.64 d H 42.64 mature",
    "Tag 52.72 good V:2/1/0 → 143.05 d H 143.05 mature",
    "Tag 195.77 good V:3/2/1 → 444.38 d H 444.38 mature",
    "Tag 640.15 good V:1/3/2 → 1000 d H 1330.04 mature",
  ],
  "0.95": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 1.71 d H 10.07 young",
    "Tag 1.72 good V:0/0/0 → 6.38 d H 25.79 mature",
    "Tag 8.10 good V:1/1/0 → 15.75 d H 56.83 mature",
    "Tag 23.85 good V:2/2/0 → 34.81 d H 118.49 mature",
    "Tag 58.66 good V:3/3/1 → 72.99 d H 239.86 mature",
  ],
};

for (const chain of EXAMPLE_CHAINS) {
  test(`Beispielkette „${chain.name}“ bei Zielerinnerung 0,93: Abstände, Haltbarkeit, Reifeband und erste Variante`, () => {
    assert.deepEqual(chainLines(chain.ratings, 0.93), EXPECTED_CHAINS[chain.name]);
  });
}

test(`Beispielkette „${EXAMPLE_CHAINS[0].name}“ bei den übrigen Zielerinnerungen`, () => {
  assert.deepEqual(Object.keys(EXPECTED_RETENTIONS), EXAMPLE_RETENTIONS.filter((retention) => retention !== 0.93).map(String));
  for (const [retention, expected] of Object.entries(EXPECTED_RETENTIONS)) {
    assert.deepEqual(chainLines(EXAMPLE_CHAINS[0].ratings, Number(retention)), expected, `Zielerinnerung ${retention}`);
  }
});

test("jede Bewertung je Lage der Karte bei Zielerinnerung 0,93: nächste Phase, Abstand, Haltbarkeit und Reifeband", () => {
  const effects = Object.fromEntries(EXAMPLE_SITUATIONS.map((situation) => [situation.name, Object.fromEntries(Object.entries(exampleRatingEffects(situation.ratings, 0.93))
    .map(([rating, outcome]) => [rating, `${outcome.phase} ${interval(outcome)} H ${outcome.durabilityDays} ${outcome.band}`]))]));
  assert.deepEqual(effects, {
    "Neue Karte": {
      again: "learning 1 min H 0 learning",
      hard: "learning 6 min H 0.6 learning",
      good: "learning 10 min H 4.78 learning",
      easy: "review 25.96 d H 53.87 mature",
    },
    "Im zweiten Lernschritt": {
      again: "learning 1 min H 0 learning",
      hard: "learning 6 min H 3.25 learning",
      good: "review 4.27 d H 10.07 young",
      easy: "review 10.15 d H 22.12 mature",
    },
    "In der Wiederholung": {
      again: "relearning 10 min H 0.06 learning",
      hard: "review 16.11 d H 32.46 mature",
      good: "review 43.94 d H 85.97 mature",
      easy: "review 83.63 d H 161.51 mature",
    },
    "Im Wiederlernen": {
      again: "relearning 10 min H 0 learning",
      hard: "relearning 15 min H 0.28 learning",
      good: "review 1 d H 0.53 young",
      easy: "review 2 d H 0.68 young",
    },
  });
});
