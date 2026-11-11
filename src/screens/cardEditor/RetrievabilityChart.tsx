import React from "react";
import type { RetrievabilityPoint } from "./retrievabilityCurve.ts";

// The statistics charts' look: muted 11 px axis labels, dashed horizontal grid, lightly filled area, overlay tooltip.
const monthYear = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const dayTime = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const percent = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

// Plot area inside the 224 px high chart: y-axis labels on the left, x-axis labels below.
const PLOT = { left: 68, right: 12, top: 8, bottom: 34 };
const PLOT_HEIGHT = 224 - PLOT.top - PLOT.bottom;
const TOOLTIP_OFFSET = 10;
const axisText = { fill: "var(--core-text-muted)", fontSize: 11 };

interface Active { index: number; x: number; y: number }

/** Retrievability over time with the target line, like the editor draft of round 3 (specs.md#editor-reiter-lernen). */
export function RetrievabilityChart({ points, targetPercent, now }: { points: readonly RetrievabilityPoint[]; targetPercent: number; now: number }) {
  const first = points[0].at;
  const target = Math.round(targetPercent);
  // The axis starts just below the curve and the target, so the decay fills the plot.
  const floor = Math.floor(Math.min(target - 5, ...points.map((point) => point.percent)) / 10) * 10;
  const current = points.at(-1)!.percent;
  const forgotten = points.filter((point) => point.forgotten).length;
  const xShare = (at: number) => (at - first) / Math.max(now - first, 1);
  const yShare = (value: number) => (100 - value) / (100 - floor);
  const [active, setActive] = React.useState<Active | null>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  // Like the statistics charts, the tooltip sits beside the pointer and flips inside the plot area when it would overflow.
  React.useLayoutEffect(() => {
    const tooltip = tooltipRef.current, plot = plotRef.current;
    if (!active || !tooltip || !plot) return;
    const right = PLOT.left + plot.clientWidth, bottom = PLOT.top + PLOT_HEIGHT;
    const x = active.x + TOOLTIP_OFFSET + tooltip.offsetWidth > right ? Math.max(active.x - TOOLTIP_OFFSET - tooltip.offsetWidth, PLOT.left) : active.x + TOOLTIP_OFFSET;
    const y = active.y + TOOLTIP_OFFSET + tooltip.offsetHeight > bottom ? Math.max(active.y - TOOLTIP_OFFSET - tooltip.offsetHeight, PLOT.top) : active.y + TOOLTIP_OFFSET;
    tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }, [active]);

  const pointAnchor = (index: number): Active => ({
    index,
    x: PLOT.left + xShare(points[index].at) * (plotRef.current?.clientWidth ?? 0),
    y: PLOT.top + yShare(points[index].percent) * PLOT_HEIGHT,
  });
  const showNearest = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = first + (event.clientX - box.left) / box.width * (now - first);
    let index = 0;
    for (let next = 1; next < points.length; next += 1) if (Math.abs(points[next].at - at) < Math.abs(points[index].at - at)) index = next;
    setActive({ index, x: PLOT.left + event.clientX - box.left, y: PLOT.top + event.clientY - box.top });
  };
  const step = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = (active?.index ?? 0) + (event.key === "ArrowRight" ? 1 : -1);
    setActive(pointAnchor(Math.min(Math.max(index, 0), points.length - 1)));
  };

  const path = points.map((point, index) => `${index ? "L" : "M"}${(xShare(point.at) * 1000).toFixed(1)},${(yShare(point.percent) * 1000).toFixed(1)}`).join("");
  const activePoint = active ? points[active.index] : null;
  const ticks = [...new Set([floor, target, 100])];
  const y = (value: number) => `${yShare(value) * 100}%`;
  const x = (point: RetrievabilityPoint) => `${xShare(point.at) * 100}%`;
  return (
    <div
      className="relative h-56 w-full"
      role="img"
      aria-label={`Abrufwahrscheinlichkeit heute ${percent.format(current)} %, Ziel ${target} %${forgotten ? `, ${forgotten}-mal vergessen` : ""}`}
      data-testid="card-retrievability-chart"
      tabIndex={0}
      onKeyDown={step}
      onBlur={() => setActive(null)}
    >
      <svg className="absolute inset-0 size-full overflow-visible">
        {ticks.map((value) => (
          <text key={value} {...axisText} x={PLOT.left - 8} y={PLOT.top + yShare(value) * PLOT_HEIGHT} dy="0.355em" textAnchor="end">
            {value === target ? `Ziel ${value} %` : `${value} %`}
          </text>
        ))}
        <text {...axisText} x={PLOT.left} y={PLOT.top + PLOT_HEIGHT + 8} dy="0.71em" textAnchor="middle">{first >= now ? "heute" : monthYear.format(first)}</text>
        <text {...axisText} x="100%" y={PLOT.top + PLOT_HEIGHT + 8} dy="0.71em" textAnchor="end">heute</text>
      </svg>
      <div
        ref={plotRef}
        className="absolute"
        style={{ left: PLOT.left, right: PLOT.right, top: PLOT.top, height: PLOT_HEIGHT }}
        onPointerMove={showNearest}
        onPointerLeave={() => setActive(null)}
      >
        <svg className="absolute inset-0 size-full overflow-visible">
          {ticks.map((value) => <line key={value} x1="0" x2="100%" y1={y(value)} y2={y(value)} stroke="var(--core-border)" strokeDasharray="3 3" />)}
        </svg>
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <path d={`${path}L${(xShare(points.at(-1)!.at) * 1000).toFixed(1)},1000L${(xShare(first) * 1000).toFixed(1)},1000Z`} fill="var(--core-action-primary)" fillOpacity={0.08} />
          <path d={path} fill="none" stroke="var(--core-action-primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <svg className="absolute inset-0 size-full overflow-visible">
          <line x1="0" x2="100%" y1={y(target)} y2={y(target)} stroke="var(--core-text-muted)" strokeDasharray="4 4" />
          <line x1="0" x2="100%" y1="100%" y2="100%" stroke="var(--core-border)" />
          {activePoint ? <line x1={x(activePoint)} x2={x(activePoint)} y1="0" y2="100%" stroke="var(--core-border-interactive)" /> : null}
          {points.map((point) => point.forgotten ? <circle key={point.at} cx={x(point)} cy={y(point.percent)} r={4} fill="var(--core-danger)" stroke="var(--core-surface)" strokeWidth={1.5} /> : null)}
          {activePoint ? <circle cx={x(activePoint)} cy={y(activePoint.percent)} r={4} fill="var(--core-action-primary)" stroke="var(--core-surface)" strokeWidth={2} /> : null}
        </svg>
      </div>
      {activePoint ? (
        <div ref={tooltipRef} className="pointer-events-none absolute left-0 top-0">
          <div role="tooltip" className="core-overlay min-w-44 rounded-control border border-core-border bg-core-surface p-3 shadow-raised">
            <p className="core-body font-semibold text-core-text">{dayTime.format(activePoint.at)}</p>
            <div className="mt-2 flex items-center justify-between gap-4 core-caption">
              <span className="text-core-secondary">{activePoint.forgotten ? "Vor „Nochmal“" : "Abrufwahrscheinlichkeit"}</span>
              <span className="font-semibold text-core-text">{percent.format(activePoint.percent)} %</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
