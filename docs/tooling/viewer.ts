function initializeDocsViewer() {
  const header = document.querySelector<HTMLElement>(".docs-site-nav")!;
  const resize = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--docs-nav-height", `${header.getBoundingClientRect().height}px`);
    const summary = document.querySelector<HTMLElement>(".docs-mobile-nav");
    if (summary) document.documentElement.style.setProperty("--docs-section-height", `${summary.getBoundingClientRect().height}px`);
  });
  resize.observe(header);
  const summary = document.querySelector<HTMLElement>(".docs-mobile-nav");
  if (summary) resize.observe(summary);
  const theme = document.getElementById("docs-theme")!;
  theme.addEventListener("click", () => {
    const dark = document.documentElement.dataset.coreTheme !== "dark";
    document.documentElement.dataset.coreTheme = dark ? "dark" : "light";
    theme.setAttribute("aria-label", `${dark ? "Light" : "Dark"} Mode einschalten`);
  });
  const toc = document.getElementById("docs-toc");
  if (!toc) return;
  const search = document.getElementById("docs-search") as HTMLInputElement;
  const rail = document.querySelector<HTMLElement>(".docs-rail")!;
  const toggle = document.getElementById("docs-nav-toggle")!;
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
  function closeMenu(restoreFocus = false) {
    rail.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener("click", () => {
    const open = rail.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    if (open) search.focus();
  });
  toc.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    const entry = entries.find((entry) => entry.link === link);
    closeMenu();
    if ((event as MouseEvent).detail === 0) entry?.heading.focus({ preventScroll: true });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!rail.contains(event.target as Node) && !toggle.contains(event.target as Node)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && rail.classList.contains("is-open")) {
      event.preventDefault();
      closeMenu(true);
    }
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !/INPUT|TEXTAREA/.test((event.target as HTMLElement).tagName)) {
      event.preventDefault(); rail.classList.add("is-open"); toggle.setAttribute("aria-expanded", "true"); search.focus();
    }
  });
  let frame = 0;
  let active: HTMLAnchorElement | undefined;
  function updateLocation() {
    frame = 0;
    const offset = header.getBoundingClientRect().height + (toggle.offsetHeight ? toggle.offsetHeight + 48 : 24);
    let current = entries[0];
    for (const entry of entries) {
      if (entry.heading.getBoundingClientRect().top > offset + 1) break;
      current = entry;
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = entries.at(-1)!;
    if (!current || active === current.link) return;
    active = current.link;
    entries.forEach(({ link }) => link === active ? link.setAttribute("aria-current", "location") : link.removeAttribute("aria-current"));
    document.getElementById("docs-current-section")!.textContent = current.link.textContent;
    const position = active.offsetTop - toc!.offsetTop;
    if (position < toc!.scrollTop || position + active.offsetHeight > toc!.scrollTop + toc!.clientHeight) toc!.scrollTop = position;
  }
  function scheduleLocation() { if (!frame) frame = requestAnimationFrame(updateLocation); }
  window.addEventListener("scroll", scheduleLocation, { passive: true });
  window.addEventListener("resize", scheduleLocation);
  window.addEventListener("hashchange", scheduleLocation);
  document.fonts.ready.then(scheduleLocation);
  updateLocation();
  filter();
}
initializeDocsViewer();
