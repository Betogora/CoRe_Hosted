import React from "react";
import * as Popover from "@radix-ui/react-popover";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ChevronRight, PenLine, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import type { SummaryGenerationInput, SummaryGenerationResult } from "../aiLearningSummary.ts";
import type { TransientSourceDocument } from "../documentModel.ts";
import type { CardDraftGuard } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { createLearningSummary, createSummarySettings, loadLearningSummaries, saveLearningSummary, summaryChoices, summaryDescription, summaryPlainText, type LearningSummary, type SavedLearningSummary, type SummarySettings } from "../learningSummaries.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { ActionDialog, CoreSegmentedControl } from "../ui/coreUi.tsx";
import { StatusMessage, useSuccessToast } from "../ui/feedbackUi.tsx";
import { SummaryDocumentEditor } from "./SummaryDocumentEditor.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";

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
  const [busy, setBusy] = React.useState(false);
  const [source, setSource] = React.useState<TransientSourceDocument | null>(null);
  const [progress, setProgress] = React.useState("");
  const operationRef = React.useRef(false);
  const generationRef = React.useRef<AbortController | null>(null);
  const [error, setError] = React.useState("");
  const [pending, setPending] = React.useState<(() => void) | null>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const aiTriggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const fieldId = React.useId();
  const toast = useSuccessToast();
  const dirty = view === "editor" ? JSON.stringify(draft) !== JSON.stringify(saved)
    : view === "create" && (newTitle !== (deck.name.trim().slice(0, 120) || "Zusammenfassung") || Boolean(source) || JSON.stringify(settings) !== JSON.stringify(createSummarySettings()));

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
    if (view === "create") { aiTriggerRef.current?.scrollIntoView({ block: "start" }); titleRef.current?.focus({ preventScroll: true }); }
    else if (view === "editor") titleRef.current?.focus();
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

  /** Generates an unsaved draft; failures keep the current view. */
  async function runGeneration(base: LearningSummary, generationSource: TransientSourceDocument | null) {
    if (operationRef.current || !onGenerateSummary) return;
    operationRef.current = true;
    const controller = new AbortController(); generationRef.current = controller;
    setBusy(true); setError(""); setProgress("Material wird geladen und die KI-Zusammenfassung erstellt …");
    try {
      const result = await onGenerateSummary({ deckId: deck.id, title: base.title, settings: { ...base.settings }, source: generationSource }, controller.signal);
      if (controller.signal.aborted) return;
      const next = { ...base, ...result, pages: base.pages?.map((page, index) => ({ ...page, html: index === 0 ? result.html : "" })), updatedAt: new Date().toISOString() };
      setDraft(next); setSaved(null); setView("editor"); toast("KI-Zusammenfassung erstellt.");
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
  function startCreate() { setSettings(createSummarySettings()); setNewTitle(deck.name.trim().slice(0, 120) || "Zusammenfassung"); setSource(null); setAdvanced(false); setError(""); setNotice(""); setView("create"); }
  function startManual() {
    setDraft(createLearningSummary(deck.id, deck.name.trim().slice(0, 120) || "Zusammenfassung", createSummarySettings()));
    setSaved(null); setError(""); setNotice(""); setView("editor");
  }
  function backToList() { setView("list"); setError(""); setDraft(null); setSaved(null); }
  function open(summary: LearningSummary) { setDraft(summary); setSaved(summary); setError(""); setNotice(""); setView("editor"); }
  /** Opens what a save stored; after a conflict the draft continues in its „Konfliktfassung“ and the list shows the cloud state of the original. */
  function applySaved({ saved: stored, unsynced: pending, replaced }: SavedLearningSummary) {
    setSummaries((items) => [stored, ...(replaced?.summary ? [replaced.summary] : []), ...items.filter((item) => item.id !== stored.id && item.id !== replaced?.id)]);
    setUnsynced((ids) => new Set([...ids].filter((id) => id !== stored.id && id !== replaced?.id).concat(pending ? [stored.id] : [])));
    open(stored);
    if (replaced) setNotice(`Diese Fassung wurde auf einem anderen Gerät geändert. Deine Änderungen stehen in „${stored.title}“.`);
  }
  function changeSetting<K extends keyof SummarySettings>(key: K, value: SummarySettings[K]) { setSettings((current) => ({ ...current, [key]: value })); }
  const filtered = summaries.filter((item) => `${item.title} ${summaryPlainText(item.html)}`.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de")));

  return <section className="core-summary-panel grid min-w-0 gap-6" data-testid="deck-summaries-panel" aria-label="Zusammenfassungen" aria-busy={busy || loading} tabIndex={-1} ref={panelRef}>
    {view !== "editor" ? <>
      <label className="core-field-group"><span className="sr-only">Zusammenfassungen durchsuchen</span><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-core-muted" size={17} aria-hidden="true"/><input className="core-field w-full !pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zusammenfassungen durchsuchen" aria-label="Zusammenfassungen durchsuchen" /></span></label>
      {loading ? <StatusMessage tone="info" announce="polite">Zusammenfassungen werden geladen …</StatusMessage>
        : loadError ? <><StatusMessage tone="error" announce="assertive">{loadError}</StatusMessage><ActionButton variant="secondary" onClick={() => setRetry((value) => value + 1)}>Erneut laden</ActionButton></>
        : summaries.length ? <>
          <div className="grid min-w-0 gap-4" data-testid="summary-list">{filtered.map((summary) => <button key={summary.id} type="button" disabled={busy} className="core-summary-preview core-surface-raised rounded-panel border border-core-border p-6 text-left" onClick={() => request(() => open(summary))} aria-label={`Zusammenfassung „${summary.title}“ öffnen`}>
            <div className="core-summary-preview-copy min-w-0"><h4 className="break-words core-heading-3">{summary.title}</h4><p className="mt-1 core-caption text-core-muted">{summaryDescription(summary)}</p><div className="core-summary-excerpt mt-4 core-body text-core-secondary" aria-hidden="true">{summaryPlainText(summary.html)}</div></div>
            <span className="core-summary-preview-action inline-flex min-h-control items-center gap-2 core-body font-semibold text-core-action">Vollständig öffnen<ChevronRight size={17} aria-hidden="true"/></span>
          </button>)}</div>
          {!filtered.length ? <StatusMessage tone="info">Keine passende Zusammenfassung gefunden.</StatusMessage> : null}
        </> : null}
      <div className="core-summary-create-actions grid min-w-0 gap-3" data-open={view === "create"}>
        <Popover.Root open={view === "create"} onOpenChange={(next) => next ? startCreate() : request(backToList)}>
          <Popover.Trigger asChild><button ref={aiTriggerRef} type="button" className="core-summary-create-action" disabled={busy || loading || Boolean(loadError) || !onGenerateSummary}><Sparkles size={21} aria-hidden="true"/><span>Zusammenfassung mit KI erstellen</span></button></Popover.Trigger>
          <Popover.Portal><Popover.Content className="core-summary-create-popover" side="bottom" align="start" sideOffset={8} collisionPadding={8} aria-label="Zusammenfassung mit KI erstellen" onInteractOutside={(event) => { const target = event.detail.originalEvent.target; if (pending || (target instanceof Element && target.closest('[aria-modal="true"]'))) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={(event) => { event.preventDefault(); (panelRef.current?.querySelector<HTMLInputElement>(".core-summary-editor-heading input") ?? aiTriggerRef.current)?.focus(); }}>
          <form className="grid min-w-0 gap-4" inert={busy} onSubmit={(event) => { event.preventDefault(); void generate(); }}>
            <label className="core-field-group"><span className="core-field-label">Titel</span><input ref={titleRef} className="core-field" maxLength={120} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="z. B. Zusammenhänge verstehen" aria-invalid={Boolean(error) && !newTitle.trim() || undefined} /></label>
            <CoreSegmentedControl ariaLabel="Umfang" options={summaryChoices.scope} value={settings.scope} onValueChange={(value) => changeSetting("scope", value)} />
            <div><ActionButton type="button" variant="secondary" icon={SlidersHorizontal} aria-expanded={advanced} aria-controls={`${fieldId}-advanced`} onClick={() => setAdvanced((value) => !value)}>Einstellungen</ActionButton></div>
            {advanced ? <div id={`${fieldId}-advanced`} className="grid min-w-0 gap-4">
            <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 core-field-label">Material</legend><div className="flex flex-wrap gap-2">{([{ value: "cards", label: "Nur Karten" }, { value: "cards-and-source", label: "Karten und Quelle" }, { value: "source", label: "Nur Quelle" }] as const).map((option) => <button key={option.value} type="button" className="core-action-secondary" aria-pressed={settings.material === option.value} disabled={option.value !== "cards" && !source} onClick={() => changeSetting("material", option.value)}>{option.label}</button>)}</div>{source && <p className="core-field-hint break-words">{source.fileName}</p>}
              <label className="core-field-group"><span className="core-field-label">Quelle anfügen (optional)</span><input type="file" className="core-field max-w-full" accept=".pdf,.txt,.md,.markdown,.csv,.tsv" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void attachSource(file); }}/></label>
              {source && <ActionButton type="button" variant="secondary" onClick={() => { setSource(null); changeSetting("material", "cards"); }}>Quelle entfernen</ActionButton>}
            </fieldset>
            <div className="grid min-w-0 gap-2"><span className="core-field-label">Länge</span><CoreSegmentedControl ariaLabel="Länge" options={summaryChoices.length} value={settings.length} onValueChange={(value) => changeSetting("length", value)} /></div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {(["detail", "format", "goal"] as const).map((key) => <div className="core-field-group" key={key}><label htmlFor={`${fieldId}-${key}`} className="core-field-label">{{ detail: "Detailgrad", format: "Darstellung", goal: "Lernziel" }[key]}</label><CoreSelect id={`${fieldId}-${key}`} ariaLabel={{ detail: "Detailgrad", format: "Darstellung", goal: "Lernziel" }[key]} value={settings[key]} options={summaryChoices[key]} onValueChange={(value) => changeSetting(key, value as SummarySettings[typeof key])}/></div>)}
            </div>
            <label className="core-field-group"><span className="core-field-label">Thematischer Fokus <span className="font-normal text-core-muted">(optional)</span></span><textarea className="core-field" rows={3} maxLength={600} value={settings.focus} onChange={(event) => changeSetting("focus", event.target.value)} placeholder="z. B. Begriffe vergleichen und Zusammenhänge erklären" /></label>
            <div className="core-field-group"><span className="core-field-label">Sprache</span><CoreSegmentedControl ariaLabel="Sprache" options={summaryChoices.register} value={settings.register} onValueChange={(value) => changeSetting("register", value)} /></div>
            <label className="core-summary-checkbox core-body"><input type="checkbox" checked={settings.includeExamples} onChange={(event) => changeSetting("includeExamples", event.target.checked)}/>Beispiele aus dem Material aufnehmen</label>
            <label className="core-summary-checkbox core-body"><input type="checkbox" checked={settings.showReferences} onChange={(event) => changeSetting("showReferences", event.target.checked)}/>Karten verlinken und Quellenstellen anzeigen</label>
            </div> : null}
            {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
            <div className="core-summary-actions flex flex-wrap justify-end gap-3"><ActionButton type="button" variant="secondary" disabled={busy} onClick={() => request(backToList)}>Abbrechen</ActionButton><ActionButton variant="primary" type="submit" loading={busy} icon={Sparkles}>Mit KI erstellen</ActionButton></div>
          </form>
            {progress && <StatusMessage tone="info" announce="polite">{progress}</StatusMessage>}
            {generationRef.current && <ActionButton variant="secondary" onClick={() => { generationRef.current?.abort(); setProgress("Erstellung wird abgebrochen …"); }}>KI-Erstellung abbrechen</ActionButton>}
          </Popover.Content></Popover.Portal>
        </Popover.Root>
        <button type="button" className="core-summary-create-action" disabled={busy || loading || Boolean(loadError)} onClick={() => request(startManual)}><PenLine size={21} aria-hidden="true"/><span>Zusammenfassung schreiben</span></button>
      </div>
    </> : draft ? <>
      <div><ActionButton variant="secondary" icon={ArrowLeft} disabled={busy} onClick={() => request(backToList)}>Alle Zusammenfassungen</ActionButton></div>

        <div className="core-summary-heading core-summary-editor-heading flex flex-wrap items-end justify-between gap-4"><div className="grid min-w-0 flex-1 gap-2"><label className="core-field-label" htmlFor={`${fieldId}-title`}>Titel der Zusammenfassung</label><input id={`${fieldId}-title`} disabled={busy} ref={titleRef} className="core-field core-heading-2" value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-invalid={Boolean(error) && !draft.title.trim() || undefined} /><p className="core-caption text-core-muted">{summaryDescription(draft)} · {dirty ? "Ungespeicherte Änderungen" : unsynced.has(draft.id) ? "Noch nicht synchronisiert" : "Gespeichert"}</p></div></div>
        {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
        {notice ? <StatusMessage tone="info" announce="polite">{notice}</StatusMessage> : null}
        <SummaryDocumentEditor key={draft.id} value={draft} onChange={setDraft} busy={busy}/>
        <div className="grid gap-3">
          {draft.generation && <p className="core-caption text-core-muted">Mit KI erstellt · {draft.generation.materialUnits} {draft.generation.materialUnits === 1 ? "Materialeinheit" : "Materialeinheiten"} · {draft.generation.privacyMode === "zdr" ? "Ohne Datenspeicherung beim Anbieter" : "Anbieter ohne ZDR-Zusage"}. Prüfe die Aussagen anhand deiner Grundlage.</p>}
          <p className="core-caption text-core-muted">Grundlage: {draft.settings.scope === "tree" ? "Stapel und Unterstapel" : "Dieser Stapel"} · {{ cards: "Nur Karten", "cards-and-source": "Karten und Quelle", source: "Nur Quelle" }[draft.settings.material]}</p>
        </div>
    </> : null}
    {view !== "create" && progress && <StatusMessage tone="info" announce="polite">{progress}</StatusMessage>}
    {view !== "create" && generationRef.current && <div><ActionButton variant="secondary" onClick={() => { generationRef.current?.abort(); setProgress("Erstellung wird abgebrochen …"); }}>KI-Erstellung abbrechen</ActionButton></div>}
    <ActionDialog open={Boolean(pending)} title="Änderungen übernehmen?" description={error || "Du hast ungespeicherte Änderungen an dieser Zusammenfassung. Speichere oder verwirf sie, bevor du den Bereich verlässt."} confirmLabel="Speichern" cancelLabel="Weiter bearbeiten" discardLabel="Verwerfen" confirmLoading={busy} onCancel={() => setPending(null)} onDiscard={() => { const run = pending; setPending(null); run?.(); }} onConfirm={() => { void persist().then((success) => { if (success) { const run = pending; setPending(null); run?.(); } }); }} restoreFocus={(reason) => { if (reason === "cancel") titleRef.current?.focus(); }}/>
  </section>;
}
