import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import { BRAIN_MASCOTS } from "../src/brainMascots.ts";
import { BrainMascot } from "../src/ui/BrainMascot.tsx";
import { escapeHtml } from "./docsSite.ts";

export async function synchronizeMascots(mode: "write" | "check") {
  const output = path.resolve("public/mascots");
  const css = await readFile("src/ui/brainMascot.css", "utf8");
  const interaction = await readFile("src/brainMascotInteraction.ts", "utf8");
  const script = (await transformWithEsbuild(interaction.replace("export function", "function"), "brainMascotInteraction.ts", { target: "es2022" })).code
    + '\ndocument.querySelectorAll("[data-brain-mascot]").forEach((host) => attachBrainMascotInteraction(host));';
  const font = (await readFile("public/fonts/manrope/manrope-variable.woff2")).toString("base64");
  const styles = `@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${font}) format("woff2")}\n${css}\n
    *{box-sizing:border-box} :root{--core-text:#111827;--core-text-muted:#6b7280;--core-text-secondary:#4b5563;--surface:#fff;--page:#f6f7f8;--border:#e5e7eb;color-scheme:light}
    [data-core-theme=dark]{--core-text:#e6eaee;--core-text-muted:#8b96a2;--core-text-secondary:#a7b1bc;--surface:#161d25;--page:#0e141b;--border:#2a333d;color-scheme:dark}
    body{margin:0;background:var(--page);color:var(--core-text);font:16px/1.6 Manrope,system-ui,sans-serif}main{max-width:1240px;margin:auto;padding:32px 24px 64px}h1{font-size:clamp(26px,4vw,40px);line-height:1.2;letter-spacing:-.03em}h2{font-size:22px;margin-top:44px}h3{font-size:16px;margin:4px 0}p{max-width:760px}a{color:inherit;text-underline-offset:4px}header{display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap}.muted{color:var(--core-text-muted)}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase}.stock-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:20px}.stock-card,.detail{background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:20px}.stock-card p{font-size:13px;min-height:3.2em}.stock-card .brain-mascot{max-width:230px}.stock-card a,.theme-button,.back{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);font:inherit;cursor:pointer;text-decoration:none}.links{display:flex;gap:8px;flex-wrap:wrap}.detail{max-width:650px;margin:32px auto;text-align:center}.detail p{margin-inline:auto}.detail .brain-mascot{max-width:400px}.brain-mascot-button:focus-visible,a:focus-visible,button:focus-visible{outline:3px solid #8b8bea;outline-offset:4px}footer{margin-top:40px;font-size:13px;color:var(--core-text-muted)}@media(max-width:400px){main{padding:20px 16px 44px}.stock-card,.detail{padding:16px}}
  `;
  function page(title: string, body: string) {
    return `<!doctype html>\n<!-- Generiert aus brainMascots.ts / BrainMascot.tsx; npm run mascots:build. -->\n<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · CoRe Maskottchen</title><style>${styles}</style></head><body><main><header><span class="eyebrow">CoRe · Maskottchen-Vorrat</span><button type="button" class="theme-button" aria-label="Farbschema wechseln">Hell / Dunkel</button></header>${body}<footer>37 SVG-Nachzeichnungen der beiden Bildvorlagen. Jede Einzeldatei enthält Grafik, Schrift und Interaktion und lässt sich offline öffnen.</footer></main><script>${script.replace(/<\/script/gi, "<\\/script")}\ndocument.querySelector(".theme-button").addEventListener("click",()=>{document.documentElement.dataset.coreTheme=document.documentElement.dataset.coreTheme==="dark"?"light":"dark"});</script></body></html>\n`;
  }
  const files = new Map<string, string>();
  for (const [index, mascot] of BRAIN_MASCOTS.entries()) {
    const drawing = renderToStaticMarkup(<BrainMascot id={mascot.id} interactive />, { identifierPrefix: mascot.id });
    const previous = BRAIN_MASCOTS[(index + BRAIN_MASCOTS.length - 1) % BRAIN_MASCOTS.length];
    const next = BRAIN_MASCOTS[(index + 1) % BRAIN_MASCOTS.length];
    files.set(`${mascot.id}.html`, page(mascot.title, `<p><a class="back" href="index.html">← Alle Motive</a></p><article class="detail"><span class="eyebrow">${index + 1} / 37 · ${mascot.collection === "adventure" ? "Lernkarten-Abenteuer" : "Pastell-Set"}</span><h1>${escapeHtml(mascot.title)}</h1>${drawing}<p class="muted">${escapeHtml(mascot.description)}</p><p class="muted">Bewege die Maus neben dem Gehirn oder begrüße es per Klick, Touch oder Tastatur.</p></article><nav class="links" aria-label="Weitere Motive"><a class="back" href="${previous.id}.html">← Vorheriges Motiv</a><a class="back" href="${next.id}.html">Nächstes Motiv →</a><a class="back" href="${mascot.id}.html" download>HTML herunterladen</a></nav>`));
  }
  const groups = (["adventure", "pastel"] as const).map((collection) => `<section><h2>${collection === "adventure" ? "Lernkarten-Abenteuer · 12 Motive" : "Pastell-Set · 25 Motive"}</h2><div class="stock-grid">${BRAIN_MASCOTS.filter((mascot) => mascot.collection === collection).map((mascot) => `<article class="stock-card">${renderToStaticMarkup(<BrainMascot id={mascot.id} />, { identifierPrefix: mascot.id })}<h3>${escapeHtml(mascot.title)}</h3><p class="muted">${escapeHtml(mascot.description)}</p><div class="links"><a href="${mascot.id}.html">Öffnen</a><a href="${mascot.id}.html" download aria-label="${escapeHtml(mascot.title)} als HTML herunterladen">HTML ↓</a></div></article>`).join("")}</div></section>`).join("");
  files.set("index.html", page("Alle 37 Motive", `<h1>Ein Gehirn. Viele kleine Abenteuer.</h1><p class="muted">Dein Vorrat aus 37 einzeln nutzbaren SVG-Maskottchen. Öffne ein Motiv, um es zu begrüßen und seine Augenbewegung auszuprobieren. Geschlossene Augen bleiben entspannt.</p>${groups}`));
  if (mode === "write") await mkdir(output, { recursive: true });
  for (const [file, expected] of files) {
    const target = path.join(output, file);
    if (mode === "write") await writeFile(target, expected);
    else {
      const actual = await readFile(target, "utf8").catch(() => "");
      if (actual !== expected) throw new Error(`Maskottchen-Vorrat veraltet: ${file}. npm run mascots:build ausführen.`);
    }
  }
  console.log(`Maskottchen ${mode === "write" ? "erzeugt" : "geprüft"}: 37 Einzeldateien und Übersicht.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await synchronizeMascots(process.argv.includes("--write") ? "write" : "check");
