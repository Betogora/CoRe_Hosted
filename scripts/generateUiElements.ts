import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../tailwind.config.ts";

const projectRoot = process.cwd();
const catalogPaths = [
  path.join(projectRoot, "docs", "ui-elements.html"),
  path.join(projectRoot, "docs", "card-types.html"),
] as const;
const stylesPath = path.join(projectRoot, "src", "styles.css");
const generatedStylePattern = /<style id="core-generated-styles">[\s\S]*?<\/style>/;
const visualSourcePaths = [
  "tailwind.config.ts",
  "src/styles.css",
  "src/coreTheme.ts",
  "src/menuModel.ts",
  "src/ui/actionUi.tsx",
  "src/ui/coreUi.tsx",
  "src/ui/feedbackUi.tsx",
  "src/ui/selectUi.tsx",
  "src/ui/tooltipUi.tsx",
  "src/ui/colorPicker.tsx",
  "src/ui/deckAppearance.tsx",
  "src/ui/DeckOptionsMenu.tsx",
  "src/ui/DeckSummaryRow.tsx",
  "src/ui/CompactDeckSummaryRow.tsx",
  "src/ui/DeckTree.tsx",
  "src/ui/AppNavigation.tsx",
  "src/ui/StudySettingsOverlay.tsx",
  "src/ui/RichTextEditor.tsx",
  "src/ui/PdfDocumentViewer.tsx",
  "src/screens/screenConstants.ts",
  "src/screens/ApkgImportPanel.tsx",
  "src/screens/DashboardScreen.tsx",
  "src/screens/DecksScreen.tsx",
  "src/screens/LearnScreen.tsx",
  "src/screens/SettingsScreen.tsx",
  "src/screens/StudyMode.tsx",
  "src/screens/SyncConflictPanel.tsx",
] as const;

function normalizeText(value: string) {
  return `${value.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

function replaceGeneratedStyles(html: string, css: string, sourceHash: string, catalogPath: string) {
  if (!generatedStylePattern.test(html)) {
    throw new Error(`Der Marker <style id="core-generated-styles"> fehlt in ${path.relative(projectRoot, catalogPath)}.`);
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

async function createStandaloneCatalog(catalogPath: string) {
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
    generated: replaceGeneratedStyles(normalizedCatalog, result.css, sourceHash, catalogPath),
  };
}

export async function synchronizeUiElements({ mode = "check" }: { mode?: "check" | "write" } = {}) {
  if (mode !== "check" && mode !== "write") {
    throw new Error(`Unbekannter UI-Katalog-Modus: ${mode}`);
  }

  const catalogs = await Promise.all(
    catalogPaths.map(async (catalogPath) => ({
      catalogPath,
      ...await createStandaloneCatalog(catalogPath),
    })),
  );
  if (mode === "write") {
    await Promise.all(
      catalogs.map(({ catalogPath, current, generated }) => current === generated ? undefined : writeFile(catalogPath, generated, "utf8")),
    );
    console.log("Teilbare UI-Kataloge sind aktuell: docs/ui-elements.html, docs/card-types.html");
    return;
  }

  const staleCatalogs = catalogs.filter(({ current, generated }) => current !== generated);
  if (staleCatalogs.length > 0) {
    throw new Error(`${staleCatalogs.map(({ catalogPath }) => path.relative(projectRoot, catalogPath)).join(", ")} ist veraltet. Führe npm run docs:ui-elements aus.`);
  }

  console.log("Teilbare UI-Kataloge stimmen mit den kanonischen Styles überein.");
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
