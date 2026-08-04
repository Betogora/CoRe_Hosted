import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config.ts";

const projectRoot = process.cwd();
const catalogPath = path.join(projectRoot, "docs", "ui-elements.html");
const stylesPath = path.join(projectRoot, "src", "styles.css");
const generatedStylePattern = /<style id="core-generated-styles">[\s\S]*?<\/style>/;
const visualSourcePaths = [
  "tailwind.config.ts",
  "src/styles.css",
  "src/coreTheme.ts",
  "src/ui/actionUi.tsx",
  "src/ui/coreUi.tsx",
  "src/ui/feedbackUi.tsx",
  "src/ui/selectUi.tsx",
  "src/ui/tooltipUi.tsx",
  "src/ui/colorPicker.tsx",
  "src/ui/deckAppearance.tsx",
  "src/ui/DeckTree.tsx",
  "src/ui/RichTextEditor.tsx",
  "src/ui/PdfDocumentViewer.tsx",
  "src/screens/screenConstants.ts",
  "src/screens/DashboardScreen.tsx",
  "src/screens/StudyMode.tsx",
] as const;

function normalizeText(value: string) {
  return `${value.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

function replaceGeneratedStyles(html: string, css: string, sourceHash: string) {
  if (!generatedStylePattern.test(html)) {
    throw new Error("Der Marker <style id=\"core-generated-styles\"> fehlt in docs/ui-elements.html.");
  }

  const generatedBlock = [
    '<style id="core-generated-styles">',
    "/* Automatisch aus den kanonischen UI-Quellen erzeugt. Nicht manuell bearbeiten. */",
    `/* Quellenstand: ${sourceHash} */`,
    css.trim(),
    "</style>",
  ].join("\n");
  return normalizeText(html.replace(generatedStylePattern, generatedBlock));
}

async function createStandaloneCatalog() {
  const [catalog, sourceStyles, ...visualSources] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(stylesPath, "utf8"),
    ...visualSourcePaths.map((sourcePath) => readFile(path.join(projectRoot, sourcePath), "utf8")),
  ]);
  const normalizedCatalog = normalizeText(catalog);
  const catalogForClassScan = normalizedCatalog.replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/g, "");
  const result = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: [{ raw: catalogForClassScan, extension: "html" }],
    }),
    autoprefixer,
  ]).process(sourceStyles, { from: stylesPath });

  const warnings = result.warnings();
  if (warnings.length > 0) {
    throw new Error(`UI-Katalog-CSS konnte nicht sauber erzeugt werden:\n${warnings.map((warning) => warning.toString()).join("\n")}`);
  }

  const sourceHash = createHash("sha256")
    .update(visualSources.map((source, index) => `${visualSourcePaths[index]}\n${normalizeText(source)}`).join("\n"))
    .digest("hex")
    .slice(0, 16);

  return {
    current: normalizedCatalog,
    generated: replaceGeneratedStyles(normalizedCatalog, result.css, sourceHash),
  };
}

export async function synchronizeUiElements({ mode = "check" }: { mode?: "check" | "write" } = {}) {
  if (mode !== "check" && mode !== "write") {
    throw new Error(`Unbekannter UI-Katalog-Modus: ${mode}`);
  }

  const { current, generated } = await createStandaloneCatalog();
  if (mode === "write") {
    if (current !== generated) await writeFile(catalogPath, generated, "utf8");
    console.log("Teilbarer UI-Elementkatalog ist aktuell: docs/ui-elements.html");
    return;
  }

  if (current !== generated) {
    throw new Error("docs/ui-elements.html ist veraltet. Führe npm run docs:ui-elements aus.");
  }

  console.log("Teilbarer UI-Elementkatalog stimmt mit den kanonischen Styles überein.");
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  await synchronizeUiElements({ mode });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
