import { productSurfaces, type ProductSurfaceId, type ProductSurfaceRegistry } from "./productSurfaces.ts";

type NavigationPlacement = "primary" | "labs" | "hidden";

interface ViewStat {
  label: string;
  value: string;
}

interface MenuView {
  id: string;
  label: string;
  iconKey: string;
  navigation: NavigationPlacement;
  productSurfaceId?: ProductSurfaceId;
  title: string;
  eyebrow: string;
  stats: ViewStat[];
}

const views: MenuView[] = [
  {
    id: "uebersicht",
    label: "Heute",
    iconKey: "home",
    navigation: "primary",
    productSurfaceId: "today",
    title: "Heute lernen",
    eyebrow: "Dashboard",
    stats: [
      { label: "Fällig", value: "0" },
      { label: "Originalkarten", value: "0" },
      { label: "CoRe-ready", value: "0" },
    ],
  },
  {
    id: "kartenstapel",
    label: "Kartenstapel",
    iconKey: "layers",
    navigation: "hidden",
    title: "Kartenstapel",
    eyebrow: "Bibliothek",
    stats: [
      { label: "Decks", value: "0" },
      { label: "Varianten", value: "0" },
      { label: "Geteilt", value: "0" },
    ],
  },
  {
    id: "neue-karten",
    label: "Erstellen",
    iconKey: "plus",
    navigation: "primary",
    productSurfaceId: "creation-manual-import",
    title: "Neue Karten",
    eyebrow: "Import und Erstellung",
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "KI", value: "Labs" },
    ],
  },
  {
    id: "lernen",
    label: "Lernen",
    iconKey: "learn",
    navigation: "primary",
    productSurfaceId: "learn",
    title: "Lernen",
    eyebrow: "Review",
    stats: [
      { label: "Heute gelernt", value: "0" },
      { label: "Trefferquote", value: "-" },
      { label: "Nächste Runde", value: "-" },
    ],
  },
  {
    id: "statistik",
    label: "Statistik",
    iconKey: "chart",
    navigation: "primary",
    productSurfaceId: "statistics",
    title: "Statistik",
    eyebrow: "Leistung",
    stats: [
      { label: "Reviews", value: "0" },
      { label: "Trefferquote", value: "-" },
      { label: "Serie", value: "0" },
    ],
  },
  {
    id: "assistent",
    label: "Assistent",
    iconKey: "assistant",
    navigation: "labs",
    productSurfaceId: "assistant-chat",
    title: "Assistent",
    eyebrow: "Chat und Lernplan",
    stats: [],
  },
  {
    id: "graph",
    label: "Graph",
    iconKey: "graph",
    navigation: "labs",
    productSurfaceId: "graph",
    title: "Deck Graph",
    eyebrow: "Mindmap",
    stats: [
      { label: "Knoten", value: "0" },
      { label: "Kanten", value: "0" },
      { label: "Status", value: "-" },
    ],
  },
  {
    id: "community",
    label: "Community-Demo",
    iconKey: "community",
    navigation: "labs",
    productSurfaceId: "community-demo",
    title: "Communitys",
    eyebrow: "Kleine Gruppen",
    stats: [
      { label: "Gruppen", value: "0" },
      { label: "Geteilte Decks", value: "0" },
      { label: "Privacy", value: "Privat" },
    ],
  },
  {
    id: "ki-jobs",
    label: "KI-Job-Historie",
    iconKey: "jobs",
    navigation: "labs",
    productSurfaceId: "ai-job-history",
    title: "KI-Jobs",
    eyebrow: "Orchestrierung",
    stats: [],
  },
  {
    id: "einstellungen",
    label: "Einstellungen",
    iconKey: "settings",
    navigation: "hidden",
    productSurfaceId: "settings",
    title: "Einstellungen",
    eyebrow: "Profil",
    stats: [
      { label: "Sprache", value: "de" },
      { label: "CoRe", value: "Auto" },
      { label: "Privacy", value: "Privat" },
    ],
  },
];

function navigationItem(view: MenuView) {
  return { id: view.id, label: view.label, iconKey: view.iconKey };
}

export function createMenuModel(surfaceRegistry: ProductSurfaceRegistry = productSurfaces) {
  const defaultViewId = views[0].id;
  const viewsById = new Map(views.map((view) => [view.id, view]));
  const isAvailable = (view: MenuView) => !view.productSurfaceId || surfaceRegistry.isAvailable(view.productSurfaceId);

  return {
    defaultViewId,
    listNavigationItems() {
      return views
        .filter((view) => view.navigation === "primary" && (!view.productSurfaceId || surfaceRegistry.isMainNavigationVisible(view.productSurfaceId)))
        .map(navigationItem);
    },
    listLabsNavigationItems() {
      return views
        .filter((view) => view.navigation === "labs" && isAvailable(view))
        .map(navigationItem);
    },
    listViews() {
      return views.map((view) => ({ ...view, stats: [...view.stats] }));
    },
    listRoutableViewIds() {
      return views.filter(isAvailable).map((view) => view.id);
    },
    getView(viewId: string) {
      const view = viewsById.get(viewId);
      return view && isAvailable(view) ? view : viewsById.get(defaultViewId);
    },
  };
}
