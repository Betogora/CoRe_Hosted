import * as Popover from "@radix-ui/react-popover";
import React from "react";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Flame,
  FolderTree,
  Layers3,
  Search,
  Target,
  Timer,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatisticsScreenProps } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import {
  createStatisticsIndex,
  projectStatistics,
  type StatisticsCalendarPoint,
  type StatisticsDeckSelection,
  type StatisticsPeriod,
  type StatisticsProjection,
} from "../statisticsModel.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { DeckAppearanceIcon } from "../ui/deckAppearance.tsx";
import { EmptyState, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";

const PERIOD_OPTIONS: Array<{ value: StatisticsPeriod; label: string }> = [
  { value: "30d", label: "30 Tage" },
  { value: "90d", label: "90 Tage" },
  { value: "365d", label: "1 Jahr" },
  { value: "all", label: "Gesamt" },
];
const CATEGORY_COLORS = {
  learning: "var(--core-action-primary)",
  relearning: "var(--core-danger)",
  young: "var(--core-success)",
  mature: "var(--core-warning)",
};
const PIE_COLORS = [
  "var(--core-action-primary)",
  "var(--core-danger)",
  "var(--core-warning)",
  "var(--core-success)",
  "var(--core-text-muted)",
];
const axisTick = { fill: "var(--core-text-muted)", fontSize: 11 };
const NUMBER_FORMATTERS = [
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }),
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }),
];

type TooltipPayload = Array<{
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}>;

function formatNumber(value: number, maximumFractionDigits = 0) {
  return NUMBER_FORMATTERS[maximumFractionDigits === 0 ? 0 : 1].format(value);
}

function formatPercent(value: number) {
  return `${formatNumber(value, 1)} %`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds <= 0) return "0 Min.";
  const minutes = milliseconds / 60_000;
  if (minutes < 1) return `${Math.round(milliseconds / 1_000)} Sek.`;
  if (minutes < 60) return `${formatNumber(minutes, 1)} Min.`;
  return `${formatNumber(minutes / 60, 1)} Std.`;
}

function formatDate(value: string | null, timeZone: string) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function StatisticsTooltip({
  active,
  payload,
  label,
  valueFormatter = (value, entry) => String(entry.dataKey ?? "").toLocaleLowerCase("de-DE").includes("percent") ? formatPercent(value) : formatNumber(value, 1),
}: {
  active?: boolean;
  payload?: TooltipPayload;
  label?: string | number;
  valueFormatter?: (value: number, entry: NonNullable<TooltipPayload>[number]) => string;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload ?? {};
  const heading = String(datum.rangeLabel ?? datum.label ?? label ?? "Details");
  return (
    <div role="tooltip" className="core-overlay min-w-52 rounded-xl border border-[var(--core-border)] bg-core-surface p-3 shadow-xl">
      <p className="core-body font-semibold text-core-text">{heading}</p>
      <div className="mt-2 grid gap-1.5">
        {typeof datum.total === "number" ? (
          <div className="flex items-center justify-between gap-5 border-b border-[var(--core-border)] pb-1.5 core-caption">
            <span className="font-semibold text-core-secondary">Gesamt</span>
            <span className="font-semibold text-core-text">{valueFormatter(datum.total, { name: "Gesamt", dataKey: "total", payload: datum })}</span>
          </div>
        ) : null}
        {payload.filter((entry) => entry.value != null).map((entry) => (
          <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center justify-between gap-5 core-caption">
            <span className="flex items-center gap-2 text-core-secondary">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: entry.color ?? entry.fill }} aria-hidden="true" />
              {entry.name}
            </span>
            <span className="font-semibold text-core-text">{valueFormatter(Number(entry.value), entry)}</span>
          </div>
        ))}
      </div>
      {typeof datum.timedCount === "number" && typeof datum.total === "number" && datum.total > 0 ? (
        <p className="core-caption mt-2 border-t border-[var(--core-border)] pt-2 text-core-muted">
          Zeitmessung: {formatPercent((datum.timedCount / datum.total) * 100)} Abdeckung
        </p>
      ) : null}
    </div>
  );
}

function PanelHeader({ title, description, snapshot = false }: { title: string; description: string; snapshot?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--core-border)] pb-4">
      <div>
        <h3 className="core-heading-3 text-core-text">{title}</h3>
        <p className="core-body mt-1 text-core-muted">{description}</p>
      </div>
      {snapshot ? <span className="core-status-label rounded-full bg-core-subtle px-3 py-1.5 text-core-secondary">Stand heute</span> : null}
    </div>
  );
}

function ChartPanel({
  title,
  description,
  children,
  snapshot,
  className = "",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  snapshot?: boolean;
  className?: string;
}) {
  return (
    <SoftPanel className={`p-5 sm:p-6 ${className}`}>
      <PanelHeader title={title} description={description} snapshot={snapshot} />
      <div className="mt-5 min-w-0">{children}</div>
    </SoftPanel>
  );
}

function NoChartData({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-xl bg-core-subtle p-6 text-center core-body text-core-muted">
      <p className="max-w-md">{children}</p>
    </div>
  );
}

function RechartsLegend() {
  return <Legend iconType="square" wrapperStyle={{ color: "var(--core-text-secondary)", fontSize: 12, paddingTop: 14 }} />;
}

function CartesianStatisticsChart({
  data,
  ariaLabel,
  children,
  className = "h-72 w-full",
  minTickGap,
  interval,
  rightAxis,
  tooltip,
}: {
  data: object[];
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  minTickGap?: number;
  interval?: number;
  rightAxis?: "cumulative" | "percent";
  tooltip: React.ReactElement;
}) {
  return (
    <div className={className} aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} accessibilityLayer margin={{ top: 8, right: 10, left: -20, bottom: 10 }}>
          <CartesianGrid stroke="var(--core-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} minTickGap={minTickGap} interval={interval} />
          <YAxis tick={axisTick} allowDecimals={false} />
          {rightAxis === "cumulative" ? <YAxis yAxisId="cumulative" orientation="right" tick={axisTick} allowDecimals={false} /> : null}
          {rightAxis === "percent" ? <YAxis yAxisId="percent" orientation="right" tick={axisTick} domain={[0, 100]} unit=" %" /> : null}
          <Tooltip content={tooltip} />
          <RechartsLegend />
          {children}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityChart({ points, duration = false }: { points: StatisticsProjection["activity"]; duration?: boolean }) {
  if (!points.some((point) => duration ? point.durationMs > 0 : point.total > 0)) {
    return <NoChartData>{duration ? "Für diesen Zeitraum wurden noch keine Antwortzeiten gemessen." : "Im gewählten Zeitraum wurden keine Wiederholungen erfasst."}</NoChartData>;
  }
  const data = duration
    ? points.map((point) => ({
        ...point,
        learning: point.durationLearningMs / 60_000,
        relearning: point.durationRelearningMs / 60_000,
        young: point.durationYoungMs / 60_000,
        mature: point.durationMatureMs / 60_000,
        total: point.durationMs / 60_000,
        cumulative: 0,
      }))
    : points;
  if (duration) {
    let cumulative = 0;
    data.forEach((point) => { cumulative += point.total; point.cumulative = cumulative; });
  }
  return (
    <CartesianStatisticsChart
      data={data}
      ariaLabel={duration ? "Diagramm zur Lernzeit" : "Diagramm zu Wiederholungen"}
      className="h-80 w-full"
      minTickGap={28}
      rightAxis="cumulative"
      tooltip={<StatisticsTooltip valueFormatter={(value) => duration ? `${formatNumber(value, 1)} Min.` : formatNumber(value)} />}
    >
      <Bar dataKey="learning" name="Lernen" stackId="reviews" fill={CATEGORY_COLORS.learning} isAnimationActive={false} />
      <Bar dataKey="relearning" name="Wiederlernen" stackId="reviews" fill={CATEGORY_COLORS.relearning} isAnimationActive={false} />
      <Bar dataKey="young" name="Jung" stackId="reviews" fill={CATEGORY_COLORS.young} isAnimationActive={false} />
      <Bar dataKey="mature" name="Reif" stackId="reviews" fill={CATEGORY_COLORS.mature} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Area yAxisId="cumulative" dataKey="cumulative" name="Kumuliert" stroke="var(--core-text-muted)" fill="var(--core-action-primary)" fillOpacity={0.08} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function AddedCardsChart({ points }: { points: StatisticsProjection["addedCards"] }) {
  if (!points.some((point) => point.count > 0)) return <NoChartData>Im gewählten Zeitraum wurden keine Karten hinzugefügt.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu hinzugefügten Karten" minTickGap={28} rightAxis="cumulative" tooltip={<StatisticsTooltip />}>
      <Bar dataKey="count" name="Neu hinzugefügt" fill="var(--core-action-primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="cumulative" dataKey="cumulative" name="Bestand" stroke="var(--core-warning)" strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function CalendarHeatmap({ points, mode }: { points: StatisticsCalendarPoint[]; mode: "day" | "month" }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [detailIndex, setDetailIndex] = React.useState<number | null>(null);
  const max = Math.max(1, ...points.map((point) => point.reviews));
  React.useEffect(() => {
    if (activeIndex >= points.length) setActiveIndex(Math.max(0, points.length - 1));
  }, [activeIndex, points.length]);
  const detail = detailIndex == null ? null : points[detailIndex];
  function moveFocus(index: number) {
    const normalized = Math.min(points.length - 1, Math.max(0, index));
    setActiveIndex(normalized);
    setDetailIndex(normalized);
    document.querySelector<HTMLButtonElement>(`[data-calendar-index="${normalized}"]`)?.focus();
  }
  function renderCell(point: StatisticsCalendarPoint, index: number) {
    const intensity = point.reviews / max;
    const opacity = point.reviews === 0 ? 0.08 : 0.2 + intensity * 0.8;
    const label = `${point.label}: ${formatNumber(point.reviews)} Wiederholungen, ${formatDuration(point.durationMs)}, ${formatPercent(point.successPercent)} Erfolgsquote`;
    const verticalStep = mode === "month" ? 12 : 7;
    return (
      <button
        key={point.key}
        type="button"
        role="gridcell"
        data-calendar-index={index}
        tabIndex={index === activeIndex ? 0 : -1}
        aria-label={label}
        onFocus={() => { setActiveIndex(index); setDetailIndex(index); }}
        onMouseEnter={() => setDetailIndex(index)}
        onMouseLeave={() => setDetailIndex(null)}
        onClick={() => setDetailIndex(index)}
        onKeyDown={(event) => {
          const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? verticalStep : event.key === "ArrowUp" ? -verticalStep : 0;
          if (!step) return;
          event.preventDefault();
          moveFocus(index + step);
        }}
        className={mode === "month" ? "min-h-11 rounded-lg border border-[var(--core-border)] px-2 core-caption font-semibold text-core-secondary" : "size-3.5 rounded-[3px] border border-[var(--core-border)]"}
        style={{ backgroundColor: `color-mix(in srgb, var(--core-action-primary) ${Math.round(opacity * 100)}%, var(--core-surface-muted))` }}
      >
        {mode === "month" ? point.shortLabel : <span className="sr-only">{point.label}</span>}
      </button>
    );
  }
  const monthGroups = mode === "month"
    ? points.reduce<Array<{ year: string; entries: Array<{ point: StatisticsCalendarPoint; index: number }> }>>((groups, point, index) => {
        const year = point.key.slice(0, 4);
        const current = groups.at(-1);
        if (current?.year === year) current.entries.push({ point, index });
        else groups.push({ year, entries: [{ point, index }] });
        return groups;
      }, [])
    : [];
  return (
    <div>
      <div
        role="grid"
        aria-label={mode === "month" ? "Monatliche Lernaktivität" : "Tägliche Lernaktivität"}
        className={mode === "month" ? "grid gap-4" : "overflow-x-auto pb-2"}
      >
        {mode === "month" ? monthGroups.map((group) => (
          <div key={group.year} role="row" className="grid gap-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:items-center">
            <span role="rowheader" className="core-body font-semibold text-core-secondary">{group.year}</span>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">{group.entries.map(({ point, index }) => renderCell(point, index))}</div>
          </div>
        )) : <div className="grid min-w-max grid-flow-col grid-rows-7 gap-1">{points.map(renderCell)}</div>}
      </div>
      <div role="tooltip" aria-live="polite" className="mt-4 min-h-14 rounded-xl bg-core-subtle px-4 py-3 core-body text-core-secondary">
        {detail ? (
          <span><strong className="text-core-text">{detail.label}:</strong> {formatNumber(detail.reviews)} Wiederholungen · {formatDuration(detail.durationMs)} · {formatPercent(detail.successPercent)} erfolgreich</span>
        ) : "Zelle mit Maus, Touch oder Tastatur auswählen, um Details anzuzeigen."
        }
      </div>
    </div>
  );
}

function PlanningChart({ planning }: { planning: StatisticsProjection["planning"] }) {
  if (!planning.points.some((point) => point.total > 0)) return <NoChartData>Für den gewählten Horizont sind keine Wiederholungen eingeplant.</NoChartData>;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Überfällig", planning.overdue],
          ["Morgen fällig", planning.dueTomorrow],
          ["Im Horizont", planning.dueInHorizon],
          ["Arbeitspensum/Tag", planning.dailyWorkload],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-core-subtle p-3">
            <p className="core-caption text-core-muted">{label}</p>
            <p className="core-heading-3 mt-1 text-core-text">{formatNumber(Number(value), 1)}</p>
          </div>
        ))}
      </div>
      <CartesianStatisticsChart data={planning.points} ariaLabel="Diagramm zu geplanten Wiederholungen" className="mt-5 h-72 w-full" minTickGap={28} rightAxis="cumulative" tooltip={<StatisticsTooltip />}>
        <Bar dataKey="learning" name="Lernen" stackId="due" fill={CATEGORY_COLORS.learning} isAnimationActive={false} />
        <Bar dataKey="relearning" name="Wiederlernen/Rückstand" stackId="due" fill={CATEGORY_COLORS.relearning} isAnimationActive={false} />
        <Bar dataKey="young" name="Jung" stackId="due" fill={CATEGORY_COLORS.young} isAnimationActive={false} />
        <Bar dataKey="mature" name="Reif" stackId="due" fill={CATEGORY_COLORS.mature} isAnimationActive={false} />
        <Area yAxisId="cumulative" dataKey="cumulative" name="Kumuliert" stroke="var(--core-text-muted)" fill="var(--core-action-primary)" fillOpacity={0.08} isAnimationActive={false} />
      </CartesianStatisticsChart>
    </>
  );
}

function StatusChart({ status }: { status: StatisticsProjection["status"] }) {
  if (status.activeVariants === 0) return <NoChartData>Die ausgewählten Stapel enthalten keine aktiven, planbaren Varianten.</NoChartData>;
  return (
    <div className="grid items-center gap-5 lg:grid-cols-[minmax(220px,0.8fr)_1fr]">
      <div className="h-64" aria-label="Diagramm zum aktuellen Kartenstatus">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Pie data={status.rows} dataKey="count" nameKey="label" innerRadius="53%" outerRadius="82%" paddingAngle={2} isAnimationActive={false}>
              {status.rows.map((row, index) => <Cell key={row.key} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<StatisticsTooltip valueFormatter={(value) => `${formatNumber(value)} Varianten`} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2">
        {status.rows.map((row, index) => (
          <div key={row.key} className="flex items-center justify-between gap-4 rounded-lg bg-core-subtle px-3 py-2 core-body">
            <span className="flex items-center gap-2 text-core-secondary"><span className="size-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />{row.label}</span>
            <strong className="text-core-text">{formatNumber(row.count)} · {formatPercent(row.percent)}</strong>
          </div>
        ))}
        <p className="core-caption mt-2 text-core-muted">
          {formatNumber(status.learningItems)} Learning Items · {formatNumber(status.suspendedItems)} suspendiert · {formatNumber(status.deletedItems)} gelöscht
        </p>
      </div>
    </div>
  );
}

function DistributionChart({
  points,
  countLabel,
}: {
  points: StatisticsProjection["intervals"]["points"];
  countLabel: string;
  }) {
  if (!points.some((point) => point.count > 0)) return <NoChartData>Für diese Verteilung liegen noch keine geeigneten Werte vor.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel={`Diagramm zur Verteilung: ${countLabel}`} minTickGap={24} rightAxis="percent" tooltip={<StatisticsTooltip valueFormatter={(value, entry) => entry.dataKey === "cumulativePercent" ? formatPercent(value) : `${formatNumber(value)} ${countLabel}`} />}>
      <Bar dataKey="count" name={countLabel} fill="var(--core-action-primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="percent" dataKey="cumulativePercent" name="Kumuliert" stroke="var(--core-warning)" strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function HourlyChart({ points }: { points: StatisticsProjection["hourly"] }) {
  if (!points.some((point) => point.reviews > 0)) return <NoChartData>Im gewählten Zeitraum liegen keine Wiederholungen vor.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu Wiederholungen nach Uhrzeit" interval={2} rightAxis="percent" tooltip={<StatisticsTooltip valueFormatter={(value, entry) => entry.dataKey === "successPercent" ? formatPercent(value) : `${formatNumber(value)} Reviews`} />}>
      <Bar dataKey="reviews" name="Wiederholungen" fill="var(--core-action-primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      <Line yAxisId="percent" dataKey="successPercent" name="Erfolgsquote" stroke="var(--core-warning)" strokeWidth={2} dot={false} isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function RatingChart({ points }: { points: StatisticsProjection["ratings"] }) {
  if (!points.some((point) => point.total > 0)) return <NoChartData>Im gewählten Zeitraum wurden keine Antwortknöpfe verwendet.</NoChartData>;
  return (
    <CartesianStatisticsChart data={points} ariaLabel="Diagramm zu verwendeten Antwortknöpfen" tooltip={<StatisticsTooltip valueFormatter={(value) => formatNumber(value)} />}>
      <Bar dataKey="again" name="Nochmal" fill="var(--core-danger)" isAnimationActive={false} />
      <Bar dataKey="hard" name="Schwer" fill="var(--core-warning)" isAnimationActive={false} />
      <Bar dataKey="good" name="Gut" fill="var(--core-success)" isAnimationActive={false} />
      <Bar dataKey="easy" name="Einfach" fill="var(--core-action-primary)" isAnimationActive={false} />
    </CartesianStatisticsChart>
  );
}

function isDescendant(parentByDeckId: Map<string, string | null>, candidateId: string, ancestorId: string) {
  let parentId = parentByDeckId.get(candidateId) ?? null;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = parentByDeckId.get(parentId) ?? null;
  }
  return false;
}

function DeckMultiSelect({
  decks,
  value,
  scopeLabel,
  onChange,
}: {
  decks: Deck[];
  value: StatisticsDeckSelection;
  scopeLabel: string;
  onChange: (value: StatisticsDeckSelection) => void;
}) {
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const selected = value === "all" ? [] : value;
  const ordered = React.useMemo(() => [...decks].sort((left, right) => left.hierarchyPath.join("/").localeCompare(right.hierarchyPath.join("/"), "de")), [decks]);
  const parentByDeckId = React.useMemo(() => new Map(decks.map((deck) => [deck.id, deck.parentDeckId])), [decks]);
  const visible = ordered.filter((deck) => deck.hierarchyPath.join(" / ").toLocaleLowerCase("de-DE").includes(deferredQuery.trim().toLocaleLowerCase("de-DE")));
  function toggle(deckId: string) {
    const inherited = selected.some((selectedId) => selectedId !== deckId && isDescendant(parentByDeckId, deckId, selectedId));
    if (inherited) return;
    if (selected.includes(deckId)) {
      const next = selected.filter((id) => id !== deckId);
      onChange(next.length > 0 ? next : "all");
      return;
    }
    const next = [...selected.filter((id) => !isDescendant(parentByDeckId, id, deckId)), deckId];
    onChange(next);
  }
  return (
    <Popover.Root onOpenChange={(open) => { if (!open) setQuery(""); }}>
      <Popover.Trigger asChild>
        <button type="button" className="core-field flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 text-left sm:w-72" aria-label={`Stapel filtern. Aktuell: ${scopeLabel}`}>
          <span className="flex min-w-0 items-center gap-2"><Layers3 size={18} className="shrink-0 text-core-action" aria-hidden="true" /><span className="truncate core-body font-semibold text-core-text">{scopeLabel}</span></span>
          <ChevronDown size={17} className="shrink-0 text-core-muted" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={16} className="core-overlay z-[70] grid w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-2xl border border-[var(--core-border)] bg-core-surface p-3 shadow-xl">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-subtle px-3">
            <Search size={17} className="text-core-muted" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Stapel suchen" aria-label="Stapel suchen" className="min-h-11 min-w-0 flex-1 bg-transparent core-body text-core-text placeholder:text-core-muted" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Suche leeren" className="grid size-8 place-items-center text-core-muted"><X size={16} /></button> : null}
          </div>
          <div className="max-h-80 overflow-y-auto pr-1">
            <button type="button" onClick={() => onChange("all")} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-core-subtle" aria-pressed={value === "all"}>
              <span className={`grid size-5 place-items-center rounded border ${value === "all" ? "border-[var(--core-action-primary)] bg-core-action text-[var(--core-text-on-accent)]" : "border-[var(--core-border)]"}`}>{value === "all" ? <Check size={14} /> : null}</span>
              <FolderTree size={18} className="text-core-action" aria-hidden="true" />
              <span className="core-body font-semibold text-core-text">Gesamte Sammlung</span>
            </button>
            <div className="my-2 border-t border-[var(--core-border)]" />
            {visible.map((deck) => {
              const inherited = selected.some((selectedId) => selectedId !== deck.id && isDescendant(parentByDeckId, deck.id, selectedId));
              const checked = selected.includes(deck.id) || inherited;
              return (
                <button key={deck.id} type="button" onClick={() => toggle(deck.id)} disabled={inherited} aria-pressed={checked} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-core-subtle disabled:cursor-default disabled:opacity-65" style={{ paddingLeft: `${12 + Math.max(0, deck.hierarchyPath.length - 1) * 16}px` }}>
                  <span className={`grid size-5 shrink-0 place-items-center rounded border ${checked ? "border-[var(--core-action-primary)] bg-core-action text-[var(--core-text-on-accent)]" : "border-[var(--core-border)]"}`}>{checked ? <Check size={14} /> : null}</span>
                  <DeckAppearanceIcon deck={deck} className="size-7 shrink-0" iconSize={14} />
                  <span className="min-w-0 flex-1"><span className="block truncate core-body font-semibold text-core-text">{deck.name}</span>{inherited ? <span className="block core-caption text-core-muted">Durch Oberstapel eingeschlossen</span> : null}</span>
                </button>
              );
            })}
            {visible.length === 0 ? <p className="p-4 text-center core-body text-core-muted">Kein passender Stapel.</p> : null}
          </div>
          <Popover.Arrow className="fill-[var(--core-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RetentionTable({ rows }: { rows: StatisticsProjection["retention"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-left core-body">
        <thead><tr className="border-b border-[var(--core-border)] text-core-muted"><th className="px-3 py-3">Zeitraum</th><th className="px-3 py-3">Jung</th><th className="px-3 py-3">Reif</th><th className="px-3 py-3">Gesamt</th><th className="px-3 py-3 text-right">Stichprobe</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key} className="border-b border-[var(--core-border)] last:border-0"><th className="px-3 py-3 font-semibold text-core-text">{row.label}</th><td className="px-3 py-3 text-core-secondary">{formatPercent(row.young.percent)}</td><td className="px-3 py-3 text-core-secondary">{formatPercent(row.mature.percent)}</td><td className="px-3 py-3 font-semibold text-core-text">{formatPercent(row.total.percent)}</td><td className="px-3 py-3 text-right text-core-muted">{formatNumber(row.total.total)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function StatisticsScreen({ decks, now, timeZone, onNavigate, onStartDeck, onOpenCard }: StatisticsScreenProps) {
  const [period, setPeriod] = React.useState<StatisticsPeriod>("365d");
  const [deckSelection, setDeckSelection] = React.useState<StatisticsDeckSelection>("all");
  const [isPending, startTransition] = React.useTransition();
  const index = React.useMemo(() => createStatisticsIndex(decks), [decks]);
  const statistics = React.useMemo(() => projectStatistics(index, { period, deckIds: deckSelection, now, timeZone }), [deckSelection, index, now, period, timeZone]);
  const showDeckComparison = deckSelection === "all" || statistics.scopeDeckIds.length > 1;

  React.useEffect(() => {
    if (deckSelection === "all") return;
    const existing = deckSelection.filter((id) => index.deckById.has(id));
    if (existing.length !== deckSelection.length) setDeckSelection(existing.length > 0 ? existing : "all");
  }, [deckSelection, index]);

  function changePeriod(value: StatisticsPeriod) {
    startTransition(() => setPeriod(value));
  }
  function changeDecks(value: StatisticsDeckSelection) {
    startTransition(() => setDeckSelection(value));
  }

  if (decks.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Lernanalyse" title="Statistik" />
        <EmptyState icon={BarChart3} title="Noch keine Statistik verfügbar" body="Erstelle oder importiere zuerst einen Stapel. Sobald Karten vorhanden sind, zeigt CoRe Planung, FSRS-Zustand und Lernverlauf." action={<ActionButton variant="primary" onClick={() => onNavigate("neue-karten")}>Stapel erstellen</ActionButton>} />
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-8 overflow-x-hidden" aria-busy={isPending || undefined}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <PageHeader eyebrow="Lernanalyse" title="Statistik" />
        <p className="core-body text-core-muted">{statistics.dateRangeLabel}</p>
      </div>

      <SoftPanel className="sticky top-3 z-30 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="core-control-label text-core-muted">Globaler Zeitraum</p>
            <div role="group" className="mt-2 grid min-h-11 grid-cols-4 overflow-hidden rounded-xl border border-[var(--core-border)] bg-core-subtle" aria-label="Statistikzeitraum">
              {PERIOD_OPTIONS.map((option) => (
                <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => changePeriod(option.value)} className={`min-w-0 px-3 core-status-label transition-colors ${period === option.value ? "bg-core-action text-[var(--core-text-on-accent)]" : "text-core-secondary hover:bg-core-surface"}`}>{option.label}</button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <p className="core-control-label text-core-muted">Stapel</p>
            <div className="mt-2"><DeckMultiSelect decks={decks} value={deckSelection} scopeLabel={statistics.scopeLabel} onChange={changeDecks} /></div>
          </div>
        </div>
        <p className="core-caption mt-3 text-core-muted">Alle historischen Diagramme verwenden denselben Zeitraum und dieselbe Stapelauswahl. Unterstapel sind automatisch eingeschlossen.</p>
      </SoftPanel>

      <section aria-labelledby="statistics-overview-title">
        <div className="mb-4 flex items-center gap-3"><Activity size={20} className="text-core-action" aria-hidden="true" /><h2 id="statistics-overview-title" className="core-heading-2 text-core-text">Überblick</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={Activity} label="Wiederholungen" value={formatNumber(statistics.summary.reviewCount)} hint={`${formatNumber(statistics.summary.averagePerActiveDay, 1)} pro aktivem Tag`} />
          <StatTile icon={Target} label="Erfolgsquote" value={formatPercent(statistics.summary.successPercent)} hint="Schwer, Gut oder Einfach" accent="text-core-success" />
          <StatTile icon={BrainCircuit} label="Wahre Erinnerungsquote" value={statistics.summary.trueRetentionSample > 0 ? formatPercent(statistics.summary.trueRetentionPercent) : "–"} hint={`${formatNumber(statistics.summary.trueRetentionSample)} geeignete Reviews`} accent="text-core-warning" />
          <StatTile icon={Timer} label="Gemessene Lernzeit" value={formatDuration(statistics.summary.totalDurationMs)} hint={statistics.summary.timedCount > 0 ? `${formatPercent(statistics.summary.timingCoveragePercent)} Zeitabdeckung` : "Messung beginnt mit der nächsten Wiederholung"} />
          <StatTile icon={Clock3} label="Zeit pro Antwort" value={statistics.summary.timedCount > 0 ? formatDuration(statistics.summary.averageResponseMs) : "–"} hint={`${formatNumber(statistics.summary.timedCount)} gemessene Antworten`} />
          <StatTile icon={CalendarDays} label="Aktive Lerntage" value={formatNumber(statistics.summary.activeDays)} hint={statistics.periodLabel} />
          <StatTile icon={Flame} label="Aktuelle Serie" value={`${formatNumber(statistics.summary.currentStreak)} Tage`} hint={`Längste: ${formatNumber(statistics.summary.longestStreak)} Tage`} accent="text-core-warning" />
          <StatTile icon={Layers3} label="Auswertung" value={statistics.scopeLabel} hint={statistics.periodLabel} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Lernaktivität">
        <ChartPanel title="Wiederholungen" description="Durchgeführte Reviews nach Zustand vor der Antwort, einschließlich kumuliertem Verlauf." className="xl:col-span-2"><ActivityChart points={statistics.activity} /></ChartPanel>
        <ChartPanel title="Lernzeit" description={`Gemessene Antwortzeit; verfügbar für ${formatPercent(statistics.summary.timingCoveragePercent)} der Reviews.`}><ActivityChart points={statistics.activity} duration /></ChartPanel>
        <ChartPanel title="Hinzugefügte Karten" description="Neue Learning Items und kumulierter Bestand im gewählten Zeitraum."><AddedCardsChart points={statistics.addedCards} /></ChartPanel>
        <ChartPanel title="Lernkalender" description={statistics.calendarMode === "month" ? "Monatliche Aktivität über den gesamten Verlauf." : "Tägliche Aktivität; Details per Maus, Touch oder Tastatur."} className="xl:col-span-2"><CalendarHeatmap points={statistics.calendar} mode={statistics.calendarMode} /></ChartPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Planung und Kartenbestand">
        <ChartPanel title="Zeitplanung" description={`Fälligkeiten für ${statistics.periodLabel}; Rückstand ist im ersten Balken enthalten.`} className="xl:col-span-2"><PlanningChart planning={statistics.planning} /></ChartPanel>
        <ChartPanel title="Status" description="Aktuelle Verteilung aller planbaren Varianten der ausgewählten Stapel." snapshot><StatusChart status={statistics.status} /></ChartPanel>
        <ChartPanel title="Wiederholungsintervalle" description="Aktuelle Intervalle mit kumuliertem Anteil; der globale Zeitraum begrenzt die Anzeige." snapshot>
          <DistributionChart points={statistics.intervals.points} countLabel="Varianten" />
          <div className="mt-4 grid grid-cols-3 gap-3 text-center core-caption text-core-muted"><span>Mittelwert<br /><strong className="core-body text-core-text">{formatNumber(statistics.intervals.averageDays, 1)} Tage</strong></span><span>Median<br /><strong className="core-body text-core-text">{formatNumber(statistics.intervals.medianDays)} Tage</strong></span><span>95. Perzentil<br /><strong className="core-body text-core-text">{formatNumber(statistics.intervals.percentile95Days)} Tage</strong></span></div>
        </ChartPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-3" aria-label="FSRS-Gedächtnismodell">
        <ChartPanel title="FSRS-Schwierigkeit" description="Aktuelle Verteilung von 1 (leicht) bis 10 (schwer)." snapshot><DistributionChart points={statistics.fsrs.difficulty} countLabel="Varianten" /></ChartPanel>
        <ChartPanel title="FSRS-Stabilität" description="Geschätzte Gedächtnisstabilität in Tagen." snapshot><DistributionChart points={statistics.fsrs.stability} countLabel="Varianten" /></ChartPanel>
        <ChartPanel title="Abrufwahrscheinlichkeit" description={`${formatNumber(statistics.fsrs.estimatedRetainedKnowledge, 1)} geschätzte erinnerte Varianten von ${formatNumber(statistics.fsrs.eligibleVariants)} geeigneten.`} snapshot><DistributionChart points={statistics.fsrs.retrievability} countLabel="Varianten" /></ChartPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Antwortverhalten">
        <ChartPanel title="Nach Uhrzeit" description="Wiederholungen und Erfolgsquote je lokaler Stunde."><HourlyChart points={statistics.hourly} /></ChartPanel>
        <ChartPanel title="Antwortknöpfe" description="Nochmal, Schwer, Gut und Einfach nach Lernzustand."><RatingChart points={statistics.ratings} /></ChartPanel>
        <ChartPanel title="Wahre Erinnerungsquote" description="Erste geeignete Wiederholung jeder Variante pro Tag; mindestens ein Tag vorheriges Intervall." className="xl:col-span-2"><RetentionTable rows={statistics.retention} /></ChartPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2" aria-label="Detailauswertung">
        {showDeckComparison ? <ChartPanel title="Stapelvergleich" description="Direkter Vergleich innerhalb der globalen Auswahl." className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-left core-body">
              <thead><tr className="border-b border-[var(--core-border)] text-core-muted"><th className="px-3 py-3">Stapel</th><th className="px-3 py-3 text-right">Reviews</th><th className="px-3 py-3 text-right">Erfolg</th><th className="px-3 py-3 text-right">Nochmal</th><th className="px-3 py-3 text-right">Erinnerung</th><th className="px-3 py-3 text-right">Ø Intervall</th><th className="px-3 py-3 text-right">Nächste Fälligkeit</th></tr></thead>
              <tbody>{statistics.deckRows.map((row) => <tr key={row.id} className="border-b border-[var(--core-border)] last:border-0"><th className="px-3 py-3 font-semibold text-core-text"><span className="block">{row.name}</span><span className="core-caption font-normal text-core-muted">{row.path}</span></th><td className="px-3 py-3 text-right text-core-secondary">{formatNumber(row.reviewCount)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatPercent(row.successPercent)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatPercent(row.againPercent)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatPercent(row.trueRetentionPercent)}</td><td className="px-3 py-3 text-right text-core-secondary">{formatNumber(row.averageIntervalDays, 1)} T.</td><td className="px-3 py-3 text-right text-core-secondary">{formatDate(row.nextDueAt, timeZone)}</td></tr>)}</tbody>
            </table>
          </div>
        </ChartPanel> : null}

        <ChartPanel title="Schwierige Karten" description="Mindestens drei Reviews; sortiert nach Nochmal-/Schwer-Anteil." className="xl:col-span-2">
          {statistics.difficultCards.length === 0 ? <NoChartData>Für eine belastbare Rangliste sind noch nicht genügend Wiederholungen vorhanden.</NoChartData> : (
            <div className="grid gap-3 md:grid-cols-2">
              {statistics.difficultCards.map((card) => (
                <article key={card.learningItemId} className="rounded-xl border border-[var(--core-border)] bg-core-subtle p-4">
                  <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="core-caption text-core-muted">{card.deckName}</p><h4 className="core-body mt-1 line-clamp-2 font-semibold text-core-text">{card.title}</h4></div><span className="shrink-0 rounded-full bg-core-warning-soft px-2.5 py-1 core-status-label text-core-text">{formatPercent(card.weakPercent)}</span></div>
                  <p className="core-caption mt-3 text-core-muted">{formatNumber(card.weakCount)} von {formatNumber(card.reviewCount)} Antworten · zuletzt {formatDate(card.lastReviewedAt, timeZone)}</p>
                  <div className="mt-4 flex flex-wrap gap-2"><ActionButton variant="secondary" onClick={() => onStartDeck(card.deckId)}>Stapel lernen</ActionButton><ActionButton variant="secondary" onClick={() => onOpenCard(card.deckId, card.learningItemId)}>Karte öffnen</ActionButton></div>
                </article>
              ))}
            </div>
          )}
        </ChartPanel>
      </section>

      <p className="core-caption text-center text-core-muted">FSRS-Kennzahlen und aktuelle Bestandsverteilungen beziehen sich auf {statistics.scopeLabel} · Stand {formatDate(now, timeZone)}.</p>
    </div>
  );
}
