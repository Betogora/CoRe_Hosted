import React from "react";
import { BarChart3, BookOpen, Database, Home, Layers, Network, PlusSquare, Settings, Users } from "lucide-react";
import { createCoreWorkspace } from "./coreWorkspace.js";
import { createMenuModel } from "./menuModel.js";
import {
  CommunityScreen,
  CreationScreen,
  DashboardScreen,
  DecksScreen,
  GraphScreen,
  LearnScreen,
  SettingsScreen,
  StudyMode,
} from "./screens/index.js";

const menu = createMenuModel();

const iconByKey = {
  chart: BarChart3,
  community: Users,
  graph: Network,
  home: Home,
  layers: Layers,
  learn: BookOpen,
  plus: PlusSquare,
  settings: Settings,
};

function getIcon(iconKey) {
  return iconByKey[iconKey] ?? Home;
}

export function App() {
  const workspace = React.useMemo(() => createCoreWorkspace(), []);
  const [state, setState] = React.useState(() => workspace.getState());
  const [activeView, setActiveView] = React.useState(menu.defaultViewId);
  const [studyRequest, setStudyRequest] = React.useState(null);
  const [focusedDeckId, setFocusedDeckId] = React.useState(null);
  const navigationItems = menu.listNavigationItems();

  function refresh() {
    setState(workspace.getState());
  }

  function saveDeck(deck) {
    if (Array.isArray(deck)) {
      const savedDecks = deck.map((item) => workspace.saveDeck(item));
      refresh();
      return savedDecks;
    }
    const saved = workspace.saveDeck(deck);
    refresh();
    return saved;
  }

  function createDeck(input) {
    const saved = workspace.createDeck(input);
    setFocusedDeckId(saved.id);
    refresh();
    return saved;
  }

  function updateDeck(deckId, updater) {
    const updated = workspace.updateDeck(deckId, updater);
    refresh();
    return updated;
  }

  function deleteDeck(deckId) {
    const result = workspace.deleteDeckTree(deckId);
    setFocusedDeckId(result.nextSelectedDeckId);
    refresh();
    return result;
  }

  function renameDeck(deckId, name) {
    const result = workspace.renameDeck(deckId, name);
    if (result.deck) setFocusedDeckId(result.deck.id);
    refresh();
    return result;
  }

  function moveDeck(deckId, parentDeckId = null) {
    const result = workspace.moveDeck(deckId, parentDeckId);
    if (result.deck) setFocusedDeckId(result.deck.id);
    refresh();
    return result;
  }

  function setDeckCoreMode(deckId, coreMode) {
    const updated = workspace.setDeckCoreMode(deckId, coreMode);
    refresh();
    return updated;
  }

  function saveDeckCard(deckId, cardId, patch) {
    const updated = workspace.saveDeckCardContent(deckId, cardId, patch);
    refresh();
    return updated;
  }

  function deleteDeckCard(deckId, cardId) {
    const updated = workspace.deleteDeckCard(deckId, cardId);
    refresh();
    return updated;
  }

  function addDeckCardVariant(deckId, cardId, variant) {
    const updated = workspace.addDeckCardVariant(deckId, cardId, variant);
    refresh();
    return updated;
  }

  function addManualCardToDeck(deckId, manualDeckInput) {
    const updated = workspace.addManualCardToDeck(deckId, manualDeckInput);
    refresh();
    return updated;
  }

  function applyVariantJson(deckId, cardId, response, options) {
    const result = workspace.applyVariantGenerationResponse(deckId, cardId, response, options);
    refresh();
    return result;
  }

  function saveProfile(profile) {
    const saved = workspace.saveProfile(profile);
    refresh();
    return saved;
  }

  function saveCommunity(community) {
    const saved = workspace.saveCommunity(community);
    refresh();
    return saved;
  }

  function saveJob(job) {
    workspace.saveAiJob(job);
    refresh();
  }

  function saveState(nextState) {
    const saved = workspace.saveState(nextState);
    setState(saved);
    return saved;
  }

  function startDeck(deck, variantSession = false) {
    setStudyRequest({ deckId: deck.id, variantSession });
  }

  function openDecks(deckId = null) {
    setFocusedDeckId(deckId);
    setActiveView("kartenstapel");
  }

  function updateAllDecks(updater) {
    workspace.updateAllDecks(updater);
    refresh();
  }

  function openGraph(deck) {
    setActiveView("graph");
    workspace.ensureDeckGraph(deck.id);
    refresh();
  }

  function shareDeck(deck) {
    setActiveView("community");
    workspace.shareDeckToDefaultCommunity(deck.id);
    refresh();
  }

  function createDemoDeck() {
    workspace.createDemoDeck();
    refresh();
  }

  function renderActiveView() {
    if (activeView === "kartenstapel") {
      return (
        <DecksScreen
          decks={state.decks}
          onSetDeckCoreMode={setDeckCoreMode}
          onSaveCard={saveDeckCard}
          onDeleteCard={deleteDeckCard}
          onAddVariant={addDeckCardVariant}
          onApplyVariantJson={applyVariantJson}
          onStartDeck={startDeck}
          initialSelectedDeckId={focusedDeckId}
          onCreateDeck={createDeck}
          onDeleteDeck={deleteDeck}
          onRenameDeck={renameDeck}
          onMoveDeck={moveDeck}
          onOpenCardCreation={() => setActiveView("neue-karten")}
          onOpenGraph={openGraph}
          onShareDeck={shareDeck}
        />
      );
    }
    if (activeView === "neue-karten") {
      return <CreationScreen decks={state.decks} onCreated={saveDeck} onAppendManualCard={addManualCardToDeck} onJob={saveJob} />;
    }
    if (activeView === "lernen") {
      return <LearnScreen decks={state.decks} onStartDeck={startDeck} onCreateDeck={() => setActiveView("neue-karten")} onOpenDecks={openDecks} />;
    }
    if (activeView === "graph") {
      return <GraphScreen decks={state.decks} onUpdateDeck={updateDeck} />;
    }
    if (activeView === "community") {
      return <CommunityScreen decks={state.decks} communities={state.communities} onSaveCommunity={saveCommunity} onSaveDeck={saveDeck} />;
    }
    if (activeView === "einstellungen") {
      return <SettingsScreen appState={state} profile={state.profile} decks={state.decks} onSaveProfile={saveProfile} onUpdateAllDecks={updateAllDecks} onSaveState={saveState} />;
    }
    return <DashboardScreen state={state} onSaveProfile={saveProfile} onNavigate={setActiveView} onStartDeck={startDeck} />;
  }

  const studyDeck = studyRequest ? state.decks.find((deck) => deck.id === studyRequest.deckId) : null;
  if (studyRequest && studyDeck) {
    return (
      <StudyMode
        deck={studyDeck}
        decks={state.decks}
        deckId={studyDeck.id}
        variantSession={studyRequest.variantSession}
        onExit={() => {
          setStudyRequest(null);
          refresh();
        }}
        onDeckUpdated={saveDeck}
      />
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="grid min-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-[22px] border border-[#dce2f4] bg-white/52 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl sm:min-h-[calc(100vh-4rem)] md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-b border-[#dce2f4] bg-white/42 md:border-b-0 md:border-r">
          <div className="flex h-full flex-col px-5 py-7 sm:px-8 md:px-4 md:py-8 lg:px-5 lg:py-10">
            <div>
              <h1 className="text-5xl font-semibold tracking-normal text-[#17214f]">CoRe</h1>
              <p className="mt-2 text-base text-[#66709a]">Content Repetition</p>
            </div>

            <nav aria-label="Hauptmenue" className="mt-12 grid max-w-[14rem] gap-2 md:mt-10 md:max-w-none">
              {navigationItems.map((view) => {
                const NavIcon = getIcon(view.iconKey);
                const isActive = view.id === activeView;

                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    className={`flex min-h-12 w-full max-w-[14rem] items-center gap-2.5 rounded-xl px-3 text-left text-base font-medium transition md:max-w-none ${
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

            <div className="mt-6 grid gap-2">
              {state.decks.length === 0 ? (
                <button type="button" onClick={createDemoDeck} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#eef1fb] px-3 text-sm font-semibold text-[#4f5eb1]">
                  <Database size={15} aria-hidden="true" />
                  Demo-Stapel
                </button>
              ) : null}
            </div>

            <div className="mt-auto border-t border-[#dce2f4] pt-6">
              <button
                type="button"
                onClick={() => setActiveView("einstellungen")}
                className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left transition ${
                  activeView === "einstellungen" ? "bg-[#e9ecfb] text-[#24327a] shadow-sm" : "text-[#24327a] hover:bg-white/70"
                }`}
                aria-label="Einstellungen oeffnen"
                aria-current={activeView === "einstellungen" ? "page" : undefined}
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#dfe4fb] text-sm font-semibold">{(state.profile.displayName || "NC").slice(0, 2).toUpperCase()}</span>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef1fb] text-[#4f5eb1]">
                  <Settings size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{state.profile.displayName}</span>
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-x-hidden px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{renderActiveView()}</section>
      </div>
    </main>
  );
}
