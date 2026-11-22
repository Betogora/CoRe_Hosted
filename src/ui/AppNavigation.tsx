import React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowLeft, BarChart3, BookOpen, CalendarCheck, CalendarClock, CircleHelp, CloudAlert, CloudOff, Home, Layers, Menu, PlusSquare, RefreshCw, Settings } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { createPortal } from "react-dom";
import type { MenuViewId } from "../menuModel.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
import type { SyncStatus } from "../coreTypes.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { IconButton } from "./actionUi.tsx";
import { useSlidingSelection } from "./coreUi.tsx";
import { CoreWordmark } from "./CoreWordmark.tsx";
import { PomodoroProgress } from "./pomodoroTimerUi.tsx";
import { SHELL_REVEAL_EVENT, type ShellBack } from "./shellBack.ts";

interface AppNavigationItem {
  id: MenuViewId;
  label: string;
  iconKey: string;
}

export interface AppNavigationProps {
  navigationItems: AppNavigationItem[];
  activeView: string;
  simulationOffsetMinutes: number;
  simulationDateLabel: string;
  pomodoroTimer: PomodoroTimer | null;
  onNavigate: (viewId: MenuViewId) => unknown;
  onPreloadView?: (viewId: MenuViewId) => unknown;
  onResetSimulation: () => unknown;
  manualSync: boolean;
  onSyncNow: () => unknown;
  onOpenSyncSettings: (target: "sync" | "sync-conflicts") => unknown;
  settingsOpen: boolean;
  onOpenSettings: () => unknown;
  onPreloadSettings?: () => unknown;
  back: ShellBack | null;
  /** Scrolls the content on wide screens; narrower layouts scroll the window. */
  scrollRegionRef?: React.RefObject<HTMLElement | null>;
}

const iconByKey: Record<string, LucideIcon> = {
  exam: CalendarCheck,
  home: Home,
  layers: Layers,
  learn: BookOpen,
  plus: PlusSquare,
};

function getIcon(iconKey: string) {
  return iconByKey[iconKey] ?? Home;
}

interface ResponsiveNavigationProps extends AppNavigationProps {
  hidden: boolean;
  instant: boolean;
  headerRef: React.RefObject<HTMLElement | null>;
}

const SCROLL_STEP = 8;
const HIDE_BELOW = 96;

function clampScroll(value: number, max: number) {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function useHiddenOnScrollDown(page: string, headerRefs: React.RefObject<HTMLElement | null>[], scrollRegionRef?: React.RefObject<HTMLElement | null>) {
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    const region = scrollRegionRef?.current ?? null;
    const root = document.documentElement;
    // Only one of both scrolls per layout. Clamped to the real range, so an overscroll bounce (iOS) is no scroll up.
    const scrollY = () => clampScroll(window.scrollY, root.scrollHeight - window.innerHeight) + (region ? clampScroll(region.scrollTop, region.scrollHeight - region.clientHeight) : 0);
    let lastY = scrollY();
    const onScroll = () => {
      const y = scrollY();
      if (Math.abs(y - lastY) < SCROLL_STEP) return;
      // Keyboard focus in the bar, its open menu and a deck drag (drop zone) keep it in place.
      const keepShown = headerRefs.some((ref) => ref.current?.matches(":has(:focus-visible)")) || Boolean(document.querySelector("[data-navigation-menu], [data-deck-drag-overlay]"));
      setHidden(y > lastY && y > HIDE_BELOW && !keepShown);
      lastY = y;
    };
    // Shift+Tab brings the bar back so backward tabbing reaches it without scrolling up; plain Tab leaves it hidden so it
    // never slides over the next target.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && event.shiftKey) setHidden(false);
    };
    const reveal = () => setHidden(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    region?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(SHELL_REVEAL_EVENT, reveal);
    return () => {
      window.removeEventListener("scroll", onScroll);
      region?.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(SHELL_REVEAL_EVENT, reveal);
      // A new page starts with the head shown.
      setHidden(false);
    };
  }, [page, headerRefs, scrollRegionRef]);
  return hidden;
}

const SHELL_PROPERTIES = ["--shell-height", "--shell-offset", "--shell-scrollbar"];

// Sticky page elements, scroll padding and the toast follow the bar through these properties (see styles.css).
function useShellOffsets(hidden: boolean, headerRefs: React.RefObject<HTMLElement | null>[], scrollRegionRef?: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const root = document.documentElement;
    const region = scrollRegionRef?.current ?? null;
    const update = () => {
      const height = Math.max(0, ...headerRefs.map((ref) => ref.current?.offsetHeight ?? 0));
      root.style.setProperty("--shell-height", `${height}px`);
      root.style.setProperty("--shell-offset", hidden ? "0px" : `${height}px`);
      // The desktop head lies over the content region and leaves its scrollbar uncovered.
      root.style.setProperty("--shell-scrollbar", `${region ? region.offsetWidth - region.clientWidth : 0}px`);
    };
    const observer = new ResizeObserver(update);
    // The region's own box also changes with its head-dependent padding; its content wrapper only follows the scrollbar.
    for (const element of [...headerRefs.map((ref) => ref.current), region?.firstElementChild]) if (element) observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [hidden, headerRefs, scrollRegionRef]);
  React.useEffect(() => () => {
    for (const property of SHELL_PROPERTIES) document.documentElement.style.removeProperty(property);
  }, []);
}

// Until the first input the page is still loading: a lazy subpage registering then switches without the morph.
function useFirstInput() {
  const [hadInput, setHadInput] = React.useState(false);
  React.useEffect(() => {
    if (hadInput) return undefined;
    const done = () => setHadInput(true);
    window.addEventListener("pointerdown", done, true);
    window.addEventListener("keydown", done, true);
    return () => {
      window.removeEventListener("pointerdown", done, true);
      window.removeEventListener("keydown", done, true);
    };
  }, [hadInput]);
  return hadInput;
}

function NavigationBrand({ onNavigate }: Pick<AppNavigationProps, "onNavigate">) {
  return (
    <button
      type="button"
      data-navigation-brand="true"
      onClick={() => onNavigate("uebersicht")}
      className="flex items-center gap-1 min-[360px]:gap-3 rounded-inset text-left outline-none"
    >
      <img src="/core-brain.svg" alt="" className="size-9 shrink-0 xl:size-10" draggable={false} />
      <CoreWordmark />
    </button>
  );
}

// Brand and back group stay mounted on top of each other so they can cross-fade.
function ShellLead({ back, brandClassName, onNavigate }: { back: ShellBack | null; brandClassName: string } & Pick<AppNavigationProps, "onNavigate">) {
  // On the way back the left subpage's title fades out with its group instead of vanishing at once.
  const [lastBack, setLastBack] = React.useState(back);
  if (back && back !== lastBack) setLastBack(back);
  const shownBack = back ?? lastBack;
  const backLabel = shownBack ? `Zurück zu ${shownBack.label}` : undefined;
  const brandRef = React.useRef<HTMLDivElement>(null);
  const backRef = React.useRef<HTMLDivElement>(null);
  const hasLeftSubpage = !back && Boolean(lastBack);
  React.useEffect(() => {
    // The back group turns inert under the focus (the browser drops it only at the next frame); the brand takes its place.
    const focused = document.activeElement;
    if (hasLeftSubpage && (focused === document.body || backRef.current?.contains(focused))) brandRef.current?.querySelector("button")?.focus();
  }, [hasLeftSubpage, lastBack]);
  return (
    <h1 className="core-shell-lead min-w-0">
      <div ref={brandRef} className={`core-shell-brand ${brandClassName} justify-self-start text-core-text`} inert={Boolean(back)}>
        <NavigationBrand onNavigate={onNavigate} />
      </div>
      <div ref={backRef} className="core-shell-back flex min-w-0" inert={!back}>
        <button
          type="button"
          data-navigation-back="true"
          aria-label={backLabel}
          title={backLabel}
          onClick={() => back?.onSelect()}
          className="-ml-2 flex h-button min-w-0 items-center gap-1.5 rounded-control pl-1.5 pr-3 text-core-text transition-colors hover:bg-core-hover [&>svg]:text-core-muted hover:[&>svg]:text-core-action"
        >
          <ArrowLeft className="shrink-0" size={20} aria-hidden="true" />
          {shownBack?.icon ? <span className="flex shrink-0" aria-hidden="true">{shownBack.icon}</span> : null}
          <span className="min-w-0 truncate core-heading-3">{shownBack?.title}</span>
        </button>
      </div>
    </h1>
  );
}

type SyncUtilityProps = { syncStatus: SyncStatus } & Pick<AppNavigationProps, "manualSync" | "onSyncNow" | "onOpenSyncSettings" | "onPreloadSettings">;

function SyncUtilityButton({ syncStatus, manualSync, onSyncNow, onOpenSyncSettings, onPreloadSettings }: SyncUtilityProps) {
  const preloadSettings = () => onPreloadSettings?.();
  const problem = syncStatus.status === "conflict" ? {
    icon: AlertTriangle,
    label: syncStatus.conflictCount === 1 ? "1 Synchronisierungskonflikt klären" : `${syncStatus.conflictCount} Synchronisierungskonflikte klären`,
    target: "sync-conflicts" as const,
  } : syncStatus.status === "offline" ? {
    icon: CloudOff,
    label: "Offline – Synchronisierung ansehen",
    target: "sync" as const,
  } : syncStatus.status === "error" ? {
    icon: CloudAlert,
    label: "Synchronisierung fehlgeschlagen – Details ansehen",
    target: "sync" as const,
  } : null;

  if (problem) {
    return (
      <span className="relative inline-flex">
        <IconButton
          type="button"
          variant="ghost"
          data-navigation-utility="sync"
          label={problem.label}
          icon={problem.icon}
          onClick={() => onOpenSyncSettings(problem.target)}
          onPointerEnter={preloadSettings}
          onFocus={preloadSettings}
          onTouchStart={preloadSettings}
          className="size-button shrink-0 rounded-control"
        />
        {syncStatus.status === "conflict" ? <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-round bg-core-warning px-1 core-caption font-bold text-core-text" aria-hidden="true">{syncStatus.conflictCount}</span> : null}
        {syncStatus.status === "error" ? <span className="absolute right-1.5 top-1.5 size-2 rounded-round bg-core-danger" aria-hidden="true" /> : null}
      </span>
    );
  }
  if (!manualSync) return null;

  const pending = syncStatus.status === "pending";
  return (
    <span className="relative inline-flex">
      <IconButton
        type="button"
        variant="ghost"
        data-navigation-utility="sync"
        label={syncStatus.status === "saving" ? "Synchronisiert gerade" : pending ? "Ausstehende Änderungen synchronisieren" : "Jetzt synchronisieren"}
        icon={RefreshCw}
        onClick={onSyncNow}
        disabled={syncStatus.status === "saving"}
        className={`size-button shrink-0 rounded-control ${syncStatus.status === "saving" ? "[&_svg]:animate-spin" : ""}`}
      />
      {pending ? <span className="absolute right-1.5 top-1.5 size-2 rounded-round bg-core-action" aria-hidden="true" /> : null}
    </span>
  );
}

type UtilityProps = Pick<AppNavigationProps, "activeView" | "onNavigate" | "onPreloadView" | "manualSync" | "onSyncNow" | "onOpenSyncSettings" | "settingsOpen" | "onOpenSettings" | "onPreloadSettings">;

function NavigationUtilityButtons({ activeView, onNavigate, onPreloadView, settingsOpen, onOpenSettings, ...syncProps }: UtilityProps) {
  const syncStatus = useWorkspaceValue((snapshot) => snapshot.syncStatus);
  const menuTargetActive = settingsOpen || activeView === "statistik" || activeView === "hilfe";
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const navigatedFromMenu = React.useRef(false);
  const pageRow = (viewId: "statistik" | "hilfe", utility: string, label: string, Icon: LucideIcon) => {
    const preload = () => onPreloadView?.(viewId);
    return (
      <Popover.Close asChild>
        <button type="button" className="core-menu-row" data-navigation-utility={utility} aria-current={activeView === viewId ? "page" : undefined} onClick={() => {
            // A blocked navigation (unsaved draft) opens a dialog that returns focus to the menu button; a real page change
            // gives the new heading the focus (App), so the popover must not pull it back to the button.
            menuButtonRef.current?.focus();
            navigatedFromMenu.current = activeView !== viewId;
            onNavigate(viewId);
          }} onPointerEnter={preload} onFocus={preload}>
          <Icon size={16} aria-hidden="true" />{label}
        </button>
      </Popover.Close>
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-0 min-[360px]:gap-1.5" data-navigation-utilities="true" data-sync-status={syncStatus.status}>
      <SyncUtilityButton syncStatus={syncStatus} {...syncProps} />
      <Popover.Root>
        <Popover.Trigger asChild>
          <IconButton
            ref={menuButtonRef}
            type="button"
            variant="ghost"
            data-app-navigation="true"
            data-navigation-utility="menu"
            label="Menü"
            icon={Menu}
            onPointerEnter={syncProps.onPreloadSettings}
            onFocus={syncProps.onPreloadSettings}
            onTouchStart={syncProps.onPreloadSettings}
            className={`size-button shrink-0 rounded-control ${menuTargetActive ? "!bg-core-subtle !text-core-action" : ""}`}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            collisionPadding={16}
            className="core-overlay z-[60] grid w-56 gap-0.5 rounded-panel p-1.5"
            data-navigation-menu="true"
            onCloseAutoFocus={(event) => { if (navigatedFromMenu.current) event.preventDefault(); navigatedFromMenu.current = false; }}
          >
            <Popover.Close asChild>
              <button type="button" className="core-menu-row" data-navigation-utility="settings" onClick={() => {
                // The dialog remembers the focused element as return target when it mounts, before the popover refocuses its trigger.
                menuButtonRef.current?.focus();
                onOpenSettings();
              }}>
                <Settings size={16} aria-hidden="true" />Einstellungen
              </button>
            </Popover.Close>
            {pageRow("statistik", "statistics", "Statistik", BarChart3)}
            {pageRow("hilfe", "help", "Hilfe", CircleHelp)}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function SimulationStatus({ simulationDateLabel, simulationOffsetMinutes, onResetSimulation }: Pick<AppNavigationProps, "simulationDateLabel" | "simulationOffsetMinutes" | "onResetSimulation">) {
  return (
    <div className="flex min-h-control items-center gap-3 rounded-control border border-core-warning bg-core-warning-soft px-3 text-core-text" role="status">
      <CalendarClock className="shrink-0" size={17} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate core-caption font-semibold">Simulation · {simulationDateLabel} · +{formatSimulationDuration(simulationOffsetMinutes)}</span>
      <button type="button" data-reset-simulation="true" className="min-h-control shrink-0 px-2 core-body font-semibold text-core-action" onClick={onResetSimulation}>Heute</button>
    </div>
  );
}

function DesktopTopBar({ back, hidden, instant, headerRef, navigationItems, activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, manualSync, onSyncNow, onOpenSyncSettings, settingsOpen, onOpenSettings, onPreloadSettings }: ResponsiveNavigationProps) {
  return (
    // Placed over the scrolling content region (App), so hiding it frees the space instead of leaving an empty row.
    <header ref={headerRef} className="core-shell-header hidden min-w-0 xl:relative xl:z-30 xl:col-start-1 xl:row-start-1 xl:mr-[var(--shell-scrollbar,0px)] xl:block" data-navigation-layout="top-bar" data-shell-mode={back ? "app" : "hub"} data-shell-hidden={hidden || undefined} data-shell-instant={instant || undefined}>
      <div className="core-shell-frame">
        <div className="core-shell-bar mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-6" data-shell-bar="true">
          <ShellLead back={back} brandClassName="core-brand" onNavigate={onNavigate} />

          <nav aria-label="Hauptmenü" data-app-navigation="true" className="flex items-center gap-1">
            {navigationItems.map((view) => {
              const NavIcon = getIcon(view.iconKey);
              const isActive = view.id === activeView;

              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => onNavigate(view.id)}
                  onPointerEnter={() => onPreloadView?.(view.id)}
                  onFocus={() => onPreloadView?.(view.id)}
                  onTouchStart={() => onPreloadView?.(view.id)}
                  className={`core-body flex h-11 items-center gap-2 whitespace-nowrap rounded-control px-4 font-semibold transition-colors ${
                    isActive ? "bg-core-subtle text-core-action" : "text-core-text hover:bg-core-subtle hover:text-core-action"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <NavIcon className="shrink-0" size={16} aria-hidden="true" />
                  <span>{view.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center justify-end gap-3">
            <PomodoroProgress timer={pomodoroTimer} variant="header" />
            <NavigationUtilityButtons activeView={activeView} onNavigate={onNavigate} onPreloadView={onPreloadView} manualSync={manualSync} onSyncNow={onSyncNow} onOpenSyncSettings={onOpenSyncSettings} settingsOpen={settingsOpen} onOpenSettings={onOpenSettings} onPreloadSettings={onPreloadSettings} />
          </div>
        </div>
      </div>
      {simulationOffsetMinutes > 0 ? <div className="core-shell-status px-4"><SimulationStatus simulationDateLabel={simulationDateLabel} simulationOffsetMinutes={simulationOffsetMinutes} onResetSimulation={onResetSimulation} /></div> : null}
    </header>
  );
}

function MobileHeader({ back, hidden, instant, headerRef, activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, manualSync, onSyncNow, onOpenSyncSettings, settingsOpen, onOpenSettings, onPreloadSettings }: ResponsiveNavigationProps) {
  return (
    <header ref={headerRef} className="core-mobile-header core-shell-header sticky top-0 z-30 min-w-0 xl:hidden" data-navigation-layout="mobile-header" data-shell-mode={back ? "app" : "hub"} data-shell-hidden={hidden || undefined} data-shell-instant={instant || undefined}>
      <div className="core-shell-frame">
        <div className="core-shell-bar flex min-w-0 items-center justify-between gap-3 px-3" data-shell-bar="true">
          <ShellLead back={back} brandClassName="core-mobile-brand core-brand" onNavigate={onNavigate} />
          <PomodoroProgress timer={pomodoroTimer} variant="header" />
          <NavigationUtilityButtons activeView={activeView} onNavigate={onNavigate} onPreloadView={onPreloadView} manualSync={manualSync} onSyncNow={onSyncNow} onOpenSyncSettings={onOpenSyncSettings} settingsOpen={settingsOpen} onOpenSettings={onOpenSettings} onPreloadSettings={onPreloadSettings} />
        </div>
      </div>
      {simulationOffsetMinutes > 0 ? <div className="core-shell-status px-2"><SimulationStatus simulationDateLabel={simulationDateLabel} simulationOffsetMinutes={simulationOffsetMinutes} onResetSimulation={onResetSimulation} /></div> : null}
    </header>
  );
}

function MobileBottomNavigation({ navigationItems, activeView, onNavigate, onPreloadView }: AppNavigationProps) {
  const { containerRef, indicator } = useSlidingSelection<HTMLElement>(activeView, navigationItems);
  return (
    <nav
      ref={containerRef}
      aria-label="Mobile Hauptnavigation"
      data-app-navigation="true"
      data-navigation-layout="bottom-bar"
      data-sliding={indicator ? "true" : undefined}
      className="core-mobile-bottom-navigation fixed left-[50dvw] z-40 grid w-[calc(100dvw-2rem)] max-w-[34rem] -translate-x-1/2 grid-cols-5 gap-1 rounded-panel border border-core-border bg-[var(--core-selection-track)] p-[3px] shadow-raised sm:w-[calc(100dvw-6rem)] xl:hidden"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {indicator ? <span aria-hidden="true" className="core-segmented-control-indicator" style={{ transform: `translate(${indicator.x}px, ${indicator.y}px)`, width: indicator.width, height: indicator.height }} /> : null}
      {navigationItems.map((view) => {
        const NavIcon = getIcon(view.iconKey);
        const isActive = view.id === activeView;

        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onNavigate(view.id)}
            onPointerEnter={() => onPreloadView?.(view.id)}
            onFocus={() => onPreloadView?.(view.id)}
            onTouchStart={() => onPreloadView?.(view.id)}
            className={`relative z-[1] flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5 transition-colors ${isActive ? "bg-core-surface text-core-action shadow-indicator" : "text-core-muted hover:text-core-text"}`}
            aria-current={isActive ? "page" : undefined}
          >
            <NavIcon size={18} aria-hidden="true" />
            <span className="w-full truncate text-center core-caption font-semibold leading-4">{view.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppNavigation(props: AppNavigationProps) {
  const navigationActiveView = props.activeView === "simulator" ? "lernen" : props.activeView;
  const mobileBottomNavigation = <MobileBottomNavigation {...props} activeView={navigationActiveView} />;
  const desktopRef = React.useRef<HTMLElement>(null);
  const mobileRef = React.useRef<HTMLElement>(null);
  const headerRefs = React.useMemo(() => [desktopRef, mobileRef], []);
  const hidden = useHiddenOnScrollDown(`${props.activeView}:${props.back?.title ?? ""}`, headerRefs, props.scrollRegionRef);
  useShellOffsets(hidden, headerRefs, props.scrollRegionRef);
  const instant = !useFirstInput();
  const responsiveProps = { ...props, activeView: navigationActiveView, hidden, instant };

  return (
    <>
      <DesktopTopBar {...responsiveProps} headerRef={desktopRef} />
      <MobileHeader {...responsiveProps} headerRef={mobileRef} />
      {typeof document === "undefined" ? mobileBottomNavigation : createPortal(mobileBottomNavigation, document.body)}
    </>
  );
}
