import React from "react";
import { Check, ChevronRight, Copy, FolderPlus, GripVertical, Layers, Network, Pencil, Play, PlusSquare, Save, Search, Share2, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { getOriginalVariant, getVariantAnchor } from "../coreModel.js";
import { buildCardVariationPrompt, createVariantReviewModel } from "../coreVariantService.js";
import { createDeckLibraryModel } from "../libraryModel.js";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.jsx";
import { CoreModeControl, EmptyState, OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.jsx";
import { cardTypeOptions, formatLevelList, getStateValue, maturityStageLabels } from "./screenConstants.js";

function DeckCardEditor({ deck, cards = [], selectedCardId, mediaUrls = {}, onSaveCard, onDeleteCard, onAddVariant, onApplyVariantJson }) {
  const card = cards.find((item) => item.id === selectedCardId) ?? cards[0];
  const [form, setForm] = React.useState(null);
  const [variantForm, setVariantForm] = React.useState({ front: "", back: "", variantLevel: 2 });
  const [showPrompt, setShowPrompt] = React.useState(false);
  const [jsonResponse, setJsonResponse] = React.useState("");
  const [variantStatus, setVariantStatus] = React.useState("");

  React.useEffect(() => {
    setForm(
      card
        ? {
            front: card.originalFront,
            back: card.originalBack,
            tags: (card.originalTags ?? []).join(" "),
            kind: card.kind,
          }
        : null,
    );
    setVariantForm({ front: "", back: "", variantLevel: 2 });
    setShowPrompt(false);
    setJsonResponse("");
    setVariantStatus("");
  }, [card?.id]);

  if (!card || !form) return null;

  const reviewEvents = deck?.reviewEvents ?? [];
  const variantReviewModel = createVariantReviewModel(card, reviewEvents);
  const { maturity, readiness, coverage, generationRecommendation: recommendation, generationPlan } = variantReviewModel;
  const promptOptions = generationPlan.canGenerate
    ? generationPlan.promptOptions
    : { ...generationPlan.promptOptions, numberOfVariants: 1, maxVariantLevel: Math.max(1, generationPlan.promptOptions.maxVariantLevel || 1) };
  const promptPreview = buildCardVariationPrompt(card, promptOptions);
  const originalVariant = getOriginalVariant(card);
  const variants = card.variants ?? [];

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateVariantForm(key, value) {
    setVariantForm((current) => ({ ...current, [key]: value }));
  }

  function addManualVariant() {
    if (!variantForm.front.trim() || !variantForm.back.trim()) {
      setVariantStatus("Bitte Frage und Antwort für die Umformulierung ausfüllen.");
      return;
    }
    onAddVariant(card.id, {
      ...variantForm,
      variantLevel: Number(variantForm.variantLevel) || 2,
      generationSource: "user_edited",
    });
    setVariantForm({ front: "", back: "", variantLevel: 2 });
    setVariantStatus("Umformulierung gespeichert.");
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard?.writeText(promptPreview);
      setVariantStatus("Prompt kopiert.");
    } catch {
      setVariantStatus("Prompt ist sichtbar und kann manuell kopiert werden.");
    }
  }

  function applyJsonResponse() {
    if (!jsonResponse.trim()) {
      setVariantStatus("Füge zuerst eine JSON-Antwort ein.");
      return;
    }
    const result = onApplyVariantJson(card.id, jsonResponse, promptOptions);
    const created = result?.result?.createdVariants?.length ?? 0;
    const skipped = result?.result?.skippedVariants?.length ?? 0;
    const errors = result?.result?.errors ?? [];
    const warnings = [...(result?.result?.warnings ?? []), ...(errors ?? [])];
    setVariantStatus(`${created} Varianten übernommen. ${skipped} übersprungen.${warnings.length ? ` ${warnings.join(" ")}` : ""}`);
    if (created > 0) setJsonResponse("");
  }

  return (
    <SoftPanel className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Karten-Detail</p>
          <h3 className="mt-1 break-words text-xl font-semibold text-[#17214f]">Original, Versionen und Anker</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSaveCard(card.id, form)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white"
          >
            <Save size={16} aria-hidden="true" />
            Speichern
          </button>
          <button
            type="button"
            onClick={() => onDeleteCard(card.id)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700"
          >
            <Trash2 size={16} aria-hidden="true" />
            Löschen
          </button>
        </div>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Vorderseite
          <textarea className="min-h-28 min-w-0 rounded-xl border border-[#dfe4f5] p-3" value={form.front} onChange={(event) => update("front", event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Rückseite
          <textarea className="min-h-28 min-w-0 rounded-xl border border-[#dfe4f5] p-3" value={form.back} onChange={(event) => update("back", event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Kartentyp
          <select className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3" value={form.kind} onChange={(event) => update("kind", event.target.value)}>
            {cardTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Tags
          <input className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3" value={form.tags} onChange={(event) => update("tags", event.target.value)} />
        </label>
      </div>
      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Initialer Anker</p>
          <CardHtml html={card.immutableOriginal?.front} mediaUrls={mediaUrls} />
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Quellenanker</p>
          <p className="mt-2 break-words text-sm text-[#17214f]">{card.sourceAnchors?.[0]?.documentName || "Kein Dokumentanker"}</p>
          <p className="mt-1 break-words text-sm text-[#66709a]">{card.sourceAnchors?.[0]?.textQuote || "Import- oder manuelle Originalkarte"}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Versionen</p>
          <p className="mt-2 text-2xl font-semibold text-[#17214f]">{card.versionLog?.length ?? 0}</p>
          <p className="mt-1 text-sm text-[#66709a]">Änderungslogeinträge</p>
        </div>
      </div>
      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Reifegrad</p>
          <p className="mt-2 break-words text-lg font-semibold text-[#17214f]">{maturityStageLabels[maturity.stage] ?? maturity.label}</p>
          <p className="mt-1 text-sm text-[#66709a]">Score {maturity.score} · {maturity.description}</p>
          <p className="mt-2 text-xs text-[#66709a]">Stability {getStateValue(card.reviewState, "stability")} · Difficulty {getStateValue(card.reviewState, "difficulty")} · Reps {getStateValue(card.reviewState, "reps", getStateValue(card.reviewState, "repetitions"))}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Variantenbereitschaft</p>
          <p className="mt-2 break-words text-lg font-semibold text-[#17214f]">{formatLevelList(readiness.allowedLevels)}</p>
          <p className="mt-1 break-words text-sm text-[#66709a]">Bevorzugt Level {readiness.preferredLevel}. {readiness.reason}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Variantenabdeckung</p>
          <p className="mt-2 break-words text-lg font-semibold text-[#17214f]">{coverage.activeRephraseCount} nahe Varianten</p>
          <p className="mt-1 break-words text-sm text-[#66709a]">{coverage.hasEnoughVariants ? "Genug Varianten vorhanden." : "Weitere nahe Umformulierungen möglich."}</p>
        </div>
      </div>
      <div className="mt-5 min-w-0 rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">KI-Variantenempfehlung</p>
            <p className="mt-1 break-words text-sm text-[#17214f]">{recommendation.shouldSuggest ? `${recommendation.recommendedVariantCount} nahe Umformulierung empfohlen.` : recommendation.reason}</p>
          </div>
          <button type="button" onClick={() => setShowPrompt((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]">
            <WandSparkles size={16} aria-hidden="true" />
            KI-Prompt für Varianten
          </button>
        </div>
        {showPrompt ? (
          <div className="mt-4 grid min-w-0 gap-3">
            {!generationPlan.canGenerate ? <p className="text-sm text-[#66709a]">Diese Karte ist noch nicht reif für automatische Varianten. Der Prompt kann trotzdem als Vorschau angezeigt werden.</p> : null}
            <textarea className="min-h-56 min-w-0 rounded-xl border border-[#dfe4f5] bg-white p-3 font-mono text-xs leading-5" value={promptPreview} readOnly />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyPrompt} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]">
                <Copy size={16} aria-hidden="true" />
                Prompt kopieren
              </button>
            </div>
            <textarea className="min-h-32 min-w-0 rounded-xl border border-[#dfe4f5] bg-white p-3 font-mono text-xs leading-5" value={jsonResponse} onChange={(event) => setJsonResponse(event.target.value)} placeholder='{"variants":[{"front":"...","back":"...","variantType":"basic","variantLevel":2,"relationToOriginal":"same_card_rephrasing","containsNewFacts":false,"abstractionLevel":1}]}' />
            <button type="button" onClick={applyJsonResponse} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl bg-indigo-700 px-3 text-sm font-semibold text-white">
              <Sparkles size={16} aria-hidden="true" />
              Varianten aus JSON übernehmen
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-5 min-w-0 rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#66709a]">Varianten dieser Grundkarte</p>
            <p className="mt-1 break-words text-sm text-[#66709a]">Varianten sind Umformulierungen derselben Wissenseinheit; der Hauptfortschritt bleibt auf der Grundkarte.</p>
          </div>
          <span className="rounded-xl bg-[#eef1fb] px-3 py-1 text-xs font-semibold text-[#4f5eb1]">{variants.length} Formen</span>
        </div>
        <div className="mt-4 grid gap-3">
          {variants.map((variant) => {
            const anchor = getVariantAnchor(card, variant);
            return (
              <article key={variant.id} className={`min-w-0 rounded-xl border p-3 ${variant.isOriginal ? "border-[#8c96dc] bg-[#f3f5fd]" : variant.isActive === false || variant.qualityStatus !== "active" ? "border-slate-200 bg-slate-50" : "border-[#e3e7f5] bg-[#f8f9fe]"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#66709a]">
                  <span className="rounded-lg bg-white px-2 py-1">{variant.isOriginal ? "Original" : "Variante"}</span>
                  <span>{variant.variantType}</span>
                  <span>Level {variant.variantLevel}</span>
                  <span>{variant.generationSource}</span>
                  <span>{variant.isActive === false || variant.qualityStatus !== "active" ? "inaktiv" : "aktiv"}</span>
                </div>
                <p className="break-words text-sm font-semibold text-[#17214f]">{variant.front}</p>
                <p className="mt-1 break-words text-sm text-[#66709a]">{variant.back}</p>
                <p className="mt-2 text-xs text-[#66709a]">{variant.isOriginal ? "Originalanker dieser Grundkarte." : `Verankert an ${anchor?.id === originalVariant?.id ? "Originalkarte" : anchor?.id ?? "Originalkarte"}.`} Attempts {variant.performance?.attempts ?? 0} · Richtig {variant.performance?.correctCount ?? 0} · Falsch {variant.performance?.wrongCount ?? 0}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 border-t border-[#e3e7f5] pt-4">
          <p className="text-sm font-semibold text-[#17214f]">Nahe Umformulierung hinzufügen</p>
          <p className="text-sm text-[#66709a]">Prüfe dieselbe Wissenseinheit. Keine neuen Fakten, keine neuen Konzepte.</p>
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3 text-sm" value={variantForm.front} onChange={(event) => updateVariantForm("front", event.target.value)} placeholder="Frage / Front" />
            <input className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3 text-sm" value={variantForm.back} onChange={(event) => updateVariantForm("back", event.target.value)} placeholder="Antwort / Back" />
            <select className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] px-3 text-sm" value={variantForm.variantLevel} onChange={(event) => updateVariantForm("variantLevel", Number(event.target.value))}>
              {[1, 2, 3].map((level) => (
                <option key={level} value={level}>Level {level}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={addManualVariant} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl bg-[#4f5eb1] px-3 text-sm font-semibold text-white">
            <PlusSquare size={16} aria-hidden="true" />
            Umformulierung hinzufügen
          </button>
          {variantStatus ? <p className="text-sm text-[#66709a]">{variantStatus}</p> : null}
        </div>
      </div>
    </SoftPanel>
  );
}

export function DecksScreen({ decks, initialSelectedDeckId = null, onSetDeckCoreMode, onSaveCard, onDeleteCard, onAddVariant, onApplyVariantJson, onStartDeck, onCreateDeck, onDeleteDeck, onRenameDeck, onMoveDeck, onOpenCardCreation, onOpenGraph, onShareDeck }) {
  const [query, setQuery] = React.useState("");
  const [modeFilter, setModeFilter] = React.useState("all");
  const [selectedDeckId, setSelectedDeckId] = React.useState(initialSelectedDeckId ?? decks[0]?.id ?? null);
  const [selectedCardId, setSelectedCardId] = React.useState(null);
  const [deckDraft, setDeckDraft] = React.useState({ name: "", parentDeckId: "" });
  const [deckStatus, setDeckStatus] = React.useState("");
  const [editingDeckId, setEditingDeckId] = React.useState(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [draggedDeckId, setDraggedDeckId] = React.useState(null);
  const [dragTargetDeckId, setDragTargetDeckId] = React.useState(null);
  const [isTopDropTarget, setIsTopDropTarget] = React.useState(false);
  const draggedDeckIdRef = React.useRef(null);
  const library = createDeckLibraryModel(decks, { query, coreMode: modeFilter, selectedDeckId });
  const filteredRows = library.filteredRows;
  const selectedRow = library.selectedRow;
  const selectedDeck = selectedRow?.deck ?? null;
  const { urls: selectedDeckMediaUrls } = useDeckMediaUrls(selectedDeck);

  React.useEffect(() => {
    if (!selectedDeckId && library.rows[0]) setSelectedDeckId(library.rows[0].id);
  }, [decks, selectedDeckId]);

  React.useEffect(() => {
    if (selectedDeckId && !decks.some((deck) => deck.id === selectedDeckId)) {
      setSelectedDeckId(library.rows[0]?.id ?? null);
    }
  }, [decks, selectedDeckId, library.rows]);

  React.useEffect(() => {
    if (initialSelectedDeckId && decks.some((deck) => deck.id === initialSelectedDeckId)) {
      setSelectedDeckId(initialSelectedDeckId);
    }
  }, [decks, initialSelectedDeckId]);

  function updateCoreMode(deck, coreMode) {
    onSetDeckCoreMode(deck.id, coreMode);
  }

  function saveCard(cardId, form) {
    if (!selectedDeck) return;
    onSaveCard(selectedDeck.id, cardId, {
      originalFront: form.front,
      originalBack: form.back,
      originalTags: form.tags,
      kind: form.kind,
    });
  }

  function deleteCard(cardId) {
    if (!selectedDeck) return;
    onDeleteCard(selectedDeck.id, cardId);
  }

  function updateDeckDraft(key, value) {
    setDeckDraft((current) => ({ ...current, [key]: value }));
  }

  function createDeckFromDraft(event) {
    event.preventDefault();
    const name = deckDraft.name.trim();
    if (!name) {
      setDeckStatus("Bitte gib einen Stapelnamen ein.");
      return;
    }

    const created = onCreateDeck({
      name,
      parentDeckId: deckDraft.parentDeckId || null,
    });
    setSelectedDeckId(created.id);
    setSelectedCardId(null);
    setDeckDraft({ name: "", parentDeckId: created.parentDeckId ?? "" });
    setDeckStatus(created.parentDeckId ? `Unterstapel "${created.name}" angelegt.` : `Stapel "${created.name}" angelegt.`);
  }

  function prepareSubdeck(deck) {
    setDeckDraft({ name: "", parentDeckId: deck.id });
    setDeckStatus(`Unterstapel unter "${deck.name}" anlegen.`);
  }

  function beginRename(deck) {
    setEditingDeckId(deck.id);
    setRenameDraft(deck.name);
    setDeckStatus(`"${deck.name}" umbenennen.`);
  }

  function cancelRename() {
    setEditingDeckId(null);
    setRenameDraft("");
  }

  function submitRename(event, deck) {
    event.preventDefault();
    const name = renameDraft.trim();
    if (!name) {
      setDeckStatus("Bitte gib einen Stapelnamen ein.");
      return;
    }

    const result = onRenameDeck?.(deck.id, name);
    if (result?.error) {
      setDeckStatus(result.error);
      return;
    }
    const renamedDeck = result?.deck ?? deck;
    setSelectedDeckId(renamedDeck.id);
    setEditingDeckId(null);
    setRenameDraft("");
    setDeckStatus(`Stapel "${renamedDeck.name}" umbenannt.`);
  }

  function startDrag(event, deck) {
    draggedDeckIdRef.current = deck.id;
    setDraggedDeckId(deck.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", deck.id);
  }

  function clearDragState() {
    draggedDeckIdRef.current = null;
    setDraggedDeckId(null);
    setDragTargetDeckId(null);
    setIsTopDropTarget(false);
  }

  function allowDeckDrop(event, targetDeckId = null) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTargetDeckId(targetDeckId);
    setIsTopDropTarget(targetDeckId === null);
  }

  function dropDeck(event, parentDeckId = null) {
    event.preventDefault();
    const sourceDeckId = event.dataTransfer.getData("text/plain") || draggedDeckIdRef.current || draggedDeckId;
    clearDragState();
    if (!sourceDeckId) return;

    const result = onMoveDeck?.(sourceDeckId, parentDeckId);
    if (result?.error) {
      setDeckStatus(result.error);
      return;
    }
    if (result?.changedDeckIds?.length === 0) {
      setDeckStatus("Stapel bleibt an dieser Stelle.");
      return;
    }
    const movedDeck = result?.deck;
    if (movedDeck) setSelectedDeckId(movedDeck.id);
    const targetLabel = parentDeckId ? decks.find((deck) => deck.id === parentDeckId)?.name ?? "Zielstapel" : "Hauptebene";
    setDeckStatus(parentDeckId ? `Stapel nach "${targetLabel}" verschoben.` : "Stapel auf die Hauptebene verschoben.");
  }

  function deleteDeckTree(deck, row) {
    const affectedDeckCount = row.scopeDeckIds?.length ?? 1;
    const childLabel = affectedDeckCount > 1 ? ` und ${affectedDeckCount - 1} Unterstapel` : "";
    const confirmed = window.confirm(`"${deck.name}"${childLabel} löschen? Karten und lokale Lernstände in diesem Stapelbaum werden entfernt.`);
    if (!confirmed) return;

    const result = onDeleteDeck(deck.id);
    setSelectedDeckId(result.nextSelectedDeckId);
    setSelectedCardId(null);
    setDeckStatus(`${result.deletedDeckIds.length} Stapel gelöscht.`);
  }

  return (
    <div className="grid min-w-0 gap-7">
      <PageHeader
        eyebrow="Bibliothek"
        title="Kartenstapel"
        body="Deck-Hierarchie, CoRe-Modus und Kartenpflege."
        action={
          <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#4f5eb1] px-5 text-sm font-semibold text-white">
            <PlusSquare size={17} aria-hidden="true" />
            Neue Karten
          </button>
        }
      />

      <SoftPanel className="p-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm text-[#66709a]">
            <Search size={17} aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen" />
          </label>
          <select className="min-h-11 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]" value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}>
            <option value="all">Alle Modi</option>
            <option value="off">Aus</option>
            <option value="auto">Auto</option>
            <option value="manual">Manuell</option>
          </select>
        </div>
        <form onSubmit={createDeckFromDraft} className="mt-4 grid min-w-0 gap-3 border-t border-[#e3e7f5] pt-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
            Stapelname
            <input
              className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-medium text-[#17214f] outline-none"
              value={deckDraft.name}
              onChange={(event) => updateDeckDraft("name", event.target.value)}
              placeholder="z. B. Anatomie"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
            Ebene
            <select
              className="min-h-11 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-medium text-[#17214f]"
              value={deckDraft.parentDeckId}
              onChange={(event) => updateDeckDraft("parentDeckId", event.target.value)}
            >
              <option value="">Als Hauptstapel</option>
              {library.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {"— ".repeat(row.depth)}{row.path}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
            <FolderPlus size={17} aria-hidden="true" />
            Stapel anlegen
          </button>
        </form>
        {deckStatus ? <p className="mt-3 text-sm font-semibold text-[#66709a]">{deckStatus}</p> : null}
      </SoftPanel>

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Noch keine passenden Stapel"
          body="Importiere oder erstelle Karten, damit die Bibliothek gefüllt wird."
          action={
            <button type="button" onClick={onOpenCardCreation} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
              Karten erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <div className="grid gap-4">
          <div
            data-testid="deck-top-drop-zone"
            aria-label="Drop-Zone für die Hauptebene"
            onDragOver={(event) => allowDeckDrop(event, null)}
            onDragLeave={() => setIsTopDropTarget(false)}
            onDrop={(event) => dropDeck(event, null)}
            className={`grid min-h-12 place-items-center rounded-2xl border border-dashed px-4 text-sm font-semibold transition ${
              isTopDropTarget ? "border-[#4f5eb1] bg-[#eef1fb] text-[#24327a]" : "border-[#dfe4f5] bg-white/45 text-[#66709a]"
            }`}
          >
            Auf die Hauptebene ziehen
          </div>
          {filteredRows.map((row) => {
            const deck = row.deck;
            const summary = row.summary;
            const isSelected = selectedRow?.id === row.id;
            const isRenaming = editingDeckId === deck.id;
            const isDropTarget = dragTargetDeckId === deck.id;
            return (
              <SoftPanel
                key={row.id}
                data-testid={`deck-row-${deck.id}`}
                onDragOver={(event) => allowDeckDrop(event, deck.id)}
                onDragLeave={() => setDragTargetDeckId(null)}
                onDrop={(event) => dropDeck(event, deck.id)}
                className={`p-4 transition sm:p-5 ${isSelected ? "ring-2 ring-[#8c96dc]" : ""} ${isDropTarget ? "border-[#8c96dc] bg-[#f3f5fd]" : ""}`}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-4" style={{ paddingLeft: `${Math.min(row.depth, 4) * 1.1}rem` }}>
                  <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-3">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => startDrag(event, deck)}
                      onDragEnd={clearDragState}
                      className="grid size-10 shrink-0 cursor-grab place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1] active:cursor-grabbing"
                      aria-label={`Stapel "${deck.name}" verschieben`}
                      title="Stapel verschieben"
                      data-testid={`deck-drag-handle-${deck.id}`}
                    >
                      <GripVertical size={18} aria-hidden="true" />
                    </button>
                    <OrbIcon icon={Layers} className="bg-[#eef1fb] text-[#6672bf]" />
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <form onSubmit={(event) => submitRename(event, deck)} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,1fr)_auto_auto]">
                          <label className="sr-only" htmlFor={`deck-rename-${deck.id}`}>Stapelname</label>
                          <input
                            id={`deck-rename-${deck.id}`}
                            className="min-h-10 min-w-0 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#17214f] outline-none"
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            autoFocus
                            data-testid={`deck-rename-input-${deck.id}`}
                          />
                          <button type="submit" className="grid size-10 place-items-center rounded-xl bg-[#4f5eb1] text-white" aria-label="Stapelname speichern" data-testid={`deck-rename-save-${deck.id}`}>
                            <Check size={17} aria-hidden="true" />
                          </button>
                          <button type="button" onClick={cancelRename} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label="Umbenennen abbrechen">
                            <X size={17} aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        <button type="button" onClick={() => setSelectedDeckId(deck.id)} className="block min-w-0 text-left" data-testid={`deck-select-${deck.id}`}>
                          <span className="block truncate text-lg font-semibold text-[#17214f]">{deck.name}</span>
                          <span className="block truncate text-sm text-[#66709a]">{row.path}</span>
                          {row.hasChildren ? <span className="mt-1 block text-xs font-semibold text-[#66709a]">{row.childrenCount} Unterstapel</span> : null}
                        </button>
                      )}
                    </div>
                  </div>
                  <CoreModeControl value={deck.deckSettings.coreMode} onChange={(mode) => updateCoreMode(deck, mode)} />
                  <div className="flex flex-[1_1_14rem] flex-wrap items-center gap-4 sm:flex-none">
                    <div className="grid min-w-14 gap-1">
                      <span className="text-xs font-semibold text-[#66709a]">Fällig</span>
                      <span className="text-xl font-semibold text-[#17214f]">{summary.dueCards}</span>
                    </div>
                    <div className="grid min-w-14 gap-1">
                      <span className="text-xs font-semibold text-[#66709a]">Neu</span>
                      <span className="text-xl font-semibold text-[#17214f]">{summary.newCards}</span>
                    </div>
                    <div className="grid min-w-14 gap-1">
                      <span className="text-xs font-semibold text-[#66709a]">Gesamt</span>
                      <span className="text-xl font-semibold text-[#17214f]">{summary.totalCards}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => beginRename(deck)} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label="Stapel umbenennen" data-testid={`deck-rename-button-${deck.id}`}>
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onStartDeck(deck, false)} className="grid size-10 place-items-center rounded-xl bg-[#eef1fb] text-[#4f5eb1]" aria-label="Lernen">
                      <Play size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onStartDeck(deck, true)} className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700" aria-label="Varianten">
                      <Sparkles size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onOpenGraph(deck)} className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700" aria-label="Graph">
                      <Network size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => onShareDeck(deck)} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label="Teilen">
                      <Share2 size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => prepareSubdeck(deck)} className="grid size-10 place-items-center rounded-xl bg-[#f8f9fe] text-[#4f5eb1]" aria-label="Unterstapel anlegen">
                      <FolderPlus size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => deleteDeckTree(deck, row)} className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-700" aria-label="Stapel löschen">
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </SoftPanel>
            );
          })}
        </div>
      )}

      {selectedDeck ? (
        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,0.85fr)_minmax(22rem,1.15fr)]">
          <SoftPanel className="p-5 sm:p-6">
            <h3 className="break-words text-xl font-semibold text-[#17214f]">Karten in {selectedDeck.name}</h3>
            <div className="mt-5 grid max-h-[28rem] min-w-0 gap-3 overflow-y-auto overflow-x-hidden pr-1">
              {(selectedRow?.cardRows ?? []).map((cardRow) => {
                const card = cardRow.card;
                return (
                  <button
                    key={cardRow.id}
                    type="button"
                    onClick={() => setSelectedCardId(cardRow.id)}
                    className={`min-w-0 rounded-xl border px-4 py-3 text-left ${
                      (selectedCardId ?? selectedRow?.cardRows[0]?.id) === cardRow.id ? "border-[#8c96dc] bg-[#f3f5fd]" : "border-[#e3e7f5] bg-white/70"
                    }`}
                  >
                    <span className="block truncate text-sm font-semibold text-[#17214f]">{cardRow.frontPreview}</span>
                    <span className="mt-1 block text-xs uppercase tracking-wide text-[#66709a]">{card.kind} · {card.reviewState.maturityBand}</span>
                  </button>
                );
              })}
            </div>
          </SoftPanel>
          <DeckCardEditor
            deck={selectedDeck}
            cards={selectedRow?.activeCards ?? []}
            selectedCardId={selectedCardId}
            mediaUrls={selectedDeckMediaUrls}
            onSaveCard={saveCard}
            onDeleteCard={deleteCard}
            onAddVariant={(cardId, variant) => onAddVariant(selectedDeck.id, cardId, variant)}
            onApplyVariantJson={(cardId, response, options) => onApplyVariantJson(selectedDeck.id, cardId, response, options)}
          />
        </div>
      ) : null}
    </div>
  );
}
