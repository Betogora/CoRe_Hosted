import React from "react";
import type { LucideIcon } from "lucide-react";
import { BarChart3, BookOpen, CalendarClock, Home, Layers, Moon, PlusSquare, Settings, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import { readCoreTheme, toggleCoreTheme, type CoreTheme } from "../coreTheme.ts";
import type { MenuViewId } from "../menuModel.ts";
import type { PomodoroTimer } from "../pomodoroTimer.ts";
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
  onResetSimulation: () => unknown;
}

const iconByKey: Record<string, LucideIcon> = {
  chart: BarChart3,
  home: Home,
  layers: Layers,
  learn: BookOpen,
  plus: PlusSquare,
};

const utilityViews = new Set(["einstellungen", "hilfe", "simulator"]);

function getIcon(iconKey: string) {
  return iconByKey[iconKey] ?? Home;
}

interface ResponsiveNavigationProps extends AppNavigationProps {
  theme: CoreTheme;
  onToggleTheme: () => void;
}

function NavigationUtilityButtons({ activeView, theme, onNavigate, onToggleTheme, className = "", themeFirst = false }: Pick<ResponsiveNavigationProps, "activeView" | "theme" | "onNavigate" | "onToggleTheme"> & { className?: string; themeFirst?: boolean }) {
  const settingsActive = utilityViews.has(activeView);
  const darkModeActive = theme === "dark";
  const ThemeIcon = darkModeActive ? Moon : Sun;
  const settingsButton = (
    <IconButton
      type="button"
      data-app-navigation="true"
      data-navigation-utility="settings"
      label="Einstellungen öffnen"
      icon={Settings}
      onClick={() => onNavigate("einstellungen")}
      className={`size-11 shrink-0 rounded-full ${settingsActive ? "border-[var(--core-action-primary)] bg-[var(--core-surface-muted)] text-[var(--core-action-primary)] shadow-sm" : ""}`}
      aria-current={settingsActive ? "page" : undefined}
    />
  );
  const themeButton = (
    <IconButton
      type="button"
      data-navigation-utility="theme"
      label={darkModeActive ? "Light Mode einschalten" : "Dark Mode einschalten"}
      icon={ThemeIcon}
      variant="ghost"
      onClick={onToggleTheme}
      className="size-11 shrink-0 rounded-full"
    />
  );

  return (
    <div className={`flex items-center gap-2 ${className}`} data-navigation-utilities="true">
      {themeFirst ? themeButton : settingsButton}
      {themeFirst ? settingsButton : themeButton}
    </div>
  );
}

function DesktopNavigation({ navigationItems, activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onResetSimulation, theme, onToggleTheme }: ResponsiveNavigationProps) {
  return (
    <aside className="hidden border-r border-[var(--core-border)] bg-core-surface xl:block xl:overflow-y-auto" data-navigation-layout="sidebar">
      <div className="flex h-full flex-col px-4 py-8 lg:px-5 lg:py-10">
        <div>
          <h1 className="core-heading-1 font-semibold tracking-normal text-[var(--core-text)]">CoRe</h1>
          <p className="mt-2 core-body-large text-[var(--core-text-muted)]">Content Repetition</p>
        </div>

        <nav aria-label="Hauptmenü" data-app-navigation="true" className="mt-10 grid grid-cols-1 gap-2">
          {navigationItems.map((view) => {
            const NavIcon = getIcon(view.iconKey);
            const isActive = view.id === activeView;

            return (
              <button
                key={view.id}
                type="button"
                onClick={() => onNavigate(view.id)}
                className={`core-body flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left font-medium transition ${
                  isActive ? "bg-[var(--core-surface-muted)] text-[var(--core-text)] shadow-sm" : "text-[var(--core-text-secondary)] hover:bg-core-surface hover:text-[var(--core-text)]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <NavIcon className="shrink-0" size={21} aria-hidden="true" />
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
            <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onToggleTheme={onToggleTheme} className="justify-start" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ activeView, simulationOffsetMinutes, simulationDateLabel, pomodoroTimer, onNavigate, onResetSimulation, theme, onToggleTheme }: ResponsiveNavigationProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--core-border)] bg-core-surface px-5 py-3 xl:hidden" data-navigation-layout="mobile-header">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="shrink-0 core-heading-3 font-semibold text-[var(--core-text)]">CoRe</h1>
        <PomodoroProgress timer={pomodoroTimer} variant="header" />
        <NavigationUtilityButtons activeView={activeView} theme={theme} onNavigate={onNavigate} onToggleTheme={onToggleTheme} className="shrink-0" themeFirst />
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

function MobileBottomNavigation({ navigationItems, activeView, onNavigate }: AppNavigationProps) {
  return (
    <nav
      aria-label="Mobile Hauptnavigation"
      data-app-navigation="true"
      data-navigation-layout="bottom-bar"
      className="fixed left-[50dvw] z-40 grid w-[calc(100dvw-4rem)] max-w-[34rem] -translate-x-1/2 grid-cols-5 gap-1 rounded-[20px] border border-[var(--core-border)] bg-core-raised p-1.5 shadow-[var(--core-shadow-raised)] sm:w-[calc(100dvw-6rem)] xl:hidden"
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
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 transition ${isActive ? "bg-[var(--core-surface-muted)] text-[var(--core-text)]" : "text-[var(--core-text-muted)] hover:bg-[var(--core-surface-hover)] hover:text-[var(--core-text)]"}`}
            aria-current={isActive ? "page" : undefined}
          >
            <NavIcon size={20} aria-hidden="true" />
            <span className="w-full truncate text-center text-[0.68rem] font-medium leading-4">{view.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppNavigation(props: AppNavigationProps) {
  const [theme, setTheme] = React.useState(readCoreTheme);
  const mobileBottomNavigation = <MobileBottomNavigation {...props} />;
  const responsiveProps = {
    ...props,
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
