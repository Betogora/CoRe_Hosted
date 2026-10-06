import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { commitApkgImport, createApkgImportPreview } from "../src/apkgImport.ts";
import { renderLearningItemPresentation, type PresentationCompatibility } from "../src/cardPresentation.ts";
import type { Deck, LearningItem, NoteTypeDefinitionV1 } from "../src/coreTypes.ts";

// ADR-035: imports real decks (Ankizin, AnKing, …) from a local, unversioned folder and
// reports per note type how the current import presents them. Decks never leave the machine.

const corpusDir = resolve(process.argv[2] ?? "fixtures/apkg/corpus");
const reportPath = resolve("test-results/apkg-corpus/report.json");
const RANK: Record<PresentationCompatibility, number> = { "safe-equivalent": 0, "safe-with-differences": 1, "preserved-only": 2 };
const LABEL: Record<PresentationCompatibility, string> = {
  "safe-equivalent": "vollständig",
  "safe-with-differences": "mit Abweichungen",
  "preserved-only": "nur Feldliste",
};

interface NotetypeReport {
  notetype: string;
  cards: number;
  presentation: Record<PresentationCompatibility, number>;
  diagnostics: string[];
}

function worstPresentation(card: LearningItem, definition: NoteTypeDefinitionV1) {
  const sides = (["question", "answer"] as const).map((side) =>
    renderLearningItemPresentation({ item: card, definition, side, surface: "review", theme: "light" }));
  const compatibility = sides.map((side) => side.compatibility).sort((left, right) => RANK[right] - RANK[left])[0];
  return { compatibility, diagnostics: sides.flatMap((side) => side.diagnostics.map((diagnostic) => diagnostic.code)) };
}

async function reportFile(path: string) {
  const startedAt = performance.now();
  const bytes = await readFile(path);
  const file = { name: basename(path), size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const { job, preview } = await createApkgImportPreview(file);
  if (!preview) return { file: basename(path), bytes: bytes.length, errors: job.errors as string[] };
  const committed = commitApkgImport(preview);
  const definitions = new Map<string, NoteTypeDefinitionV1>(
    committed.commitGraph.noteTypeDefinitions.map((definition: NoteTypeDefinitionV1) => [definition.id, definition]),
  );
  const notetypes = new Map<string, NotetypeReport>();
  const sampled = new Map<string, ReturnType<typeof worstPresentation>>();
  const cards = (committed.decks as Deck[]).flatMap((deck) => deck.cards);
  for (const card of cards) {
    const definition = definitions.get(card.noteTypeDefinitionId);
    const name = definition?.name ?? "Unbekannter Notiztyp";
    const report = notetypes.get(name) ?? {
      notetype: name,
      cards: 0,
      presentation: { "safe-equivalent": 0, "safe-with-differences": 0, "preserved-only": 0 },
      diagnostics: [],
    };
    const sampleKey = `${card.noteTypeDefinitionId}:${card.projection.recipeId}`;
    const sample = sampled.get(sampleKey)
      ?? (definition ? worstPresentation(card, definition) : { compatibility: "preserved-only" as const, diagnostics: ["missing-definition"] });
    sampled.set(sampleKey, sample);
    report.cards += 1;
    report.presentation[sample.compatibility] += 1;
    report.diagnostics = [...new Set([...report.diagnostics, ...sample.diagnostics])];
    notetypes.set(name, report);
  }
  return {
    file: basename(path),
    bytes: bytes.length,
    errors: [] as string[],
    decks: committed.decks.length,
    cards: cards.length,
    reviewEvents: (committed.decks as Deck[]).reduce((total, deck) => total + deck.reviewEvents.length, 0),
    mediaFiles: preview.mediaFiles.length,
    missingMedia: (preview.report.apkg.media?.missing ?? []).length,
    durationMs: Math.round(performance.now() - startedAt),
    heapUsedBytes: process.memoryUsage().heapUsed,
    notetypes: [...notetypes.values()].sort((left, right) => right.cards - left.cards),
  };
}

const files = existsSync(corpusDir)
  ? readdirSync(corpusDir).filter((name) => /\.(?:apkg|colpkg)$/i.test(name)).sort()
  : [];
if (files.length === 0) {
  console.error(`Kein Realwelt-Korpus gefunden. Lege .apkg- oder .colpkg-Dateien in ${corpusDir} ab; der Ordner wird nicht versioniert.`);
  console.error("Der Korpus gilt damit ausdrücklich als NICHT geprüft.");
  process.exit(2);
}

const reports = [];
for (const name of files) {
  const report = await reportFile(join(corpusDir, name));
  reports.push(report);
  console.log(`\n${report.file} (${(report.bytes / 1_048_576).toFixed(1)} MiB)`);
  if (report.errors.length) {
    console.log(`  Abgelehnt: ${report.errors.join(" | ")}`);
    continue;
  }
  console.log(`  ${report.cards} Karten, ${report.decks} Stapel, ${report.reviewEvents} Reviewereignisse, ${report.mediaFiles} Medien, ${report.missingMedia} fehlende Medienverweise`);
  console.log(`  ${report.durationMs} ms, Heap nach Import ${(report.heapUsedBytes! / 1_048_576).toFixed(0)} MiB`);
  for (const notetype of report.notetypes!) {
    const parts = (Object.keys(LABEL) as PresentationCompatibility[])
      .filter((key) => notetype.presentation[key] > 0)
      .map((key) => `${LABEL[key]} ${Math.round(notetype.presentation[key] / notetype.cards * 100)} %`);
    const diagnostics = notetype.diagnostics.length ? ` [${notetype.diagnostics.join(", ")}]` : "";
    console.log(`  - ${notetype.notetype}: ${notetype.cards} Karten – ${parts.join(", ")}${diagnostics}`);
  }
}

await mkdir(resolve("test-results/apkg-corpus"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), corpusDir, reports }, null, 2)}\n`, "utf8");
console.log(`\nBericht: ${reportPath}`);
