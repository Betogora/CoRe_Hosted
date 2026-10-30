import React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BarChart3, BookOpen, CalendarCheck, CalendarClock, CircleHelp, CloudAlert, CloudOff, Home, Layers, Moon, PlusSquare, RefreshCw, Settings, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import { readCoreTheme, toggleCoreTheme, type CoreTheme } from "../coreTheme.ts";
import type { MenuViewId } from "../menuModel.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
import type { SyncStatus } from "../coreTypes.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { IconButton } from "./actionUi.tsx";
import { useSlidingSelection } from "./coreUi.tsx";
import { CoreWordmark } from "./CoreWordmark.tsx";
import { PomodoroProgress } from "./pomodoroTimerUi.tsx";

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
  syncStatus: SyncStatus;
  /** Without automatic sync the header keeps a direct sync action. */
  manualSync: boolean;
  onSyncNow: () => unknown;
  onOpenSyncSettings: (target: "sync" | "sync-conflicts") => unknown;
}

const iconByKey: Record<string, LucideIcon> = {
  chart: BarChart3,
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
      className="flex items-center gap-3.5 rounded-inset text-left outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-2"
    >
      <img src="/core-socrates.svg" alt="" className="h-10 w-auto shrink-0 xl:h-12" draggable={false} />
      <CoreWordmark />
    </button>
  );
}

type SyncUtilityProps = Pick<AppNavigationProps, "syncStatus" | "manualSync" | "onSyncNow" | "onOpenSyncSettings" | "onPreloadView">;

function SyncUtilityButton({ syncStatus, manualSync, onSyncNow, onOpenSyncSettings, onPreloadView }: SyncUtilityProps) {
  const preloadSettings = () => onPreloadView?.("einstellungen");
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
          className="size-control shrink-0 rounded-control"
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
        className={`size-control shrink-0 rounded-control ${syncStatus.status === "saving" ? "[&_svg]:animate-spin" : ""}`}
      />
      {pending ? <span className="absolute right-1.5 top-1.5 size-2 rounded-round bg-core-action" aria-hidden="true" /> : null}
    </span>
  );
}

function NavigationUtilityButtons({ activeView, theme, onNavigate, onPreloadView, onToggleTheme, ...syncProps }: Pick<ResponsiveNavigationProps, "activeView" | "theme" | "onNavigate" | "onPreloadView" | "onToggleTheme" | "syncStatus" | "manualSync" | "onSyncNow" | "onOpenSyncSettings">) {
  const settingsActive = activeView === "einstellungen";
  const helpActive = activeView === "hilfe";
  const darkModeActive = theme === "dark";
  const ThemeIcon = darkModeActive ? Moon : Sun;
  const settingsButton = (
    <IconButton
      type="button"
      variant="ghost"
      data-app-navigation="true"
      data-navigation-utility="settings"
      label="Einstellungen öffnen"
      icon={Settings}
      onClick={() => onNavigate("einstellungen")}
      onPointerEnter={() => onPreloadView?.("einstellungen")}
      onFocus={() => onPreloadView?.("einstellungen")}
      onTouchStart={() => onPreloadView?.("einstellungen")}
      className={`size-control shrink-0 rounded-control ${settingsActive ? "!bg-[var(--core-action-soft)] !text-core-action" : ""}`}
      aria-current={settingsActive ? "page" : undefined}
    />
  );
  const themeButton = (
    <IconButton
      type="button"
      variant="ghost"
      data-navigation-utility="theme"
      label={darkModeActive ? "Light Mode einschalten" : "Dark Mode einschalten"}
      icon={ThemeIcon}
      onClick={onToggleTheme}
      className="size-control shrink-0 rounded-control"
    />
  );
  const helpButton = (
    <IconButton
      type="button"
      variant="ghost"
      data-app-navigation="true"
      data-navigation-utility="help"
      label="Hilfe öffnen"
      icon={CircleHelp}
      onClick={() => onNavigate("hilfe")}
      onPointerEnter={() => onPreloadView?.("hilfe")}
      onFocus={() => onPreloadView?.("hilfe")}
      onTouchStart={() => onPreloadView?.("hilfe")}
      className={`size-control shrink-0 rounded-control ${helpActive ? "!bg-[var(--core-action-soft)] !text-core-action" : ""}`}
      aria-current={helpActive ? "page" : undefined}
    />
  );

  return (
    <div className="flex shrink-0 items-center gap-1.5" data-navigation-utilities="true" data-sync-status={syncProps.syncStatus.status}>
      <SyncUtilityButton {...syncProps} onPreloadView={onPreloadView} />
      {themeButton}
      {helpButton}
      {settingsButton}
    </div>
  );
}

function SimulationStatus({ simulationDateLabel, simulationOffsetMinutes, onResetSimulation }: Pick<AppNavigationProps, "simulationDateLabel" | "simulationOffsetMinutes" | "onResetSimulation">) {
  return (
    <div className="mt-2 flex min-h-control items-center gap-3 rounded-control border border-core-warning bg-core-warning-soft px-3 text-core-text" role="status">
      <CalendarClock className="shrink-0" size={17} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate core-caption font-semibold">Simulation · {simulationDateLabel} · +{formatSimulationDuration(simulationOffsetMinutes)}</span>
      <button type="button" data-reset-simulation="true" className="min-h-control shrink-0 px-2 core-body font-semibold text-core-action" onClick={onResetSimulation}>Heute</button>
    </div>
  );
}

function DesktopTopBar({ navigationItems, activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, theme, onToggleTheme, syncStatus, manualSync, onSyncNow, onOpenSyncSettings }: ResponsiveNavigationProps) {
  return (
    <header className="hidden min-w-0 px-2 pt-2 xl:block" data-navigation-layout="top-bar">
      <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-panel border border-core-border bg-core-surface px-5 shadow-floating">
        <h1 className="core-heading-3 leading-none">
          <NavigationBrand onNavigate={onNavigate} />
        </h1>

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
                className={`core-body flex min-h-control items-center gap-2 whitespace-nowrap rounded-control px-3 !font-semibold transition-colors ${
                  isActive ? "bg-[var(--core-action-soft)] text-core-action" : "text-core-secondary hover:bg-core-subtle hover:text-core-action"
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
          <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onPreloadView={onPreloadView} onToggleTheme={onToggleTheme} syncStatus={syncStatus} manualSync={manualSync} onSyncNow={onSyncNow} onOpenSyncSettings={onOpenSyncSettings} />
        </div>
      </div>
      {simulationOffsetMinutes > 0 ? <SimulationStatus simulationDateLabel={simulationDateLabel} simulationOffsetMinutes={simulationOffsetMinutes} onResetSimulation={onResetSimulation} /> : null}
    </header>
  );
}

function MobileHeader({ activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, theme, onToggleTheme, syncStatus, manualSync, onSyncNow, onOpenSyncSettings }: ResponsiveNavigationProps) {
  return (
    <header className="core-mobile-header sticky top-0 z-30 min-w-0 px-2 py-2 xl:hidden" data-navigation-layout="mobile-header">
      <div className="flex h-14 min-w-0 items-center justify-between gap-3 rounded-panel border border-core-border bg-core-surface px-3 shadow-floating">
        <h1 className="core-mobile-brand shrink-0 core-heading-3 leading-none">
          <NavigationBrand onNavigate={onNavigate} />
        </h1>
        <PomodoroProgress timer={pomodoroTimer} variant="header" />
        <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onPreloadView={onPreloadView} onToggleTheme={onToggleTheme} syncStatus={syncStatus} manualSync={manualSync} onSyncNow={onSyncNow} onOpenSyncSettings={onOpenSyncSettings} />
      </div>
      {simulationOffsetMinutes > 0 ? <SimulationStatus simulationDateLabel={simulationDateLabel} simulationOffsetMinutes={simulationOffsetMinutes} onResetSimulation={onResetSimulation} /> : null}
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
  const navigationActiveView = ["kartenstapel", "karten-einstellungen", "simulator"].includes(props.activeView) ? "lernen" : props.activeView;
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
