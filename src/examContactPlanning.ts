import { createMainThreadBudget } from "./mainThreadBudget.ts";

/** Internal cohort projection, never a duration estimate. */
export interface ContactColumn { contacts: Float64Array; recall: number }

function integerCounts(values: readonly number[], total: number): number[] {
  const counts = values.map((value) => Math.floor(Math.max(0, value)));
  const order = values.map((value, index) => ({ index, fraction: value - counts[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const rest = total - counts.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < rest; i++) counts[order[i % order.length].index]++;
  return counts;
}
function simplex(values: readonly number[], total: number): number[] {
  const sorted = [...values].sort((a, b) => b - a); let sum = 0, threshold = 0;
  for (let i = 0; i < sorted.length; i++) { sum += sorted[i]; const next = (sum - total) / (i + 1); if (sorted[i] > next) threshold = next; }
  return values.map((value) => Math.max(0, value - threshold));
}

/** Bounded deterministic whole-horizon search, with exact coverage and no assertion of optimality. */
export async function balanceExamContacts(columns: readonly ContactColumn[], baseline: Float64Array, minutes: readonly number[], introductionDays: readonly number[], total: number, signal?: AbortSignal): Promise<number[]> {
  if (!columns.length || !total) return columns.map(() => 0);
  const pause = createMainThreadBudget(), sum = minutes.reduce((a, b) => a + b, 0);
  const weights = minutes.map((value) => sum ? value / sum : 0), introductionWeight = introductionDays.reduce((a, day) => a + weights[day], 0);
  let values = introductionDays.map((day) => total * weights[day] / introductionWeight), best = integerCounts(values, total);
  const loads = (counts: readonly number[]) => {
    const load = Float64Array.from(baseline);
    columns.forEach((column, j) => { if (counts[j]) column.contacts.forEach((value, i) => { load[i] += value * counts[j]; }); });
    return load;
  };
  const score = (counts: readonly number[]): number[] => {
    const load = loads(counts), normalized = Array.from(load, (value, i) => weights[i] > 0 ? value / weights[i] : 0);
    let variation = 0;
    for (let i = 1; i < introductionDays.length; i++) variation += Math.abs(normalized[introductionDays[i]] - normalized[introductionDays[i - 1]]);
    return [Math.max(...normalized), variation, -counts.reduce((value, count, i) => value + count * columns[i].recall, 0)];
  };
  const better = (left: readonly number[], right: readonly number[]) => { for (let i = 0; i < left.length; i++) { if (Math.abs(left[i] - right[i]) > 1e-7) return left[i] < right[i]; } return false; };
  let bestScore = score(best);
  // Smooth maxima generate candidates; the exact lexicographic objective selects the returned plan.
  for (let iteration = 0; iteration < 160; iteration++) {
    if (iteration % 8 === 0) { signal?.throwIfAborted(); await pause(); }
    const load = loads(values), normalized = Array.from(load, (value, i) => weights[i] > 0 ? value / weights[i] : 0), peak = Math.max(...normalized);
    const temperature = Math.max(1, peak * (.12 - .1 * iteration / 160));
    const probabilities = normalized.map((value, i) => weights[i] > 0 ? Math.exp((value - peak) / temperature) : 0), denominator = probabilities.reduce((a, b) => a + b, 0);
    const gradient = columns.map((column) => column.contacts.reduce((value, contact, i) => value + (weights[i] > 0 ? contact * probabilities[i] / denominator / weights[i] : 0), 0));
    const scale = Math.max(1, ...gradient), step = total / columns.length * 2 / Math.sqrt(iteration + 1);
    values = simplex(values.map((value, i) => value - step * gradient[i] / scale), total);
    const candidate = integerCounts(values, total), candidateScore = score(candidate);
    if (better(candidateScore, bestScore)) { best = candidate; bestScore = candidateScore; }
  }
  const stride = Math.max(1, Math.floor(columns.length / 24));
  for (let pass = 0; pass < 3; pass++) for (let from = 0; from < best.length; from += stride) {
    signal?.throwIfAborted(); await pause();
    if (!best[from]) continue;
    for (let to = 0; to < best.length; to += stride) {
      if (from === to) continue;
      const candidate = [...best]; candidate[from]--; candidate[to]++;
      const candidateScore = score(candidate);
      if (better(candidateScore, bestScore)) { best = candidate; bestScore = candidateScore; if (!best[from]) break; }
    }
  }
  return best;
}
