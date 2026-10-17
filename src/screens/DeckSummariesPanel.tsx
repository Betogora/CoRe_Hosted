import React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ChevronRight, Copy, FileText, Plus, Save, Search, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { SummaryGenerationInput, SummaryGenerationResult } from "../aiLearningSummary.ts";
import type { TransientSourceDocument } from "../documentModel.ts";
import type { CardDraftGuard } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { createLearningSummary, createSummarySettings, deleteLearningSummary, duplicateLearningSummary, loadLearningSummaries, saveLearningSummary, summaryChoices, summaryDescription, summaryPlainText, type LearningSummary, type SavedLearningSummary, type SummarySettings } from "../learningSummaries.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl, OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage, useSuccessToast } from "../ui/feedbackUi.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";

interface DeckSummariesPanelProps {
  deck: Deck;
  userId: string;
  /** Online storage of the signed-in account; without it summaries stay in this browser. */
  cloud?: SupabaseClient | null;
  onGenerateSummary?: (input: SummaryGenerationInput, signal: AbortSignal) => Promise<SummaryGenerationResult>;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
}

export function DeckSummariesPanel({ deck, userId, cloud = null, onGenerateSummary, onDraftStateChange }: DeckSummariesPanelProps) {
  const account = React.useMemo(() => ({ userId, cloud }), [userId, cloud]);
  const [unsynced, setUnsynced] = React.useState<ReadonlySet<string>>(new Set()), [notice, setNotice] = React.useState("");
  const [summaries, setSummaries] = React.useState<LearningSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  const [view, setView] = React.useState<"list" | "create" | "editor">("list");
  const [query, setQuery] = React.useState("");
  const [settings, setSettings] = React.useState(createSummarySettings);
  const [newTitle, setNewTitle] = React.useState("");
  const [advanced, setAdvanced] = React.useState(false);
  const [draft, setDraft] = React.useState<LearningSummary | null>(null);
  const [saved, setSaved] = React.useState<LearningSummary | null>(null);
  /** Also set right after a save, so an action queued behind the save dialog sees the stored version. */
  const savedRef = React.useRef(saved); savedRef.current = saved;
  const [busy, setBusy] = React.useState(false);
  const [source, setSource] = React.useState<TransientSourceDocument | null>(null);
  const [progress, setProgress] = React.useState("");
  const operationRef = React.useRef(false);
  const generationRef = React.useRef<AbortController | null>(null);
  const [error, setError] = React.useState("");
  const [pending, setPending] = React.useState<(() => void) | null>(null);
  const [quickScope, setQuickScope] = React.useState<SummarySettings["scope"]>("tree");
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false), [confirmDelete, setConfirmDelete] = React.useState(false);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const fieldId = React.useId();
  const toast = useSuccessToast();
  const dirty = view === "editor" ? JSON.stringify(draft) !== JSON.stringify(saved)
    : view === "create" && (Boolean(newTitle.trim()) || Boolean(source) || JSON.stringify(settings) !== JSON.stringify(createSummarySettings()));

  React.useEffect(() => () => generationRef.current?.abort(), []);

  React.useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    void loadLearningSummaries(account, deck.id).then((loaded) => {
      if (active) { setSummaries(loaded.summaries); setUnsynced(loaded.unsynced); setLoading(false); }
    }).catch((cause: unknown) => { if (active) { setLoadError(cause instanceof Error ? cause.message : "Die Zusammenfassungen konnten nicht geladen werden."); setLoading(false); } });
    return () => { active = false; };
  }, [account, deck.id, retry]);

  React.useEffect(() => {
    if (view !== "list") titleRef.current?.focus();
    else panelRef.current?.focus({ preventScroll: true });
  }, [view]);

  const persist = React.useCallback(async (): Promise<boolean> => {
    if (operationRef.current) return false;
    const title = (view === "create" ? newTitle : draft?.title ?? "").trim();
    if (!title) { setError("Bitte gib einen Titel für die Zusammenfassung ein."); titleRef.current?.focus(); return false; }
    operationRef.current = true; setBusy(true); setError("");
    try {
      const next = view === "create" ? createLearningSummary(deck.id, title, settings)
        : draft ? { ...draft, title, updatedAt: new Date().toISOString() } : null;
      if (!next) return false;
      applySaved(await saveLearningSummary(account, next));
      toast("Zusammenfassung gespeichert.");
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Die Zusammenfassung konnte nicht gespeichert werden.");
      return false;
    } finally { operationRef.current = false; setBusy(false); }
  }, [busy, view, newTitle, draft, deck.id, settings, account, toast]);

  async function attachSource(file: File | undefined) {
    if (!file || operationRef.current) return;
    operationRef.current = true; setBusy(true); setError(""); setProgress("Quelle wird ausgelesen …");
    try {
      const { readSummarySourceFile } = await import("../aiLearningSummary.ts");
      setSource(await readSummarySourceFile(file));
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Quelle konnte nicht gelesen werden."); }
    finally { operationRef.current = false; setBusy(false); setProgress(""); }
  }

  /** Generates into `base` (a new or an existing Fassung) and stores the result; failures keep the current view. */
  async function runGeneration(base: LearningSummary, generationSource: TransientSourceDocument | null) {
    if (operationRef.current || !onGenerateSummary) return;
    operationRef.current = true;
    const controller = new AbortController(); generationRef.current = controller;
    setBusy(true); setError(""); setProgress("Material wird geladen und die KI-Zusammenfassung erstellt …");
    try {
      const result = await onGenerateSummary({ deckId: deck.id, title: base.title, settings: { ...base.settings }, source: generationSource }, controller.signal);
      if (controller.signal.aborted) return;
      const next = { ...base, ...result, updatedAt: new Date().toISOString() };
      setDraft(next); setSaved(null); setView("editor"); setProgress("Zusammenfassung wird gespeichert …");
      const stored = await saveLearningSummary(account, next);
      if (controller.signal.aborted) return;
      applySaved(stored); toast("KI-Zusammenfassung gespeichert.");
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Die KI-Zusammenfassung konnte nicht erstellt werden.");
    } finally {
      if (generationRef.current === controller) { generationRef.current = null; operationRef.current = false; setBusy(false); setProgress(""); }
    }
  }

  function generate() {
    const title = newTitle.trim();
    if (!title) { setError("Bitte gib einen Titel für die Zusammenfassung ein."); titleRef.current?.focus(); return; }
    void runGeneration(createLearningSummary(deck.id, title, settings), source);
  }
  function quickGenerate() {
    void runGeneration(createLearningSummary(deck.id, deck.name.trim().slice(0, 120) || "Zusammenfassung", { ...createSummarySettings(), scope: quickScope }), null);
  }
  function regenerate() {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) { setError("Bitte gib einen Titel für die Zusammenfassung ein."); titleRef.current?.focus(); return; }
    void runGeneration({ ...draft, title }, null);
  }

  React.useEffect(() => {
    onDraftStateChange(dirty || busy ? { focus: () => titleRef.current?.focus(), save: persist } : null);
    return () => onDraftStateChange(null);
  }, [dirty, busy, persist, onDraftStateChange]);

  React.useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  function request(run: () => void) {
    if (busy) return;
    if (dirty) setPending(() => run);
    else run();
  }
  function startCreate() { setSettings(createSummarySettings()); setNewTitle(""); setSource(null); setAdvanced(false); setError(""); setView("create"); }
  function startManual() {
    setDraft(createLearningSummary(deck.id, "Eigene Zusammenfassung", createSummarySettings()));
    setSaved(null); savedRef.current = null; setError(""); setNotice(""); setView("editor");
  }
  function backToList() { setView("list"); setError(""); setDraft(null); setSaved(null); }
  function open(summary: LearningSummary) { setDraft(summary); setSaved(summary); savedRef.current = summary; setError(""); setNotice(""); setView("editor"); }
  /** Opens what a save stored; after a conflict the draft continues in its „Konfliktfassung“ and the list shows the cloud state of the original. */
  function applySaved({ saved: stored, unsynced: pending, replaced }: SavedLearningSummary) {
    setSummaries((items) => [stored, ...(replaced?.summary ? [replaced.summary] : []), ...items.filter((item) => item.id !== stored.id && item.id !== replaced?.id)]);
    setUnsynced((ids) => new Set([...ids].filter((id) => id !== stored.id && id !== replaced?.id).concat(pending ? [stored.id] : [])));
    open(stored);
    if (replaced) setNotice(`Diese Fassung wurde auf einem anderen Gerät geändert. Deine Änderungen stehen in „${stored.title}“.`);
  }
  async function duplicate() {
    const original = savedRef.current;
    if (!original || operationRef.current) return;
    operationRef.current = true; setBusy(true); setError("");
    try {
      applySaved(await saveLearningSummary(account, duplicateLearningSummary(original))); toast("Kopie gespeichert.");
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Kopie konnte nicht gespeichert werden."); }
    finally { operationRef.current = false; setBusy(false); }
  }
  async function remove() {
    const id = saved?.id;
    if (!id || operationRef.current) return;
    operationRef.current = true; setBusy(true); setError("");
    try {
      await deleteLearningSummary(account, id);
      setSummaries((items) => items.filter((item) => item.id !== id)); backToList(); toast("Zusammenfassung gelöscht.");
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Zusammenfassung konnte nicht gelöscht werden."); }
    finally { operationRef.current = false; setBusy(false); }
  }
  function changeSetting<K extends keyof SummarySettings>(key: K, value: SummarySettings[K]) { setSettings((current) => ({ ...current, [key]: value })); }
  const filtered = summaries.filter((item) => `${item.title} ${summaryPlainText(item.html)}`.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de")));

  return <section className="core-summary-panel grid min-w-0 gap-6" data-testid="deck-summaries-panel" aria-label="Zusammenfassungen" aria-busy={busy || loading} tabIndex={-1} ref={panelRef}>
    {view === "list" ? <>
      <div className="core-summary-heading flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-full"><h3 className="core-heading-2 break-words">Zusammenfassungen</h3><p className="mt-1 break-words core-body text-core-muted">{summaries.length} {summaries.length === 1 ? "Fassung" : "Fassungen"} · {deck.name}</p></div>
      </div>
      <p className="core-caption text-core-muted">In deinem Konto gespeichert · KI-Fassungen bleiben bearbeitbar</p>
      {loading ? <StatusMessage tone="info" announce="polite">Zusammenfassungen werden geladen …</StatusMessage>
        : loadError ? <><StatusMessage tone="error" announce="assertive">{loadError}</StatusMessage><ActionButton variant="secondary" onClick={() => setRetry((value) => value + 1)}>Erneut laden</ActionButton></>
        : <>
          <div className="core-summary-creation-grid grid min-w-0 gap-4" aria-label="Zusammenfassung erstellen">
            <SoftPanel className="flex min-w-0 flex-col gap-6 border border-core-border p-6" aria-label="KI-Zusammenfassung">
              <div className="flex min-w-0 items-start gap-4"><OrbIcon icon={Sparkles}/><div className="min-w-0"><h4 className="core-heading-3 break-words">KI-Zusammenfassung</h4><p className="mt-1 core-body text-core-muted">Lass die KI dein Material zusammenfassen und passe das Ergebnis anschließend an.</p></div></div>
              <div className="mt-auto grid min-w-0 gap-3"><CoreSegmentedControl className="w-full min-w-0" ariaLabel="Grundlage der Zusammenfassung" options={summaryChoices.scope.map((choice) => ({ value: choice.value, label: choice.value === "tree" ? "Mit Unterstapeln" : choice.label }))} value={quickScope} onValueChange={setQuickScope} disabled={busy || !onGenerateSummary}/><div className="flex min-w-0 flex-wrap gap-2"><ActionButton className="min-w-0 max-w-full whitespace-normal" variant="primary" icon={Sparkles} loading={busy} disabled={!onGenerateSummary} onClick={quickGenerate}>Zusammenfassung erzeugen</ActionButton><ActionButton variant="secondary" icon={SlidersHorizontal} disabled={busy || !onGenerateSummary} onClick={startCreate}>Eigene Einstellungen</ActionButton></div>{!onGenerateSummary && <p className="core-field-hint">Die KI-Erstellung ist derzeit nicht verfügbar.</p>}</div>
            </SoftPanel>
            <SoftPanel className="flex min-w-0 flex-col gap-6 border border-core-border p-6" aria-label="Eigene Zusammenfassung">
              <div className="flex min-w-0 items-start gap-4"><OrbIcon icon={FileText}/><div className="min-w-0"><h4 className="core-heading-3 break-words">Eigene Zusammenfassung</h4><p className="mt-1 core-body text-core-muted">Schreibe deine Zusammenfassung selbst und gestalte sie mit den Textwerkzeugen.</p></div></div>
              <div className="mt-auto"><ActionButton variant="secondary" icon={Plus} disabled={busy} onClick={startManual}>Selbst schreiben</ActionButton></div>
            </SoftPanel>
          </div>
          {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
          {summaries.length > 0 ? <>
            <label className="core-field-group"><span className="core-field-label">Zusammenfassungen durchsuchen</span><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={17} aria-hidden="true"/><input className="core-field w-full !pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel oder Inhalt" aria-label="Zusammenfassungen durchsuchen" /></span></label>
            <div className="grid min-w-0 gap-4" data-testid="summary-list">{filtered.map((summary) => <button key={summary.id} type="button" disabled={busy} className="core-summary-preview core-surface-raised rounded-panel border border-core-border p-6 text-left" onClick={() => open(summary)} aria-label={`Zusammenfassung „${summary.title}“ öffnen`}>
              <div className="core-summary-preview-copy min-w-0"><p className="core-caption font-semibold text-core-muted">{summaryChoices.goal.find((option) => option.value === summary.settings.goal)!.label}</p><h4 className="mt-2 break-words core-heading-3">{summary.title}</h4><p className="mt-1 core-caption text-core-muted">{summaryDescription(summary)}</p><div className="core-summary-excerpt mt-4 core-body text-core-secondary" aria-hidden="true">{summaryPlainText(summary.html) || "Noch kein Text. Öffne diese Fassung, um deine Zusammenfassung zu schreiben."}</div></div>
              <span className="core-summary-preview-action inline-flex min-h-control items-center gap-2 core-body font-semibold text-core-action">Vollständig öffnen<ChevronRight size={17} aria-hidden="true"/></span>
            </button>)}</div>
            {!filtered.length ? <StatusMessage tone="info">Keine passende Zusammenfassung gefunden.</StatusMessage> : null}
          </> : null}
        </>}
    </> : <>
      <div><ActionButton variant="secondary" icon={ArrowLeft} disabled={busy} onClick={() => request(backToList)}>Alle Zusammenfassungen</ActionButton></div>
      {view === "create" ? <>
        <div><h3 className="core-heading-2">Wie möchtest du deine Zusammenfassung?</h3><p className="mt-2 core-body text-core-muted">Wähle die Gestaltung für deine neue Fassung. Bestehende Zusammenfassungen bleiben erhalten.</p></div>
        <SoftPanel className="core-summary-form grid gap-6 p-6">
          <form className="grid min-w-0 gap-6" inert={busy} onSubmit={(event) => { event.preventDefault(); if (onGenerateSummary) generate(); else void persist(); }}>
            <label className="core-field-group"><span className="core-field-label">Titel</span><input ref={titleRef} className="core-field" maxLength={120} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="z. B. Zusammenhänge verstehen" aria-invalid={Boolean(error) && !newTitle.trim() || undefined} /></label>
            <div className="core-field-group"><label className="core-field-label" htmlFor={`${fieldId}-scope`}>Umfang</label><CoreSelect id={`${fieldId}-scope`} ariaLabel="Umfang" value={settings.scope} options={summaryChoices.scope} onValueChange={(value) => changeSetting("scope", value as SummarySettings["scope"])} /></div>
            <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 core-field-label">Material</legend><div className="flex flex-wrap gap-2">{([{ value: "cards", label: "Nur Karten" }, { value: "cards-and-source", label: "Karten und Quelle" }, { value: "source", label: "Nur Quelle" }] as const).map((option) => <button key={option.value} type="button" className="core-action-secondary" aria-pressed={settings.material === option.value} disabled={option.value !== "cards" && !source} onClick={() => changeSetting("material", option.value)}>{option.label}</button>)}</div><p className="core-field-hint break-words">{source ? `Lesbare Quelle: ${source.fileName}. Sie wird nur für diese Erstellung verwendet.` : "Keine lesbare Quelle angefügt. Füge eine Datei an, um die Quellenoptionen zu verwenden."}</p>
              <label className="core-field-group"><span className="core-field-label">Quelle anfügen (optional)</span><input type="file" className="core-field max-w-full" accept=".pdf,.txt,.md,.markdown,.csv,.tsv" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void attachSource(file); }}/></label>
              {source && <ActionButton type="button" variant="secondary" onClick={() => { setSource(null); changeSetting("material", "cards"); }}>Quelle entfernen</ActionButton>}
            </fieldset>
            <div className="grid min-w-0 gap-2"><span className="core-field-label">Länge</span><CoreSegmentedControl ariaLabel="Länge" options={summaryChoices.length} value={settings.length} onValueChange={(value) => changeSetting("length", value)} /><p className="core-field-hint">Kurz: etwa 1–2 Min. · Mittel: 3–5 Min. · Lang: 6–10 Min. Je nach Material.</p></div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {(["detail", "format", "goal"] as const).map((key) => <div className="core-field-group" key={key}><label htmlFor={`${fieldId}-${key}`} className="core-field-label">{{ detail: "Detailgrad", format: "Darstellung", goal: "Lernziel" }[key]}</label><CoreSelect id={`${fieldId}-${key}`} ariaLabel={{ detail: "Detailgrad", format: "Darstellung", goal: "Lernziel" }[key]} value={settings[key]} options={summaryChoices[key]} onValueChange={(value) => changeSetting(key, value as SummarySettings[typeof key])}/></div>)}
            </div>
            <p className="core-field-hint">Länge bestimmt den Umfang, Detailgrad die fachliche Tiefe. Eine kurze Fassung kann trotzdem detailliert sein.</p>
            <label className="core-field-group"><span className="core-field-label">Thematischer Fokus <span className="font-normal text-core-muted">(optional)</span></span><textarea className="core-field" rows={3} maxLength={600} value={settings.focus} onChange={(event) => changeSetting("focus", event.target.value)} placeholder="z. B. Begriffe vergleichen und Zusammenhänge erklären" /></label>
            <div><ActionButton type="button" variant="secondary" icon={SlidersHorizontal} aria-expanded={advanced} aria-controls={`${fieldId}-advanced`} onClick={() => setAdvanced((value) => !value)}>Weitere Einstellungen</ActionButton></div>
            {advanced ? <div id={`${fieldId}-advanced`} className="grid gap-4 rounded-control bg-core-subtle p-4"><div className="core-field-group"><span className="core-field-label">Sprache</span><CoreSegmentedControl ariaLabel="Sprache" options={summaryChoices.register} value={settings.register} onValueChange={(value) => changeSetting("register", value)} /></div><label className="core-summary-checkbox core-body"><input type="checkbox" checked={settings.includeExamples} onChange={(event) => changeSetting("includeExamples", event.target.checked)}/>Beispiele aus dem Material aufnehmen</label><label className="core-summary-checkbox core-body"><input type="checkbox" checked={settings.showReferences} onChange={(event) => changeSetting("showReferences", event.target.checked)}/>Karten verlinken und Quellenstellen anzeigen</label><p className="core-field-hint">Diese Einstellungen bestimmen den KI-Prompt und werden mit deiner Fassung gespeichert.</p></div> : null}
            <StatusMessage tone="info">Bei „Mit KI erstellen“ wird der lesbare Text deiner gewählten Grundlage an OpenRouter übermittelt. Bilder, Ton und verlinkte Webseiten werden nicht ausgewertet. Der Anbieter speichert den Text nicht und nutzt ihn nicht zum Training.</StatusMessage>
            {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
            <div className="core-summary-actions flex flex-wrap justify-end gap-3"><ActionButton type="button" variant="secondary" disabled={busy} onClick={() => request(backToList)}>Abbrechen</ActionButton><ActionButton variant={onGenerateSummary ? "secondary" : "primary"} type="button" disabled={busy} icon={Plus} onClick={() => void persist()}>Fassung anlegen</ActionButton>{onGenerateSummary && <ActionButton variant="primary" type="submit" loading={busy} icon={Sparkles}>Mit KI erstellen</ActionButton>}</div>
          </form>
        </SoftPanel>
      </> : draft ? <>
        <div className="core-summary-heading core-summary-editor-heading flex flex-wrap items-end justify-between gap-4"><div className="grid min-w-0 flex-1 gap-2"><label className="core-field-label" htmlFor={`${fieldId}-title`}>Titel der Zusammenfassung</label><input id={`${fieldId}-title`} disabled={busy} ref={titleRef} className="core-field core-heading-2" value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-invalid={Boolean(error) && !draft.title.trim() || undefined} /><p className="core-caption text-core-muted">{summaryDescription(draft)} · {dirty ? "Ungespeicherte Änderungen" : unsynced.has(draft.id) ? "Noch nicht synchronisiert" : "Gespeichert"}</p></div><div className="flex flex-wrap gap-3">{saved ? <><CoreTooltip label="Duplizieren"><IconButton icon={Copy} label="Duplizieren" disabled={busy} onClick={() => request(() => void duplicate())}/></CoreTooltip><CoreTooltip label="Löschen"><IconButton icon={Trash2} label="Löschen" variant="destructive" disabled={busy} onClick={() => setConfirmDelete(true)}/></CoreTooltip></> : null}{onGenerateSummary && saved && draft.settings.material === "cards" ? <ActionButton variant="secondary" icon={Sparkles} disabled={busy} onClick={() => { if (draft.html.trim()) setConfirmRegenerate(true); else regenerate(); }}>Neu erzeugen</ActionButton> : null}<ActionButton variant="primary" icon={Save} loading={busy} onClick={() => void persist()}>Speichern</ActionButton></div></div>
        {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
        {notice ? <StatusMessage tone="info" announce="polite">{notice}</StatusMessage> : null}
        <SoftPanel className="core-summary-document grid gap-4 p-4 sm:p-6" inert={busy}>
          <div className="flex flex-wrap gap-4"><div className="core-field-group"><label htmlFor={`${fieldId}-font`} className="core-field-label">Schrift</label><CoreSelect id={`${fieldId}-font`} ariaLabel="Schrift" value={draft.font} options={[{ value: "sans", label: "Standard" }, { value: "serif", label: "Serif" }]} onValueChange={(value) => setDraft({ ...draft, font: value as LearningSummary["font"] })}/></div><div className="core-field-group"><label htmlFor={`${fieldId}-size`} className="core-field-label">Schriftgröße</label><CoreSelect id={`${fieldId}-size`} ariaLabel="Schriftgröße" value={String(draft.fontSize)} options={[{ value: "14", label: "14" }, { value: "16", label: "16" }, { value: "22", label: "22" }]} onValueChange={(value) => setDraft({ ...draft, fontSize: Number(value) as LearningSummary["fontSize"] })}/></div></div>
          <div className="core-summary-editor" style={{ "--summary-font": draft.font === "serif" ? "Georgia, serif" : "inherit", "--summary-size": `${draft.fontSize}px` } as React.CSSProperties}>
            <RichTextEditor ariaLabel="Zusammenfassung bearbeiten" ariaDescribedBy={`${fieldId}-edit-hint`} value={draft.html} onChange={(html) => setDraft((current) => current ? { ...current, html } : null)} isActive minHeightClass="min-h-64"/>
          </div>
          {draft.generation && <p className="core-caption text-core-muted">Mit KI erstellt · {draft.generation.materialUnits} {draft.generation.materialUnits === 1 ? "Materialeinheit" : "Materialeinheiten"} · {draft.generation.privacyMode === "zdr" ? "Ohne Datenspeicherung beim Anbieter" : "Anbieter ohne ZDR-Zusage"}. Prüfe die Aussagen anhand deiner Grundlage.</p>}
          <p id={`${fieldId}-edit-hint`} className="core-field-hint">Schreibe deinen Text hier. Unter „Weitere Textwerkzeuge“ findest du Textfarbe, Marker, Listen und weitere Formatierungen.</p>
          <p className="core-caption text-core-muted">Grundlage: {draft.settings.scope === "tree" ? "Stapel und Unterstapel" : "Dieser Stapel"} · {{ cards: "Nur Karten", "cards-and-source": "Karten und Quelle", source: "Nur Quelle" }[draft.settings.material]}</p>
        </SoftPanel>
      </> : null}
    </>}
    {progress && <StatusMessage tone="info" announce="polite">{progress}</StatusMessage>}
    {generationRef.current && <div><ActionButton variant="secondary" onClick={() => { generationRef.current?.abort(); setProgress("Erstellung wird abgebrochen …"); }}>KI-Erstellung abbrechen</ActionButton></div>}
    <ActionDialog open={confirmRegenerate} title="Fassung neu erzeugen?" description="Die KI erstellt diese Fassung mit ihren gespeicherten Einstellungen neu. Der bisherige Text wird ersetzt." confirmLabel="Neu erzeugen" cancelLabel="Abbrechen" onCancel={() => setConfirmRegenerate(false)} onConfirm={() => { setConfirmRegenerate(false); regenerate(); }}/>
    <ActionDialog open={confirmDelete} destructive title="Zusammenfassung löschen?" description={`„${saved?.title ?? ""}“ wird endgültig gelöscht.${dirty ? " Ungespeicherte Änderungen gehen ebenfalls verloren." : ""} Daraus erzeugte Mindmap-Karten bleiben erhalten.`} confirmLabel="Löschen" cancelLabel="Abbrechen" onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void remove(); }}/>
    <ActionDialog open={Boolean(pending)} title="Änderungen übernehmen?" description="Du hast ungespeicherte Änderungen an dieser Zusammenfassung. Speichere oder verwirf sie, bevor du den Bereich verlässt." confirmLabel="Speichern" cancelLabel="Weiter bearbeiten" discardLabel="Verwerfen" confirmLoading={busy} onCancel={() => setPending(null)} onDiscard={() => { const run = pending; setPending(null); run?.(); }} onConfirm={() => { void persist().then((success) => { if (success) { const run = pending; setPending(null); run?.(); } }); }} restoreFocus={(reason) => { if (reason === "cancel") titleRef.current?.focus(); }}/>
  </section>;
}
