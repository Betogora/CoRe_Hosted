import React from "react";
import type { AppViewId } from "./appNavigation.ts";
import type { SettingsDialogProps } from "./appScreenProps.ts";
import { markAppPerformance, measureAppPerformance } from "./appPerformance.ts";
import { allowsBrowserAutomaticPreloading, createChunkPrefetcher, FEATURE_CHUNKS_ELEMENT_ID, parseFeatureChunks, type FeatureChunks } from "./appFeaturePreload.ts";

type AppFeatureId = "card-settings" | "creation" | "dashboard" | "deck-settings" | "decks" | "exams" | "help" | "learn" | "settings" | "settings-dialog" | "simulator" | "statistics" | "study";

// `chunk` is the build's chunk name of the screen module or of its wiring, which loads the screen with it; the build
// lists its files under that name.
const featureLoaders = {
  "card-settings": { chunk: "GlobalCardSettingsScreenWiring", load: () => import("./screens/GlobalCardSettingsScreenWiring.tsx").then(({ GlobalCardSettingsScreenWiring }) => ({ default: GlobalCardSettingsScreenWiring })) },
  creation: { chunk: "CreationScreenWiring", load: () => import("./screens/CreationScreenWiring.tsx").then(({ CreationScreenWiring }) => ({ default: CreationScreenWiring })) },
  dashboard: { chunk: "DashboardScreenWiring", load: () => import("./screens/DashboardScreenWiring.tsx").then(({ DashboardScreenWiring }) => ({ default: DashboardScreenWiring })) },
  "deck-settings": { chunk: "DeckSettingsScreenWiring", load: () => import("./screens/DeckSettingsScreenWiring.tsx").then(({ DeckSettingsScreenWiring }) => ({ default: DeckSettingsScreenWiring })) },
  decks: { chunk: "DecksScreenWiring", load: () => import("./screens/DecksScreenWiring.tsx").then(({ DecksScreenWiring }) => ({ default: DecksScreenWiring })) },
  exams: { chunk: "ExamPlanningScreenWiring", load: () => import("./screens/ExamPlanningScreenWiring.tsx").then(({ ExamPlanningScreenWiring }) => ({ default: ExamPlanningScreenWiring })) },
  help: { chunk: "HelpScreen", load: () => import("./screens/HelpScreen.tsx").then(({ HelpScreen }) => ({ default: HelpScreen })) },
  learn: { chunk: "LearnScreenWiring", load: () => import("./screens/LearnScreenWiring.tsx").then(({ LearnScreenWiring }) => ({ default: LearnScreenWiring })) },
  settings: { chunk: "SettingsScreenWiring", load: () => import("./screens/SettingsScreenWiring.tsx").then(({ SettingsScreenWiring }) => ({ default: SettingsScreenWiring })) },
  "settings-dialog": { chunk: "SettingsDialog", load: () => import("./screens/SettingsDialog.tsx").then(({ SettingsDialog }) => ({ default: SettingsDialog })) },
  simulator: { chunk: "SimulatorScreenWiring", load: () => import("./screens/SimulatorScreenWiring.tsx").then(({ SimulatorScreenWiring }) => ({ default: SimulatorScreenWiring })) },
  statistics: { chunk: "StatisticsScreenWiring", load: () => import("./screens/StatisticsScreenWiring.tsx").then(({ StatisticsScreenWiring }) => ({ default: StatisticsScreenWiring })) },
  study: { chunk: "StudyModeWiring", load: () => import("./screens/StudyModeWiring.tsx").then(({ StudyModeWiring }) => ({ default: StudyModeWiring })) },
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

export const CreationScreenWiring = React.lazy(() => loadAppFeature("creation"));
export const DashboardScreenWiring = React.lazy(() => loadAppFeature("dashboard"));
export const DeckSettingsScreenWiring = React.lazy(() => loadAppFeature("deck-settings"));
export const DecksScreenWiring = React.lazy(() => loadAppFeature("decks"));
export const ExamPlanningScreenWiring = React.lazy(() => loadAppFeature("exams"));
export const HelpScreen = React.lazy(() => loadAppFeature("help"));
export const LearnScreenWiring = React.lazy(() => loadAppFeature("learn"));
export const GlobalCardSettingsScreenWiring = React.lazy(() => loadAppFeature("card-settings"));
export const SimulatorScreenWiring = React.lazy(() => loadAppFeature("simulator"));
export const SettingsDialog = React.lazy<React.ComponentType<SettingsDialogProps>>(() => loadAppFeature("settings-dialog") as Promise<{ default: React.ComponentType<SettingsDialogProps> }>);
export const SettingsScreenWiring = React.lazy(() => loadAppFeature("settings"));
export const StatisticsScreenWiring = React.lazy(() => loadAppFeature("statistics"));
export const StudyModeWiring = React.lazy(() => loadAppFeature("study"));
