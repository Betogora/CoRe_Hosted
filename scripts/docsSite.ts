import path from "node:path";
import { Marked } from "../docs/vendor/marked.esm.js";
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
] as const;

export const DOCUMENT_PAGES: Record<string, string> = {
  "README.md": "index.html", "specs.md": "specs.html",
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function markdownAnchor(value: string) {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
}

export function documentId(file: string) { return file.replace(/\.md$/, "").toLowerCase(); }

export function renderMarkdown(source: string, file: string, prefix = documentId(file)) {
  const anchors = new Map<string, number>();
  const renderer = new Marked({
    gfm: true,
    renderer: {
      heading({ text, depth, tokens }) {
        const base = markdownAnchor(text);
        const count = anchors.get(base) ?? 0;
        anchors.set(base, count + 1);
        const id = `${prefix}--${base}${count ? `-${count}` : ""}`;
        const typography = depth <= 3 ? `core-heading-${depth}` : "core-control-label";
        return `<h${depth} id="${id}" class="${typography}" tabindex="-1">${this.parser.parseInline(tokens)} <a class="docs-anchor" href="#${id}" aria-label="Link zu ${escapeHtml(text)}">#</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        return lang === "mermaid" ? `<pre class="mermaid">${escapeHtml(text)}</pre>` : false;
      },
    },
  });
  return renderer.parse(source).replace(/href="([^\"]+)"/g, (match, href: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) return match;
    if (href.startsWith(`#${prefix}--`)) return match;
    if (href.startsWith("#")) return `href="#${prefix}--${href.slice(1)}"`;
    const [target, fragment] = href.split("#");
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    const page = DOCUMENT_PAGES[relative];
    return page ? `href="${page}#${documentId(relative)}--${fragment ?? "document"}"` : match;
  });
}

/** Seitenleiste jeder Leseseite: Seitenwechsel, Suche und Inhaltsnavigation untereinander, ohne Kopfleiste. */
export function siteSidebar(currentFile: string, toc: string) {
  const page = DOC_PAGES.find((candidate) => candidate.file === currentFile)!;
  // Theme-Schalter wie in der App-Navigation; die Sonne zeigt Light, der Mond Dark.
  const moon = renderToStaticMarkup(React.createElement(Moon, { size: 16, "aria-hidden": true }));
  const theme = renderToStaticMarkup(React.createElement(IconButton, { type: "button", variant: "ghost", id: "docs-theme", label: "Dark Mode einschalten", icon: Sun, className: "size-button shrink-0 rounded-control" })).replace("</svg>", `</svg>${moon}`);
  const search = renderToStaticMarkup(React.createElement(Search, { "aria-hidden": true }));
  const pages = DOC_PAGES.map((candidate) => `<a href="${candidate.file}"${candidate === page ? ' aria-current="page"' : ""}>${candidate.label}</a>`).join("");
  return `<aside class="docs-sidebar"><nav class="docs-panel docs-pages" aria-label="Doku-Seiten"><div class="docs-panel-head"><a class="docs-brand" href="index.html">CoRe <span>Docs</span></a>${theme}</div><div class="docs-panel-links">${pages}</div></nav><div class="docs-panel docs-search-panel" role="search"><label class="catalog-search"><span class="catalog-search-label">${page.search}</span>${search}<input id="docs-search" type="search" placeholder="${page.placeholder}" autocomplete="off"></label><p id="docs-search-count" class="docs-count" role="status"></p></div><nav class="docs-panel docs-toc" aria-label="Inhalt"><strong>Inhalt</strong><div id="docs-toc" class="docs-panel-links">${toc}</div></nav></aside>`;
}

export function htmlPage(file: string, content: string, css: string, script: string, { toc = "", extraHead = "" } = {}) {
  const label = DOC_PAGES.find((candidate) => candidate.file === file)!.label;
  const inlineScript = script.replace(/<\/script/gi, "<\\/script").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufdd0-\ufdef\ufffe\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `<!doctype html>\n<html lang="de" data-core-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><link rel="icon" href="data:,"><title>CoRe – ${label}</title><style>${css}</style>${extraHead}</head><body><div class="docs-frame">${siteSidebar(file, toc)}<main class="docs-main">${content}</main></div><script>${inlineScript}</script></body></html>\n`;
}
