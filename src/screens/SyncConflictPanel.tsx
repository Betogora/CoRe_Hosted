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
  const refreshButtonRef = React.useRef<HTMLButtonElement | null>(null);
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
      window.requestAnimationFrame(() => refreshButtonRef.current?.focus());
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

  function toggleMerge(conflictId: string | number) {
    const opening = mergeConflictId !== conflictId;
    setMergeConflictId(opening ? conflictId : null);
    window.requestAnimationFrame(() => {
      const target = opening
        ? document.querySelector<HTMLElement>(`[data-testid="sync-conflict-${conflictId}"] input[type="radio"]`)
        : document.querySelector<HTMLElement>(`[data-testid="sync-conflict-merge-${conflictId}"]`);
      target?.focus();
    });
  }

  const openConflicts = conflicts.filter((conflict) => conflict.status === "open");
  const ignoredConflicts = conflicts.filter((conflict) => conflict.status === "ignored");

  return (
    <SoftPanel className="p-6" data-testid="sync-conflict-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbIcon icon={AlertTriangle} className="bg-core-warning-soft text-core-text" />
          <div>
            <p className="core-body font-semibold uppercase tracking-wide text-core-text">Synchronisierung</p>
            <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Änderungskonflikte lösen</h3>
          </div>
        </div>
        <button ref={refreshButtonRef} type="button" onClick={loadConflicts} disabled={loading || Boolean(busyId)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] px-4 core-body font-semibold text-[var(--core-action-primary)] disabled:text-[var(--core-action-disabled-text)]">
          <RefreshCw size={16} aria-hidden="true" />
          Neu laden
        </button>
      </div>

      <p className="mt-3 max-w-3xl core-body leading-6 text-[var(--core-text-muted)]">
        CoRe hat unterschiedliche Änderungen am selben Inhalt gefunden. Vergleiche beide Fassungen und entscheide, welcher Inhalt weiterverwendet wird.
      </p>

      {loading ? <p className="mt-5 core-body text-[var(--core-text-muted)]" role="status">Konflikte werden geladen.</p> : null}
      {error ? <p className="core-status-error mt-4 core-body" role="alert">{error}</p> : null}
      {message ? <p className="core-status-success mt-4 core-body" role="status">{message}</p> : null}
      {!loading && conflicts.length === 0 ? <p className="core-status-success mt-5 core-body">Keine offenen Synchronisierungskonflikte.</p> : null}

      <div className="mt-5 grid gap-4">
        {openConflicts.map((conflict) => {
          const choices = fieldChoices[conflict.id] ?? {};
          const allFieldsChosen = conflict.fields.length > 0 && conflict.fields.every((field: { key: string|number; }) => choices[field.key] === "local" || choices[field.key] === "remote");
          const merging = mergeConflictId === conflict.id;
          const busy = busyId === conflict.id;
          return (
            <article key={conflict.id} className="rounded-2xl border border-core-warning bg-core-warning-soft p-4" data-testid={`sync-conflict-${conflict.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="core-caption font-semibold uppercase tracking-wide text-core-text">{conflict.entityLabel}</p>
                  <h4 className="mt-1 core-body-large font-semibold text-[var(--core-text)]">{conflict.title}</h4>
                  <p className="mt-1 core-caption text-[var(--core-text-muted)]">Erkannt am {formatConflictDate(conflict.createdAt)}</p>
                </div>
                <span className="rounded-full bg-core-warning-soft px-3 py-1 core-caption font-semibold text-core-text">Entscheidung nötig</span>
              </div>

              {conflict.fields.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {conflict.fields.map((field: { key: React.Key|null|undefined; label: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; localText: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; remoteText: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; }) => (
                    <div key={field.key} className="rounded-xl border border-[var(--core-border)] bg-core-surface p-3">
                      <p className="core-body font-semibold text-[var(--core-text-secondary)]">{field.label}</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div className="min-w-0 rounded-lg bg-[var(--core-surface-muted)] p-3">
                          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Diese Fassung</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans core-body text-[var(--core-text)]">{field.localText}</pre>
                        </div>
                        <div className="min-w-0 rounded-lg bg-[var(--core-surface-muted)] p-3">
                          <p className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Andere Fassung</p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans core-body text-[var(--core-text)]">{field.remoteText}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 core-body text-[var(--core-text-muted)]">Eine Seite wurde gelöscht oder ist nicht mehr vorhanden.</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "keep-local" })} className="min-h-11 rounded-xl bg-[var(--core-action-primary)] px-4 core-body font-semibold text-[var(--core-text-on-accent)] disabled:bg-[var(--core-action-disabled-bg)]" aria-label={`${conflict.title}: Diese Fassung behalten`}>Diese Fassung behalten</button>
                <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "keep-remote" })} className="min-h-11 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)] disabled:text-[var(--core-action-disabled-text)]" aria-label={`${conflict.title}: Andere Fassung behalten`}>Andere Fassung behalten</button>
                {conflict.allowedActions.includes("merge-fields") ? (
                  <button type="button" disabled={busy} aria-expanded={merging} aria-controls={`sync-conflict-merge-fields-${conflict.id}`} onClick={() => toggleMerge(conflict.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 core-body font-semibold text-[var(--core-action-primary)] disabled:text-[var(--core-action-disabled-text)]" data-testid={`sync-conflict-merge-${conflict.id}`}>
                    <GitMerge size={16} aria-hidden="true" />
                    Manuell zusammenführen
                  </button>
                ) : null}
                <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "ignore" })} className="min-h-11 rounded-xl px-4 core-body font-semibold text-[var(--core-text-muted)] disabled:text-[var(--core-action-disabled-text)]" aria-label={`${conflict.title}: Später entscheiden`}>Später entscheiden</button>
              </div>

              {merging ? (
                <fieldset id={`sync-conflict-merge-fields-${conflict.id}`} className="mt-4 rounded-xl border border-[var(--core-border)] bg-core-surface p-4">
                  <legend className="px-1 core-body font-semibold text-[var(--core-text)]">Quelle für jedes Feld wählen</legend>
                  <div className="grid gap-3">
                    {conflict.fields.map((field: any) => (
                      <div key={field.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--core-surface-muted)] pb-3 last:border-0 last:pb-0">
                        <span className="core-body font-semibold text-[var(--core-text-secondary)]">{field.label}</span>
                        <div className="flex gap-4">
                          {FIELD_SOURCES.map(([source, label]: any) => (
                            <label key={source} className="inline-flex min-h-11 items-center gap-2 core-body text-[var(--core-text-secondary)]">
                              <input type="radio" name={`${conflict.id}-${field.key}`} checked={choices[field.key] === source} onChange={() => chooseField(conflict.id, field.key, source)} aria-label={`${field.label}: ${label}`} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" disabled={busy || !allFieldsChosen} onClick={() => decide(conflict, { action: "merge-fields", fieldChoices: choices })} className="mt-4 min-h-11 rounded-xl bg-[var(--core-action-primary)] px-4 core-body font-semibold text-[var(--core-text-on-accent)] disabled:bg-[var(--core-action-disabled-bg)]">Zusammenführung speichern</button>
                </fieldset>
              ) : null}
            </article>
          );
        })}
      </div>

      {ignoredConflicts.length > 0 ? (
        <details className="mt-5 rounded-2xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-4">
          <summary className="cursor-pointer core-body font-semibold text-[var(--core-text-secondary)]">Für später zurückgestellt ({ignoredConflicts.length})</summary>
          <p className="mt-3 core-body leading-6 text-[var(--core-text-muted)]">Stapel- und Kartenänderungen werden erst weiter synchronisiert, wenn diese Konflikte entschieden sind. Neue Reviews werden weiterhin gespeichert.</p>
          <div className="mt-3 grid gap-2">
            {ignoredConflicts.map((conflict) => (
              <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-core-surface p-3">
                <div>
                  <p className="core-body font-semibold text-[var(--core-text)]">{conflict.entityLabel}: {conflict.title}</p>
                </div>
                <button type="button" disabled={busyId === conflict.id} onClick={() => decide(conflict, { action: "reopen" })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] px-4 core-body font-semibold text-[var(--core-action-primary)] disabled:text-[var(--core-action-disabled-text)]">
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
