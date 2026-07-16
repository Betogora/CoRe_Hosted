import React from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import { createCreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import type { ProductSurface } from "../productSurfaces.ts";
import { createServerApkgImportClient } from "../serverApkgImport.ts";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { AiDraftLabPanel } from "./AiDraftLabPanel.tsx";
import { CreationHome, creationMethods } from "./CreationHome.tsx";
import { ImportCreationPanel } from "./ImportCreationPanel.tsx";
import { ManualCreationPanel } from "./ManualCreationPanel.tsx";

const defaultAiDraftSurface: ProductSurface = {
  id: "local-ai-drafts",
  maturity: "labs",
  mainNavigation: false,
};

type ManualCardInput = Parameters<CreationScreenProps["onAppendManualCard"]>[1];

export interface CreationScreenViewProps extends Omit<Partial<CreationScreenProps>, "onCreated" | "onAppendManualCard"> {
  onCreated?: (deck: Deck) => unknown;
  onAppendManualCard?: (deckId: string, input: ManualCardInput) => unknown;
}

export function CreationScreen({
  decks = [],
  mediaStore = null,
  persistImportedDecks = async () => undefined,
  supabase,
  supabaseUrl = "",
  initialMethod = "",
  initialTargetDeckId = "",
  completedDeckId = "",
  onMethodChange = () => undefined,
  onTargetDeckChange = () => undefined,
  onCreated = async (deck) => deck,
  onAppendManualCard = async () => null,
  onDraftStateChange = () => undefined,
  onSessionCompleted = () => undefined,
  onStartDeck = () => undefined,
  onReviewDeck = () => undefined,
  onJob = () => undefined,
  showAiDrafts = false,
  aiDraftSurface = defaultAiDraftSurface,
  enableServerApkgImport = false,
}: CreationScreenViewProps) {
  const completionHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const [sessionCompletion, setSessionCompletion] = React.useState<{ deckId: string; createdCount: number } | null>(null);
  const selectedMethod = initialMethod;
  const selectedMethodMeta = creationMethods.find((method) => method.id === selectedMethod && (method.id !== "ai" || showAiDrafts));
  const completedDeck = decks.find((deck) => deck.id === (sessionCompletion?.deckId || completedDeckId)) ?? null;
  const completedCount = sessionCompletion?.createdCount
    ?? completedDeck?.cards.filter((card) => card.status !== "deleted").length
    ?? 0;
  const serverApkgImport = React.useMemo(
    () => enableServerApkgImport && supabase && supabaseUrl ? createServerApkgImportClient({ client: supabase, supabaseUrl }) : null,
    [enableServerApkgImport, supabase, supabaseUrl],
  );
  const accountWorkflow = React.useMemo(
    () => createCreationWorkflow({ mediaStore: mediaStore ?? undefined, persistImportedDecks, serverApkgImport }),
    [mediaStore, persistImportedDecks, serverApkgImport],
  );

  function completeSession(deckId: string, createdCount: number) {
    setSessionCompletion({ deckId, createdCount });
    onSessionCompleted(deckId);
  }

  React.useEffect(() => {
    if (!completedDeck) return;
    const frame = window.requestAnimationFrame(() => completionHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [completedDeck]);

  function renderSelectedMethod() {
    if (selectedMethod === "import") {
      return (
        <ImportCreationPanel
          decks={decks}
          onCreated={onCreated}
          onImportCompleted={(deck) => {
            completeSession(deck.id, deck.cards.filter((card) => card.status !== "deleted").length);
          }}
          workflow={accountWorkflow}
          mediaStore={mediaStore}
          serverApkgEnabled={enableServerApkgImport}
        />
      );
    }
    if (selectedMethod === "manual") {
      return (
        <ManualCreationPanel
          decks={decks}
          workflow={accountWorkflow}
          initialTargetDeckId={initialTargetDeckId}
          onTargetDeckChange={onTargetDeckChange}
          onCreated={onCreated}
          onAppendManualCard={async (deckId, input) => {
            const result = await onAppendManualCard(deckId, input);
            return result && typeof result === "object" && "id" in result ? result as Deck : null;
          }}
          onFinish={({ createdCount, targetDeckId }) => completeSession(targetDeckId, createdCount)}
          onDraftStateChange={onDraftStateChange}
        />
      );
    }
    if (selectedMethod === "ai" && showAiDrafts) {
      return <AiDraftLabPanel workflow={accountWorkflow} onCreated={onCreated} onJob={onJob} surface={aiDraftSurface} />;
    }
    return null;
  }

  return (
    <div className="grid min-h-[calc(100vh-10rem)] content-start gap-7">
      <PageHeader eyebrow="Erstellen" title="Neue Karten" />
      {completedDeck ? (
        <SoftPanel className="mx-auto w-full max-w-3xl p-7 text-center sm:p-10">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-teal-50 text-teal-700">
            <CheckCircle2 size={34} aria-hidden="true" />
          </span>
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-teal-700">Gespeichert</p>
          <h2 ref={completionHeadingRef} tabIndex={-1} className="mt-2 text-3xl font-semibold text-[#17214f] outline-none">Deine Karten sind bereit</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#66709a]">
            {completedCount} {completedCount === 1 ? "Karte wurde" : "Karten wurden"} in „{(completedDeck.hierarchyPath.length ? completedDeck.hierarchyPath : [completedDeck.name]).join(" / ")}“ gespeichert.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => onStartDeck(completedDeck)} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#4f5eb1] px-6 text-sm font-semibold text-white">
              Jetzt lernen
            </button>
            <button type="button" onClick={() => onReviewDeck(completedDeck.id)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#dfe4f5] bg-white px-6 text-sm font-semibold text-[#4f5eb1]">
              Karten prüfen
            </button>
            <button type="button" onClick={() => {
              setSessionCompletion(null);
              onMethodChange("manual");
            }} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#dfe4f5] bg-white px-6 text-sm font-semibold text-[#4f5eb1]">
              Weitere Karten erstellen
            </button>
          </div>
        </SoftPanel>
      ) : selectedMethod ? (
        <section className="grid min-h-[calc(100vh-16rem)] content-start gap-5" aria-label={selectedMethodMeta?.title ?? "Kartenerstellung"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => onMethodChange("")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/78 px-3 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
              <ArrowLeft size={16} aria-hidden="true" />
              Auswahl
            </button>
            {selectedMethodMeta ? <p className="text-sm font-semibold uppercase tracking-wide text-[#66709a]">{selectedMethodMeta.eyebrow}</p> : null}
          </div>
          {renderSelectedMethod()}
        </section>
      ) : (
        <CreationHome showAiDrafts={showAiDrafts} onSelect={onMethodChange} />
      )}
    </div>
  );
}
