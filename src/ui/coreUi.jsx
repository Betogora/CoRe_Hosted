import React from "react";

export function SoftPanel({ children, className = "", ...props }) {
  return (
    <section {...props} className={`core-surface-raised min-w-0 rounded-[18px] ${className}`}>
      {children}
    </section>
  );
}

export function OrbIcon({ icon: Icon, className = "bg-[#eceefd] text-[#6672bf]" }) {
  return (
    <div className={`grid size-12 shrink-0 place-items-center rounded-full ${className}`}>
      <Icon size={22} aria-hidden="true" />
    </div>
  );
}

export function MiniProgress({ value = 0 }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[#e8ecf8]">
      <div className="h-full rounded-full bg-gradient-to-r from-[#6fb7ae] via-[#7d89d9] to-[#596bc4]" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

export function DonutValue({ value }) {
  return (
    <div
      className="grid size-10 place-items-center rounded-full"
      style={{ background: `conic-gradient(#6c78cf ${value * 3.6}deg, #e9edf8 0deg)` }}
      aria-label={`${value} Prozent`}
    >
      <span className="block size-7 rounded-full bg-white" />
    </div>
  );
}

export function StatTile({ icon: Icon, label, value, hint, accent = "text-[#6672bf]" }) {
  return (
    <SoftPanel className="p-6">
      {Icon ? <OrbIcon icon={Icon} className={`bg-[#eef1fb] ${accent}`} /> : null}
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#66709a]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#17214f]">{value}</p>
      {hint ? <p className="mt-1 text-sm leading-6 text-[#66709a]">{hint}</p> : null}
    </SoftPanel>
  );
}

export function PageHeader({ eyebrow, title, body, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">{eyebrow}</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#17214f]">{title}</h2>
        {body ? <p className="mt-3 text-lg leading-7 text-[#66709a]">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <SoftPanel className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <OrbIcon icon={Icon} />
          <div>
            <h3 className="text-xl font-semibold text-[#17214f]">{title}</h3>
            {body ? <p className="mt-1 text-[#66709a]">{body}</p> : null}
          </div>
        </div>
        {action}
      </div>
    </SoftPanel>
  );
}

export function CoreModeControl({ value, onChange }) {
  const modes = [
    { value: "off", label: "Aus" },
    { value: "auto", label: "Auto" },
    { value: "manual", label: "Manuell" },
  ];

  return (
    <div className="inline-grid min-h-10 grid-cols-3 overflow-hidden rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] text-xs font-semibold text-[#596489]">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onChange(mode.value)}
          className={`px-3 transition ${value === mode.value ? "bg-[#4f5eb1] text-white" : "hover:bg-white"}`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
