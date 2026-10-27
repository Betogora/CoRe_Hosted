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

test("the empty exam screen starts with a month calendar and creation below", () => {
  const markup = renderToStaticMarkup(<ExamPlanningScreen state={createCoreRepository().getState()} now="2026-10-18T08:00:00Z" onLoadPlanningData={async () => { throw new Error("Not used in static rendering"); }} onSavePlanning={async () => undefined} onSaveTasks={async () => undefined} onStartUnit={async () => undefined} />);
  assert.ok(markup.indexOf('data-testid="exam-month-calendar"') < markup.indexOf("Prüfung hinzufügen"));
  assert.match(markup, /Oktober 2026/);
  assert.match(markup, /Noch keine Prüfung geplant/);
  assert.doesNotMatch(markup, /data-testid="exam-day-editor"/);
});

test("Prüfungskarten beginnen als neutrale, beschriftete Disclosure ohne sofortige Aktionen", () => {
  const state = createCoreRepository().getState();
  const exam = { ...createExamPlan("2026-10-18", ["deck"]), id: "patho", name: "Patho", examDate: "2026-11-19" };
  state.profile = withGlobalSchedulerPreferences(state.profile, { examPlanning: { version: 3, exams: [exam], capacity: createStudyTimeCapacity() } });
  const html = renderToStaticMarkup(<ExamPlanningScreen state={state} now="2026-10-18T12:00:00Z" onLoadPlanningData={async () => { throw new Error("Not called in SSR"); }} onSavePlanning={async () => undefined} onSaveTasks={async () => undefined} onStartUnit={async () => undefined} />);
  assert.match(html, /aria-expanded="false"[^>]*aria-controls="[^"]+"[^>]*aria-label="Patho: Details öffnen"/);
  assert.match(html, /19\. November 2026 · in 32 Tagen/);
  assert.doesNotMatch(html, /data-testid="exam-card-details"/);
  assert.doesNotMatch(html, />Bearbeiten<|>Pausieren<|>Abschließen</);
});

test("calendar shows new cards in subject color without duration or repetitions", () => {
  const today = "2026-10-20";
  const first = { ...createExamPlan(today, ["deck"]), id: "anatomy", name: "Anatomie", createdAt: "2026-10-17T08:00:00.000Z", examDate: "2026-10-27" };
  const second = { ...first, id: "physiology", name: "Physiologie", examDate: "2026-10-30" };
  const block = (examId: string, count: number, method: StudyPlanBlock["method"]): StudyPlanBlock => ({ id: `${examId}-${method}`, date: today, examIds: [examId], deckId: "deck", method, expectedItems: count, cardIds: Array.from({ length: count }, (_, i) => `${examId}-${method}-${i}`) });
  const forecast: ExamPortfolioForecast = { days: [{ key: today, budgetMinutes: 120, newCardIds: [], reviewCardIds: [], summaries: [], blocks: [block(first.id, 24, "new"), block(second.id, 9, "new"), block(first.id, 8, "review")] }], exams: [] };
  const html = renderToStaticMarkup(<ExamMonthCalendar exams={[first, second]} shown={[first, second]} forecast={forecast} today={today} date={today} color={() => "var(--core-info)"} onSelect={() => undefined} />);
  assert.match(html, /data-exam-subject="anatomy" data-exam-task="study"[^>]*>24 neue Karten<\/span>/);
  assert.match(html, /data-exam-subject="physiology"[^]*?>9 neue Karten</);
  assert.match(html, /border-color:var\(--core-info\);background:color-mix/);
  assert.match(html, /Anatomie: 24 neue Karten\. Physiologie: 9 neue Karten/);
  assert.doesNotMatch(html, /Min\.|Std\.|Wiederholungen|08:00/);
  const week = renderToStaticMarkup(<ExamWeekCalendar exams={[first, second]} shown={[first, second]} decks={[]} capacity={createStudyTimeCapacity()} forecast={forecast} today={today} date={today} busy={false} color={() => "var(--core-info)"} onSelect={() => undefined} onChange={() => true} />);
  assert.match(week, /data-week-task="anatomy" aria-label="Anatomie: 24 neue Karten\. Aufgabe auswählen/);
  assert.ok(html.indexOf('aria-label="Fächer im Kalender"') > html.indexOf('data-testid="exam-month-calendar"'));
  assert.ok(html.indexOf('aria-label="Fächer im Kalender"') < html.indexOf('>Heute<'));
  assert.ok(week.indexOf('aria-label="Fächer im Kalender"') > week.indexOf('data-testid="exam-week-calendar"'));
  assert.ok(week.indexOf('aria-label="Fächer im Kalender"') < week.indexOf('>Heute<'));
});

test("exam dates stay visible without a forecast and distinguish same-day exams", () => {
  const exam = { ...createExamPlan("2026-10-18", ["deck"]), id: "anatomy", name: "Anatomie", createdAt: "2026-10-17T08:00:00.000Z", examDate: "2026-10-27" };
  const other = { ...exam, id: "physiology", name: "Physiologie" };
  const markup = renderToStaticMarkup(<ExamMonthCalendar exams={[exam, other]} shown={[exam, other]} forecast={null} today="2026-10-18" date="2026-10-18" color={(entry) => entry.id === exam.id ? "var(--core-info)" : "var(--core-success)"} onSelect={() => undefined} />);
  assert.match(markup, /data-exam-appointment="anatomy"/);
  assert.match(markup, /data-exam-appointment="physiology"/);
  assert.match(markup, /Klausur: Anatomie. Klausur: Physiologie/);
  assert.match(markup, /Lernmenge noch nicht berechnet/);
  assert.match(markup, /aria-current="date"/);
});

test("six-week months keep task entries and omit zero cards", () => {
  const today = "2026-08-03";
  const exam = { ...createExamPlan(today, ["deck"]), id: "exam", name: "Anatomie", createdAt: "2026-07-31T08:00:00.000Z", examDate: "2026-08-28" };
  const day = { key: today, budgetMinutes: 60, newCardIds: ["card"], reviewCardIds: [], summaries: [], blocks: [{ id: "new", date: today, examIds: [exam.id], deckId: "deck", method: "new" as const, expectedItems: 1, cardIds: ["card"] }] };
  const forecast: ExamPortfolioForecast = { days: [day], exams: [] };
  const render = () => renderToStaticMarkup(<ExamMonthCalendar exams={[exam]} shown={[exam]} forecast={forecast} today={today} date={today} color={() => "var(--core-info)"} onSelect={() => undefined} />);
  const cell = (html: string) => html.split(`data-date="${today}"`)[1].split("</button>")[0];
  // Weeks entirely in the past shrink to their date row; the rest keep room for tasks.
  assert.match(render(), /grid-template-rows:auto(?: minmax\(var\(--exam-month-day-height\), 1fr\)){5}"/);
  assert.match(cell(render()), /data-exam-task="study"/);
  day.blocks = [];
  day.newCardIds = [];
  assert.doesNotMatch(cell(render()), /data-exam-task="study"|>0 neue Karten</);
});

test("compact month prioritizes exams and announces tasks beyond the visible entries", () => {
  const today = "2026-10-18";
  const exams = ["Anatomie", "Physiologie", "Biochemie"].map((name) => ({ ...createExamPlan(today, ["deck"]), id: name, name, examDate: "2026-10-27" }));
  const html = renderToStaticMarkup(<ExamMonthCalendar exams={exams} shown={exams} forecast={null} today={today} date={today} color={() => "var(--core-exam-color-1)"} onSelect={() => undefined} />);
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
  const html = renderToStaticMarkup(<ExamWeekCalendar exams={[exam]} shown={[exam]} decks={[]} capacity={capacity} forecast={null} today={today} date={today} busy={false} color={() => "var(--core-exam-color-1)"} onSelect={() => undefined} onChange={() => true} />);
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


test("Heute zeigt getönte Checklisten ohne Zeitplanstatus und ohne Quiz", () => {
  const state = createCoreRepository().getState();
  const date = "2026-10-20", exam = { ...createExamPlan(date, ["deck"]), id: "anatomy", name: "Anatomie", examDate: "2026-10-27", colorIndex: 4 };
  state.profile = withGlobalSchedulerPreferences(state.profile, { examPlanning: { version: 3, exams: [exam], capacity: createStudyTimeCapacity(), dailyTasks: [
    { id: "topic:anatomy:deck", examId: exam.id, date, kind: "study", deckIds: ["deck"], cardIds: ["card"], capturedAt: date + "T08:00:00.000Z", completed: "automatic" },
  ] } });
  const html = renderToStaticMarkup(<ExamDashboardWidget state={state} now={date + "T12:00:00.000Z"} onLoad={async () => { throw new Error("Not called in SSR"); }} onSaveTasks={async () => undefined} onStart={async () => undefined} onOpen={() => undefined} />);
  assert.doesNotMatch(html, /Gut im Zeitplan|Im Zeitplan|exam-pace|Std\.|Min\./);
  assert.match(html, /background:color-mix\(in srgb, var\(--core-exam-color-5\) 10%/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /Automatisch erledigt/);
  assert.doesNotMatch(html, /Quiz/);
});

test("Bearbeiten lässt gültige Angaben ohne fertige Planung speichern", () => {
  const state = createCoreRepository().getState();
  const deck = createCoreDeck({ id: "deck", name: "Anatomie" });
  const exam = { ...createExamPlan("2026-10-18", [deck.id]), id: "anatomy", name: "Anatomie", examDate: "2026-11-19" };
  const html = renderToStaticMarkup(<ExamPlanEditor embedded decks={[deck]} exams={[exam]} capacity={createStudyTimeCapacity()} initialPlan={exam} preferences={getGlobalSchedulerPreferences(state.profile)} timeZone="Europe/Berlin" now="2026-10-18T12:00:00Z" onLoadPlanningData={() => new Promise(() => undefined)} onSave={async () => undefined} onCancel={() => undefined} saving={false} saveError="" />);
  assert.match(html, /Dein Plan wird berechnet/);
  assert.match(html, /<button class="core-action-primary ">(?:(?!<\/button>).)*<span>Speichern<\/span><\/button>/);
});
