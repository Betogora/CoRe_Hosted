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

const settingsViews = new Set(["einstellungen", "simulator"]);

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
      className="rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2"
    >
      CoRe
    </button>
  );
}

function NavigationUtilityButtons({ activeView, theme, onNavigate, onPreloadView, onToggleTheme, syncStatus, onSyncNow, layout }: Pick<ResponsiveNavigationProps, "activeView" | "theme" | "onNavigate" | "onPreloadView" | "onToggleTheme" | "syncStatus" | "onSyncNow"> & { layout: "sidebar" | "header" }) {
  const settingsActive = settingsViews.has(activeView);
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
        data-navigation-utility="sync"
        label={syncLabel}
        icon={SyncIcon}
        onClick={onSyncNow}
        disabled={syncStatus.status === "saving"}
        className={`size-11 shrink-0 rounded-full ${syncStatus.status === "saving" ? "[&_svg]:animate-spin" : ""}`}
      />
      {syncStatus.status === "conflict" ? <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-core-warning px-1 text-[0.65rem] font-bold text-core-text" aria-hidden="true">{syncStatus.conflictCount}</span> : null}
    </span>
  );
  const settingsButton = (
    <IconButton
      type="button"
      data-app-navigation="true"
      data-navigation-utility="settings"
      label="Einstellungen öffnen"
      icon={Settings}
      onClick={() => onNavigate("einstellungen")}
      onPointerEnter={() => onPreloadView?.("einstellungen")}
      onFocus={() => onPreloadView?.("einstellungen")}
      onTouchStart={() => onPreloadView?.("einstellungen")}
      className={`size-11 shrink-0 rounded-full ${settingsActive ? "border-[var(--core-border-interactive)] bg-[var(--core-surface-muted)] shadow-sm" : ""}`}
      aria-current={settingsActive ? "page" : undefined}
    />
  );
  const themeButton = (
    <IconButton
      type="button"
      data-navigation-utility="theme"
      label={darkModeActive ? "Light Mode einschalten" : "Dark Mode einschalten"}
      icon={ThemeIcon}
      onClick={onToggleTheme}
      className="size-11 shrink-0 rounded-full"
    />
  );
  const helpButton = (
    <IconButton
      type="button"
      data-app-navigation="true"
      data-navigation-utility="help"
      label="Hilfe öffnen"
      icon={CircleHelp}
      onClick={() => onNavigate("hilfe")}
      onPointerEnter={() => onPreloadView?.("hilfe")}
      onFocus={() => onPreloadView?.("hilfe")}
      onTouchStart={() => onPreloadView?.("hilfe")}
      className={`size-11 shrink-0 rounded-full ${helpActive ? "border-[var(--core-border-interactive)] bg-[var(--core-surface-muted)] shadow-sm" : ""}`}
      aria-current={helpActive ? "page" : undefined}
    />
  );

  return (
    <div
      className={sidebarLayout ? "grid w-full grid-cols-[repeat(2,2.75rem)] items-center gap-2" : "flex shrink-0 items-center gap-2"}
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
    <aside className="hidden border-r border-[var(--core-border)] bg-core-surface xl:block xl:overflow-x-hidden xl:overflow-y-auto" data-navigation-layout="sidebar">
      <div className="flex h-full flex-col px-4 pb-5 pt-10">
        <h1 className="core-heading-1 font-semibold tracking-normal text-[var(--core-text)]">
          <NavigationBrand onNavigate={onNavigate} />
        </h1>

        <nav aria-label="Hauptmenü" data-app-navigation="true" className="mt-10 grid grid-cols-1 gap-2">
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
                className={`core-body flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left font-medium transition ${
                  isActive ? "bg-[var(--core-surface-muted)] text-[var(--core-text)] shadow-sm" : "text-[var(--core-text-secondary)] hover:bg-core-surface hover:text-[var(--core-text)]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <NavIcon className="shrink-0 text-[var(--core-text)]" size={21} aria-hidden="true" />
                <span className="min-w-0 truncate">{view.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          {simulationOffsetMinutes > 0 ? (
            <div className="mb-3 rounded-xl border border-core-warning bg-core-warning-soft p-3 text-core-text" role="status">
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
    <header className="core-mobile-header sticky top-0 z-30 min-w-0 border-b border-[var(--core-border)] bg-core-surface px-5 py-3 xl:hidden" data-navigation-layout="mobile-header">
      <div className="flex min-h-11 min-w-0 items-center justify-between gap-3">
        <h1 className="core-mobile-brand shrink-0 core-heading-3 font-semibold text-[var(--core-text)]">
          <NavigationBrand onNavigate={onNavigate} />
        </h1>
        <PomodoroProgress timer={pomodoroTimer} variant="header" />
        <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onPreloadView={onPreloadView} onToggleTheme={onToggleTheme} syncStatus={syncStatus} onSyncNow={onSyncNow} layout="header" />
      </div>
      {simulationOffsetMinutes > 0 ? (
        <div className="mt-2 flex min-h-11 items-center gap-3 rounded-xl border border-core-warning bg-core-warning-soft px-3 text-core-text" role="status">
          <CalendarClock className="shrink-0" size={17} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate core-caption font-semibold">Simulation · {simulationDateLabel} · +{formatSimulationDuration(simulationOffsetMinutes)}</span>
          <button type="button" data-reset-simulation="true" className="min-h-11 shrink-0 px-2 core-body font-semibold text-[var(--core-action-primary)]" onClick={onResetSimulation}>Heute</button>
        </div>
      ) : null}
    </header>
  );
}

function MobileBottomNavigation({ navigationItems, activeView, onNavigate, onPreloadView }: AppNavigationProps) {
  return (
    <nav
      aria-label="Mobile Hauptnavigation"
      data-app-navigation="true"
      data-navigation-layout="bottom-bar"
      className="core-mobile-bottom-navigation fixed left-[50dvw] z-40 grid w-[calc(100dvw-4rem)] max-w-[34rem] -translate-x-1/2 grid-cols-4 gap-1 rounded-[20px] border border-[var(--core-border)] bg-core-raised p-1.5 shadow-[var(--core-shadow-raised)] sm:w-[calc(100dvw-6rem)] xl:hidden"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
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
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 transition ${isActive ? "bg-[var(--core-surface-muted)] text-[var(--core-text)]" : "text-[var(--core-text-muted)] hover:bg-[var(--core-surface-hover)] hover:text-[var(--core-text)]"}`}
            aria-current={isActive ? "page" : undefined}
          >
            <NavIcon className="text-[var(--core-text)]" size={20} aria-hidden="true" />
            <span className="w-full truncate text-center text-[0.68rem] font-medium leading-4">{view.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppNavigation(props: AppNavigationProps) {
  const [theme, setTheme] = React.useState(readCoreTheme);
  const navigationActiveView = props.activeView === "kartenstapel" ? "lernen" : props.activeView;
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
