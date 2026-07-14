import React from "react";
import { Bot, CalendarDays } from "lucide-react";
import { answerDeckQuestionWithServer } from "../deckAssistant.ts";
import { createLearningPlan } from "../learningPlan.ts";
import { OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";

export function AssistantScreen({ decks, transcript, plans, onSaveChat, onSavePlan }: any) {
  const [activeTab, setActiveTab] = React.useState("chat");
  const [deckId, setDeckId] = React.useState("all");
  const [status, setStatus] = React.useState("");
  const [isAsking, setIsAsking] = React.useState(false);
  const [sourceBound, setSourceBound] = React.useState(false);
  const [question, setQuestion] = React.useState("Welche Karten hängen mit Myelin zusammen?");
  const [targetDate, setTargetDate] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
  });
  const [dailyMinutes, setDailyMinutes] = React.useState(35);
  const [newCardsPerDay, setNewCardsPerDay] = React.useState(8);
  const latestPlan = plans[0] ?? null;

  async function askQuestion() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isAsking) return;

    setIsAsking(true);
    setStatus(sourceBound ? "Kartenquellen werden geprüft." : "KI-Antwort wird erstellt.");
    try {
      const result = await answerDeckQuestionWithServer({ decks, deckId, question: trimmedQuestion, sourceBound });
      onSaveChat(result.exchange);

      if (sourceBound && result.exchange.citations.length === 0) {
        setStatus("Keine passende Kartenquelle gefunden.");
      } else if (sourceBound && result.usedServer) {
        setStatus("Antwort mit Kartenquellen erstellt.");
      } else if (result.usedServer) {
        setStatus("KI-Antwort erstellt.");
      } else if (!sourceBound) {
        setStatus("KI-Antwort konnte nicht erstellt werden.");
      } else {
        setStatus("Antwort mit Kartenquellen erstellt. Lokale Quellenantwort verwendet.");
      }
    } finally {
      setIsAsking(false);
    }
  }

  function generatePlan() {
    const plan = createLearningPlan({
      decks: deckId === "all" ? decks : decks.filter((deck: { id: string; }) => deck.id === deckId),
      targetDate,
      dailyMinutes: Number(dailyMinutes),
      newCardsPerDay: Number(newCardsPerDay),
      includeVariants: true,
    });
    onSavePlan(plan);
    setStatus("Lernplan generiert.");
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Chat und Lernplan" title="Assistent" />

      <SoftPanel className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-grid min-h-10 grid-cols-2 overflow-hidden rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] text-sm font-semibold text-[#596489]">
            <button type="button" onClick={() => setActiveTab("chat")} aria-pressed={activeTab === "chat"} className={`px-4 ${activeTab === "chat" ? "bg-[#4f5eb1] text-white" : "hover:bg-white"}`}>
              Chat
            </button>
            <button type="button" onClick={() => setActiveTab("plan")} aria-pressed={activeTab === "plan"} className={`px-4 ${activeTab === "plan" ? "bg-[#4f5eb1] text-white" : "hover:bg-white"}`}>
              Lernplan
            </button>
          </div>
          <select className="min-h-10 rounded-xl border border-[#dfe4f5] bg-white px-3 text-sm font-semibold text-[#4f5eb1]" value={deckId} onChange={(event) => setDeckId(event.target.value)}>
            <option value="all">Alle Stapel</option>
            {decks.map((deck: any) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          {status ? <p className="text-sm font-semibold text-[#66709a]" role="status" aria-live="polite">{status}</p> : null}
        </div>
      </SoftPanel>

      {activeTab === "chat" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={Bot} className="bg-indigo-50 text-indigo-700" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Chat-your-Deck</p>
                <h3 className="text-xl font-semibold text-[#17214f]">Frage an deine Karten</h3>
              </div>
            </div>
            <textarea className="min-h-32 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6" value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Frage an deine Karten" />
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] px-3 py-3 text-sm text-[#4e5b8c]">
              <input
                type="checkbox"
                checked={sourceBound}
                onChange={(event) => setSourceBound(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#cfd6ee] text-indigo-700 focus:ring-indigo-600"
              />
              <span>
                <span className="font-semibold text-[#17214f]">Nur mit Kartenquellen antworten</span>
                <span className="block text-xs leading-5 text-[#66709a]">Aus: freie KI-Antwort. An: Antwort nur, wenn passende Karten gefunden werden.</span>
              </span>
            </label>
            <button type="button" onClick={askQuestion} disabled={(sourceBound && !decks.length) || !question.trim() || isAsking} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <Bot size={17} aria-hidden="true" />
              {isAsking ? "Antwort wird erstellt" : "Antwort erstellen"}
            </button>
            <p className="mt-3 text-sm text-[#66709a]">
              {sourceBound ? "Ohne passende Kartenquelle gibt der Assistent keine freie Antwort." : "Der Assistent nutzt eine freie KI-Antwort, wenn die Quellenbindung ausgeschaltet ist."}
            </p>
          </SoftPanel>

          <SoftPanel className="p-6">
            <h3 className="text-xl font-semibold text-[#17214f]">Antworten</h3>
            <div className="mt-5 grid max-h-[34rem] gap-4 overflow-auto pr-1">
              {(transcript.length ? transcript : []).map((exchange: { id: React.Key|null|undefined; question: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; answer: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; warnings: any[]; citations: any[]; }) => (
                <article key={exchange.id} className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
                  <p className="text-sm font-semibold text-[#17214f]">{exchange.question}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#4e5b8c]">{exchange.answer}</p>
                  {exchange.warnings.length > 0 ? (
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{exchange.warnings.join(" ")}</div>
                  ) : null}
                  <div className="mt-4 grid gap-2">
                    {exchange.citations.map((citation: { cardId: any; deckName: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; quote: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; source: string|number|bigint|boolean|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|React.ReactPortal|Promise<string|number|bigint|boolean|React.ReactPortal|React.ReactElement<unknown,string|React.JSXElementConstructor<any>>|Iterable<React.ReactNode>|null|undefined>|null|undefined; sourceQuote: string|any[]; }) => (
                      <div key={`${exchange.id}-${citation.cardId}`} className="rounded-xl bg-white px-3 py-2 text-xs text-[#66709a]">
                        <span className="font-semibold text-[#17214f]">{citation.deckName}</span> · {citation.quote}
                        <p className="mt-1">Quelle: {citation.source} · {citation.sourceQuote.slice(0, 120)}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {transcript.length === 0 ? <p className="text-sm text-[#66709a]">Noch keine Fragen gestellt.</p> : null}
            </div>
          </SoftPanel>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <SoftPanel className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <OrbIcon icon={CalendarDays} className="bg-emerald-50 text-emerald-700" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Lernplan</p>
                <h3 className="text-xl font-semibold text-[#17214f]">Prüfungsziel planen</h3>
              </div>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Zieltermin
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Minuten pro Tag
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="number" min="10" max="240" value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value))} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Neue Karten pro Tag
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="number" min="0" max="80" value={newCardsPerDay} onChange={(event) => setNewCardsPerDay(Number(event.target.value))} />
              </label>
              <button type="button" onClick={generatePlan} disabled={!decks.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                <CalendarDays size={17} aria-hidden="true" />
                Lernplan generieren
              </button>
            </div>
          </SoftPanel>

          <SoftPanel className="p-6">
            <h3 className="text-xl font-semibold text-[#17214f]">Aktueller Plan</h3>
            {latestPlan ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <StatTile label="Tage" value={latestPlan.totals.days} />
                  <StatTile label="Fällig" value={latestPlan.totals.dueCards} />
                  <StatTile label="Neu" value={latestPlan.totals.newCards} />
                  <StatTile label="Varianten" value={latestPlan.totals.activeVariants} />
                </div>
                <div className="mt-5 grid max-h-[34rem] gap-3 overflow-auto pr-1">
                  {(latestPlan.days as any[]).slice(0, 14).map((day: any) => (
                    <div key={day.date} className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#17214f]">{day.date} · {day.focusDeckName}</p>
                        <span className="rounded-xl bg-white px-3 py-1 text-xs font-semibold text-[#4f5eb1]">{day.minutes} min</span>
                      </div>
                      <p className="mt-2 text-sm text-[#66709a]">{day.dueReviews} Reviews · {day.newCards} neue Karten · {day.variantReviews} Varianten</p>
                      {day.focusTopics.length > 0 ? <p className="mt-2 text-xs text-[#66709a]">Fokus: {day.focusTopics.join(", ")}</p> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-[#66709a]">Noch kein Lernplan generiert.</p>
            )}
          </SoftPanel>
        </div>
      )}
    </div>
  );
}
