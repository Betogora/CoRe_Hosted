import { sanitizeCardHtml, stripHtml } from "./htmlSafety.ts";

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const MEDIA_TAG_PATTERN = /<(img|video|audio|iframe|svg|canvas)\b/i;

export function escapeCardHtmlText(text = "") {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToCardHtml(text = "") {
  const normalizedText = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalizedText) return "";

  return normalizedText
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split("\n").map(escapeCardHtmlText).join("<br>")}</p>`)
    .join("");
}

export function normalizeRichTextForEditor(value = "") {
  const sanitized = sanitizeCardHtml(value).trim();
  if (!sanitized) return "";
  return HTML_TAG_PATTERN.test(sanitized) ? sanitized : textToCardHtml(sanitized);
}

export function hasCardRichTextContent(value = "") {
  const sanitized = sanitizeCardHtml(value);
  if (MEDIA_TAG_PATTERN.test(sanitized)) return true;

  return stripHtml(sanitized)
    .replace(/&nbsp;|\u00a0/g, " ")
    .trim().length > 0;
}

export function appendPlainTextToCardHtml(current = "", addition = "") {
  const additionHtml = textToCardHtml(addition);
  if (!additionHtml) return current;
  if (!hasCardRichTextContent(current)) return additionHtml;

  return `${normalizeRichTextForEditor(current)}${additionHtml}`;
}
