const views = [
  {
    id: "dashboard",
    label: "Dashboard",
    iconKey: "home",
    title: "Dashboard",
    eyebrow: "Heute",
    body: "Hier bekommst du einen schnellen Ueberblick ueber die wichtigsten Bereiche deiner App.",
    stats: [
      { label: "Aufgaben", value: "12" },
      { label: "Fokuszeit", value: "4h" },
      { label: "Status", value: "Aktiv" },
    ],
  },
  {
    id: "planung",
    label: "Planung",
    iconKey: "calendar",
    title: "Planung",
    eyebrow: "Naechste Schritte",
    body: "Diese Ansicht ist fuer Termine, Ideen und To-dos gedacht. Du kannst sie spaeter mit echten Daten verbinden.",
    stats: [
      { label: "Meetings", value: "3" },
      { label: "Offen", value: "7" },
      { label: "Prioritaet", value: "Hoch" },
    ],
  },
  {
    id: "analyse",
    label: "Analyse",
    iconKey: "chart",
    title: "Analyse",
    eyebrow: "Auswertung",
    body: "Hier koennten Diagramme, Fortschritt und Kennzahlen landen. Im Moment zeigt sie dir den View-Wechsel.",
    stats: [
      { label: "Wachstum", value: "+18%" },
      { label: "Nutzer", value: "248" },
      { label: "Trend", value: "Stabil" },
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
