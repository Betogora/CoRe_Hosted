import React from "react";
import { RotateCcw, Snail } from "lucide-react";
import type { CardEditorServices } from "../../appScreenProps.ts";
import { reviewStateFromCardStudy } from "../../coreModel.ts";
import type { Card, MaturityBand, ReviewEvent } from "../../coreTypes.ts";
import { getLearningDayKey } from "../../learningDay.ts";
import { calculateRetrievability, getDurabilityDays, getMaturityBand } from "../../scheduler.ts";
import { ActionButton } from "../../ui/actionUi.tsx";
import { ActionDialog } from "../../ui/coreUi.tsx";
import { useSuccessToast } from "../../ui/feedbackUi.tsx";
import { Steps } from "../../ui/Steps.tsx";
import { CardEditorSection as Section } from "./CardEditorSection.tsx";
import { RetrievabilityChart } from "./RetrievabilityChart.tsx";
import { createRetrievabilityCurve } from "./retrievabilityCurve.ts";
import { useOnline } from "./useOnline.ts";

const BANDS: Array<{ value: MaturityBand; label: string }> = [
  { value: "new", label: "Neu" },
  { value: "learning", label: "Lernen" },
  { value: "young", label: "Jung" },
  { value: "mature", label: "Reif" },
];

const RATINGS: Record<string, { label: string; tone: string }> = {
  again: { label: "Nochmal", tone: "var(--core-rating-again-border)" },
  hard: { label: "Schwer", tone: "var(--core-rating-hard-border)" },
  good: { label: "Gut", tone: "var(--core-rating-good-border)" },
  easy: { label: "Leicht", tone: "var(--core-rating-easy-border)" },
};

const MANUAL_KINDS: Record<string, string> = {
  manual_reschedule: "Neu geplant",
  manual_reset: "Lernstand zurückgesetzt",
  manual_leech: "Lernbremse geändert",
  manual_restore: "Rückgängig",
  manual_bury: "Zurückgestellt",
  manual_unbury: "Zurückstellen aufgehoben",
};

const STATES: Record<Card["study"]["state"], string> = { new: "Neu", learning: "Lernen", review: "Wiederholung", relearning: "Erneut lernen" };

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatDateTime = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDays = (days: number) => days < 1 ? "unter 1 Tag" : `${Math.round(days).toLocaleString("de-DE")} ${Math.round(days) === 1 ? "Tag" : "Tage"}`;

function eventLabel(event: ReviewEvent) {
  if (event.rating !== "manual") return RATINGS[event.rating]?.label ?? event.rating;
  return MANUAL_KINDS[String(event.flags?.kind ?? "")] ?? "Manuell";
}

/** Local answers appear at once; online the cloud adds the rest (W19). */
function useReviewEvents(cardId: string, services: CardEditorServices, online: boolean, version: number) {
  const [events, setEvents] = React.useState<ReviewEvent[] | null>(null);
  const [cloudState, setCloudState] = React.useState<"idle" | "loading" | "done" | "failed">("idle");
  React.useEffect(() => {
    const controller = new AbortController();
    let merged = new Map<string, ReviewEvent>();
    const publish = () => setEvents([...merged.values()].sort((left, right) => left.answeredAt.localeCompare(right.answeredAt) || left.id.localeCompare(right.id)));
    void services.listReviewEvents(cardId).then((local) => {
      if (controller.signal.aborted) return;
      merged = new Map([...local.map((event) => [event.id, event] as const), ...merged]);
      publish();
    }).catch(() => setEvents((current) => current ?? []));
    const cloud = online ? services.cloud : null;
    if (cloud) {
      setCloudState("loading");
      void cloud.listCardReviewEvents(cardId, controller.signal).then((remote) => {
        if (controller.signal.aborted) return;
        for (const event of remote) merged.set(event.id, event);
        publish();
        setCloudState("done");
      }).catch(() => { if (!controller.signal.aborted) setCloudState("failed"); });
    } else setCloudState("idle");
    return () => controller.abort();
  }, [cardId, online, services, version]);
  return { events, cloudState };
}

export interface CardEditorStudyTabProps {
  card: Card;
  now: string;
  dayStartHour?: number;
  timeZone?: string;
  services: CardEditorServices;
}

/** Study state and FSRS-7 figures of the card, its review history and `Lernstand zurücksetzen …` (W18, W21). */
export function CardEditorStudyTab({ card, now, dayStartHour, timeZone, services }: CardEditorStudyTabProps) {
  const online = useOnline();
  const setSuccessToast = useSuccessToast();
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [error, setError] = React.useState("");
  const { events, cloudState } = useReviewEvents(card.id, services, online, card.studyRevision);
  const { study } = card;
  const memory = { state: study.state, stability: study.stability, stabilityFast: study.extra.stabilityFast, difficulty: study.difficulty };
  const band = getMaturityBand(memory);
  const retrievability = calculateRetrievability(reviewStateFromCardStudy(study), now);
  const dueKey = study.dueAt ? getLearningDayKey(study.dueAt, { dayStartHour, timeZone }) : null;
  const reviewed = study.reps > 0;
  const curve = React.useMemo(() => createRetrievabilityCurve(events ?? [], now), [events, now]);
  const figures: Array<{ label: string; value: string }> = [
    { label: "Fällig", value: card.status === "suspended" ? "Ausgesetzt" : !reviewed ? "Neu" : dueKey ? new Date(`${dueKey}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "–" },
    { label: "Zustand", value: STATES[study.state] },
    { label: "Letzte Wiederholung", value: study.lastReviewedAt ? formatDate(study.lastReviewedAt) : "–" },
    { label: "Intervall", value: reviewed ? formatDays(study.intervalDays) : "–" },
    { label: "Haltbarkeit", value: reviewed ? formatDays(getDurabilityDays(memory)) : "–" },
    { label: "Abrufwahrscheinlichkeit", value: reviewed ? `${Math.round(retrievability * 100)} %` : "–" },
    { label: "Schwierigkeit", value: reviewed ? `${study.difficulty.toLocaleString("de-DE", { maximumFractionDigits: 1 })} von 10` : "–" },
    { label: "Wiederholungen", value: String(study.reps) },
    { label: "Fehler", value: String(study.lapses) },
  ];

  async function reset() {
    setResetting(true);
    setError("");
    try {
      await services.resetCards([card.id]);
      setConfirmReset(false);
      setSuccessToast("Lernstand zurückgesetzt. Die Karte ist wieder neu.");
    } catch {
      setError("Der Lernstand konnte nicht zurückgesetzt werden.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="core-card-editor-sections" data-testid="card-study-tab">
      <div className="core-card-editor-column">
        <Section title="Lernstand" testId="card-study-state">
          <div data-testid="card-maturity-band">
            <Steps ariaLabel="Reifeband" items={BANDS} current={BANDS.findIndex((entry) => entry.value === band)} stretch className="core-card-editor-maturity" />
          </div>
          <dl className="core-card-editor-rows" data-testid="card-study-figures">
            {figures.map((figure) => (
              <div key={figure.label} className="core-card-editor-row">
                <dt>{figure.label}</dt>
                <dd className="font-semibold tabular-nums">{figure.value}</dd>
              </div>
            ))}
          </dl>
          {study.leechedAt ? (
            <p className="flex items-center gap-2 rounded-control bg-core-danger-soft px-3 py-2 core-body font-semibold text-core-text" data-testid="card-study-leech">
              <Snail size={18} className="text-core-danger-text" aria-hidden="true" />Lernbremse seit {formatDateTime(study.leechedAt)}
            </p>
          ) : null}
          <div>
            <ActionButton variant="secondary" icon={RotateCcw} disabled={!reviewed && !study.leechedAt} onClick={() => setConfirmReset(true)}>Lernstand zurücksetzen …</ActionButton>
          </div>
          {error ? <p className="core-status-error core-body" role="alert">{error}</p> : null}
        </Section>
        <Section title="Abrufverlauf" testId="card-review-curve">
          {events === null ? <p className="core-body text-core-muted" role="status">Wird geladen …</p> : curve.length ? (
            <RetrievabilityChart points={curve} targetPercent={study.extra.desiredRetention * 100} now={Date.parse(now)} />
          ) : <p className="core-body text-core-muted">Noch keine Bewertungen.</p>}
        </Section>
      </div>
      <Section title="Bewertungen" testId="card-review-history" aside={cloudState === "loading" ? <span className="core-body text-core-muted" role="status">Cloud wird geladen …</span> : cloudState === "failed" ? <span className="core-body text-core-muted" role="status">Nur lokale Bewertungen</span> : !online ? <span className="core-body text-core-muted">Offline: nur lokale Bewertungen</span> : null}>
        {events === null ? <p className="core-body text-core-muted" role="status">Wird geladen …</p> : events.length === 0 ? <p className="core-body text-core-muted">Noch keine Bewertungen.</p> : (
          <table className="w-full table-fixed border-collapse core-body" data-testid="card-review-list">
            <thead>
              <tr className="border-b border-core-border text-left text-core-muted">
                <th scope="col" className="w-1/2 py-2 font-medium">Zeitpunkt</th>
                <th scope="col" className="py-2 font-medium">Bewertung</th>
              </tr>
            </thead>
            <tbody>
              {[...events].reverse().map((event) => (
                <tr key={event.id} className="border-b border-core-border last:border-0">
                  <td className="truncate py-2 tabular-nums text-core-secondary">{formatDateTime(event.answeredAt)}</td>
                  <td className="truncate py-2 text-core-text">
                    {event.rating === "manual" ? null : <span aria-hidden="true" className="mr-2 inline-block size-2.5 rounded-round align-middle" style={{ background: RATINGS[event.rating]?.tone }} />}
                    <span className={event.rating === "manual" ? "text-core-muted" : ""}>{eventLabel(event)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <ActionDialog
        open={confirmReset}
        title="Lernstand zurücksetzen?"
        description="Die Karte wird danach wie eine neue Karte gelernt."
        confirmLabel="Zurücksetzen"
        cancelLabel="Abbrechen"
        destructive
        confirmLoading={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void reset()}
      />
    </div>
  );
}
