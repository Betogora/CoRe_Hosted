import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_CHAINS, EXAMPLE_RETENTIONS, EXAMPLE_SITUATIONS, exampleRatingEffects, runExampleChain, type ExampleOutcome } from "./schedulerExampleChains.ts";

const interval = (outcome: ExampleOutcome) => outcome.intervalMinutes != null ? `${outcome.intervalMinutes} min` : `${outcome.intervalDays} d`;

/** Per contact: day, rating, deck thresholds with the variant, next interval, durability and band afterwards. */
function chainLines(ratings: Parameters<typeof runExampleChain>[0], retention: number): string[] {
  return runExampleChain(ratings, retention).map((contact) => `Tag ${contact.day.toFixed(2)} ${contact.rating} V:${contact.variantThresholds.join("/") || "-"} → ${interval(contact)} H ${contact.durabilityDays} ${contact.band}`);
}

const EXPECTED_CHAINS: Record<string, Record<string, string[]>> = {
  "Immer Gut": {
    "0.9": [
      "Tag 0.00 good V:- → 10 min H 4.78 learning",
      "Tag 0.01 good V:- → 10.07 d H 10.07 young",
      "Tag 10.08 good V:- → 42.64 d H 42.64 mature",
      "Tag 52.72 good V:7/21 → 143.05 d H 143.05 mature",
      "Tag 195.77 good V:- → 444.38 d H 444.38 mature",
      "Tag 640.15 good V:7/21/60 → 1000 d H 1330.04 mature",
    ],
    "0.92": [
      "Tag 0.00 good V:- → 10 min H 4.78 learning",
      "Tag 0.01 good V:- → 5.91 d H 10.07 young",
      "Tag 5.92 good V:- → 22.74 d H 35.7 mature",
      "Tag 28.66 good V:7/21 → 67.3 d H 103.14 mature",
      "Tag 95.96 good V:- → 183.51 d H 277.92 mature",
      "Tag 279.46 good V:7/21/60 → 480.55 d H 722.9 mature",
    ],
    "0.94": [
      "Tag 0.00 good V:- → 10 min H 4.78 learning",
      "Tag 0.01 good V:- → 2.87 d H 10.07 young",
      "Tag 2.88 good V:- → 10.47 d H 29.04 mature",
      "Tag 13.35 good V:7/21 → 27.3 d H 70.56 mature",
      "Tag 40.65 good V:- → 64.73 d H 161.41 mature",
      "Tag 105.38 good V:7/21/60 → 146.52 d H 357.59 mature",
    ],
  },
  "Leicht, dann Gut": {
    "0.9": [
      "Tag 0.00 easy V:- → 53.87 d H 53.87 mature",
      "Tag 53.87 good V:7/21 → 233.22 d H 233.22 mature",
      "Tag 287.09 good V:- → 868.38 d H 868.38 mature",
      "Tag 1155.47 good V:7/21/60 → 1000 d H 3081.95 mature",
    ],
    "0.92": [
      "Tag 0.00 easy V:- → 33.92 d H 53.87 mature",
      "Tag 33.92 good V:7/21 → 128.02 d H 195.26 mature",
      "Tag 161.95 good V:- → 410.36 d H 618.42 mature",
      "Tag 572.31 good V:7/21/60 → 1000 d H 1873.83 mature",
    ],
    "0.94": [
      "Tag 0.00 easy V:- → 19.08 d H 53.87 mature",
      "Tag 19.08 good V:7/21 → 62.82 d H 158.67 mature",
      "Tag 81.90 good V:- → 170.34 d H 415.9 mature",
      "Tag 252.24 good V:7/21/60 → 436.71 d H 1048.47 mature",
    ],
  },
  "Gut mit einem Fehler": {
    "0.9": [
      "Tag 0.00 good V:- → 10 min H 4.78 learning",
      "Tag 0.01 good V:- → 10.07 d H 10.07 young",
      "Tag 10.08 good V:- → 42.64 d H 42.64 mature",
      "Tag 52.72 good V:7/21 → 143.05 d H 143.05 mature",
      "Tag 195.77 again V:- → 10 min H 1.27 learning",
      "Tag 195.78 good V:- → 2.65 d H 2.65 young",
      "Tag 198.43 good V:- → 6.72 d H 6.72 young",
      "Tag 205.15 good V:- → 13.75 d H 13.75 young",
      "Tag 218.90 good V:- → 26.33 d H 26.33 mature",
      "Tag 245.22 good V:7/21 → 48.88 d H 48.88 mature",
    ],
    "0.92": [
      "Tag 0.00 good V:- → 10 min H 4.78 learning",
      "Tag 0.01 good V:- → 5.91 d H 10.07 young",
      "Tag 5.92 good V:- → 22.74 d H 35.7 mature",
      "Tag 28.66 good V:7/21 → 67.3 d H 103.14 mature",
      "Tag 95.96 again V:- → 10 min H 0.7 learning",
      "Tag 95.97 good V:- → 1 d H 1.79 young",
      "Tag 96.97 good V:- → 2.53 d H 4.3 young",
      "Tag 99.50 good V:- → 4.89 d H 8.13 young",
      "Tag 104.38 good V:- → 8.87 d H 14.29 young",
      "Tag 113.25 good V:7 → 15.42 d H 24.35 mature",
    ],
    "0.94": [
      "Tag 0.00 good V:- → 10 min H 4.78 learning",
      "Tag 0.01 good V:- → 2.87 d H 10.07 young",
      "Tag 2.88 good V:- → 10.47 d H 29.04 mature",
      "Tag 13.35 good V:7/21 → 27.3 d H 70.56 mature",
      "Tag 40.65 again V:- → 10 min H 0.31 learning",
      "Tag 40.66 good V:- → 1 d H 1.12 young",
      "Tag 41.66 good V:- → 2 d H 3.12 young",
      "Tag 43.66 good V:- → 2.16 d H 6.07 young",
      "Tag 45.82 good V:- → 3.24 d H 9.79 young",
      "Tag 49.05 good V:7 → 5.19 d H 15.02 young",
    ],
  },
  "Nochmal am Anfang": {
    "0.9": [
      "Tag 0.00 again V:- → 1 min H 0 learning",
      "Tag 0.00 good V:- → 10 min H 0.02 learning",
      "Tag 0.01 good V:- → 1 d H 0.1 young",
      "Tag 1.01 good V:- → 2 d H 1.57 young",
      "Tag 3.01 good V:- → 5.89 d H 5.89 young",
      "Tag 8.90 good V:- → 17.34 d H 17.34 young",
      "Tag 26.25 good V:- → 46.72 d H 46.72 mature",
      "Tag 72.97 good V:7/21 → 119.21 d H 119.21 mature",
    ],
    "0.92": [
      "Tag 0.00 again V:- → 1 min H 0 learning",
      "Tag 0.00 good V:- → 10 min H 0.02 learning",
      "Tag 0.01 good V:- → 1 d H 0.1 young",
      "Tag 1.01 good V:- → 2 d H 1.57 young",
      "Tag 3.01 good V:- → 3.58 d H 5.89 young",
      "Tag 6.59 good V:- → 9.33 d H 14.84 young",
      "Tag 15.92 good V:- → 22.43 d H 34.91 mature",
      "Tag 38.35 good V:7/21 → 51.21 d H 78.57 mature",
    ],
    "0.94": [
      "Tag 0.00 again V:- → 1 min H 0 learning",
      "Tag 0.00 good V:- → 10 min H 0.02 learning",
      "Tag 0.01 good V:- → 1 d H 0.1 young",
      "Tag 1.01 good V:- → 2 d H 1.57 young",
      "Tag 3.01 good V:- → 2 d H 5.89 young",
      "Tag 5.01 good V:- → 4.41 d H 12.61 young",
      "Tag 9.42 good V:- → 9.4 d H 25.4 mature",
      "Tag 18.81 good V:7/21 → 19.06 d H 49.54 mature",
    ],
  },
};

for (const chain of EXAMPLE_CHAINS) {
  test(`Beispielkette „${chain.name}“: Abstände, Haltbarkeit, Reifeband und erste Variante je Zielerinnerung`, () => {
    assert.deepEqual(Object.keys(EXPECTED_CHAINS[chain.name]), EXAMPLE_RETENTIONS.map(String));
    for (const [retention, expected] of Object.entries(EXPECTED_CHAINS[chain.name])) {
      assert.deepEqual(chainLines(chain.ratings, Number(retention)), expected, `Zielerinnerung ${retention}`);
    }
  });
}

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
