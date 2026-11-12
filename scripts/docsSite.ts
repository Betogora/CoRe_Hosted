import path from "node:path";
import { Marked } from "marked";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Moon, Search, Sun } from "lucide-react";
import { IconButton } from "../src/ui/actionUi.tsx";

export const DOC_PAGES = [
  { file: "index.html", label: "Docs", search: "Docs durchsuchen", placeholder: "Abschnitt, Begriff …" },
  { file: "specs.html", label: "Specs", search: "Specs durchsuchen", placeholder: "Anforderung, Begriff …" },
  { file: "journeys.html", label: "Journeys", search: "Journeys durchsuchen", placeholder: "Ablauf, Regel …" },
  { file: "ui-elements.html", label: "UI-Elements", search: "Katalog durchsuchen", placeholder: "Komponente, Zustand …" },
  { file: "card-types.html", label: "Kartenbausteine", search: "Kartenbausteine durchsuchen", placeholder: "Baustein, Beispiel …" },
  { file: "ai-eval.html", label: "KI-Eval", search: "KI-Eval durchsuchen", placeholder: "Anfragetyp, Kriterium …" },
] as const;

export const DOCUMENT_PAGES: Record<string, string> = {
  "README.md": "index.html", "specs.md": "specs.html", "ai-eval.md": "ai-eval.html",
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function markdownAnchor(value: string) {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
}

export function documentId(file: string) { return file.replace(/\.md$/, "").toLowerCase(); }

const DIAGRAM_TONES: Record<string, string> = { primär: "primary", erfolg: "success", warnung: "warning", gefahr: "danger", info: "info" };

/**
 * Rendert einen `schaubild`-Codeblock. Zeilen: `Titel: …`, `Folge: …` (Kästen mit Pfeilen) oder `Gruppe: …` (Kästen nebeneinander),
 * `Pfeil: …` (nach unten zur nächsten Zeile), `-> …` (Beschriftung des nächsten Pfeils einer Folge), sonst ein Kasten `[Ton] Titel | Detail | …`.
 */
export function diagramMarkup(source: string) {
  let caption = "";
  let label = "";
  let row: { arrows: boolean; title: string; boxes: string[] } | undefined;
  const parts: string[] = [];
  const closeRow = () => {
    if (!row) return;
    if (!row.boxes.length) throw new Error(`Schaubild: Zeile „${row.title}“ enthält keinen Kasten.`);
    parts.push(`<div class="docs-diagram-row">${row.title ? `<p class="docs-diagram-lane">${escapeHtml(row.title)}</p>` : ""}<ol class="docs-diagram-boxes">${row.boxes.join("")}</ol></div>`);
    row = undefined;
  };
  for (const line of source.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
    const [, directive, value] = line.match(/^(Titel|Folge|Gruppe|Pfeil):\s*(.*)$/) ?? [];
    if (directive === "Titel") caption = value;
    else if (directive === "Pfeil") { closeRow(); parts.push(`<p class="docs-diagram-down">${escapeHtml(value)}</p>`); }
    else if (directive) { closeRow(); row = { arrows: directive === "Folge", title: value, boxes: [] }; }
    else if (!row) throw new Error(`Schaubild: „${line}“ steht vor der ersten Folge oder Gruppe.`);
    else if (line.startsWith("->")) label = line.slice(2).trim();
    else {
      const [, tone, content] = line.match(/^(?:\[([^\]]+)\]\s*)?(.+)$/)!;
      if (tone && !DIAGRAM_TONES[tone]) throw new Error(`Schaubild: Ton „${tone}“ ist unbekannt.`);
      const [title, ...details] = content.split(" | ").map(escapeHtml);
      if (row.arrows && row.boxes.length) row.boxes.push(`<li class="docs-diagram-link"${label ? "" : ' aria-hidden="true"'}>${escapeHtml(label)}</li>`);
      label = "";
      row.boxes.push(`<li class="docs-diagram-box"${tone ? ` data-tone="${DIAGRAM_TONES[tone]}"` : ""}><strong>${title}</strong>${details.map((detail) => `<span>${detail}</span>`).join("")}</li>`);
    }
  }
  closeRow();
  return `<figure class="docs-diagram">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}${parts.join("")}</figure>\n`;
}

export function renderMarkdown(source: string, file: string, prefix = documentId(file)) {
  const anchors = new Map<string, number>();
  const renderer = new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) { return lang === "schaubild" ? diagramMarkup(text) : false; },
      heading({ text, depth, tokens }) {
        const base = markdownAnchor(text);
        const count = anchors.get(base) ?? 0;
        anchors.set(base, count + 1);
        const id = `${prefix}--${base}${count ? `-${count}` : ""}`;
        const typography = depth <= 3 ? `core-heading-${depth}` : "core-control-label";
        return `<h${depth} id="${id}" class="${typography}" tabindex="-1">${this.parser.parseInline(tokens)} <a class="docs-anchor" href="#${id}" aria-label="Link zu ${escapeHtml(text)}">#</a></h${depth}>\n`;
      },
    },
  });
  return renderer.parse(source, { async: false }).replace(/href="([^\"]+)"/g, (match, href: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) return match;
    if (href.startsWith(`#${prefix}--`)) return match;
    if (href.startsWith("#")) return `href="#${prefix}--${href.slice(1)}"`;
    const [target, fragment] = href.split("#");
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    const page = DOCUMENT_PAGES[relative];
    return page ? `href="${page}#${documentId(relative)}--${fragment ?? "document"}"` : match;
  });
}

/** Hängt erzeugtes HTML an das Ende des Abschnitts mit dieser Überschrift, vor die nächste Überschrift bis Ebene 3. */
export function appendToSection(html: string, id: string, addition: string, file: string) {
  const start = html.search(new RegExp(`<h[1-6] id="${id}"`));
  if (start < 0) throw new Error(`Abschnitt ${id} fehlt in docs/${file}.`);
  const next = html.slice(start + 1).search(/<h[123] id=/);
  const end = next < 0 ? html.length : start + 1 + next;
  return html.slice(0, end) + addition + html.slice(end);
}

/** Seitenleiste jeder Leseseite: Seitenwechsel, Suche und Inhaltsnavigation untereinander, ohne Kopfleiste. */
export function siteSidebar(currentFile: string) {
  const page = DOC_PAGES.find((candidate) => candidate.file === currentFile)!;
  // Theme-Schalter wie in der App-Navigation; die Sonne zeigt Light, der Mond Dark.
  const moon = renderToStaticMarkup(React.createElement(Moon, { size: 16, "aria-hidden": true }));
  const theme = renderToStaticMarkup(React.createElement(IconButton, { type: "button", variant: "ghost", id: "docs-theme", label: "Dark Mode einschalten", icon: Sun, className: "size-button shrink-0 rounded-control" })).replace("</svg>", `</svg>${moon}`);
  const search = renderToStaticMarkup(React.createElement(Search, { "aria-hidden": true }));
  const pages = DOC_PAGES.map((candidate) => `<a href="${candidate.file}"${candidate === page ? ' aria-current="page"' : ""}>${candidate.label}</a>`).join("");
  return `<aside class="docs-sidebar"><nav class="docs-panel docs-pages" aria-label="Doku-Seiten"><div class="docs-panel-head"><a class="docs-brand" href="index.html">CoRe <span>Docs</span></a>${theme}</div><div class="docs-panel-links">${pages}</div></nav><div class="docs-panel docs-search-panel" role="search"><label class="catalog-search"><span class="catalog-search-label">${page.search}</span>${search}<input id="docs-search" type="search" placeholder="${page.placeholder}" autocomplete="off"></label><p id="docs-search-count" class="docs-count" role="status"></p></div><nav class="docs-panel docs-toc" aria-label="Inhalt"><strong>Inhalt</strong><div id="docs-toc" class="docs-panel-links"></div></nav></aside>`;
}

/** Escapes a script for inline embedding; applying it twice changes nothing. */
export function inlineScript(script: string) {
  return script.replace(/<\/script/gi, "<\\/script").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufdd0-\ufdef\ufffe\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function htmlPage(file: string, content: string, css: string, script: string) {
  const label = DOC_PAGES.find((candidate) => candidate.file === file)!.label;
  return `<!doctype html>\n<html lang="de" data-core-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><link rel="icon" href="data:,"><title>CoRe – ${label}</title><style>${css}</style></head><body><div class="docs-frame">${siteSidebar(file)}<main class="docs-main">${content}</main></div><script>${inlineScript(script)}</script></body></html>\n`;
}
