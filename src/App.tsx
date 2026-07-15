import React from "react";
import type { User } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import type { AuthPhase } from "./accountSession.ts";
import type { CoreMode, Deck, ReviewEvent, SyncStatus } from "./coreTypes.ts";
import { BarChart3, BookOpen, Bot, Database, FlaskConical, History, Home, Layers, Network, PlusSquare, Settings, Users } from "lucide-react";
import { authPhaseForSession, authPhases, createSyncConflictStatus, createSyncErrorStatus, createSyncIdleStatus, createSyncPendingStatus, createSyncSavedStatus, shouldShowAppShell, shouldShowAuthGate } from "./accountSession.ts";
import { createStudyRoute, createViewRoute } from "./appNavigation.ts";
import { markLocalMigrationHandled, readLegacyLocalState } from "./accountStorage.ts";
import { startAppMediaRetryLifecycle } from "./appMediaLifecycle.ts";
import type {
  AiJobsScreenProps,
  AssistantScreenProps,
  CommunityScreenProps,
  CreationScreenProps,
  DashboardScreenProps,
  DeckSettingsScreenProps,
  DecksScreenProps,
  GraphScreenProps,
  LearnScreenProps,
  SettingsScreenProps,
  StatisticsScreenProps,
  StudyModeProps,
} from "./appScreenProps.ts";
import { startAppAutosaveLifecycle, startAppSyncLifecycle } from "./appSyncLifecycle.ts";
import { bootAuthenticatedWorkspace, startAuthenticatedWorkspaceSessionLifecycle } from "./authenticatedWorkspaceBoot.ts";
import { AI_CHAT_CONSENT_VERSION } from "./aiChatContract.ts";
import { clearCloudAuthRedirectParams, formatCloudAuthError, getCloudUser, resetCloudPassword, signInCloudAccount, signInWithGoogle, signInWithMagicLink, signOutCloudAccount, signUpCloudAccount, updateCloudPassword } from "./cloudAuth.ts";
import { mergeCloudSyncMetadata, replaceAccountCloudState } from "./cloudRepository.ts";
import type { CoreWorkspace, WorkspaceState } from "./coreWorkspace.ts";
import { createPortableExport, mergePortableExportIntoState } from "./dataPortability.ts";
import { applyLearningSettingsToDeckSettings, getGlobalDeckSettings, withGlobalDeckSettings, type LearningSettingsInput } from "./deckSettings.ts";
import { createMenuModel } from "./menuModel.ts";
import { createAccountMediaStore } from "./mediaStore.ts";
import { productSurfaces, type ProductSurfaceId } from "./productSurfaces.ts";
import { SYNC_MUTATION_TYPES, type AccountSyncEngine } from "./syncEngine.ts";
import { createBrowserSyncDevice } from "./syncDevice.ts";
import { createSupabaseBrowserClient, getSupabaseBrowserConfig } from "./supabaseClient.ts";
import { useAppNavigation } from "./useAppNavigation.ts";
import { AuthGateScreen } from "./screens/AuthGateScreen.tsx";
import { LabsNotice, OrbIcon, SoftPanel } from "./ui/coreUi.tsx";

const AssistantScreen = React.lazy<React.ComponentType<AssistantScreenProps>>(() => import("./screens/AssistantScreen.tsx").then(({ AssistantScreen }) => ({ default: AssistantScreen })));
const AiJobsScreen = React.lazy<React.ComponentType<AiJobsScreenProps>>(() => import("./screens/AiJobsScreen.tsx").then(({ AiJobsScreen }) => ({ default: AiJobsScreen })));
const CommunityScreen = React.lazy<React.ComponentType<CommunityScreenProps>>(() => import("./screens/CommunityScreen.tsx").then(({ CommunityScreen }) => ({ default: CommunityScreen })));
const CreationScreen = React.lazy<React.ComponentType<CreationScreenProps>>(() => import("./screens/CreationScreen.tsx").then(({ CreationScreen }) => ({ default: CreationScreen })));
const DashboardScreen = React.lazy<React.ComponentType<DashboardScreenProps>>(() => import("./screens/DashboardScreen.tsx").then(({ DashboardScreen }) => ({ default: DashboardScreen })));
const DeckSettingsScreen = React.lazy<React.ComponentType<DeckSettingsScreenProps>>(() => import("./screens/DeckSettingsScreen.tsx").then(({ DeckSettingsScreen }) => ({ default: DeckSettingsScreen })));
const DecksScreen = React.lazy<React.ComponentType<DecksScreenProps>>(() => import("./screens/DecksScreen.tsx").then(({ DecksScreen }) => ({ default: DecksScreen })));
const GraphScreen = React.lazy<React.ComponentType<GraphScreenProps>>(() => import("./screens/GraphScreen.tsx").then(({ GraphScreen }) => ({ default: GraphScreen })));
const LearnScreen = React.lazy<React.ComponentType<LearnScreenProps>>(() => import("./screens/LearnScreen.tsx").then(({ LearnScreen }) => ({ default: LearnScreen })));
const SettingsScreen = React.lazy<React.ComponentType<SettingsScreenProps>>(() => import("./screens/SettingsScreen.tsx").then(({ SettingsScreen }) => ({ default: SettingsScreen })));
const StatisticsScreen = React.lazy<React.ComponentType<StatisticsScreenProps>>(() => import("./screens/StatisticsScreen.tsx").then(({ StatisticsScreen }) => ({ default: StatisticsScreen })));
const StudyMode = React.lazy<React.ComponentType<StudyModeProps>>(() => import("./screens/StudyMode.tsx").then(({ StudyMode }) => ({ default: StudyMode })));

const menu = createMenuModel(productSurfaces);
const AUTOSAVE_DELAY_MS = 900;
const emptyDecks: Deck[] = [];

interface SignInInput { email: string; password: string }
interface SignUpInput extends SignInInput { displayName: string }
interface EmailInput { email: string }
interface PasswordUpdateInput { password: string; passwordRepeat: string }
type CreateDeckInput = Parameters<CoreWorkspace["createDeck"]>[0];
type CardContentPatch = Parameters<CoreWorkspace["saveDeckCardContent"]>[2];
type CardVariantInput = Parameters<CoreWorkspace["addDeckCardVariant"]>[2];
type ManualCardInput = Parameters<CoreWorkspace["addManualCardToDeck"]>[1];

function resolveCoreMode(value: unknown, fallback: CoreMode): CoreMode {
  return value === "off" || value === "auto" || value === "manual" ? value : fallback;
}

const iconByKey: Record<string, LucideIcon> = {
  assistant: Bot,
  chart: BarChart3,
  community: Users,
  graph: Network,
  home: Home,
  jobs: History,
  layers: Layers,
  learn: BookOpen,
  plus: PlusSquare,
  settings: Settings,
};

function LabsSurface({ ids, children }: { ids: ProductSurfaceId[]; children: React.ReactNode }) {
  return (
    <div className="grid gap-5">
      <LabsNotice surfaces={ids.map((id) => productSurfaces.get(id))} />
      {children}
    </div>
  );
}

function getIcon(iconKey: string) {
  return iconByKey[iconKey] ?? Home;
}

function LoadingScreen({ message = "CoRe wird geladen." }: { message?: string }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[#dce2f4] bg-white/52 px-5 py-10 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <SoftPanel className="w-full max-w-md p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Database} />
            <div>
              <h1 className="text-2xl font-semibold text-[#17214f]">CoRe</h1>
              <p className="mt-1 text-sm text-[#66709a]" role="status" aria-live="polite">
                {message}
              </p>
            </div>
          </div>
        </SoftPanel>
      </div>
    </main>
  );
}

function ScreenLoadingFallback() {
  return (
    <div className="grid min-h-[20rem] place-items-center" role="status" aria-live="polite">
      <SoftPanel className="flex items-center gap-3 px-5 py-4 text-sm font-medium text-[#66709a]">
        <span className="size-3 animate-pulse rounded-full bg-[#6672bf]" aria-hidden="true" />
        Bereich wird geladen.
      </SoftPanel>
    </div>
  );
}

interface MigrationChoiceScreenProps {
  legacyState: NonNullable<ReturnType<typeof readLegacyLocalState>>;
  busy?: boolean;
  message?: string;
  onImport: () => void;
  onSkip: () => void;
}

function MigrationChoiceScreen({ legacyState, busy = false, message = "", onImport, onSkip }: MigrationChoiceScreenProps) {
  const deckCount = legacyState?.decks?.length ?? 0;
  const documentCount = legacyState?.documents?.length ?? 0;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] place-items-center rounded-[22px] border border-[#dce2f4] bg-white/52 px-5 py-10 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)]">
        <SoftPanel className="w-full max-w-xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <OrbIcon icon={Database} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#6672bf]">Lokale Daten gefunden</p>
              <h1 className="text-2xl font-semibold text-[#17214f]">Daten in diesen Account übernehmen?</h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-[#66709a]">
            In diesem Browser liegen noch lokale CoRe-Daten: {deckCount} Stapel und {documentCount} Dokumente. Du kannst sie in deinen angemeldeten Account übernehmen oder mit einem leeren Cloud-Stand weiterarbeiten.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onImport} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4f5eb1] px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <Database size={17} aria-hidden="true" />
              Lokale Daten übernehmen
            </button>
            <button type="button" onClick={onSkip} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
              Leer starten
            </button>
          </div>
          {message ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {message}
            </p>
          ) : null}
        </SoftPanel>
      </div>
    </main>
  );
}

export function App() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const navigationItems = React.useMemo(() => menu.listNavigationItems(), []);
  const labsNavigationItems = React.useMemo(() => menu.listLabsNavigationItems(), []);
  const bootRunRef = React.useRef(0);
  const latestStateRef = React.useRef<WorkspaceState | null>(null);
  const lastAcknowledgedStateRef = React.useRef<WorkspaceState | null>(null);
  const [authPhase, setAuthPhase] = React.useState<AuthPhase>(authPhases.checkingSession);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState("");
  const [authMessageType, setAuthMessageType] = React.useState<"status" | "alert">("status");
  const [migrationMessage, setMigrationMessage] = React.useState("");
  const [workspace, setWorkspace] = React.useState<CoreWorkspace | null>(null);
  const [state, setState] = React.useState<WorkspaceState | null>(null);
  const [cloudUser, setCloudUser] = React.useState<User | null>(null);
  const [legacyState, setLegacyState] = React.useState<NonNullable<ReturnType<typeof readLegacyLocalState>> | null>(null);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(createSyncIdleStatus);
  const [syncEngine, setSyncEngine] = React.useState<AccountSyncEngine | null>(null);
  const screenRegionRef = React.useRef<HTMLElement | null>(null);
  const {
    activeView,
    studyRequest,
    focusedDeckId,
    deckCreationParentId,
    creationMethod,
    completedDeckId,
    validDeckIds,
    navigateToRoute,
    navigateToView,
    getStudyReturnRoute,
    resetBrowserRouteToDefault,
    setFocusedDeckId,
    setDeckCreationParentId,
  } = useAppNavigation({ authPhase, decks: state?.decks ?? emptyDecks, defaultViewId: menu.defaultViewId });
  const mediaStore = React.useMemo(() => cloudUser ? createAccountMediaStore({ client: supabase, supabaseUrl: getSupabaseBrowserConfig().url, userId: cloudUser.id }) : null, [cloudUser, supabase]);

  React.useEffect(() => {
    let observer: MutationObserver | null = null;
    const frame = window.requestAnimationFrame(() => {
      const region = screenRegionRef.current;
      if (!region) return;
      const heading = region.querySelector<HTMLElement>("[data-screen-heading]");
      if (heading) {
        heading.focus();
      } else {
        region.focus();
      }

      observer = new MutationObserver(() => {
        const loadedHeading = region.querySelector<HTMLElement>("[data-screen-heading]");
        if (!loadedHeading || loadedHeading === heading) return;
        loadedHeading.focus();
        observer?.disconnect();
        observer = null;
      });
      observer.observe(region, { childList: true, subtree: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [activeView, authPhase, studyRequest]);

  function setAppState(nextState: WorkspaceState | null) {
    latestStateRef.current = nextState;
    setState(nextState);
  }

  function applyCloudAcknowledgement(snapshot: WorkspaceState | null, acknowledgedState: WorkspaceState | null | undefined, runId = bootRunRef.current) {
    if (!acknowledgedState || !workspace || bootRunRef.current !== runId) return null;
    const currentState = latestStateRef.current;
    if (!currentState) return null;
    const savedState = workspace.saveState(mergeCloudSyncMetadata(currentState, acknowledgedState));
    if (currentState === snapshot) lastAcknowledgedStateRef.current = savedState;
    setAppState(savedState);
    return savedState;
  }

  async function bootAuthenticatedUser(user: User) {
    const runId = bootRunRef.current + 1;
    bootRunRef.current = runId;
    setAuthPhase("loading-cloud");
    setAuthMessage("");
    setMigrationMessage("");

    if (!supabase) throw new Error("Supabase ist für diese Umgebung nicht konfiguriert.");
    const boot = await bootAuthenticatedWorkspace(supabase, user);

    if (bootRunRef.current !== runId) return;

    setWorkspace(boot.workspace);
    setSyncEngine(boot.syncEngine);
    lastAcknowledgedStateRef.current = boot.state;
    setAppState(boot.state);
    setCloudUser(user);
    setFocusedDeckId(null);
    setDeckCreationParentId("");
    setSyncStatus(
      boot.conflictCount > 0
        ? createSyncConflictStatus(boot.conflictCount)
        : boot.pendingCount > 0
          ? createSyncPendingStatus()
          : createSyncSavedStatus("Cloud geladen."),
    );

    if (boot.legacyState) {
      setLegacyState(boot.legacyState);
      setAuthPhase("migration-choice");
      return;
    }

    setLegacyState(null);
    setAuthPhase("ready");
  }

  React.useEffect(() => {
    const recoverPassword = (user: User) => {
      bootRunRef.current += 1;
      setCloudUser(user);
      setWorkspace(null);
      lastAcknowledgedStateRef.current = null;
      setAppState(null);
      setLegacyState(null);
      setAuthPhase(authPhases.passwordRecovery);
      setAuthMessage("Bitte lege ein neues Passwort fest.");
      setAuthMessageType("status");
    };
    const stop = startAuthenticatedWorkspaceSessionLifecycle({
      supabase,
      onUnavailable() {
        setAuthPhase(authPhaseForSession({ configured: false, user: null }));
        setAuthMessage("");
        setAuthMessageType("status");
      },
      onSignedOut() {
        setAuthPhase(authPhaseForSession({ configured: true, user: null }));
      },
      onRedirectError(message) {
        setAuthPhase(authPhases.signedOut);
        setAuthMessage(message);
        setAuthMessageType("alert");
      },
      onPasswordRecovery: recoverPassword,
      onBoot: bootAuthenticatedUser,
      onFailure(error) {
        setAuthPhase("signed-out");
        setAuthMessage(formatCloudAuthError(error, "Sitzung konnte nicht geladen werden."));
        setAuthMessageType("alert");
      },
    });
    return () => {
      bootRunRef.current += 1;
      stop();
    };
  }, [supabase]);

  React.useEffect(() => {
    return startAppSyncLifecycle({
      authPhase,
      syncEngine,
      getLatestState: () => latestStateRef.current,
      getRunId: () => bootRunRef.current,
      onStatus: setSyncStatus,
      onAcknowledged: applyCloudAcknowledgement,
    });
  }, [authPhase, syncEngine, workspace]);

  React.useEffect(() => {
    if (authPhase !== "ready" || !mediaStore || !syncEngine || !workspace) return undefined;
    return startAppMediaRetryLifecycle({
      mediaStore,
      getState: () => latestStateRef.current,
      ensureCloudParents: async () => { await syncNow(); },
      persistMediaDecks: (decks) => persistImportedDecks(decks, { mediaOnly: true }),
    });
  }, [authPhase, mediaStore, syncEngine, workspace]);

  React.useEffect(() => {
    return startAppAutosaveLifecycle({
      authPhase,
      syncEngine,
      state,
      lastAcknowledgedState: lastAcknowledgedStateRef.current,
      runId: bootRunRef.current,
      delayMs: AUTOSAVE_DELAY_MS,
      onAcknowledged: applyCloudAcknowledgement,
      onStatus: setSyncStatus,
      formatError: (error) => formatCloudAuthError(error, "Synchronisierung fehlgeschlagen."),
    });
  }, [authPhase, state, syncEngine, workspace]);

  async function handleSignIn({ email, password }: SignInInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInCloudAccount(supabase, { email }, password);
      const user = await getCloudUser(supabase);
      if (!user) throw new Error("Anmeldung konnte nicht bestätigt werden.");
      await bootAuthenticatedUser(user);
    } catch (error) {
      setAuthPhase("signed-out");
      setAuthMessage(formatCloudAuthError(error, "Anmeldung fehlgeschlagen."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignUp({ displayName, email, password }: SignUpInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const profile = await signUpCloudAccount(supabase, { displayName, email }, password);
      if (profile.account?.status === "pending-email-confirmation") {
        setAuthPhase("signed-out");
        setAuthMessage("Account erstellt. Bitte bestätige deine E-Mail-Adresse und melde dich danach an.");
        setAuthMessageType("status");
        return;
      }
      const user = await getCloudUser(supabase);
      if (!user) throw new Error("Account wurde erstellt, aber die Sitzung konnte nicht geladen werden.");
      await bootAuthenticatedUser(user);
    } catch (error) {
      setAuthPhase("signed-out");
      setAuthMessage(formatCloudAuthError(error, "Account konnte nicht erstellt werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResetPassword({ email }: EmailInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await resetCloudPassword(supabase, email);
      setAuthMessage("Wenn diese E-Mail registriert ist, wurde ein Reset-Link verschickt.");
      setAuthMessageType("status");
    } catch (error) {
      setAuthMessage(formatCloudAuthError(error, "Reset-Link konnte nicht gesendet werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleMagicLink({ email }: EmailInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInWithMagicLink(supabase, email);
      setAuthMessage("Wenn dieser Account existiert, wurde ein Magic Link verschickt.");
      setAuthMessageType("status");
    } catch (error) {
      setAuthMessage(formatCloudAuthError(error, "Magic Link konnte nicht gesendet werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      await signInWithGoogle(supabase);
      setAuthMessage("Weiterleitung zu Google wird geöffnet.");
      setAuthMessageType("status");
    } catch (error) {
      setAuthMessage(formatCloudAuthError(error, "Google-Anmeldung konnte nicht gestartet werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleUpdatePassword({ password, passwordRepeat }: PasswordUpdateInput) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (password !== passwordRepeat) throw new Error("Die Passwörter stimmen nicht überein.");
      await updateCloudPassword(supabase, password);
      clearCloudAuthRedirectParams();
      const user = (await getCloudUser(supabase)) ?? cloudUser;
      if (!user) throw new Error("Passwort wurde gespeichert, aber die Sitzung konnte nicht geladen werden.");
      setAuthMessage("Passwort aktualisiert.");
      setAuthMessageType("status");
      await bootAuthenticatedUser(user);
    } catch (error) {
      setAuthPhase(authPhases.passwordRecovery);
      setAuthMessage(formatCloudAuthError(error, "Passwort konnte nicht gespeichert werden."));
      setAuthMessageType("alert");
    } finally {
      setAuthBusy(false);
    }
  }

  async function importLegacyLocalState() {
    if (!workspace || !state || !cloudUser || !legacyState) return;
    setAuthBusy(true);
    setMigrationMessage("");
    try {
      const nextState = mergePortableExportIntoState(state, createPortableExport(legacyState));
      const savedState = workspace.saveState(nextState);
      setAppState(savedState);
      const result = await replaceAccountCloudState(supabase, savedState, { deviceId: createBrowserSyncDevice().id });
      const acknowledgedState = workspace.saveState(result.state);
      lastAcknowledgedStateRef.current = acknowledgedState;
      setAppState(acknowledgedState);
      markLocalMigrationHandled(cloudUser.id, "imported");
      setLegacyState(null);
      setSyncStatus(createSyncSavedStatus("Lokale Daten übernommen und synchronisiert."));
      setAuthPhase("ready");
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : "Lokale Daten konnten nicht übernommen werden.");
    } finally {
      setAuthBusy(false);
    }
  }

  function skipLegacyLocalState() {
    if (cloudUser) markLocalMigrationHandled(cloudUser.id, "skipped");
    setLegacyState(null);
    setAuthPhase("ready");
  }

  async function syncNow() {
    if (!syncEngine || !state) return;
    const snapshot = state;
    const runId = bootRunRef.current;
    try {
      syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
      const result = await syncEngine.flush(undefined, { force: true });
      applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
      return result;
    } catch (error) {
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Synchronisierung fehlgeschlagen.")));
      throw error;
    }
  }

  const listSyncConflicts = React.useCallback(async () => {
    return syncEngine ? syncEngine.listConflicts() : [];
  }, [syncEngine]);

  async function resolveSyncConflict(conflictId: string, decision: Record<string, unknown>) {
    if (!syncEngine || !workspace || !latestStateRef.current) throw new Error("Synchronisierung ist noch nicht bereit.");
    try {
      const result = await syncEngine.resolveConflict(conflictId, decision, latestStateRef.current);
      const savedState = workspace.saveState(result.nextState);
      lastAcknowledgedStateRef.current = savedState;
      setAppState(savedState);
      return result;
    } catch (error) {
      setAppState(workspace.getState());
      setSyncStatus(createSyncErrorStatus(formatCloudAuthError(error, "Konfliktentscheidung konnte nicht gespeichert werden.")));
      throw error;
    }
  }

  async function signOut() {
    if (supabase && state?.profile) {
      await signOutCloudAccount(supabase, state.profile);
    }
    bootRunRef.current += 1;
    resetBrowserRouteToDefault();
    setWorkspace(null);
    setSyncEngine(null);
    lastAcknowledgedStateRef.current = null;
    setAppState(null);
    setCloudUser(null);
    setLegacyState(null);
    setFocusedDeckId(null);
    setDeckCreationParentId("");
    setSyncStatus(createSyncIdleStatus());
    setAuthPhase("signed-out");
    setAuthMessage("Du bist abgemeldet.");
    setAuthMessageType("status");
  }

  function refresh() {
    if (!workspace) return null;
    const nextState = workspace.getState();
    setAppState(nextState);
    return nextState;
  }

  function runWorkspaceMutation<T>(mutation: (currentWorkspace: CoreWorkspace) => T): T | null {
    if (!workspace) return null;
    const result = mutation(workspace);
    refresh();
    return result;
  }

  function saveDeck(deck: Deck | Deck[]) {
    const existingDeckIds = new Set(state?.decks.map((item) => item.id) ?? []);
    const globalSettings = getGlobalDeckSettings(state?.profile);
    const applyDefaults = (item: Deck): Deck => existingDeckIds.has(item.id)
      ? item
      : {
          ...item,
          deckSettings: {
            ...item.deckSettings,
            ...applyLearningSettingsToDeckSettings({ ...item.deckSettings }, globalSettings),
            coreMode: globalSettings.coreMode,
          },
        };
    const nextDeck = Array.isArray(deck) ? deck.map(applyDefaults) : applyDefaults(deck);
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveDecks(nextDeck));
  }

  async function persistImportedDecks(decks: Deck[], { mediaOnly = false }: { mediaOnly?: boolean } = {}) {
    if (!workspace || !syncEngine) throw new Error("Die Cloud-Synchronisierung ist noch nicht bereit.");
    const currentDecks = workspace.getState().decks;
    const nextDecks = mediaOnly ? decks.map((deck) => {
      const current = currentDecks.find((candidate) => candidate.id === deck.id);
      return current ? { ...current, mediaAssets: deck.mediaAssets } : deck;
    }) : decks;
    saveDeck(nextDecks);
    const snapshot = workspace.getState();
    const runId = bootRunRef.current;
    syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });
    const result = await syncEngine.flush(undefined, { force: true });
    applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
    return result;
  }

  function enqueueReviewEvent(event: ReviewEvent) {
    if (!syncEngine || !event?.id) return;
    syncEngine.enqueueMutation({
      id: `review_${event.id}`,
      type: SYNC_MUTATION_TYPES.reviewEventAppend,
      table: "review_events",
      entityId: event.id,
      payload: { event },
    });
  }

  function createDeck(input: CreateDeckInput = {}) {
    const globalSettings = getGlobalDeckSettings(state?.profile);
    const saved = runWorkspaceMutation((currentWorkspace) => currentWorkspace.createDeck({
      ...input,
      deckSettings: {
        ...input.deckSettings,
        ...applyLearningSettingsToDeckSettings({ ...input.deckSettings }, globalSettings),
        coreMode: resolveCoreMode(input.deckSettings?.coreMode, globalSettings.coreMode),
      },
    }));
    if (!saved) return null;
    setFocusedDeckId(saved.id);
    setDeckCreationParentId("");
    return saved;
  }

  function updateDeck(deckId: string, updater: (deck: Deck) => Deck) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.updateDeck(deckId, updater));
  }

  function deleteDeck(deckId: string) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.deleteDeckTree(deckId));
    if (!result) return null;
    setFocusedDeckId(result.nextSelectedDeckId);
    return result;
  }

  function renameDeck(deckId: string, name: string) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.renameDeck(deckId, name));
    if (!result) return null;
    if (result.deck) setFocusedDeckId(result.deck.id);
    return result;
  }

  function moveDeck(deckId: string, parentDeckId: string | null = null) {
    const result = runWorkspaceMutation((currentWorkspace) => currentWorkspace.moveDeck(deckId, parentDeckId));
    if (!result) return null;
    if (result.deck) setFocusedDeckId(result.deck.id);
    return result;
  }

  function setDeckCoreMode(deckId: string, coreMode: CoreMode) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.setDeckCoreMode(deckId, coreMode));
  }

  function saveDeckLearningSettings(deckId: string, settings: LearningSettingsInput = {}) {
    return updateDeck(deckId, (deck) => ({
      ...deck,
      deckSettings: {
        ...deck.deckSettings,
        ...applyLearningSettingsToDeckSettings({ ...deck.deckSettings }, settings),
        coreMode: resolveCoreMode(settings.coreMode, deck.deckSettings.coreMode),
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function saveDeckAppearance(deckId: string, appearance: Deck["deckSettings"]["appearance"]) {
    return updateDeck(deckId, (deck: Deck) => ({
      ...deck,
      deckSettings: { ...deck.deckSettings, appearance },
      updatedAt: new Date().toISOString(),
    }));
  }

  function saveGlobalLearningSettings(settings: LearningSettingsInput = {}) {
    if (!state) return null;
    return runWorkspaceMutation((currentWorkspace) => {
      currentWorkspace.saveProfile(withGlobalDeckSettings(state.profile, settings));
      return currentWorkspace.updateAllDecks((deck) => ({
        ...deck,
        deckSettings: {
          ...deck.deckSettings,
          ...applyLearningSettingsToDeckSettings({ ...deck.deckSettings }, settings),
          coreMode: resolveCoreMode(settings.coreMode, deck.deckSettings.coreMode),
        },
        updatedAt: new Date().toISOString(),
      }));
    });
  }

  function saveDeckCard(deckId: string, cardId: string, patch: CardContentPatch) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveDeckCardContent(deckId, cardId, patch));
  }

  function deleteDeckCard(deckId: string, cardId: string) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.deleteDeckCard(deckId, cardId));
  }

  function restoreDeckCard(deckId: string, cardId: string, versionId: string) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.restoreDeckCardVersion(deckId, cardId, versionId));
  }

  function addDeckCardVariant(deckId: string, cardId: string, variant: CardVariantInput) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.addDeckCardVariant(deckId, cardId, variant));
  }

  function addManualCardToDeck(deckId: string, manualDeckInput: ManualCardInput) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.addManualCardToDeck(deckId, manualDeckInput));
  }

  async function completeCreatedDeck(deck: Deck) {
    await persistImportedDecks([deck]);
    const completedDeck = workspace?.getState().decks.find((candidate) => candidate.id === deck.id) ?? null;
    if (completedDeck) navigateToView("neue-karten", { completedDeckId: completedDeck.id }, { replace: true });
    return completedDeck;
  }

  async function completeManualCard(deckId: string, manualDeckInput: ManualCardInput) {
    const deck = addManualCardToDeck(deckId, manualDeckInput);
    if (deck) await persistImportedDecks([deck]);
    if (deck) navigateToView("neue-karten", { completedDeckId: deck.id }, { replace: true });
    return deck;
  }

  function completeImportedDeck(deck: Deck) {
    navigateToView("neue-karten", { completedDeckId: deck.id }, { replace: true });
  }

  async function createDemo() {
    const decks = runWorkspaceMutation((currentWorkspace: { createWorldCapitalsDemo: () => Deck[] }) => currentWorkspace.createWorldCapitalsDemo());
    if (decks?.length) await persistImportedDecks(decks);
    navigateToView("lernen");
    return decks;
  }

  function applyVariantJson(deckId: string, cardId: string, response: unknown, options: Record<string, unknown>) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.applyVariantGenerationResponse(deckId, cardId, response, options));
  }

  function saveProfile(profile: unknown) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveProfile(profile));
  }

  async function getAiAccessToken() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  }

  async function acceptAiChatConsent() {
    if (!workspace || !syncEngine || !latestStateRef.current) {
      throw new Error("Die Cloud-Synchronisierung ist noch nicht bereit.");
    }
    const previousProfile = workspace.getState().profile;
    const consent = {
      version: AI_CHAT_CONSENT_VERSION,
      acceptedAt: new Date().toISOString(),
      adultConfirmed: true as const,
    };
    workspace.saveProfile({
      ...previousProfile,
      privacy: { ...previousProfile.privacy, aiChatConsent: consent },
    });
    const snapshot = workspace.getState();
    const runId = bootRunRef.current;
    setAppState(snapshot);
    syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: snapshot } });

    try {
      const result = await syncEngine.flush(undefined, { force: true });
      const acknowledged = applyCloudAcknowledgement(snapshot, result.saved?.state, runId);
      if (!acknowledged) throw new Error("Die KI-Einwilligung wurde nicht von der Cloud bestätigt.");
      return consent;
    } catch (error) {
      workspace.saveProfile(previousProfile);
      const rollback = workspace.getState();
      setAppState(rollback);
      syncEngine.enqueueMutation({ type: SYNC_MUTATION_TYPES.statePatch, payload: { state: rollback } });
      throw new Error(formatCloudAuthError(error, "Die KI-Einwilligung konnte nicht gespeichert werden."));
    }
  }

  function saveCommunity(community: unknown) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveCommunity(community));
  }

  function saveJob(job: unknown) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveAiJob(job));
  }

  function saveChat(exchange: unknown) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveChatExchange(exchange));
  }

  function savePlan(plan: unknown) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveLearningPlan(plan));
  }

  function saveState(nextState: WorkspaceState) {
    return runWorkspaceMutation((currentWorkspace) => currentWorkspace.saveState(nextState));
  }

  function startDeck(deck: { id: string; }, variantSession = false) {
    navigateToRoute(createStudyRoute(deck.id, { variantSession, returnRoute: getStudyReturnRoute() }, { validDeckIds }));
  }

  function openDecks(deckId: string | null = null) {
    navigateToView("kartenstapel", { focusedDeckId: deckId || null });
  }

  function openDeckSettings(deckId: string) {
    navigateToView("stapel-einstellungen", { focusedDeckId: deckId });
  }

  function openDeckCreation(parentDeckId = "") {
    navigateToView("lernen", { deckCreationParentId: parentDeckId || "" });
  }

  function openGraph(deck: Deck) {
    if (!productSurfaces.isAvailable("graph")) return;
    navigateToView("graph");
    runWorkspaceMutation((currentWorkspace) => currentWorkspace.ensureDeckGraph(deck.id));
  }

  function shareDeck(deck: Deck) {
    if (!productSurfaces.isAvailable("community-demo")) return;
    navigateToView("community");
    runWorkspaceMutation((currentWorkspace) => currentWorkspace.shareDeckToDefaultCommunity(deck.id));
  }

  function renderActiveView() {
    if (!state) return null;
    if (activeView === "stapel-einstellungen") {
      return (
        <DeckSettingsScreen
          deck={state.decks.find((deck) => deck.id === focusedDeckId) ?? null}
          onSave={saveDeckLearningSettings}
          onSaveAppearance={saveDeckAppearance}
          onBack={() => navigateToView("lernen")}
        />
      );
    }
    if (activeView === "kartenstapel") {
      return (
        <DecksScreen
          decks={state.decks}
          mediaStore={mediaStore}
          onSetDeckCoreMode={setDeckCoreMode}
          onSaveCard={saveDeckCard}
          onDeleteCard={deleteDeckCard}
          onRestoreCard={restoreDeckCard}
          onAddVariant={addDeckCardVariant}
          onApplyVariantJson={applyVariantJson}
          onStartDeck={startDeck}
          initialSelectedDeckId={focusedDeckId}
          onDeleteDeck={deleteDeck}
          onRenameDeck={renameDeck}
          onMoveDeck={moveDeck}
          onOpenCardCreation={() => navigateToView("neue-karten")}
          onPrepareSubdeckCreation={openDeckCreation}
          onOpenGraph={openGraph}
          onShareDeck={shareDeck}
          showGraph={productSurfaces.isAvailable("graph")}
          showCommunity={productSurfaces.isAvailable("community-demo")}
          showExternalVariantFlow={productSurfaces.isAvailable("external-variant-json")}
          externalVariantSurface={productSurfaces.get("external-variant-json")}
        />
      );
    }
    if (activeView === "neue-karten") {
      return <CreationScreen decks={state.decks} mediaStore={mediaStore} persistImportedDecks={persistImportedDecks} supabase={supabase} supabaseUrl={getSupabaseBrowserConfig().url} initialMethod={creationMethod} completedDeckId={completedDeckId} onMethodChange={(method: "manual" | "import" | "ai" | "") => navigateToView("neue-karten", method ? { creationMethod: method } : {})} onCreated={completeCreatedDeck} onAppendManualCard={completeManualCard} onImportCompleted={completeImportedDeck} onStartDeck={startDeck} onReviewDeck={openDecks} onJob={saveJob} showAiDrafts={productSurfaces.isAvailable("local-ai-drafts")} aiDraftSurface={productSurfaces.get("local-ai-drafts")} enableServerApkgImport={productSurfaces.isAvailable("server-apkg-over-250")} />;
    }
    if (activeView === "lernen") {
      return (
        <LearnScreen
          decks={state.decks}
          onStartDeck={startDeck}
          onCreateDeck={createDeck}
          initialParentDeckId={deckCreationParentId}
          onDeckCreationHandled={() => setDeckCreationParentId("")}
          onOpenCardCreation={() => navigateToView("neue-karten")}
          onOpenDecks={openDecks}
          onOpenDeckSettings={openDeckSettings}
        />
      );
    }
    if (activeView === "statistik") {
      return <StatisticsScreen decks={state.decks} onNavigate={navigateToView} />;
    }
    if (activeView === "graph") {
      return <LabsSurface ids={["graph"]}><GraphScreen decks={state.decks} onUpdateDeck={updateDeck} /></LabsSurface>;
    }
    if (activeView === "community") {
      return <LabsSurface ids={["community-demo"]}><CommunityScreen decks={state.decks} communities={state.communities} onSaveCommunity={saveCommunity} onSaveDeck={saveDeck} /></LabsSurface>;
    }
    if (activeView === "assistent") {
      return (
        <LabsSurface ids={["assistant-chat", "learning-plan"]}>
          <AssistantScreen
            decks={state.decks}
            transcript={state.chatTranscript}
            plans={state.learningPlans}
            profile={state.profile}
            getAccessToken={getAiAccessToken}
            onAcceptAiChatConsent={acceptAiChatConsent}
            onSaveChat={saveChat}
            onSavePlan={savePlan}
          />
        </LabsSurface>
      );
    }
    if (activeView === "ki-jobs") {
      return <LabsSurface ids={["ai-job-history"]}><AiJobsScreen decks={state.decks} jobs={state.aiJobs} /></LabsSurface>;
    }
    if (activeView === "einstellungen") {
      return (
        <SettingsScreen
          appState={state}
          profile={state.profile}
          decks={state.decks}
          syncStatus={syncStatus}
          onSaveProfile={saveProfile}
          globalDeckSettings={getGlobalDeckSettings(state.profile)}
          onSaveGlobalLearningSettings={saveGlobalLearningSettings}
          onSaveState={saveState}
          onSyncNow={syncNow}
          onListConflicts={listSyncConflicts}
          onResolveConflict={resolveSyncConflict}
          onSignOut={signOut}
        />
      );
    }
    return <DashboardScreen state={state} onNavigate={navigateToView} onStartDeck={startDeck} onCreateDemo={createDemo} showAssistant={productSurfaces.isAvailable("assistant-chat")} />;
  }

  if (authPhase === "checking-session") {
    return <LoadingScreen message="Sitzung wird geprüft." />;
  }

  if (authPhase === "loading-cloud") {
    return <LoadingScreen message="Deine Cloud-Daten werden geladen." />;
  }

  if (shouldShowAuthGate(authPhase)) {
    return (
      <AuthGateScreen
        configured={Boolean(supabase)}
        recoveryMode={authPhase === authPhases.passwordRecovery}
        busy={authBusy}
        message={authMessage}
        messageType={authMessageType}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onResetPassword={handleResetPassword}
        onMagicLink={handleMagicLink}
        onGoogleSignIn={handleGoogleSignIn}
        showMagicLink={productSurfaces.isAvailable("auth-magic-link")}
        showGoogleSignIn={productSurfaces.isAvailable("auth-google")}
        onUpdatePassword={handleUpdatePassword}
      />
    );
  }

  if (authPhase === "migration-choice" && legacyState) {
    return <MigrationChoiceScreen legacyState={legacyState} busy={authBusy} message={migrationMessage} onImport={importLegacyLocalState} onSkip={skipLegacyLocalState} />;
  }

  if (!shouldShowAppShell(authPhase) || !workspace || !state) {
    return <LoadingScreen />;
  }

  const studyDeck = studyRequest ? state.decks.find((deck) => deck.id === studyRequest.deckId) : null;
  if (studyRequest && studyDeck) {
    return (
      <React.Suspense fallback={<LoadingScreen message="Lernmodus wird geladen." />}>
        <StudyMode
          deck={studyDeck}
          decks={state.decks}
          deckId={studyDeck.id}
          variantSession={studyRequest.variantSession}
          mediaStore={mediaStore}
          onExit={() => {
            refresh();
            navigateToRoute(studyRequest.returnRoute ?? createViewRoute("lernen"), { replace: true });
          }}
          onReturnToLearn={() => {
            refresh();
            navigateToRoute(createViewRoute("lernen"), { replace: true });
          }}
          onDeckUpdated={saveDeck}
          onReviewEvent={enqueueReviewEvent}
        />
      </React.Suspense>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-[22px] border border-[#dce2f4] bg-white/52 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)] md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-b border-[#dce2f4] bg-white/42 md:border-b-0 md:border-r">
          <div className="flex flex-col px-5 py-6 sm:px-8 md:h-full md:px-4 md:py-8 lg:px-5 lg:py-10">
            <div>
              <h1 className="text-4xl font-semibold tracking-normal text-[#17214f] md:text-5xl">CoRe</h1>
              <p className="mt-2 text-base text-[#66709a]">Content Repetition</p>
            </div>

            <nav aria-label="Hauptmenü" className="mt-6 grid grid-cols-2 gap-2 md:mt-10 md:max-w-none md:grid-cols-1">
              {navigationItems.map((view) => {
                const NavIcon = getIcon(view.iconKey);
                const isActive = view.id === activeView;

                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => navigateToView(view.id)}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition md:min-h-12 md:text-base ${
                      isActive ? "bg-[#e9ecfb] text-[#24327a] shadow-sm" : "text-[#4f5a86] hover:bg-white/70 hover:text-[#17214f]"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <NavIcon className="shrink-0" size={21} aria-hidden="true" />
                    <span className="min-w-0 truncate">{view.label}</span>
                  </button>
                );
              })}
            </nav>

            {labsNavigationItems.length > 0 ? (
              <details className="mt-6 rounded-xl border border-[#dce2f4] bg-white/35 p-2" open={labsNavigationItems.some((view) => view.id === activeView) || undefined}>
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#66709a]">
                  <FlaskConical size={17} aria-hidden="true" />
                  Labs
                  <span className="ml-auto text-xs font-medium">Experimentell</span>
                </summary>
                <nav aria-label="Labs" className="mt-1 grid gap-1">
                  {labsNavigationItems.map((view) => {
                    const NavIcon = getIcon(view.iconKey);
                    const isActive = view.id === activeView;
                    return (
                      <button
                        key={view.id}
                        type="button"
                        onClick={() => navigateToView(view.id)}
                        className={`flex min-h-10 items-center gap-2 rounded-lg px-2 text-left text-sm transition ${isActive ? "bg-amber-50 text-amber-900" : "text-[#66709a] hover:bg-white/70"}`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <NavIcon size={17} aria-hidden="true" />
                        <span>{view.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </details>
            ) : null}

            <div className="mt-5 border-t border-[#dce2f4] pt-5 md:mt-auto md:pt-6">
              <button
                type="button"
                onClick={() => navigateToView("einstellungen")}
                className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left transition ${
                  activeView === "einstellungen" ? "bg-[#e9ecfb] text-[#24327a] shadow-sm" : "text-[#24327a] hover:bg-white/70"
                }`}
                aria-label="Einstellungen öffnen"
                aria-current={activeView === "einstellungen" ? "page" : undefined}
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#dfe4fb] text-sm font-semibold">{(state.profile.displayName || "CO").slice(0, 2).toUpperCase()}</span>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef1fb] text-[#4f5eb1]">
                  <Settings size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{state.profile.displayName}</span>
              </button>
            </div>
          </div>
        </aside>

        <section ref={screenRegionRef} className="min-w-0 overflow-x-hidden px-5 py-8 outline-none sm:px-8 lg:px-12 lg:py-12" tabIndex={-1} aria-label="Seiteninhalt">
          <React.Suspense fallback={<ScreenLoadingFallback />}>{renderActiveView()}</React.Suspense>
        </section>
      </div>
    </main>
  );
}
