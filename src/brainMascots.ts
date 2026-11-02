type MascotScene = "cards" | "question" | "correct" | "idea" | "quiet" | "work" | "carry" | "wink" | "think" | "write" | "meditate" | "celebrate" | "wrong" | "due" | "progress" | "focus" | "calendar" | "decks" | "search" | "plan" | "graduate" | "read" | "run" | "notes" | "sleep" | "shield" | "trophy";

interface BrainMascotDefinition {
  id: string;
  title: string;
  collection: "adventure" | "pastel";
  scene: MascotScene;
  description: string;
  /** Drawn on a rounded square background like an icon tile. */
  tile?: true;
}

/** Source order follows each supplied sheet, left to right and top to bottom. */
export const BRAIN_MASCOTS = [
  { id: "abenteuer-lernen", title: "Karteikarten lernen", collection: "adventure", scene: "cards", description: "Liest eine Karte neben einem Bücherstapel." },
  { id: "abenteuer-knobeln", title: "An einer Frage knobeln", collection: "adventure", scene: "question", description: "Schaut nachdenklich auf eine Karte mit einem Fragezeichen darüber." },
  { id: "abenteuer-richtig", title: "Richtige Antwort", collection: "adventure", scene: "correct", description: "Hält fröhlich eine gelöste Karte in die Höhe." },
  { id: "abenteuer-idee", title: "Eine Idee haben", collection: "adventure", scene: "idea", description: "Denkt nach und entdeckt eine leuchtende Idee." },
  { id: "abenteuer-ruhe", title: "In Ruhe wiederholen", collection: "adventure", scene: "quiet", description: "Lernt ruhig mit geschlossenen Augen; daneben steht eine Uhr." },
  { id: "abenteuer-arbeiten", title: "Am Schreibtisch lernen", collection: "adventure", scene: "work", description: "Arbeitet am Laptop zwischen Büchern und einer Pflanze." },
  { id: "abenteuer-kartentragen", title: "Lernstoff mitnehmen", collection: "adventure", scene: "carry", description: "Läuft mit einem bunten Stapel Karteikarten." },
  { id: "abenteuer-zwinkern", title: "Das kannst du", collection: "adventure", scene: "wink", description: "Zwinkert und zeigt eine Karte." },
  { id: "abenteuer-nachdenken", title: "Noch einmal nachdenken", collection: "adventure", scene: "think", description: "Denkt neben einem Stapel mit einem Fragezeichen nach." },
  { id: "abenteuer-schreiben", title: "Etwas aufschreiben", collection: "adventure", scene: "write", description: "Schreibt mit einem Bleistift auf eine Karte." },
  { id: "abenteuer-durchatmen", title: "Kurz durchatmen", collection: "adventure", scene: "meditate", description: "Sitzt entspannt im Schneidersitz mit geschlossenen Augen." },
  { id: "abenteuer-geschafft", title: "Geschafft!", collection: "adventure", scene: "celebrate", description: "Jubelt neben einem grünen Häkchen und Karteikarten." },
  { id: "pastell-app", title: "App-Icon", collection: "pastel", scene: "cards", description: "Das lernende Gehirn auf einer hellblauen Iconfläche.", tile: true },
  { id: "pastell-lernen", title: "Lernen", collection: "pastel", scene: "cards", description: "Liest aufmerksam eine Karteikarte." },
  { id: "pastell-nicht-sicher", title: "Nicht sicher", collection: "pastel", scene: "question", description: "Hebt fragend die Hand unter einem Fragezeichen." },
  { id: "pastell-richtig", title: "Richtig", collection: "pastel", scene: "correct", description: "Freut sich über eine gelöste Karte." },
  { id: "pastell-nochmal", title: "Falsch / Nochmal", collection: "pastel", scene: "wrong", description: "Schaut unter einer kleinen Wolke auf seine Karte." },
  { id: "pastell-verstanden", title: "Verstanden", collection: "pastel", scene: "idea", description: "Zeigt lächelnd auf eine leuchtende Glühbirne." },
  { id: "pastell-wiederholung", title: "Wiederholung fällig", collection: "pastel", scene: "due", description: "Wartet neben einer Sanduhr und einem Kartenstapel." },
  { id: "pastell-fortschritt", title: "Fortschritt", collection: "pastel", scene: "progress", description: "Springt über die Stufen eines wachsenden Diagramms." },
  { id: "pastell-fokus", title: "Fokus-Modus", collection: "pastel", scene: "focus", description: "Konzentriert sich mit großen Kopfhörern und geschlossenen Augen." },
  { id: "pastell-arbeiten", title: "Lernen / Arbeiten", collection: "pastel", scene: "work", description: "Arbeitet am Laptop mit einer Tasse daneben." },
  { id: "pastell-ziel", title: "Ziel erreicht", collection: "pastel", scene: "celebrate", description: "Jubelt mit beiden Armen unter buntem Konfetti." },
  { id: "pastell-tagesziel", title: "Tagesziel", collection: "pastel", scene: "calendar", description: "Steht vor einem Kalender mit markiertem Lerntag." },
  { id: "pastell-stapel", title: "Stapelübersicht", collection: "pastel", scene: "decks", description: "Zeigt auf eine Liste seiner Kartenstapel." },
  { id: "pastell-suchen", title: "Karten suchen", collection: "pastel", scene: "search", description: "Schaut über ein Suchfeld mit einer Lupe." },
  { id: "pastell-erstellen", title: "Karte erstellen", collection: "pastel", scene: "wink", description: "Zwinkert mit einem Stift in der Hand." },
  { id: "pastell-planen", title: "Planen", collection: "pastel", scene: "plan", description: "Überlegt unter einer Gedankenblase mit drei Punkten." },
  { id: "pastell-pause", title: "Pause", collection: "pastel", scene: "meditate", description: "Ruht mit geschlossenen Augen zwischen kleinen Sternen." },
  { id: "pastell-lernmodus", title: "Lernmodus", collection: "pastel", scene: "graduate", description: "Trägt einen dunkelblauen Absolventenhut.", tile: true },
  { id: "pastell-lesen", title: "Lesen", collection: "pastel", scene: "read", description: "Liest mit runder Brille in einem offenen Buch.", tile: true },
  { id: "pastell-aha", title: "Idee / Aha", collection: "pastel", scene: "idea", description: "Hat eine Idee auf einer warmen gelben Iconfläche.", tile: true },
  { id: "pastell-schnelllernen", title: "Schnelllernen", collection: "pastel", scene: "run", description: "Läuft fröhlich mit kleinen Bewegungslinien hinter sich.", tile: true },
  { id: "pastell-notizen", title: "Notizen", collection: "pastel", scene: "notes", description: "Hält einen großen Bleistift bereit.", tile: true },
  { id: "pastell-erholen", title: "Schlafen / Erholen", collection: "pastel", scene: "sleep", description: "Schläft friedlich unter drei kleinen Zs.", tile: true },
  { id: "pastell-langzeitwissen", title: "Langzeitwissen", collection: "pastel", scene: "shield", description: "Hält einen blauen Schild mit einem goldenen Stern.", tile: true },
  { id: "pastell-erfolg", title: "Erfolg", collection: "pastel", scene: "trophy", description: "Hebt stolz einen goldenen Pokal.", tile: true },
] as const satisfies readonly BrainMascotDefinition[];

export type BrainMascotId = typeof BRAIN_MASCOTS[number]["id"];
