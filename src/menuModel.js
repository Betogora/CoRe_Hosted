const views = [
  {
    id: "uebersicht",
    label: "Uebersicht",
    iconKey: "home",
    title: "Uebersicht",
    eyebrow: "Heute",
    body: "Hier bekommst du einen schnellen Ueberblick ueber deine importierten Originalkarten und den aktuellen CoRe-Stand.",
    stats: [
      { label: "Importierte Decks", value: "0" },
      { label: "Originalkarten", value: "0" },
      { label: "CoRe-ready", value: "0" },
    ],
  },
  {
    id: "neue-karten",
    label: "Neue Karten",
    iconKey: "plus",
    title: "Neue Karten",
    eyebrow: "Erstellen",
    body: "Waehle zuerst zwischen Anki-Import, manueller Erstellung oder KI-assistierter Vorbereitung.",
    stats: [
      { label: "Anki", value: "APKG" },
      { label: "Manuell", value: "6 Typen" },
      { label: "KI", value: "Review-first" },
    ],
  },
  {
    id: "lernen",
    label: "Lernen",
    iconKey: "learn",
    title: "Lernen",
    eyebrow: "Review",
    body: "Starte mit den importierten Originalkarten. CoRe-Varianten werden spaeter separat erzeugt.",
    stats: [
      { label: "Heute gelernt", value: "0" },
      { label: "Trefferquote", value: "-" },
      { label: "Naechste Runde", value: "-" },
    ],
  },
  {
    id: "analyse",
    label: "Decks",
    iconKey: "chart",
    title: "Decks",
    eyebrow: "Bibliothek",
    body: "Sieh dir importierte Decks, Kartenanzahl, Tags und Import-Metadaten an.",
    stats: [
      { label: "Decks", value: "0" },
      { label: "Medien", value: "-" },
      { label: "Warnungen", value: "-" },
    ],
  },
];

export function createMenuModel() {
  const defaultViewId = views[0].id;
  const viewsById = new Map(views.map((view) => [view.id, view]));

  return {
    defaultViewId,
    listNavigationItems() {
      return views.map(({ id, label, iconKey }) => ({ id, label, iconKey }));
    },
    getView(viewId) {
      return viewsById.get(viewId) ?? viewsById.get(defaultViewId);
    },
  };
}
