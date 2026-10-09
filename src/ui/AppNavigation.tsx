import React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BarChart3, BookOpen, CalendarClock, CircleHelp, Cloud, CloudOff, Home, Layers, Moon, PlusSquare, RefreshCw, Settings, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import { readCoreTheme, toggleCoreTheme, type CoreTheme } from "../coreTheme.ts";
import type { MenuViewId } from "../menuModel.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
import type { SyncStatus } from "../coreTypes.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { ActionButton, IconButton } from "./actionUi.tsx";
import { useSlidingSelection } from "./coreUi.tsx";
import { PomodoroProgress } from "./pomodoroTimerUi.tsx";

export interface AppNavigationItem {
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
  onSyncNow: () => unknown;
}

const iconByKey: Record<string, LucideIcon> = {
  chart: BarChart3,
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
      className="rounded-inset text-left outline-none focus-visible:ring-2 focus-visible:ring-core-focus focus-visible:ring-offset-2"
    >
      Co<span className="text-core-action">Re</span>
    </button>
  );
}

function NavigationUtilityButtons({ activeView, theme, onNavigate, onPreloadView, onToggleTheme, syncStatus, onSyncNow, layout }: Pick<ResponsiveNavigationProps, "activeView" | "theme" | "onNavigate" | "onPreloadView" | "onToggleTheme" | "syncStatus" | "onSyncNow"> & { layout: "sidebar" | "header" }) {
  const settingsActive = activeView === "einstellungen";
  const helpActive = activeView === "hilfe";
  const sidebarLayout = layout === "sidebar";
  const darkModeActive = theme === "dark";
  const ThemeIcon = darkModeActive ? Moon : Sun;
  const SyncIcon = syncStatus.status === "offline" ? CloudOff : syncStatus.status === "conflict" ? AlertTriangle : syncStatus.status === "saved" ? Cloud : RefreshCw;
  const syncLabel = syncStatus.status === "conflict"
    ? syncStatus.conflictCount === 1
      ? "1 Synchronisierungskonflikt klären"
      : `${syncStatus.conflictCount} Synchronisierungskonflikte klären`
    : syncStatus.status === "offline"
      ? "Offline – Synchronisierung versuchen"
      : syncStatus.status === "saving"
        ? "Synchronisiert gerade"
        : syncStatus.status === "pending"
          ? "Ausstehende Änderungen synchronisieren"
          : syncStatus.status === "saved"
            ? "Synchronisiert – jetzt erneut synchronisieren"
            : syncStatus.status === "error"
              ? "Synchronisierung erneut versuchen"
              : "Jetzt synchronisieren";
  const syncButton = (
    <span className="relative inline-flex">
      <IconButton
        type="button"
        variant="ghost"
        data-navigation-utility="sync"
        label={syncLabel}
        icon={SyncIcon}
        onClick={onSyncNow}
        disabled={syncStatus.status === "saving"}
        className={`size-control shrink-0 rounded-control ${syncStatus.status === "saving" ? "[&_svg]:animate-spin" : ""}`}
      />
      {syncStatus.status === "conflict" ? <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-round bg-core-warning px-1 core-caption font-bold text-core-text" aria-hidden="true">{syncStatus.conflictCount}</span> : null}
    </span>
  );
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
    <div
      className={sidebarLayout ? "flex w-full items-center justify-between gap-1 border-t border-core-border pt-3" : "flex shrink-0 items-center gap-1.5"}
      data-navigation-utilities="true"
      data-navigation-utility-layout={layout}
    >
      {syncButton}
      {sidebarLayout ? (
        <>
          {helpButton}
          {settingsButton}
          {themeButton}
        </>
      ) : (
        <>
          {themeButton}
          {helpButton}
          {settingsButton}
        </>
      )}
    </div>
  );
}

function DesktopNavigation({ navigationItems, activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, theme, onToggleTheme, syncStatus, onSyncNow }: ResponsiveNavigationProps) {
  return (
    <aside className="hidden p-2 pr-0 xl:block xl:overflow-x-hidden xl:overflow-y-auto" data-navigation-layout="sidebar">
      <div className="flex h-full flex-col rounded-panel border border-core-border bg-core-surface px-3 pb-3 pt-5 shadow-floating">
        <h1 className="px-2.5 core-heading-2 font-bold leading-none text-core-text">
          <NavigationBrand onNavigate={onNavigate} />
        </h1>

        <nav aria-label="Hauptmenü" data-app-navigation="true" className="mt-6 grid grid-cols-1 gap-1">
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
                className={`core-body flex min-h-10 w-full items-center gap-2.5 rounded-control px-2.5 text-left !font-semibold transition-colors ${
                  isActive ? "bg-[var(--core-action-soft)] text-core-action" : "text-core-secondary hover:bg-core-subtle hover:text-core-action"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <NavIcon className="shrink-0" size={16} aria-hidden="true" />
                <span className="min-w-0 truncate">{view.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          {simulationOffsetMinutes > 0 ? (
            <div className="mb-3 rounded-control border border-core-warning bg-core-warning-soft p-3 text-core-text" role="status">
              <p className="flex items-center gap-2 core-body font-semibold">
                <CalendarClock size={17} aria-hidden="true" />
                Simulation aktiv
              </p>
              <p className="mt-1 core-caption">{simulationDateLabel} · +{formatSimulationDuration(simulationOffsetMinutes)}</p>
              <ActionButton type="button" variant="secondary" className="mt-3 w-full justify-center" data-reset-simulation="true" onClick={onResetSimulation}>
                Heute
              </ActionButton>
            </div>
          ) : null}
          <PomodoroProgress timer={pomodoroTimer} variant="sidebar" />
          <div className={`pt-6 ${simulationOffsetMinutes > 0 || pomodoroTimer ? "mt-3" : ""}`}>
            <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onPreloadView={onPreloadView} onToggleTheme={onToggleTheme} syncStatus={syncStatus} onSyncNow={onSyncNow} layout="sidebar" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onPreloadView, onResetSimulation, theme, onToggleTheme, syncStatus, onSyncNow }: ResponsiveNavigationProps) {
  return (
    <header className="core-mobile-header sticky top-0 z-30 min-w-0 px-2 py-2 xl:hidden" data-navigation-layout="mobile-header">
      <div className="flex h-14 min-w-0 items-center justify-between gap-3 rounded-panel border border-core-border bg-core-surface px-3 shadow-floating">
        <h1 className="core-mobile-brand shrink-0 core-heading-3 font-bold leading-none text-core-text">
          <NavigationBrand onNavigate={onNavigate} />
        </h1>
        <PomodoroProgress timer={pomodoroTimer} variant="header" />
        <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onPreloadView={onPreloadView} onToggleTheme={onToggleTheme} syncStatus={syncStatus} onSyncNow={onSyncNow} layout="header" />
      </div>
      {simulationOffsetMinutes > 0 ? (
        <div className="mt-2 flex min-h-control items-center gap-3 rounded-control border border-core-warning bg-core-warning-soft px-3 text-core-text" role="status">
          <CalendarClock className="shrink-0" size={17} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate core-caption font-semibold">Simulation · {simulationDateLabel} · +{formatSimulationDuration(simulationOffsetMinutes)}</span>
          <button type="button" data-reset-simulation="true" className="min-h-control shrink-0 px-2 core-body font-semibold text-core-action" onClick={onResetSimulation}>Heute</button>
        </div>
      ) : null}
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
      className="core-mobile-bottom-navigation fixed left-[50dvw] z-40 grid w-[calc(100dvw-2rem)] max-w-[34rem] -translate-x-1/2 grid-cols-4 gap-1 rounded-panel border border-core-border bg-[var(--core-selection-track)] p-[3px] shadow-raised sm:w-[calc(100dvw-6rem)] xl:hidden"
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
      <DesktopNavigation {...responsiveProps} />
      <MobileHeader {...responsiveProps} />
      {typeof document === "undefined" ? mobileBottomNavigation : createPortal(mobileBottomNavigation, document.body)}
    </>
  );
}
