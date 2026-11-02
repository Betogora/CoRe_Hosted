import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import { brainPalette as c } from "../src/brainMascotPalette.ts";
import { BRAIN_MASCOTS } from "../src/brainMascots.ts";
import { BrainMascot } from "../src/ui/BrainMascot.tsx";
import { escapeHtml } from "./docsSite.ts";

/** The app logo shares its colours with the mascot drawings; `npm run docs:build` writes it to public/core-brain.svg. */
function BrainLogo() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="80 80 840 840" role="img" aria-labelledby="title desc">
    <title id="title">Gehirn beim Lernen</title><desc id="desc">Ein korallfarbenes Gehirn mit Augen liest eine Karteikarte neben einem bunten Bücherstapel.</desc>
    <defs><linearGradient id="brain" x2=".8" y2="1"><stop stopColor={c.brainLight} /><stop offset="1" stopColor={c.brain} /></linearGradient><linearGradient id="feet" x2="1" y2="1"><stop stopColor={c.inkSoft} /><stop offset="1" stopColor={c.ink} /></linearGradient></defs>
    <path d="M245 675C185 676 155 631 172 582C120 526 147 440 220 405C225 337 293 288 363 302C408 231 513 231 566 306C621 298 665 336 668 388C735 417 738 497 692 541L641 652L423 719C346 742 274 726 245 675Z" fill="url(#brain)" />
    <g fill="none" stroke={c.fold} strokeWidth="28" strokeLinecap="round"><path d="M378 327C424 316 453 340 458 375" /><path d="M530 328C561 328 582 349 583 382" /><path d="M338 401C253 402 246 528 321 532" /><path d="M228 498C196 498 184 531 196 554" /><path d="M260 593C247 631 267 656 293 661" /></g>
    <g><ellipse cx="471" cy="523" rx="45" ry="59" fill="#fff" /><ellipse cx="489" cy="535" rx="28" ry="43" fill={c.ink} /><ellipse cx="615" cy="499" rx="41" ry="58" fill="#fff" /><ellipse cx="627" cy="512" rx="28" ry="42" fill={c.ink} /></g>
    <g strokeLinejoin="round"><path d="M638 715L749 688L860 709Q869 711 869 720V739Q869 748 858 750L761 776L646 754Q637 752 637 744Z" fill="#fff7ed" /><path d="M638 675L749 649L860 671Q869 673 869 681V704Q869 713 858 716L761 741L646 718Q637 716 637 707Z" fill="#ffd05b" /><path d="M762 704L867 677V708L762 739Z" fill="#f3ba3f" /><path d="M648 637L749 615L859 631Q869 633 869 641V662Q869 669 857 672L762 695L646 674Q637 672 637 664V647Z" fill={c.blue} /><path d="M762 663L868 636V665L762 695L644 674V643Z" fill={c.blueDeep} /></g>
    <path d="M413 722C392 719 381 691 360 694C330 698 331 728 346 746L396 782C431 807 457 765 454 741C451 718 433 717 413 722Z" fill="url(#feet)" /><path d="M470 723L557 775C589 799 617 757 624 723C640 682 609 675 591 697L573 729L534 704Z" fill="url(#feet)" />
    <path d="M466 581L683 546Q709 541 701 565L646 688Q641 700 625 704L428 737Q413 741 421 719L455 597Q457 585 466 581Z" fill="#fff8ef" />
    <path d="M513 626L633 606" stroke={c.blueMist} strokeWidth="22" strokeLinecap="round" /><path d="M505 664L598 648" stroke="#ffc75e" strokeWidth="21" strokeLinecap="round" />
    <path d="M356 625C363 664 392 691 435 687" fill="none" stroke="#c9654f" strokeWidth="42" strokeLinecap="round" /><ellipse cx="450" cy="682" rx="35" ry="33" fill={c.foldDeep} transform="rotate(-25 450 682)" /><ellipse cx="658" cy="660" rx="26" ry="38" fill={c.foldDeep} transform="rotate(38 658 660)" />
    <g fill="#ffba49"><path d="M673 291L695 223C711 186 754 212 735 243L698 302C686 318 667 310 673 291Z" /><path d="M727 332L776 286C803 263 828 299 803 319L743 357C724 369 713 346 727 332Z" /></g>
  </svg>;
}

export async function synchronizeBrainLogo(mode: "write" | "check") {
  const expected = `${renderToStaticMarkup(<BrainLogo />)}\n`;
  if (mode === "write") await writeFile("public/core-brain.svg", expected);
  else if ((await readFile("public/core-brain.svg", "utf8").catch(() => "")).replace(/\r\n?/g, "\n") !== expected) throw new Error("public/core-brain.svg ist veraltet. npm run docs:build ausführen.");
}

/** The standalone stock pages are a local design aid, not part of the app or its deployment. */
export async function writeMascotStock() {
  const output = path.resolve("output/mascots");
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
  await mkdir(output, { recursive: true });
  for (const [file, html] of files) await writeFile(path.join(output, file), html);
  console.log(`Maskottchen erzeugt: 37 Einzeldateien und Übersicht in ${output}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await writeMascotStock();
