import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_CHAINS, EXAMPLE_RETENTIONS, EXAMPLE_SITUATIONS, exampleRatingEffects, runExampleChain, type ExampleOutcome } from "./schedulerExampleChains.ts";

const interval = (outcome: ExampleOutcome) => outcome.intervalMinutes != null ? `${outcome.intervalMinutes} min` : `${outcome.intervalDays} d`;

/** Per contact: day, rating, the variant asked at the deck thresholds 7/21/60 (0 = the card), next interval, durability and band afterwards. */
function chainLines(ratings: Parameters<typeof runExampleChain>[0], retention: number): string[] {
  return runExampleChain(ratings, retention).map((contact) => `Tag ${contact.day.toFixed(2)} ${contact.rating} V:${contact.variants.join("/")} → ${interval(contact)} H ${contact.durabilityDays} ${contact.band}`);
}

/** Per chain at the default target retention 0.92. */
const EXPECTED_CHAINS: Record<string, string[]> = {
  "Immer Gut": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 5.91 d H 10.07 young",
    "Tag 5.92 good V:1/0/0 → 22.74 d H 35.7 mature",
    "Tag 28.66 good V:2/1/0 → 67.3 d H 103.14 mature",
    "Tag 95.96 good V:3/2/1 → 183.51 d H 277.92 mature",
    "Tag 279.46 good V:1/3/2 → 480.55 d H 722.9 mature",
  ],
  "Leicht, dann Gut": [
    "Tag 0.00 easy V:0/0/0 → 33.92 d H 53.87 mature",
    "Tag 33.92 good V:1/1/0 → 128.02 d H 195.26 mature",
    "Tag 161.95 good V:2/2/1 → 410.36 d H 618.42 mature",
    "Tag 572.31 good V:3/3/2 → 1000 d H 1873.83 mature",
  ],
  "Mit Schwer dazwischen": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 5.91 d H 10.07 young",
    "Tag 5.92 good V:1/0/0 → 22.74 d H 35.7 mature",
    "Tag 28.66 hard V:2/1/0 → 24.82 d H 38.62 mature",
    "Tag 53.47 good V:2/1/0 → 55.16 d H 84.62 mature",
    "Tag 108.63 hard V:3/2/1 → 63.04 d H 96.4 mature",
    "Tag 171.67 good V:3/2/1 → 112.46 d H 170.88 mature",
    "Tag 284.12 good V:1/3/2 → 199.53 d H 301.69 mature",
  ],
  "Gut mit einem Fehler": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 5.91 d H 10.07 young",
    "Tag 5.92 good V:1/0/0 → 22.74 d H 35.7 mature",
    "Tag 28.66 good V:2/1/0 → 67.3 d H 103.14 mature",
    "Tag 95.96 again V:3/2/1 → 10 min H 0.7 learning",
    "Tag 95.97 good V:0/0/0 → 1 d H 1.79 young",
    "Tag 96.97 good V:0/0/0 → 2.53 d H 4.3 young",
    "Tag 99.50 good V:0/0/0 → 4.89 d H 8.13 young",
    "Tag 104.38 good V:2/0/0 → 8.87 d H 14.29 young",
    "Tag 113.25 good V:3/0/0 → 15.42 d H 24.35 mature",
  ],
  "Nochmal am Anfang": [
    "Tag 0.00 again V:0/0/0 → 1 min H 0 learning",
    "Tag 0.00 good V:0/0/0 → 10 min H 0.02 learning",
    "Tag 0.01 good V:0/0/0 → 1 d H 0.1 young",
    "Tag 1.01 good V:0/0/0 → 2 d H 1.57 young",
    "Tag 3.01 good V:0/0/0 → 3.58 d H 5.89 young",
    "Tag 6.59 good V:0/0/0 → 9.33 d H 14.84 young",
    "Tag 15.92 good V:1/0/0 → 22.43 d H 34.91 mature",
    "Tag 38.35 good V:2/1/0 → 51.21 d H 78.57 mature",
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
    "Tag 7.02 good V:0/0/0 → 2.5 d H 3.64 young",
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
  "0.94": [
    "Tag 0.00 good V:0/0/0 → 10 min H 4.78 learning",
    "Tag 0.01 good V:0/0/0 → 2.87 d H 10.07 young",
    "Tag 2.88 good V:0/0/0 → 10.47 d H 29.04 mature",
    "Tag 13.35 good V:1/1/0 → 27.3 d H 70.56 mature",
    "Tag 40.65 good V:2/2/1 → 64.73 d H 161.41 mature",
    "Tag 105.38 good V:3/3/2 → 146.52 d H 357.59 mature",
  ],
};

for (const chain of EXAMPLE_CHAINS) {
  test(`Beispielkette „${chain.name}“ bei Zielerinnerung 0,92: Abstände, Haltbarkeit, Reifeband und erste Variante`, () => {
    assert.deepEqual(chainLines(chain.ratings, 0.92), EXPECTED_CHAINS[chain.name]);
  });
}

test(`Beispielkette „${EXAMPLE_CHAINS[0].name}“ bei den übrigen Zielerinnerungen`, () => {
  assert.deepEqual(Object.keys(EXPECTED_RETENTIONS), EXAMPLE_RETENTIONS.filter((retention) => retention !== 0.92).map(String));
  for (const [retention, expected] of Object.entries(EXPECTED_RETENTIONS)) {
    assert.deepEqual(chainLines(EXAMPLE_CHAINS[0].ratings, Number(retention)), expected, `Zielerinnerung ${retention}`);
  }
});

test("jede Bewertung je Lage der Karte bei Zielerinnerung 0,92: nächste Phase, Abstand, Haltbarkeit und Reifeband", () => {
  const effects = Object.fromEntries(EXAMPLE_SITUATIONS.map((situation) => [situation.name, Object.fromEntries(Object.entries(exampleRatingEffects(situation.ratings, 0.92))
    .map(([rating, outcome]) => [rating, `${outcome.phase} ${interval(outcome)} H ${outcome.durabilityDays} ${outcome.band}`]))]));
  assert.deepEqual(effects, {
    "Neue Karte": {
      again: "learning 1 min H 0 learning",
      hard: "learning 6 min H 0.6 learning",
      good: "learning 10 min H 4.78 learning",
      easy: "review 33.92 d H 53.87 mature",
    },
    "Im zweiten Lernschritt": {
      again: "learning 1 min H 0 learning",
      hard: "learning 6 min H 3.25 learning",
      good: "review 5.91 d H 10.07 young",
      easy: "review 13.56 d H 22.12 mature",
    },
    "In der Wiederholung": {
      again: "relearning 10 min H 0.09 learning",
      hard: "review 24.82 d H 38.62 mature",
      good: "review 67.3 d H 103.14 mature",
      easy: "review 126.66 d H 192.81 mature",
    },
    "Im Wiederlernen": {
      again: "relearning 10 min H 0 learning",
      hard: "relearning 15 min H 0.34 learning",
      good: "review 1 d H 0.63 young",
      easy: "review 2 d H 0.8 young",
    },
  });
});
