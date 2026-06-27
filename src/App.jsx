import React from "react";
import { BarChart3, CalendarDays, Home, Settings } from "lucide-react";
import { createMenuModel } from "./menuModel.js";

const iconByKey = {
  calendar: CalendarDays,
  chart: BarChart3,
  home: Home,
};

const menu = createMenuModel();

function getIcon(iconKey) {
  return iconByKey[iconKey] ?? Home;
}

export function App() {
  const [activeView, setActiveView] = React.useState(menu.defaultViewId);
  const current = menu.getView(activeView);
  const Icon = getIcon(current.iconKey);
  const navigationItems = menu.listNavigationItems();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-emerald-600 text-white">
              <Settings size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">CoRe</p>
              <h1 className="text-lg font-semibold leading-tight">Menue App</h1>
            </div>
          </div>

          <nav aria-label="Hauptmenue" className="flex w-full rounded-md border border-slate-200 bg-slate-50 p-1 sm:w-auto">
            {navigationItems.map((view) => {
              const NavIcon = getIcon(view.iconKey);
              const isActive = view.id === activeView;

              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveView(view.id)}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-medium transition sm:flex-none ${
                    isActive
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-600 hover:bg-white hover:text-slate-950"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <NavIcon size={17} aria-hidden="true" />
                  <span>{view.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            <Icon size={18} aria-hidden="true" />
            {current.eyebrow}
          </div>
          <h2 className="text-3xl font-semibold tracking-normal text-slate-950">{current.title}</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{current.body}</p>
        </div>

        <div className="grid gap-3">
          {current.stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
