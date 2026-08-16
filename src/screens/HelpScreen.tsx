import React from "react";
import {
  Brain,
  Clock3,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  Sparkle,
  Sparkles,
} from "lucide-react";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";

type ReviewId = "first" | "variant";
type RatingId = "again" | "hard" | "good" | "easy";
type ParameterId = "r" | "s" | "d";
type HelpMethodId = "active-recall" | "spaced-repetition";
type ExplorerSelectionId = "overview" | "ratings" | `review-${ReviewId}` | `rating-${RatingId}` | `parameter-${ParameterId}`;

interface MemoryReview {
  id: ReviewId;
  title: string;
  color: string;
  reviewX: number;
}

interface RatingPath {
  id: RatingId;
  label: string;
  color: string;
  dueX: number;
  curvePath: string;
}

interface StoryStep<TSelection extends string> {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  selection: TSelection;
  note?: string;
}

interface MemoryTerm {
  term: string;
  description: string;
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
    title: "2 · Wiederholung mit Variante",
    color: "var(--core-info)",
    reviewX: 855,
  },
];

const RATING_PATHS: readonly RatingPath[] = [
  {
    id: "again",
    label: "Nochmal",
    color: "var(--core-danger)",
    dueX: 350,
    curvePath: "M 220 92 C 258 112, 318 186, 350 248",
  },
  {
    id: "hard",
    label: "Schwer",
    color: "var(--core-warning)",
    dueX: 500,
    curvePath: "M 220 92 C 292 102, 438 164, 500 248",
  },
  {
    id: "good",
    label: "Gut",
    color: "var(--core-success)",
    dueX: 680,
    curvePath: "M 220 92 C 328 96, 586 146, 680 248",
  },
  {
    id: "easy",
    label: "Leicht",
    color: "var(--core-info)",
    dueX: 855,
    curvePath: "M 220 92 C 364 94, 734 126, 855 248",
  },
];

const INITIAL_CURVE_PATH = "M 74 92 C 118 104, 176 168, 220 248";

const ACTIVE_RECALL_STEPS: readonly StoryStep<"stack" | "blur" | "variants">[] = [
  {
    id: "active-stack",
    eyebrow: "01 · Viele Karten",
    title: "Wiederholen kann überraschend passiv werden",
    text: "Karteikartenlernen wird schnell anstrengend, besonders wenn viele ähnliche Karten nacheinander kommen. Unser Gehirn versucht, möglichst energiesparend zu arbeiten.",
    selection: "stack",
  },
  {
    id: "active-blur",
    eyebrow: "02 · Vertraute Form",
    title: "Irgendwann erkennst du eher die Karte als den Inhalt",
    text: "Nach einiger Zeit bleiben leicht Position, Satzlänge oder einzelne Signalwörter hängen. Die Antwort fühlt sich bekannt an, obwohl die eigentliche Frage nicht mehr vollständig verstanden wird.",
    selection: "blur",
    note: "Je vertrauter die Kartenform wird, desto schwächer wird der aktive Abruf des Inhalts.",
  },
  {
    id: "active-variants",
    eyebrow: "03 · Smarter Recall",
    title: "CoRe verändert die Frage, nicht das Wissen",
    text: "Wie ein Tutor formuliert CoRe dieselbe Wissenseinheit nach ausreichender Reife neu. Die Varianten fragen denselben Inhalt anders ab, ohne neue Fakten einzuführen.",
    selection: "variants",
    note: "So wird sichergestellt, dass du den Inhalt jedes Mal erneut aktiv abrufst – Smarter Recall.",
  },
];

const ACTIVE_RECALL_STACK_LAYERS = [
  { id: "warning", className: "bg-core-warning-soft", transform: "translate(28px, -20px) rotate(3deg)" },
  { id: "success", className: "bg-core-success-soft", transform: "translate(-20px, -8px) rotate(-2.5deg)" },
] as const;

const INTRO_CARD_STACK_LAYERS = [
  { id: "back", transform: "translateY(-32px) scale(0.92)" },
  { id: "middle", transform: "translateY(-16px) scale(0.96)" },
] as const;

const OBSCURED_RECALL_PIXELS = Array.from({ length: 14 }, (_, index) => index);
const OBSCURED_RECALL_PIXEL_TONES = ["opacity-25", "opacity-40", "opacity-55"] as const;

const ACTIVE_RECALL_VARIANTS = [
  {
    id: "resting-heart-rate",
    question: "Wenn die Herzfrequenz des Körpers im Ruhezustand sinkt, welcher Teil des autonomen Nervensystems ist daran hauptsächlich beteiligt?",
    className: "left-[4%] right-[12%] top-4 z-10 -rotate-2 bg-core-warning-soft",
    showAnswer: false,
  },
  {
    id: "autonomic-section",
    question: "Die Senkung der Herzfrequenz unter Ruhebedingungen wird vor allem durch welchen Abschnitt des autonomen Nervensystems vermittelt?",
    className: "left-[12%] right-[4%] top-44 z-20 rotate-2 bg-core-info-soft",
    showAnswer: true,
  },
] as const;

const SPACED_REPETITION_STEPS: readonly StoryStep<ExplorerSelectionId>[] = [
  {
    id: "spaced-first-review",
    eyebrow: "01 · Erste Wiederholung",
    title: "Die erste Wiederholung aktualisiert den Gedächtniszustand",
    text: "Die Originalkarte erreicht im Beispiel 90 Prozent Abrufwahrscheinlichkeit. Nach deiner Antwort schätzt FSRS Stabilität S und Schwierigkeit D neu.",
    selection: "review-first",
  },
  {
    id: "spaced-ratings",
    eyebrow: "02 · Bewertung",
    title: "Deine Antwort bestimmt das nächste Intervall",
    text: "„Nochmal“, „Schwer“, „Gut“ und „Leicht“ führen gemeinsam betrachtet zu zunehmend längeren Intervallen. Je sicherer der Abruf, desto später wird die Karte erneut fällig.",
    selection: "ratings",
  },
  {
    id: "spaced-variant",
    eyebrow: "03 · Ausreichende Stabilität",
    title: "Erst dann kommt eine Variante als neuer Punkt hinzu",
    text: "Sobald die Wissenseinheit ausreichend stabil ist, kann CoRe denselben Inhalt mit einer neuen Frageform prüfen. Der Variantenpunkt ist ein Beispiel und keine garantierte Reviewnummer.",
    selection: "review-variant",
  },
  {
    id: "spaced-d",
    eyebrow: "04 · D",
    title: "D beschreibt die dauerhafte Schwierigkeit",
    text: "Schwierige Inhalte bauen Stabilität langsamer auf. Die Rauten markieren D an den Wiederholungspunkten; D ist keine zweite Prozentkurve.",
    selection: "parameter-d",
  },
  {
    id: "spaced-r",
    eyebrow: "05 · R",
    title: "R ist deine aktuelle Abrufwahrscheinlichkeit",
    text: "Nach einem erfolgreichen Review liegt R wieder nahe 100 Prozent und fällt anschließend mit der Zeit. Die gestrichelte Linie zeigt die Zielerinnerung von 90 Prozent.",
    selection: "parameter-r",
  },
  {
    id: "spaced-s",
    eyebrow: "06 · S",
    title: "S beschreibt, wie lange die Erinnerung hält",
    text: "Stabilität ist die Zeit, in der R von 100 auf 90 Prozent fällt. Die vier Pfeile zeigen qualitativ, wie deine Antwort das nächste Intervall beeinflusst.",
    selection: "parameter-s",
  },
];

const SCHEDULING_STEPS = [
  {
    label: "Gedächtniszustand aktualisieren",
    text: "Nach deiner Bewertung werden Stabilität S und Schwierigkeit D neu geschätzt.",
  },
  {
    label: "Vergessen vorhersagen",
    text: "Zwischen Reviews bleiben S und D unverändert, während R mit der Zeit fällt.",
  },
  {
    label: "Nächsten Termin setzen",
    text: "FSRS wählt den Zeitpunkt, an dem R voraussichtlich die gewünschte Zielerinnerung erreicht.",
  },
] as const;

const MEMORY_TERMS: readonly MemoryTerm[] = [
  { term: "R · Abrufwahrscheinlichkeit", description: "Wie wahrscheinlich du den Inhalt jetzt korrekt erinnern kannst." },
  { term: "S · Stabilität", description: "Wie lange R braucht, um von 100 auf 90 Prozent zu fallen." },
  { term: "D · Schwierigkeit", description: "Wie schwer sich diese Erinnerung dauerhaft festigen lässt." },
  { term: "Zielerinnerung", description: "Die gewünschte Abrufwahrscheinlichkeit am nächsten Termin." },
  { term: "Intervall", description: "Der zeitliche Abstand bis zur nächsten Wiederholung." },
  { term: "Original und Variante", description: "Verschiedene Fragen zur gleichen Wissenseinheit." },
];

const PARAMETER_POSITIONS: Record<Exclude<ParameterId, "r">, { left: string; top: string }> = {
  d: { left: "52%", top: "1%" },
  s: { left: "52%", top: "80%" },
};

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
    const updateActiveStep = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const steps = Array.from(container.querySelectorAll<HTMLElement>("[data-story-step]"));
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
    <li id={elementId} className="flex min-w-0 min-h-[58svh] items-center py-8 xl:min-h-[68svh]" data-story-step={index} data-testid={testId}>
      <article
        className={`min-w-0 w-full border-l-4 py-4 pl-5 transition-[border-color,opacity,transform] duration-300 motion-reduce:transition-none ${active ? "translate-x-0 border-core-action opacity-100" : "translate-x-2 border-core-border opacity-70"}`}
        tabIndex={0}
        onFocus={onFocus}
        aria-current={active ? "step" : undefined}
      >
        <p className="core-caption font-semibold uppercase tracking-wide text-core-action">{step.eyebrow}</p>
        <h3 className="core-heading-2 mt-3 font-semibold text-core-text">{step.title}</h3>
        <p className="mt-4 core-body-large leading-7 text-core-secondary">{step.text}</p>
        {step.note ? <p className="mt-4 core-caption leading-5 text-core-secondary">{step.note}</p> : null}
      </article>
    </li>
  );
}

function IntroCardStack() {
  return (
    <div
      className="relative mx-auto h-[25rem] w-full max-w-lg"
      role="img"
      aria-label="Karteikartenstapel mit der Frage, welche Grundsätze CoRe für nachhaltiges Lernen nutzt. Active Recall wird zu Smarter Recall und Spaced Repetition zu Content Repetition weiterentwickelt."
      data-testid="help-intro-card-stack"
    >
      {INTRO_CARD_STACK_LAYERS.map((layer) => (
        <div
          key={layer.id}
          className="absolute inset-x-4 top-12 h-[19rem] origin-center rounded-[26px] border border-[var(--core-border)] bg-core-info-soft shadow-sm sm:inset-x-8"
          style={{ transform: layer.transform }}
          aria-hidden="true"
          data-testid="help-intro-card-layer"
        />
      ))}
      <div
        className="absolute inset-x-4 top-12 grid h-[19rem] place-items-center rounded-[26px] border border-[var(--core-border)] bg-core-info-soft p-6 shadow-lg sm:inset-x-8 sm:p-8"
        data-testid="help-intro-card-front"
      >
        <div className="max-w-md">
          <p className="core-body-large font-medium leading-7 text-core-text">
            Welche Grundsätze nutzt <mark className="core-help-keyword">CoRe</mark>, um das Lernen möglichst <mark className="core-help-keyword">nachhaltig</mark> zu gestalten, und wie wurden sie im Vergleich zu <mark className="core-help-keyword">herkömmlichen Lernmechanismen</mark> verbessert?
          </p>
          <ol className="mt-6 grid gap-3 border-t border-[var(--core-border)] pt-5 core-body font-medium text-core-text">
            <li className="grid grid-cols-[1.5rem_1fr] gap-2"><span className="text-core-secondary">1.</span><span>Active Recall <span className="text-core-warning">→</span> Smarter Recall</span></li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2"><span className="text-core-secondary">2.</span><span>Spaced Repetition <span className="text-core-warning">→</span> Content Repetition</span></li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function IntroSection() {
  const [activeMethod, setActiveMethod] = React.useState<HelpMethodId | null>(null);

  function methodLinkClass(method: HelpMethodId, borderClass: string) {
    const active = activeMethod === method;
    return `group block border-t ${borderClass} pt-4 transition-[border-width,color] motion-reduce:transition-none ${active ? "border-t-4" : "border-t-2"}`;
  }

  return (
    <section className="grid min-w-0 min-h-[72svh] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]" aria-labelledby="help-intro-heading">
      <div className="max-w-2xl">
        <p className="core-control-label uppercase tracking-wide text-core-action">Lernen, das wirklich bleibt</p>
        <h2 id="help-intro-heading" className="core-heading-1 mt-4 font-semibold text-core-text">Wir wollen Lernen verbessern.</h2>
        <p className="mt-6 core-body-large leading-8 text-core-secondary">
          CoRe hilft dir, Wissen nicht nur für den nächsten Test, sondern langfristig abrufbar zu machen. Dafür verbinden wir zwei etablierte Methoden und entwickeln sie weiter.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <a
            href="#active-recall-heading"
            className={methodLinkClass("active-recall", "border-core-success")}
            onClick={() => setActiveMethod("active-recall")}
            aria-current={activeMethod === "active-recall" ? "location" : undefined}
          >
            <span className={`core-caption uppercase tracking-wide transition-[font-weight,color] motion-reduce:transition-none ${activeMethod === "active-recall" ? "font-bold text-core-text" : "font-semibold text-core-secondary"}`}>Active Recall</span>
            <span className={`mt-2 block core-body text-core-text transition-[font-weight] motion-reduce:transition-none ${activeMethod === "active-recall" ? "font-bold" : "font-semibold"}`}>Wissen aktiv aus dem Gedächtnis holen.</span>
          </a>
          <a
            href="#spaced-repetition-heading"
            className={methodLinkClass("spaced-repetition", "border-core-info")}
            onClick={() => setActiveMethod("spaced-repetition")}
            aria-current={activeMethod === "spaced-repetition" ? "location" : undefined}
          >
            <span className={`core-caption uppercase tracking-wide transition-[font-weight,color] motion-reduce:transition-none ${activeMethod === "spaced-repetition" ? "font-bold text-core-text" : "font-semibold text-core-secondary"}`}>Spaced Repetition</span>
            <span className={`mt-2 block core-body text-core-text transition-[font-weight] motion-reduce:transition-none ${activeMethod === "spaced-repetition" ? "font-bold" : "font-semibold"}`}>Zum passenden Zeitpunkt wiederholen.</span>
          </a>
        </div>
      </div>
      <IntroCardStack />
    </section>
  );
}

function RecallQuestion({ obscured }: { obscured: boolean }) {
  return (
    <p className="core-heading-3 font-medium leading-8 text-core-text">
      <span className="text-core-warning">Welcher Teil des autonomen</span>{" "}
      {obscured ? (
        <span className="mx-2 inline-flex items-center gap-1 align-middle" data-testid="active-recall-obscured-text">
          {OBSCURED_RECALL_PIXELS.map((pixel) => (
            <span key={pixel} className={`size-1.5 rounded-[1px] bg-[var(--core-text)] ${OBSCURED_RECALL_PIXEL_TONES[pixel % OBSCURED_RECALL_PIXEL_TONES.length]}`} />
          ))}
        </span>
      ) : (
        <>Nervensystems ist in erster Linie dafür verantwortlich, die Herzfrequenz in Ruhe zu </>
      )}
      <span className="text-core-warning">senken?</span>
    </p>
  );
}

function ActiveRecallOriginalCard({ obscured }: { obscured: boolean }) {
  return (
    <div className="relative h-[27rem]" data-active-recall-card={obscured ? "blur" : "stack"}>
      {ACTIVE_RECALL_STACK_LAYERS.map((layer) => (
        <div
          key={layer.id}
          className={`absolute inset-x-[8%] top-20 h-64 rounded-[24px] border border-[var(--core-border-interactive)] shadow-md ${layer.className}`}
          style={{ transform: layer.transform }}
        />
      ))}
      <div className="absolute inset-x-[8%] top-20 grid h-64 place-items-center rounded-[24px] border border-[var(--core-border-interactive)] bg-core-info-soft p-6 text-center shadow-lg sm:p-8">
        <div className="max-w-xl">
          <RecallQuestion obscured={obscured} />
          <div className="mx-auto mt-6 h-px w-4/5 bg-[var(--core-border-interactive)]" />
          <p className="mt-5 core-heading-3 font-medium text-core-text">Der Parasympathikus</p>
        </div>
      </div>
    </div>
  );
}

function ActiveRecallVariantCards() {
  return (
    <div className="relative h-[27rem]" data-active-recall-card="variants">
      {ACTIVE_RECALL_VARIANTS.map((variant) => (
        <div
          key={variant.id}
          className={`absolute grid min-h-52 place-items-center rounded-[24px] border border-[var(--core-border-interactive)] p-6 pr-12 text-center shadow-lg ${variant.className}`}
          data-testid="active-recall-variant-card"
        >
          <span className="absolute right-2 top-2 grid size-10 place-items-center text-core-warning" data-testid="active-recall-variant-stars" aria-hidden="true">
            <Sparkles className="fill-[var(--core-warning)]" size={27} />
            <Sparkle className="absolute bottom-0 left-0 fill-[var(--core-warning)]" size={13} />
          </span>
          <div className="w-full">
            <p className="core-body-large font-semibold leading-7 text-core-text">{variant.question}</p>
            {variant.showAnswer ? (
              <>
                <div className="mx-auto mt-5 h-px w-4/5 bg-[var(--core-border-interactive)]" />
                <p className="mt-4 w-full text-center core-body-large font-semibold text-core-text">Der Parasympathikus</p>
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

function ActiveRecallStory() {
  const { activeIndex, containerRef, setActiveIndex } = useScrollStory(ACTIVE_RECALL_STEPS.length);

  return (
    <section className="grid min-w-0 gap-8" aria-labelledby="active-recall-heading">
      <div className="max-w-3xl">
        <p className="core-control-label uppercase tracking-wide text-core-action">Methode 1</p>
        <h2 id="active-recall-heading" className="core-heading-1 mt-3 scroll-mt-6 font-semibold text-core-text">Active Recall</h2>
      </div>
      <div ref={containerRef} className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] xl:gap-12">
        <div className="min-w-0 self-start xl:sticky xl:top-6">
          <ActiveRecallVisual activeIndex={activeIndex} />
        </div>
        <ol className="min-w-0">
          {ACTIVE_RECALL_STEPS.map((step, index) => (
            <StoryStepCard key={step.id} testId={`active-recall-step-${step.selection}`} step={step} index={index} active={activeIndex === index} onFocus={() => setActiveIndex(index)} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function MemoryCurveGraphic({ selection, onSelectionChange }: { selection: ExplorerSelectionId; onSelectionChange: (selection: ExplorerSelectionId) => void }) {
  const [hoveredSelection, setHoveredSelection] = React.useState<ExplorerSelectionId | null>(null);
  const [focusedSelection, setFocusedSelection] = React.useState<ExplorerSelectionId | null>(null);
  const activeSelection = hoveredSelection ?? focusedSelection ?? selection;
  const activeReviewId = getActiveReviewId(activeSelection);
  const activeRatingId = getActiveRatingId(activeSelection);
  const activeParameterId = getActiveParameterId(activeSelection);
  const ratingsActive = activeSelection === "ratings";
  const overview = activeSelection === "overview";

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

  return (
    <div className="min-w-0 overflow-hidden" data-testid="spaced-repetition-visual" data-active-selection={selection}>
      <p id="memory-axis-description" className="sr-only">Die Y-Achse zeigt nur den Ausschnitt von 90 bis 100 Prozent Abrufwahrscheinlichkeit. Zwei diagonale Striche kennzeichnen die ausgelassene Achsenspanne darunter.</p>
      <div className="overflow-x-auto pb-2 focus:outline-none" tabIndex={0} aria-label="Lernkurve horizontal erkunden" aria-describedby="memory-axis-description">
        <div className="relative aspect-[960/540] min-w-[42rem] xl:min-w-0" data-testid="memory-curve">
          <svg className="absolute inset-0 size-full" viewBox="0 0 960 540" role="img" aria-labelledby="memory-curve-title memory-curve-description">
            <title id="memory-curve-title">Vereinfachte FSRS-Gedächtniskurve mit vier Antwortpfaden</title>
            <desc id="memory-curve-description">Nach der ersten Wiederholung führen Nochmal, Schwer, Gut und Leicht zu unterschiedlich langen Stabilitätsintervallen. Am Ende des längsten Beispielintervalls folgt eine Wiederholung mit einer nahen Kartenvariante.</desc>

            <line x1="72" y1="420" x2="928" y2="420" stroke="var(--core-border-interactive)" strokeWidth="2" />
            <line x1="72" y1="52" x2="72" y2="420" stroke="var(--core-border-interactive)" strokeWidth="2" />
            <text x="500" y="508" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">Zeit und nächstes Intervall</text>
            <text x="22" y="198" transform="rotate(-90 22 198)" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">R · Abrufwahrscheinlichkeit</text>
            <text x="57" y="98" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">100 %</text>
            <text x="57" y="253" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">90 %</text>
            <text x="86" y="408" fill="var(--core-text-muted)" fontSize="13">Ausschnitt 90–100 %</text>

            <g data-testid="memory-y-axis-break" aria-hidden="true">
              <path d="M 64 382 L 80 372" stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 64 395 L 80 385" stroke="var(--core-text)" strokeWidth="2.5" strokeLinecap="round" />
            </g>

            <g data-testid="memory-visual-r" data-active={activeParameterId === "r" ? "true" : "false"}>
              <line x1="72" y1="248" x2="928" y2="248" stroke="var(--core-text-muted)" strokeDasharray="7 7" strokeWidth={activeParameterId === "r" ? 3 : 1.5} opacity={activeParameterId === "r" || overview ? 1 : 0.72} />
              <text x="920" y="235" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">Zielerinnerung R = 90 %</text>
              <path d={INITIAL_CURVE_PATH} fill="none" stroke="var(--core-text)" strokeWidth={activeParameterId === "r" || activeReviewId === "first" || overview ? 7 : 3.5} strokeLinecap="round" opacity={activeParameterId === "r" || activeReviewId === "first" || overview ? 1 : 0.28} pointerEvents="none" className="transition-[stroke-width,opacity] duration-300 motion-reduce:transition-none" />
              {RATING_PATHS.map((rating) => {
                const emphasized = ratingsActive || activeParameterId === "r" || activeRatingId === rating.id || (activeReviewId === "variant" && rating.id === "easy");
                return <path key={`curve-${rating.id}`} d={rating.curvePath} fill="none" stroke={rating.color} strokeWidth={emphasized ? 7 : overview ? 4.5 : 3.5} strokeLinecap="round" opacity={emphasized ? 1 : overview ? 0.72 : 0.22} pointerEvents="none" className="transition-[stroke-width,opacity] duration-300 motion-reduce:transition-none" />;
              })}
              <path d="M 855 92 C 888 98, 918 112, 946 138" fill="none" stroke="var(--core-info)" strokeWidth={activeParameterId === "r" || activeReviewId === "variant" ? 6 : 3.5} strokeLinecap="round" opacity={activeParameterId === "r" || activeReviewId === "variant" || overview ? 1 : 0.35} />
            </g>

            <g data-testid="memory-visual-s" data-active={activeParameterId === "s" ? "true" : "false"}>
              {RATING_PATHS.map((rating, index) => {
                const emphasized = ratingsActive || activeParameterId === "s" || activeRatingId === rating.id;
                const start = index === 0 ? 235 : RATING_PATHS[index - 1].dueX + 10;
                const end = rating.dueX - 10;
                const arrowY = 292;
                return (
                  <g key={`stability-${rating.id}`} opacity={emphasized ? 1 : overview || activeReviewId === "first" ? 0.78 : 0.32} className="transition-opacity duration-300 motion-reduce:transition-none">
                    <line x1={start} y1={arrowY} x2={end} y2={arrowY} stroke={rating.color} strokeWidth={emphasized ? 4 : 2} />
                    <path d={`M ${start + 9} ${arrowY - 6} L ${start} ${arrowY} L ${start + 9} ${arrowY + 6}`} fill="none" stroke={rating.color} strokeWidth={emphasized ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
                    <path d={`M ${end - 9} ${arrowY - 6} L ${end} ${arrowY} L ${end - 9} ${arrowY + 6}`} fill="none" stroke={rating.color} strokeWidth={emphasized ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                );
              })}
            </g>

            <g data-testid="memory-visual-d" data-active={activeParameterId === "d" ? "true" : "false"}>
              {MEMORY_REVIEWS.map((review) => {
                const emphasized = activeParameterId === "d" || activeReviewId === review.id;
                return (
                  <g key={`difficulty-${review.id}`} opacity={emphasized || overview ? 1 : 0.24} className="transition-opacity duration-300 motion-reduce:transition-none">
                    <line x1={review.reviewX} y1="78" x2={review.reviewX} y2="248" stroke={review.color} strokeWidth={emphasized ? 3 : 2} strokeDasharray="6 7" />
                    <path d={`M ${review.reviewX} 64 L ${review.reviewX + 7} 71 L ${review.reviewX} 78 L ${review.reviewX - 7} 71 Z`} fill="var(--core-surface-raised)" stroke={activeParameterId === "d" ? "var(--core-warning)" : review.color} strokeWidth={emphasized ? 3 : 2} />
                  </g>
                );
              })}
            </g>

            <path d={INITIAL_CURVE_PATH} fill="none" stroke="transparent" strokeWidth="28" pointerEvents="stroke" {...hoverProps(reviewSelectionId("first"))} data-testid="memory-curve-initial" />
            {RATING_PATHS.map((rating) => <path key={`hit-${rating.id}`} d={rating.curvePath} fill="none" stroke="transparent" strokeWidth="28" pointerEvents="stroke" {...hoverProps(ratingSelectionId(rating.id))} data-testid={`memory-rating-path-${rating.id}`} />)}
            <text x="220" y="210" textAnchor="middle" fill="var(--core-text-secondary)" fontSize="13" fontWeight="700">1. Wiederholung</text>
            <text x="855" y="210" textAnchor="middle" fill="var(--core-text-secondary)" fontSize="13" fontWeight="700">2. Wiederholung · Variante</text>
          </svg>

          {(["s", "d"] as const).map((parameterId) => {
            const nextSelection = parameterSelectionId(parameterId);
            const active = activeSelection === nextSelection;
            const label = parameterId === "s" ? "S · Stabilität" : "D · Schwierigkeit";
            return (
              <button key={parameterId} type="button" className={`absolute z-20 flex min-h-11 -translate-x-1/2 items-center px-2 core-caption font-semibold underline-offset-4 transition-opacity hover:underline motion-reduce:transition-none ${active ? "text-core-text underline decoration-2 opacity-100" : "text-core-secondary opacity-60"}`} style={PARAMETER_POSITIONS[parameterId]} {...buttonProps(nextSelection)} data-testid={`memory-parameter-${parameterId}`}>{label}</button>
            );
          })}

          {MEMORY_REVIEWS.map((review) => {
            const nextSelection = reviewSelectionId(review.id);
            const active = activeReviewId === review.id;
            return (
              <button
                key={review.id}
                type="button"
                className="absolute z-20 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 bg-[var(--core-surface-raised)] core-body font-semibold shadow-sm transition-[transform,opacity] hover:scale-110 motion-reduce:transition-none"
                style={{
                  left: `${(review.reviewX / 960) * 100}%`,
                  top: `${(248 / 540) * 100}%`,
                  borderColor: review.color,
                  borderWidth: active || activeParameterId === "d" ? 3 : 2,
                  color: review.color,
                  transform: `translate(-50%, -50%) scale(${active ? 1.12 : 1})`,
                  opacity: activeReviewId === null || active || overview ? 1 : 0.48,
                }}
                {...buttonProps(nextSelection)}
                aria-label={`${review.title} auswählen`}
                data-testid={`memory-review-point-${review.id}`}
              >
                {review.id === "variant" ? <Sparkles size={19} aria-hidden="true" /> : "1"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpacedRepetitionStory() {
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
    <section className="grid min-w-0 gap-8" aria-labelledby="spaced-repetition-heading">
      <div className="max-w-3xl">
        <p className="core-control-label uppercase tracking-wide text-core-action">Methode 2</p>
        <h2 id="spaced-repetition-heading" className="core-heading-1 mt-3 scroll-mt-6 font-semibold text-core-text">Spaced Repetition findet den passenden Zeitpunkt</h2>
        <p className="mt-4 core-body-large leading-7 text-core-secondary">Scrolle durch die Schritte. Das Diagramm bleibt stehen und hebt jeweils den Teil hervor, der gerade erklärt wird.</p>
      </div>
      <div ref={containerRef} className="grid min-w-0 gap-8 xl:grid-cols-[minmax(38rem,1.35fr)_minmax(19rem,0.65fr)] xl:gap-10">
        <div className="min-w-0 self-start xl:sticky xl:top-6">
          <MemoryCurveGraphic selection={activeStep.selection} onSelectionChange={selectGraphPart} />
        </div>
        <ol className="min-w-0">
          {SPACED_REPETITION_STEPS.map((step, index) => (
            <StoryStepCard key={step.id} elementId={step.id} testId={`spaced-repetition-step-${step.selection}`} step={step} index={index} active={activeIndex === index} onFocus={() => setActiveIndex(index)} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function ReferenceSection() {
  return (
    <section className="grid min-w-0 gap-8" aria-labelledby="reference-heading">
      <div>
        <p className="core-control-label uppercase tracking-wide text-core-action">Zum Nachlesen</p>
        <h2 id="reference-heading" className="core-heading-1 mt-3 font-semibold text-core-text">Das Wichtigste auf einen Blick</h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Clock3} />
            <h3 className="core-heading-2 font-semibold text-core-text">So arbeitet ein Spaced-Repetition-Scheduler</h3>
          </div>
          <ol className="mt-5 border-t border-core-border">
            {SCHEDULING_STEPS.map((step, index) => (
              <li key={step.label} className="grid gap-2 border-b border-core-border py-4 sm:grid-cols-[2.5rem_1fr]">
                <span className="core-caption font-semibold tabular-nums text-core-action">0{index + 1}</span>
                <div>
                  <p className="core-body font-semibold text-core-text">{step.label}</p>
                  <p className="mt-1 core-caption leading-5 text-core-secondary">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={ShieldCheck} className="bg-core-warning-soft text-core-text" />
            <h3 className="core-heading-2 font-semibold text-core-text">Transparenz zum aktuellen Scheduler</h3>
          </div>
          <p className="mt-5 core-body leading-6 text-core-secondary">
            CoRe verwendet echtes FSRS-6 mit den offiziellen 21 Standardparametern. Es berücksichtigt alle Reviews einschließlich mehrerer Abrufe am selben Tag. Die persönliche Optimierung der Parameter aus deiner eigenen Reviewhistorie ist noch nicht aktiviert.
          </p>
          <p className="mt-3 core-body leading-6 text-core-secondary">
            Neue Karten bleiben zunächst in der Lernphase. Standardmäßig bedeutet „Gut“ einen zweiten Kontakt nach 15 Minuten. Eine höhere Zielerinnerung bedeutet kürzere Intervalle und mehr Reviews pro Tag.
          </p>
        </SoftPanel>
      </div>

      <dl className="grid border-t border-core-border md:grid-cols-2 xl:grid-cols-3">
        {MEMORY_TERMS.map((memoryTerm) => (
          <div key={memoryTerm.term} className="border-b border-core-border py-5 md:pr-8">
            <dt className="core-body-large font-semibold text-core-text">{memoryTerm.term}</dt>
            <dd className="mt-2 core-body leading-6 text-core-secondary">{memoryTerm.description}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]" aria-label="Sichere Varianten und weiterführende Informationen">
        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={RotateCcw} className="bg-core-danger-soft text-core-text" />
            <h3 className="core-heading-2 font-semibold text-core-text">Was bei Varianten geschützt bleibt</h3>
          </div>
          <ul className="mt-4 grid gap-3 core-body leading-6 text-core-secondary">
            <li>• Die Variante prüft dieselbe Wissenseinheit und führt keine neuen Fakten ein.</li>
            <li>• Genau eine Originalkarte bleibt als Vertrauensanker erhalten.</li>
            <li>• Stabilität, Intervall, Abrufwahrscheinlichkeit und Fehlerverlauf bestimmen gemeinsam, ob eine Karte „bereit für Varianten“ ist.</li>
            <li>• Nach einem Fehler nutzt CoRe wieder das Original oder eine einfachere Variante.</li>
            <li>• Der Variantenpunkt im Diagramm ist keine garantierte Produktionsschwelle und keine garantierte Reviewnummer.</li>
          </ul>
        </SoftPanel>

        <div className="border-y border-core-border py-6">
          <div className="flex items-center gap-3">
            <Brain className="text-core-action" size={24} aria-hidden="true" />
            <h3 className="core-heading-2 font-semibold text-core-text">Mehr über FSRS</h3>
          </div>
          <p className="mt-4 core-body leading-6 text-core-secondary">Die offizielle Einführung erklärt das vollständige FSRS-Modell, seine 21 Modellparameter und die Zielerinnerung.</p>
          <a className="core-action-secondary mt-5 w-fit" href="https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS" target="_blank" rel="noreferrer noopener">
            ABC of FSRS öffnen
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function HelpScreen() {
  return (
    <div className="grid min-w-0 gap-24 pb-16">
      <PageHeader eyebrow="Hilfe" title="Wie CoRe dein Lernen stärkt" />
      <IntroSection />
      <ActiveRecallStory />
      <SpacedRepetitionStory />
      <ReferenceSection />
    </div>
  );
}
