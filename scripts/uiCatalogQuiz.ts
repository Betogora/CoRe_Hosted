import type { Quiz, QuizQuestion } from "../src/quiz.ts";
import type { QuizGenerationInput, QuizPanelStart } from "../src/screens/DeckQuizPanel.tsx";

const single = (id: string, front: string, options: string[], correct: number, explanation: string, sourceLabels: string[]): QuizQuestion =>
  ({ id, form: "single-choice", front, back: "", options: options.map((text, index) => ({ text, correct: index === correct })), explanation, sources: [], sourceLabels });
const multiple = (id: string, front: string, options: Array<[string, boolean]>, explanation: string, sourceLabels: string[]): QuizQuestion =>
  ({ id, form: "multiple-choice", front, back: "", options: options.map(([text, correct]) => ({ text, correct })), explanation, sources: [], sourceLabels });
const card = (country: string) => `Karte „Hauptstadt ${country}?“`;
const page = (id: string, front: string, options: string[], correct: number, explanation: string, pageNumber: number) => single(id, front, options, correct, explanation, [`Seite ${pageNumber}`]);

const europeQuestions = [
  single("q1", "Welche Stadt ist die Hauptstadt von Portugal?", ["Porto", "Lissabon", "Coimbra", "Faro"], 1, "Lissabon liegt an der Mündung des Tejo und ist seit 1255 Hauptstadt.", [card("von Portugal")]),
  single("q2", "Welche Hauptstadt liegt an der Donau?", ["Prag", "Warschau", "Budapest", "Bern"], 2, "Budapest entstand 1873 aus Buda, Óbuda und Pest beiderseits der Donau.", [card("von Ungarn")]),
  multiple("q3", "Welche dieser Hauptstädte liegen an der Ostsee?", [["Tallinn", true], ["Riga", true], ["Vilnius", false], ["Helsinki", true]], "Vilnius liegt im Landesinneren Litauens, rund 300 km von der Küste entfernt.",
    [card("von Estland"), card("von Lettland"), card("von Litauen"), card("von Finnland")]),
  single("q4", "Welche Stadt ist die Bundesstadt der Schweiz?", ["Zürich", "Genf", "Bern", "Basel"], 2, "Bern ist Bundesstadt; eine Hauptstadt im rechtlichen Sinn kennt die Verfassung nicht.", [card("der Schweiz")]),
  single("q5", "Welche Hauptstadt liegt am nördlichsten?", ["Oslo", "Helsinki", "Reykjavík", "Stockholm"], 2, "Reykjavík liegt auf etwa 64° nördlicher Breite.", [card("von Island")]),
  multiple("q6", "Welche dieser Hauptstädte gehörten zu keiner Zeit zum Herrschaftsgebiet der Habsburgermonarchie?", [["Wien", false], ["Paris", true], ["Prag", false], ["Lissabon", true]], "Wien und Prag gehörten zur Habsburgermonarchie, Paris und Lissabon nie.",
    [card("von Österreich"), card("von Tschechien")]),
  single("q7", "Welche Stadt ist die Hauptstadt von Litauen?", ["Riga", "Vilnius", "Tallinn", "Kaunas"], 1, "Vilnius ist seit 1990 wieder Hauptstadt; Kaunas war es zwischen den Weltkriegen.", [card("von Litauen")]),
  single("q8", "An welchem Fluss liegt Warschau?", ["Oder", "Weichsel", "Elbe", "Memel"], 1, "", [card("von Polen")]),
];

const scriptQuestions = [
  page("p1", "Welcher Fluss ist der längste Europas?", ["Donau", "Wolga", "Rhein", "Dnepr"], 1, "Die Wolga ist mit rund 3.530 km der längste Fluss Europas.", 2),
  page("p2", "In welches Meer mündet die Donau?", ["Adria", "Ostsee", "Schwarzes Meer", "Ägäis"], 2, "Die Donau mündet mit einem Delta in Rumänien und der Ukraine ins Schwarze Meer.", 3),
  page("p3", "Welcher Fluss fließt durch Paris?", ["Loire", "Rhône", "Garonne", "Seine"], 3, "Die Seine durchquert Paris von Südosten nach Westen.", 3),
  page("p4", "An welchem Fluss liegt Köln?", ["Rhein", "Main", "Elbe", "Mosel"], 0, "Köln liegt am Niederrhein.", 4),
  page("p5", "Welcher Fluss bildet den größten Teil der Grenze zwischen Rumänien und Bulgarien?", ["Theiß", "Pruth", "Donau", "Mariza"], 2, "Die Donau trennt beide Länder auf rund 470 km.", 4),
  page("p6", "Welches Gebirge trennt die Iberische Halbinsel vom übrigen Europa?", ["Alpen", "Pyrenäen", "Apennin", "Karpaten"], 1, "Die Pyrenäen reichen vom Golf von Biskaya bis zum Mittelmeer.", 5),
  page("p7", "Wie heißt der höchste Berg der Alpen?", ["Matterhorn", "Großglockner", "Mont Blanc", "Zugspitze"], 2, "Der Mont Blanc ist rund 4.800 m hoch.", 6),
  page("p8", "Welches Gebirge durchzieht Italien von Nord nach Süd?", ["Dolomiten", "Apennin", "Pyrenäen", "Dinarisches Gebirge"], 1, "Der Apennin bildet das Rückgrat der italienischen Halbinsel.", 7),
  page("p9", "Welches Gebirge bildet die östliche Grenze Europas?", ["Karpaten", "Balkangebirge", "Ural", "Skanden"], 2, "Der Ural gilt als Grenze zwischen Europa und Asien.", 8),
  page("p10", "Zu welchem Gebirge gehört die Hohe Tatra?", ["Sudeten", "Alpen", "Rhodopen", "Karpaten"], 3, "Die Hohe Tatra ist der höchste Teil der Karpaten.", 9),
];

const europe: Quiz = {
  version: 1, id: "quiz-europa", deckId: "catalog-world", title: "Hauptstädte Europas",
  source: { kind: "cards", withSubdecks: true, cardCount: 24 },
  settings: { questionCount: 8, cardForms: ["single-choice", "multiple-choice"], wishes: "", trackTime: true },
  createdAt: "2026-11-20T09:12:00.000Z", updatedAt: "2026-11-23T18:40:00.000Z", questions: europeQuestions,
  attempts: [
    { startedAt: "2026-11-20T09:15:00.000Z", finishedAt: "2026-11-20T09:24:00.000Z", durationMs: 540_000, answers: { q1: [1], q2: [0], q3: [0, 1], q4: [2], q5: [0], q6: [1, 3], q7: [1], q8: [0] }, helped: [] },
    { startedAt: "2026-11-23T18:31:00.000Z", finishedAt: "2026-11-23T18:40:00.000Z", durationMs: 492_000, answers: { q1: [1], q2: [2], q3: [0, 1, 3], q4: [2], q5: [3], q6: [1], q7: [1], q8: [1] }, helped: ["q5"] },
  ],
};

export const catalogQuizzes: Quiz[] = [
  europe,
  {
    version: 1, id: "quiz-skript", deckId: "catalog-world", title: "Geografie-Skript Kapitel 3: Flüsse, Gebirge und Klimazonen Europas",
    source: { kind: "file", fileName: "geografie-skript-kapitel-3.pdf" },
    settings: { questionCount: 10, cardForms: ["single-choice"], wishes: "Schwerpunkt Flüsse und Gebirge", trackTime: false },
    createdAt: "2026-11-24T08:00:00.000Z", updatedAt: "2026-11-24T08:00:00.000Z", questions: scriptQuestions, attempts: [],
  },
  {
    version: 1, id: "quiz-europa-falsche", deckId: "catalog-world", title: "Hauptstädte Europas · nur falsche",
    source: { kind: "quiz", quizId: europe.id },
    settings: { questionCount: 2, cardForms: ["single-choice", "multiple-choice"], wishes: "", trackTime: false },
    createdAt: "2026-11-23T18:41:00.000Z", updatedAt: "2026-11-23T18:44:00.000Z", questions: europeQuestions.filter((question) => ["q5", "q6"].includes(question.id)),
    attempts: [{ startedAt: "2026-11-23T18:42:00.000Z", finishedAt: "2026-11-23T18:44:00.000Z", answers: { q5: [2], q6: [1, 3] }, helped: [] }],
  },
];

export const QUIZ_CATALOG_STATES = [
  "leer", "liste", "menue-karten", "menue-pdf", "menue-erweitert", "menue-zusammenfassung", "erstellung",
  "lauf-leer", "lauf-teilweise", "lauf-hilfe", "lauf-luecken", "lauf-verlassen", "auswertung", "auswertung-offen", "auswertung-fehlerfrei", "karten-speichern",
] as const;
export type QuizCatalogState = typeof QUIZ_CATALOG_STATES[number];

const partlyAnswered = { quizId: europe.id, answers: { q1: [1], q2: [2], q3: [0, 1], q4: [2] }, elapsedMs: 252_000 };

export function quizCatalogStart(state: QuizCatalogState): QuizPanelStart {
  switch (state) {
    case "menue-karten": return { view: "list", draft: {} };
    case "menue-pdf": return { view: "list", draft: { source: "file", file: new File([new Uint8Array(1_840_000)], "geografie-skript-kapitel-3.pdf", { type: "application/pdf" }) } };
    case "menue-erweitert": return { view: "list", draft: {}, advanced: true };
    case "erstellung": return { view: "list", draft: {}, generate: true };
    case "lauf-leer": return { view: "run", quizId: europe.id };
    case "lauf-teilweise": return { view: "run", ...partlyAnswered };
    case "lauf-hilfe": return { view: "run", ...partlyAnswered, help: "q5" };
    case "lauf-luecken": return { view: "run", ...partlyAnswered, confirm: "submit" };
    case "lauf-verlassen": return { view: "run", ...partlyAnswered, confirm: "leave" };
    case "auswertung": return { view: "result", quizId: europe.id };
    case "auswertung-offen": return { view: "result", quizId: europe.id, expanded: ["q6"] };
    case "auswertung-fehlerfrei": return { view: "result", quizId: "quiz-europa-falsche" };
    case "karten-speichern": return { view: "save", quizId: europe.id };
    default: return { view: "list" };
  }
}

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("abgebrochen")); });
});

/** `stall` holds the creation at its fourth question from the start, so the catalog can show the waiting state. */
export async function generateQuizDemo(input: QuizGenerationInput, signal: AbortSignal, onProgress: (done: number, total: number) => void, stall = false): Promise<QuizQuestion[]> {
  const questions = (input.source.kind === "file" ? scriptQuestions : europeQuestions).filter((question) => input.settings.cardForms.includes(question.form)).slice(0, input.settings.questionCount);
  if (!questions.length) throw new Error("Die Quelle ergab keine Fragen.");
  for (let done = stall ? 3 : 0; done < questions.length; done += 1) {
    onProgress(done, questions.length);
    await pause(stall ? 3_600_000 : 350, signal);
  }
  return questions.map((question) => ({ ...question, id: crypto.randomUUID() }));
}

export const askQuizHelpDemo = (_request: unknown, signal: AbortSignal) => pause(300, signal).then(() =>
  "Vergleiche die Breitengrade der vier Städte.\n\n- Oslo, Stockholm und Helsinki liegen alle nahe dem 60. Breitengrad.\n- Eine der Hauptstädte liegt auf einer Insel im Nordatlantik und damit deutlich weiter nördlich.");
