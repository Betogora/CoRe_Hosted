import { get_fuzz_range } from "ts-fsrs";
import type { EasyDayLevel, EasyDays, LearningItem } from "./coreTypes.ts";
import { getLearningDayKey, type LearningDayOptions } from "./learningDay.ts";

export const EASY_DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export const DEFAULT_EASY_DAYS: EasyDays = {
  monday: "normal",
  tuesday: "normal",
  wednesday: "normal",
  thursday: "normal",
  friday: "normal",
  saturday: "normal",
  sunday: "normal",
};

const easyDayLevels = new Set<EasyDayLevel>(["normal", "reduced", "minimum"]);
const easyDayWeights: Record<EasyDayLevel, number> = { normal: 1, reduced: 0.5, minimum: 0.0001 };

function isReviewBlocked(item: LearningItem): boolean {
  return item.status === "suspended"
    || String(item.status) === "buried"
    || item.meta?.suspended === true
    || item.meta?.buried === true;
}

export interface EasyDaysSchedulingContext extends LearningDayOptions {
  easyDays: EasyDays;
  dueCountsByDay: ReadonlyMap<string, number>;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeEasyDays(value: unknown): EasyDays {
  const source = objectRecord(value);
  const level = (key: keyof EasyDays): EasyDayLevel => (
    typeof source[key] === "string" && easyDayLevels.has(source[key] as EasyDayLevel)
      ? source[key] as EasyDayLevel
      : "normal"
  );
  return {
    monday: level("monday"),
    tuesday: level("tuesday"),
    wednesday: level("wednesday"),
    thursday: level("thursday"),
    friday: level("friday"),
    saturday: level("saturday"),
    sunday: level("sunday"),
  };
}

export function hasEasyDayDifferences(easyDays: EasyDays): boolean {
  return EASY_DAY_KEYS.some((key) => easyDays[key] !== easyDays.monday);
}

function easyDayKeyForLearningDay(dayKey: string): keyof EasyDays {
  const weekdayIndex = new Date(`${dayKey}T12:00:00.000Z`).getUTCDay();
  return EASY_DAY_KEYS[(weekdayIndex + 6) % 7];
}

function shiftDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function createEasyDaysDueCounts(
  items: Iterable<LearningItem>,
  now: string | number | Date,
  options: LearningDayOptions = {},
): Map<string, number> {
  const todayKey = getLearningDayKey(now, options);
  if (!todayKey) return new Map();
  const endKey = shiftDayKey(todayKey, 90);
  const counts = new Map<string, number>();
  const seenItemIds = new Set<string>();
  for (const item of items) {
    if (seenItemIds.has(item.id)) continue;
    seenItemIds.add(item.id);
    const state = item.learningItemState ?? item.reviewState;
    if (
      item.deletedAt
      || item.draftStatus === "draft"
      || item.status === "deleted"
      || state?.state === "new"
      || isReviewBlocked(item)
    ) continue;
    const dueKey = getLearningDayKey(state?.dueAt ?? Number.NaN, options);
    if (!dueKey || dueKey <= todayKey || dueKey > endKey) continue;
    counts.set(dueKey, (counts.get(dueKey) ?? 0) + 1);
  }
  return counts;
}

export function selectEasyDayInterval({
  rawIntervalDays,
  elapsedDays,
  maximumIntervalDays,
  now,
  context,
}: {
  rawIntervalDays: number;
  elapsedDays: number;
  maximumIntervalDays: number;
  now: string | number | Date;
  context?: EasyDaysSchedulingContext | null;
}): number {
  const rawInterval = Math.round(rawIntervalDays);
  if (!context || rawInterval < 3 || rawInterval > 90 || !hasEasyDayDifferences(context.easyDays)) return rawInterval;
  const range = get_fuzz_range(rawInterval, elapsedDays, maximumIntervalDays);
  const minimumCandidate = Math.max(3, range.min_ivl);
  const maximumCandidate = Math.min(90, range.max_ivl);
  if (minimumCandidate >= maximumCandidate) return rawInterval;
  const currentDayKey = getLearningDayKey(now, context);
  if (!currentDayKey) return rawInterval;

  let best: { interval: number; score: number; distance: number } | null = null;
  for (let interval = minimumCandidate; interval <= maximumCandidate; interval += 1) {
    const dueKey = shiftDayKey(currentDayKey, interval);
    const weight = easyDayWeights[context.easyDays[easyDayKeyForLearningDay(dueKey)]];
    const candidate = {
      interval,
      score: ((context.dueCountsByDay.get(dueKey) ?? 0) + 1) / weight,
      distance: Math.abs(interval - rawInterval),
    };
    if (
      !best
      || candidate.score < best.score
      || (candidate.score === best.score && candidate.distance < best.distance)
      || (candidate.score === best.score && candidate.distance === best.distance && candidate.interval < best.interval)
    ) best = candidate;
  }
  return best?.interval ?? rawInterval;
}
