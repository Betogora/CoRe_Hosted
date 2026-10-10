import React from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import { createEmptyApkgImportSession } from "../apkgImportSession.ts";
import { createCreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";
import { ApkgImportPanel, type ImportCompletion } from "./ApkgImportPanel.tsx";
import { CreationHome, creationMethods } from "./CreationHome.tsx";
import { ManualCreationPanel } from "./ManualCreationPanel.tsx";

export type CreationScreenViewProps = Partial<CreationScreenProps>;

export function CreationScreen({
  decks = [],
  mediaStore = null,
  commitImport,
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
  onDraftStateChange = () => undefined,
  onSessionCompleted = () => undefined,
  onStartDeck = () => undefined,
  onReviewDeck = () => undefined,
  onOpenDashboard = () => undefined,
}: CreationScreenViewProps) {
  const completionHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const [sessionCompletion, setSessionCompletion] = React.useState<{ deckId: string; createdCount: number; kind: "import" | "manual"; importResult?: Pick<ImportCompletion, "partial" | "reimport"> } | null>(null);
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
  const resolvedCompletedCount = sessionCompletion?.createdCount ?? completedCount;
  const importResult = sessionCompletion?.importResult;
  const accountWorkflow = React.useMemo(
    () => createCreationWorkflow({
      mediaStore: mediaStore ?? undefined,
      ...(commitImport ? { commitImport } : {}),
    }),
    [commitImport, mediaStore],
  );

  function completeSession(deckId: string, createdCount: number, kind: "import" | "manual", importResult?: Pick<ImportCompletion, "partial" | "reimport">) {
    setSessionCompletion({ deckId, createdCount, kind, importResult });
    onSessionCompleted({ deckId, createdCount, kind });
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
          workflow={accountWorkflow}
          session={apkgImportSession}
          onSessionChange={onApkgImportSessionChange}
          isSessionCurrent={isApkgImportSessionCurrent}
          onResetSession={onResetApkgImportSession}
          onCompleted={(completion) => {
            completeSession(completion.deck.id, completion.createdCount, "import", { partial: completion.partial, reimport: completion.reimport });
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
          onSaveManualNote={onSaveManualNote}
          onFinish={({ createdCount, targetDeckId }) => completeSession(targetDeckId, createdCount, "manual")}
          onDraftStateChange={onDraftStateChange}
        />
      );
    }
    return null;
  }

  return (
    <div className="grid min-w-0 min-h-[calc(100vh-10rem)] content-start gap-6">
      <PageHeader eyebrow="Erstellen" title={completedDeck && resolvedCompletionKind === "import" ? "Import abgeschlossen" : "Neue Karte"} />
      {completedDeck ? (
        <SoftPanel className="mx-auto w-full max-w-3xl p-6 text-center sm:p-10">
          <span className="mx-auto grid size-12 place-items-center rounded-control bg-core-success-soft text-core-text">
            <CheckCircle2 size={34} aria-hidden="true" />
          </span>
          <p className="mt-6 core-body font-semibold text-core-text">Gespeichert</p>
          <h2 ref={completionHeadingRef} tabIndex={-1} className="mt-2 core-heading-2 font-semibold text-core-text outline-none">
            {resolvedCompletionKind !== "import" ? "Deine Karten sind bereit" : importResult?.partial ? "Import lokal abgeschlossen" : "Import erfolgreich"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl core-body-large leading-7 text-core-muted">
            {resolvedCompletedCount} {resolvedCompletedCount === 1 ? "Karte wurde" : "Karten wurden"} {resolvedCompletionKind === "import" ? "aus" : "in"} „{(completedDeck.hierarchyPath.length ? completedDeck.hierarchyPath : [completedDeck.name]).join(" / ")}“ {resolvedCompletionKind === "import" && !importResult?.partial ? "vollständig gespeichert." : "gespeichert."}
          </p>
          {importResult?.partial ? <p className="mx-auto mt-2 max-w-xl core-body text-core-muted">Die Karten sind nutzbar. Cloud- und Mediensynchronisierung laufen im Hintergrund weiter.</p> : null}
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
        </SoftPanel>
      ) : selectedMethod ? (
        <section className="grid min-w-0 min-h-[calc(100vh-16rem)] content-start gap-4" aria-label={selectedMethodMeta?.title ?? "Kartenerstellung"}>
          <button type="button" onClick={() => onMethodChange("")} className="inline-flex min-h-control w-fit items-center gap-2 rounded-control border border-core-border bg-core-surface px-3 core-body font-semibold text-core-action hover:bg-core-surface">
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
