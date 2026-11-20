import React from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarCheck, ChevronRight, Clock3, Layers, RotateCcw } from "lucide-react";
import { appRouteToUrl, createViewRoute, type HelpTopic } from "../appNavigation.ts";
import { PageHeader } from "../ui/coreUi.tsx";
import { CardManagementTopic, ExamSessionTopic, PlanningTopic, RatingGuidePanel, VariantsTopic } from "./help/helpReference.tsx";
import { ActiveRecallStory, IntroCardStack, SpacedRepetitionStory } from "./help/helpStories.tsx";

export interface HelpScreenProps {
  /** Open topic; `null` shows the entry. */
  topic: HelpTopic | null;
  onSelectTopic: (topic: HelpTopic | null) => void;
}

const HELP_TOPIC_PAGES: Record<HelpTopic, { title: string; content: React.ComponentType }> = {
  "active-recall": { title: "Active Recall wird Smarter Recall", content: ActiveRecallStory },
  "spaced-repetition": { title: "Spaced Repetition wird Content Repetition", content: SpacedRepetitionStory },
  planung: { title: "So plant CoRe deine Wiederholungen", content: PlanningTopic },
  varianten: { title: "Was bei Varianten geschützt bleibt", content: VariantsTopic },
  pruefungssitzung: { title: "So läuft eine Prüfungssitzung", content: ExamSessionTopic },
  kartenverwaltung: { title: "So arbeitest du in der Kartenverwaltung", content: CardManagementTopic },
};

const REFERENCE_TOPICS: ReadonlyArray<{ topic: HelpTopic; icon: LucideIcon }> = [
  { topic: "planung", icon: Clock3 },
  { topic: "varianten", icon: RotateCcw },
  { topic: "pruefungssitzung", icon: CalendarCheck },
  { topic: "kartenverwaltung", icon: Layers },
];

const LEARNING_STEPS: ReadonlyArray<{ label: string; text: string; topic?: HelpTopic }> = [
  { label: "Aktiv abrufen", text: "Hol die Antwort aus dem Gedächtnis, bevor du sie aufdeckst.", topic: "active-recall" },
  { label: "Ehrlich bewerten", text: "Deine Antwort bestimmt das nächste Intervall: Je sicherer der Abruf, desto später wird die Karte erneut fällig." },
  { label: "Rechtzeitig wiederholen", text: "FSRS plant jede Karte so, dass du sie wiederholst, kurz bevor du sie vergessen würdest. Nach ausreichender Reife fragt CoRe denselben Inhalt mit neuen Varianten ab.", topic: "spaced-repetition" },
];

/** A real link to the topic, so it can be shared or opened in a new tab; a plain click stays in the app. */
function HelpTopicLink({ topic, onSelectTopic, className, children }: { topic: HelpTopic; onSelectTopic: HelpScreenProps["onSelectTopic"]; className: string; children: React.ReactNode }) {
  return (
    <a
      href={appRouteToUrl(createViewRoute("hilfe", { helpTopic: topic }))}
      className={className}
      data-help-topic-link={topic}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onSelectTopic(topic);
      }}
    >
      {children}
    </a>
  );
}

function HelpHome({ onSelectTopic }: Pick<HelpScreenProps, "onSelectTopic">) {
  return (
    <div className="grid min-w-0 gap-16">
      <section className="grid min-w-0 items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]" aria-labelledby="help-intro-heading">
        <div className="max-w-2xl">
          <h3 id="help-intro-heading" className="core-heading-2 text-core-text">So lernst du mit CoRe</h3>
          <p className="mt-4 core-body-large leading-relaxed text-core-secondary">
            CoRe hilft dir, Wissen nicht nur für den nächsten Test, sondern langfristig abrufbar zu machen. Dafür verbinden wir zwei etablierte Methoden und entwickeln sie weiter.
          </p>
          <ol className="mt-6 border-t border-core-border">
            {LEARNING_STEPS.map((step, index) => (
              <li key={step.label} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-core-border py-4">
                <span className="core-caption font-semibold leading-6 tabular-nums text-core-muted" aria-hidden="true">0{index + 1}</span>
                <div className="min-w-0">
                  <p className="core-body leading-6 text-core-secondary"><span className="font-semibold text-core-text">{step.label}.</span> {step.text}</p>
                  {step.topic ? (
                    <HelpTopicLink topic={step.topic} onSelectTopic={onSelectTopic} className="-ml-1 mt-1 inline-flex min-h-button items-center gap-1 rounded-control px-1 core-control-label font-semibold text-core-action underline-offset-4 hover:underline">
                      {HELP_TOPIC_PAGES[step.topic].title}
                      <ChevronRight size={15} className="shrink-0" aria-hidden="true" />
                    </HelpTopicLink>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="hidden min-w-0 lg:block">
          <IntroCardStack />
        </div>
      </section>

      <RatingGuidePanel />

      <nav className="min-w-0" aria-labelledby="help-topics-heading">
        <h3 id="help-topics-heading" className="core-heading-2 text-core-text">Nachschlagen</h3>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {REFERENCE_TOPICS.map(({ topic, icon: Icon }) => (
            <li key={topic} className="grid">
              <HelpTopicLink topic={topic} onSelectTopic={onSelectTopic} className="grid grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-3.5 rounded-control border border-core-border bg-core-surface px-5 py-6 text-left transition-colors hover:border-core-border-strong hover:bg-core-subtle">
                <Icon size={24} className="text-core-action" aria-hidden="true" />
                <span className="break-words core-heading-3 text-core-text">{HELP_TOPIC_PAGES[topic].title}</span>
              </HelpTopicLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Help: a short entry with what learners need right away, linking to the stories and reference topics as their own pages. */
export function HelpScreen({ topic, onSelectTopic }: HelpScreenProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const shownTopicRef = React.useRef(topic);
  const page = topic ? HELP_TOPIC_PAGES[topic] : null;
  const Content = page?.content;

  // A new page starts at its heading; back on the entry, focus returns to the link that opened the topic.
  React.useEffect(() => {
    const previousTopic = shownTopicRef.current;
    shownTopicRef.current = topic;
    const root = rootRef.current;
    if (previousTopic === topic || !root) return;
    const opener = previousTopic && !topic ? root.querySelector<HTMLElement>(`[data-help-topic-link="${previousTopic}"]`) : null;
    if (opener) {
      opener.focus({ preventScroll: true });
      opener.scrollIntoView({ block: "center" });
      return;
    }
    root.closest(".core-screen-region")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    root.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
  }, [topic]);

  return (
    <div ref={rootRef} className="grid min-w-0 gap-8 pb-16" data-help-topic={topic ?? "start"}>
      <PageHeader title={page?.title ?? "Hilfe"} back={topic ? { label: "Hilfe", onSelect: () => onSelectTopic(null) } : undefined} />
      {Content ? <Content /> : <HelpHome onSelectTopic={onSelectTopic} />}
    </div>
  );
}
