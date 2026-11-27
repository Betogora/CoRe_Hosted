import css from "katex/dist/katex.min.css?raw";

const fonts = import.meta.glob<string>("../node_modules/katex/dist/fonts/*.woff2", { eager: true, query: "?url", import: "default" });
let cssPromise: Promise<string> | null = null;

/**
 * Fetch bundled fonts in the host once; the card frame (same origin, it loads nothing itself) receives `blob:` URLs,
 * which stay valid for the page's lifetime and keep every cached card document free of the font bytes.
 */
export function loadNoteMathCss(): Promise<string> {
  cssPromise ??= Promise.all(Object.entries(fonts).map(async ([path, url]) => {
    if (url.startsWith("data:")) return [path, url];
    const response = await fetch(url);
    if (!response.ok) throw new Error("Formelschrift konnte nicht geladen werden.");
    return [path, URL.createObjectURL(await response.blob())];
  })).then((entries) => {
    const embedded = Object.fromEntries(entries);
    // In the minified stylesheet `src` closes each rule without a semicolon.
    return css.replace(/src:[^;}]+/g, (source) => {
      const name = source.match(/url\([^)]*\/([^/)]+\.woff2)\)/)?.[1];
      return name ? `src:url("${embedded[`../node_modules/katex/dist/fonts/${name}`]}") format("woff2")` : "";
    });
  }).catch((error: unknown) => {
    cssPromise = null;
    throw error;
  });
  return cssPromise;
}
