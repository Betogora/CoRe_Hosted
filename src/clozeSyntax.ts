/** One Anki cloze deletion `{{c1,2::text::hint}}`; `end` is the index after its closing braces. */
export interface ClozeToken { text: string; hint: string; ordinals: number[]; end: number }

export const isClozeOpening = (value: string, cursor: number) => value.startsWith("{{", cursor) && /^\{\{c\d+(?:,\d+)*::/i.test(value.slice(cursor));

/** The deletion starting at `start`, nested deletions included in its text; null when no `}}` closes it. */
export function clozeAt(value: string, start: number): ClozeToken | null {
  const opening = value.slice(start).match(/^\{\{c(\d+(?:,\d+)*)::/i);
  if (!opening) return null;
  const textStart = start + opening[0].length;
  const ordinals = opening[1].split(",").map(Number);
  let braces = 0;
  let hintStart = -1;
  for (let cursor = textStart; cursor < value.length; cursor += 1) {
    if (value[cursor] === "\\") { cursor += 1; continue; }
    if (isClozeOpening(value, cursor)) {
      const child = clozeAt(value, cursor);
      if (!child) return null;
      cursor = child.end - 1;
      continue;
    }
    if (braces === 0 && value.startsWith("}}", cursor)) {
      return { text: value.slice(textStart, hintStart < 0 ? cursor : hintStart), hint: hintStart < 0 ? "" : value.slice(hintStart + 2, cursor), ordinals, end: cursor + 2 };
    }
    if (braces === 0 && hintStart < 0 && value.startsWith("::", cursor)) { hintStart = cursor; cursor += 1; }
    else if (value[cursor] === "{") braces += 1;
    else if (value[cursor] === "}" && braces > 0) braces -= 1;
  }
  // Anki closes a deletion at the next `}}` and knows neither escapes nor braces; cards are made by that rule, so a
  // deletion this reading leaves open is shown as Anki would show it rather than with its answer in plain sight.
  const close = value.indexOf("}}", textStart);
  if (close < 0) return null;
  const body = value.slice(textStart, close);
  const hint = body.indexOf("::");
  return { text: hint < 0 ? body : body.slice(0, hint), hint: hint < 0 ? "" : body.slice(hint + 2), ordinals, end: close + 2 };
}

/**
 * Rewrites every deletion of `value` with `replace(token, inner)`, where `inner` is its already rewritten text.
 * Text outside deletions stays as it is; returns null when a deletion is not closed.
 */
export function mapClozes(value: string, replace: (token: ClozeToken, inner: string) => string): string | null {
  let output = "";
  for (let cursor = 0; cursor < value.length;) {
    if (!isClozeOpening(value, cursor)) { output += value[cursor++]; continue; }
    const token = clozeAt(value, cursor);
    if (!token) return null;
    const inner = mapClozes(token.text, replace);
    if (inner === null) return null;
    output += replace(token, inner);
    cursor = token.end;
  }
  return output;
}
