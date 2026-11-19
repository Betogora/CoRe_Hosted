import React from "react";
import { CheckCircle2 } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import { createEmptyApkgImportSession } from "../apkgImportSession.ts";
import { createCreationWorkflow, type InterruptedImport } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import type { ImportCompletion } from "../apkgImportSession.ts";
import { ApkgCardSample, ApkgImportPanel, useSampleMediaUrls } from "./ApkgImportPanel.tsx";
import { CreationHome, creationMethods } from "./CreationHome.tsx";
import { ManualCreationPanel } from "./ManualCreationPanel.tsx";
import { AiSourceCreationPanel } from "./AiSourceCreationPanel.tsx";

export type CreationScreenViewProps = Partial<CreationScreenProps>;

const NO_MEDIA: ImportCompletion["sampleMedia"] = [];

export function CreationScreen({
  decks = [],
  mediaStore = null,
  importActions,
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
  onSaveManualNote = async () => null,
  listTagDirectory,
  onDraftStateChange = () => undefined,
  onSessionCompleted = () => undefined,
  onStartDeck = () => undefined,
  onReviewDeck = () => undefined,
  onOpenDashboard = () => undefined,
}: CreationScreenViewProps) {
  const completionHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const [sessionCompletion, setSessionCompletion] = React.useState<{ deckId: string; createdCount: number; kind: "import" | "manual"; importResult?: Pick<ImportCompletion, "reimport" | "samples" | "sampleMedia"> } | null>(null);
  const [localApkgImportSession, setLocalApkgImportSession] = React.useState(() => createEmptyApkgImportSession());
  const apkgImportSession = controlledApkgImportSession ?? localApkgImportSession;
  const apkgImportSessionRef = React.useRef(apkgImportSession);
  apkgImportSessionRef.current = apkgImportSession;
  const onApkgImportSessionChange = controlledApkgImportSessionChange ?? setLocalApkgImportSession;
  const isApkgImportSessionCurrent = controlledIsApkgImportSessionCurrent ?? ((version: number) => apkgImportSessionRef.current.version === version);
  const onResetApkgImportSession = controlledResetApkgImportSession ?? (() => setLocalApkgImportSession((current) => createEmptyApkgImportSession(current.version + 1)));
  const selectedMethod = initialMethod;
  const selectedMethodMeta = creationMethods.find((method) => method.id === selectedMethod);
  const backToCreation = { label: "Erstellen", onSelect: () => {
    setSessionCompletion(null);
    onMethodChange("");
  } };
  const methodHeader = (action?: React.ReactNode) => <PageHeader title={selectedMethodMeta?.pageTitle ?? "Neue Karte"} back={backToCreation} action={action} />;
  const completedDeck = decks.find((deck) => deck.id === (sessionCompletion?.deckId || completedDeckId)) ?? null;
  const resolvedCompletionKind = sessionCompletion?.kind ?? completionKind;
  const resolvedCompletedCount = sessionCompletion?.createdCount ?? completedCount;
  const importResult = sessionCompletion?.importResult;
  const completionSampleUrls = useSampleMediaUrls(importResult?.sampleMedia ?? NO_MEDIA);
  // Read again with every new import session, since a finished takeover clears it.
  const [interruptedImport, setInterruptedImport] = React.useState<InterruptedImport | null>(null);
  React.useEffect(() => {
    let active = true;
    void importActions?.getInterruptedImport().then((interrupted) => { if (active) setInterruptedImport(interrupted); }).catch(() => undefined);
    return () => { active = false; };
  }, [importActions, apkgImportSession.version]);
  const accountWorkflow = React.useMemo(
    () => createCreationWorkflow({
      mediaStore: mediaStore ?? undefined,
      ...(importActions ? { commitImport: importActions.commitImport } : {}),
    }),
    [importActions, mediaStore],
  );

  function completeSession(deckId: string, createdCount: number, kind: "import" | "manual", importResult?: Pick<ImportCompletion, "reimport" | "samples" | "sampleMedia">) {
    setSessionCompletion({ deckId, createdCount, kind, importResult });
    onSessionCompleted({ deckId, createdCount, kind });
  }

  React.useEffect(() => {
    if (!completedDeck) return;
    const frame = window.requestAnimationFrame(() => completionHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [completedDeck]);

  function renderSelectedMethod() {
    if (selectedMethod === "ai-source") {
      return <>{methodHeader()}<AiSourceCreationPanel key={initialTargetDeckId} decks={decks} initialTargetDeckId={initialTargetDeckId} onDraftStateChange={onDraftStateChange} /></>;
    }
    if (selectedMethod === "import") {
      return (
        <>
        {methodHeader()}
        <ApkgImportPanel
          workflow={accountWorkflow}
          session={apkgImportSession}
          onSessionChange={onApkgImportSessionChange}
          isSessionCurrent={isApkgImportSessionCurrent}
          onResetSession={onResetApkgImportSession}
          interruptedImport={interruptedImport}
          onCompleted={(completion) => {
            completeSession(completion.deck.id, completion.createdCount, "import", completion);
          }}
        />
        </>
      );
    }
    if (selectedMethod === "manual") {
      return (
        <ManualCreationPanel
          decks={decks}
          workflow={accountWorkflow}
          initialTargetDeckId={initialTargetDeckId}
          onTargetDeckChange={onTargetDeckChange}
          onSaveManualNote={onSaveManualNote}
          listTagDirectory={listTagDirectory}
          onFinish={({ createdCount, targetDeckId }) => completeSession(targetDeckId, createdCount, "manual")}
          onDraftStateChange={onDraftStateChange}
          renderHeader={methodHeader}
        />
      );
    }
    return null;
  }

  return (
    <div className="grid min-w-0 min-h-[calc(100vh-10rem)] content-start gap-6">
      {completedDeck ? (
        <>
        <PageHeader title={creationMethods.find((method) => method.id === (resolvedCompletionKind === "import" ? "import" : "manual"))!.pageTitle} back={backToCreation} />
        <SoftPanel className="mx-auto w-full max-w-3xl p-6 text-center sm:p-10">
          <CheckCircle2 size={32} className="mx-auto text-core-success" aria-hidden="true" />
          <h2 ref={completionHeadingRef} tabIndex={-1} className="mt-4 core-heading-2 text-core-text outline-none">
            {resolvedCompletionKind !== "import" ? "Deine Karten sind bereit" : "Import erfolgreich"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl core-body text-core-secondary">
            {resolvedCompletedCount} {resolvedCompletedCount === 1 ? "Karte wurde" : "Karten wurden"} {resolvedCompletionKind === "import" ? "aus" : "in"} „{(completedDeck.hierarchyPath.length ? completedDeck.hierarchyPath : [completedDeck.name]).join(" / ")}“ gespeichert.
          </p>
          {importResult?.reimport?.keptLocalEdits ? <p className="mx-auto mt-2 max-w-xl core-body text-core-muted">{importResult.reimport.keptLocalEdits} lokal {importResult.reimport.keptLocalEdits === 1 ? "bearbeiteter Inhalt blieb" : "bearbeitete Inhalte blieben"} unverändert.</p> : null}
          {importResult?.reimport?.missingInPackage ? <p className="mx-auto mt-2 max-w-xl core-body text-core-muted">{importResult.reimport.missingInPackage} {importResult.reimport.missingInPackage === 1 ? "Karte fehlt" : "Karten fehlen"} im Paket und {importResult.reimport.missingInPackage === 1 ? "bleibt" : "bleiben"} erhalten.</p> : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
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
          {importResult?.samples.length ? (
            <div className="mt-6 grid gap-4 text-left" data-testid="import-completion-samples">
              {importResult.samples.map((sample) => <ApkgCardSample key={sample.card.id} {...sample} urlsBySha1={completionSampleUrls} />)}
            </div>
          ) : null}
        </SoftPanel>
        </>
      ) : selectedMethod ? (
        <section className="core-creation-way grid min-w-0 min-h-[calc(100vh-10rem)] content-start gap-6" aria-label={selectedMethodMeta?.title ?? "Kartenerstellung"}>
          {renderSelectedMethod()}
        </section>
      ) : (
        <>
          <PageHeader title="Neue Karte" />
          <CreationHome onSelect={onMethodChange} />
        </>
      )}
    </div>
  );
}
