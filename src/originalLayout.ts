// Rule of ADR-047, shared by the card renderer and the import report: a generically translated note type shows its
// own layout when its CSS goes beyond Anki's default card and the template needs no script.

// Rules on these selectors only restyle Anki's default card; anything else is the author's own design.
const CARD_LEVEL_SELECTOR = /^(?:\.card|\.card\.night_?mode|\.night_?mode\.card|\.night_?mode \.card)$/;

export function hasOwnDesign(css: string): boolean {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)]
    .some((rule) => rule[1].split(",").some((selector) => !CARD_LEVEL_SELECTOR.test(selector.trim().replace(/\s+/g, " ").toLowerCase())));
}

export function needsScript(template: { front: string; back: string }): boolean {
  return /<script\b|\son[a-z]+\s*=|<button\b|javascript:/i.test(template.front + template.back);
}
