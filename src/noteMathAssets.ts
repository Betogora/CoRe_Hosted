import css from "katex/dist/katex.min.css?raw";

const fonts = import.meta.glob<string>("../node_modules/katex/dist/fonts/*.woff2", { eager: true, query: "?url", import: "default" });
let cssPromise: Promise<string> | null = null;

/** Fetch bundled fonts in the host once; the card frame receives only data URLs. */
export function loadNoteMathCss(): Promise<string> {
  cssPromise ??= Promise.all(Object.entries(fonts).map(async ([path, url]) => {
    if (url.startsWith("data:")) return [path, url];
    const response = await fetch(url);
    if (!response.ok) throw new Error("Formelschrift konnte nicht geladen werden.");
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return [path, dataUrl];
  })).then((entries) => {
    const embedded = Object.fromEntries(entries);
    return css.replace(/src:[^;]+;/g, (source) => {
      const name = source.match(/url\([^)]*\/([^/)]+\.woff2)\)/)?.[1];
      return name ? `src:url("${embedded[`../node_modules/katex/dist/fonts/${name}`]}") format("woff2");` : "";
    });
  });
  return cssPromise;
}
