import React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export interface InPageNavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface InPageNavigationProps {
  ariaLabel: string;
  items: readonly InPageNavigationItem[];
  children: React.ReactNode;
}

const desktopNavigation = "(min-width: 1280px)";
const compactHeaderSelector = '[data-navigation-layout="mobile-header"]';

function currentHashId() {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return "";
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sectionHeading(section: HTMLElement) {
  const headingId = section.getAttribute("aria-labelledby");
  return headingId ? document.getElementById(headingId) : null;
}

export function InPageNavigation({ ariaLabel, items, children }: InPageNavigationProps) {
  const firstItemId = items[0]?.id ?? "";
  const [activeId, setActiveId] = React.useState(firstItemId);
  const [compactOpen, setCompactOpen] = React.useState(false);
  const [desktop, setDesktop] = React.useState(false);
  const [compactHeaderHeight, setCompactHeaderHeight] = React.useState(68);
  const [compactSummaryHeight, setCompactSummaryHeight] = React.useState(60);
  const compactNavigationRef = React.useRef<HTMLElement>(null);
  const compactSummaryRef = React.useRef<HTMLElement>(null);
  const layoutRef = React.useRef<HTMLDivElement>(null);
  const itemIds = items.map((item) => item.id).join("|");
  const currentItem = items.find((item) => item.id === activeId) ?? items[0];
  const compactStickyTop = compactHeaderHeight + 12;
  const activationOffset = desktop ? 16 : compactStickyTop + compactSummaryHeight + 12;

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(desktopNavigation);
    const synchronize = () => {
      setDesktop(mediaQuery.matches);
      if (mediaQuery.matches) setCompactOpen(false);
    };
    synchronize();
    mediaQuery.addEventListener("change", synchronize);
    return () => mediaQuery.removeEventListener("change", synchronize);
  }, []);

  React.useEffect(() => {
    const header = document.querySelector<HTMLElement>(compactHeaderSelector);
    const summary = compactSummaryRef.current;
    const synchronize = () => {
      setCompactHeaderHeight(header?.getBoundingClientRect().height ?? 0);
      setCompactSummaryHeight(summary?.getBoundingClientRect().height ?? 60);
    };
    synchronize();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(synchronize);
    if (header) observer.observe(header);
    if (summary) observer.observe(summary);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!compactOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!compactNavigationRef.current?.contains(event.target as Node)) setCompactOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [compactOpen]);

  React.useEffect(() => {
    const ids = new Set(itemIds.split("|").filter(Boolean));
    const mountedPath = `${window.location.pathname}${window.location.search}`;
    const scrollToHash = (behavior: ScrollBehavior) => {
      if (`${window.location.pathname}${window.location.search}` !== mountedPath) return;
      const hashId = currentHashId();
      if (!hashId) {
        setActiveId(firstItemId);
        return;
      }
      if (!ids.has(hashId)) return;
      const section = document.getElementById(hashId);
      if (!section) return;
      setActiveId(hashId);
      window.requestAnimationFrame(() => section.scrollIntoView({ behavior, block: "start" }));
    };
    scrollToHash("auto");
    const handleHistoryNavigation = () => scrollToHash(prefersReducedMotion() ? "auto" : "smooth");
    window.addEventListener("hashchange", handleHistoryNavigation);
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => {
      window.removeEventListener("hashchange", handleHistoryNavigation);
      window.removeEventListener("popstate", handleHistoryNavigation);
    };
  }, [firstItemId, itemIds]);

  React.useEffect(() => {
    const sections = items.map((item) => document.getElementById(item.id)).filter((section): section is HTMLElement => Boolean(section));
    if (sections.length === 0) return undefined;
    const visibleSections = new Set<HTMLElement>();
    const updateFromVisibleSections = () => {
      const nextSection = [...visibleSections].sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0];
      if (nextSection) setActiveId(nextSection.id);
    };
    const scrollRegion = desktop ? layoutRef.current?.closest<HTMLElement>(".core-screen-region") ?? null : null;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleSections.add(entry.target as HTMLElement);
        else visibleSections.delete(entry.target as HTMLElement);
      });
      updateFromVisibleSections();
    }, {
      root: scrollRegion,
      rootMargin: desktop ? "-16px 0px -72% 0px" : `-${Math.round(activationOffset)}px 0px -40% 0px`,
    });
    sections.forEach((section) => observer.observe(section));

    const scrollTarget: Window | HTMLElement = scrollRegion ?? window;
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const atEnd = scrollRegion
          ? scrollRegion.scrollTop + scrollRegion.clientHeight >= scrollRegion.scrollHeight - 2
          : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        if (atEnd) setActiveId(sections.at(-1)?.id ?? firstItemId);
      });
    };
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activationOffset, desktop, firstItemId, itemIds, items]);

  function selectSection(event: React.MouseEvent<HTMLAnchorElement>, item: InPageNavigationItem, compact: boolean) {
    event.preventDefault();
    const section = document.getElementById(item.id);
    if (!section) return;
    const nextHash = `#${item.id}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(window.history.state, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
    setActiveId(item.id);
    section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

    const keyboardActivation = event.detail === 0;
    if (compact) {
      setCompactOpen(false);
      if (!keyboardActivation) compactSummaryRef.current?.focus({ preventScroll: true });
    }
    if (keyboardActivation) {
      window.requestAnimationFrame(() => sectionHeading(section)?.focus({ preventScroll: true }));
    }
  }

  function links(compact: boolean) {
    return items.map((item) => {
      const Icon = item.icon;
      const active = item.id === activeId;
      return (
        <li key={item.id} className="min-w-0 border-l border-core-border">
          <a
            href={`#${item.id}`}
            aria-current={active && compact !== desktop ? "location" : undefined}
            data-in-page-navigation-link={item.id}
            className={`-ml-px flex min-h-11 min-w-0 items-center gap-3 rounded-r-xl border-l-[3px] px-3 py-2 core-body no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-core-focus ${active ? "border-core-action bg-core-subtle font-semibold text-core-text" : "border-transparent font-medium text-core-secondary hover:bg-core-subtle hover:text-core-text"}`}
            onClick={(event) => selectSection(event, item, compact)}
          >
            <Icon className="size-[1.125rem] shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{item.label}</span>
          </a>
        </li>
      );
    });
  }

  if (!currentItem) return <div className="grid min-w-0 gap-7">{children}</div>;
  const CurrentIcon = currentItem.icon;
  const layoutStyle = { "--core-in-page-scroll-margin": `${Math.round(activationOffset + 16)}px` } as React.CSSProperties;

  return (
    <div ref={layoutRef} className="grid min-w-0 gap-7 xl:grid-cols-[13rem_minmax(0,1fr)] xl:items-start" style={layoutStyle}>
      <nav aria-label={ariaLabel} className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] self-start overflow-y-auto py-1 xl:block" data-in-page-navigation="desktop">
        <ul>{links(false)}</ul>
      </nav>

      <nav
        ref={compactNavigationRef}
        aria-label={ariaLabel}
        className="sticky z-20 min-w-0 xl:hidden"
        style={{ top: compactStickyTop }}
        data-in-page-navigation="compact"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          const details = event.currentTarget.querySelector("details");
          if (!details?.open) return;
          event.preventDefault();
          details.open = false;
          setCompactOpen(false);
          compactSummaryRef.current?.focus();
        }}
      >
        <details open={compactOpen} onToggle={(event) => setCompactOpen(event.currentTarget.open)} className="relative">
          <summary
            ref={compactSummaryRef}
            className="grid min-h-[3.75rem] cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-core-border bg-core-raised px-4 py-3 text-core-text shadow-[var(--core-shadow-soft)] outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
            data-in-page-navigation-summary="true"
          >
            <CurrentIcon className="size-[1.125rem] shrink-0 text-core-action" aria-hidden="true" />
            <span className="min-w-0 truncate core-body font-semibold">{currentItem.label}</span>
            <ChevronDown className={`size-[1.125rem] shrink-0 text-core-action transition-transform ${compactOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </summary>
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-[min(26rem,calc(100dvh-10rem))] overflow-y-auto rounded-2xl border border-core-border bg-core-raised p-3 shadow-[var(--core-shadow-raised)]" data-in-page-navigation-panel="true">
            <ul className="grid gap-1 sm:grid-cols-2">{links(true)}</ul>
          </div>
        </details>
      </nav>

      <div className="core-in-page-content grid min-w-0 gap-7">{children}</div>
    </div>
  );
}
