import React from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, CalendarDays, Home, Settings } from "lucide-react";
import "./styles.css";

const views = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: Home,
    title: "Dashboard",
    eyebrow: "Heute",
    body: "Hier bekommst du einen schnellen Ueberblick ueber die wichtigsten Bereiche deiner App.",
    stats: [
      ["Aufgaben", "12"],
      ["Fokuszeit", "4h"],
      ["Status", "Aktiv"],
    ],
  },
  {
    id: "planung",
    label: "Planung",
    icon: CalendarDays,
    title: "Planung",
    eyebrow: "Naechste Schritte",
    body: "Diese Ansicht ist fuer Termine, Ideen und To-dos gedacht. Du kannst sie spaeter mit echten Daten verbinden.",
    stats: [
      ["Meetings", "3"],
      ["Offen", "7"],
      ["Prioritaet", "Hoch"],
    ],
  },
  {
    id: "analyse",
    label: "Analyse",
    icon: BarChart3,
    title: "Analyse",
    eyebrow: "Auswertung",
    body: "Hier koennten Diagramme, Fortschritt und Kennzahlen landen. Im Moment zeigt sie dir den View-Wechsel.",
    stats: [
      ["Wachstum", "+18%"],
      ["Nutzer", "248"],
      ["Trend", "Stabil"],
    ],
  },
];

function App() {
  const [activeView, setActiveView] = React.useState(views[0].id);
  const current = views.find((view) => view.id === activeView);
  const Icon = current.icon;

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-emerald-600 text-white">
              <Settings size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">CoRe</p>
              <h1 className="text-lg font-semibold leading-tight">Menue App</h1>
            </div>
          </div>

          <nav aria-label="Hauptmenue" className="flex rounded-md border border-slate-200 bg-slate-50 p-1">
            {views.map((view) => {
              const NavIcon = view.icon;
              const isActive = view.id === activeView;

              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveView(view.id)}
                  className={`flex min-h-10 items-center gap-2 rounded px-3 text-sm font-medium transition ${
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
          {current.stats.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
