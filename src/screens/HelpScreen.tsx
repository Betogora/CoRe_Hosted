import React from "react";
import { Sparkles } from "lucide-react";
import { PageHeader, SoftPanel } from "../ui/coreUi.tsx";

type GraphPart = "initial" | "rating-1" | "rating-2" | "rating-3" | "rating-4" | "parameter-r" | "parameter-s" | "parameter-d" | "variant";

interface RatingCurve {
  id: 1 | 2 | 3 | 4;
  label: "Nochmal" | "Schwer" | "Gut" | "Leicht";
  color: string;
  path: string;
  endX: number;
}

const MEMORY_TERMS = [
  {
    id: "grundbegriff-r",
    term: "R · Abrufwahrscheinlichkeit",
    description: "Wie wahrscheinlich du den Inhalt jetzt korrekt erinnern kannst. Direkt nach einem erfolgreichen Abruf liegt R nahe 100 Prozent und sinkt anschließend mit der Zeit.",
  },
  {
    id: "grundbegriff-s",
    term: "S · Stabilität",
    description: "Die Zeit in Tagen, in der R von 100 auf 90 Prozent fällt. Je höher S ist, desto länger hält die Erinnerung.",
  },
  {
    id: "grundbegriff-d",
    term: "D · Schwierigkeit",
    description: "Wie schwer sich die Erinnerung festigen lässt. D beeinflusst, wie stark die Stabilität nach einem Review wachsen kann.",
  },
] as const;

const RATING_CURVES: readonly RatingCurve[] = [
  {
    id: 1,
    label: "Nochmal",
    color: "var(--core-danger)",
    path: "M 285 92 C 334 112, 392 176, 430 248",
    endX: 430,
  },
  {
    id: 2,
    label: "Schwer",
    color: "var(--core-warning)",
    path: "M 285 92 C 358 108, 476 172, 535 248",
    endX: 535,
  },
  {
    id: 3,
    label: "Gut",
    color: "var(--core-success)",
    path: "M 285 92 C 392 105, 574 164, 665 248",
    endX: 665,
  },
  {
    id: 4,
    label: "Leicht",
    color: "var(--core-info)",
    path: "M 285 92 C 438 100, 708 154, 820 248",
    endX: 820,
  },
];

const RATING_EXPLANATIONS = [
  { number: "1", label: "Nochmal", color: "var(--core-danger)", text: "Nicht erinnert: kurzfristig erneut zeigen und die Stabilität deutlich senken." },
  { number: "2", label: "Schwer", color: "var(--core-warning)", text: "Gerade noch erinnert: vorsichtiger Stabilitätszuwachs und ein kurzes Intervall." },
  { number: "3", label: "Gut", color: "var(--core-success)", text: "Solide erinnert: normaler Stabilitätszuwachs und ein längeres Intervall." },
  { number: "4", label: "Leicht", color: "var(--core-info)", text: "Sehr sicher erinnert: stärkerer Stabilitätszuwachs und das längste der gezeigten Intervalle." },
] as const;

const SCHEDULING_STEPS = [
  {
    label: "Gedächtniszustand aktualisieren",
    text: "Nach deiner Bewertung schätzt FSRS Stabilität S und Schwierigkeit D neu. Direkt nach einem erfolgreichen Abruf liegt R wieder nahe 100 Prozent.",
  },
  {
    label: "Vergessen vorhersagen",
    text: "Zwischen zwei Reviews bleiben S und D unverändert, während R mit jedem verstrichenen Tag fällt. Eine höhere Stabilität macht diesen Abfall langsamer.",
  },
  {
    label: "Nächsten Termin setzen",
    text: "Der Scheduler wählt den Zeitpunkt, an dem R voraussichtlich die gewünschte Zielerinnerung erreicht. Im Beispiel liegt dieses Ziel bei 90 Prozent.",
  },
] as const;

const PARAMETER_LINKS = [
  { id: "r", label: "R · Abrufwahrscheinlichkeit", part: "parameter-r" as const, left: "15%", top: "1%" },
  { id: "d", label: "D · Schwierigkeit", part: "parameter-d" as const, left: "72%", top: "1%" },
  { id: "s", label: "S · Stabilität", part: "parameter-s" as const, left: "50%", top: "74%" },
] as const;

function MemoryCurveNavigator() {
  const [hoveredPart, setHoveredPart] = React.useState<GraphPart | null>(null);
  const [focusedPart, setFocusedPart] = React.useState<GraphPart | null>(null);
  const activePart = hoveredPart ?? focusedPart;
  const activeRatingPart = activePart?.startsWith("rating-") ? activePart : "rating-4";

  function interactionProps(part: GraphPart) {
    return {
      onPointerEnter: () => setHoveredPart(part),
      onPointerLeave: () => setHoveredPart((current) => current === part ? null : current),
      onFocus: () => {
        setHoveredPart(null);
        setFocusedPart(part);
      },
      onBlur: () => setFocusedPart((current) => current === part ? null : current),
    };
  }

  return (
    <section className="grid gap-5" aria-labelledby="memory-curve-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="core-control-label uppercase tracking-wide text-core-action">Interaktive Lernkurve</p>
          <h2 id="memory-curve-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Wie eine Bewertung das nächste Intervall verändert</h2>
        </div>
        <p className="core-caption max-w-xl text-[var(--core-text-muted)]" id="memory-curve-disclaimer">
          Vereinfachtes Beispiel - tatsächliche Intervalle hängen von Verlauf, Bewertung und Einstellungen ab.
        </p>
      </div>

      <SoftPanel className="min-w-0 overflow-hidden p-3 sm:p-5">
        <p id="memory-axis-description" className="sr-only">Die Y-Achse zeigt nur den Ausschnitt von 90 bis 100 Prozent Abrufwahrscheinlichkeit. Zwei diagonale Striche kennzeichnen die ausgelassene Achsenspanne darunter.</p>
        <div
          className="overflow-x-auto pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]"
          tabIndex={0}
          aria-label="Lernkurve horizontal erkunden"
          aria-describedby="memory-curve-disclaimer memory-axis-description"
        >
          <div className="relative aspect-[900/500] min-w-[46rem]" data-testid="memory-curve">
            <svg className="absolute inset-0 size-full" viewBox="0 0 900 500" role="img" aria-labelledby="memory-curve-title memory-curve-description">
              <title id="memory-curve-title">Vereinfachte FSRS-Gedächtniskurve mit vier möglichen Bewertungsintervallen</title>
              <desc id="memory-curve-description">Eine erste Vergessenskurve führt zu einem Review. Danach zeigen vier unterschiedlich lange Kurven die möglichen Intervalle für Nochmal, Schwer, Gut und Leicht. Leicht ist als Beispiel hervorgehoben und endet an einer möglichen CoRe-Variante.</desc>

              <line x1="72" y1="360" x2="858" y2="360" stroke="var(--core-border-interactive)" strokeWidth="2" />
              <line x1="72" y1="52" x2="72" y2="360" stroke="var(--core-border-interactive)" strokeWidth={activePart === "parameter-r" ? 4 : 2} />
              <text x="465" y="470" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">Zeit und mögliche Intervalle</text>
              <text x="22" y="198" transform="rotate(-90 22 198)" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">Abrufwahrscheinlichkeit</text>
              <text x="57" y="98" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">100 %</text>
              <text x="57" y="253" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">90 %</text>
              <text x="86" y="350" fill="var(--core-text-muted)" fontSize="13">Ausschnitt 90-100 %</text>

              <g data-testid="memory-y-axis-break" aria-hidden="true">
                <path d="M 64 326 L 80 316" stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 64 339 L 80 329" stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
              </g>

              <line
                x1="72"
                y1="248"
                x2="858"
                y2="248"
                stroke="var(--core-text-muted)"
                strokeDasharray="7 7"
                strokeWidth={activePart === "parameter-r" ? 3 : 1.5}
                opacity={activePart === "parameter-r" ? 1 : 0.72}
                className="transition-[stroke-width,opacity] motion-reduce:transition-none"
              />
              <text x="850" y="235" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">Zielerinnerung R = 90 %</text>

              <a
                href="#spaced-repetition"
                aria-label="Zur Erklärung von Spaced Repetition springen"
                {...interactionProps("initial")}
                data-testid="memory-initial-curve-link"
              >
                <path
                  d="M 74 92 C 142 110, 230 172, 285 248"
                  fill="none"
                  stroke="var(--core-action-secondary)"
                  strokeWidth={activePart === "initial" ? 8 : 5}
                  strokeLinecap="round"
                  className="transition-[stroke-width] motion-reduce:transition-none"
                />
                <path d="M 74 92 C 142 110, 230 172, 285 248" fill="none" stroke="transparent" strokeWidth="30" pointerEvents="stroke" />
                <circle cx="285" cy="248" r="19" fill="var(--core-surface-raised)" stroke="var(--core-action-secondary)" strokeWidth={activePart === "initial" ? 4 : 2.5} />
                <text x="285" y="253" textAnchor="middle" fill="var(--core-text)" fontSize="13" fontWeight="700">R</text>
              </a>
              <text x="285" y="278" textAnchor="middle" fill="var(--core-text-secondary)" fontSize="13">Review</text>

              <g opacity={activePart === "parameter-d" ? 1 : 0.55} className="transition-opacity motion-reduce:transition-none">
                <line x1="285" y1="78" x2="285" y2="229" stroke="var(--core-warning)" strokeWidth={activePart === "parameter-d" ? 4 : 2} strokeDasharray="6 7" />
                <path d="M 285 64 L 293 72 L 285 80 L 277 72 Z" fill="var(--core-surface-raised)" stroke="var(--core-warning)" strokeWidth={activePart === "parameter-d" ? 4 : 2} />
              </g>

              {RATING_CURVES.map((rating) => {
                const part = `rating-${rating.id}` as GraphPart;
                const active = activeRatingPart === part;
                return (
                  <a
                    key={rating.id}
                    href="#bewertungen"
                    aria-label={`Zur Erklärung der Bewertung ${rating.id} ${rating.label} springen`}
                    {...interactionProps(part)}
                    data-testid={`memory-rating-curve-${rating.id}`}
                    data-active={active ? "true" : "false"}
                  >
                    <path
                      d={rating.path}
                      fill="none"
                      stroke={rating.color}
                      strokeWidth={active ? 8 : 3}
                      strokeLinecap="round"
                      opacity={active ? 1 : 0.2}
                      className="transition-[stroke-width,opacity] motion-reduce:transition-none"
                    />
                    <path d={rating.path} fill="none" stroke="transparent" strokeWidth="28" pointerEvents="stroke" />
                    {rating.id < 4 ? (
                      <g opacity={active ? 1 : 0.35}>
                        <circle cx={rating.endX} cy="248" r="16" fill="var(--core-surface-raised)" stroke={rating.color} strokeWidth={active ? 4 : 2} />
                        <text x={rating.endX} y="253" textAnchor="middle" fill="var(--core-text)" fontSize="13" fontWeight="700">{rating.id}</text>
                        <text x={rating.endX} y="279" textAnchor="middle" fill="var(--core-text-secondary)" fontSize="12">{rating.label}</text>
                      </g>
                    ) : (
                      <text x="786" y="218" textAnchor="middle" fill={rating.color} fontSize="13" fontWeight="700">4 · Leicht</text>
                    )}
                  </a>
                );
              })}

              <g opacity={activePart === "parameter-s" ? 1 : 0.55} className="transition-opacity motion-reduce:transition-none">
                <line x1="298" y1="310" x2="807" y2="310" stroke="var(--core-success)" strokeWidth={activePart === "parameter-s" ? 4 : 2} />
                <path d="M 308 303 L 298 310 L 308 317" fill="none" stroke="var(--core-success)" strokeWidth={activePart === "parameter-s" ? 4 : 2} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 797 303 L 807 310 L 797 317" fill="none" stroke="var(--core-success)" strokeWidth={activePart === "parameter-s" ? 4 : 2} strokeLinecap="round" strokeLinejoin="round" />
                <text x="552" y="337" textAnchor="middle" fill="var(--core-text-secondary)" fontSize="13">S bestimmt die mögliche Intervalllänge</text>
              </g>
            </svg>

            {PARAMETER_LINKS.map((parameter) => {
              const active = activePart === parameter.part;
              return (
                <a
                  key={parameter.id}
                  href="#grundbegriffe"
                  className={`absolute z-20 flex min-h-11 -translate-x-1/2 items-center px-2 core-caption font-semibold underline-offset-4 transition-[color,text-decoration-thickness] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] motion-reduce:transition-none ${active ? "text-core-text underline decoration-2" : "text-core-secondary"}`}
                  style={{ left: parameter.left, top: parameter.top }}
                  aria-label={`${parameter.label}: zu den Grundbegriffen springen`}
                  {...interactionProps(parameter.part)}
                  data-testid={`memory-parameter-${parameter.id}`}
                >
                  {parameter.label}
                </a>
              );
            })}

            <a
              href="#content-repetition"
              className="absolute z-30 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-core-info bg-[var(--core-surface-raised)] text-core-action transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2 motion-reduce:transition-none"
              style={{ left: `${(820 / 900) * 100}%`, top: `${(248 / 500) * 100}%`, transform: `translate(-50%, -50%) scale(${activePart === "variant" ? 1.14 : 1})` }}
              aria-label="Zur Erklärung von Content Repetition und Varianten springen"
              {...interactionProps("variant")}
              data-testid="memory-variant-link"
            >
              <Sparkles size={19} aria-hidden="true" />
              <span className="pointer-events-none absolute top-12 whitespace-nowrap core-caption font-semibold text-core-text">Variante</span>
            </a>
          </div>
        </div>
      </SoftPanel>
    </section>
  );
}

export function HelpScreen() {
  return (
    <div className="grid gap-10">
      <PageHeader eyebrow="Hilfe" title="Wie CoRe und FSRS funktionieren" />

      <section className="max-w-4xl border-t border-core-border pt-6" aria-labelledby="help-introduction-heading">
        <p className="core-control-label uppercase tracking-wide text-core-action">CoRe verbindet Zeitpunkt und Fragestellung</p>
        <h2 id="help-introduction-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Spaced Repetition bildet die Grundlage</h2>
        <p className="mt-4 core-body-large leading-7 text-core-secondary">
          Spaced Repetition wiederholt Lerninhalte in berechneten Zeitabständen, bevor sie voraussichtlich vergessen werden. CoRe nutzt dafür FSRS-6 und ergänzt dieses Prinzip durch Content Repetition: Ist eine Originalkarte ausreichend stabil, kann dieselbe Wissenseinheit mit einer neuen Fragestellung geprüft werden.
        </p>
        <p className="mt-3 core-body leading-6 text-core-secondary">
          So trainierst du nicht nur den bekannten Wortlaut einer Karte, sondern musst das Wissen bei späteren Wiederholungen erneut aktiv abrufen.
        </p>
      </section>

      <section id="grundbegriffe" tabIndex={-1} className="scroll-mt-8 outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]" aria-labelledby="memory-terms-heading">
        <p className="core-control-label uppercase tracking-wide text-core-action">Die wichtigsten Begriffe</p>
        <h2 id="memory-terms-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Der Gedächtniszustand verständlich erklärt</h2>
        <dl className="mt-5 grid border-t border-core-border md:grid-cols-3">
          {MEMORY_TERMS.map((memoryTerm) => (
            <div id={memoryTerm.id} key={memoryTerm.id} className="border-b border-core-border py-5 md:min-h-36 md:pr-8">
              <dt className="core-body-large font-semibold text-core-text">{memoryTerm.term}</dt>
              <dd className="mt-2 core-body leading-6 text-core-secondary">{memoryTerm.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <MemoryCurveNavigator />

      <section id="bewertungen" tabIndex={-1} className="scroll-mt-8 outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]" aria-labelledby="rating-heading">
        <p className="core-control-label uppercase tracking-wide text-core-action">Deine Bewertung</p>
        <h2 id="rating-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Vier Antworten steuern das nächste Intervall</h2>
        <ol className="mt-5 grid md:grid-cols-2 xl:grid-cols-4">
          {RATING_EXPLANATIONS.map((rating) => (
            <li key={rating.number} className="min-h-36 border-b border-t-2 py-5 md:pr-8" style={{ borderTopColor: rating.color }}>
              <p className="core-caption font-semibold tabular-nums" style={{ color: rating.color }}>0{rating.number}</p>
              <h3 className="mt-2 core-body-large font-semibold text-core-text">{rating.label}</h3>
              <p className="mt-2 core-body leading-6 text-core-secondary">{rating.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="spaced-repetition" tabIndex={-1} className="scroll-mt-8 outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]" aria-labelledby="spaced-repetition-heading">
        <p className="core-control-label uppercase tracking-wide text-core-action">Vom Gedächtnis zum Termin</p>
        <h2 id="spaced-repetition-heading" className="core-heading-2 mt-2 font-semibold text-core-text">So arbeitet ein Spaced-Repetition-Scheduler</h2>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <ol className="border-t border-core-border">
            {SCHEDULING_STEPS.map((step, index) => (
              <li key={step.label} className="grid gap-2 border-b border-core-border py-5 sm:grid-cols-[3rem_1fr]">
                <span className="core-caption font-semibold tabular-nums text-core-action">0{index + 1}</span>
                <div>
                  <h3 className="core-body-large font-semibold text-core-text">{step.label}</h3>
                  <p className="mt-2 core-body leading-6 text-core-secondary">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-y border-core-border py-5">
            <p className="core-caption font-semibold uppercase tracking-wide text-core-action">Zielerinnerung und Aufwand</p>
            <h3 className="core-heading-3 mt-2 font-semibold text-core-text">Du steuerst das Ziel, FSRS die Intervalle</h3>
            <p className="mt-3 core-body leading-6 text-core-secondary">
              Eine höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews. Eine niedrigere Zielerinnerung reduziert den Aufwand, nimmt aber mehr Vergessen in Kauf.
            </p>
            <p className="mt-4 core-body leading-6 text-core-secondary">
              CoRe verwendet FSRS-6 mit den offiziellen 21 Standardparametern und berücksichtigt alle Reviews. Eine persönliche Optimierung dieser Parameter aus deiner eigenen Reviewhistorie ist noch nicht aktiviert.
            </p>
          </div>
        </div>
      </section>

      <section id="content-repetition" tabIndex={-1} className="scroll-mt-8 border-t border-core-border pt-6 outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]" aria-labelledby="content-repetition-heading">
        <p className="core-control-label uppercase tracking-wide text-core-action">Content Repetition</p>
        <h2 id="content-repetition-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Gleiches Wissen, neue Fragestellung</h2>
        <p className="mt-4 max-w-4xl core-body-large leading-7 text-core-secondary">
          Content Repetition baut auf Spaced Repetition auf. Wenn die Originalkarte ausreichend stabil ist, kann CoRe eine nahe Variante derselben Wissenseinheit erzeugen und beim nächsten passenden Review einsetzen.
        </p>
        <ul className="mt-5 grid max-w-4xl gap-3 border-t border-core-border pt-5 core-body leading-6 text-core-secondary">
          <li>• Die Variante verändert die Fragestellung, führt aber keine neuen Fakten ein.</li>
          <li>• Nach der Antwort bleibt die Originalkarte als Vertrauensanker erreichbar.</li>
          <li>• Nach einem Fehler verwendet CoRe wieder das Original oder eine einfachere Variante.</li>
          <li>• Die wechselnde Abrufform fordert dein Gehirn erneut heraus und stärkt den flexiblen Zugriff auf das Wissen.</li>
        </ul>
      </section>
    </div>
  );
}
