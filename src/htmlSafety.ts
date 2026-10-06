import xss, { type IFilterXSSOptions } from "xss";

const { FilterXSS, escapeAttrValue, friendlyAttrValue, getDefaultWhiteList, safeAttrValue } = xss as unknown as typeof import("xss");

const GLOBAL_ATTRIBUTES = ["class", "id", "title", "dir", "lang", "style"];
const MEDIA_ATTRIBUTES = new Set(["src", "srcset", "poster"]);
const VOID_TAG_PATTERN = /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\b[^>]*)>/gi;
const SAFE_CSS_VALUE = /^(?!.*(?:expression\s*\(|javascript:|url\s*\(|@import|behavior\s*:))[\w\s#(),.%+\-/"']+$/i;
const SAFE_CSS_PROPERTIES = new Set([
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-decoration",
  "vertical-align",
  "white-space",
]);

const tagAttributes: Record<string, string[]> = {
  a: ["href", "name", "target", "rel"],
  audio: ["src", "controls", "preload", "loop", "muted"],
  img: ["src", "alt", "width", "height", "loading", "decoding"],
  ol: ["start", "type", "reversed"],
  source: ["src", "srcset", "type", "media", "sizes"],
  table: ["summary"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "headers", "scope"],
  track: ["src", "kind", "srclang", "label", "default"],
  video: ["src", "controls", "preload", "loop", "muted", "poster", "width", "height"],
};

const allowList = getDefaultWhiteList();
for (const tag of ["audio", "img", "mark", "picture", "ruby", "rt", "source", "track", "video"]) {
  allowList[tag] ??= [];
}
for (const [tag, attributes] of Object.entries(allowList)) {
  allowList[tag] = Array.from(new Set([...GLOBAL_ATTRIBUTES, ...(attributes ?? []), ...(tagAttributes[tag] ?? [])]));
}

function sanitizeStyle(value: string) {
  return value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return [];
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();
      return SAFE_CSS_PROPERTIES.has(property) && SAFE_CSS_VALUE.test(propertyValue)
        ? [`${property}:${propertyValue}`]
        : [];
    })
    .join(";");
}

function isSafeLink(value: string) {
  const normalized = value.trim().toLowerCase();
  return !normalized.startsWith("//")
    && (/^(?:https?:|mailto:)/.test(normalized) || !/^[a-z][a-z\d+.-]*:/i.test(normalized));
}

function isSafeMediaReference(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
  return !normalized.startsWith("//")
    && !/(?:^|,)(?:https?:|javascript:|vbscript:)/.test(normalized)
    && (!/^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith("data:") || normalized.startsWith("blob:"));
}

const options: IFilterXSSOptions = {
  allowList,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "form"],
  onIgnoreTagAttr(_tag, name, value) {
    if (/^(?:data|aria)-[\w-]+$/i.test(name)) return `${name}="${escapeAttrValue(value)}"`;
    return undefined;
  },
  safeAttrValue(tag, name, value, cssFilter) {
    if (name === "style") return escapeAttrValue(sanitizeStyle(value));
    if (name === "href") return isSafeLink(value) ? escapeAttrValue(value) : "";
    if (MEDIA_ATTRIBUTES.has(name)) return isSafeMediaReference(value) ? escapeAttrValue(value) : "";
    return safeAttrValue(tag, name, value, cssFilter);
  },
};

const cardHtmlFilter = new FilterXSS(options);

const NOTE_GLOBAL_ATTRIBUTES = ["title", "dir", "lang", "style"];
const NOTE_TAG_ATTRIBUTES: Record<string, string[]> = {
  a: ["href"],
  audio: ["src", "controls"],
  font: ["color"],
  img: ["src", "alt", "width", "height"],
  ol: ["start", "type", "reversed"],
  source: ["src", "type"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  video: ["src", "controls", "poster", "width", "height"],
};
const NOTE_STYLE_PROPERTIES = new Set([
  "background-color",
  "border",
  "border-bottom",
  "border-collapse",
  "border-color",
  "border-left",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "color",
  "font-style",
  "font-weight",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-decoration-line",
  "vertical-align",
]);
const RELATIVE_FONT_SIZE = /^(?:\d+(?:\.\d+)?(?:em|rem|%)|smaller|larger)$/i;
const PERCENT_WIDTH = /^\d+(?:\.\d+)?%$/;
const noteAllowList = getDefaultWhiteList();
for (const tag of ["audio", "img", "mark", "rp", "rt", "ruby", "source", "video"]) noteAllowList[tag] = [];
for (const tag of Object.keys(noteAllowList)) {
  noteAllowList[tag] = [...NOTE_GLOBAL_ATTRIBUTES, ...(NOTE_TAG_ATTRIBUTES[tag] ?? [])];
}

function sanitizeNoteStyle(value: string) {
  return value
    .split(";")
    .flatMap((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return [];
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();
      if (!SAFE_CSS_VALUE.test(propertyValue)) return [];
      if (property === "font-size") return RELATIVE_FONT_SIZE.test(propertyValue) ? [`${property}:${propertyValue}`] : [];
      if (property === "width") return PERCENT_WIDTH.test(propertyValue) ? [`${property}:${propertyValue}`] : [];
      return NOTE_STYLE_PROPERTIES.has(property) ? [`${property}:${propertyValue}`] : [];
    })
    .join(";");
}

function isNoteMediaReference(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
  if (!normalized || normalized.startsWith("//")) return false;
  if (/^data:(?:image|audio|video)\/[\w.+-]+;base64,/.test(normalized)) return true;
  return !/^[a-z][a-z\d+.-]*:/.test(normalized);
}

const noteHtmlFilter = new FilterXSS({
  allowList: noteAllowList,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "form", "template"],
  onIgnoreTagAttr(_tag, name, value) {
    return /^aria-[\w-]+$/i.test(name) ? `${name}="${escapeAttrValue(value)}"` : undefined;
  },
  onTagAttr(_tag, name, rawValue, isWhiteAttr) {
    if (!isWhiteAttr) return undefined;
    const value = friendlyAttrValue(rawValue);
    const trimmed = value.trim();
    const safe = name === "style"
      ? sanitizeNoteStyle(value)
      : name === "href"
        ? /^(?:https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : ""
        : name === "src" || name === "poster"
          ? isNoteMediaReference(value) ? trimmed : ""
          : null;
    if (safe === null) return undefined;
    return safe ? `${name}="${escapeAttrValue(safe)}"` : "";
  },
});

/** Field HTML of the universal note content (ADR-033): semantic markup only, no layout, fonts or remote media. */
export function sanitizeNoteHtml(html: unknown) {
  return noteHtmlFilter.process(String(html ?? ""))
    .replace(VOID_TAG_PATTERN, (_match, tag: string, attributes: string) => `<${tag}${attributes.replace(/\s*\/$/, "")} />`)
    .replace(/<a\b(?![^>]*\brel=)/gi, '<a rel="noopener noreferrer"');
}

export function sanitizeCardHtml(html: unknown) {
  const sanitized = cardHtmlFilter.process(String(html ?? ""));
  return sanitized
    .replace(VOID_TAG_PATTERN, (_match, tag: string, attributes: string) => `<${tag}${attributes.replace(/\s*\/$/, "")} />`)
    .replace(/<a\b(?![^>]*\brel=)/gi, '<a rel="noopener noreferrer"');
}

export function stripHtml(html: unknown) {
  return stripSanitizedHtml(sanitizeCardHtml(html));
}

export function stripSanitizedHtml(html: string) {
  if (typeof document !== "undefined") {
    const element = document.createElement("div");
    element.innerHTML = html;
    return element.textContent ?? "";
  }

  return html.replace(/<[^>]*>/g, " ");
}
