import React from "react";
import type { AppViewId } from "./appNavigation.ts";
import type {
  CreationScreenProps,
  DashboardScreenProps,
  DeckSettingsScreenProps,
  DecksScreenProps,
  GlobalCardSettingsScreenProps,
  LearnScreenProps,
  SettingsScreenProps,
  SimulatorScreenProps,
  StatisticsScreenProps,
  StudyModeProps,
} from "./appScreenProps.ts";
import { markAppPerformance, measureAppPerformance } from "./appPerformance.ts";

export type AppFeatureId = "card-settings" | "creation" | "dashboard" | "deck-settings" | "decks" | "help" | "learn" | "settings" | "simulator" | "statistics" | "study";

const featureLoaders = {
  "card-settings": () => import("./screens/GlobalCardSettingsScreen.tsx").then(({ GlobalCardSettingsScreen }) => ({ default: GlobalCardSettingsScreen })),
  creation: () => import("./screens/CreationScreen.tsx").then(({ CreationScreen }) => ({ default: CreationScreen })),
  dashboard: () => import("./screens/DashboardScreen.tsx").then(({ DashboardScreen }) => ({ default: DashboardScreen })),
  "deck-settings": () => import("./screens/DeckSettingsScreen.tsx").then(({ DeckSettingsScreen }) => ({ default: DeckSettingsScreen })),
  decks: () => import("./screens/DecksScreen.tsx").then(({ DecksScreen }) => ({ default: DecksScreen })),
  help: () => import("./screens/HelpScreen.tsx").then(({ HelpScreen }) => ({ default: HelpScreen })),
  learn: () => import("./screens/LearnScreen.tsx").then(({ LearnScreen }) => ({ default: LearnScreen })),
  settings: () => import("./screens/SettingsScreen.tsx").then(({ SettingsScreen }) => ({ default: SettingsScreen })),
  simulator: () => import("./screens/SimulatorScreen.tsx").then(({ SimulatorScreen }) => ({ default: SimulatorScreen })),
  statistics: () => import("./screens/StatisticsScreen.tsx").then(({ StatisticsScreen }) => ({ default: StatisticsScreen })),
  study: () => import("./screens/StudyMode.tsx").then(({ StudyMode }) => ({ default: StudyMode })),
} satisfies Record<AppFeatureId, () => Promise<{ default: React.ComponentType<any> }>>;

const featurePromises = new Map<AppFeatureId, Promise<{ default: React.ComponentType<any> }>>();

export function loadAppFeature(feature: AppFeatureId): Promise<{ default: React.ComponentType<any> }> {
  const cached = featurePromises.get(feature);
  if (cached) return cached;
  const startMark = `core:feature:${feature}:start`;
  const readyMark = `core:feature:${feature}:ready`;
  markAppPerformance(startMark);
  const pending = featureLoaders[feature]().then((module) => {
    markAppPerformance(readyMark);
    measureAppPerformance(`core:feature:${feature}:load`, startMark, readyMark);
    return module;
  }).catch((error) => {
    featurePromises.delete(feature);
    throw error;
  });
  featurePromises.set(feature, pending);
  return pending;
}

const featureByView: Record<AppViewId, AppFeatureId> = {
  uebersicht: "dashboard",
  kartenstapel: "decks",
  "neue-karten": "creation",
  lernen: "learn",
  statistik: "statistics",
  simulator: "simulator",
  hilfe: "help",
  einstellungen: "settings",
  "karten-einstellungen": "card-settings",
  "stapel-einstellungen": "deck-settings",
};

export function preloadAppView(viewId: AppViewId): Promise<unknown> {
  return loadAppFeature(featureByView[viewId]);
}

export const CreationScreen = React.lazy<React.ComponentType<CreationScreenProps>>(() => loadAppFeature("creation") as Promise<{ default: React.ComponentType<CreationScreenProps> }>);
export const DashboardScreen = React.lazy<React.ComponentType<DashboardScreenProps>>(() => loadAppFeature("dashboard") as Promise<{ default: React.ComponentType<DashboardScreenProps> }>);
export const DeckSettingsScreen = React.lazy<React.ComponentType<DeckSettingsScreenProps>>(() => loadAppFeature("deck-settings") as Promise<{ default: React.ComponentType<DeckSettingsScreenProps> }>);
export const DecksScreen = React.lazy<React.ComponentType<DecksScreenProps>>(() => loadAppFeature("decks") as Promise<{ default: React.ComponentType<DecksScreenProps> }>);
export const HelpScreen = React.lazy(() => loadAppFeature("help"));
export const LearnScreen = React.lazy<React.ComponentType<LearnScreenProps>>(() => loadAppFeature("learn") as Promise<{ default: React.ComponentType<LearnScreenProps> }>);
export const GlobalCardSettingsScreen = React.lazy<React.ComponentType<GlobalCardSettingsScreenProps>>(() => loadAppFeature("card-settings") as Promise<{ default: React.ComponentType<GlobalCardSettingsScreenProps> }>);
export const SimulatorScreen = React.lazy<React.ComponentType<SimulatorScreenProps>>(() => loadAppFeature("simulator") as Promise<{ default: React.ComponentType<SimulatorScreenProps> }>);
export const SettingsScreen = React.lazy<React.ComponentType<SettingsScreenProps>>(() => loadAppFeature("settings") as Promise<{ default: React.ComponentType<SettingsScreenProps> }>);
export const StatisticsScreen = React.lazy<React.ComponentType<StatisticsScreenProps>>(() => loadAppFeature("statistics") as Promise<{ default: React.ComponentType<StatisticsScreenProps> }>);
export const StudyMode = React.lazy<React.ComponentType<StudyModeProps>>(() => loadAppFeature("study") as Promise<{ default: React.ComponentType<StudyModeProps> }>);
