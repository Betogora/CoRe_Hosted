import React from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import { createEmptyApkgImportSession } from "../apkgImportSession.ts";
import { createCreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { CreationHome, creationMethods } from "./CreationHome.tsx";
import { ImportCreationPanel } from "./ImportCreationPanel.tsx";
import { ManualCreationPanel } from "./ManualCreationPanel.tsx";

type ManualCardInput = Parameters<CreationScreenProps["onAppendManualCard"]>[1];

export interface CreationScreenViewProps extends Omit<Partial<CreationScreenProps>, "onCreated" | "onAppendManualCard"> {
  onCreated?: (deck: Deck) => unknown;
  onAppendManualCard?: (deckId: string, input: ManualCardInput) => unknown;
}

export function CreationScreen({
  decks = [],
  mediaStore = null,
  persistImportedDecks,
  apkgImportSession: controlledApkgImportSession,
  onApkgImportSessionChange: controlledApkgImportSessionChange,
  isApkgImportSessionCurrent: controlledIsApkgImportSessionCurrent,
  onResetApkgImportSession: controlledResetApkgImportSession,
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
}: CreationScreenViewProps) {
  const completionHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const [sessionCompletion, setSessionCompletion] = React.useState<{ deckId: string; createdCount: number } | null>(null);
  const [localApkgImportSession, setLocalApkgImportSession] = React.useState(() => createEmptyApkgImportSession());
  const apkgImportSession = controlledApkgImportSession ?? localApkgImportSession;
  const apkgImportSessionRef = React.useRef(apkgImportSession);
  apkgImportSessionRef.current = apkgImportSession;
  const onApkgImportSessionChange = controlledApkgImportSessionChange ?? setLocalApkgImportSession;
  const isApkgImportSessionCurrent = controlledIsApkgImportSessionCurrent ?? ((version: number) => apkgImportSessionRef.current.version === version);
  const onResetApkgImportSession = controlledResetApkgImportSession ?? (() => setLocalApkgImportSession((current) => createEmptyApkgImportSession(current.version + 1)));
  const selectedMethod = initialMethod;
  const selectedMethodMeta = creationMethods.find((method) => method.id === selectedMethod);
  const completedDeck = decks.find((deck) => deck.id === (sessionCompletion?.deckId || completedDeckId)) ?? null;
  const completedCount = sessionCompletion?.createdCount
    ?? completedDeck?.cards.filter((card) => card.status !== "deleted").length
    ?? 0;
  const accountWorkflow = React.useMemo(
    () => createCreationWorkflow({
      mediaStore: mediaStore ?? undefined,
      ...(persistImportedDecks ? { persistImportedDecks } : {}),
    }),
    [mediaStore, persistImportedDecks],
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
            completeSession(deck.id, deck.cardCount ?? deck.cards.filter((card) => card.status !== "deleted").length);
          }}
          workflow={accountWorkflow}
          mediaStore={mediaStore}
          apkgImportSession={apkgImportSession}
          onApkgImportSessionChange={onApkgImportSessionChange}
          isApkgImportSessionCurrent={isApkgImportSessionCurrent}
          onResetApkgImportSession={onResetApkgImportSession}
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
    return null;
  }

  return (
    <div className="grid min-w-0 min-h-[calc(100vh-10rem)] content-start gap-7">
      <PageHeader eyebrow="Erstellen" title="Neue Karte" />
      {completedDeck ? (
        <SoftPanel className="mx-auto w-full max-w-3xl p-7 text-center sm:p-10">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-core-success-soft text-core-text">
            <CheckCircle2 size={34} aria-hidden="true" />
          </span>
          <p className="mt-5 core-body font-semibold uppercase tracking-wide text-core-text">Gespeichert</p>
          <h2 ref={completionHeadingRef} tabIndex={-1} className="mt-2 core-heading-2 font-semibold text-[var(--core-text)] outline-none">Deine Karten sind bereit</h2>
          <p className="mx-auto mt-3 max-w-xl core-body-large leading-7 text-[var(--core-text-muted)]">
            {completedCount} {completedCount === 1 ? "Karte wurde" : "Karten wurden"} in „{(completedDeck.hierarchyPath.length ? completedDeck.hierarchyPath : [completedDeck.name]).join(" / ")}“ gespeichert.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => onStartDeck(completedDeck)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--core-action-primary)] px-6 core-body font-semibold text-[var(--core-text-on-accent)]">
              Jetzt lernen
            </button>
            <button type="button" onClick={() => onReviewDeck(completedDeck.id)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--core-border)] bg-core-surface px-6 core-body font-semibold text-[var(--core-action-primary)]">
              Karten prüfen
            </button>
            <button type="button" onClick={() => {
              setSessionCompletion(null);
              onMethodChange("manual");
            }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--core-border)] bg-core-surface px-6 core-body font-semibold text-[var(--core-action-primary)]">
              Weitere Karten erstellen
            </button>
          </div>
        </SoftPanel>
      ) : selectedMethod ? (
        <section className="grid min-w-0 min-h-[calc(100vh-16rem)] content-start gap-5" aria-label={selectedMethodMeta?.title ?? "Kartenerstellung"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => onMethodChange("")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body font-semibold text-[var(--core-action-primary)] hover:bg-core-surface">
              <ArrowLeft size={16} aria-hidden="true" />
              Auswahl
            </button>
          </div>
          {renderSelectedMethod()}
        </section>
      ) : (
        <CreationHome onSelect={onMethodChange} />
      )}
    </div>
  );
}
