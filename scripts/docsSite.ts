import path from "node:path";
import { Marked } from "../docs/vendor/marked.esm.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SunMoon } from "lucide-react";

export const DOC_PAGES = [
  { file: "index.html", label: "Docs" },
  { file: "specs.html", label: "Specs" },
  { file: "journeys.html", label: "Journeys" },
  { file: "ui-elements.html", label: "UI-Elements" },
  { file: "card-types.html", label: "Kartentypen" },
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

export function siteNavigation(currentFile: string) {
  const icon = renderToStaticMarkup(React.createElement(SunMoon, { size: 20, "aria-hidden": true }));
  return `<header class="docs-site-nav"><a class="docs-brand core-heading-3" href="index.html">CoRe <span class="core-caption">Docs</span></a><nav aria-label="Doku-Seiten">${DOC_PAGES.map((page) => `<a class="core-control-label" href="${page.file}"${currentFile === page.file ? ' aria-current="page"' : ""}>${page.label}</a>`).join("")}</nav><button class="core-action-secondary" type="button" id="docs-theme" aria-label="Dark Mode einschalten">${icon}</button></header>`;
}

export function htmlPage(file: string, content: string, css: string, script: string, extraHead = "", title?: string) {
  const label = title ?? DOC_PAGES.find((candidate) => candidate.file === file)!.label;
  return `<!doctype html>\n<html lang="de" data-core-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><link rel="icon" href="data:,"><title>CoRe – ${label}</title><style>${css}</style>${extraHead}</head><body>${siteNavigation(file)}${content}<script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>\n`;
}
