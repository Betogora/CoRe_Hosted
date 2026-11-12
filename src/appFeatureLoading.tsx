import React from "react";
import type { AppViewId } from "./appNavigation.ts";
import type {
  CreationScreenProps,
  DashboardScreenProps,
  DeckSettingsScreenProps,
  DecksScreenProps,
  ExamPlanningScreenProps,
  GlobalCardSettingsScreenProps,
  LearnScreenProps,
  SettingsDialogProps,
  SettingsScreenProps,
  SimulatorScreenProps,
  StatisticsScreenProps,
  StudyModeProps,
} from "./appScreenProps.ts";
import { markAppPerformance, measureAppPerformance } from "./appPerformance.ts";
import { allowsBrowserAutomaticPreloading, createChunkPrefetcher, FEATURE_CHUNKS_ELEMENT_ID, parseFeatureChunks, type FeatureChunks } from "./appFeaturePreload.ts";

type AppFeatureId = "card-settings" | "creation" | "dashboard" | "deck-settings" | "decks" | "exams" | "help" | "learn" | "settings" | "settings-dialog" | "simulator" | "statistics" | "study";

// `chunk` is the build's chunk name of the screen module; the build lists its files under that name.
const featureLoaders = {
  "card-settings": { chunk: "GlobalCardSettingsScreen", load: () => import("./screens/GlobalCardSettingsScreen.tsx").then(({ GlobalCardSettingsScreen }) => ({ default: GlobalCardSettingsScreen })) },
  creation: { chunk: "CreationScreen", load: () => import("./screens/CreationScreen.tsx").then(({ CreationScreen }) => ({ default: CreationScreen })) },
  dashboard: { chunk: "DashboardScreen", load: () => import("./screens/DashboardScreen.tsx").then(({ DashboardScreen }) => ({ default: DashboardScreen })) },
  "deck-settings": { chunk: "DeckSettingsScreen", load: () => import("./screens/DeckSettingsScreen.tsx").then(({ DeckSettingsScreen }) => ({ default: DeckSettingsScreen })) },
  decks: { chunk: "DecksScreen", load: () => import("./screens/DecksScreen.tsx").then(({ DecksScreen }) => ({ default: DecksScreen })) },
  exams: { chunk: "ExamPlanningScreen", load: () => import("./screens/ExamPlanningScreen.tsx").then(({ ExamPlanningScreen }) => ({ default: ExamPlanningScreen })) },
  help: { chunk: "HelpScreen", load: () => import("./screens/HelpScreen.tsx").then(({ HelpScreen }) => ({ default: HelpScreen })) },
  learn: { chunk: "LearnScreen", load: () => import("./screens/LearnScreen.tsx").then(({ LearnScreen }) => ({ default: LearnScreen })) },
  settings: { chunk: "SettingsScreen", load: () => import("./screens/SettingsScreen.tsx").then(({ SettingsScreen }) => ({ default: SettingsScreen })) },
  "settings-dialog": { chunk: "SettingsDialog", load: () => import("./screens/SettingsDialog.tsx").then(({ SettingsDialog }) => ({ default: SettingsDialog })) },
  simulator: { chunk: "SimulatorScreen", load: () => import("./screens/SimulatorScreen.tsx").then(({ SimulatorScreen }) => ({ default: SimulatorScreen })) },
  statistics: { chunk: "StatisticsScreen", load: () => import("./screens/StatisticsScreen.tsx").then(({ StatisticsScreen }) => ({ default: StatisticsScreen })) },
  study: { chunk: "StudyMode", load: () => import("./screens/StudyMode.tsx").then(({ StudyMode }) => ({ default: StudyMode })) },
} satisfies Record<AppFeatureId, { chunk: string; load: () => Promise<{ default: React.ComponentType<any> }> }>;

const featurePromises = new Map<AppFeatureId, Promise<{ default: React.ComponentType<any> }>>();

function loadAppFeature(feature: AppFeatureId): Promise<{ default: React.ComponentType<any> }> {
  const cached = featurePromises.get(feature);
  if (cached) return cached;
  const startMark = `core:feature:${feature}:start`;
  const readyMark = `core:feature:${feature}:ready`;
  markAppPerformance(startMark);
  const pending = featureLoaders[feature].load().then((module) => {
    markAppPerformance(readyMark);
    measureAppPerformance(`core:feature:${feature}:load`, startMark, readyMark);
    prefetchFeatureParts(feature);
    return module;
  }).catch((error) => {
    featurePromises.delete(feature);
    throw error;
  });
  featurePromises.set(feature, pending);
  return pending;
}

let featureChunks: Record<string, FeatureChunks> | null = null;
const prefetchChunks = createChunkPrefetcher((url) => fetch(url, { credentials: "same-origin", priority: "low" }).then((response) => response.blob()));

function chunksOf(feature: AppFeatureId): FeatureChunks | undefined {
  featureChunks ??= parseFeatureChunks(typeof document === "undefined" ? null : document.getElementById(FEATURE_CHUNKS_ELEMENT_ID)?.textContent);
  return featureChunks[featureLoaders[feature].chunk];
}

const chunkUrls = (files: readonly string[]) => files.map((file) => `${import.meta.env.BASE_URL}${file}`);

/** Once a feature runs, its sub-areas (summaries, mind maps, editor tabs) download while the browser is idle. */
function prefetchFeatureParts(feature: AppFeatureId) {
  const parts = chunksOf(feature)?.parts ?? [];
  if (parts.length === 0 || !allowsBrowserAutomaticPreloading()) return;
  const run = () => void prefetchChunks(chunkUrls(parts));
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 5_000 });
  else setTimeout(run, 0);
}

const featureByView: Record<AppViewId, AppFeatureId> = {
  uebersicht: "dashboard",
  kartenstapel: "decks",
  "neue-karten": "creation",
  lernen: "learn",
  pruefungen: "exams",
  statistik: "statistics",
  simulator: "simulator",
  hilfe: "help",
};

export function preloadAppView(viewId: AppViewId): Promise<unknown> {
  return loadAppFeature(featureByView[viewId]);
}

/** Downloads a view's chunks without running them; the automatic preload uses it, so it adds no main-thread task. */
export function prefetchAppView(viewId: AppViewId): Promise<unknown> {
  const feature = featureByView[viewId];
  const files = chunksOf(feature)?.files ?? [];
  if (featurePromises.has(feature) || files.length === 0) return Promise.resolve();
  const startMark = `core:feature:${feature}:prefetch-start`;
  const readyMark = `core:feature:${feature}:prefetched`;
  markAppPerformance(startMark);
  return prefetchChunks(chunkUrls(files)).then(() => {
    markAppPerformance(readyMark);
    measureAppPerformance(`core:feature:${feature}:prefetch`, startMark, readyMark);
  });
}

export function preloadSettingsDialog(): Promise<unknown> {
  return Promise.all([loadAppFeature("settings-dialog"), loadAppFeature("settings"), loadAppFeature("card-settings")]);
}

export const CreationScreen = React.lazy<React.ComponentType<CreationScreenProps>>(() => loadAppFeature("creation") as Promise<{ default: React.ComponentType<CreationScreenProps> }>);
export const DashboardScreen = React.lazy<React.ComponentType<DashboardScreenProps>>(() => loadAppFeature("dashboard") as Promise<{ default: React.ComponentType<DashboardScreenProps> }>);
export const DeckSettingsScreen = React.lazy<React.ComponentType<DeckSettingsScreenProps>>(() => loadAppFeature("deck-settings") as Promise<{ default: React.ComponentType<DeckSettingsScreenProps> }>);
export const DecksScreen = React.lazy<React.ComponentType<DecksScreenProps>>(() => loadAppFeature("decks") as Promise<{ default: React.ComponentType<DecksScreenProps> }>);
export const ExamPlanningScreen = React.lazy<React.ComponentType<ExamPlanningScreenProps>>(() => loadAppFeature("exams") as Promise<{ default: React.ComponentType<ExamPlanningScreenProps> }>);
export const HelpScreen = React.lazy(() => loadAppFeature("help"));
export const LearnScreen = React.lazy<React.ComponentType<LearnScreenProps>>(() => loadAppFeature("learn") as Promise<{ default: React.ComponentType<LearnScreenProps> }>);
export const GlobalCardSettingsScreen = React.lazy<React.ComponentType<GlobalCardSettingsScreenProps>>(() => loadAppFeature("card-settings") as Promise<{ default: React.ComponentType<GlobalCardSettingsScreenProps> }>);
export const SimulatorScreen = React.lazy<React.ComponentType<SimulatorScreenProps>>(() => loadAppFeature("simulator") as Promise<{ default: React.ComponentType<SimulatorScreenProps> }>);
export const SettingsDialog = React.lazy<React.ComponentType<SettingsDialogProps>>(() => loadAppFeature("settings-dialog") as Promise<{ default: React.ComponentType<SettingsDialogProps> }>);
export const SettingsScreen = React.lazy<React.ComponentType<SettingsScreenProps>>(() => loadAppFeature("settings") as Promise<{ default: React.ComponentType<SettingsScreenProps> }>);
export const StatisticsScreen = React.lazy<React.ComponentType<StatisticsScreenProps>>(() => loadAppFeature("statistics") as Promise<{ default: React.ComponentType<StatisticsScreenProps> }>);
// Memoized: an app render without changed session data leaves the running session alone.
export const StudyMode = React.memo(React.lazy<React.ComponentType<StudyModeProps>>(() => loadAppFeature("study") as Promise<{ default: React.ComponentType<StudyModeProps> }>));
