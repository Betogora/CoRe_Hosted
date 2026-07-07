import React from "react";
import { Activity, Bell, CalendarDays, ChevronRight, Layers, Sparkles, Target } from "lucide-react";
import { createDeckLibraryModel } from "../libraryModel.js";
import { DonutValue, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.jsx";

const heatmapToneByLevel = [
  "border-[#dfe5f0] bg-[#eef2f7]",
  "border-[#c2eadc] bg-[#d9f4ec]",
  "border-[#92ddcc] bg-[#a4e8db]",
  "border-[#5ebfc8] bg-[#68cdd5]",
  "border-[#32879c] bg-[#32879c]",
];

function heatmapDayLabel(day) {
  const [, month, date] = day.key.split("-");
  if (day.isFuture) return `${date}.${month}. noch offen`;
  if (day.count === 0) return `${date}.${month}. keine Karten gelernt`;
  if (day.count === 1) return `${date}.${month}. 1 Karte gelernt`;
  return `${date}.${month}. ${day.count} Karten gelernt`;
}

function HeatmapMetric({ label, value, hint }) {
  return (
    <div>
      <p className="text-sm font-semibold text-[#66709a]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#17214f]">{value}</p>
      {hint ? <p className="mt-1 text-sm text-[#66709a]">{hint}</p> : null}
    </div>
  );
}

function StudyHeatmap({ heatmap }) {
  return (
    <SoftPanel className="p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex gap-4">
          <OrbIcon icon={Activity} className="bg-teal-50 text-teal-700" />
          <div>
            <h3 className="text-xl font-semibold text-[#17214f]">Lern-Heatmap</h3>
            <p className="mt-2 text-sm leading-6 text-[#66709a]">Gelernte Karten pro Tag in den letzten 12 Wochen.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-5">
          <HeatmapMetric label="Karten" value={heatmap.totalCount} hint="im Zeitraum" />
          <HeatmapMetric label="Aktive Tage" value={heatmap.activeDays} />
          <HeatmapMetric label="Serie" value={heatmap.currentStreak} hint="Tage" />
        </div>
      </div>

      <div className="mt-7 overflow-x-auto pb-1">
        <div className="grid min-w-[36rem] grid-cols-[2rem_repeat(12,minmax(1.25rem,1fr))] gap-1.5">
          {heatmap.weekdayLabels.map((label, dayIndex) => (
            <React.Fragment key={label}>
              <span className="flex h-4 items-center text-xs font-semibold text-[#66709a]">{label}</span>
              {heatmap.weeks.map((week, weekIndex) => {
                const day = week[dayIndex];
                return (
                  <span
                    key={`${weekIndex}-${day.key}`}
                    className={`block h-4 rounded border ${heatmapToneByLevel[day.level]} ${day.isToday ? "ring-2 ring-[#17214f]/30 ring-offset-1" : ""} ${day.isFuture ? "opacity-40" : ""}`}
                    title={heatmapDayLabel(day)}
                    aria-label={heatmapDayLabel(day)}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 text-sm text-[#66709a]">
        <span>Längste Serie: {heatmap.longestStreak} Tage</span>
        <div className="flex items-center gap-2">
          <span>Weniger</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`block size-3 rounded border ${heatmapToneByLevel[level]}`} />
          ))}
          <span>Mehr</span>
        </div>
      </div>
    </SoftPanel>
  );
}

export function DashboardScreen({ state, onNavigate, onStartDeck }) {
  const library = createDeckLibraryModel(state.decks);
  const { totals, studyHeatmap } = library;
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
        body="Fällige Karten, Lernaktivität und aktive Stapel."
        action={<Bell className="mt-2 text-[#5361aa]" size={22} aria-hidden="true" />}
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <StatTile icon={CalendarDays} label="Heute fällig" value={totals.dueCards} hint="Review-Objekte" />
        <StatTile icon={Layers} label="Originalkarten" value={totals.totalCards} hint={`${totals.deckCount} Stapel`} accent="text-teal-700" />
        <StatTile icon={Sparkles} label="CoRe-ready" value={totals.matureCards} hint={`${totals.activeVariants} aktive Varianten`} accent="text-amber-700" />
        <StatTile icon={Target} label="Reifegrad" value={`${totals.completionPercent} %`} hint="Karten ab Reifegrad" accent="text-emerald-700" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SoftPanel className="p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[#17214f]">Aktive Stapel</h3>
            <button type="button" onClick={() => onNavigate("lernen")} className="text-sm font-semibold text-[#4f5eb1]">
              Lernen öffnen
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
                    <p className="text-sm text-[#66709a]">
                      {summary.totalCards} Karten · {summary.dueCards} fällig
                    </p>
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

        <StudyHeatmap heatmap={studyHeatmap} />
      </div>
    </div>
  );
}
