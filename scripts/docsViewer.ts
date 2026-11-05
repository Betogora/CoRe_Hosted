function initializeDocsViewer() {
  const theme = document.getElementById("docs-theme")!;
  theme.addEventListener("click", () => {
    const dark = document.documentElement.dataset.coreTheme !== "dark";
    document.documentElement.dataset.coreTheme = dark ? "dark" : "light";
    theme.setAttribute("aria-label", `${dark ? "Light" : "Dark"} Mode einschalten`);
  });
  const search = document.getElementById("docs-search") as HTMLInputElement;
  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(target.tagName) && !target.isContentEditable) {
      event.preventDefault();
      search.focus();
    }
  });
  const toc = document.getElementById("docs-toc")!;
  if (document.getElementById("catalog-root")) return;
  const entries = [...document.querySelectorAll<HTMLElement>(".docs-document h1, .docs-document h2, .docs-document h3")].map((heading) => {
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent!.replace(/\s+#$/, "");
    link.dataset.depth = heading.tagName.slice(1);
    toc.append(link);
    let text = heading.textContent ?? "";
    for (let next = heading.nextElementSibling; next && !/^H[123]$/.test(next.tagName); next = next.nextElementSibling) text += ` ${next.textContent}`;
    return { heading, link, text: text.toLocaleLowerCase("de") };
  });
  document.querySelectorAll<HTMLTableElement>(".docs-document table").forEach((table) => {
    if (table.parentElement?.classList.contains("docs-table-scroll")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "docs-table-scroll";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Seitlich scrollbare Tabelle");
    table.before(wrapper);
    wrapper.append(table);
  });
  function filter() {
    const query = search.value.trim().toLocaleLowerCase("de");
    let count = 0;
    entries.forEach(({ link, text }) => { link.hidden = Boolean(query && !text.includes(query)); if (!link.hidden) count++; });
    document.getElementById("docs-search-count")!.textContent = `${count} ${query ? "Treffer" : "Abschnitte"}`;
  }
  search.addEventListener("input", filter);
  toc.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement).closest("a");
    const entry = entries.find((entry) => entry.link === link);
    if (entry && (event as MouseEvent).detail === 0) entry.heading.focus({ preventScroll: true });
  });
  let frame = 0;
  let active: HTMLAnchorElement | undefined;
  function updateLocation() {
    frame = 0;
    let current = entries[0];
    for (const entry of entries) {
      if (entry.heading.getBoundingClientRect().top > parseFloat(getComputedStyle(entry.heading).scrollMarginTop) + 8) break;
      current = entry;
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = entries.at(-1)!;
    if (!current || active === current.link) return;
    active = current.link;
    entries.forEach(({ link }) => link === active ? link.setAttribute("aria-current", "location") : link.removeAttribute("aria-current"));
    revealTocLink(active, toc);
  }
  function scheduleLocation() { if (!frame) frame = requestAnimationFrame(updateLocation); }
  window.addEventListener("scroll", scheduleLocation, { passive: true });
  window.addEventListener("resize", scheduleLocation);
  window.addEventListener("hashchange", scheduleLocation);
  document.fonts.ready.then(scheduleLocation);
  updateLocation();
  filter();
}
/** Hält den aktiven Eintrag sichtbar: waagerecht in der schmalen Leiste, sonst in der scrollenden Inhaltsbox. */
function revealTocLink(link: HTMLElement, toc: HTMLElement) {
  const box = toc.scrollWidth > toc.clientWidth ? toc : toc.parentElement!;
  const bounds = box.getBoundingClientRect();
  const position = link.getBoundingClientRect();
  if (position.left < bounds.left || position.right > bounds.right) box.scrollLeft += position.left - bounds.left - 16;
  if (position.top < bounds.top || position.bottom > bounds.bottom) box.scrollTop += position.top - bounds.top - 48;
}
initializeDocsViewer();
