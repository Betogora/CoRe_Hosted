import React from "react";
import { Sparkle, Sparkles } from "lucide-react";

type ReviewId = "first" | "variant";
type RatingId = "again" | "hard" | "good" | "easy";
type ParameterId = "r" | "s" | "d";
type ExplorerSelectionId = "overview" | "ratings" | `review-${ReviewId}` | `rating-${RatingId}` | `parameter-${ParameterId}`;

interface MemoryReview {
  id: ReviewId;
  title: string;
  color: string;
  reviewX: number;
}

/** A cubic curve in the design space of the chart: start, two control points and end as x/y pairs. */
type DesignCurve = readonly [number, number, number, number, number, number, number, number];

interface RatingPath {
  id: RatingId;
  color: string;
  dueX: number;
  curve: DesignCurve;
}

interface StoryStep<TSelection extends string> {
  id: string;
  title: string;
  text: string;
  selection: TSelection;
  note?: string;
}

const MEMORY_REVIEWS: readonly MemoryReview[] = [
  {
    id: "first",
    title: "1 · Erste Wiederholung",
    color: "var(--core-text)",
    reviewX: 220,
  },
  {
    id: "variant",
    title: "x. Wiederholung · Variante",
    color: "var(--core-info)",
    reviewX: 855,
  },
];

const RATING_PATHS: readonly RatingPath[] = [
  {
    id: "again",
    color: "var(--core-rating-again-text)",
    dueX: 350,
    curve: [220, 92, 258, 112, 318, 186, 350, 248],
  },
  {
    id: "hard",
    color: "var(--core-rating-hard-text)",
    dueX: 500,
    curve: [220, 92, 292, 102, 438, 164, 500, 248],
  },
  {
    id: "good",
    color: "var(--core-rating-good-text)",
    dueX: 680,
    curve: [220, 92, 328, 96, 586, 146, 680, 248],
  },
  {
    id: "easy",
    color: "var(--core-rating-easy-text)",
    dueX: 855,
    curve: [220, 92, 364, 94, 734, 126, 855, 248],
  },
];

const INITIAL_CURVE: DesignCurve = [74, 92, 118, 104, 176, 168, 220, 248];
const VARIANT_CURVE: DesignCurve = [855, 92, 878, 96, 906, 106, 928, 122];

const ACTIVE_RECALL_STEPS: readonly StoryStep<"stack" | "blur" | "variants">[] = [
  {
    id: "active-stack",
    title: "Wiederholen kann überraschend passiv werden",
    text: "Karteikartenlernen wird schnell anstrengend, besonders wenn viele ähnliche Karten nacheinander kommen. Unser Gehirn versucht, möglichst energiesparend zu arbeiten.",
    selection: "stack",
  },
  {
    id: "active-blur",
    title: "Irgendwann erkennst du eher die Karte als den Inhalt",
    text: "Nach einiger Zeit bleiben leicht Position, Satzlänge oder einzelne Signalwörter hängen. Die Antwort fühlt sich bekannt an, obwohl die eigentliche Frage nicht mehr vollständig verstanden wird.",
    selection: "blur",
    note: "Je vertrauter die Kartenform wird, desto schwächer wird der aktive Abruf des Inhalts.",
  },
  {
    id: "active-variants",
    title: "CoRe verändert die Frage, nicht das Wissen",
    text: "Wie ein Tutor formuliert CoRe dieselbe Wissenseinheit nach ausreichender Reife neu. Die Varianten fragen denselben Inhalt anders ab, ohne neue Fakten einzuführen.",
    selection: "variants",
    note: "So wird sichergestellt, dass du den Inhalt jedes Mal erneut aktiv abrufst – Smarter Recall.",
  },
];

const HELP_EXAMPLE_STACK_LAYERS = [
  { id: "back", className: "core-help-stack-layer-back z-0" },
  { id: "middle", className: "core-help-stack-layer-middle z-10" },
] as const;

const ACTIVE_RECALL_VARIANTS = [
  {
    id: "resting-heart-rate",
    question: "Wenn die Herzfrequenz des Körpers im Ruhezustand sinkt, welcher Teil des autonomen Nervensystems ist daran hauptsächlich beteiligt?",
    className: "core-help-variant-card-middle left-[4%] right-[12%] top-4 z-10 -rotate-2",
    tone: "middle",
    showAnswer: false,
  },
  {
    id: "autonomic-section",
    question: "Die Senkung der Herzfrequenz unter Ruhebedingungen wird vor allem durch welchen Abschnitt des autonomen Nervensystems vermittelt?",
    className: "core-help-stack-front left-[12%] right-[4%] top-44 z-20 rotate-2",
    tone: "front",
    showAnswer: true,
  },
] as const;

const SPACED_REPETITION_STEPS: readonly StoryStep<ExplorerSelectionId>[] = [
  {
    id: "spaced-idea",
    title: "Wiederholt wird, kurz bevor du vergisst",
    text: "Ohne Wiederholung sinkt die Abrufwahrscheinlichkeit mit der Zeit. FSRS plant jede Karte so, dass du sie wiederholst, kurz bevor sie unter deine Zielerinnerung fällt. So wiederholst du nur, was du sonst vergessen würdest.",
    selection: "overview",
  },
  {
    id: "spaced-first-review",
    title: "Die erste Wiederholung aktualisiert den Gedächtniszustand",
    text: "Die Originalkarte erreicht im Beispiel 90 Prozent Abrufwahrscheinlichkeit. Nach deiner Antwort schätzt FSRS Stabilität S und Schwierigkeit D neu.",
    selection: "review-first",
  },
  {
    id: "spaced-ratings",
    title: "Deine Antwort bestimmt das nächste Intervall",
    text: "„Nochmal“, „Schwer“, „Gut“ und „Leicht“ führen gemeinsam betrachtet zu zunehmend längeren Intervallen. Je sicherer der Abruf, desto später wird die Karte erneut fällig.",
    selection: "ratings",
  },
  {
    id: "spaced-variant",
    title: "Erst dann kommt eine Variante als neuer Punkt hinzu",
    text: "Sobald die Haltbarkeit die Schwelle des Stapels erreicht, kann CoRe denselben Inhalt mit einer neuen Frageform prüfen. Der Variantenpunkt ist ein Beispiel und keine garantierte Reviewnummer.",
    selection: "review-variant",
  },
  {
    id: "spaced-d",
    title: "D beschreibt die dauerhafte Schwierigkeit",
    text: "Schwierige Inhalte bauen Stabilität langsamer auf. Die Rauten markieren D an den Wiederholungspunkten; D ist keine zweite Prozentkurve.",
    selection: "parameter-d",
  },
  {
    id: "spaced-r",
    title: "R ist deine aktuelle Abrufwahrscheinlichkeit",
    text: "Nach einem erfolgreichen Review liegt R wieder nahe 100 Prozent und fällt anschließend mit der Zeit. Die gestrichelte Linie zeigt eine Zielerinnerung von 90 Prozent.",
    selection: "parameter-r",
  },
  {
    id: "spaced-s",
    title: "S beschreibt, wie lange die Erinnerung hält",
    text: "CoRe zeigt S als Haltbarkeit: die Tage, bis R von 100 auf 90 Prozent fällt. Die vier Pfeile zeigen qualitativ, wie deine Antwort das nächste Intervall beeinflusst.",
    selection: "parameter-s",
  },
];

const PARAMETER_LABELS: Record<ParameterId, string> = {
  r: "R · Abrufwahrscheinlichkeit",
  s: "S · Stabilität",
  d: "D · Schwierigkeit",
};

/** Design space of the curves: the x axis runs from 72 to 928, R falls from 100 % at y 92 to 90 % at y 248. */
const DESIGN_AXIS = { left: 72, right: 928, full: 92, target: 248 } as const;

/**
 * Lays the chart out in real pixels for the measured width: curves stretch with the plot, while text, markers and
 * review points keep their size. Narrow charts move the review labels inside the plot instead of centring them.
 */
export function memoryChartLayout(width: number) {
  const compact = width < 560;
  const axisX = 48;
  const plotRight = width - 16;
  const fullY = 40;
  const targetY = fullY + Math.round(Math.min(220, Math.max(110, width * 0.25)));
  const axisBottom = targetY + 132;
  const x = (designX: number) => axisX + ((designX - DESIGN_AXIS.left) / (DESIGN_AXIS.right - DESIGN_AXIS.left)) * (plotRight - axisX);
  const y = (designY: number) => fullY + ((designY - DESIGN_AXIS.full) / (DESIGN_AXIS.target - DESIGN_AXIS.full)) * (targetY - fullY);
  const path = (curve: DesignCurve) => `M ${x(curve[0])} ${y(curve[1])} C ${x(curve[2])} ${y(curve[3])}, ${x(curve[4])} ${y(curve[5])}, ${x(curve[6])} ${y(curve[7])}`;
  return { compact, width, height: axisBottom + 2, axisX, plotRight, fullY, targetY, axisBottom, x, path };
}

const DEFAULT_CHART_WIDTH = 880;

function reviewSelectionId(id: ReviewId): ExplorerSelectionId {
  return `review-${id}`;
}

function ratingSelectionId(id: RatingId): ExplorerSelectionId {
  return `rating-${id}`;
}

function parameterSelectionId(id: ParameterId): ExplorerSelectionId {
  return `parameter-${id}`;
}

function getActiveReviewId(selection: ExplorerSelectionId): ReviewId | null {
  return MEMORY_REVIEWS.find((review) => reviewSelectionId(review.id) === selection)?.id ?? null;
}

function getActiveRatingId(selection: ExplorerSelectionId): RatingId | null {
  return RATING_PATHS.find((rating) => ratingSelectionId(rating.id) === selection)?.id ?? null;
}

function getActiveParameterId(selection: ExplorerSelectionId): ParameterId | null {
  if (selection === "parameter-r") return "r";
  if (selection === "parameter-s") return "s";
  if (selection === "parameter-d") return "d";
  return null;
}

function useScrollStory(stepCount: number) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let animationFrame = 0;
    const desktop = window.matchMedia("(min-width: 1280px)").matches;
    const scrollRegion = desktop ? container.closest<HTMLElement>(".core-screen-region") : null;
    const scrollTarget: Window | HTMLElement = scrollRegion ?? window;
    const steps = Array.from(container.querySelectorAll<HTMLElement>("[data-story-step]"));
    const updateActiveStep = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const viewportFocus = scrollRegion
          ? scrollRegion.getBoundingClientRect().top + scrollRegion.clientHeight * 0.48
          : window.innerHeight * 0.48;
        let closestIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;

        steps.forEach((step, index) => {
          const rect = step.getBoundingClientRect();
          const stepCenter = rect.top + rect.height / 2;
          const distance = Math.abs(stepCenter - viewportFocus);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        });

        setActiveIndex((current) => current === closestIndex ? current : closestIndex);
      });
    };

    updateActiveStep();
    scrollTarget.addEventListener("scroll", updateActiveStep, { passive: true });
    window.addEventListener("resize", updateActiveStep);
    return () => {
      cancelAnimationFrame(animationFrame);
      scrollTarget.removeEventListener("scroll", updateActiveStep);
      window.removeEventListener("resize", updateActiveStep);
    };
  }, [stepCount]);

  return { activeIndex, containerRef, setActiveIndex };
}

function StoryStepCard<TSelection extends string>({
  active,
  elementId,
  index,
  onFocus,
  step,
  testId,
}: {
  active: boolean;
  elementId?: string;
  index: number;
  onFocus: () => void;
  step: StoryStep<TSelection>;
  testId?: string;
}) {
  return (
    <li id={elementId} className="flex min-w-0 min-h-[58svh] items-center py-8 first:items-start first:pt-0 xl:min-h-[68svh] xl:first:min-h-[28.5rem] xl:first:items-center" data-story-step={index} data-testid={testId}>
      <article
        className={`min-w-0 w-full rounded-panel px-6 py-5 transition-[background-color,opacity,transform] duration-300 motion-reduce:transition-none ${active ? "translate-x-0 bg-core-surface opacity-100" : "translate-x-2 opacity-70"}`}
        tabIndex={0}
        onFocus={onFocus}
        aria-current={active ? "step" : undefined}
      >
        <h3 className="core-heading-2 text-core-text">{step.title}</h3>
        <p className="mt-4 text-pretty core-body-large leading-7 text-core-secondary">{step.text}</p>
        {step.note ? <p className="mt-4 core-caption leading-5 text-core-secondary">{step.note}</p> : null}
      </article>
    </li>
  );
}

function HelpExampleCardStack({
  activeRecallCard,
  ariaLabel,
  children,
  frontTestId,
  layerTestId,
  rootTestId,
}: {
  activeRecallCard?: "stack" | "blur";
  ariaLabel?: string;
  children: React.ReactNode;
  frontTestId?: string;
  layerTestId?: string;
  rootTestId?: string;
}) {
  return (
    <div
      className="core-help-example-stack relative mx-auto h-[34rem] w-full max-w-xl sm:h-[25rem]"
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      data-testid={rootTestId}
      data-help-example-stack="true"
      data-help-example-stack-template="medium"
      data-active-recall-card={activeRecallCard}
    >
      {HELP_EXAMPLE_STACK_LAYERS.map((layer) => (
        <div
          key={layer.id}
          className={`core-help-stack-card absolute inset-x-[8%] top-10 h-[30rem] rounded-overlay border border-core-border-strong sm:h-[21rem] ${layer.className}`}
          aria-hidden="true"
          data-testid={layerTestId}
          data-help-example-stack-layer={layer.id}
        />
      ))}
      <div
        className="core-help-stack-card core-help-stack-front absolute inset-x-[8%] top-10 z-20 grid h-[30rem] place-items-center rounded-overlay border border-core-border-strong p-6 shadow-raised sm:h-[21rem] sm:p-8"
        data-testid={frontTestId}
        data-help-example-stack-front="true"
      >
        {children}
      </div>
    </div>
  );
}

function HelpCardDivider({ compact = false, testId }: { compact?: boolean; testId?: string }) {
  return (
    <div
      className={`mx-auto mt-4 h-px bg-core-border-strong ${compact ? "w-3/4 max-w-xs" : "w-4/5 max-w-sm"}`}
      data-testid={testId}
      aria-hidden="true"
    />
  );
}

export function IntroCardStack() {
  return (
    <HelpExampleCardStack
      ariaLabel="Karteikartenstapel mit der Frage, welche Grundsätze CoRe für nachhaltiges Lernen nutzt. Active Recall wird zu Smarter Recall und Spaced Repetition zu Content Repetition weiterentwickelt."
      rootTestId="help-intro-card-stack"
      frontTestId="help-intro-card-front"
      layerTestId="help-intro-card-layer"
    >
      <div className="w-full max-w-md text-center">
        <p className="core-help-card-question text-core-text">
          Welche <mark className="core-help-keyword">Grundsätze</mark> <mark className="core-help-keyword">nutzt CoRe</mark>, um das <mark className="core-help-keyword">Lernen</mark> möglichst <mark className="core-help-keyword">nachhaltig zu gestalten</mark>, und wie wurden sie im Vergleich zu herkömmlichen Lernmechanismen verbessert?
        </p>
        <HelpCardDivider compact testId="help-intro-card-divider" />
        <ol className="mx-auto mt-3 grid w-fit max-w-full gap-2 text-left core-help-card-options text-core-text">
          <li className="grid grid-cols-[1.25rem_1fr] gap-2"><span className="text-core-secondary">1.</span><span>Active Recall <span className="text-core-warning">→</span> Smarter Recall</span></li>
          <li className="grid grid-cols-[1.25rem_1fr] gap-2"><span className="text-core-secondary">2.</span><span>Spaced Repetition <span className="text-core-warning">→</span> Content Repetition</span></li>
        </ol>
      </div>
    </HelpExampleCardStack>
  );
}

function RecallQuestion({ obscured }: { obscured: boolean }) {
  return (
    <p className="core-help-card-question text-core-text" data-testid="active-recall-question">
      <span className="text-core-warning">Welcher Teil des autonomen</span>{" "}
      <span
        className={obscured ? "core-obscured-recall-text" : undefined}
        data-recall-question-body="true"
        data-testid={obscured ? "active-recall-obscured-text" : undefined}
      >
        Nervensystems ist in erster Linie dafür verantwortlich, die Herzfrequenz in Ruhe zu
      </span>{" "}
      <span className="text-core-warning" data-testid="active-recall-question-suffix">senken?</span>
    </p>
  );
}

function ActiveRecallOriginalCard({ obscured }: { obscured: boolean }) {
  return (
    <HelpExampleCardStack
      activeRecallCard={obscured ? "blur" : "stack"}
    >
      <div className="w-full max-w-xl text-center">
        <RecallQuestion obscured={obscured} />
        <HelpCardDivider testId="active-recall-divider" />
        <p className="mt-4 core-help-card-question text-core-text" data-testid="active-recall-answer">Der Parasympathikus</p>
      </div>
    </HelpExampleCardStack>
  );
}

function ActiveRecallVariantCards() {
  return (
    <div className="relative mx-auto h-[27rem] w-full max-w-xl" data-active-recall-card="variants">
      {ACTIVE_RECALL_VARIANTS.map((variant) => (
        <div
          key={variant.id}
          className={`core-help-stack-card absolute grid min-h-60 place-items-center rounded-overlay border border-core-border-strong p-6 pr-12 text-center shadow-raised sm:p-8 sm:pr-12 ${variant.className}`}
          data-testid="active-recall-variant-card"
          data-help-variant-tone={variant.tone}
        >
          <span className="absolute right-2 top-2 grid size-10 place-items-center text-core-warning" data-testid="active-recall-variant-stars" aria-hidden="true">
            <Sparkles className="fill-[var(--core-warning)]" size={27} />
            <Sparkle className="absolute bottom-0 left-0 fill-[var(--core-warning)]" size={13} />
          </span>
          <div className="w-full">
            <p className="core-help-card-question text-core-text">{variant.question}</p>
            {variant.showAnswer ? (
              <>
                <HelpCardDivider />
                <p className="mt-4 w-full text-center core-help-card-question text-core-text">Der Parasympathikus</p>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActiveRecallVisual({ activeIndex }: { activeIndex: number }) {
  const showBlur = activeIndex === 1;
  const showVariants = activeIndex === 2;

  return (
    <div className="relative min-h-[27rem]" data-testid="active-recall-visual" data-active-step={activeIndex} aria-hidden="true">
      {showVariants ? <ActiveRecallVariantCards /> : <ActiveRecallOriginalCard obscured={showBlur} />}
    </div>
  );
}

/** The guided story Active Recall → Smarter Recall; its page header carries the heading. */
export function ActiveRecallStory() {
  const { activeIndex, containerRef, setActiveIndex } = useScrollStory(ACTIVE_RECALL_STEPS.length);

  return (
    <div ref={containerRef} className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(20rem,1.1fr)] xl:gap-12">
      <div className="min-w-0 self-start xl:sticky xl:top-6">
        <ActiveRecallVisual activeIndex={activeIndex} />
      </div>
      <ol className="min-w-0">
        {ACTIVE_RECALL_STEPS.map((step, index) => (
          <StoryStepCard key={step.id} testId={`active-recall-step-${step.selection}`} step={step} index={index} active={activeIndex === index} onFocus={() => setActiveIndex(index)} />
        ))}
      </ol>
    </div>
  );
}

function DifficultyMarker({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" aria-hidden="true">
      <path d="M 7 1 L 13 7 L 7 13 L 1 7 Z" fill="var(--core-surface-raised)" stroke={active ? "var(--core-warning)" : "currentColor"} strokeWidth="2" />
    </svg>
  );
}

function MemoryCurveGraphic({ selection, onSelectionChange }: { selection: ExplorerSelectionId; onSelectionChange: (selection: ExplorerSelectionId) => void }) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(DEFAULT_CHART_WIDTH);
  const [hoveredSelection, setHoveredSelection] = React.useState<ExplorerSelectionId | null>(null);
  const [focusedSelection, setFocusedSelection] = React.useState<ExplorerSelectionId | null>(null);
  const activeSelection = hoveredSelection ?? focusedSelection ?? selection;
  const activeReviewId = getActiveReviewId(activeSelection);
  const activeRatingId = getActiveRatingId(activeSelection);
  const activeParameterId = getActiveParameterId(activeSelection);
  const ratingsActive = activeSelection === "ratings";

  React.useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const measure = () => setWidth(Math.round(frame.clientWidth) || DEFAULT_CHART_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const { compact, height, axisX, plotRight, fullY, targetY, axisBottom, x, path } = memoryChartLayout(width);
  const firstX = x(MEMORY_REVIEWS[0].reviewX);
  const variantX = x(MEMORY_REVIEWS[1].reviewX);
  const labelY = targetY + 42;
  const arrowY = targetY + 88;
  const arrowGap = compact ? 4 : 10;
  const labelSize = compact ? 12 : 13;
  const firstLabel = compact ? { x: axisX + 10, anchor: "start" as const } : { x: firstX, anchor: "middle" as const };

  function hoverProps(nextSelection: ExplorerSelectionId) {
    return {
      onPointerEnter: () => setHoveredSelection(nextSelection),
      onPointerLeave: () => setHoveredSelection((current) => current === nextSelection ? null : current),
    };
  }

  function buttonProps(nextSelection: ExplorerSelectionId) {
    return {
      ...hoverProps(nextSelection),
      onFocus: () => {
        setHoveredSelection(null);
        setFocusedSelection(nextSelection);
      },
      onBlur: () => setFocusedSelection((current) => current === nextSelection ? null : current),
      onClick: () => onSelectionChange(nextSelection),
      "aria-pressed": selection === nextSelection,
    };
  }

  function parameterButton(parameterId: ParameterId) {
    const nextSelection = parameterSelectionId(parameterId);
    const active = activeSelection === nextSelection;
    return (
      <button type="button" className={`flex min-h-control items-center gap-2 rounded-control core-caption font-semibold underline-offset-4 transition-opacity hover:underline motion-reduce:transition-none ${active ? "text-core-text underline decoration-2 opacity-100" : "text-core-secondary opacity-60"}`} {...buttonProps(nextSelection)} data-testid={`memory-parameter-${parameterId}`}>
        {parameterId === "d" ? <DifficultyMarker active={active} /> : null}
        {PARAMETER_LABELS[parameterId]}
      </button>
    );
  }

  return (
    <div className="min-w-0" data-testid="spaced-repetition-visual" data-active-selection={selection}>
      <p id="memory-axis-description" className="sr-only">Die Y-Achse zeigt nur den Ausschnitt von 90 bis 100 Prozent Abrufwahrscheinlichkeit. Zwei diagonale Striche kennzeichnen die ausgelassene Achsenspanne darunter.</p>
      <div className="flex flex-wrap items-center justify-between gap-x-6">
        {parameterButton("r")}
        {parameterButton("d")}
      </div>
      <div ref={frameRef} className="relative" style={{ height }} data-testid="memory-curve">
        <svg className="absolute inset-0 size-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="memory-curve-title memory-curve-description" aria-describedby="memory-axis-description">
          <title id="memory-curve-title">Vereinfachte FSRS-Gedächtniskurve mit vier Antwortpfaden</title>
          <desc id="memory-curve-description">Nach der ersten Wiederholung führen Nochmal, Schwer, Gut und Leicht zu unterschiedlich langen Stabilitätsintervallen. Am Ende des längsten Beispielintervalls folgt eine Wiederholung mit einer nahen Kartenvariante.</desc>
          <defs>
            <clipPath id="memory-curve-plot">
              <rect x={axisX} y="0" width={plotRight - axisX} height={targetY + 8} />
            </clipPath>
          </defs>

          <line x1={axisX} y1={axisBottom} x2={plotRight} y2={axisBottom} stroke="var(--core-border-interactive)" strokeWidth="2" />
          <line x1={axisX} y1={fullY - 24} x2={axisX} y2={axisBottom} stroke="var(--core-border-interactive)" strokeWidth="2" />
          <text x={axisX - 8} y={fullY + 5} textAnchor="end" fill="var(--core-text-muted)" fontSize={labelSize}>100 %</text>
          <text x={axisX - 8} y={targetY + 5} textAnchor="end" fill="var(--core-text-muted)" fontSize={labelSize}>90 %</text>
          <g data-testid="memory-y-axis-break" aria-hidden="true">
            <path d={`M ${axisX - 8} ${axisBottom - 38} L ${axisX + 8} ${axisBottom - 48}`} stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
            <path d={`M ${axisX - 8} ${axisBottom - 25} L ${axisX + 8} ${axisBottom - 35}`} stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          <g data-testid="memory-visual-r" data-active={activeParameterId === "r" ? "true" : "false"}>
            <line x1={axisX} y1={targetY} x2={plotRight} y2={targetY} stroke="var(--core-text-muted)" strokeDasharray="7 7" strokeWidth={activeParameterId === "r" ? 3 : 1.5} opacity={activeParameterId === "r" ? 1 : 0.72} />
            <text x={firstLabel.x} y={labelY + 22} textAnchor={firstLabel.anchor} fill="var(--core-text-muted)" fontSize={labelSize}>Zielerinnerung R = 90 %</text>
            <g clipPath="url(#memory-curve-plot)">
              <path d={path(INITIAL_CURVE)} fill="none" stroke="var(--core-text)" strokeWidth={activeParameterId === "r" || activeReviewId === "first" ? 7 : 3.5} strokeLinecap="round" opacity={activeParameterId === "r" || activeReviewId === "first" ? 1 : 0.6} pointerEvents="none" className="transition-[stroke-width,opacity] duration-300 motion-reduce:transition-none" />
              {RATING_PATHS.map((rating) => {
                const emphasized = ratingsActive || activeParameterId === "r" || activeRatingId === rating.id || (activeReviewId === "variant" && rating.id === "easy");
                return <path key={`curve-${rating.id}`} d={path(rating.curve)} fill="none" stroke={rating.color} strokeWidth={emphasized ? 7 : 3.5} strokeLinecap="round" opacity={emphasized ? 1 : 0.6} pointerEvents="none" className="transition-[stroke-width,opacity] duration-300 motion-reduce:transition-none" />;
              })}
              <path d={path(VARIANT_CURVE)} fill="none" stroke="var(--core-info)" strokeWidth={activeParameterId === "r" || activeReviewId === "variant" ? 6 : 3.5} strokeLinecap="round" opacity={activeParameterId === "r" || activeReviewId === "variant" ? 1 : 0.6} />
            </g>
          </g>

          <g data-testid="memory-visual-s" data-active={activeParameterId === "s" ? "true" : "false"}>
            {RATING_PATHS.map((rating, index) => {
              const emphasized = ratingsActive || activeParameterId === "s" || activeRatingId === rating.id;
              const start = (index === 0 ? firstX : x(RATING_PATHS[index - 1].dueX)) + arrowGap;
              const end = x(rating.dueX) - arrowGap;
              return (
                <g key={`stability-${rating.id}`} data-testid={`memory-stability-arrow-${rating.id}`} data-arrowheads="right">
                  <g opacity={emphasized ? 1 : activeReviewId === "first" ? 0.78 : 0.6} className="transition-opacity duration-300 motion-reduce:transition-none">
                    <line x1={start} y1={arrowY} x2={end} y2={arrowY} stroke={rating.color} strokeWidth={emphasized ? 4 : 2} />
                    <path d={`M ${end - 9} ${arrowY - 6} L ${end} ${arrowY} L ${end - 9} ${arrowY + 6}`} fill="none" stroke={rating.color} strokeWidth={emphasized ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                  <text x={(start + end) / 2} y={arrowY + 26} textAnchor="middle" fill={rating.color} fontSize={labelSize} fontWeight="700">S{index + 1}</text>
                </g>
              );
            })}
          </g>

          <g data-testid="memory-visual-d" data-active={activeParameterId === "d" ? "true" : "false"}>
            {MEMORY_REVIEWS.map((review) => {
              const emphasized = activeParameterId === "d" || activeReviewId === review.id;
              const reviewX = x(review.reviewX);
              return (
                <g key={`difficulty-${review.id}`} opacity={emphasized ? 1 : 0.5} className="transition-opacity duration-300 motion-reduce:transition-none">
                  <line x1={reviewX} y1={fullY - 14} x2={reviewX} y2={targetY} stroke={review.color} strokeWidth={emphasized ? 3 : 2} strokeDasharray="6 7" />
                  <path d={`M ${reviewX} ${fullY - 28} L ${reviewX + 7} ${fullY - 21} L ${reviewX} ${fullY - 14} L ${reviewX - 7} ${fullY - 21} Z`} fill="var(--core-surface-raised)" stroke={activeParameterId === "d" ? "var(--core-warning)" : review.color} strokeWidth={emphasized ? 3 : 2} />
                  <text x={reviewX + 12} y={fullY - 16} fill={activeParameterId === "d" ? "var(--core-warning)" : review.color} fontSize={labelSize} fontWeight="700">D</text>
                </g>
              );
            })}
          </g>

          <path d={path(INITIAL_CURVE)} fill="none" stroke="transparent" strokeWidth="28" pointerEvents="stroke" {...hoverProps(reviewSelectionId("first"))} data-testid="memory-curve-initial" />
          {RATING_PATHS.map((rating) => <path key={`hit-${rating.id}`} d={path(rating.curve)} fill="none" stroke="transparent" strokeWidth="28" pointerEvents="stroke" {...hoverProps(ratingSelectionId(rating.id))} data-testid={`memory-rating-path-${rating.id}`} />)}
          <text x={firstLabel.x} y={labelY} textAnchor={firstLabel.anchor} fill="var(--core-text-secondary)" fontSize={labelSize} fontWeight="700">1. Wiederholung</text>
          {compact ? (
            <g textAnchor="end" fill="var(--core-text-secondary)" fontSize={labelSize} fontWeight="700">
              <text x={plotRight} y={labelY}>x. Wiederholung</text>
              <text x={plotRight} y={labelY + 20}>Variante</text>
            </g>
          ) : (
            <text x={Math.min(variantX, width - 96)} y={labelY} textAnchor="middle" fill="var(--core-text-secondary)" fontSize={labelSize} fontWeight="700">x. Wiederholung · Variante</text>
          )}
        </svg>

        {MEMORY_REVIEWS.map((review) => {
          const nextSelection = reviewSelectionId(review.id);
          const active = activeReviewId === review.id;
          return (
            <button
              key={review.id}
              type="button"
              className="absolute z-20 grid size-control place-items-center rounded-round border bg-core-raised core-body font-semibold transition-[transform,opacity] motion-reduce:transition-none"
              style={{
                left: x(review.reviewX),
                top: targetY,
                borderColor: review.color,
                borderWidth: active || activeParameterId === "d" ? 3 : 2,
                color: review.color,
                transform: `translate(-50%, -50%) scale(${active ? 1.12 : 1})`,
                opacity: activeReviewId === null || active ? 1 : 0.48,
              }}
              {...buttonProps(nextSelection)}
              aria-label={`${review.title} auswählen`}
              data-testid={`memory-review-point-${review.id}`}
            >
              {review.id === "variant" ? <span aria-hidden="true">…</span> : "1"}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        {parameterButton("s")}
      </div>
    </div>
  );
}

/** The guided story Spaced Repetition → Content Repetition; its page header carries the heading. */
export function SpacedRepetitionStory() {
  const { activeIndex, containerRef, setActiveIndex } = useScrollStory(SPACED_REPETITION_STEPS.length);
  const activeStep = SPACED_REPETITION_STEPS[activeIndex];

  function selectGraphPart(selection: ExplorerSelectionId) {
    const nextIndex = SPACED_REPETITION_STEPS.findIndex((step) => step.selection === selection);
    if (nextIndex < 0) return;
    setActiveIndex(nextIndex);
    const target = document.getElementById(SPACED_REPETITION_STEPS[nextIndex].id);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  }

  return (
    <div className="grid min-w-0 gap-8">
      <p className="max-w-3xl text-pretty core-body-large leading-7 text-core-secondary">Bei Spaced Repetition werden Fragen in gezielt gewählten Abständen wiederholt, um dem Vergessen entgegenzuwirken. CoRe nutzt dafür den FSRS-Algorithmus, der anhand verschiedener Parameter berechnet, wie wahrscheinlich du dich noch an eine Karte erinnerst.</p>
      <div ref={containerRef} className="grid min-w-0 gap-8 xl:grid-cols-[minmax(19rem,0.65fr)_minmax(38rem,1.35fr)] xl:gap-10">
        <div className="min-w-0 self-start xl:order-2 xl:sticky xl:top-6" data-testid="spaced-repetition-diagram-column">
          <MemoryCurveGraphic selection={activeStep.selection} onSelectionChange={selectGraphPart} />
        </div>
        <ol className="min-w-0 xl:order-1" data-testid="spaced-repetition-steps-column">
          {SPACED_REPETITION_STEPS.map((step, index) => (
            <StoryStepCard key={step.id} elementId={step.id} testId={`spaced-repetition-step-${step.selection}`} step={step} index={index} active={activeIndex === index} onFocus={() => setActiveIndex(index)} />
          ))}
        </ol>
      </div>
    </div>
  );
}
