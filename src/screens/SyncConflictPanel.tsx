import React from "react";
import { AlertTriangle, GitMerge, RefreshCw, RotateCcw } from "lucide-react";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";

const FIELD_SOURCES = [["local", "Diese Fassung"], ["remote", "Andere Fassung"]];

function formatConflictDate(value: string|number|Date) {
  if (!value) return "Unbekannter Zeitpunkt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unbekannter Zeitpunkt" : date.toLocaleString("de-DE");
}

export function SyncConflictPanel({ onListConflicts, onResolveConflict }: any) {
  const mountedRef = React.useRef(true);
  const [conflicts, setConflicts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<any>(null);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [mergeConflictId, setMergeConflictId] = React.useState<any>(null);
  const [fieldChoices, setFieldChoices] = React.useState<Record<string | number, Record<string | number, string>>>({});

  const loadConflicts = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextConflicts = await onListConflicts?.() ?? [];
      if (mountedRef.current) setConflicts(nextConflicts);
    } catch (loadError) {
      if (mountedRef.current) setError(loadError instanceof Error ? loadError.message : "Konflikte konnten nicht geladen werden.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [onListConflicts]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  async function decide(conflict: any, decision: { action: any; fieldChoices?: any; }) {
    setBusyId(conflict.id);
    setError("");
    setMessage("");
    try {
      const result = await onResolveConflict?.(conflict.id, decision);
      setConflicts(result?.conflicts ?? await onListConflicts?.() ?? []);
      setMergeConflictId(null);
      setFieldChoices((current) => ({ ...current, [conflict.id]: {} }));
      setMessage(decision.action === "ignore" ? "Konflikt wurde für später zurückgestellt." : decision.action === "reopen" ? "Konflikt wurde wieder aufgenommen." : "Konfliktentscheidung wurde synchronisiert.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Konfliktentscheidung konnte nicht gespeichert werden.");
    } finally {
      setBusyId(null);
    }
  }

  function chooseField(conflictId: string|number, field: any, source: string) {
    setFieldChoices((current) => ({
      ...current,
      [conflictId]: { ...(current[conflictId] ?? {}), [field]: source },
    }));
  }

  const openConflicts = conflicts.filter((conflict) => conflict.status === "open");
  const ignoredConflicts = conflicts.filter((conflict) => conflict.status === "ignored");

  return (
    <SoftPanel className="p-6" data-testid="sync-conflict-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbIcon icon={AlertTriangle} className="bg-amber-50 text-amber-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Synchronisierung</p>
            <h3 className="text-xl font-semibold text-[#17214f]">Änderungskonflikte lösen</h3>
          </div>
        </div>
        <button type="button" onClick={loadConflicts} disabled={loading || Boolean(busyId)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
          <RefreshCw size={16} aria-hidden="true" />
          Neu laden
        </button>
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#66709a]">
        CoRe hat unterschiedliche Änderungen am selben Inhalt gefunden. Vergleiche beide Fassungen und entscheide, welcher Inhalt weiterverwendet wird.
      </p>

      {loading ? <p className="mt-5 text-sm text-[#66709a]" role="status">Konflikte werden geladen.</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status" aria-live="polite">{message}</p> : null}
      {!loading && conflicts.length === 0 ? <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">Keine offenen Synchronisierungskonflikte.</p> : null}

      <div className="mt-5 grid gap-4">
        {openConflicts.map((conflict) => {
          const choices = fieldChoices[conflict.id] ?? {};
          const allFieldsChosen = conflict.fields.length > 0 && conflict.fields.every((field: { key: string|number; }) => choices[field.key] === "local" || choices[field.key] === "remote");
          const merging = mergeConflictId === conflict.id;
          const busy = busyId === conflict.id;
          return (
            <article key={conflict.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4" data-testid={`sync-conflict-${conflict.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{conflict.entityLabel}</p>
                  <h4 className="mt-1 text-base font-semibold text-[#17214f]">{conflict.title}</h4>
                  <p className="mt-1 text-xs text-[#66709a]">Erkannt am {formatConflictDate(conflict.createdAt)}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Entscheidung nötig</span>
              </div>

              {conflict.fields.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {conflict.fields.map((field: { key: React.Key|null|undefined; label: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; localText: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; remoteText: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; }) => (
                    <div key={field.key} className="rounded-xl border border-[#e3e7f5] bg-white p-3">
                      <p className="text-sm font-semibold text-[#4e5b8c]">{field.label}</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div className="min-w-0 rounded-lg bg-[#f8f9fe] p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Diese Fassung</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-[#17214f]">{field.localText}</pre>
                        </div>
                        <div className="min-w-0 rounded-lg bg-[#f8f9fe] p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Andere Fassung</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-[#17214f]">{field.remoteText}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-[#66709a]">Eine Seite wurde gelöscht oder ist nicht mehr vorhanden.</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "keep-local" })} className="min-h-10 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white disabled:bg-slate-300">Diese Fassung behalten</button>
                <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "keep-remote" })} className="min-h-10 rounded-xl border border-[#cfd5ec] bg-white px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">Andere Fassung behalten</button>
                {conflict.allowedActions.includes("merge-fields") ? (
                  <button type="button" disabled={busy} aria-expanded={merging} onClick={() => setMergeConflictId(merging ? null : conflict.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cfd5ec] bg-white px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
                    <GitMerge size={16} aria-hidden="true" />
                    Manuell zusammenführen
                  </button>
                ) : null}
                <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "ignore" })} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-[#66709a] disabled:text-slate-400">Später entscheiden</button>
              </div>

              {merging ? (
                <fieldset className="mt-4 rounded-xl border border-[#cfd5ec] bg-white p-4">
                  <legend className="px-1 text-sm font-semibold text-[#17214f]">Quelle für jedes Feld wählen</legend>
                  <div className="grid gap-3">
                    {conflict.fields.map((field: any) => (
                      <div key={field.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f8] pb-3 last:border-0 last:pb-0">
                        <span className="text-sm font-semibold text-[#4e5b8c]">{field.label}</span>
                        <div className="flex gap-4">
                          {FIELD_SOURCES.map(([source, label]: any) => (
                            <label key={source} className="inline-flex min-h-10 items-center gap-2 text-sm text-[#4e5b8c]">
                              <input type="radio" name={`${conflict.id}-${field.key}`} checked={choices[field.key] === source} onChange={() => chooseField(conflict.id, field.key, source)} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" disabled={busy || !allFieldsChosen} onClick={() => decide(conflict, { action: "merge-fields", fieldChoices: choices })} className="mt-4 min-h-10 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white disabled:bg-slate-300">Zusammenführung speichern</button>
                </fieldset>
              ) : null}
            </article>
          );
        })}
      </div>

      {ignoredConflicts.length > 0 ? (
        <details className="mt-5 rounded-2xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#4e5b8c]">Für später zurückgestellt ({ignoredConflicts.length})</summary>
          <p className="mt-3 text-sm leading-6 text-[#66709a]">Stapel- und Kartenänderungen werden erst weiter synchronisiert, wenn diese Konflikte entschieden sind. Neue Reviews werden weiterhin gespeichert.</p>
          <div className="mt-3 grid gap-2">
            {ignoredConflicts.map((conflict) => (
              <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                <div>
                  <p className="text-sm font-semibold text-[#17214f]">{conflict.entityLabel}: {conflict.title}</p>
                </div>
                <button type="button" disabled={busyId === conflict.id} onClick={() => decide(conflict, { action: "reopen" })} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#cfd5ec] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
                  <RotateCcw size={16} aria-hidden="true" />
                  Wieder aufnehmen
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </SoftPanel>
  );
}
