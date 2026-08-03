import React from "react";
import {
  Brain,
  Clock3,
  ExternalLink,
  Gauge,
  Layers3,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { OrbIcon, PageHeader, SoftPanel } from "../ui/coreUi.tsx";

interface MemoryStep {
  id: number;
  title: string;
  shortLabel: string;
  summary: string;
  detail: string;
  color: string;
  surface: string;
  reviewX: number;
  curvePath: string;
  intervalLabel: string;
  cardLabel: string;
}

const MEMORY_STEPS: MemoryStep[] = [
  {
    id: 1,
    title: "Review 1 · Erste Erinnerung",
    shortLabel: "Die Gedächtnisspur entsteht",
    summary: "Die Originalkarte wird erfolgreich abgerufen. FSRS schätzt daraus den ersten Gedächtniszustand.",
    detail: "Direkt nach dem Review ist die Abrufwahrscheinlichkeit hoch. Mit der Zeit fällt sie wieder; die erste Stabilität bestimmt, wie schnell das geschieht.",
    color: "var(--core-info)",
    surface: "var(--core-info-surface)",
    reviewX: 210,
    curvePath: "M 74 82 C 116 92, 164 150, 210 238",
    intervalLabel: "kurzes Intervall",
    cardLabel: "Originalkarte",
  },
  {
    id: 2,
    title: "Review 2 · Stabilität wächst",
    shortLabel: "Das Intervall wird länger",
    summary: "Ein weiterer erfolgreicher Abruf erhöht die Stabilität. Die nächste Wiederholung darf später stattfinden.",
    detail: "Wie stark die Stabilität wächst, hängt bei FSRS unter anderem von Schwierigkeit, vergangener Zeit und Bewertung ab.",
    color: "var(--core-warning)",
    surface: "var(--core-warning-surface)",
    reviewX: 380,
    curvePath: "M 210 82 C 260 94, 324 154, 380 238",
    intervalLabel: "längeres Intervall",
    cardLabel: "Originalkarte",
  },
  {
    id: 3,
    title: "Review 3 · Robuster Abruf",
    shortLabel: "Die Erinnerung wird belastbarer",
    summary: "Wiederholte erfolgreiche Abrufe machen die Erinnerung robuster und vergrößern den Abstand erneut.",
    detail: "Eine schwierige Karte baut Stabilität langsamer auf. Eine gut erinnerte Karte kann dagegen zunehmend größere Abstände erhalten.",
    color: "var(--core-success)",
    surface: "var(--core-success-surface)",
    reviewX: 590,
    curvePath: "M 380 82 C 442 94, 526 150, 590 238",
    intervalLabel: "noch längeres Intervall",
    cardLabel: "Originalkarte",
  },
  {
    id: 4,
    title: "Review 4 · CoRe-Variante",
    shortLabel: "Gleiches Wissen, neue Fragestellung",
    summary: "Beispielhaft fragt CoRe dieselbe Wissenseinheit nun als nahe Variante statt in der ursprünglichen Form ab.",
    detail: "Die Variante darf keine neuen Fakten einführen. Das Original bleibt der Vertrauensanker; nach Fehlern fällt CoRe auf das Original oder eine einfachere Variante zurück.",
    color: "var(--core-danger)",
    surface: "var(--core-danger-surface)",
    reviewX: 822,
    curvePath: "M 590 82 C 662 96, 758 146, 822 238",
    intervalLabel: "großes Intervall",
    cardLabel: "Nahe Kartenvariante",
  },
];

const MEMORY_TERMS = [
  {
    icon: TrendingUp,
    term: "R · Abrufwahrscheinlichkeit",
    description: "Wie wahrscheinlich du den Inhalt jetzt korrekt erinnern kannst. R sinkt mit der Zeit.",
  },
  {
    icon: Brain,
    term: "S · Stabilität",
    description: "Wie lange eine Erinnerung hält. Je höher S ist, desto langsamer fällt R.",
  },
  {
    icon: Gauge,
    term: "D · Schwierigkeit",
    description: "Wie schwer sich die Erinnerung festigen lässt. Schwierige Inhalte bauen Stabilität langsamer auf.",
  },
  {
    icon: Target,
    term: "Zielerinnerung",
    description: "Die gewünschte Erinnerungswahrscheinlichkeit am nächsten Termin, im Beispiel 90 %.",
  },
  {
    icon: Clock3,
    term: "Intervall",
    description: "Der Abstand bis zum nächsten Review. Erfolgreiche Abrufe lassen ihn meistens wachsen.",
  },
  {
    icon: Layers3,
    term: "Original und Variante",
    description: "Zwei Fragestellungen zur gleichen Wissenseinheit. Die Variante verändert den Abrufreiz, nicht die Fakten.",
  },
] as const;

const RATING_EXPLANATIONS = [
  { label: "Nochmal", text: "Nicht erinnert: kurzfristig wiederholen und Stabilität deutlich senken." },
  { label: "Schwer", text: "Gerade noch erinnert: vorsichtiger Stabilitätszuwachs und kürzeres Intervall." },
  { label: "Gut", text: "Solide erinnert: normaler Stabilitätszuwachs und längeres Intervall." },
  { label: "Leicht", text: "Sehr sicher erinnert: stärkerer Stabilitätszuwachs und größtes Intervall." },
] as const;

function MemoryCurveExplorer() {
  const [selectedStepId, setSelectedStepId] = React.useState(1);
  const [hoveredStepId, setHoveredStepId] = React.useState<number | null>(null);
  const [focusedStepId, setFocusedStepId] = React.useState<number | null>(null);
  const activeStepId = hoveredStepId ?? focusedStepId ?? selectedStepId;
  const activeStep = MEMORY_STEPS[activeStepId - 1] ?? MEMORY_STEPS[0];

  return (
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
        <div
          className="overflow-x-auto pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)]"
          tabIndex={0}
          aria-label="Lernkurve horizontal erkunden"
          aria-describedby="memory-curve-disclaimer"
        >
          <div className="relative aspect-[900/430] min-w-[46rem]" data-testid="memory-curve">
            <svg
              className="absolute inset-0 size-full"
              viewBox="0 0 900 430"
              role="img"
              aria-labelledby="memory-curve-title memory-curve-description"
            >
              <title id="memory-curve-title">Vereinfachte FSRS-Gedächtniskurve mit vier Reviews</title>
              <desc id="memory-curve-description">Vier zunehmend längere Intervalle enden an der Zielerinnerung von 90 Prozent. Beim vierten Review zeigt CoRe beispielhaft eine Kartenvariante.</desc>

              <line x1="72" y1="330" x2="858" y2="330" stroke="var(--core-border-interactive)" strokeWidth="2" />
              <line x1="72" y1="52" x2="72" y2="330" stroke="var(--core-border-interactive)" strokeWidth="2" />
              <text x="465" y="376" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">Zeit und wachsende Intervalle</text>
              <text x="22" y="194" transform="rotate(-90 22 194)" textAnchor="middle" fill="var(--core-text-muted)" fontSize="16">Abrufwahrscheinlichkeit R</text>
              <text x="57" y="88" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">100 %</text>
              <text x="57" y="243" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">90 %</text>
              <line x1="72" y1="238" x2="858" y2="238" stroke="var(--core-text-muted)" strokeDasharray="7 7" strokeWidth="1.5" />
              <text x="850" y="226" textAnchor="end" fill="var(--core-text-muted)" fontSize="14">Zielerinnerung</text>

              {MEMORY_STEPS.map((step) => {
                const active = step.id === activeStepId;
                return (
                  <g key={step.id}>
                    <path
                      d={step.curvePath}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="24"
                      pointerEvents="stroke"
                      onPointerEnter={() => setHoveredStepId(step.id)}
                      onPointerLeave={() => setHoveredStepId(null)}
                      data-testid={`memory-curve-segment-${step.id}`}
                    />
                    <path
                      d={step.curvePath}
                      fill="none"
                      stroke={step.color}
                      strokeWidth={active ? 7 : 3.5}
                      strokeLinecap="round"
                      opacity={active ? 1 : 0.42}
                      pointerEvents="none"
                      className="transition-[stroke-width,opacity] motion-reduce:transition-none"
                    />
                    <line
                      x1={step.reviewX}
                      y1="238"
                      x2={step.reviewX}
                      y2="82"
                      stroke={step.color}
                      strokeWidth={active ? 3 : 2}
                      strokeDasharray="6 7"
                      opacity={active ? 0.95 : 0.45}
                      className="transition-opacity motion-reduce:transition-none"
                    />
                    <text x={step.reviewX} y="304" textAnchor="middle" fill="var(--core-text-muted)" fontSize="13">{step.intervalLabel}</text>
                  </g>
                );
              })}

              <path d="M 822 82 C 850 88, 870 104, 890 128" fill="none" stroke={MEMORY_STEPS[3].color} strokeWidth="3.5" strokeLinecap="round" opacity="0.58" />
            </svg>

            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div
                className="absolute top-[4%] max-w-56 -translate-x-1/2 rounded-xl border bg-[var(--core-surface-raised)] px-3 py-2 text-center shadow-[var(--core-shadow-soft)]"
                style={{ left: `${(activeStep.reviewX / 900) * 100}%`, borderColor: activeStep.color }}
              >
                <span className="core-caption font-semibold text-core-text">{activeStep.shortLabel}</span>
              </div>
            </div>

            {MEMORY_STEPS.map((step) => {
              const active = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  type="button"
                  className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 bg-[var(--core-surface-raised)] core-body font-semibold shadow-sm transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--core-focus)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                  style={{
                    left: `${(step.reviewX / 900) * 100}%`,
                    top: `${(238 / 430) * 100}%`,
                    borderColor: step.color,
                    color: step.color,
                    transform: `translate(-50%, -50%) scale(${active ? 1.12 : 1})`,
                  }}
                  onClick={() => setSelectedStepId(step.id)}
                  onPointerEnter={() => setHoveredStepId(step.id)}
                  onPointerLeave={() => setHoveredStepId(null)}
                  onFocus={() => setFocusedStepId(step.id)}
                  onBlur={() => setFocusedStepId(null)}
                  aria-label={`${step.title} auswählen`}
                  aria-pressed={selectedStepId === step.id}
                  aria-controls="memory-step-detail"
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
        id="memory-step-detail"
        className="rounded-2xl border-l-4 p-5"
        style={{ borderColor: activeStep.color, background: activeStep.surface }}
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="core-heading-3 font-semibold text-core-text">{activeStep.title}</h3>
          <span className="rounded-full border border-[var(--core-border)] bg-[var(--core-surface)] px-3 py-1 core-caption font-semibold text-core-secondary">{activeStep.cardLabel}</span>
        </div>
        <p className="mt-3 core-body-large font-semibold text-core-text">{activeStep.summary}</p>
        <p className="mt-2 core-body leading-6 text-[var(--core-text-secondary)]">{activeStep.detail}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Erklärung der vier Reviews">
        {MEMORY_STEPS.map((step) => (
          <article
            key={step.id}
            className={`rounded-2xl border p-4 transition-opacity motion-reduce:transition-none ${step.id === activeStepId ? "opacity-100 shadow-sm" : "opacity-70"}`}
            style={{ borderColor: step.color, background: step.surface }}
          >
            <p className="core-caption font-semibold uppercase tracking-wide text-core-secondary">Review {step.id}</p>
            <h3 className="mt-2 core-body-large font-semibold text-core-text">{step.shortLabel}</h3>
            <p className="mt-2 core-body leading-6 text-core-secondary">{step.summary}</p>
          </article>
        ))}
      </div>
    </section>
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
            Spaced Repetition zeigt dir Inhalte kurz bevor du sie voraussichtlich vergessen würdest. FSRS beschreibt dafür den Gedächtniszustand jeder Karte mit Abrufwahrscheinlichkeit, Stabilität und Schwierigkeit.
          </p>
        </SoftPanel>

        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Sparkles} className="bg-core-success-soft text-core-text" />
            <h2 className="core-heading-2 font-semibold text-core-text">CoRe verändert zusätzlich die Fragestellung</h2>
          </div>
          <p className="mt-4 core-body-large leading-7 text-core-secondary">
            Sobald eine Grundkarte stabil genug ist, kann CoRe dieselbe Wissenseinheit als nahe Variante abfragen. So lernst du den Inhalt statt nur Wortlaut oder Layout wiederzuerkennen.
          </p>
        </SoftPanel>
      </section>

      <div className="rounded-2xl border border-core-warning bg-core-warning-soft p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-core-text" size={22} aria-hidden="true" />
          <div>
            <h2 className="core-heading-3 font-semibold text-core-text">Transparenz zum aktuellen Scheduler</h2>
            <p className="mt-2 core-body leading-6 text-core-secondary">
              CoRe verwendet aktuell einen eigenen FSRS-ähnlichen Scheduler. Er übernimmt zentrale Begriffe und Prinzipien, ist aber keine unveränderte Implementierung von FSRS-6 und optimiert noch keine 21 persönlichen FSRS-Parameter aus deiner Historie.
            </p>
          </div>
        </div>
      </div>

      <MemoryCurveExplorer />

      <section className="grid gap-5" aria-labelledby="memory-terms-heading">
        <div>
          <p className="core-control-label uppercase tracking-wide text-core-action">Die wichtigsten Begriffe</p>
          <h2 id="memory-terms-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Der Gedächtniszustand verständlich erklärt</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MEMORY_TERMS.map(({ icon: Icon, term, description }) => (
            <SoftPanel key={term} className="p-5">
              <Icon size={22} className="text-core-action" aria-hidden="true" />
              <h3 className="mt-4 core-body-large font-semibold text-core-text">{term}</h3>
              <p className="mt-2 core-body leading-6 text-core-secondary">{description}</p>
            </SoftPanel>
          ))}
        </div>
      </section>

      <section className="grid gap-5" aria-labelledby="rating-heading">
        <div>
          <p className="core-control-label uppercase tracking-wide text-core-action">Deine Bewertung</p>
          <h2 id="rating-heading" className="core-heading-2 mt-2 font-semibold text-core-text">Vier Antworten steuern den Rhythmus</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {RATING_EXPLANATIONS.map((rating, index) => (
            <div key={rating.label} className="rounded-2xl border border-core-border bg-core-surface p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-core-subtle core-body font-semibold text-core-text">{index + 1}</span>
                <h3 className="core-body-large font-semibold text-core-text">{rating.label}</h3>
              </div>
              <p className="mt-3 core-body leading-6 text-core-secondary">{rating.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]" aria-label="Sichere Varianten und weiterführende Informationen">
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

        <SoftPanel className="p-6">
          <div className="flex items-center gap-3">
            <OrbIcon icon={Brain} />
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
        </SoftPanel>
      </section>
    </div>
  );
}
