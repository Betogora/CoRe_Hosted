import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { commitApkgImport, createApkgImportPreview } from "./apkgImport.ts";
import { renderLearningItemPresentation } from "./cardPresentation.ts";
import { isLearningItemMarked } from "./coreModel.ts";
import type { Deck, LearningItem, NoteTypeDefinitionV1 } from "./coreTypes.ts";

// ADR-035: every APKG fixture states the target behaviour of the universal content model.
// KNOWN_GAPS lists what the current implementation does not deliver yet. The test fails both
// for unlisted failures and for listed gaps that already pass, so the list cannot go stale.

interface ExpectedCard {
  ankiCardId: string;
  ord: number;
  key: string;
  deckPath: string;
  frontIncludes: string[];
  frontExcludes: string[];
  backIncludes: string[];
  backExcludes: string[];
  links: string[];
  learning: { state: string; suspended: boolean; fsrs?: { stability: number; difficulty: number }; flag?: number; reviewEvents?: number };
}

interface ExpectedNote {
  guid: string;
  interaction: "reveal" | "cloze" | "choice" | "image-occlusion";
  fieldRoles: Record<string, string>;
  instruction: Record<string, string>;
  speech: Record<string, string>;
  choice: { mode: "single" | "multiple" | "kprim"; options: string[]; correct: boolean[] } | null;
  tags: string[];
  marked: boolean;
  cards: ExpectedCard[];
}

interface ExpectedFixture {
  file: string;
  notes: ExpectedNote[];
  media?: Array<{ name: string; sha1: string; size: number }>;
  missingMedia?: string[];
  expectError?: string;
}

interface Gap {
  fixtures: string[] | "*";
  aspect: string;
  subjects: string[] | "*";
  reason: string;
}

const MATRIX_DIR = new URL("../fixtures/apkg/matrix/", import.meta.url);
const STANDARD = ["standard-latest", "standard-legacy2", "standard-legacy1"];
const LEARNING_WITH_SCHEDULING = ["learning-latest", "learning-legacy2"];
const LEARNING = [...LEARNING_WITH_SCHEDULING, "learning-without-scheduling"];
const IMPORTED = [...STANDARD, "special-latest", "media-latest", ...LEARNING];
const IO_CARDS = ["matrix-io-native#0", "matrix-io-native#1"];
const MC_NOTES = ["matrix-mc-kprim", "matrix-mc-multiple", "matrix-mc-single"];
const CONTRACT_BREACH = "Widerspricht dem dokumentierten Importvertrag: Der Anki-Kartenzustand erreicht das Learning Item nicht, deshalb greift nur das Revlog-Replay (K5.5).";

const KNOWN_GAPS: Gap[] = [
  { fixtures: ["collection-latest"], aspect: "package.import", subjects: "*", reason: "`.colpkg` wird abgelehnt (K5.8)." },
  { fixtures: IMPORTED, aspect: "package.decks", subjects: "*", reason: "Der immer mitexportierte leere Stapel „Default“ und gefilterte Stapel werden als echte Stapel angelegt (K5.1)." },
  { fixtures: STANDARD, aspect: "card.deck", subjects: ["matrix-reverse#1", "matrix-template-deck#1"], reason: "Geschwister in einem anderen Stapel, auch per Template-Zielstapel, landen im Stapel der ersten Karte (K5.1)." },
  { fixtures: LEARNING, aspect: "card.deck", subjects: ["matrix-state-filtered#0"], reason: "Der Heimatstapel `odid` gefilterter Karten wird ignoriert (K5.1)." },
  { fixtures: "*", aspect: "card.key", subjects: "*", reason: "Abfrageschlüssel `forward`/`reverse` und `io:N` entstehen erst mit dem neuen Importgraphen (K5.1)." },
  { fixtures: "*", aspect: "note.fieldRoles", subjects: "*", reason: "Feldrollen gibt es erst im neuen Modell (K2.1, K5.2, K5.3)." },
  { fixtures: "*", aspect: "note.instruction", subjects: "*", reason: "Fester Vorlagentext wird erst vom generischen Übersetzer zur Anweisung (K5.3)." },
  { fixtures: "*", aspect: "note.speech", subjects: "*", reason: "Vorlesen gibt es erst mit dem neuen Renderer (K3.9)." },
  { fixtures: STANDARD, aspect: "note.cards", subjects: ["matrix-cloze"], reason: "`{{c1,3::…}}` erzeugt keine Karte für Lücke 3 (K3.3, K5.1)." },
  { fixtures: STANDARD, aspect: "card.front", subjects: ["matrix-cloze#0", "matrix-cloze-nested#0"], reason: "Mehrfach nummerierte und verschachtelte Lücken werden falsch dargestellt (K3.3)." },
  { fixtures: STANDARD, aspect: "card.back", subjects: ["matrix-cloze#0", "matrix-cloze#1", "matrix-cloze-nested#0", "matrix-cloze-nested#1", "matrix-type-in#0"], reason: "Mehrfach nummerierte und verschachtelte Lücken werden nicht gefüllt; die Eintippkarte zeigt die Antwort nicht (K3.3, K3.5)." },
  { fixtures: ["special-latest"], aspect: "card.front", subjects: [...IO_CARDS, "matrix-anking#0", "matrix-hint-tts#0", "matrix-math#0", "matrix-cloze-math#0", "matrix-cloze-math#1"], reason: "Bildverdeckung als Rohtext, Hinweise sofort sichtbar, MathJax ungerendert (K3.2, K3.4, K3.7)." },
  { fixtures: ["special-latest"], aspect: "card.back", subjects: [...IO_CARDS, "matrix-math#0", "matrix-cloze-math#0", "matrix-cloze-math#1"], reason: "Bildverdeckung als Rohtext, MathJax und LaTeX-Markierung ungerendert (K3.4, K3.7)." },
  { fixtures: ["special-latest"], aspect: "note.interaction", subjects: ["matrix-ioe-1", "matrix-ioe-2"], reason: "Image Occlusion Enhanced wird nicht als Bildverdeckung erkannt (K5.2)." },
  { fixtures: ["special-latest"], aspect: "note.interaction", subjects: MC_NOTES, reason: "„Multiple Choice for Anki“ wird nicht als Auswahl übersetzt (K5.2; Vorlage e558338)." },
  { fixtures: ["special-latest"], aspect: "note.choice", subjects: MC_NOTES, reason: "„Multiple Choice for Anki“ wird nicht als Auswahl übersetzt (K5.2; Vorlage e558338)." },
  { fixtures: ["special-latest"], aspect: "card.front", subjects: MC_NOTES.map((guid) => `${guid}#0`), reason: "Die Add-on-Optionen erscheinen nur per Script und fehlen auf der Vorderseite (K3.6, K5.2)." },
  { fixtures: ["special-latest"], aspect: "card.back", subjects: MC_NOTES.map((guid) => `${guid}#0`), reason: "Die Add-on-Rückseite wiederholt die Frage und zeigt Lösungsmaske beziehungsweise Platzhaltertext (K3.6, K5.2)." },
  { fixtures: ["special-latest"], aspect: "card.media", subjects: ["matrix-anking#0"], reason: "Ein Link-Pfad wird als Medienverweis gezählt (K5.6)." },
  { fixtures: ["media-latest"], aspect: "card.media", subjects: ["matrix-media-entity#0", "matrix-media-urlencoded#0"], reason: "HTML-maskierte und URL-kodierte Mediennamen werden nicht aufgelöst (K5.6)." },
  { fixtures: ["media-latest", "special-latest"], aspect: "package.missingMedia", subjects: "*", reason: "Der Bericht meldet kodiert referenzierte Medien und Link-Pfade als fehlende Medien (K5.6, K5.9)." },
  { fixtures: LEARNING_WITH_SCHEDULING, aspect: "card.learning.fsrs", subjects: ["matrix-state-review-fsrs#0"], reason: CONTRACT_BREACH },
  { fixtures: LEARNING_WITH_SCHEDULING, aspect: "card.learning.state", subjects: ["matrix-state-relearning#0", "matrix-state-suspended#0", "matrix-state-buried#0"], reason: CONTRACT_BREACH },
  { fixtures: LEARNING_WITH_SCHEDULING, aspect: "card.learning.suspended", subjects: ["matrix-state-suspended#0"], reason: CONTRACT_BREACH },
  { fixtures: LEARNING_WITH_SCHEDULING, aspect: "card.learning.flag", subjects: ["matrix-state-review-fsrs#0"], reason: "Anki-Flaggen gehen mit dem Kartenzustand verloren statt als Metadaten erhalten zu bleiben (K5.5)." },
  { fixtures: LEARNING_WITH_SCHEDULING, aspect: "note.marked", subjects: ["matrix-state-review-fsrs"], reason: "Das Anki-Tag `marked` wird nicht zur CoRe-Markierung (K5.5)." },
];

function gapFor(fixture: string, aspect: string, subject: string): Gap | undefined {
  return KNOWN_GAPS.find((gap) =>
    gap.aspect === aspect
    && (gap.fixtures === "*" || gap.fixtures.includes(fixture))
    && (gap.subjects === "*" || gap.subjects.includes(subject)));
}

async function importFixture(fileName: string) {
  const bytes = await readFile(new URL(fileName, MATRIX_DIR));
  const file = { name: fileName, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const { job, preview } = await createApkgImportPreview(file);
  if (!preview) return { errors: job.errors as string[], committed: null, preview: null };
  return { errors: [] as string[], committed: commitApkgImport(preview), preview };
}

function ancestors(path: string): string[] {
  const parts = path.split("::");
  return parts.map((_, index) => parts.slice(0, index + 1).join("::"));
}

function observedKey(card: LearningItem, definition: NoteTypeDefinitionV1 | undefined): string {
  if (card.projection.kind === "cloze") return `cloze:${card.projection.clozeOrdinal}`;
  if (card.projection.kind === "image-occlusion") return `io:${card.projection.regionKey}`;
  if (card.kind === "single-choice" || card.kind === "multiple-choice") return "choice";
  const recipeId = card.projection.recipeId;
  return `anki-${definition?.recipes.find((recipe) => recipe.id === recipeId)?.ordinal ?? "?"}`;
}

function assertText(text: string, includes: string[], excludes: string[], side: string) {
  for (const value of includes) assert.ok(text.includes(value), `${side} enthält „${value}“ nicht: ${text}`);
  for (const value of excludes) assert.ok(!text.includes(value), `${side} zeigt „${value}“: ${text}`);
}

function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

async function runFixture(name: string, expected: ExpectedFixture) {
  const failures: string[] = [];
  const gapResults = new Map<Gap, { failed: number; passed: string[] }>();
  const check = (aspect: string, subject: string, verify: () => void) => {
    const gap = gapFor(name, aspect, subject);
    let error: unknown = null;
    try {
      verify();
    } catch (caught) {
      error = caught;
    }
    const label = `${aspect} [${subject}]`;
    if (!gap) {
      if (error) failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const result = gapResults.get(gap) ?? { failed: 0, passed: [] };
    if (error) result.failed += 1;
    else result.passed.push(label);
    gapResults.set(gap, result);
  };
  const outcome = () => ({
    failures,
    closedGaps: [...gapResults].flatMap(([gap, result]) => {
      if (gap.subjects === "*") return result.failed === 0 ? [`${gap.aspect} [*]: ${gap.reason}`] : [];
      return result.passed.map((label) => `${label}: ${gap.reason}`);
    }),
  });

  const imported = await importFixture(expected.file);
  if (expected.expectError !== undefined) {
    check("package.error", expected.file, () => {
      assert.equal(imported.preview, null, "Das Paket wurde importiert, obwohl ein Fehler erwartet war.");
      assert.ok(imported.errors.some((error) => error.includes(expected.expectError!)), `Fehlermeldung fehlt: ${imported.errors.join(" | ")}`);
    });
    return outcome();
  }
  check("package.import", expected.file, () => assert.deepEqual(imported.errors, []));
  if (!imported.committed || !imported.preview) return outcome();

  const decks: Deck[] = imported.committed.decks;
  const definitions = new Map<string, NoteTypeDefinitionV1>(
    imported.committed.commitGraph.noteTypeDefinitions.map((definition: NoteTypeDefinitionV1) => [definition.id, definition]),
  );
  const deckPathByCardId = new Map<string, string>();
  const cardsByAnkiId = new Map<string, LearningItem>();
  for (const deck of decks) {
    for (const card of deck.cards) {
      deckPathByCardId.set(card.id, deck.hierarchyPath.join("::"));
      if (card.sourceCardId) cardsByAnkiId.set(card.sourceCardId, card);
    }
  }
  const reviewEventsByCardId = new Map<string, number>();
  for (const event of decks.flatMap((deck) => deck.reviewEvents)) {
    reviewEventsByCardId.set(event.learningItemId, (reviewEventsByCardId.get(event.learningItemId) ?? 0) + 1);
  }
  const mediaNames = new Set<string>(imported.preview.mediaFiles.map((file: { name: string }) => file.name));
  const missingMedia = new Set(expected.missingMedia ?? []);

  check("package.decks", expected.file, () => {
    const expectedPaths = new Set(expected.notes.flatMap((note) => note.cards.flatMap((card) => ancestors(card.deckPath))));
    assert.deepEqual([...new Set(decks.map((deck) => deck.hierarchyPath.join("::")))].sort(), [...expectedPaths].sort());
  });
  if (expected.media) {
    check("package.media", expected.file, () => {
      const observed = new Map<string, string>(imported.preview.mediaFiles.map((file: { name: string; sha1: string }) => [file.name, file.sha1]));
      for (const media of expected.media!) assert.equal(observed.get(media.name), media.sha1, `Medium ${media.name} fehlt oder ist verändert.`);
    });
  }
  if (expected.missingMedia) {
    check("package.missingMedia", expected.file, () => {
      assert.deepEqual([...(imported.preview.report.apkg.media?.missing ?? [])].sort(), [...expected.missingMedia!].sort());
    });
  }

  for (const note of expected.notes) {
    const noteCards = note.cards.map((card) => cardsByAnkiId.get(card.ankiCardId));
    check("note.cards", note.guid, () => {
      assert.deepEqual(noteCards.map((card, index) => card ? note.cards[index].ankiCardId : null), note.cards.map((card) => card.ankiCardId));
    });
    const first = noteCards.find(Boolean);
    if (!first) continue;
    check("note.interaction", note.guid, () => {
      const kind = first.kind === "single-choice" || first.kind === "multiple-choice" ? "choice"
        : first.kind === "cloze" || first.kind === "image-occlusion" ? first.kind : "reveal";
      assert.equal(kind, note.interaction);
    });
    if (note.choice) {
      check("note.choice", note.guid, () => {
        const mode = first.kind === "single-choice" ? "single" : first.kind === "multiple-choice" ? "multiple" : first.kind;
        assert.equal(mode, note.choice!.mode);
        assert.deepEqual(first.meta.answerOptions, note.choice!.options);
        assert.deepEqual(first.meta.correctAnswers, note.choice!.options.filter((_, index) => note.choice!.correct[index]));
      });
    }
    check("note.fieldRoles", note.guid, () => assert.fail("Das heutige Modell speichert keine Feldrollen."));
    if (Object.keys(note.instruction).length) check("note.instruction", note.guid, () => assert.fail("Das heutige Modell kennt keine Abfrageanweisung."));
    if (Object.keys(note.speech).length) check("note.speech", note.guid, () => assert.fail("Das heutige Modell kennt kein Vorlesen."));
    check("note.tags", note.guid, () => assert.deepEqual(first.tags, note.tags));
    check("note.marked", note.guid, () => assert.equal(isLearningItemMarked(first), note.marked));

    note.cards.forEach((expectedCard, index) => {
      const card = noteCards[index];
      if (!card) return;
      const subject = `${note.guid}#${expectedCard.ord}`;
      const definition = definitions.get(card.noteTypeDefinitionId);
      const render = (side: "question" | "answer") => definition
        ? renderLearningItemPresentation({ item: card, definition, side, surface: "review", theme: "light" })
        : null;
      const question = render("question");
      const answer = render("answer");
      check("card.deck", subject, () => assert.equal(deckPathByCardId.get(card.id), expectedCard.deckPath));
      check("card.key", subject, () => assert.equal(observedKey(card, definition), expectedCard.key));
      check("card.front", subject, () => assertText(question?.accessibleText ?? "", expectedCard.frontIncludes, expectedCard.frontExcludes, "Vorderseite"));
      check("card.back", subject, () => assertText(answer?.accessibleText ?? "", expectedCard.backIncludes, expectedCard.backExcludes, "Rückseite"));
      if (expectedCard.links.length) {
        check("card.links", subject, () => {
          const html = `${question?.srcdoc ?? ""}${answer?.srcdoc ?? ""}`;
          for (const link of expectedCard.links) assert.ok(html.includes(`href="${link}"`), `Link ${link} fehlt.`);
        });
      }
      check("card.media", subject, () => {
        const references = [...new Set([...(question?.mediaReferences ?? []), ...(answer?.mediaReferences ?? [])])];
        for (const reference of references) {
          const name = decodeAttribute(reference);
          assert.ok(mediaNames.has(reference) || missingMedia.has(name), `Medienverweis „${reference}“ ist nicht auflösbar.`);
        }
      });
      check("card.learning.state", subject, () => assert.equal(card.reviewState.state, expectedCard.learning.state));
      check("card.learning.suspended", subject, () => assert.equal(card.status === "suspended", expectedCard.learning.suspended));
      if (expectedCard.learning.fsrs) {
        check("card.learning.fsrs", subject, () => {
          assert.equal(card.reviewState.stability, expectedCard.learning.fsrs!.stability);
          assert.equal(card.reviewState.difficulty, expectedCard.learning.fsrs!.difficulty);
        });
      }
      if (expectedCard.learning.flag !== undefined) {
        check("card.learning.flag", subject, () => {
          const snapshot = card.reviewState.sourceSchedulerData as { flags?: unknown } | null;
          assert.equal(Number(snapshot?.flags ?? 0), expectedCard.learning.flag);
        });
      }
      if (expectedCard.learning.reviewEvents !== undefined) {
        check("card.learning.reviewEvents", subject, () => assert.equal(reviewEventsByCardId.get(card.id) ?? 0, expectedCard.learning.reviewEvents));
      }
    });
  }
  return outcome();
}

const manifest = JSON.parse(await readFile(new URL("apkg-matrix.expected.json", MATRIX_DIR), "utf8")) as {
  contractVersion: number;
  fixtures: Record<string, ExpectedFixture>;
};

test("APKG-Matrix verwendet das Erwartungsformat v2", () => {
  assert.equal(manifest.contractVersion, 2);
  assert.ok(Object.keys(manifest.fixtures).length >= 10);
});

for (const [name, fixture] of Object.entries(manifest.fixtures)) {
  test(`APKG-Matrix: ${name}`, async () => {
    const { failures, closedGaps } = await runFixture(name, fixture);
    assert.deepEqual(failures, [], "Unerwartete Abweichungen – Import reparieren oder bewusst als bekannte Lücke eintragen.");
    assert.deepEqual(closedGaps, [], "Bekannte Lücken sind geschlossen – Einträge aus KNOWN_GAPS entfernen.");
  });
}

test("Bekannte Lücken verweisen nur auf vorhandene Fixtures", () => {
  for (const gap of KNOWN_GAPS) {
    if (gap.fixtures !== "*") for (const fixture of gap.fixtures) assert.ok(manifest.fixtures[fixture], `Unbekanntes Fixture ${fixture}`);
  }
});
