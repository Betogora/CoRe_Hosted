import React from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import { createEmptyApkgImportSession } from "../apkgImportSession.ts";
import { createCreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { ApkgImportPanel } from "./ApkgImportPanel.tsx";
import { CreationHome, creationMethods } from "./CreationHome.tsx";
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
  completedCount = 0,
  completionKind = "",
  onMethodChange = () => undefined,
  onTargetDeckChange = () => undefined,
  onCreated = async (deck) => deck,
  onAppendManualCard = async () => null,
  onDraftStateChange = () => undefined,
  onSessionCompleted = () => undefined,
  onStartDeck = () => undefined,
  onReviewDeck = () => undefined,
  onOpenDashboard = () => undefined,
}: CreationScreenViewProps) {
  const completionHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const [sessionCompletion, setSessionCompletion] = React.useState<{ deckId: string; createdCount: number; kind: "import" | "manual" } | null>(null);
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
  const resolvedCompletionKind = sessionCompletion?.kind ?? completionKind;
  const resolvedCompletedCount = sessionCompletion?.createdCount
    ?? (completionKind ? completedCount : completedDeck?.cards.filter((card) => card.status !== "deleted").length)
    ?? 0;
  const accountWorkflow = React.useMemo(
    () => createCreationWorkflow({
      mediaStore: mediaStore ?? undefined,
      ...(persistImportedDecks ? { persistImportedDecks } : {}),
    }),
    [mediaStore, persistImportedDecks],
  );

  function completeSession(deckId: string, createdCount: number, kind: "import" | "manual") {
    const completion = { deckId, createdCount, kind };
    setSessionCompletion(completion);
    onSessionCompleted(completion);
  }

  React.useEffect(() => {
    if (!completedDeck) return;
    const frame = window.requestAnimationFrame(() => completionHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [completedDeck]);

  function renderSelectedMethod() {
    if (selectedMethod === "import") {
      return (
        <ApkgImportPanel
          existingDecks={decks}
          workflow={accountWorkflow}
          mediaStore={mediaStore}
          session={apkgImportSession}
          onSessionChange={onApkgImportSessionChange}
          isSessionCurrent={isApkgImportSessionCurrent}
          onResetSession={onResetApkgImportSession}
          onCompleted={(completion) => {
            completeSession(completion.deck.id, completion.createdCount, "import");
          }}
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
          onFinish={({ createdCount, targetDeckId }) => completeSession(targetDeckId, createdCount, "manual")}
          onDraftStateChange={onDraftStateChange}
        />
      );
    }
    return null;
  }

  return (
    <div className="grid min-w-0 min-h-[calc(100vh-10rem)] content-start gap-7">
      <PageHeader eyebrow="Erstellen" title={completedDeck && resolvedCompletionKind === "import" ? "Import abgeschlossen" : "Neue Karte"} />
      {completedDeck ? (
        <SoftPanel className="mx-auto w-full max-w-3xl p-7 text-center sm:p-10">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-core-success-soft text-core-text">
            <CheckCircle2 size={34} aria-hidden="true" />
          </span>
          <p className="mt-5 core-body font-semibold uppercase tracking-wide text-core-text">Gespeichert</p>
          <h2 ref={completionHeadingRef} tabIndex={-1} className="mt-2 core-heading-2 font-semibold text-[var(--core-text)] outline-none">
            {resolvedCompletionKind === "import" ? "Import erfolgreich" : "Deine Karten sind bereit"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl core-body-large leading-7 text-[var(--core-text-muted)]">
            {resolvedCompletedCount} {resolvedCompletedCount === 1 ? "Karte wurde" : "Karten wurden"} {resolvedCompletionKind === "import" ? "aus" : "in"} „{(completedDeck.hierarchyPath.length ? completedDeck.hierarchyPath : [completedDeck.name]).join(" / ")}“ {resolvedCompletionKind === "import" ? "vollständig gespeichert." : "gespeichert."}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <ActionButton type="button" variant="primary" onClick={() => onStartDeck(completedDeck)}>Jetzt lernen</ActionButton>
            {resolvedCompletionKind === "import" ? (
              <ActionButton type="button" variant="secondary" onClick={onOpenDashboard}>Zur Übersicht</ActionButton>
            ) : (
              <>
                <ActionButton type="button" variant="secondary" onClick={() => onReviewDeck(completedDeck.id)}>Karten prüfen</ActionButton>
                <ActionButton type="button" variant="secondary" onClick={() => {
                  setSessionCompletion(null);
                  onMethodChange("manual");
                }}>Weitere Karten erstellen</ActionButton>
              </>
            )}
          </div>
        </SoftPanel>
      ) : selectedMethod ? (
        <section className="grid min-w-0 min-h-[calc(100vh-16rem)] content-start gap-5" aria-label={selectedMethodMeta?.title ?? "Kartenerstellung"}>
          <button type="button" onClick={() => onMethodChange("")} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-[var(--core-border)] bg-core-surface px-3 core-body font-semibold text-[var(--core-action-primary)] hover:bg-core-surface">
            <ArrowLeft size={16} aria-hidden="true" />
            Erstellen
          </button>
          {renderSelectedMethod()}
        </section>
      ) : (
        <CreationHome onSelect={onMethodChange} />
      )}
    </div>
  );
}
