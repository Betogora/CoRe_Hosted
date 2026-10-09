import type { Card, Note, NoteField, NoteInteraction } from "./coreTypes.ts";
import type { CoreTheme } from "./coreTheme.ts";
import type { TemplateDiagnostic } from "./safeTemplate.ts";
import { sanitizeNoteHtml } from "./htmlSafety.ts";
import { noteContentMediaRefs } from "./coreModel/noteContent.ts";
import { buildSrcdoc } from "./presentationFrame.ts";
import { colorContrast, ensureTextContrast, hexToHsv, resolveCssColor } from "./ui/colorMath.ts";

/** Semantic tokens copied into the card frame as `--core-<name>`. */
export const NOTE_THEME_COLORS = ["surface", "surface-muted", "text", "text-muted", "border", "border-interactive", "success", "success-surface", "danger", "danger-surface", "learning-goal-achieved"] as const;

export interface NotePresentationTheme {
  mode: CoreTheme;
  colors: Record<(typeof NOTE_THEME_COLORS)[number], string>;
}

export interface NotePresentationResult {
  srcdoc: string;
  accessibleText: string;
  mediaReferences: string[];
  interactions: Array<"hint" | "typed-answer" | "tts" | "audio" | "video" | "choice">;
  diagnostics: TemplateDiagnostic[];
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function notePlainText(value: string): string {
  let output = value.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, "");
  for (let start = output.indexOf('<span class="katex-html"'); start >= 0; start = output.indexOf('<span class="katex-html"')) {
    let depth = 0;
    let end = start;
    for (const tag of output.slice(start).matchAll(/<\/?span\b[^>]*>/g)) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) { end = start + tag.index + tag[0].length; break; }
    }
    if (end === start) break;
    output = output.slice(0, start) + output.slice(end);
  }
  return output.replace(/<math\b[^>]*>([\s\S]*?)<\/math>/g, (_match, math: string) => math.replace(/<[^>]*>/g, ""))
    .replace(/<\/?(?:br|hr|p|div|section|details|summary|h[1-6]|li|ul|ol|table|tr|td|th|blockquote|pre)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "").replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (_match, name: string) => ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name]!)
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, number: string) => {
      const code = number[0].toLowerCase() === "x" ? Number.parseInt(number.slice(1), 16) : Number(number);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }).replace(/\s+/g, " ").trim();
}
// Inline: \(…\) and [$]…[/$]; display: \[…\], [$$]…[/$$] and [latex]…[/latex].
const MATH = /\\\(([\s\S]*?)\\\)|\[\$\]([\s\S]*?)\[\/\$\]|\\\[([\s\S]*?)\\\]|\[\$\$\]([\s\S]*?)\[\/\$\$\]|\[latex\]([\s\S]*?)\[\/latex\]/gi;
const MATH_START = /\\[([]|\[latex\]|\[\$\$?\]/i;
export const noteHasMath = (note: Note) => note.content.fields.some((field) => MATH_START.test(field.html))
  || (note.content.interaction.kind === "choice" && note.content.interaction.options.some((option) => MATH_START.test(option.html)));

interface ClozeToken { text: string; hint: string; ordinals: number[]; end: number }
function clozeAt(value: string, start: number): ClozeToken | null {
  const opening = value.slice(start).match(/^\{\{c(\d+(?:,\d+)*)::/i);
  if (!opening) return null;
  const textStart = start + opening[0].length;
  let braces = 0;
  let hintStart = -1;
  for (let cursor = textStart; cursor < value.length; cursor += 1) {
    if (value[cursor] === "\\") { cursor += 1; continue; }
    const nested = clozeAtOpening(value, cursor);
    if (nested) {
      const child = clozeAt(value, cursor);
      if (!child) return null;
      cursor = child.end - 1;
      continue;
    }
    if (braces === 0 && value.startsWith("}}", cursor)) {
      return { text: value.slice(textStart, hintStart < 0 ? cursor : hintStart), hint: hintStart < 0 ? "" : value.slice(hintStart + 2, cursor), ordinals: opening[1].split(",").map(Number), end: cursor + 2 };
    }
    if (braces === 0 && hintStart < 0 && value.startsWith("::", cursor)) { hintStart = cursor; cursor += 1; }
    else if (value[cursor] === "{") braces += 1;
    else if (value[cursor] === "}" && braces > 0) braces -= 1;
  }
  return null;
}
const clozeAtOpening = (value: string, cursor: number) => value.startsWith("{{", cursor) && /^\{\{c\d+(?:,\d+)*::/i.test(value.slice(cursor));
function renderClozes(value: string, ordinal: number, side: "question" | "answer", math: boolean, accent: string): string {
  let output = "";
  for (let cursor = 0; cursor < value.length;) {
    const token = clozeAtOpening(value, cursor) ? clozeAt(value, cursor) : null;
    if (!token) { output += value[cursor++]; continue; }
    const active = token.ordinals.includes(ordinal);
    const inner = active && side === "question" ? `[${notePlainText(token.hint) || "…"}]` : renderClozes(token.text, ordinal, side, math, accent);
    output += !active ? inner : math
      ? `\\colorbox{${accent}}{${side === "question" ? `\\text{${inner.replace(/[\\{}$%&#_^~]/g, (character) => `\\char"${character.charCodeAt(0).toString(16)}{}`)}}` : `$${inner}$`}}`
      : `<mark class="core-active-cloze">${active && side === "question" ? escapeHtml(inner) : inner}</mark>`;
    cursor = token.end;
  }
  return output;
}

/**
 * Field colors follow the theme: coloured markers change brightness until the card text reads on them,
 * grey page backgrounds from pasted web text are dropped, and text colours reach 4,5 : 1 against
 * their marker or the card surface.
 */
function adjustedColors(html: string, colors: NotePresentationTheme["colors"]): string {
  const adjust = (value: string, backdrop: string) => { const hex = resolveCssColor(value, backdrop); return hex ? ensureTextContrast(hex, backdrop) : value; };
  // Unreadable black, white or grey text (pasted from dark or light web pages) takes the card's text colour.
  const textColor = (separator: string, value: string, backdrop: string) => {
    const hex = resolveCssColor(value, backdrop);
    if (!hex) return `${separator}color:${value}`;
    return hexToHsv(hex).saturation < .15 && colorContrast(hex, backdrop) < 4.5 ? separator : `${separator}color:${ensureTextContrast(hex, backdrop)}`;
  };
  return html.replace(/style="([^"]*)"/gi, (_match, style: string) => {
    let backdrop = colors.surface;
    const withMarker = style.replace(/(^|;)\s*background(?:-color)?\s*:\s*([^;]+)/gi, (part, separator: string, value: string) => {
      const hex = resolveCssColor(value, colors.surface);
      if (!hex) return part;
      if (hexToHsv(hex).saturation < .15) return separator;
      backdrop = ensureTextContrast(hex, colors.text);
      return `${separator}background-color:${backdrop}`;
    });
    return `style="${withMarker.replace(/(^|;)\s*color\s*:\s*([^;]+)/gi, (_part, separator: string, color: string) => textColor(separator, color, backdrop))}"`;
  }).replace(/\scolor="([^"]*)"/gi, (_match, color: string) => ` color="${adjust(color, colors.surface)}"`);
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(4))}%`;
}

// Rectangles, ellipses and labels are HTML in a layer the size of the image, so they turn in image pixels like in
// Anki; polygons are never rotated and stay in the stretched 0–1 SVG.
function occlusionHtml(interaction: Extract<NoteInteraction, { kind: "image-occlusion" }>, ordinal: number, side: "question" | "answer", alt: string): string {
  let polygons = "";
  let layer = "";
  for (const { shape, ordinal: group, alwaysOccluded } of interaction.masks) {
    if (shape.kind === "text") {
      // Anki's `fs` is relative to the image height; `cqh` refers to the height of the mask layer.
      const fontSize = shape.fontSize ? `${Number((shape.fontSize * shape.scale * 100).toFixed(4))}cqh` : `${shape.scale}em`;
      layer += `<span class="mask-label" style="left:${percent(shape.left)};top:${percent(shape.top)};font-size:${fontSize};transform:rotate(${shape.angle}deg)">${escapeHtml(shape.text)}</span>`;
      continue;
    }
    const active = group === ordinal;
    if (shape.kind === "overlay") {
      const overlay = side === "answer" ? shape.answer : shape.question;
      if (active && overlay) layer += `<img class="mask-overlay" src="${escapeHtml(overlay)}" alt=""/>`;
      continue;
    }
    if (!active && !alwaysOccluded && interaction.mode === "hide-one-guess-one") continue;
    const className = active && side === "answer" ? "mask-outline" : active ? "mask-target" : "mask-muted";
    if (shape.kind === "polygon") {
      polygons += `<polygon class="${className}" vector-effect="non-scaling-stroke" points="${shape.points.map((point) => point.join(",")).join(" ")}"/>`;
      continue;
    }
    const rotate = shape.angle ? `;transform:rotate(${shape.angle}deg)` : "";
    layer += `<span class="mask mask-${shape.kind} ${className}" style="left:${percent(shape.left)};top:${percent(shape.top)};width:${percent(shape.width)};height:${percent(shape.height)}${rotate}"></span>`;
  }
  return `<div class="core-occlusion"><img src="${escapeHtml(interaction.image)}" alt="${escapeHtml(alt)}"/><div class="mask-layer"><svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none">${polygons}</svg>${layer}</div></div>`;
}

async function createHtmlRenderer(note: Note, card: Pick<Card, "promptKey">, side: "question" | "answer", theme: NotePresentationTheme, diagnostics: TemplateDiagnostic[], interactions: Set<NotePresentationResult["interactions"][number]>) {
  const interaction = note.content.interaction;
  const ordinal = Number(card.promptKey.split(":")[1]);
  const katex = noteHasMath(note) ? await import("katex") : null;
  const html = (raw: string) => {
    const sanitized = adjustedColors(sanitizeNoteHtml(raw), theme.colors);
    let output = "";
    let cursor = 0;
    for (const match of sanitized.matchAll(MATH)) {
      const prose = sanitized.slice(cursor, match.index);
      output += interaction.kind === "cloze" ? renderClozes(prose, ordinal, side, false, theme.colors["success-surface"]) : prose;
      let tex = notePlainText(match.slice(1).find((group) => group !== undefined) ?? "");
      if (interaction.kind === "cloze") tex = renderClozes(tex, ordinal, side, true, theme.colors["success-surface"]);
      try {
        let blocked = false;
        const rendered = katex!.renderToString(tex, { displayMode: match[1] === undefined && match[2] === undefined, throwOnError: true, trust: () => { blocked = true; return false; }, strict: "error", maxExpand: 1000, maxSize: 20 });
        if (blocked) throw new Error("Nicht erlaubter Formelbefehl.");
        output += rendered;
      } catch {
        diagnostics.push({ code: "math-error", level: "warning", message: "Diese Formel konnte nicht dargestellt werden.", detail: tex });
        output += `<span class="core-math-error" role="note"><code>${escapeHtml(tex)}</code><span>Formel nicht darstellbar</span></span>`;
      }
      cursor = match.index + match[0].length;
    }
    const rest = sanitized.slice(cursor);
    output += interaction.kind === "cloze" ? renderClozes(rest, ordinal, side, false, theme.colors["success-surface"]) : rest;
    return output.replace(/\[sound:([^\]\r\n]+)\]/gi, (_match, name: string) => {
      const video = /\.(?:mp4|webm|mov)(?:[?#].*)?$/i.test(name);
      interactions.add(video ? "video" : "audio");
      return `<${video ? "video" : "audio"} controls preload="none" src="${escapeHtml(name.trim())}"></${video ? "video" : "audio"}>`;
    }).replace(/<a\b([^>]*?)>/gi, (_match, attrs: string) => `<a${attrs.replace(/\s(?:target|rel)="[^"]*"/gi, "")} target="_blank" rel="noopener noreferrer">`);
  };
  return html;
}

export async function renderNoteChoiceOptions(note: Note, theme: NotePresentationTheme) {
  if (note.content.interaction.kind !== "choice") return [];
  const html = await createHtmlRenderer(note, { promptKey: "choice" }, "question", theme, [], new Set());
  return note.content.interaction.options.map((option) => ({ id: option.id, html: html(option.html) }));
}

export async function renderNoteSpeech(note: Note, card: Card, side: "question" | "answer", theme: NotePresentationTheme) {
  const interaction = note.content.interaction;
  const prompt = interaction.kind === "reveal" ? interaction.prompts.find((item) => item.key === card.promptKey) : null;
  const html = await createHtmlRenderer(note, card, side, theme, [], new Set());
  return note.content.speech.flatMap((speech) => {
    const field = note.content.fields.find((item) => item.id === speech.fieldId)!;
    const visible = field.role !== "note" && (field.role === "hint"
      || ((field.role === "prompt" || field.role === "answer") && (prompt ? prompt.questionFieldIds.includes(field.id) || (side === "answer" && prompt.answerFieldIds.includes(field.id)) : field.role === "prompt" || (side === "answer" && field.role === "answer")))
      || (side === "answer" && ["extra", "source"].includes(field.role)));
    return visible ? [{ ...speech, label: field.name, text: notePlainText(html(field.html)) }] : [];
  });
}

function typedComparisonHtml(expected: string, typed: string): string {
  const result = compareTypedAnswer(expected, typed);
  const tokens = (items: TypedToken[]) => items.map((token) => `<span class="typed-${token.kind}">${escapeHtml(token.text)}</span>`).join("");
  const row = (label: string, value: string) => `<p><span class="core-typed-label">${label}</span> <span class="core-typed-value">${value}</span></p>`;
  const typedRow = row("Deine Antwort", typed ? tokens(result.typed) : '<span class="typed-empty">Keine Eingabe</span>');
  return `<div class="core-typed-comparison" data-correct="${result.correct}">${result.correct ? "" : typedRow}${row("Richtig", tokens(result.expected))}</div>`;
}

const LINK_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

const NOTE_CARD_CSS = `
  body{background:var(--core-surface);color:var(--core-text)}
  body:has(>.core-card-answer-separator:first-child){padding-top:0}
  .core-card-answer-separator{background:var(--core-border)}
  .core-card-answer-separator:first-child{margin-top:.25rem}
  .core-note-instruction{margin:0 0 .5rem;color:var(--core-text-muted);font-size:.875rem;font-weight:600}
  .core-note-field+.core-note-field{margin-top:.75rem}
  details{margin-top:.75rem;border:1px solid var(--core-border);border-radius:.75rem}
  details+details{margin-top:.5rem}
  summary{display:flex;align-items:center;gap:.625rem;min-height:44px;padding:0 .875rem;cursor:pointer;list-style:none;color:var(--core-text-muted);font-size:.875rem;font-weight:600}
  summary::-webkit-details-marker{display:none}
  summary::before{content:"";width:.4rem;height:.4rem;margin-left:.125rem;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform .15s ease}
  details[open]>summary{color:var(--core-text)}
  details[open]>summary::before{transform:rotate(45deg)}
  .core-note-hint{padding:0 .875rem .875rem 2.125rem}
  .core-note-supplement{margin-top:1.25rem}
  .core-note-supplement h3{margin:0 0 .25rem;color:var(--core-text-muted);font-size:.75rem;font-weight:600;line-height:1.4}
  .core-note-sources{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:1.25rem}
  .core-source-link{display:inline-flex;align-items:center;gap:.375rem;min-height:44px;padding:0 .875rem;border:1px solid var(--core-border);border-radius:.75rem;color:var(--core-text);font-size:.875rem;font-weight:600;text-decoration:none}
  .core-source-link svg{flex-shrink:0;color:var(--core-text-muted)}
  .core-source-link:hover{background:var(--core-surface-muted)}
  .core-active-cloze{padding:.05em .35em;border-radius:.375rem;background:var(--core-success-surface);box-shadow:inset 0 0 0 1px var(--core-success);color:var(--core-text);font-weight:600;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  .core-typed-comparison{display:grid;gap:.625rem;padding:.75rem 1rem;border:1px solid var(--core-border);border-left:3px solid var(--core-danger);border-radius:.75rem}
  .core-typed-comparison[data-correct="true"]{border-left-color:var(--core-learning-goal-achieved)}
  .core-typed-comparison p{display:grid;gap:.125rem;margin:0}
  .core-typed-label{color:var(--core-text-muted);font-size:.75rem;font-weight:600}
  .core-typed-value{font-size:1.125rem;font-weight:600;letter-spacing:.02em}
  .typed-correct{color:var(--core-learning-goal-achieved)}
  .typed-wrong{border-radius:.2em;background:var(--core-danger-surface);color:var(--core-text);text-decoration:line-through 1.5px var(--core-danger)}
  .typed-missing{text-decoration:underline 2px var(--core-danger);text-underline-offset:.2em}
  .typed-empty{color:var(--core-text-muted);font-weight:400;font-style:italic}
  .core-occlusion{position:relative;display:inline-block;max-width:100%;margin-top:.75rem;overflow:hidden;border:1px solid var(--core-border);border-radius:.75rem;vertical-align:top}
  .core-occlusion img{display:block;max-width:100%;height:auto}
  .core-occlusion svg,.core-occlusion .mask-overlay,.mask-layer{position:absolute;inset:0;width:100%;height:100%}
  .mask-layer{container-type:size}
  .mask-target{fill:var(--core-success);stroke:var(--core-surface);stroke-width:2}
  .mask-muted{fill:var(--core-border-interactive);stroke:var(--core-surface);stroke-width:1.5}
  .mask-outline{fill:none;stroke:var(--core-success);stroke-width:3;stroke-dasharray:6 4}
  .mask{position:absolute;box-sizing:border-box;transform-origin:0 0}
  .mask-ellipse{border-radius:50%}
  span.mask-target{border:2px solid var(--core-surface);background:var(--core-success)}
  span.mask-muted{border:1.5px solid var(--core-surface);background:var(--core-border-interactive)}
  span.mask-outline{border:3px dashed var(--core-success)}
  .mask-label{position:absolute;transform-origin:0 0;padding:0 .2em .15em 0;border-radius:.15em;background:var(--core-surface);color:var(--core-text);font-family:Arial,"Liberation Sans",Arimo,sans-serif;font-weight:400;line-height:1.1;white-space:nowrap}
  table{display:block;max-width:100%;margin:.75rem 0;overflow-x:auto;border-collapse:collapse;overflow-wrap:normal}
  td,th{padding:.375rem .625rem;border:1px solid var(--core-border);text-align:left;vertical-align:top}
  audio{display:block;width:100%;max-width:28rem;margin:.75rem 0}
  video{display:block;max-width:100%;margin:.75rem 0;border-radius:.75rem}
  .core-math-error{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:.375rem;padding:.125rem .5rem;border-radius:.5rem;background:var(--core-danger-surface)}
  .core-math-error code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.875em;white-space:pre-wrap}
  .core-math-error>span{color:var(--core-text-muted);font-size:.75rem;font-weight:600}
  .katex{display:inline-block;max-width:100%;overflow-x:auto;vertical-align:middle}
  .katex-display{max-width:100%;overflow:auto}
`;

export async function renderCard({ note, card, side, surface, theme, mathCss = "", typedAnswer }: {
  note: Note; card: Card; side: "question" | "answer"; surface: "review" | "preview" | "management"; theme: NotePresentationTheme; mathCss?: string;
  /** Typed input; on the answer side it replaces the type-in field with the character comparison. */
  typedAnswer?: string;
}): Promise<NotePresentationResult> {
  if (card.noteId !== note.id) throw new Error("Die Karte gehört zu einem anderen Inhalt.");
  const diagnostics: TemplateDiagnostic[] = [];
  const interactions = new Set<NotePresentationResult["interactions"][number]>();
  const content = note.content;
  const interaction = content.interaction;
  const ordinal = Number(card.promptKey.split(":")[1]);
  const html = await createHtmlRenderer(note, card, side, theme, diagnostics, interactions);
  const fieldsHtml = (fields: NoteField[]) => fields.filter((field) => field.role === "prompt" || field.role === "answer").map((field) => `<div class="core-note-field">${html(field.html)}</div>`).join("");
  const supplements = () => {
    const filled = (role: NoteField["role"]) => content.fields.filter((field) => field.role === role && field.html.trim()).map((field) => ({ field, value: html(field.html) }));
    const sources = filled("source");
    const isLink = ({ value }: { value: string }) => /<a\b/.test(value);
    const sections = [...filled("extra"), ...sources.filter((source) => !isLink(source))]
      .map(({ field, value }) => `<section class="core-note-supplement"><h3>${escapeHtml(field.name)}</h3>${value}</section>`).join("");
    const links = sources.filter(isLink).map(({ value }) => value.replace(/<a\b/g, '<a class="core-source-link"').replace(/<\/a>/g, `${LINK_ICON}</a>`));
    return sections + (links.length ? `<div class="core-note-sources">${links.join("")}</div>` : "");
  };
  let question = "";
  let answer = "";
  if (interaction.kind === "reveal") {
    const prompt = interaction.prompts.find((item) => item.key === card.promptKey);
    if (!prompt) throw new Error("Die Abfrage dieser Karte fehlt im Inhalt.");
    if (prompt.typeInFieldId) interactions.add("typed-answer");
    const byId = new Map(content.fields.map((field) => [field.id, field]));
    question = `${prompt.instruction ? `<p class="core-note-instruction">${escapeHtml(prompt.instruction)}</p>` : ""}${fieldsHtml(prompt.questionFieldIds.flatMap((id) => byId.get(id) ?? []))}`;
    answer = side === "answer" ? prompt.answerFieldIds.flatMap((id) => byId.get(id) ?? []).map((field) => field.id === prompt.typeInFieldId && typedAnswer !== undefined
      ? typedComparisonHtml(notePlainText(sanitizeNoteHtml(field.html)), typedAnswer)
      : fieldsHtml([field])).join("") : "";
  } else {
    question = fieldsHtml(content.fields.filter((field) => field.role === "prompt"));
    if (interaction.kind === "cloze") answer = question;
    else if (interaction.kind === "image-occlusion") {
      const header = notePlainText(html(content.fields.find((field) => field.role === "prompt" && field.html.trim())?.html ?? ""));
      question += occlusionHtml(interaction, ordinal, side, header ? `${header} – Bild mit verdeckten Bereichen` : "Bild mit verdeckten Bereichen");
      answer = question;
    } else interactions.add("choice");
    if (side === "answer" && interaction.kind !== "cloze" && interaction.kind !== "image-occlusion") answer = fieldsHtml(content.fields.filter((field) => field.role === "answer"));
  }
  for (const hint of content.fields.filter((field) => field.role === "hint" && field.html.trim())) {
    interactions.add("hint");
    question += `<details><summary>${escapeHtml(hint.name)}</summary><div class="core-note-hint">${html(hint.html)}</div></details>`;
  }
  if (content.speech.length) interactions.add("tts");
  if (/<audio\b/i.test(question + answer)) interactions.add("audio");
  if (/<video\b/i.test(question + answer)) interactions.add("video");
  const replacesFront = interaction.kind === "cloze" || interaction.kind === "image-occlusion";
  const body = side === "question" ? question : replacesFront ? question + supplements()
    : `${surface === "review" ? "" : question}<hr class="core-card-answer-separator"/>${answer}${supplements()}`;
  const colors = Object.entries(theme.colors).map(([name, value]) => `--core-${name}:${value}`).join(";");
  return {
    srcdoc: buildSrcdoc(body, `:root{${colors}}${NOTE_CARD_CSS}${mathCss}`, theme.mode, "", surface === "review"),
    accessibleText: notePlainText(body),
    mediaReferences: noteContentMediaRefs(content),
    interactions: [...interactions],
    diagnostics,
  };
}

interface TypedToken { kind: "correct" | "wrong" | "missing"; text: string }
export function compareTypedAnswer(expected: string, typed: string): { correct: boolean; typed: TypedToken[]; expected: TypedToken[] } {
  const a = Array.from(expected.normalize("NFC"));
  const b = Array.from(typed.normalize("NFC"));
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) {
    lengths[i * width + j] = a[i] === b[j] ? 1 + lengths[(i + 1) * width + j + 1] : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
  }
  const actual: TypedToken[] = [];
  const target: TypedToken[] = [];
  let wrongCount = 0;
  const pendingExpected: number[] = [];
  const finishMismatch = () => {
    for (const index of pendingExpected.slice(0, wrongCount)) target[index].kind = "wrong";
    pendingExpected.length = 0;
    wrongCount = 0;
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { finishMismatch(); actual.push({ kind: "correct", text: b[j++] }); target.push({ kind: "correct", text: a[i++] }); }
    else if (j < b.length && (i === a.length || lengths[i * width + j + 1] >= lengths[(i + 1) * width + j])) { actual.push({ kind: "wrong", text: b[j++] }); wrongCount += 1; }
    else { pendingExpected.push(target.length); target.push({ kind: "missing", text: a[i++] }); }
  }
  finishMismatch();
  return { correct: expected.normalize("NFC") === typed.normalize("NFC"), typed: actual, expected: target };
}

export function evaluateNoteChoice(choice: Extract<NoteInteraction, { kind: "choice" }>, answers: Record<string, boolean>) {
  const options = choice.options.map((option) => {
    const selected = choice.mode === "kprim" ? answers[option.id] ?? null : answers[option.id] === true;
    return { id: option.id, selected, expected: option.correct, correct: selected === option.correct };
  });
  const complete = choice.mode === "kprim" ? options.every((option) => option.selected !== null) : options.some((option) => option.selected);
  return { complete, correct: complete && options.every((option) => option.correct), options };
}
