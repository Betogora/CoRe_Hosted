function initializeDocsViewer() {
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
  toggle.addEventListener("click", () => {
    const open = rail.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    if (open) search.focus();
  });
  toc.addEventListener("click", () => { rail.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { rail.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); }
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !/INPUT|TEXTAREA/.test((event.target as HTMLElement).tagName)) {
      event.preventDefault(); rail.classList.add("is-open"); search.focus();
    }
  });
  const observer = new IntersectionObserver((records) => {
    const current = records.find((record) => record.isIntersecting);
    if (!current) return;
    entries.forEach(({ heading, link }) => heading === current.target ? link.setAttribute("aria-current", "location") : link.removeAttribute("aria-current"));
  }, { rootMargin: "-120px 0px -65% 0px" });
  entries.forEach(({ heading }) => observer.observe(heading));
  filter();
}
initializeDocsViewer();
