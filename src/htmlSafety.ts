import xss, { type IFilterXSSOptions } from "xss";

const { FilterXSS, escapeAttrValue, getDefaultWhiteList, safeAttrValue } = xss as unknown as typeof import("xss");

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
