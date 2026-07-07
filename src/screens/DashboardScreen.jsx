import React from "react";
import { Bell, Bot, CalendarDays, ChevronRight, Layers, Network, PlusSquare, Save, ShieldCheck, SlidersHorizontal, Sparkles, Target } from "lucide-react";
import { createDeckLibraryModel } from "../libraryModel.js";
import { DonutValue, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.jsx";

function OnboardingPanel({ profile, onSave, onCreate }) {
  const [form, setForm] = React.useState(profile);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <SoftPanel className="p-6">
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="flex gap-4">
          <OrbIcon icon={ShieldCheck} className="bg-emerald-50 text-emerald-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Lokales Profil</p>
            <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">Account und Datenschutz</h3>
            <p className="mt-2 text-sm leading-6 text-[#66709a]">Lernstände bleiben privat; Communitys erhalten nur freigegebene Deck-Inhalte.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Anzeigename
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.displayName} onChange={(event) => update("displayName", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            E-Mail
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.email} onChange={(event) => update("email", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Hochschule
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.university} onChange={(event) => update("university", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Fachbereich
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.fieldOfStudy} onChange={(event) => update("fieldOfStudy", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Sprache
            <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={form.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value)}>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const saved = onSave({ ...form, onboardingComplete: true });
              onCreate?.(saved);
            }}
            className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white"
          >
            <Save size={16} aria-hidden="true" />
            Profil aktivieren
          </button>
        </div>
      </div>
    </SoftPanel>
  );
}

export function DashboardScreen({ state, onSaveProfile, onNavigate, onStartDeck }) {
  const library = createDeckLibraryModel(state.decks);
  const { totals } = library;
  const dashboardRows = library.dashboardRows.length
    ? library.dashboardRows
    : [
        {
          id: "empty",
          name: "Noch kein Kartenstapel",
          deck: { id: "empty", name: "Noch kein Kartenstapel" },
          summary: { totalCards: 0, dueCards: 0 },
          progress: 0,
          isEmpty: true,
        },
      ];

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Heute"
        title={`Guten Morgen, ${state.profile.displayName || "Noemi"}`}
        body="Fällige Karten, Variantenstatus und offene Jobs."
        action={<Bell className="mt-2 text-[#5361aa]" size={22} aria-hidden="true" />}
      />

      {!state.profile.onboardingComplete ? <OnboardingPanel profile={state.profile} onSave={onSaveProfile} /> : null}

      <div className="grid gap-6 lg:grid-cols-4">
        <StatTile icon={CalendarDays} label="Heute fällig" value={totals.dueCards} hint="Review-Objekte" />
        <StatTile icon={Layers} label="Originalkarten" value={totals.totalCards} hint={`${totals.deckCount} Stapel`} accent="text-teal-700" />
        <StatTile icon={Sparkles} label="CoRe-ready" value={totals.matureCards} hint={`${totals.activeVariants} aktive Varianten`} accent="text-amber-700" />
        <StatTile icon={Target} label="Maturity" value={`${totals.completionPercent} %`} hint="Karten ab Reifegrad" accent="text-emerald-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SoftPanel className="p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[#17214f]">Aktive Stapel</h3>
            <button type="button" onClick={() => onNavigate("kartenstapel")} className="text-sm font-semibold text-[#4f5eb1]">
              Alle anzeigen
            </button>
          </div>
          <div className="grid gap-3">
            {dashboardRows.map((row) => {
              const summary = row.summary;
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e3e7f5] bg-white/72 px-5 py-4">
                  <OrbIcon icon={Layers} className="size-10 bg-[#eef1fb] text-[#6672bf]" />
                  <div className="min-w-[12rem] flex-1">
                    <p className="truncate text-base font-semibold text-[#17214f]">{row.name}</p>
                    <p className="text-sm text-[#66709a]">{summary.totalCards} Karten · {summary.dueCards} fällig</p>
                  </div>
                  <DonutValue value={row.progress} />
                  {!row.isEmpty ? (
                    <button type="button" onClick={() => onStartDeck(row.deck)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
                      Lernen <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SoftPanel>

        <SoftPanel className="p-7">
          <h3 className="text-xl font-semibold text-[#17214f]">Schnellzugriff</h3>
          <div className="mt-5 grid gap-3">
            {[
              { view: "neue-karten", icon: PlusSquare, label: "Karten erstellen" },
              { view: "kartenstapel", icon: SlidersHorizontal, label: "CoRe-Modus steuern" },
              { view: "graph", icon: Network, label: "Graph öffnen" },
              { view: "assistent", icon: Bot, label: "Assistent fragen" },
              { view: "ki", icon: Bot, label: "KI-Jobs prüfen" },
            ].map((action) => (
              <button
                key={action.view}
                type="button"
                onClick={() => onNavigate(action.view)}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] px-4 text-left text-sm font-semibold text-[#4f5eb1] hover:bg-white"
              >
                <action.icon size={17} aria-hidden="true" />
                {action.label}
                <ChevronRight className="ml-auto" size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </SoftPanel>
      </div>
    </div>
  );
}
