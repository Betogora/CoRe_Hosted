// Nimmt die Szenen einer Projektkonfiguration mit Playwright auf.
//
//   node scenes.mjs --config <projekt>/visual-review.config.mjs --base http://localhost:5181 --out <shots> --variant A
//   Optional: --views mobile,desktop (Standard: defaultView der Konfiguration) --only szene1,szene2 --list
//
// Läuft im Projektverzeichnis; Playwright wird aus dessen node_modules geladen.
// Ausgabe: <shots>/<variant>/<view>/<scene>.png. Format der Konfiguration:
//
// export default {
//   defaultView: "mobile",
//   views: { mobile: { width: 390, height: 844, deviceScaleFactor: 2 }, dark: { width: 390, height: 844, colorScheme: "dark" } },
//   settle: 1500,                              // ms nach jedem Seitenaufruf und Klick
//   setup: async (page, base) => {},           // je Ansicht einmal: Demo-Zustand herstellen (optional)
//   beforeEach: async (page) => {},            // je Szene nach dem Laden, z. B. Hinweise schließen (optional)
//   scenes: {
//     "startseite": { path: "/" },
//     "dialog": { path: "/", click: ["Dialog öffnen"], anchor: "Details" },
//     "sonderfall": { path: "/x", run: async ({ page, click, anchor }) => {} },
//   },
// };
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith("--")) acc.push([arg.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]);
  return acc;
}, []));
if (!args.config) throw new Error("--config fehlt");
const config = (await import(pathToFileURL(resolve(args.config)).href)).default;
const scenes = Object.entries(config.scenes ?? {});
if (args.list) { for (const [name, s] of scenes) console.log(`${name}\t${s.path}`); process.exit(0); }
for (const key of ["base", "out", "variant"]) if (!args[key]) throw new Error(`--${key} fehlt`);

const views = String(args.views ?? config.defaultView).split(",");
for (const v of views) if (!config.views?.[v]) throw new Error(`Unbekannte Ansicht: ${v}`);
const only = args.only ? new Set(String(args.only).split(",")) : null;
for (const name of only ?? []) if (!config.scenes[name]) throw new Error(`Unbekannte Szene: ${name}`);

const require = createRequire(resolve("package.json"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  ({ chromium } = require("@playwright/test"));
}
const settle = config.settle ?? 1500;
const base = String(args.base).replace(/\/$/, "");
const browser = await chromium.launch();
let failed = 0;
for (const view of views) {
  const { colorScheme, ...viewport } = config.views[view];
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor ?? 1, colorScheme });
  const page = await context.newPage();
  const click = async (text) => { await page.getByText(text).first().click({ timeout: 10_000 }); await page.waitForTimeout(settle); };
  const anchor = async (text, block = "center") => { await page.getByText(text).first().evaluate((el, b) => el.scrollIntoView({ block: b }), block); await page.waitForTimeout(300); };
  if (config.setup) await config.setup(page, base);
  for (const [name, scene] of scenes) {
    if (only && !only.has(name)) continue;
    const file = resolve(String(args.out), String(args.variant), view, `${name}.png`);
    try {
      await page.goto(base + scene.path, { waitUntil: "load" });
      await page.waitForTimeout(settle);
      if (config.beforeEach) await config.beforeEach(page);
      for (const text of scene.click ?? []) await click(text);
      if (scene.run) await scene.run({ page, click, anchor });
      if (scene.anchor) await anchor(scene.anchor);
      mkdirSync(dirname(file), { recursive: true });
      await page.screenshot({ path: file });
      console.log(`ok   ${view}/${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${view}/${name}: ${String(error).split("\n")[0]}`);
    }
  }
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
