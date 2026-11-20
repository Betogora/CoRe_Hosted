import { requestAiSourceCards } from "../aiSourceCards.ts";
import { resolveApkgCreationMethod } from "../apkgImportSession.ts";
import { useAppServices } from "../useAppServices.ts";
import { useWorkspaceValue } from "../useWorkspaceStore.ts";
import { CreationScreen } from "./CreationScreen.tsx";

export function CreationScreenWiring() {
  const { navigation, studyStart, cardCommands, cardEditorServices, importCommands, importSession, mediaStore, cloud } = useAppServices();
  const decks = useWorkspaceValue((snapshot) => snapshot.state?.decks);
  const accountId = useWorkspaceValue((snapshot) => snapshot.state?.profile.userId);
  const { creationMethod, creationDeckId, completedDeckId, completedCount, completionKind, navigateToView, navigateToViewNow } = navigation;
  if (!decks) return null;
  return (
    <CreationScreen
      accountId={accountId}
      decks={decks}
      mediaStore={mediaStore}
      importActions={importCommands}
      apkgImportSession={importSession.session}
      onApkgImportSessionChange={importSession.setSession}
      isApkgImportSessionCurrent={importSession.isCurrent}
      onResetApkgImportSession={importSession.reset}
      initialMethod={resolveApkgCreationMethod(creationMethod, importSession.session)}
      initialTargetDeckId={creationDeckId}
      completedDeckId={completedDeckId}
      completedCount={completedCount}
      completionKind={completionKind}
      onMethodChange={(method) => {
        if (!method && importSession.hasVisibleSession()) importSession.reset();
        navigateToView("neue-karten", method ? {
          creationMethod: method,
          creationDeckId: method === "manual" ? creationDeckId || decks[0]?.id : method === "ai-source" ? creationDeckId || null : null,
        } : {});
      }}
      onTargetDeckChange={(deckId) => navigateToViewNow("neue-karten", {
        creationMethod: "manual",
        creationDeckId: deckId || null,
      })}
      onSaveManualNote={cardCommands.saveManualNote}
      listDeckContents={cardCommands.listDeckContents}
      onImportTextNotes={cardCommands.importTextNotes}
      onRequestSourceCards={(request, signal) => requestAiSourceCards(request, cloud, signal)}
      listTagDirectory={cardEditorServices.listTagDirectory}
      onDraftStateChange={navigation.handleCreationDraftStateChange}
      onSessionCompleted={(completion) => navigateToViewNow("neue-karten", {
        completedDeckId: completion.deckId,
        completedCount: completion.createdCount,
        completionKind: completion.kind,
      }, { replace: true })}
      onStartDeck={studyStart.startDeck}
      onReviewDeck={(deckId) => navigateToViewNow("kartenstapel", { focusedDeckId: deckId, deckContent: true, deckContentTab: "cards" })}
      onOpenDashboard={() => navigateToViewNow("uebersicht")}
    />
  );
}
