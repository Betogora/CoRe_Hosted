import { existsSync, openAsBlob, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { readAnkiPackage } from "../src/apkgImportInternal.ts";
import { translateAnkiPackage, type ApkgNotetypeReport } from "../src/apkgNoteTranslation.ts";

// ADR-035: translates real decks (Ankizin, AnKing, …) from a local, unversioned folder and
// reports per note type which translator was used and how much of it is fully translated.
// Decks never leave the machine.

const corpusDir = resolve(process.argv[2] ?? "fixtures/apkg/corpus");
const reportPath = resolve("test-results/apkg-corpus/report.json");

/** Share of notes per outcome: own translator, generic translator, field list, not displayable. */
function quotas(notetype: ApkgNotetypeReport) {
  const total = notetype.notes + notetype.untranslatableNotes;
  const translated = notetype.notes - notetype.fallbackNotes;
  const generic = notetype.translator.id === "generic";
  const percent = (value: number) => total ? Math.round(value / total * 1000) / 10 : 0;
  return {
    full: percent(generic ? 0 : translated),
    generic: percent(generic ? translated : 0),
    fieldList: percent(notetype.fallbackNotes),
    notDisplayable: percent(notetype.untranslatableNotes),
  };
}

async function reportFile(path: string) {
  const startedAt = performance.now();
  const name = basename(path);
  const bytes = statSync(path).size;
  try {
    const graph = await translateAnkiPackage(await readAnkiPackage(Object.assign(await openAsBlob(path), { name })));
    if (graph.report.errors.length) return { file: name, bytes, errors: graph.report.errors };
    return {
      file: name,
      bytes,
      errors: [] as string[],
      durationMs: Math.round(performance.now() - startedAt),
      heapUsedBytes: process.memoryUsage().heapUsed,
      report: graph.report,
      notetypes: graph.report.notetypes.map((notetype) => ({ ...notetype, quotas: quotas(notetype) })).sort((left, right) => right.notes - left.notes),
    };
  } catch (error) {
    return { file: name, bytes, errors: [error instanceof Error ? error.message : String(error)] };
  }
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
  const result = await reportFile(join(corpusDir, name));
  reports.push(result);
  console.log(`\n${result.file} (${(result.bytes / 1_048_576).toFixed(1)} MiB)`);
  if (!result.report) {
    console.log(`  Abgelehnt: ${result.errors.join(" | ")}`);
    continue;
  }
  const { imported, missingMedia, addedCards, droppedCards } = result.report;
  console.log(`  ${imported.notes} Inhalte, ${imported.cards} Karten, ${imported.decks} Stapel, ${imported.reviewEvents} Reviewereignisse, ${imported.mediaFiles} Medien, ${missingMedia.length} fehlende Medien`);
  console.log(`  ${addedCards} abgeleitete und ${droppedCards} nicht übernommene Karten; ${result.durationMs} ms, Heap ${(result.heapUsedBytes / 1_048_576).toFixed(0)} MiB`);
  for (const notetype of result.notetypes) {
    const { full, generic, fieldList, notDisplayable } = notetype.quotas;
    const unmapped = notetype.unmappedFields.length ? ` [nicht zugeordnet: ${notetype.unmappedFields.join(", ")}]` : "";
    console.log(`  - ${notetype.name} (${notetype.translator.id} v${notetype.translator.version}): ${notetype.notes} Inhalte – voll ${full} %, generisch ${generic} %, Feldliste ${fieldList} %, nicht darstellbar ${notDisplayable} %${unmapped}`);
  }
}

await mkdir(resolve("test-results/apkg-corpus"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), corpusDir, reports }, null, 2)}\n`, "utf8");
console.log(`\nBericht: ${reportPath}`);
