const views = [
  {
    id: "uebersicht",
    label: "Heute",
    iconKey: "home",
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
    navigation: false,
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
    title: "Neue Karten",
    eyebrow: "Import und Erstellung",
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "KI", value: "Drafts" },
    ],
  },
  {
    id: "lernen",
    label: "Lernen",
    iconKey: "learn",
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
    title: "Statistik",
    eyebrow: "Leistung",
    stats: [
      { label: "Reviews", value: "0" },
      { label: "Trefferquote", value: "-" },
      { label: "Serie", value: "0" },
    ],
  },
  {
    id: "graph",
    label: "Graph",
    iconKey: "graph",
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
    label: "Community",
    iconKey: "community",
    title: "Communitys",
    eyebrow: "Kleine Gruppen",
    stats: [
      { label: "Gruppen", value: "0" },
      { label: "Geteilte Decks", value: "0" },
      { label: "Privacy", value: "Privat" },
    ],
  },
  {
    id: "einstellungen",
    label: "Einstellungen",
    iconKey: "settings",
    navigation: false,
    title: "Einstellungen",
    eyebrow: "Profil",
    stats: [
      { label: "Sprache", value: "de" },
      { label: "CoRe", value: "Auto" },
      { label: "Privacy", value: "Privat" },
    ],
  },
];

export function createMenuModel() {
  const defaultViewId = views[0].id;
  const viewsById = new Map(views.map((view) => [view.id, view]));

  return {
    defaultViewId,
    listNavigationItems() {
      return views.filter((view) => view.navigation !== false).map(({ id, label, iconKey }: any) => ({ id, label, iconKey }));
    },
    listViews() {
      return views.map((view) => ({ ...view, stats: [...view.stats] }));
    },
    getView(viewId: string) {
      return viewsById.get(viewId) ?? viewsById.get(defaultViewId);
    },
  };
}
