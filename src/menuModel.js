const views = [
  {
    id: "uebersicht",
    label: "Heute",
    iconKey: "home",
    title: "Heute lernen",
    eyebrow: "Dashboard",
    body: "Fällige Karten, neue Inhalte und CoRe-Status an einem Ort.",
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
    body: "Deck-Hierarchie, Suche, Filter, CoRe-Modus und Stapelaktionen.",
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
    body: "APKG, Text/CSV, manuelle Karten mit Dokumentanker und KI-Drafts.",
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
    body: "Clean Review, vier Buttons, Maturity und Variantenanker.",
    stats: [
      { label: "Heute gelernt", value: "0" },
      { label: "Trefferquote", value: "-" },
      { label: "Nächste Runde", value: "-" },
    ],
  },
  {
    id: "graph",
    label: "Graph",
    iconKey: "graph",
    title: "Deck Graph",
    eyebrow: "Mindmap",
    body: "Themenknoten, Kartenlinks und manuelle Regeneration.",
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
    body: "Ordnerbasiertes Teilen ohne fremde Lernmetriken.",
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
    body: "Profil, Hochschule, Sprache, Datenschutz und Scheduler.",
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
      return views.filter((view) => view.navigation !== false).map(({ id, label, iconKey }) => ({ id, label, iconKey }));
    },
    listViews() {
      return views.map((view) => ({ ...view, stats: [...view.stats] }));
    },
    getView(viewId) {
      return viewsById.get(viewId) ?? viewsById.get(defaultViewId);
    },
  };
}
