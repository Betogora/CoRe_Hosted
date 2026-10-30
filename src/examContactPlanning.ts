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

/** Bounded deterministic whole-horizon search, with exact coverage and no assertion of optimality; `pause` is the caller's main-thread budget. */
export async function balanceExamContacts(columns: readonly ContactColumn[], baseline: Float64Array, minutes: readonly number[], introductionDays: readonly number[], total: number, pause: () => Promise<void>, signal?: AbortSignal): Promise<number[]> {
  if (!columns.length || !total) return columns.map(() => 0);
  const sum = minutes.reduce((a, b) => a + b, 0);
  const weights = minutes.map((value) => sum ? value / sum : 0), introductionWeight = introductionDays.reduce((a, day) => a + weights[day], 0);
  let values = introductionDays.map((day) => total * weights[day] / introductionWeight), best = integerCounts(values, total);
  // Cohort columns touch few days; skipping their zero entries leaves every sum unchanged.
  const touched = columns.map((column) => column.contacts.reduce<number[]>((days, value, i) => { if (value) days.push(i); return days; }, []));
  const loads = (counts: readonly number[]) => {
    const load = Float64Array.from(baseline);
    for (let j = 0; j < columns.length; j++) if (counts[j]) { const contacts = columns[j].contacts; for (const i of touched[j]) load[i] += contacts[i] * counts[j]; }
    return load;
  };
  const evaluate = (load: Float64Array, recall: number): number[] => {
    let peak = -Infinity, variation = 0;
    for (let i = 0; i < load.length; i++) peak = Math.max(peak, weights[i] > 0 ? load[i] / weights[i] : 0);
    for (let i = 1; i < introductionDays.length; i++) {
      const day = introductionDays[i], previous = introductionDays[i - 1];
      variation += Math.abs((weights[day] > 0 ? load[day] / weights[day] : 0) - (weights[previous] > 0 ? load[previous] / weights[previous] : 0));
    }
    return [peak, variation, -recall];
  };
  const recallOf = (counts: readonly number[]) => counts.reduce((value, count, i) => value + count * columns[i].recall, 0);
  const score = (counts: readonly number[]) => evaluate(loads(counts), recallOf(counts));
  const better = (left: readonly number[], right: readonly number[]) => { for (let i = 0; i < left.length; i++) { if (Math.abs(left[i] - right[i]) > 1e-7) return left[i] < right[i]; } return false; };
  let bestScore = score(best);
  // Smooth maxima generate candidates; the exact lexicographic objective selects the returned plan.
  for (let iteration = 0; iteration < 160; iteration++) {
    signal?.throwIfAborted(); await pause();
    const load = loads(values), normalized = Array.from(load, (value, i) => weights[i] > 0 ? value / weights[i] : 0), peak = Math.max(...normalized);
    const temperature = Math.max(1, peak * (.12 - .1 * iteration / 160));
    const probabilities = normalized.map((value, i) => weights[i] > 0 ? Math.exp((value - peak) / temperature) : 0), denominator = probabilities.reduce((a, b) => a + b, 0);
    const gradient = columns.map((column, j) => touched[j].reduce((value, i) => value + (weights[i] > 0 ? column.contacts[i] * probabilities[i] / denominator / weights[i] : 0), 0));
    const scale = Math.max(1, ...gradient), step = total / columns.length * 2 / Math.sqrt(iteration + 1);
    values = simplex(values.map((value, i) => value - step * gradient[i] / scale), total);
    const candidate = integerCounts(values, total), candidateScore = score(candidate);
    if (better(candidateScore, bestScore)) { best = candidate; bestScore = candidateScore; }
  }
  // Moving one card between two introduction days changes the load by two columns only, so swaps are scored incrementally.
  const stride = Math.max(1, Math.floor(columns.length / 24));
  let bestLoad = loads(best), bestRecall = recallOf(best);
  const trial = new Float64Array(bestLoad.length);
  for (let pass = 0; pass < 3; pass++) for (let from = 0; from < best.length; from += stride) {
    signal?.throwIfAborted(); await pause();
    if (!best[from]) continue;
    for (let to = 0; to < best.length; to += stride) {
      if (from === to) continue;
      const removed = columns[from].contacts, added = columns[to].contacts;
      for (let i = 0; i < trial.length; i++) trial[i] = bestLoad[i] - removed[i] + added[i];
      const candidateRecall = bestRecall - columns[from].recall + columns[to].recall, candidateScore = evaluate(trial, candidateRecall);
      if (better(candidateScore, bestScore)) {
        best = [...best]; best[from]--; best[to]++;
        bestLoad = Float64Array.from(trial); bestRecall = candidateRecall; bestScore = candidateScore;
        if (!best[from]) break;
      }
    }
  }
  return best;
}
