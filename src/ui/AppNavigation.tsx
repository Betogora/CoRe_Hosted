import type { LucideIcon } from "lucide-react";
import { BarChart3, BookOpen, CalendarClock, Ellipsis, Home, Layers, PlusSquare, Settings } from "lucide-react";
import { createPortal } from "react-dom";
import type { MenuViewId } from "../menuModel.ts";
import { formatSimulationDuration } from "../simulationClock.ts";
import { ActionButton } from "./actionUi.tsx";

export interface AppNavigationItem {
  id: MenuViewId;
  label: string;
  iconKey: string;
}

export interface AppNavigationProps {
  navigationItems: AppNavigationItem[];
  activeView: string;
  displayName: string;
  simulationOffsetMinutes: number;
  simulationDateLabel: string;
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

function DesktopNavigation({ navigationItems, activeView, displayName, simulationOffsetMinutes, simulationDateLabel, onNavigate, onResetSimulation }: AppNavigationProps) {
  const settingsActive = utilityViews.has(activeView);

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

        <div className="mt-auto border-t border-[var(--core-border)] pt-6">
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
          <button
            type="button"
            data-app-navigation="true"
            onClick={() => onNavigate("einstellungen")}
            className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
              settingsActive ? "bg-[var(--core-surface-muted)] text-[var(--core-text)] shadow-sm" : "text-[var(--core-text)] hover:bg-core-surface"
            }`}
            aria-label="Einstellungen öffnen"
            aria-current={settingsActive ? "page" : undefined}
          >
            <span className="grid size-10 place-items-center rounded-full bg-[var(--core-info-surface)] core-body font-semibold">{(displayName || "CO").slice(0, 2).toUpperCase()}</span>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--core-surface-muted)] text-[var(--core-action-primary)]">
              <Settings size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate core-body font-semibold">{displayName}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ activeView, simulationOffsetMinutes, simulationDateLabel, onNavigate, onResetSimulation }: AppNavigationProps) {
  const settingsActive = utilityViews.has(activeView);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--core-border)] bg-core-surface px-5 py-3 xl:hidden" data-navigation-layout="mobile-header">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="core-heading-3 font-semibold text-[var(--core-text)]">CoRe</h1>
        <button
          type="button"
          data-app-navigation="true"
          onClick={() => onNavigate("einstellungen")}
          className={`core-action-secondary grid size-11 shrink-0 place-items-center rounded-full p-0 ${settingsActive ? "border-[var(--core-action-primary)] bg-[var(--core-surface-muted)] text-[var(--core-action-primary)] shadow-sm" : "text-[var(--core-text-secondary)]"}`}
          aria-label="Einstellungen öffnen"
          aria-current={settingsActive ? "page" : undefined}
        >
          <Settings size={20} aria-hidden="true" />
        </button>
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
        const isMore = view.id === "kartenstapel";
        const NavIcon = isMore ? Ellipsis : getIcon(view.iconKey);
        const isActive = view.id === activeView;
        const visibleLabel = isMore ? "Mehr" : view.label;

        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onNavigate(view.id)}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 transition ${isActive ? "bg-[var(--core-surface-muted)] text-[var(--core-text)]" : "text-[var(--core-text-muted)] hover:bg-[var(--core-surface-hover)] hover:text-[var(--core-text)]"}`}
            aria-label={isMore ? "Kartenverwaltung öffnen" : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <NavIcon size={20} aria-hidden="true" />
            <span className="w-full truncate text-center text-[0.68rem] font-medium leading-4">{visibleLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppNavigation(props: AppNavigationProps) {
  const mobileBottomNavigation = <MobileBottomNavigation {...props} />;

  return (
    <>
      <DesktopNavigation {...props} />
      <MobileHeader {...props} />
      {typeof document === "undefined" ? mobileBottomNavigation : createPortal(mobileBottomNavigation, document.body)}
    </>
  );
}
