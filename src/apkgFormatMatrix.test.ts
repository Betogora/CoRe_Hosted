import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readAnkiPackage, type AnkiPackage } from "./apkgImportInternal.ts";
import { translateAnkiPackage, type ApkgImportGraph } from "./apkgNoteTranslation.ts";
import type { Card } from "./coreTypes.ts";
import { notePlainText, renderCard, renderNoteChoiceOptions, type NotePresentationTheme } from "./notePresentation.ts";

// ADR-035: every APKG fixture states the target behaviour of the universal content model.
// The observation runs the note translation (K5.0) and the prepared renderer. KNOWN_GAPS lists
// what the pipeline does not deliver yet. The test fails both for unlisted failures and for
// listed gaps that already pass, so the list cannot go stale.

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
const THEME: NotePresentationTheme = { mode: "light", colors: { surface: "#ffffff", "surface-muted": "#edf1f6", text: "#181d25", "text-muted": "#667492", border: "#d5dbe5", "border-interactive": "#6f7e9e", success: "#d6a3d2", "success-surface": "#f5e8f4", danger: "#e28b68", "danger-surface": "#f8e2d9", "learning-goal-achieved": "#2f7d68" } };

const KNOWN_GAPS: Gap[] = [];

function gapFor(fixture: string, aspect: string, subject: string): Gap | undefined {
  return KNOWN_GAPS.find((gap) =>
    gap.aspect === aspect
    && (gap.fixtures === "*" || gap.fixtures.includes(fixture))
    && (gap.subjects === "*" || gap.subjects.includes(subject)));
}

async function importFixture(fileName: string): Promise<{ errors: string[]; pkg: AnkiPackage | null; graph: ApkgImportGraph | null }> {
  const file = new File([await readFile(new URL(fileName, MATRIX_DIR))], fileName);
  try {
    const pkg = await readAnkiPackage(file);
    const graph = translateAnkiPackage(pkg);
    return { errors: graph.report.errors, pkg, graph: graph.report.errors.length ? null : graph };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], pkg: null, graph: null };
  }
}

function ancestors(path: string): string[] {
  const parts = path.split("::");
  return parts.map((_, index) => parts.slice(0, index + 1).join("::"));
}

/** Text a learner sees: collapsed hints stay hidden until opened. */
function visibleText(srcdoc: string): string {
  const body = srcdoc.slice(srcdoc.indexOf("<body>") + 6, srcdoc.lastIndexOf("</body>"));
  return notePlainText(body.replace(/<div class="core-note-hint">[\s\S]*?<\/div><\/details>/g, "</details>"));
}

function assertText(text: string, includes: string[], excludes: string[], side: string) {
  for (const value of includes) assert.ok(text.includes(value), `${side} enthält „${value}“ nicht: ${text}`);
  for (const value of excludes) assert.ok(!text.includes(value), `${side} zeigt „${value}“: ${text}`);
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
      assert.equal(imported.graph, null, "Das Paket wurde importiert, obwohl ein Fehler erwartet war.");
      assert.ok(imported.errors.some((error) => error.includes(expected.expectError!)), `Fehlermeldung fehlt: ${imported.errors.join(" | ")}`);
    });
    return outcome();
  }
  check("package.import", expected.file, () => assert.deepEqual(imported.errors, []));
  const { pkg, graph } = imported;
  if (!pkg || !graph) return outcome();

  const deckPaths = new Map(graph.decks.map((deck) => [deck.id, deck.hierarchyPath.join("::")]));
  const cardsByAnkiId = new Map(graph.cards.map((card) => [card.ankiCardId, card]));
  const notesById = new Map(graph.notes.map((note) => [note.id, note]));
  const reviewEventsByCardId = new Map<string, number>();
  for (const event of graph.reviewEvents) reviewEventsByCardId.set(event.cardId, (reviewEventsByCardId.get(event.cardId) ?? 0) + 1);
  const mediaNames = new Set(graph.mediaFiles.map((file) => file.name));
  const missingMedia = new Set(expected.missingMedia ?? []);

  check("package.decks", expected.file, () => {
    const expectedPaths = new Set(expected.notes.flatMap((note) => note.cards.flatMap((card) => ancestors(card.deckPath))));
    assert.deepEqual([...deckPaths.values()].sort(), [...expectedPaths].sort());
  });
  if (expected.media) {
    check("package.media", expected.file, () => {
      const observed = new Map(pkg.media.files.map((file) => [file.name, file.sha1]));
      for (const media of expected.media!) assert.equal(observed.get(media.name), media.sha1, `Medium ${media.name} fehlt oder ist verändert.`);
    });
  }
  if (expected.missingMedia) {
    check("package.missingMedia", expected.file, () => assert.deepEqual(graph.report.missingMedia, [...expected.missingMedia!].sort()));
  }

  for (const expectedNote of expected.notes) {
    const noteCards = expectedNote.cards.map((card) => cardsByAnkiId.get(card.ankiCardId));
    check("note.cards", expectedNote.guid, () => {
      assert.deepEqual(noteCards.map((card, index) => card ? expectedNote.cards[index].ankiCardId : null), expectedNote.cards.map((card) => card.ankiCardId));
    });
    const first = noteCards.find((card): card is Card => card !== undefined);
    const note = first ? notesById.get(first.noteId) : undefined;
    if (!note) continue;
    const content = note.content;
    const interaction = content.interaction;
    check("note.interaction", expectedNote.guid, () => assert.equal(interaction.kind, expectedNote.interaction));
    if (expectedNote.choice) {
      check("note.choice", expectedNote.guid, () => {
        assert.ok(interaction.kind === "choice", "Keine Auswahlfrage.");
        assert.equal(interaction.mode, expectedNote.choice!.mode);
        assert.deepEqual(interaction.options.map((option) => notePlainText(option.html)), expectedNote.choice!.options);
        assert.deepEqual(interaction.options.map((option) => option.correct), expectedNote.choice!.correct);
      });
    }
    check("note.fieldRoles", expectedNote.guid, () => {
      const observed = Object.fromEntries(Object.keys(expectedNote.fieldRoles).map((field) => [field, content.fields.find((candidate) => candidate.name === field)?.role ?? "consumed"]));
      assert.deepEqual(observed, expectedNote.fieldRoles);
    });
    if (interaction.kind === "reveal") {
      check("note.instruction", expectedNote.guid, () => {
        for (const prompt of interaction.prompts) assert.equal(prompt.instruction, expectedNote.instruction[prompt.key] ?? "", `Anweisung von ${prompt.key}`);
      });
    }
    check("note.speech", expectedNote.guid, () => {
      const fieldNames = new Map(content.fields.map((field) => [field.id, field.name]));
      assert.deepEqual(Object.fromEntries(content.speech.map((speech) => [fieldNames.get(speech.fieldId), speech.language])), expectedNote.speech);
    });
    // The expectation keeps Anki's view, where the marking is the tag `marked`.
    check("note.tags", expectedNote.guid, () => assert.deepEqual([...content.tags, ...(note.marked ? ["marked"] : [])], expectedNote.tags));
    check("note.marked", expectedNote.guid, () => assert.equal(note.marked, expectedNote.marked));
    const options = interaction.kind === "choice" ? (await renderNoteChoiceOptions(note, THEME)).map((option) => notePlainText(option.html)).join(" ") : "";

    for (const [index, expectedCard] of expectedNote.cards.entries()) {
      const card = noteCards[index];
      if (!card) continue;
      const subject = `${expectedNote.guid}#${expectedCard.ord}`;
      const question = await renderCard({ note, card, side: "question", surface: "review", theme: THEME });
      const answer = await renderCard({ note, card, side: "answer", surface: "review", theme: THEME });
      check("card.deck", subject, () => assert.equal(deckPaths.get(card.deckId), expectedCard.deckPath));
      check("card.key", subject, () => assert.equal(card.promptKey, expectedCard.key));
      check("card.front", subject, () => assertText(`${visibleText(question.srcdoc)} ${options}`, expectedCard.frontIncludes, expectedCard.frontExcludes, "Vorderseite"));
      check("card.back", subject, () => assertText(visibleText(answer.srcdoc), expectedCard.backIncludes, expectedCard.backExcludes, "Rückseite"));
      if (expectedCard.links.length) {
        check("card.links", subject, () => {
          for (const link of expectedCard.links) assert.ok(`${question.srcdoc}${answer.srcdoc}`.includes(`href="${link}"`), `Link ${link} fehlt.`);
        });
      }
      check("card.media", subject, () => {
        for (const reference of question.mediaReferences) assert.ok(mediaNames.has(reference) || missingMedia.has(reference), `Medienverweis „${reference}“ ist nicht auflösbar.`);
      });
      check("card.learning.state", subject, () => assert.equal(card.study.state, expectedCard.learning.state));
      check("card.learning.suspended", subject, () => assert.equal(card.status === "suspended", expectedCard.learning.suspended));
      if (expectedCard.learning.fsrs) {
        check("card.learning.fsrs", subject, () => {
          assert.equal(card.study.stability, expectedCard.learning.fsrs!.stability);
          assert.equal(card.study.difficulty, expectedCard.learning.fsrs!.difficulty);
        });
      }
      if (expectedCard.learning.flag !== undefined) {
        check("card.learning.flag", subject, () => assert.equal(card.ankiFlag, expectedCard.learning.flag));
      }
      if (expectedCard.learning.reviewEvents !== undefined) {
        check("card.learning.reviewEvents", subject, () => assert.equal(reviewEventsByCardId.get(card.id) ?? 0, expectedCard.learning.reviewEvents));
      }
    }
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
    assert.deepEqual(failures, [], "Unerwartete Abweichungen – Übersetzer reparieren oder bewusst als bekannte Lücke eintragen.");
    assert.deepEqual(closedGaps, [], "Bekannte Lücken sind geschlossen – Einträge aus KNOWN_GAPS entfernen.");
  });
}

test("Bekannte Lücken verweisen nur auf vorhandene Fixtures", () => {
  for (const gap of KNOWN_GAPS) {
    if (gap.fixtures !== "*") for (const fixture of gap.fixtures) assert.ok(manifest.fixtures[fixture], `Unbekanntes Fixture ${fixture}`);
  }
});
