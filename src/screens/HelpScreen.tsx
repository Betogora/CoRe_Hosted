import React from "react";
import {
  Brain,
  Clock3,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";

type ReviewId = 1 | 2 | 3 | 4;
type ParameterId = "r" | "s" | "d";
type ExplorerSelectionId = `review-${ReviewId}` | `parameter-${ParameterId}`;

interface MemoryStep {
  id: ReviewId;
  title: string;
  shortLabel: string;
  summary: string;
  detail: string;
  color: string;
  reviewX: number;
  intervalStartX: number;
  curvePath: string;
  stabilityLabel: string;
  cardLabel: string;
}

interface ExplorerDetail {
  title: string;
  summary: string;
  detail: string;
  context: string;
  color: string;
}

interface MemoryTerm {
  term: string;
  description: string;
  parameterId?: ParameterId;
}

const MEMORY_STEPS: readonly MemoryStep[] = [
  {
    id: 1,
    title: "Review 1 · Erste Erinnerung",
    shortLabel: "Die Gedächtnisspur entsteht",
    summary: "Die Originalkarte wird erfolgreich abgerufen. FSRS schätzt daraus den ersten Gedächtniszustand.",
    detail: "Direkt nach dem Review ist die Abrufwahrscheinlichkeit hoch. Mit der Zeit fällt sie wieder; die erste Stabilität bestimmt, wie schnell das geschieht.",
    color: "var(--core-info)",
    reviewX: 210,
    intervalStartX: 74,
    curvePath: "M 74 92 C 116 102, 164 164, 210 248",
    stabilityLabel: "S₁ · kurz",
    cardLabel: "Originalkarte",
  },
  {
    id: 2,
    title: "Review 2 · Stabilität wächst",
    shortLabel: "Das Intervall wird länger",
    summary: "Ein weiterer erfolgreicher Abruf erhöht die Stabilität. Die nächste Wiederholung darf später stattfinden.",
    detail: "Wie stark die Stabilität wächst, hängt bei FSRS unter anderem von Schwierigkeit, vergangener Zeit und Bewertung ab.",
    color: "var(--core-warning)",
    reviewX: 380,
    intervalStartX: 210,
    curvePath: "M 210 92 C 260 104, 324 164, 380 248",
    stabilityLabel: "S₂ · länger",
    cardLabel: "Originalkarte",
  },
  {
    id: 3,
    title: "Review 3 · Robuster Abruf",
    shortLabel: "Die Erinnerung wird belastbarer",
    summary: "Wiederholte erfolgreiche Abrufe machen die Erinnerung robuster und vergrößern den Abstand erneut.",
    detail: "Eine schwierige Karte baut Stabilität langsamer auf. CoRe prüft nun zusätzlich, ob die Originalkarte anhand von Stabilität, erfolgreichen Abrufen, Intervall und Fehlerverlauf reif genug für eine Variante ist.",
    color: "var(--core-success)",
    reviewX: 590,
    intervalStartX: 380,
    curvePath: "M 380 92 C 442 104, 526 160, 590 248",
    stabilityLabel: "S₃ · noch länger",
    cardLabel: "Originalkarte",
  },
  {
    id: 4,
    title: "Review 4 · CoRe-Variante",
    shortLabel: "Gleiches Wissen, neue Fragestellung",
    summary: "Beispielhaft fragt CoRe dieselbe Wissenseinheit nun als nahe Variante statt in der ursprünglichen Form ab.",
    detail: "Ist die Originalkarte ausreichend stabil und aktuell nicht fragil, kann CoRe eine nahe Variante erzeugen und einsetzen. Sie darf keine neuen Fakten einführen; nach Fehlern fällt CoRe auf das Original oder eine einfachere Variante zurück.",
    color: "var(--core-danger)",
    reviewX: 822,
    intervalStartX: 590,
    curvePath: "M 590 92 C 662 106, 758 156, 822 248",
    stabilityLabel: "S₄ · groß",
    cardLabel: "Nahe Kartenvariante",
  },
];

const PARAMETER_DETAILS: Record<ParameterId, ExplorerDetail> = {
  r: {
    title: "R · Abrufwahrscheinlichkeit",
    summary: "R beschreibt, wie wahrscheinlich du den Inhalt genau jetzt korrekt abrufen kannst.",
    detail: "Nach einem erfolgreichen Review liegt R wieder nahe 100 Prozent und verändert sich anschließend täglich. Die gestrichelte Linie zeigt die Zielerinnerung von 90 Prozent: FSRS sucht das Intervall, an dessen Ende R voraussichtlich diesen Wert erreicht.",
    context: "Kurven und Zielerinnerung",
    color: "var(--core-info)",
  },
  s: {
    title: "S · Stabilität",
    summary: "S beschreibt, wie lange die Erinnerung hält und bestimmt damit die Form der Vergessenskurve.",
    detail: "S wird in Tagen gedacht: Es ist die Zeit, in der R von 100 auf 90 Prozent fällt. Die Pfeile werden länger, weil S nach erfolgreichen Abrufen gewöhnlich wächst; S ändert sich wie D erst bei einem Review.",
    context: "Wachsende Intervalle",
    color: "var(--core-success)",
  },
  d: {
    title: "D · Schwierigkeit",
    summary: "D beschreibt, wie schwer sich diese Erinnerung dauerhaft festigen lässt.",
    detail: "Die Rauten markieren D als Zustand an den Reviewpunkten. D ändert sich nur nach einem Review und beeinflusst, wie stark S wachsen kann; deshalb wird D hier nicht als zweite Prozentkurve dargestellt.",
    context: "Einfluss an den Reviews",
    color: "var(--core-warning)",
  },
};

const MEMORY_TERMS: readonly MemoryTerm[] = [
  {
    parameterId: "r",
    term: "R · Abrufwahrscheinlichkeit",
    description: "Wie wahrscheinlich du den Inhalt jetzt korrekt erinnern kannst. R sinkt mit der Zeit.",
  },
  {
    parameterId: "s",
    term: "S · Stabilität",
    description: "Die Zeit in Tagen, in der R von 100 auf 90 Prozent fällt. Je höher S ist, desto länger hält die Erinnerung.",
  },
  {
    parameterId: "d",
    term: "D · Schwierigkeit",
    description: "Wie schwer sich die Erinnerung festigen lässt. Schwierige Inhalte bauen Stabilität langsamer auf.",
  },
  {
    term: "Zielerinnerung",
    description: "Die gewünschte Erinnerungswahrscheinlichkeit am nächsten Termin, im Beispiel 90 Prozent.",
  },
  {
    term: "Intervall",
    description: "Der Abstand bis zum nächsten Review. Erfolgreiche Abrufe lassen ihn meistens wachsen.",
  },
  {
    term: "Original und Variante",
    description: "Zwei Fragestellungen zur gleichen Wissenseinheit. Die Variante verändert den Abrufreiz, nicht die Fakten.",
  },
];

const RATING_EXPLANATIONS = [
  { label: "Nochmal", text: "Nicht erinnert: kurzfristig wiederholen und Stabilität deutlich senken." },
  { label: "Schwer", text: "Gerade noch erinnert: vorsichtiger Stabilitätszuwachs und kürzeres Intervall." },
  { label: "Gut", text: "Solide erinnert: normaler Stabilitätszuwachs und längeres Intervall." },
  { label: "Leicht", text: "Sehr sicher erinnert: stärkerer Stabilitätszuwachs und größtes Intervall." },
] as const;

const SCHEDULING_STEPS = [
  {
    label: "Gedächtniszustand aktualisieren",
    text: "Nach deiner Bewertung werden Stabilität S und Schwierigkeit D neu geschätzt; die Abrufwahrscheinlichkeit R liegt direkt nach dem erfolgreichen Abruf wieder nahe 100 Prozent.",
  },
  {
    label: "Vergessen vorhersagen",
    text: "Zwischen zwei Reviews bleiben S und D unverändert, während R mit jedem verstrichenen Tag fällt. Eine höhere Stabilität macht diesen Abfall langsamer.",
  },
  {
    label: "Nächsten Termin setzen",
    text: "Der Scheduler wählt den Zeitpunkt, an dem R voraussichtlich die gewünschte Zielerinnerung erreicht. Bei 90 Prozent soll die Karte also dann erscheinen, wenn noch eine 90-prozentige Abrufchance erwartet wird.",
  },
] as const;

const PARAMETER_POSITIONS: Record<ParameterId, { left: string; top: string }> = {
  r: { left: "15%", top: "1%" },
  d: { left: "72%", top: "1%" },
  s: { left: "50%", top: "74%" },
};

function reviewSelectionId(id: ReviewId): ExplorerSelectionId {
  return `review-${id}`;
}

function parameterSelectionId(id: ParameterId): ExplorerSelectionId {
  return `parameter-${id}`;
}

function getActiveReviewId(selection: ExplorerSelectionId): ReviewId | null {
  return MEMORY_STEPS.find((step) => reviewSelectionId(step.id) === selection)?.id ?? null;
}

function getActiveParameterId(selection: ExplorerSelectionId): ParameterId | null {
  if (selection === "parameter-r") return "r";
  if (selection === "parameter-s") return "s";
  if (selection === "parameter-d") return "d";
  return null;
}

function getExplorerDetail(selection: ExplorerSelectionId): ExplorerDetail {
  const reviewId = getActiveReviewId(selection);
  if (reviewId !== null) {
    const step = MEMORY_STEPS[reviewId - 1];
    return {
      title: step.title,
      summary: step.summary,
      detail: step.detail,
      context: step.cardLabel,
      color: step.color,
    };
  }

  return PARAMETER_DETAILS[getActiveParameterId(selection) ?? "r"];
}

function MemoryCurveExplorer() {
  const [selectedSelection, setSelectedSelection] = React.useState<ExplorerSelectionId>("review-1");
  const [hoveredSelection, setHoveredSelection] = React.useState<ExplorerSelectionId | null>(null);
  const [focusedSelection, setFocusedSelection] = React.useState<ExplorerSelectionId | null>(null);
  const activeSelection = hoveredSelection ?? focusedSelection ?? selectedSelection;
  const activeReviewId = getActiveReviewId(activeSelection);
  const activeParameterId = getActiveParameterId(activeSelection);
  const activeDetail = getExplorerDetail(activeSelection);

  function hoverProps(selection: ExplorerSelectionId) {
    return {
      onPointerEnter: () => setHoveredSelection(selection),
      onPointerLeave: () => setHoveredSelection((current) => current === selection ? null : current),
    };
  }

  function buttonProps(selection: ExplorerSelectionId) {
    return {
      ...hoverProps(selection),
      onFocus: () => {
        setHoveredSelection(null);
        setFocusedSelection(selection);
      },
      onBlur: () => setFocusedSelection((current) => current === selection ? null : current),
      onClick: () => setSelectedSelection(selection),
      "aria-pressed": selectedSelection === selection,
      "aria-controls": "memory-explorer-detail",
    };
  }

  return (
    <>
      <section className="grid gap-5" aria-labelledby="memory-curve-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="core-control-label uppercase tracking-wide text-core-action">Interaktive Lernkurve</p>
            <h2 id="memory-curve-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Wie Wiederholungen die Erinnerung stärken</h2>
          </div>
          <p className="core-caption max-w-xl text-[var(--core-text-muted)]" id="memory-curve-disclaimer">
            Vereinfachtes Beispiel – tatsächliche Intervalle hängen von Verlauf, Bewertung und Einstellungen ab.
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
              <svg
                className="absolute inset-0 size-full"
                viewBox="0 0 900 500"
                role="img"
                aria-labelledby="memory-curve-title memory-curve-description"
              >
                <title id="memory-curve-title">Vereinfachte FSRS-Gedächtniskurve mit vier Reviews</title>
                <desc id="memory-curve-description">Der gezeigte Ausschnitt der Y-Achse reicht von 90 bis 100 Prozent. Vier zunehmend längere Intervalle enden an der Zielerinnerung. R bezeichnet die Kurven, S die Intervallspannen und D den Einfluss an den Reviewpunkten. Beim vierten Review zeigt CoRe beispielhaft eine Kartenvariante.</desc>

                <line x1="72" y1="360" x2="858" y2="360" stroke="var(--core-border-interactive)" strokeWidth="2" />
                <line x1="72" y1="52" x2="72" y2="360" stroke="var(--core-border-interactive)" strokeWidth="2" />
                <text x="465" y="470" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">Zeit und wachsende Intervalle</text>
                <text x="22" y="198" transform="rotate(-90 22 198)" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">Abrufwahrscheinlichkeit</text>
                <text x="57" y="98" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">100 %</text>
                <text x="57" y="253" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">90 %</text>
                <text x="86" y="350" fill="var(--core-text-muted)" fontSize="13">Ausschnitt 90–100 %</text>

                <g data-testid="memory-y-axis-break" aria-hidden="true">
                  <path d="M 64 326 L 80 316" stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M 64 339 L 80 329" stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
                </g>

                {MEMORY_STEPS.map((step) => {
                  const selection = reviewSelectionId(step.id);
                  return (
                    <rect
                      key={`area-${step.id}`}
                      x={step.intervalStartX}
                      y="52"
                      width={step.reviewX - step.intervalStartX}
                      height="278"
                      fill="transparent"
                      pointerEvents="all"
                      {...hoverProps(selection)}
                      data-testid={`memory-curve-area-${step.id}`}
                    />
                  );
                })}

                <g data-testid="memory-visual-r" data-active={activeParameterId === "r" ? "true" : "false"}>
                  <line
                    x1="72"
                    y1="248"
                    x2="858"
                    y2="248"
                    stroke="var(--core-text-muted)"
                    strokeDasharray="7 7"
                    strokeWidth={activeParameterId === "r" ? 3 : 1.5}
                    opacity={activeParameterId === "r" ? 1 : 0.72}
                  />
                  <text x="850" y="235" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">Zielerinnerung R = 90 %</text>
                  {MEMORY_STEPS.map((step) => {
                    const emphasized = activeParameterId === "r" || activeReviewId === step.id;
                    return (
                      <path
                        key={`curve-${step.id}`}
                        d={step.curvePath}
                        fill="none"
                        stroke={step.color}
                        strokeWidth={emphasized ? 7 : 3.5}
                        strokeLinecap="round"
                        opacity={emphasized ? 1 : 0.22}
                        pointerEvents="none"
                        className="transition-[stroke-width,opacity] motion-reduce:transition-none"
                      />
                    );
                  })}
                  <path d="M 822 92 C 850 98, 870 114, 890 138" fill="none" stroke={MEMORY_STEPS[3].color} strokeWidth={activeParameterId === "r" ? 6 : 3.5} strokeLinecap="round" opacity={activeParameterId === "r" ? 1 : 0.45} />
                </g>

                <g data-testid="memory-visual-s" data-active={activeParameterId === "s" ? "true" : "false"}>
                  {MEMORY_STEPS.map((step) => {
                    const emphasized = activeParameterId === "s" || activeReviewId === step.id;
                    const start = step.intervalStartX + 10;
                    const end = step.reviewX - 10;
                    return (
                      <g key={`stability-${step.id}`} opacity={emphasized ? 1 : 0.32} className="transition-opacity motion-reduce:transition-none">
                        <line x1={start} y1="286" x2={end} y2="286" stroke={step.color} strokeWidth={emphasized ? 4 : 2} />
                        <path d={`M ${start + 9} 280 L ${start} 286 L ${start + 9} 292`} fill="none" stroke={step.color} strokeWidth={emphasized ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
                        <path d={`M ${end - 9} 280 L ${end} 286 L ${end - 9} 292`} fill="none" stroke={step.color} strokeWidth={emphasized ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
                        <text x={(step.intervalStartX + step.reviewX) / 2} y="312" textAnchor="middle" fill="var(--core-text-secondary)" fontSize="13" fontWeight={emphasized ? 700 : 400}>{step.stabilityLabel}</text>
                      </g>
                    );
                  })}
                </g>

                <g data-testid="memory-visual-d" data-active={activeParameterId === "d" ? "true" : "false"}>
                  {MEMORY_STEPS.map((step) => {
                    const emphasized = activeParameterId === "d" || activeReviewId === step.id;
                    return (
                      <g key={`difficulty-${step.id}`} opacity={emphasized ? 1 : 0.28} className="transition-opacity motion-reduce:transition-none">
                        <line x1={step.reviewX} y1="78" x2={step.reviewX} y2="248" stroke={step.color} strokeWidth={emphasized ? 3 : 2} strokeDasharray="6 7" />
                        <path
                          d={`M ${step.reviewX} 64 L ${step.reviewX + 7} 71 L ${step.reviewX} 78 L ${step.reviewX - 7} 71 Z`}
                          fill="var(--core-surface-raised)"
                          stroke={activeParameterId === "d" ? "var(--core-warning)" : step.color}
                          strokeWidth={emphasized ? 3 : 2}
                        />
                      </g>
                    );
                  })}
                </g>

                {MEMORY_STEPS.map((step) => (
                  <path
                    key={`hit-${step.id}`}
                    d={step.curvePath}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="24"
                    pointerEvents="stroke"
                    {...hoverProps(reviewSelectionId(step.id))}
                    data-testid={`memory-curve-segment-${step.id}`}
                  />
                ))}
              </svg>

              {(Object.keys(PARAMETER_DETAILS) as ParameterId[]).map((parameterId) => {
                const selection = parameterSelectionId(parameterId);
                const active = activeSelection === selection;
                const detail = PARAMETER_DETAILS[parameterId];
                return (
                  <button
                    key={parameterId}
                    type="button"
                    className={`absolute z-20 flex min-h-11 -translate-x-1/2 items-center px-2 core-caption font-semibold underline-offset-4 transition-[color,text-decoration-thickness] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] motion-reduce:transition-none ${active ? "text-core-text underline decoration-2" : "text-core-secondary"}`}
                    style={PARAMETER_POSITIONS[parameterId]}
                    {...buttonProps(selection)}
                    data-testid={`memory-parameter-${parameterId}`}
                  >
                    {detail.title}
                  </button>
                );
              })}

              {MEMORY_STEPS.map((step) => {
                const selection = reviewSelectionId(step.id);
                const active = activeReviewId === step.id;
                const difficultyActive = activeParameterId === "d";
                return (
                  <button
                    key={step.id}
                    type="button"
                    className="absolute z-20 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 bg-[var(--core-surface-raised)] core-body font-semibold shadow-sm transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                    style={{
                      left: `${(step.reviewX / 900) * 100}%`,
                      top: `${(248 / 500) * 100}%`,
                      borderColor: step.color,
                      borderWidth: active || difficultyActive ? 3 : 2,
                      color: step.color,
                      transform: `translate(-50%, -50%) scale(${active ? 1.12 : difficultyActive ? 1.05 : 1})`,
                      opacity: activeReviewId === null || active ? 1 : 0.62,
                    }}
                    {...buttonProps(selection)}
                    aria-label={`${step.title} auswählen`}
                    data-testid={`memory-review-point-${step.id}`}
                  >
                    {step.id === 4 ? <Sparkles size={19} aria-hidden="true" /> : step.id}
                  </button>
                );
              })}
            </div>
          </div>
        </SoftPanel>

        <div
          id="memory-explorer-detail"
          className="border-l-4 py-2 pl-5"
          style={{ borderColor: activeDetail.color }}
          aria-live="polite"
          data-testid="memory-explorer-detail"
        >
          <p className="core-caption font-semibold uppercase tracking-wide text-core-secondary">{activeDetail.context}</p>
          <h3 className="core-heading-3 mt-2 font-semibold text-core-text">{activeDetail.title}</h3>
          <p className="mt-3 core-body-large font-semibold text-core-text">{activeDetail.summary}</p>
          <p className="mt-2 max-w-4xl core-body leading-6 text-[var(--core-text-secondary)]">{activeDetail.detail}</p>
        </div>

        <div className="grid gap-x-5 md:grid-cols-2 xl:grid-cols-4" aria-label="Interaktive Erklärung der vier Reviews">
          {MEMORY_STEPS.map((step) => {
            const selection = reviewSelectionId(step.id);
            const active = activeReviewId === step.id;
            return (
              <button
                key={step.id}
                type="button"
                className={`min-h-11 border-t-2 py-4 text-left transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] motion-reduce:transition-none ${active ? "opacity-100" : "opacity-65"}`}
                style={{ borderColor: active ? step.color : "var(--core-border)" }}
                {...buttonProps(selection)}
                data-testid={`memory-review-summary-${step.id}`}
              >
                <span className="flex items-center gap-2 core-caption font-semibold uppercase tracking-wide text-core-secondary">
                  <span style={{ color: step.color }} aria-hidden="true">{active ? "●" : "○"}</span>
                  Review {step.id}
                </span>
                <span className="mt-2 block core-body-large font-semibold text-core-text">{step.shortLabel}</span>
                <span className="mt-2 block core-body leading-6 text-core-secondary">{step.summary}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5" aria-labelledby="memory-terms-heading">
        <div>
          <p className="core-control-label uppercase tracking-wide text-core-action">Die wichtigsten Begriffe</p>
          <h2 id="memory-terms-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Der Gedächtniszustand verständlich erklärt</h2>
        </div>
        <dl className="grid border-t border-core-border md:grid-cols-2 xl:grid-cols-3">
          {MEMORY_TERMS.map((memoryTerm) => {
            const selection = memoryTerm.parameterId ? parameterSelectionId(memoryTerm.parameterId) : null;
            const active = selection !== null && activeSelection === selection;
            return (
              <div key={memoryTerm.term} className="border-b border-core-border py-5 md:pr-8 xl:min-h-36">
                <dt>
                  {selection ? (
                    <button
                      type="button"
                      className={`flex min-h-11 items-center text-left core-body-large font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] ${active ? "text-core-text underline decoration-2" : "text-core-secondary"}`}
                      {...buttonProps(selection)}
                      data-testid={`memory-term-${memoryTerm.parameterId}`}
                    >
                      {memoryTerm.term}
                    </button>
                  ) : (
                    <span className="flex min-h-11 items-center core-body-large font-semibold text-core-text">{memoryTerm.term}</span>
                  )}
                </dt>
                <dd className="mt-1 core-body leading-6 text-core-secondary">{memoryTerm.description}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </>
  );
}

export function HelpScreen() {
  return (
    <div className="grid gap-10">
      <PageHeader eyebrow="Hilfe" title="Wie CoRe und FSRS funktionieren" />

      <section className="grid gap-4 lg:grid-cols-2" aria-label="FSRS und CoRe im Überblick">
        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Clock3} />
            <h2 className="core-heading-2 font-semibold text-core-text">FSRS plant den richtigen Zeitpunkt</h2>
          </div>
          <p className="mt-4 core-body-large leading-7 text-core-secondary">
            FSRS sucht für jede Karte das Intervall, an dessen Ende ihre vorhergesagte Abrufwahrscheinlichkeit deiner Zielerinnerung entspricht. Bei 90 Prozent erscheint sie also dann, wenn du sie voraussichtlich noch mit 90-prozentiger Wahrscheinlichkeit erinnern kannst.
          </p>
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Sparkles} className="bg-core-success-soft text-core-text" />
            <h2 className="core-heading-2 font-semibold text-core-text">CoRe verändert zusätzlich die Fragestellung</h2>
          </div>
          <p className="mt-4 core-body-large leading-7 text-core-secondary">
            Sobald die Originalkarte ausreichend stabil und nicht durch aktuelle Fehler fragil ist, kann CoRe dieselbe Wissenseinheit als nahe Variante erzeugen und abfragen. Entscheidend ist die Reife der Karte, nicht eine feste Zahl von Reviews.
          </p>
        </SoftPanel>
      </section>

      <div className="rounded-2xl border border-core-warning bg-core-warning-soft p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-core-text" size={22} aria-hidden="true" />
          <div>
            <h2 className="core-heading-3 font-semibold text-core-text">Transparenz zum aktuellen Scheduler</h2>
            <p className="mt-2 core-body leading-6 text-core-secondary">
              CoRe verwendet echtes FSRS-6 mit den offiziellen 21 Standardparametern. Der Scheduler schätzt für jede Karte R, S und D und berücksichtigt alle Reviews einschließlich mehrerer Abrufe am selben Tag. Eine persönliche Optimierung der Parameter aus deiner eigenen Reviewhistorie ist noch nicht aktiviert.
            </p>
            <p className="mt-2 core-body leading-6 text-core-secondary">
              Neue Karten bleiben nach dem ersten Kontakt in der Lernphase und erscheinen am selben Tag erneut. Standardmäßig bedeutet „Gut“ einen zweiten Kontakt nach 15 Minuten; innerhalb einer laufenden Sitzung kann CoRe diese Wiederholung nach den übrigen Karten vorziehen.
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-5" aria-labelledby="scheduler-flow-heading">
        <div>
          <p className="core-control-label uppercase tracking-wide text-core-action">Vom Gedächtnis zum Termin</p>
          <h2 id="scheduler-flow-heading" className="core-heading-2 mt-2 font-semibold text-core-text">So arbeitet ein Spaced-Repetition-Scheduler</h2>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
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

          <div className="border-t border-core-border py-5">
            <p className="core-caption font-semibold uppercase tracking-wide text-core-action">Zielerinnerung und Aufwand</p>
            <h3 className="core-heading-3 mt-2 font-semibold text-core-text">Du steuerst das Ziel, FSRS die Intervalle</h3>
            <p className="mt-3 core-body leading-6 text-core-secondary">
              Eine höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag. Eine niedrigere Zielerinnerung reduziert den Aufwand, nimmt aber mehr Vergessen in Kauf. Die 21 Modellparameter werden nicht von Hand eingestellt.
            </p>
            <p className="mt-5 border-l-2 border-core-success pl-4 core-body leading-6 text-core-secondary">
              <strong className="font-semibold text-core-text">CoRe ergänzt die Inhaltsentscheidung:</strong> Erfolgreiche Abrufe, Stabilität, Intervall, aktuelle Abrufwahrscheinlichkeit und jüngste Fehler bestimmen gemeinsam, ob die Originalkarte als „bereit für Varianten“ gilt. Dann kann eine nahe Umformulierung erzeugt werden; nach einem Fehler wird wieder das Original oder eine einfachere Variante bevorzugt.
            </p>
            <p className="mt-4 core-caption leading-5 text-[var(--core-text-muted)]">
              Review 4 in der Grafik veranschaulicht diesen Übergang nur. Es gibt keine garantierte Reviewnummer, ab der jede Karte variiert wird.
            </p>
          </div>
        </div>
      </section>

      <MemoryCurveExplorer />

      <section className="grid gap-5" aria-labelledby="rating-heading">
        <div>
          <p className="core-control-label uppercase tracking-wide text-core-action">Deine Bewertung</p>
          <h2 id="rating-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Vier Antworten steuern den Rhythmus</h2>
        </div>
        <ol className="grid border-t border-core-border md:grid-cols-2 xl:grid-cols-4">
          {RATING_EXPLANATIONS.map((rating, index) => (
            <li key={rating.label} className="border-b border-core-border py-5 md:pr-8 xl:min-h-36">
              <p className="core-caption font-semibold tabular-nums text-core-action">0{index + 1}</p>
              <h3 className="mt-2 core-body-large font-semibold text-core-text">{rating.label}</h3>
              <p className="mt-2 core-body leading-6 text-core-secondary">{rating.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]" aria-label="Sichere Varianten und weiterführende Informationen">
        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={RotateCcw} className="bg-core-danger-soft text-core-text" />
            <h2 className="core-heading-2 font-semibold text-core-text">Was bei Varianten geschützt bleibt</h2>
          </div>
          <ul className="mt-4 grid gap-3 core-body leading-6 text-core-secondary">
            <li>• Die Variante prüft dieselbe Wissenseinheit und führt keine neuen Fakten ein.</li>
            <li>• Genau eine Originalkarte bleibt als Vertrauensanker erhalten.</li>
            <li>• Nach einem Fehler nutzt CoRe wieder das Original oder eine einfachere Variante.</li>
            <li>• Review 4 in der Grafik ist ein Beispiel, keine garantierte Produktionsschwelle.</li>
          </ul>
        </SoftPanel>

        <div className="border-y border-core-border py-6">
          <div className="flex items-center gap-3">
            <Brain className="text-core-action" size={24} aria-hidden="true" />
            <h2 className="core-heading-2 font-semibold text-core-text">Mehr über FSRS</h2>
          </div>
          <p className="mt-4 core-body leading-6 text-core-secondary">Die offizielle Einführung erklärt das vollständige FSRS-Modell, seine Parameter und die Zielerinnerung.</p>
          <a
            className="core-action-secondary mt-5 w-fit"
            href="https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS"
            target="_blank"
            rel="noreferrer noopener"
          >
            ABC of FSRS öffnen
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
