import React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowLeft, BarChart3, BookOpen, CalendarCheck, CalendarClock, CircleHelp, CloudAlert, CloudOff, Home, Layers, Moon, PlusSquare, RefreshCw, Settings, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import { readCoreTheme, toggleCoreTheme, type CoreTheme } from "../coreTheme.ts";
import type { MenuViewId } from "../menuModel.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
import type { SyncStatus } from "../coreTypes.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { IconButton } from "./actionUi.tsx";
import { useSlidingSelection } from "./coreUi.tsx";
import { CoreWordmark } from "./CoreWordmark.tsx";
import { PomodoroProgress } from "./pomodoroTimerUi.tsx";
import type { ShellBack } from "./shellBack.ts";

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
  theme: CoreTheme;
  onToggleTheme: () => void;
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

type UtilityProps = Pick<ResponsiveNavigationProps, "activeView" | "theme" | "onNavigate" | "onPreloadView" | "onToggleTheme" | "manualSync" | "onSyncNow" | "onOpenSyncSettings" | "settingsOpen" | "onOpenSettings" | "onPreloadSettings">;

function NavigationUtilityButtons({ activeView, theme, onNavigate, onPreloadView, onToggleTheme, settingsOpen, onOpenSettings, ...syncProps }: UtilityProps) {
  const syncStatus = useWorkspaceValue((snapshot) => snapshot.syncStatus);
  const darkModeActive = theme === "dark";
  const ThemeIcon = darkModeActive ? Moon : Sun;
  const pageButton = (viewId: "statistik" | "hilfe", utility: string, label: string, icon: LucideIcon) => {
    const active = activeView === viewId;
    const preload = () => onPreloadView?.(viewId);
    return (
      <IconButton
        type="button"
        variant="ghost"
        data-app-navigation="true"
        data-navigation-utility={utility}
        label={label}
        icon={icon}
        onClick={() => onNavigate(viewId)}
        onPointerEnter={preload}
        onFocus={preload}
        onTouchStart={preload}
        className={`size-button shrink-0 rounded-control ${active ? "!bg-core-subtle !text-core-action" : ""}`}
        aria-current={active ? "page" : undefined}
      />
    );
  };
  const themeButton = (
    <IconButton
      type="button"
      variant="ghost"
      data-navigation-utility="theme"
      label={darkModeActive ? "Light Mode einschalten" : "Dark Mode einschalten"}
      icon={ThemeIcon}
      onClick={onToggleTheme}
      className="size-button shrink-0 rounded-control"
    />
  );

  return (
    <div className="flex shrink-0 items-center gap-0 min-[360px]:gap-1.5" data-navigation-utilities="true" data-sync-status={syncStatus.status}>
      <SyncUtilityButton syncStatus={syncStatus} {...syncProps} />
      {pageButton("statistik", "statistics", "Statistik öffnen", BarChart3)}
      {themeButton}
      {pageButton("hilfe", "help", "Hilfe öffnen", CircleHelp)}
      <IconButton
        type="button"
        variant="ghost"
        data-app-navigation="true"
        data-navigation-utility="settings"
        label="Einstellungen öffnen"
        icon={Settings}
        onClick={onOpenSettings}
        onPointerEnter={syncProps.onPreloadSettings}
        onFocus={syncProps.onPreloadSettings}
        onTouchStart={syncProps.onPreloadSettings}
        className={`size-button shrink-0 rounded-control ${settingsOpen ? "!bg-core-subtle !text-core-action" : ""}`}
        aria-expanded={settingsOpen}
      />
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

function DesktopTopBar({ back, navigationItems, activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, theme, onToggleTheme, manualSync, onSyncNow, onOpenSyncSettings, settingsOpen, onOpenSettings, onPreloadSettings }: ResponsiveNavigationProps) {
  return (
    <header className="core-shell-header hidden min-w-0 xl:block" data-navigation-layout="top-bar" data-shell-mode={back ? "app" : "hub"}>
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
            <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onPreloadView={onPreloadView} onToggleTheme={onToggleTheme} manualSync={manualSync} onSyncNow={onSyncNow} onOpenSyncSettings={onOpenSyncSettings} settingsOpen={settingsOpen} onOpenSettings={onOpenSettings} onPreloadSettings={onPreloadSettings} />
          </div>
        </div>
      </div>
      {simulationOffsetMinutes > 0 ? <div className="core-shell-status px-4"><SimulationStatus simulationDateLabel={simulationDateLabel} simulationOffsetMinutes={simulationOffsetMinutes} onResetSimulation={onResetSimulation} /></div> : null}
    </header>
  );
}

function MobileHeader({ back, activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, theme, onToggleTheme, manualSync, onSyncNow, onOpenSyncSettings, settingsOpen, onOpenSettings, onPreloadSettings }: ResponsiveNavigationProps) {
  return (
    <header className="core-mobile-header core-shell-header sticky top-0 z-30 min-w-0 xl:hidden" data-navigation-layout="mobile-header" data-shell-mode={back ? "app" : "hub"}>
      <div className="core-shell-frame">
        <div className="core-shell-bar flex min-w-0 items-center justify-between gap-3 px-3" data-shell-bar="true">
          <ShellLead back={back} brandClassName="core-mobile-brand core-brand" onNavigate={onNavigate} />
          <PomodoroProgress timer={pomodoroTimer} variant="header" />
          <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onPreloadView={onPreloadView} onToggleTheme={onToggleTheme} manualSync={manualSync} onSyncNow={onSyncNow} onOpenSyncSettings={onOpenSyncSettings} settingsOpen={settingsOpen} onOpenSettings={onOpenSettings} onPreloadSettings={onPreloadSettings} />
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
  const [theme, setTheme] = React.useState(readCoreTheme);
  const navigationActiveView = props.activeView === "simulator" ? "lernen" : props.activeView;
  const mobileBottomNavigation = <MobileBottomNavigation {...props} activeView={navigationActiveView} />;
  const responsiveProps = {
    ...props,
    activeView: navigationActiveView,
    theme,
    onToggleTheme: () => setTheme(toggleCoreTheme),
  };

  return (
    <>
      <DesktopTopBar {...responsiveProps} />
      <MobileHeader {...responsiveProps} />
      {typeof document === "undefined" ? mobileBottomNavigation : createPortal(mobileBottomNavigation, document.body)}
    </>
  );
}
