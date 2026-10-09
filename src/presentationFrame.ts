export function buildSrcdoc(html: string, css: string, theme: "light" | "dark", fontFaceCss = "", reviewSurface = false): string {
  const background = reviewSurface ? "transparent" : theme === "dark" ? "#17151f" : "#ffffff";
  const foreground = theme === "dark" ? "#f4f0ff" : "#211b2b";
  const separator = theme === "dark" ? "#536078" : "#d5dbe5";
  const reviewOverrides = reviewSurface ? "html{scrollbar-gutter:stable}html,body{background:transparent!important}" : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; font-src data: blob:; form-action 'none'; frame-src 'none'; img-src data: blob:; media-src data: blob:; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'"><meta name="color-scheme" content="${theme}"><style>${fontFaceCss}:root{color-scheme:${theme}}html,body{margin:0;max-width:100%;overflow-wrap:anywhere}body{box-sizing:border-box;background:${background};color:${foreground};font-family:"Manrope Variable",Manrope,ui-sans-serif,system-ui,sans-serif;font-size:1rem;line-height:1.5;padding:clamp(1rem,3vw,2rem)}p{margin:0 0 .75rem}p:last-child{margin-bottom:0}ul,ol{margin:.75rem 0;padding-inline-start:1.5rem}li+li{margin-top:.375rem}strong,b{font-weight:600}.core-card-answer-separator{height:1px;margin:1.25rem auto;max-width:12rem;border:0;background:${separator}}.core-field-separator{height:.75rem}.core-compatibility-notice{border:1px solid currentColor;border-radius:.75rem;margin-bottom:1rem;padding:.75rem}.core-fallback-field+ .core-fallback-field{margin-top:1rem}.core-fallback-field h3{font-size:.875rem;margin:0 0 .375rem;opacity:.72}img,video{height:auto;max-width:100%}${css}${reviewOverrides}</style></head><body>${html}</body></html>`;
}

export function resolvePresentationMedia(srcdoc: string, mediaUrls: Record<string, string>): string {
  const safeUrls = Object.fromEntries(Object.entries(mediaUrls).filter(([, value]) => /^(?:blob:|data:)/i.test(value)));
  const resolve = (raw: string) => {
    const value = raw.replace(/^['"]|['"]$/g, "");
    const name = value.split(/[?#]/)[0].replace(/\\/g, "/").split("/").at(-1) ?? value;
    return safeUrls[value] ?? safeUrls[name] ?? null;
  };
  const attributes = srcdoc.replace(/\s(src|poster)=(["'])(.*?)\2/gi, (match, attribute, quote, value) => {
    const resolved = resolve(value);
    return resolved ? ` ${attribute}=${quote}${resolved.replace(/&/g, "&amp;").replace(new RegExp(quote, "g"), quote === '"' ? "&quot;" : "&#39;")}${quote}` : match;
  });
  return attributes.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, quote, value) => {
    const resolved = resolve(value);
    return resolved ? `url(${quote}${resolved}${quote})` : match;
  });
}
