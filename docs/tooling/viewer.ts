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
  if (document.querySelector("[data-specs-catalog]")) return initializeSpecsCatalog(search, toc);
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
/** Specs im Katalogaufbau: Kartensuche, leere Kapitel ausblenden und Kapitel-Scrollspy. */
function initializeSpecsCatalog(search: HTMLInputElement, toc: HTMLElement) {
  const normalize = (value: string | null) => (value ?? "").toLocaleLowerCase("de");
  const sections = [...document.querySelectorAll<HTMLElement>(".catalog-section")].map((section) => ({
    section,
    heading: normalize(section.querySelector(".catalog-section-heading")!.textContent),
    cards: [...section.querySelectorAll<HTMLElement>(".catalog-card")].map((card) => ({ card, text: normalize(card.textContent) })),
  }));
  const empty = document.getElementById("specs-empty")!;
  const links = [...toc.querySelectorAll<HTMLAnchorElement>("a")];
  const targets = links.map((link) => ({ link, target: document.getElementById(decodeURIComponent(link.hash.slice(1)))! }));
  search.addEventListener("input", () => {
    const query = normalize(search.value.trim());
    let visible = 0;
    for (const { section, heading, cards } of sections) {
      const all = !query || heading.includes(query);
      let shown = 0;
      for (const { card, text } of cards) { card.hidden = !all && !text.includes(query); if (!card.hidden) shown++; }
      section.hidden = shown === 0;
      visible += shown;
    }
    empty.hidden = visible > 0;
    schedule();
  });
  let frame = 0;
  function update() {
    frame = 0;
    const visible = targets.filter(({ target }) => !target.hidden);
    const passed = visible.filter(({ target }) => target.getBoundingClientRect().top <= parseFloat(getComputedStyle(target).scrollMarginTop) + 8);
    const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const active = ((atEnd ? visible : passed).at(-1) ?? visible[0] ?? targets[0]).link;
    if (active.getAttribute("aria-current")) return;
    links.forEach((link) => link === active ? link.setAttribute("aria-current", "location") : link.removeAttribute("aria-current"));
    revealTocLink(active, toc);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  document.fonts.ready.then(schedule);
  update();
}
initializeDocsViewer();
