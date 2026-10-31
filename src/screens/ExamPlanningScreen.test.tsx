import { ExamTopicPreview } from "./ExamTopicPreview.tsx";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCoreRepository } from "../coreRepository.ts";
import { ExamPlanningScreen } from "./ExamPlanningScreen.tsx";
import { ExamMonthCalendar } from "./ExamMonthCalendar.tsx";
import { ExamDashboardWidget } from "./ExamDashboardWidget.tsx";
import { getGlobalSchedulerPreferences, withGlobalSchedulerPreferences } from "../learningProfiles.ts";
import { createCoreDeck } from "../coreModel.ts";
import { ExamPlanEditor } from "./ExamPlanEditor.tsx";
import { ExamWeekCalendar } from "./ExamWeekCalendar.tsx";
import { createExamPlan, createStudyTimeCapacity } from "../examPlanSettings.ts";
import { type ExamPortfolioForecast, type StudyPlanBlock } from "../examPlanning.ts";
import { examColor, examTextColor } from "./examPlanningUi.ts";
import { colorContrast } from "../ui/colorMath.ts";

test("freie Prüfungsfarben behalten ihren Farbwert mit lesbarer Schrift", () => {
  for (const color of ["#ffffff", "#ffff00", "#00ff00", "#ff0000", "#0000ff", "#000000", "#6f7e9e"]) {
    assert.equal(examColor(0, { color, colorIndex: 4 }), color);
    assert.ok(colorContrast(color, examTextColor({ color })) >= 4.5);
  }
  assert.equal(examColor(0, { colorIndex: 4 }), "var(--core-exam-color-5)");
});

test("der leere Planer zeigt die Anlage im Kopf und den Kalender vor der Prüfungsliste", () => {
  const markup = renderToStaticMarkup(<ExamPlanningScreen state={createCoreRepository().getState()} now="2026-10-18T08:00:00Z" onLoadPlanningData={async () => { throw new Error("Not used in static rendering"); }} onSavePlanning={async () => undefined} onSaveTasks={async () => undefined} onStartUnit={async () => undefined} />);
  assert.ok(markup.indexOf("Prüfung hinzufügen") < markup.indexOf('data-testid="exam-month-calendar"'));
  assert.ok(markup.indexOf('data-testid="exam-month-calendar"') < markup.indexOf('id="exam-list-title"'));
  assert.match(markup, /Oktober 2026/);
  assert.match(markup, /Noch keine Prüfung geplant/);
  assert.doesNotMatch(markup, /Weitere Prüfung planen/);
  assert.match(markup, /<button(?=[^>]*aria-label="Erste Prüfung planen")(?=[^>]*disabled)[^>]*>/);
  assert.doesNotMatch(markup, /data-testid="exam-day-editor"/);
});

test("Prüfungskarten beginnen als neutrale, beschriftete Disclosure ohne sofortige Aktionen", () => {
  const state = createCoreRepository().getState();
  const exam = { ...createExamPlan("2026-10-18", ["deck"]), id: "patho", name: "Patho", examDate: "2026-11-19" };
  state.profile = withGlobalSchedulerPreferences(state.profile, { examPlanning: { version: 3, exams: [exam], capacity: createStudyTimeCapacity() } });
  const html = renderToStaticMarkup(<ExamPlanningScreen state={state} now="2026-10-18T12:00:00Z" onLoadPlanningData={async () => { throw new Error("Not called in SSR"); }} onSavePlanning={async () => undefined} onSaveTasks={async () => undefined} onStartUnit={async () => undefined} />);
  assert.match(html, /aria-expanded="false"[^>]*aria-controls="[^"]+"[^>]*aria-label="Patho: Details öffnen"/);
  assert.match(html, /19\. November 2026 · in 32 Tagen/);
  assert.match(html, /<button(?=[^>]*disabled)[^>]*>(?:(?!<\/button>).)*Weitere Prüfung planen<\/span><\/button>/);
  assert.ok(html.indexOf("Weitere Prüfung planen") > html.indexOf("Patho: Details öffnen"));
  assert.doesNotMatch(html, /data-testid="exam-card-details"/);
  assert.doesNotMatch(html, />Bearbeiten<|>Pausieren<|>Abschließen</);
});

test("calendar shows new cards in subject color without duration or repetitions", () => {
  const today = "2026-10-20";
  const first = { ...createExamPlan(today, ["deck"]), id: "anatomy", name: "Anatomie", createdAt: "2026-10-17T08:00:00.000Z", examDate: "2026-10-27" };
  const second = { ...first, id: "physiology", name: "Physiologie", examDate: "2026-10-30" };
  const block = (examId: string, count: number, method: StudyPlanBlock["method"]): StudyPlanBlock => ({ id: `${examId}-${method}`, date: today, examIds: [examId], deckId: "deck", method, expectedItems: count, cardIds: Array.from({ length: count }, (_, i) => `${examId}-${method}-${i}`) });
  const forecast: ExamPortfolioForecast = { days: [{ key: today, budgetMinutes: 120, newCardIds: [], reviewCardIds: [], summaries: [], blocks: [block(first.id, 24, "new"), block(second.id, 9, "new"), block(first.id, 8, "review")] }], exams: [] };
  const html = renderToStaticMarkup(<ExamMonthCalendar onToggleExam={() => undefined} exams={[first, second]} shown={[first, second]} forecast={forecast} today={today} date={today} color={() => "var(--core-info)"} onSelect={() => undefined} />);
  assert.match(html, /data-exam-subject="anatomy"[^]*?data-exam-task="study">24 neue Karten<\/span>/);
  assert.match(html, /data-exam-subject="physiology"[^]*?>9 neue Karten</);
  assert.match(html, /border-color:var\(--core-info\);background:color-mix/);
  assert.match(html, /Anatomie: 24 neue Karten\. Physiologie: 9 neue Karten/);
  assert.doesNotMatch(html, /Min\.|Std\.|Wiederholungen|08:00/);
  const week = renderToStaticMarkup(<ExamWeekCalendar onToggleExam={() => undefined} exams={[first, second]} shown={[first, second]} decks={[]} capacity={createStudyTimeCapacity()} forecast={forecast} today={today} date={today} busy={false} color={() => "var(--core-info)"} onSelect={() => undefined} onChange={() => true} />);
  assert.match(week, /data-week-task="anatomy" aria-label="Anatomie: 24 neue Karten\. Aufgabe auswählen/);
  assert.ok(html.indexOf('aria-label="Prüfungen im Kalender"') > html.indexOf('data-testid="exam-month-calendar"'));
  assert.ok(html.indexOf('aria-label="Prüfungen im Kalender"') < html.indexOf('>Heute<'));
  assert.ok(week.indexOf('aria-label="Prüfungen im Kalender"') > week.indexOf('data-testid="exam-week-calendar"'));
  assert.ok(week.indexOf('aria-label="Prüfungen im Kalender"') < week.indexOf('>Heute<'));
});

test("exam dates stay visible without a forecast and distinguish same-day exams", () => {
  const exam = { ...createExamPlan("2026-10-18", ["deck"]), id: "anatomy", name: "Anatomie", createdAt: "2026-10-17T08:00:00.000Z", examDate: "2026-10-27" };
  const other = { ...exam, id: "physiology", name: "Physiologie" };
  const markup = renderToStaticMarkup(<ExamMonthCalendar onToggleExam={() => undefined} exams={[exam, other]} shown={[exam, other]} forecast={null} today="2026-10-18" date="2026-10-18" color={(entry) => entry.id === exam.id ? "var(--core-info)" : "var(--core-success)"} onSelect={() => undefined} />);
  assert.match(markup, /data-exam-appointment="anatomy"/);
  assert.match(markup, /data-exam-appointment="physiology"/);
  assert.match(markup, /Klausur: Anatomie. Klausur: Physiologie/);
  assert.match(markup, /Lernmenge noch nicht berechnet/);
  assert.match(markup, /aria-current="date"/);
});

test("die Monatsansicht beginnt mit der aktuellen Woche und erhält die Aufgaben", () => {
  const today = "2026-08-03";
  const exam = { ...createExamPlan(today, ["deck"]), id: "exam", name: "Anatomie", createdAt: "2026-07-31T08:00:00.000Z", examDate: "2026-08-28" };
  const day = { key: today, budgetMinutes: 60, newCardIds: ["card"], reviewCardIds: [], summaries: [], blocks: [{ id: "new", date: today, examIds: [exam.id], deckId: "deck", method: "new" as const, expectedItems: 1, cardIds: ["card"] }] };
  const forecast: ExamPortfolioForecast = { days: [day], exams: [] };
  const render = () => renderToStaticMarkup(<ExamMonthCalendar onToggleExam={() => undefined} exams={[exam]} shown={[exam]} forecast={forecast} today={today} date={today} color={() => "var(--core-info)"} onSelect={() => undefined} />);
  const cell = (html: string) => html.split(`data-date="${today}"`)[1].split("</button>")[0];
  assert.doesNotMatch(render(), /data-date="2026-07-27"/);
  assert.match(render(), /data-date="2026-08-03"/);
  assert.match(render(), /aria-label="Frühere Wochen"/);
  assert.match(cell(render()), /data-exam-task="study"/);
  day.blocks = [];
  day.newCardIds = [];
  assert.doesNotMatch(cell(render()), /data-exam-task="study"|>0 neue Karten</);
});

test("compact month prioritizes exams and announces tasks beyond the visible entries", () => {
  const today = "2026-10-18";
  const exams = ["Anatomie", "Physiologie", "Biochemie"].map((name) => ({ ...createExamPlan(today, ["deck"]), id: name, name, examDate: "2026-10-27" }));
  const html = renderToStaticMarkup(<ExamMonthCalendar onToggleExam={() => undefined} exams={exams} shown={exams} forecast={null} today={today} date={today} color={() => "var(--core-exam-color-1)"} onSelect={() => undefined} />);
  assert.match(html, /Klausur: Anatomie\. Klausur: Physiologie\. Klausur: Biochemie/);
  assert.match(html, /title="1 weiterer Eintrag in den Tagesdetails">\+1/);
  assert.match(html, /data-exam-appointment="Anatomie"/);
  assert.match(html, /data-exam-appointment="Physiologie"/);
  assert.doesNotMatch(html, /data-exam-appointment="Biochemie"/);
});

test("Wochenansicht zeigt To-dos über 7–24 Uhr und erhält neutrale Lernzeitblöcke", () => {
  const today = "2026-10-20";
  const exam = { ...createExamPlan(today, ["deck"]), id: "anatomy", name: "Anatomie", createdAt: "2026-10-17T08:00:00.000Z", examDate: "2026-10-27" };
  const capacity = { ...createStudyTimeCapacity(), timeBlocks: [{ id: "open", date: today, start: 780, end: 900, examId: null }] };
  const html = renderToStaticMarkup(<ExamWeekCalendar onToggleExam={() => undefined} exams={[exam]} shown={[exam]} decks={[]} capacity={capacity} forecast={null} today={today} date={today} busy={false} color={() => "var(--core-exam-color-1)"} onSelect={() => undefined} onChange={() => true} />);
  assert.ok(html.indexOf("To-dos") < html.indexOf('data-week-day="2026-10-20"'));
  assert.match(html, />07:00</);
  assert.doesNotMatch(html, />06:00</);
  assert.match(html, /23:00/);
  assert.match(html, /data-week-block="open"/);
  assert.match(html, /13:00–15:00/);
  assert.match(html, /Lernzeit ohne Fach/);
  assert.match(html, /aria-label="Fach im Zeitblock"|aria-label="Zeitblock auswählen"/);
  assert.equal((html.match(/role="slider"/g) ?? []).length, 7);
  assert.doesNotMatch(html, /Quiz/);
});


test("Heute zeigt Checklisten mit Prüfungsfarbpunkt ohne Zeitplanstatus und ohne Quiz", () => {
  const state = createCoreRepository().getState();
  const date = "2026-10-20", exam = { ...createExamPlan(date, ["deck"]), id: "anatomy", name: "Anatomie", examDate: "2026-10-27", colorIndex: 4 };
  state.profile = withGlobalSchedulerPreferences(state.profile, { examPlanning: { version: 3, exams: [exam], capacity: createStudyTimeCapacity(), dailyTasks: [
    { id: "topic:anatomy:deck", examId: exam.id, date, kind: "study", deckIds: ["deck"], cardIds: ["card"], capturedAt: date + "T08:00:00.000Z", completed: "automatic" },
  ] } });
  const html = renderToStaticMarkup(<ExamDashboardWidget state={state} now={date + "T12:00:00.000Z"} onLoad={async () => { throw new Error("Not called in SSR"); }} onSaveTasks={async () => undefined} onStart={async () => undefined} onOpen={() => undefined} />);
  assert.doesNotMatch(html, /Gut im Zeitplan|Im Zeitplan|exam-pace|Std\.|Min\./);
  assert.match(html, /background-color:var\(--core-exam-color-5\)/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /Automatisch erledigt/);
  assert.doesNotMatch(html, /Quiz/);
});

test("Bearbeiten lässt gültige Angaben ohne fertige Planung speichern", () => {
  const state = createCoreRepository().getState();
  const deck = createCoreDeck({ id: "deck", name: "Anatomie" });
  const exam = { ...createExamPlan("2026-10-18", [deck.id]), id: "anatomy", name: "Anatomie", examDate: "2026-11-19" };
  const html = renderToStaticMarkup(<ExamPlanEditor embedded decks={[deck]} exams={[exam]} capacity={createStudyTimeCapacity()} initialPlan={exam} preferences={getGlobalSchedulerPreferences(state.profile)} timeZone="Europe/Berlin" now="2026-10-18T12:00:00Z" onLoadPlanningData={() => new Promise(() => undefined)} onSave={async () => undefined} onCancel={() => undefined} saving={false} saveError="" />);
  assert.match(html, /Was ist dein Ziel für die Prüfung/);
  assert.match(html, /aria-label="Lernstart auswählen"/);
  assert.match(html, />18\.10\.2026<\/span>/);
  assert.match(html, /<input(?=[^>]*type="radio")(?=[^>]*value="0.9")(?=[^>]*checked)[^>]*>/);
  assert.doesNotMatch(html, /Abrufziel für Wiederholungen/);
  assert.match(html, /Dein Plan wird berechnet/);
  assert.match(html, /<button class="core-action-primary ">(?:(?!<\/button>).)*<span>Speichern<\/span><\/button>/);
});


test("ausgeblendete Prüfungen behalten ihren Umschaltknopf und freie Wochenblöcke", () => {
  const today = "2026-10-20";
  const first = { ...createExamPlan(today, ["deck"]), id: "anatomy", name: "Anatomie", examDate: "2026-10-27" };
  const second = { ...first, id: "physiology", name: "Physiologie" };
  const capacity = { ...createStudyTimeCapacity(), timeBlocks: [
    { id: "assigned", date: today, start: 540, end: 600, examId: first.id },
    { id: "open", date: today, start: 780, end: 840, examId: null },
  ] };
  const original = structuredClone(capacity);
  const week = renderToStaticMarkup(<ExamWeekCalendar exams={[first, second]} shown={[second]} onToggleExam={() => undefined} decks={[]} capacity={capacity} forecast={null} today={today} date={today} busy={false} color={() => "#1749e5"} onSelect={() => undefined} onChange={() => { assert.fail("Filtern darf keine Planung ändern"); }} />);
  assert.match(week, /aria-pressed="false"[^>]*>Anatomie<\/button>/);
  assert.match(week, /aria-pressed="true"[^>]*>Physiologie<\/button>/);
  assert.doesNotMatch(week, /data-week-block="assigned"/);
  assert.match(week, /data-week-block="open"/);
  const month = renderToStaticMarkup(<ExamMonthCalendar exams={[first, second]} shown={[]} onToggleExam={() => undefined} forecast={null} today={today} date={today} color={() => "#1749e5"} onSelect={() => undefined} />);
  assert.match(month, /aria-pressed="false"[^>]*>Anatomie<\/button>/);
  assert.match(month, /aria-pressed="false"[^>]*>Physiologie<\/button>/);
  assert.doesNotMatch(month, /data-exam-appointment=/);
  assert.deepEqual(capacity, original);
});


test("Themenvorschau kürzt lange Listen und lässt den Prüfungstermin außerhalb stehen", () => {
  const topics = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `Kapitel ${i + 1}`, detail: i ? "Bereits eingeführt" : "Ab Do., 29.10." }));
  const html = renderToStaticMarkup(<ExamTopicPreview topics={topics} examDate="2026-12-09" color="#1749e5" calendarRef={{ current: null }} actionsRef={{ current: null }} />);
  assert.match(html, /Deine Themenfolge/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Alle 20 Themen anzeigen/);
  assert.equal((html.match(/aria-hidden="true" class="grid min-w-0 gap-1 border-l /g) ?? []).length, 17);
  assert.ok(html.indexOf('data-testid="exam-topic-exam-date"') > html.indexOf('</ol>'));
  assert.match(html, /Mi\., 9\.12\./);
  const short = renderToStaticMarkup(<ExamTopicPreview topics={topics.slice(0, 2)} examDate="2026-12-09" calendarRef={{ current: null }} actionsRef={{ current: null }} />);
  assert.doesNotMatch(short, /Alle 2 Themen anzeigen|aria-hidden="true" class="grid/);
});


test("Monatsansicht bündelt alle Aufgaben je Fach und zählt nur weitere Fachkacheln", () => {
  const date = "2026-10-20";
  const first = { ...createExamPlan(date, ["a"]), id: "anatomy", name: "Anatomie" };
  const second = { ...first, id: "physiology", name: "Physiologie" };
  const third = { ...first, id: "biochem", name: "Biochemie" };
  const forecast: ExamPortfolioForecast = { days: [{ key: date, budgetMinutes: 120, newCardIds: ["c"], reviewCardIds: [], blocks: [{ id: "new", date, examIds: [first.id], deckId: "a", method: "new", expectedItems: 1, cardIds: ["c"] }], summaries: [{ examId: first.id, deckId: "a" }, { examId: second.id, deckId: "b" }, { examId: third.id, deckId: "c" }] }], exams: [] };
  const render = (shown = [first, second, third]) => renderToStaticMarkup(<ExamMonthCalendar exams={[first, second, third]} shown={shown} onToggleExam={() => undefined} forecast={forecast} today={date} date={date} color={() => "#1749e5"} onSelect={() => undefined} />).split(`data-date="${date}"`)[1].split("</button>")[0];
  const html = render();
  assert.equal((html.match(/data-exam-subject="anatomy"/g) ?? []).length, 1);
  assert.equal((html.match(/data-exam-subject="physiology"/g) ?? []).length, 1);
  assert.match(html, /data-exam-subject="anatomy"[^]*?data-exam-task="study">1 neue Karte<\/span><span data-exam-task="summary">Lesen<\/span><\/span>/);
  assert.match(html, /data-exam-subject="physiology"[^]*?data-exam-task="summary">Lesen<\/span><\/span>/);
  assert.match(html, /title="1 weiterer Eintrag in den Tagesdetails">\+1/);
  const readOnly = render([third]);
  assert.match(readOnly, /data-exam-subject="biochem"[^]*?data-exam-task="summary">Lesen/);
  assert.doesNotMatch(readOnly, /data-exam-task="study"|exam-month-more/);
});
