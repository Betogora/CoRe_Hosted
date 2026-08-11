type NavigationPlacement = "primary" | "hidden";
export type MenuViewId =
  | "uebersicht"
  | "kartenstapel"
  | "neue-karten"
  | "lernen"
  | "statistik"
  | "simulator"
  | "hilfe"
  | "einstellungen";

interface ViewStat {
  label: string;
  value: string;
}

interface MenuView {
  id: MenuViewId;
  label: string;
  iconKey: string;
  navigation: NavigationPlacement;
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
    title: "Heute lernen",
    eyebrow: "Dashboard",
    stats: [
      { label: "Fällig", value: "0" },
      { label: "CoRe-ready", value: "0" },
    ],
  },
  {
    id: "kartenstapel",
    label: "Karten",
    iconKey: "layers",
    navigation: "primary",
    title: "Karten",
    eyebrow: "",
    stats: [
      { label: "Decks", value: "0" },
      { label: "Varianten", value: "0" },
      { label: "Unterstapel", value: "0" },
    ],
  },
  {
    id: "neue-karten",
    label: "Erstellen",
    iconKey: "plus",
    navigation: "primary",
    title: "Neue Karten",
    eyebrow: "Import und Erstellung",
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "Tabelle", value: "Paste" },
    ],
  },
  {
    id: "lernen",
    label: "Lernen",
    iconKey: "learn",
    navigation: "primary",
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
    title: "Statistik",
    eyebrow: "Leistung",
    stats: [
      { label: "Reviews", value: "0" },
      { label: "Trefferquote", value: "-" },
      { label: "Serie", value: "0" },
    ],
  },
  {
    id: "simulator",
    label: "Simulator",
    iconKey: "simulator",
    navigation: "hidden",
    title: "Simulator",
    eyebrow: "Zeitsimulation",
    stats: [],
  },
  {
    id: "hilfe",
    label: "Hilfe",
    iconKey: "help",
    navigation: "hidden",
    title: "Wie CoRe und FSRS funktionieren",
    eyebrow: "Hilfe",
    stats: [],
  },
  {
    id: "einstellungen",
    label: "Einstellungen",
    iconKey: "settings",
    navigation: "hidden",
    title: "Einstellungen",
    eyebrow: "Profil",
    stats: [],
  },
];
const primaryNavigationOrder: MenuViewId[] = ["uebersicht", "lernen", "neue-karten", "statistik", "kartenstapel"];

function navigationItem(view: MenuView) {
  return { id: view.id, label: view.label, iconKey: view.iconKey };
}

export function createMenuModel() {
  const defaultViewId = views[0].id;
  const viewsById = new Map(views.map((view) => [view.id, view]));
  return {
    defaultViewId,
    listNavigationItems() {
      return views
        .filter((view) => view.navigation === "primary")
        .sort((left, right) => primaryNavigationOrder.indexOf(left.id) - primaryNavigationOrder.indexOf(right.id))
        .map(navigationItem);
    },
    listViews() {
      return views.map((view) => ({ ...view, stats: [...view.stats] }));
    },
    listRoutableViewIds() {
      return views.map((view) => view.id);
    },
    getView(viewId: string) {
      const view = viewsById.get(viewId as MenuViewId);
      return view ?? viewsById.get(defaultViewId);
    },
  };
}
