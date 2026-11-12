import React from "react";
import { CheckCircle2, GitMerge, RefreshCw, RotateCcw } from "lucide-react";
import { CoreTag } from "../ui/coreUi.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";

const FIELD_SOURCES = [["local", "Dieser Browser"], ["remote", "Cloud im Account"]];
const PREVIEW_TABLE_LABELS: Record<string, string> = { decks: "Stapel", cards: "Karten", card_variants: "Varianten" };

export function createConflictImpactPreview(conflicts: any[], direction: "local" | "cloud") {
  const counts: Record<string, { add: number; update: number; delete: number }> = {};
  for (const conflict of conflicts.filter((item) => item.status === "open")) {
    const sourcePresent = direction === "local" ? conflict.localPresent : conflict.remotePresent;
    const targetPresent = direction === "local" ? conflict.remotePresent : conflict.localPresent;
    const bucket = counts[conflict.entityTable] ?? { add: 0, update: 0, delete: 0 };
    if (sourcePresent && !targetPresent) bucket.add += 1;
    else if (!sourcePresent && targetPresent) bucket.delete += 1;
    else bucket.update += 1;
    counts[conflict.entityTable] = bucket;
  }
  return {
    counts,
    conflictIds: conflicts.filter((item) => item.status === "open").map((item) => item.id),
    version: conflicts.filter((item) => item.status === "open").map((item) => `${item.id}:${item.remoteRevision ?? "missing"}`).sort().join("|"),
  };
}

function previewText(preview: ReturnType<typeof createConflictImpactPreview>) {
  const parts = Object.entries(preview.counts).flatMap(([table, count]) => {
    const label = PREVIEW_TABLE_LABELS[table] ?? "Inhalte";
    return [count.add ? `${count.add} ${label} hinzufügen` : "", count.update ? `${count.update} ${label} aktualisieren` : "", count.delete ? `${count.delete} ${label} entfernen` : ""].filter(Boolean);
  });
  return parts.join(" · ") || "Keine Inhaltsänderungen";
}

function formatConflictDate(value: string|number|Date) {
  if (!value) return "Unbekannter Zeitpunkt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unbekannter Zeitpunkt" : date.toLocaleString("de-DE");
}

export function SyncConflictPanel({ id, onListConflicts, onResolveConflict }: any) {
  const mountedRef = React.useRef(true);
  const refreshButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [conflicts, setConflicts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<any>(null);
  const [error, setError] = React.useState("");
  const setSuccessToast = useSuccessToast();
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
    setSuccessToast("");
    try {
      const result = await onResolveConflict?.(conflict.id, decision);
      setConflicts(result?.conflicts ?? await onListConflicts?.() ?? []);
      setMergeConflictId(null);
      setFieldChoices((current) => ({ ...current, [conflict.id]: {} }));
      setSuccessToast(decision.action === "ignore" ? "Konflikt wurde für später zurückgestellt." : decision.action === "reopen" ? "Konflikt wurde wieder aufgenommen." : "Konfliktentscheidung wurde synchronisiert.");
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
  const localPreview = createConflictImpactPreview(openConflicts, "local");
  const cloudPreview = createConflictImpactPreview(openConflicts, "cloud");

  async function resolveAll(direction: "local" | "cloud") {
    const preview = direction === "local" ? localPreview : cloudPreview;
    setBusyId(`all-${direction}`);
    setError("");
    try {
      const fresh = await onListConflicts?.({ refreshRemote: true }) ?? [];
      const freshPreview = createConflictImpactPreview(fresh, direction);
      if (freshPreview.version !== preview.version) {
        setConflicts(fresh);
        throw new Error("Der Cloud-Stand hat sich geändert. Die Vorschau wurde neu berechnet; es wurde nichts angewendet.");
      }
      let remaining = fresh;
      for (const conflictId of preview.conflictIds) {
        const result = await onResolveConflict?.(conflictId, { action: direction === "local" ? "keep-local" : "keep-remote" });
        remaining = result?.conflicts ?? remaining.filter((conflict: any) => conflict.id !== conflictId);
      }
      setConflicts(remaining);
      setSuccessToast(direction === "local" ? "Der Stand dieses Browsers wurde für die Konflikte übernommen." : "Der Cloud-Stand wurde für die Konflikte übernommen.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Konfliktentscheidung konnte nicht gespeichert werden.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id={id} aria-labelledby={id ? `${id}-heading` : undefined} className="core-settings-group" data-testid="sync-conflict-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={id ? `${id}-heading` : undefined} tabIndex={id ? -1 : undefined} className="core-heading-3 text-core-text outline-none">Änderungskonflikte lösen</h3>
        <button ref={refreshButtonRef} type="button" onClick={loadConflicts} disabled={loading || Boolean(busyId)} className="core-action-secondary">
          <RefreshCw size={16} aria-hidden="true" />
          Neu laden
        </button>
      </div>
      <p className="core-settings-row-hint">Derselbe Inhalt wurde an zwei Stellen unterschiedlich geändert. Wähle, welche Fassung gilt.</p>

      {loading ? <p className="core-body text-core-muted" role="status">Konflikte werden geladen.</p> : null}
      {error ? <p className="core-status-error core-body" role="alert">{error}</p> : null}
      {!loading && conflicts.length === 0 ? (
        <p className="flex min-h-control items-center gap-2 core-body text-core-secondary">
          <CheckCircle2 className="shrink-0 text-core-success" size={16} aria-hidden="true" />
          Keine offenen Synchronisierungskonflikte.
        </p>
      ) : null}

      {openConflicts.length > 0 ? (
        <div className="core-settings-list">
          <div className="core-settings-row">
            <div className="core-settings-row-text">
              <span className="core-settings-row-title">Cloud im Account übernehmen</span>
              <p className="core-settings-row-hint">{previewText(cloudPreview)} · Konfliktfreie Inhalte, Reviews und Medien bleiben erhalten.</p>
            </div>
            <div className="core-settings-row-control">
              <button type="button" className="core-action-secondary" disabled={Boolean(busyId)} onClick={() => void resolveAll("cloud")}>Cloud-Stand für diese Konflikte übernehmen</button>
            </div>
          </div>
          <div className="core-settings-row">
            <div className="core-settings-row-text">
              <span className="core-settings-row-title">Diesen Browser übernehmen</span>
              <p className="core-settings-row-hint">{previewText(localPreview)} · Konfliktfreie Inhalte, Reviews und Medien bleiben erhalten.</p>
            </div>
            <div className="core-settings-row-control">
              <button type="button" className="core-action-primary" disabled={Boolean(busyId)} onClick={() => void resolveAll("local")}>Lokalen Stand für diese Konflikte übernehmen</button>
            </div>
          </div>
        </div>
      ) : null}

      {openConflicts.length > 0 ? (
        <section className="core-settings-group" aria-labelledby="individual-sync-conflicts-heading">
          <h4 id="individual-sync-conflicts-heading" className="core-heading-3 text-core-text">Einzelne Konflikte prüfen ({openConflicts.length})</h4>
          <div className="core-settings-list">
            {openConflicts.map((conflict) => {
              const choices = fieldChoices[conflict.id] ?? {};
              const allFieldsChosen = conflict.fields.length > 0 && conflict.fields.every((field: { key: string | number }) => choices[field.key] === "local" || choices[field.key] === "remote");
              const merging = mergeConflictId === conflict.id;
              const busy = busyId === conflict.id;
              return (
                <article key={conflict.id} className="grid min-w-0 gap-3 py-4" data-testid={`sync-conflict-${conflict.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="core-settings-row-text">
                      <p className="core-settings-row-hint">{conflict.entityLabel}</p>
                      <h5 className="core-settings-row-title">{conflict.title}</h5>
                      <p className="core-settings-row-hint">Erkannt am {formatConflictDate(conflict.createdAt)}</p>
                    </div>
                    <CoreTag tone="warning">Entscheidung nötig</CoreTag>
                  </div>

                  {conflict.fields.length > 0 ? (
                    <dl className="grid gap-3">
                      {conflict.fields.map((field: { key: string | number; label: React.ReactNode; localText: React.ReactNode; remoteText: React.ReactNode }) => (
                        <div key={field.key} className="grid gap-1">
                          <dt className="core-field-label">{field.label}</dt>
                          <dd className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                            <div className="min-w-0">
                              <p className="core-settings-row-hint">Dieser Browser</p>
                              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans core-body text-core-text">{field.localText}</pre>
                            </div>
                            <div className="min-w-0">
                              <p className="core-settings-row-hint">Cloud im Account</p>
                              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans core-body text-core-text">{field.remoteText}</pre>
                            </div>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="core-body text-core-muted">Eine Seite wurde gelöscht oder ist nicht mehr vorhanden.</p>}

                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "keep-local" })} className="core-action-primary" aria-label={`${conflict.title}: Diesen Browser übernehmen`}>Diesen Browser übernehmen</button>
                    <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "keep-remote" })} className="core-action-secondary" aria-label={`${conflict.title}: Cloud übernehmen`}>Cloud übernehmen</button>
                    {conflict.allowedActions.includes("merge-fields") ? (
                      <button type="button" disabled={busy} aria-expanded={merging} aria-controls={`sync-conflict-merge-fields-${conflict.id}`} onClick={() => toggleMerge(conflict.id)} className="core-action-secondary" data-testid={`sync-conflict-merge-${conflict.id}`}>
                        <GitMerge size={16} aria-hidden="true" />
                        Manuell zusammenführen
                      </button>
                    ) : null}
                    <button type="button" disabled={busy} onClick={() => decide(conflict, { action: "ignore" })} className="core-action-ghost" aria-label={`${conflict.title}: Später entscheiden`}>Später entscheiden</button>
                  </div>

                  {merging ? (
                    <fieldset id={`sync-conflict-merge-fields-${conflict.id}`} className="grid gap-1">
                      <legend className="float-left w-full core-field-label">Quelle für jedes Feld wählen</legend>
                      <div className="core-settings-list">
                        {conflict.fields.map((field: { key: string | number; label: React.ReactNode }) => (
                          <div key={field.key} className="core-settings-row" data-layout="inline">
                            <span className="core-settings-row-title">{field.label}</span>
                            <div className="core-settings-row-control gap-4">
                              {FIELD_SOURCES.map(([source, label]) => (
                                <label key={source} className="inline-flex min-h-control items-center gap-2 core-body text-core-secondary">
                                  <input type="radio" className="size-4 accent-core-action" name={`${conflict.id}-${field.key}`} checked={choices[field.key] === source} onChange={() => chooseField(conflict.id, field.key, source)} aria-label={`${field.label}: ${label}`} />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button" disabled={busy || !allFieldsChosen} onClick={() => decide(conflict, { action: "merge-fields", fieldChoices: choices })} className="mt-2 w-fit core-action-primary">Zusammenführung speichern</button>
                    </fieldset>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {ignoredConflicts.length > 0 ? (
        <section className="core-settings-group" aria-labelledby="ignored-sync-conflicts-heading">
          <h4 id="ignored-sync-conflicts-heading" className="core-heading-3 text-core-text">Für später zurückgestellt ({ignoredConflicts.length})</h4>
          <p className="core-settings-row-hint">Stapel- und Kartenänderungen warten auf diese Entscheidung. Neue Reviews werden weiterhin gespeichert.</p>
          <div className="core-settings-list">
            {ignoredConflicts.map((conflict) => (
              <div key={conflict.id} className="core-settings-row" data-layout="inline">
                <span className="core-settings-row-title">{conflict.entityLabel}: {conflict.title}</span>
                <div className="core-settings-row-control">
                  <button type="button" disabled={busyId === conflict.id} onClick={() => decide(conflict, { action: "reopen" })} className="core-action-secondary">
                    <RotateCcw size={16} aria-hidden="true" />
                    Wieder aufnehmen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
