import React from "react";
import { flushSync } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check, ChevronRight, Layers, Paperclip, PenLine, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import type { SummaryGenerationInput, SummaryGenerationResult } from "../aiLearningSummary.ts";
import type { TransientSourceDocument } from "../documentModel.ts";
import type { CardDraftGuard } from "../appScreenProps.ts";
import type { Deck } from "../coreTypes.ts";
import { createLearningSummary, createSummarySettings, deleteLearningSummary, groupSummariesByDeckTree, loadLearningSummaries, saveLearningSummary, summaryChoices, summaryDescription, summaryPlainText, type LearningSummary, type SavedLearningSummary, type SummarySettings } from "../learningSummaries.ts";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { summaryDetailByLength } from "../learningSummarySettings.ts";
import { ActionDialog, CoreSegmentedControl, CoreTag } from "../ui/coreUi.tsx";
import { StatusMessage, useSuccessToast } from "../ui/feedbackUi.tsx";
import { CreationMenu, CreationMenuAction, CreationMenuForm } from "../ui/CreationMenu.tsx";
import { CoreCheckbox } from "../ui/formControls.tsx";
import { SummaryDocumentEditor } from "./SummaryDocumentEditor.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";
import { CoreTooltip } from "../ui/tooltipUi.tsx";

const SOURCE_MATERIAL = [{ value: "cards-and-source", label: "Karten und Quelle" }, { value: "source", label: "Nur Quelle" }] as const;

interface DeckSummariesPanelProps {
  deck: Deck;
  /** The opened deck and its subdecks. */
  treeDecks: readonly Deck[];
  userId: string;
  /** Online storage of the signed-in account; without it summaries stay in this browser. */
  cloud?: SupabaseClient | null;
  onGenerateSummary?: (input: SummaryGenerationInput, signal: AbortSignal) => Promise<SummaryGenerationResult>;
  onDraftStateChange: (guard: CardDraftGuard | null) => void;
}

function SummaryExcerpt({ text }: { text: string }) {
  const ref = React.useRef<HTMLDivElement>(null), [clipped, setClipped] = React.useState(false);
  React.useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const measure = () => setClipped(element.scrollHeight > element.clientHeight + 1);
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, [text]);
  return <div ref={ref} data-clipped={clipped || undefined} className="core-summary-excerpt mt-4 core-body text-core-secondary" aria-hidden="true">{text}</div>;
}

export function DeckSummariesPanel({ deck, treeDecks, userId, cloud = null, onGenerateSummary, onDraftStateChange }: DeckSummariesPanelProps) {
  const account = React.useMemo(() => ({ userId, cloud }), [userId, cloud]);
  const [unsynced, setUnsynced] = React.useState<ReadonlySet<string>>(new Set()), [notice, setNotice] = React.useState("");
  const [summaries, setSummaries] = React.useState<LearningSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [retry, setRetry] = React.useState(0);
  const [view, setView] = React.useState<"list" | "create" | "editor">("list");
  const [query, setQuery] = React.useState("");
  const hasSubdecks = treeDecks.some((item) => item.id !== deck.id && !item.deletedAt);
  const initialSettings = React.useCallback((): SummarySettings => ({ ...createSummarySettings(), scope: hasSubdecks ? "tree" : "deck" }), [hasSubdecks]);
  const [settings, setSettings] = React.useState(initialSettings);
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
  const [deleting, setDeleting] = React.useState<LearningSummary | null>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const aiTriggerRef = React.useRef<HTMLButtonElement>(null);
  const createRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const attachRef = React.useRef<HTMLButtonElement>(null);
  const triggerFocusRef = React.useRef(false);
  const panelRef = React.useRef<HTMLElement>(null);
  const fieldId = React.useId();
  const toast = useSuccessToast();
  const defaultTitle = deck.name.trim().slice(0, 120) || "Zusammenfassung";
  const dirty = view === "editor" ? JSON.stringify(draft) !== JSON.stringify(saved)
    : view === "create" && (Boolean(source) || JSON.stringify(settings) !== JSON.stringify(initialSettings()));
  const generating = busy && generationRef.current !== null;
  const focusCurrent = () => view === "create" ? createRef.current?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus() : titleRef.current?.focus();

  const treeKey = treeDecks.filter((item) => !item.deletedAt).map((item) => item.id).join("\n");

  React.useEffect(() => () => generationRef.current?.abort(), []);
  React.useEffect(() => { createRef.current?.querySelector<HTMLElement>(generating ? ".core-creation-menu-wait button" : 'button[type="submit"]')?.focus(); }, [generating]);
  React.useEffect(() => { if (source) createRef.current?.querySelector<HTMLElement>(".core-summary-source-chip button")?.focus(); }, [source]);

  React.useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    void loadLearningSummaries(account, treeKey.split("\n")).then((loaded) => {
      if (active) { setSummaries(loaded.summaries); setUnsynced(loaded.unsynced); setLoading(false); }
    }).catch((cause: unknown) => { if (active) { setLoadError(cause instanceof Error ? cause.message : "Die Zusammenfassungen konnten nicht geladen werden."); setLoading(false); } });
    return () => { active = false; };
  }, [account, treeKey, retry]);

  React.useEffect(() => {
    if (view === "create") createRef.current?.querySelector<HTMLElement>("button")?.focus();
    else if (view === "editor") titleRef.current?.focus();
    else if (triggerFocusRef.current) { triggerFocusRef.current = false; aiTriggerRef.current?.focus(); }
    else panelRef.current?.focus({ preventScroll: true });
  }, [view]);

  const persist = React.useCallback(async (): Promise<boolean> => {
    if (operationRef.current) return false;
    const title = (view === "create" ? defaultTitle : draft?.title ?? "").trim();
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
  }, [busy, view, defaultTitle, draft, deck.id, settings, account, toast]);

  async function attachSource(file: File | undefined) {
    if (!file || operationRef.current) return;
    operationRef.current = true; setBusy(true); setError(""); setProgress("Quelle wird ausgelesen …");
    try {
      const { readSummarySourceFile } = await import("../aiLearningSummary.ts");
      setSource(await readSummarySourceFile(file)); changeSetting("material", "cards-and-source");
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Die Quelle konnte nicht gelesen werden."); }
    finally { operationRef.current = false; setBusy(false); setProgress(""); }
  }

  async function runGeneration(base: LearningSummary, generationSource: TransientSourceDocument | null) {
    if (operationRef.current || !onGenerateSummary) return;
    operationRef.current = true;
    const controller = new AbortController(); generationRef.current = controller;
    setBusy(true); setError(""); setProgress("KI-Zusammenfassung wird erstellt …");
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

  function generate() { void runGeneration(createLearningSummary(deck.id, defaultTitle, settings), source); }

  React.useEffect(() => {
    onDraftStateChange(dirty || busy ? { focus: focusCurrent, save: persist } : null);
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
  function startCreate() { setSettings(initialSettings()); setSource(null); setAdvanced(false); setError(""); setNotice(""); setView("create"); }
  function closeCreate() { triggerFocusRef.current = true; backToList(); }
  function startManual() {
    setDraft(createLearningSummary(deck.id, defaultTitle, createSummarySettings()));
    setSaved(null); setError(""); setNotice(""); setView("editor");
  }
  function backToList() { setView("list"); setError(""); setDraft(null); setSaved(null); }
  function open(summary: LearningSummary) { setDraft(summary); setSaved(summary); setError(""); setNotice(""); setView("editor"); }
  function applySaved({ saved: stored, unsynced: pending, replaced }: SavedLearningSummary) {
    setSummaries((items) => [stored, ...(replaced?.summary ? [replaced.summary] : []), ...items.filter((item) => item.id !== stored.id && item.id !== replaced?.id)]);
    setUnsynced((ids) => new Set([...ids].filter((id) => id !== stored.id && id !== replaced?.id).concat(pending ? [stored.id] : [])));
    open(stored);
    if (replaced) setNotice(`Diese Fassung wurde auf einem anderen Gerät geändert. Deine Änderungen stehen in „${stored.title}“.`);
  }
  async function confirmDelete() {
    if (!deleting || operationRef.current) return;
    operationRef.current = true; setBusy(true); setError("");
    try {
      await deleteLearningSummary(account, deleting.id);
      setSummaries((items) => items.filter((item) => item.id !== deleting.id));
      setUnsynced((ids) => new Set([...ids].filter((id) => id !== deleting.id)));
      setDeleting(null);
      toast("Zusammenfassung gelöscht.");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Die Zusammenfassung konnte nicht gelöscht werden.");
    } finally { operationRef.current = false; setBusy(false); }
  }
  function changeSetting<K extends keyof SummarySettings>(key: K, value: SummarySettings[K]) { setSettings((current) => ({ ...current, [key]: value })); }
  function removeSource() { flushSync(() => { setSource(null); changeSetting("material", "cards"); }); attachRef.current?.focus(); }
  const groups = groupSummariesByDeckTree(summaries, treeDecks, deck.id), grouped = groups.some((group) => group.path.length);
  const matches = (item: LearningSummary) => `${item.title} ${summaryPlainText(item.html)}`.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de"));
  const shown = groups.map((group) => ({ ...group, summaries: group.summaries.filter(matches) })).filter((group) => group.summaries.length);
  const summaryRow = (summary: LearningSummary) => <div key={summary.id} className="core-summary-row"><button type="button" disabled={busy} className="core-summary-preview core-surface-raised rounded-panel border border-core-border p-6 text-left" onClick={() => request(() => open(summary))} aria-label={`Zusammenfassung „${summary.title}“ öffnen`}>
    <div className="core-summary-preview-copy min-w-0"><h4 className="break-words core-heading-3">{summary.title}</h4><p className="mt-1 core-caption text-core-muted">{summaryDescription(summary)}</p><SummaryExcerpt text={summaryPlainText(summary.html)}/></div>
    <span className="core-summary-preview-action inline-flex items-center gap-2 core-body font-semibold text-core-action">Vollständig öffnen<ChevronRight size={17} aria-hidden="true"/></span>
  </button><IconButton className="core-summary-delete" variant="destructive-quiet" icon={Trash2} label={`Zusammenfassung „${summary.title}“ löschen`} disabled={busy} onClick={() => { setError(""); setDeleting(summary); }}/></div>;

  return <section className="core-summary-panel grid min-w-0 gap-6" data-testid="deck-summaries-panel" aria-label="Zusammenfassungen" aria-busy={busy || loading} tabIndex={-1} ref={panelRef}>
    {view !== "editor" ? <>
      <CreationMenu>
        <CreationMenuForm icon={Sparkles} label="Zusammenfassung mit KI erstellen" open={view === "create"} onOpenChange={(open) => open ? startCreate() : request(closeCreate)}
          triggerRef={aiTriggerRef} formRef={createRef} disabled={(busy && view !== "create") || loading || Boolean(loadError) || !onGenerateSummary} busy={busy}
          wait={generating ? { message: progress, onCancel: () => { generationRef.current?.abort(); setProgress("Erstellung wird abgebrochen …"); } } : null}
          advancedOpen={advanced} onAdvancedOpenChange={setAdvanced} error={error} submitLabel="Mit KI erstellen" submitIcon={Sparkles} onSubmit={generate}
          advanced={<>
            <div className="core-field-group"><span className="core-field-label">Quelle <span className="font-normal text-core-muted">(optional)</span></span>
              <input ref={fileRef} type="file" hidden accept=".pdf,.txt,.md,.markdown,.csv,.tsv" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void attachSource(file); }}/>
              {source ? <span className="core-summary-source-chip"><Paperclip size={14} aria-hidden="true"/><span className="truncate">{source.fileName}</span><button type="button" aria-label={`Quelle „${source.fileName}“ entfernen`} onClick={removeSource}><X size={14} aria-hidden="true"/></button></span>
                : <div><ActionButton ref={attachRef} type="button" variant="secondary" icon={Paperclip} onClick={() => fileRef.current?.click()}>Datei anfügen</ActionButton></div>}
              {progress ? <StatusMessage tone="info" announce="polite">{progress}</StatusMessage> : null}
            </div>
            {source ? <div className="grid min-w-0 gap-2"><span className="core-field-label">Material</span><CoreSegmentedControl ariaLabel="Material" options={SOURCE_MATERIAL} value={settings.material === "source" ? "source" : "cards-and-source"} onValueChange={(value) => changeSetting("material", value)} /></div> : null}
            {(["format", "goal"] as const).map((key) => <div className="core-field-group" key={key}><label htmlFor={`${fieldId}-${key}`} className="core-field-label">{{ format: "Darstellung", goal: "Lernziel" }[key]}</label><CoreSelect id={`${fieldId}-${key}`} ariaLabel={{ format: "Darstellung", goal: "Lernziel" }[key]} value={settings[key]} options={summaryChoices[key]} onValueChange={(value) => changeSetting(key, value as SummarySettings[typeof key])}/></div>)}
            <label className="core-field-group"><span className="core-field-label">Fokus <span className="font-normal text-core-muted">(optional)</span></span><input className="core-field" maxLength={600} value={settings.focus} onChange={(event) => changeSetting("focus", event.target.value)} placeholder="z. B. Begriffe vergleichen" /></label>
            <CoreCheckbox className="core-creation-menu-wide" label="Beispiele aus dem Material aufnehmen" checked={settings.includeExamples} onCheckedChange={(checked) => changeSetting("includeExamples", checked)}/>
            <CoreCheckbox className="core-creation-menu-wide" label="Karten verlinken und Quellenstellen anzeigen" checked={settings.showReferences} onCheckedChange={(checked) => changeSetting("showReferences", checked)}/>
          </>}>
          {hasSubdecks ? <div className="grid min-w-0 gap-2"><span className="core-field-label">Grundlage</span><CoreSegmentedControl ariaLabel="Grundlage" options={summaryChoices.scope} value={settings.scope} onValueChange={(value) => changeSetting("scope", value)} /></div> : null}
          <div className="grid min-w-0 gap-2"><span className="core-field-label">Länge</span><CoreSegmentedControl ariaLabel="Länge" options={summaryChoices.length} value={settings.length} onValueChange={(value) => setSettings((current) => ({ ...current, length: value, detail: summaryDetailByLength[value] }))} /></div>
        </CreationMenuForm>
        <CreationMenuAction icon={PenLine} label="Zusammenfassung schreiben" disabled={busy || loading || Boolean(loadError)} onSelect={() => request(startManual)} />
      </CreationMenu>
      <label className="core-field-group"><span className="sr-only">Zusammenfassungen durchsuchen</span><span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-core-muted" size={17} aria-hidden="true"/><input className="core-field w-full !pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zusammenfassungen durchsuchen" aria-label="Zusammenfassungen durchsuchen" /></span></label>
      {loading ? <StatusMessage tone="info" announce="polite">Zusammenfassungen werden geladen …</StatusMessage>
        : loadError ? <><StatusMessage tone="error" announce="assertive">{loadError}</StatusMessage><ActionButton variant="secondary" onClick={() => setRetry((value) => value + 1)}>Erneut laden</ActionButton></>
        : summaries.length ? <>
          <div className={`grid min-w-0 ${grouped ? "gap-8" : "gap-4"}`} data-testid="summary-list">{shown.map((group) => grouped ? <section key={group.deckId} className="grid min-w-0 gap-4">
            <h3 className="flex min-w-0 items-start gap-2 break-words core-body font-semibold text-core-secondary"><Layers className="mt-0.5 shrink-0 text-core-muted" size={16} aria-hidden="true"/>{group.path.length ? <span className="min-w-0"><span className="sr-only">Unterstapel </span><span className="font-normal text-core-muted">{[deck.name, ...group.path.slice(0, -1)].join(" / ")} / </span>{group.path.at(-1)}</span> : <span className="min-w-0">{deck.name}</span>}</h3>
            {group.summaries.map(summaryRow)}
          </section> : group.summaries.map(summaryRow))}</div>
          {!shown.length ? <StatusMessage tone="info">Keine passende Zusammenfassung gefunden.</StatusMessage> : null}
        </> : null}
    </> : draft ? <>
      <div className="core-summary-editor-heading">
        <CoreTooltip label="Alle Zusammenfassungen"><IconButton icon={ArrowLeft} label="Alle Zusammenfassungen" disabled={busy} onClick={() => request(backToList)}/></CoreTooltip>
        <input disabled={busy} ref={titleRef} aria-label="Titel der Zusammenfassung" className="core-field core-heading-2 core-summary-title-field" value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-invalid={Boolean(error) && !draft.title.trim() || undefined} />
        {unsynced.has(draft.id) ? <CoreTag tone="warning" className="core-summary-sync-tag">Nicht synchronisiert</CoreTag> : null}
        {dirty ? <ActionButton variant="primary" icon={Save} loading={busy} className="core-summary-save" onClick={() => void persist().then((saved) => { if (saved) titleRef.current?.focus(); })}>Speichern</ActionButton>
          : <ActionButton variant="secondary" icon={Check} disabled className="core-summary-save">Gespeichert</ActionButton>}
      </div>
      {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="info" announce="polite">{notice}</StatusMessage> : null}
      <SummaryDocumentEditor key={draft.id} value={draft} onChange={setDraft} busy={busy}/>
    </> : null}
    <ActionDialog open={Boolean(deleting)} destructive title="Zusammenfassung löschen?" description={error || `„${deleting?.title ?? ""}“ wird auf allen Geräten gelöscht.`} confirmLabel="Löschen" cancelLabel="Abbrechen" confirmLoading={busy} onCancel={() => { setDeleting(null); setError(""); }} onConfirm={() => void confirmDelete()}/>
    <ActionDialog open={Boolean(pending)} title="Änderungen übernehmen?" description={error || "Du hast ungespeicherte Änderungen an dieser Zusammenfassung. Speichere oder verwirf sie, bevor du den Bereich verlässt."} confirmLabel="Speichern" cancelLabel="Weiter bearbeiten" discardLabel="Verwerfen" confirmLoading={busy} onCancel={() => setPending(null)} onDiscard={() => { const run = pending; setPending(null); run?.(); }} onConfirm={() => { void persist().then((success) => { if (success) { const run = pending; setPending(null); run?.(); } }); }} restoreFocus={(reason) => { if (reason === "cancel") focusCurrent(); }}/>
  </section>;
}
