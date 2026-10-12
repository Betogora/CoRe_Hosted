import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Play, RefreshCcw } from "lucide-react";
import type { DashboardScreenProps } from "../appScreenProps.ts";
import type { Deck, ExamLearningPlan, StudyPlanBlock } from "../coreTypes.ts";
import { getGlobalSchedulerPreferences } from "../deckSettings.ts";
import { getLearningDayKey } from "../learningDay.ts";
import { createExamPortfolioForecast, getExamCurrentProgress, getExamBlockQueue, examDayDistance, shiftExamDay, type ExamPortfolioForecast, type ExamPlanDay } from "../examPlanning.ts";
import { ExamPlanningPanel, formatExamHours } from "./ExamPlanningPanel.tsx";
import { ActionButton, IconButton } from "../ui/actionUi.tsx";
import { ActionDialog, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";

type Props = Pick<DashboardScreenProps, "state" | "now" | "onLoadExamDecks" | "onSaveExamPlan" | "onDeleteExamPlan" | "onStartExamPlan">;
const DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const methodLabel = { new: "Neue Karten", review: "Wiederholungen", relearning: "Wiederlernen / Lernschritte", variant: "CoRe-Varianten" };
function dateLabel(key: string) { return DATE.format(new Date(`${key}T12:00:00Z`)); }
function percent(value: number | null) { return value === null ? "Noch keine Daten" : `${Math.round(value * 100)} %`; }
function DayBlocks({ day, exams, decks, onStart, startable }: { day: ExamPlanDay; exams: ExamLearningPlan[]; decks: Deck[]; onStart?: (block: StudyPlanBlock) => void; startable?: ReadonlySet<string> }) {
  return <div className="grid gap-3">
    <p className="core-caption text-core-muted">Budget {day.budgetMinutes} min · Reserve {Math.round(day.reserveMinutes)} min · heute gemessen/geschätzt {Math.round(day.spentMinutes)} min</p>
    {day.blocks.map((block) => <div key={block.id} className="grid min-w-0 gap-2 rounded-control border border-core-border p-3 core-body">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{methodLabel[block.method]}</strong><span>{Math.ceil(block.status === "completed" ? block.actualMinutes : block.plannedMinutes)} min</span></div>
      <p className="break-words core-caption text-core-muted">{block.deckIds.map((id) => decks.find((deck) => deck.id === id)?.name ?? "Gelöschter Stapel").join(" · ")} · {block.examIds.map((id) => exams.find((exam) => exam.id === id)?.name).filter(Boolean).join(" / ")}</p>
      <p className="core-caption text-core-muted">{block.expectedItems} Abfragen{block.examIds.length > 1 ? " · zählt für mehrere Prüfungen, wird einmal gelernt" : ""}</p>
      {block.status === "completed" ? <p className="core-caption">Bereits bearbeitet · gemessene Zeit aus deinen Reviews</p> : onStart && startable?.has(block.id) ? <ActionButton variant="secondary" icon={Play} onClick={() => onStart(block)}>Lernblock starten</ActionButton> : onStart ? <p className="core-caption text-core-muted">Prognose · wird mit der tatsächlichen Fälligkeit startbar.</p> : null}
    </div>)}
    {!day.blocks.length ? <p className="core-body text-core-muted">{day.budgetMinutes ? "Heute ist im Prüfungsplan keine Aufgabe erforderlich." : "Heute bleibt frei."}</p> : null}
    {day.backlogCount ? <StatusMessage tone="warning">{day.backlogCount} fällige Karten bleiben im aktuellen Budget offen. CoRe richtet künftige Tage aus dem Lernstand neu aus.</StatusMessage> : null}
  </div>;
}
function OptionalCalendar({ forecast, exams, decks }: { forecast: ExamPortfolioForecast; exams: ExamLearningPlan[]; decks: Deck[] }) {
  const [month, setMonth] = React.useState(forecast.days[0]?.key.slice(0, 7) ?? forecast.generatedAt.slice(0, 7));
  const [selected, setSelected] = React.useState(forecast.days[0]?.key ?? "");
  const year = Number(month.slice(0, 4)), index = Number(month.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(year, index, 1)), padding = (first.getUTCDay() + 6) % 7, count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const day = forecast.days.find((entry) => entry.key === selected), onExam = exams.filter((exam) => exam.examDate === selected);
  return <details className="min-w-0 rounded-panel border border-core-border p-4"><summary className="min-h-11 cursor-pointer core-body font-semibold">Monatskalender & Tagesdetails</summary>
    <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex items-center justify-between gap-2"><IconButton label="Vorheriger Monat" icon={ChevronLeft} onClick={() => setMonth(new Date(Date.UTC(year, index - 1, 1)).toISOString().slice(0, 7))} /><h4 className="core-body font-semibold">{MONTH.format(first)}</h4><IconButton label="Nächster Monat" icon={ChevronRight} onClick={() => setMonth(new Date(Date.UTC(year, index + 1, 1)).toISOString().slice(0, 7))} /></div>
      <p className="core-caption text-core-muted sm:hidden">Den Kalender kannst du seitlich verschieben.</p>
      <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label="Prüfungsplan-Kalender"><div className="grid min-w-[308px] grid-cols-7 gap-y-1">{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((name) => <span className="py-2 text-center core-caption text-core-muted" key={name}>{name}</span>)}{Array.from({ length: padding }, (_, i) => <span key={`p${i}`} />)}{Array.from({ length: count }, (_, i) => {
        const key = `${month}-${String(i + 1).padStart(2, "0")}`, entry = forecast.days.find((day) => day.key === key), exam = exams.some((exam) => exam.examDate === key);
        return <button type="button" key={key} aria-pressed={selected === key} aria-label={`${dateLabel(key)}${exam ? ": Prüfung" : ""}`} onClick={() => setSelected(key)} className={`core-exam-choice min-h-11 min-w-11 rounded-control core-body ${exam || entry?.buffer ? "bg-core-warning-soft" : entry?.newCardIds.length ? "bg-core-subtle" : entry?.reviewCount ? "bg-core-success-soft" : ""}`}>{i + 1}</button>;
      })}</div></div>
      <h4 className="core-body-large font-semibold">{selected ? dateLabel(selected) : "Tag auswählen"}</h4>
      {onExam.length ? <p className="core-body text-core-muted">Prüfungstag · {onExam.map((exam) => exam.name).join(", ")} · kein Lernen eingeplant.</p> : day ? <DayBlocks day={day} exams={exams} decks={decks} /> : <p className="core-body text-core-muted">Außerhalb des Planungshorizonts.</p>}
    </div>
  </details>;
}
export function ExamPlanningOverview({ state, now, onLoadExamDecks, onSaveExamPlan, onDeleteExamPlan, onStartExamPlan }: Props) {
  const preferences = getGlobalSchedulerPreferences(state.profile), exams = preferences.examPlanning.exams;
  const timeZone = state.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = getLearningDayKey(now, { dayStartHour: preferences.dayStartHour, timeZone })!;
  const civilToday = getLearningDayKey(now, { timeZone })!;
  const [open, setOpen] = React.useState(false), [editing, setEditing] = React.useState<ExamLearningPlan | "new" | null>(null), [detail, setDetail] = React.useState<string | null>(null);
  const [forecast, setForecast] = React.useState<ExamPortfolioForecast | null>(null), [loaded, setLoaded] = React.useState<Deck[]>([]);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(""), [revision, setRevision] = React.useState(0), [alignment, setAlignment] = React.useState("");
  const [deleting, setDeleting] = React.useState<ExamLearningPlan | null>(null);
  const content = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open || editing || deleting) return;
    const frame = requestAnimationFrame(() => {
      content.current?.focus({ preventScroll: true });
      content.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, editing, detail, deleting]);
  const previous = React.useRef<ExamPortfolioForecast | null>(null), alignRequested = React.useRef(false);
  const recalculate = React.useEffectEvent(async (signal: AbortSignal) => {
    setBusy(true); setError("");
    try {
      const ids = [...new Set(exams.filter((exam) => exam.status === "active" || (open && (!detail || exam.id === detail))).flatMap((exam) => exam.chapterDeckIds))].filter((id) => state.decks.some((deck) => deck.id === id && !deck.deletedAt));
      const decks = await onLoadExamDecks(ids); signal.throwIfAborted();
      const result = await createExamPortfolioForecast(decks, exams, { now, preferences, timeZone, signal }); signal.throwIfAborted();
      if (alignRequested.current) {
        const before = previous.current?.days[0], after = result.days[0];
        setAlignment(before && after ? `Heute neu ausgerichtet: ${before.newCardIds.length} → ${after.newCardIds.length} neue Karten, ${before.reviewCount} → ${after.reviewCount} Wiederholungen. Bereits erfolgte Reviews bleiben erhalten; freie Tage und Reserve bleiben berücksichtigt.` : "Der Plan wurde mit deinem aktuellen Lernstand neu ausgerichtet. Vergangene Aufgaben werden nicht auf den nächsten Tag gestapelt.");
        alignRequested.current = false;
      }
      previous.current = result; setLoaded(decks); setForecast(result);
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Die Prüfungsplanung konnte nicht geladen werden."); }
    finally { if (!signal.aborted) setBusy(false); }
  });
  const key = JSON.stringify([state.profile.userId, preferences, now, open, detail, state.decks.map((deck) => [deck.id, deck.updatedAt, deck.cardCount]), revision]);
  React.useEffect(() => {
    const controller = new AbortController();
    if (exams.length) void recalculate(controller.signal); else { setForecast(null); setLoaded([]); }
    return () => controller.abort();
  }, [key, state]);
  async function changeStatus(exam: ExamLearningPlan, status: ExamLearningPlan["status"]) {
    if (status === "active" && exam.examDate <= civilToday) { setError("Der Prüfungstermin ist vergangen. Ändere zuerst das Datum."); return; }
    setBusy(true); setError("");
    try { await onSaveExamPlan({ ...exam, status, updatedAt: new Date().toISOString() }); setRevision((value) => value + 1); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Die Prüfung konnte nicht geändert werden."); }
    finally { setBusy(false); }
  }
  async function startBlock(block: StudyPlanBlock) {
    const exam = exams.find((exam) => exam.id === block.examIds[0]);
    if (!exam) return;
    setBusy(true); setError("");
    try { await onStartExamPlan(exam, block.id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Der Lernblock konnte nicht gestartet werden."); }
    finally { setBusy(false); }
  }
  const todayPlan = forecast?.days.find((day) => day.key === today), selectedExam = exams.find((exam) => exam.id === detail), summary = forecast?.exams.find((exam) => exam.examId === detail);
  const startable = React.useMemo(() => {
    const ids = new Set<string>();
    if (todayPlan) for (const block of todayPlan.blocks) {
      if (block.status !== "completed" && getExamBlockQueue(loaded, exams, todayPlan, block, { now, preferences, timeZone })?.total) ids.add(block.id);
    }
    return ids;
  }, [forecast, loaded, key]);
  const active = exams.filter((exam) => exam.status === "active").sort((a, b) => a.examDate.localeCompare(b.examDate));
  const next = active[0];
  function weeks() {
    return <div className="grid gap-2"><h4 className="core-heading-3 font-semibold">Die nächsten sieben Tage</h4>{forecast?.days.slice(0, 7).map((day) => <div key={day.key} className="grid gap-1 rounded-control bg-core-subtle p-3 core-body"><div className="flex flex-wrap justify-between gap-2"><strong>{SHORT_DATE.format(new Date(`${day.key}T12:00:00Z`))}</strong><span>{Math.ceil(day.newMinutes + day.reviewMinutes)} / {day.budgetMinutes} min</span></div><p className="core-caption text-core-muted">{day.budgetMinutes === 0 ? "Frei / Prüfungstag" : `${day.newCardIds.length} neu · ${day.reviewCount} Wiederholungen · ${Math.round(day.reserveMinutes)} min Reserve${day.buffer ? " · Puffer für eine Prüfung" : ""}`}</p><p className="break-words core-caption text-core-muted">{[...new Set(day.blocks.flatMap((block) => block.examIds))].map((id) => exams.find((exam) => exam.id === id)?.name).filter(Boolean).join(" · ")}</p></div>)}</div>;
  }
  function overview() {
    return <div ref={content} tabIndex={-1} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 text-core-text" data-testid="exam-planning-overview">
      <ActionButton variant="primary" disabled={!state.decks.length || busy} onClick={() => { setEditing("new"); setDetail(null); }}>Prüfung planen</ActionButton>
      {busy ? <p role="status" className="core-body text-core-muted">Prognosen werden aktualisiert …</p> : null}
      {exams.length === 0 ? <p className="core-body text-core-muted">Plane deine erste Prüfung mit vorhandenen Karten. Weitere Prüfungen teilen sich anschließend dieselbe Lernzeit.</p> : null}
      {exams.slice().sort((a, b) => a.examDate.localeCompare(b.examDate)).map((exam) => {
        const item = forecast?.exams.find((summary) => summary.examId === exam.id);
        const passive = item || busy ? null : getExamCurrentProgress(loaded, exam, now, timeZone);
        return <div key={exam.id} className="grid min-w-0 gap-3 rounded-panel border border-core-border p-4"><h3 className="core-heading-3 break-words font-semibold">{exam.name}</h3><p className="core-body">{dateLabel(exam.examDate)} · {Math.max(0, examDayDistance(civilToday, exam.examDate))} Tage · {exam.status === "active" ? "Aktiv" : exam.status === "paused" ? "Pausiert" : "Abgeschlossen"}</p><p className="break-words core-caption text-core-muted">{exam.chapterDeckIds.map((id) => state.decks.find((deck) => deck.id === id)?.name ?? "Gelöschter Stapel").join(" · ")}</p>
          {item ? <><p className="core-body">Abdeckung {percent(item.current.coverage)} · Sicherheit am Termin, Stand heute: {percent(item.current.security)}</p><p className="core-caption text-core-muted">Erwartete Zielerreichung {percent(item.predicted.achievement)} · verbleibender Aufwand {formatExamHours(item.requiredMinutes)}</p><StatusMessage tone={item.feasible ? "success" : "warning"}>{item.feasible ? "Im Prognoseszenario erreichbar." : item.issues[0] ?? "Ziel voraussichtlich gefährdet."}</StatusMessage></> : passive?.totalCards ? <><p className="core-body">Aktueller Kartenlernstand · Abdeckung {percent(passive.coverage)} · Sicherheit {percent(passive.security)}</p><p className="core-caption text-core-muted">{passive.atExam ? "Sicherheit am Termin nach heutigem Lernstand" : "Sicherheit jetzt"} · Zielstand {percent(passive.achievement)} · keine aktive Arbeitslast.</p></> : null}
          {exam.status === "active" && exam.examDate <= civilToday ? <StatusMessage tone="warning">Der Termin ist erreicht. Schließe die Prüfung ab oder ändere das Datum.</StatusMessage> : null}
          <div className="grid gap-2 sm:grid-cols-2"><ActionButton variant="secondary" onClick={() => setDetail(exam.id)}>Details & nächste Aktion</ActionButton><ActionButton variant="secondary" onClick={() => setEditing(exam)}>Bearbeiten</ActionButton><ActionButton variant="secondary" disabled={busy} onClick={() => void changeStatus(exam, exam.status === "active" ? "paused" : "active")}>{exam.status === "active" ? "Pausieren" : "Fortsetzen"}</ActionButton>{exam.status !== "completed" ? <ActionButton variant="secondary" disabled={busy} onClick={() => void changeStatus(exam, "completed")}>Abschließen</ActionButton> : null}<ActionButton variant="destructive" disabled={busy} onClick={() => setDeleting(exam)}>Löschen</ActionButton></div>
        </div>;
      })}
      {todayPlan ? <><h3 className="core-heading-3 font-semibold">Dein Lernplan heute · {formatExamHours(todayPlan.newMinutes + todayPlan.reviewMinutes)}</h3><DayBlocks day={todayPlan} exams={exams} decks={state.decks} onStart={(block) => void startBlock(block)} startable={startable} />{weeks()}</> : null}
      {exams.length ? <ActionButton variant="secondary" icon={RefreshCcw} loading={busy} disabled={busy} onClick={() => { alignRequested.current = true; setRevision((value) => value + 1); }}>Plan neu ausrichten</ActionButton> : null}
      {alignment ? <StatusMessage tone="info">{alignment}</StatusMessage> : null}
      {forecast?.days.length ? <OptionalCalendar forecast={forecast} exams={active} decks={state.decks} /> : null}
      {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
    </div>;
  }
  function examDetail() {
    if (!selectedExam) return overview();
    const passive = getExamCurrentProgress(loaded, selectedExam, now, timeZone);
    const events = [...new Map(loaded.filter((deck) => selectedExam.chapterDeckIds.includes(deck.id)).flatMap((deck) => deck.reviewEvents).map((event) => [event.id, event])).values()].filter((event) => event.rating !== "manual");
    return <div ref={content} tabIndex={-1} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-core-text" data-testid="exam-planning-detail">
      <ActionButton variant="secondary" onClick={() => setDetail(null)}>Alle Prüfungen</ActionButton>
      <h3 className="core-heading-3 break-words font-semibold">{selectedExam.name}</h3><p className="core-body">{dateLabel(selectedExam.examDate)} · {Math.max(0, examDayDistance(civilToday, selectedExam.examDate))} Tage</p>
      <p className="core-body">Ziel: {selectedExam.coverage} % Abdeckung · {Math.round(selectedExam.desiredRetention * 100)} % Abrufsicherheit</p>
      {summary ? <>
        <dl className="grid gap-3 core-body">{[["Stoffabdeckung · aktuell → Prüfung", `${percent(summary.current.coverage)} → ${percent(summary.predicted.coverage)}`], ["Sicherheit am Termin · Stand heute → mit Plan", `${percent(summary.current.security)} → ${percent(summary.predicted.security)}`], ["Zielerreichung · aktuell → Prüfung", `${percent(summary.current.achievement)} → ${percent(summary.predicted.achievement)}`], ["Verbleibender Aufwand · Schätzung", formatExamHours(summary.requiredMinutes)]].map(([label, value]) => <div key={label} className="rounded-control bg-core-subtle p-3"><dt className="core-caption text-core-muted">{label}</dt><dd className="break-words core-body-large font-semibold">{value}</dd></div>)}</dl>
        <p className="core-caption text-core-muted">Abrufsicherheit ist die mittlere FSRS-Retrievability bearbeiteter Items am Prüfungstag; unbekannte Karten zählen nicht als sicher. Zielerreichung ist das Produkt der gedeckelten Abdeckungs- und Sicherheitsanteile. Modellschätzung mit {forecast?.uncertainty === "high" ? "hoher" : "mittlerer"} Unsicherheit, keine Note.</p>
        {summary.issues.map((issue) => <StatusMessage key={issue} tone="warning">{issue}</StatusMessage>)}
        <h4 className="core-body font-semibold">Fortschritt pro Thema</h4>{summary.chapters.map((chapter) => <p key={chapter.deckId} className="break-words core-body"><strong>{chapter.name}</strong> · {chapter.known} / {chapter.total} bearbeitet · Sicherheit {percent(chapter.security)}</p>)}
        <h4 className="core-body font-semibold">Adaptive Phasen</h4>{summary.phases.map((phase, i) => <p className="core-body" key={i}>{phase.phase} · {phase.days} Tage</p>)}
        <p className="core-caption text-core-muted">Wiederholungen laufen durchgehend mit. Transfer nutzt nur vorhandene geeignete Varianten; kurze Horizonte können Phasen zusammenlegen.</p>
      </> : selectedExam.status === "active" && selectedExam.examDate > civilToday ? <p role="status" className="core-body text-core-muted">Die aktuelle Prognose wird berechnet …</p> : <p className="core-body text-core-muted">Für pausierte, abgeschlossene oder vergangene Prüfungen wird keine aktive Prognose gerechnet.</p>}
      {!summary && !busy && passive.totalCards > 0 ? <p className="core-body">Aktueller Kartenlernstand: {percent(passive.coverage)} Abdeckung · {percent(passive.security)} Sicherheit{passive.atExam ? " am Termin" : " jetzt"} · Zielstand {percent(passive.achievement)}. Dies ist eine Modellschätzung deiner Karten, keine Prüfungsnote.</p> : null}
      <h4 className="core-body font-semibold">Tatsächliche Entwicklung · letzte sieben Tage</h4>
      {Array.from({ length: 7 }, (_, i) => shiftExamDay(today, i - 6)).map((key) => { const dayEvents = events.filter((event) => getLearningDayKey(event.answeredAt, { dayStartHour: preferences.dayStartHour, timeZone }) === key); return <p key={key} className="core-caption text-core-muted">{SHORT_DATE.format(new Date(`${key}T12:00:00Z`))} · {dayEvents.length} Abfragen · {Math.round(dayEvents.reduce((sum, event) => sum + (event.responseTimeMs ?? 0), 0) / 60_000)} min gemessen</p>; })}
      {todayPlan ? <DayBlocks day={{ ...todayPlan, blocks: todayPlan.blocks.filter((block) => block.examIds.includes(selectedExam.id)) }} exams={exams} decks={state.decks} onStart={(block) => void startBlock(block)} startable={startable} /> : null}
      <ActionButton variant="secondary" onClick={() => setEditing(selectedExam)}>Ziele, Datum oder Zeit anpassen</ActionButton>
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </div>;
  }
  return <>
    <SoftPanel className="grid min-w-0 gap-4 border border-core-border p-6" data-testid="exam-planning-card">
      <div className="flex items-center gap-3"><CalendarDays size={20} className="text-core-action" aria-hidden="true" /><h2 className="core-heading-3 font-semibold">Prüfungsplanung</h2></div>
      <div className="grid gap-3 rounded-panel bg-core-subtle p-4"><p className="core-body-large break-words font-semibold">{next ? `${next.name} · ${dateLabel(next.examDate)}` : "Noch keine aktive Prüfung"}</p><p className="core-body text-core-muted">{next ? `${active.length} aktive Prüfungen teilen sich dein Zeitbudget.` : "Plane deine Vorbereitung mit vorhandenem Stoff und laufenden Wiederholungen."}</p>
      <ActionButton variant="primary" disabled={!state.decks.length} onClick={() => { setOpen(true); setEditing(exams.length ? null : "new"); setDetail(null); }}>{exams.length ? "Prüfungen verwalten" : "Prüfung planen"}</ActionButton>{!state.decks.length ? <p className="core-caption text-core-muted">Erstelle oder importiere zuerst einen Stapel.</p> : null}</div>
      {todayPlan ? <><h3 className="core-body-large font-semibold">Dein Lernplan heute · {formatExamHours(todayPlan.newMinutes + todayPlan.reviewMinutes)}</h3><DayBlocks day={todayPlan} exams={exams} decks={state.decks} onStart={(block) => void startBlock(block)} startable={startable} />{weeks()}</> : busy ? <p role="status" className="core-caption text-core-muted">Lernplan wird aktualisiert …</p> : null}
      {forecast?.exams.some((exam) => !exam.feasible) ? <StatusMessage tone="warning">Ein Prüfungsziel ist gefährdet. Öffne die Planung für Engpässe und Anpassungen.</StatusMessage> : null}
      {error ? <StatusMessage tone="error" announce="assertive">{error}</StatusMessage> : null}
    </SoftPanel>
    {open && !deleting ? <ActionDialog open title={editing ? editing === "new" ? "Prüfung planen" : "Prüfung bearbeiten" : detail ? "Prüfungsdetail" : "Deine Prüfungen"} cancelLabel="Schließen" onCancel={() => { setOpen(false); setEditing(null); }} description={editing ? <div className="grid gap-4"><ActionButton variant="secondary" onClick={() => setEditing(null)}>Zur Prüfungsübersicht</ActionButton><ExamPlanningPanel key={editing === "new" ? "new" : editing.id} decks={state.decks} now={now} preferences={preferences} timeZone={timeZone} initialPlan={editing === "new" ? null : editing} onLoadDecks={onLoadExamDecks} onSavePlan={onSaveExamPlan} onStartPlan={onStartExamPlan} onSaved={() => { setEditing(null); setRevision((value) => value + 1); }} /></div> : detail ? examDetail() : overview()} /> : null}
    {deleting ? <ActionDialog open title="Prüfung löschen?" description={`${deleting.name} wird aus der Planung entfernt. Karten und erfolgte Reviews bleiben erhalten.`} confirmLabel="Prüfung löschen" destructive cancelLabel="Abbrechen" confirmLoading={busy} onCancel={() => setDeleting(null)} onConfirm={async () => { setBusy(true); try { await onDeleteExamPlan(deleting.id); setDeleting(null); setDetail(null); setRevision((value) => value + 1); } catch (failure) { setError(failure instanceof Error ? failure.message : "Die Prüfung konnte nicht gelöscht werden."); } finally { setBusy(false); } }} /> : null}
  </>;
}
