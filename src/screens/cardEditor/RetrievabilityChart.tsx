import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RetrievabilityPoint } from "./retrievabilityCurve.ts";

// The statistics charts' look: muted 11 px axis labels, dashed horizontal grid, lightly filled area, overlay tooltip.
const axisTick = { fill: "var(--core-text-muted)", fontSize: 11 };
const monthYear = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const dayTime = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const percent = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: RetrievabilityPoint }> }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div role="tooltip" className="core-overlay min-w-44 rounded-control border border-core-border bg-core-surface p-3 shadow-raised">
      <p className="core-body font-semibold text-core-text">{dayTime.format(point.at)}</p>
      <div className="mt-2 flex items-center justify-between gap-4 core-caption">
        <span className="text-core-secondary">{point.forgotten ? "Vor „Nochmal“" : "Abrufwahrscheinlichkeit"}</span>
        <span className="font-semibold text-core-text">{percent.format(point.percent)} %</span>
      </div>
    </div>
  );
}

function ForgottenDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: RetrievabilityPoint }) {
  if (!payload?.forgotten || cx === undefined || cy === undefined) return <g />;
  return <circle cx={cx} cy={cy} r={4} fill="var(--core-danger)" stroke="var(--core-surface)" strokeWidth={1.5} />;
}

/** Retrievability over time with the target line, like the editor draft of round 3 (specs §5.3 `Lernen`). */
export function RetrievabilityChart({ points, targetPercent, now }: { points: readonly RetrievabilityPoint[]; targetPercent: number; now: number }) {
  const first = points[0].at;
  const target = Math.round(targetPercent);
  // The axis starts just below the curve and the target, so the decay fills the plot.
  const floor = Math.floor(Math.min(target - 5, ...points.map((point) => point.percent)) / 10) * 10;
  const current = points.at(-1)!.percent;
  const forgotten = points.filter((point) => point.forgotten).length;
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label={`Abrufwahrscheinlichkeit heute ${percent.format(current)} %, Ziel ${target} %${forgotten ? `, ${forgotten}-mal vergessen` : ""}`}
      data-testid="card-retrievability-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points as RetrievabilityPoint[]} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--core-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="at"
            type="number"
            scale="time"
            domain={[first, now]}
            ticks={[first, now]}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: "var(--core-border)" }}
            tickFormatter={(value: number) => value >= now ? "heute" : monthYear.format(value)}
          />
          <YAxis
            type="number"
            domain={[floor, 100]}
            ticks={[floor, target, 100]}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={68}
            tickFormatter={(value: number) => value === target ? `Ziel ${value} %` : `${value} %`}
          />
          <ReferenceLine y={target} stroke="var(--core-text-muted)" strokeDasharray="4 4" />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--core-border-interactive)" }} />
          <Area type="linear" dataKey="percent" baseValue={floor} stroke="var(--core-action-primary)" strokeWidth={2} fill="var(--core-action-primary)" fillOpacity={0.08} dot={<ForgottenDot />} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
