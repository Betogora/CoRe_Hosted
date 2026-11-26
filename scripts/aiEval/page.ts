import { OPENROUTER_MODEL } from "../../server/aiRoute.ts";
import { appendToSection, escapeHtml, renderMarkdown } from "../docsSite.ts";
import { LEDGER_FILE, REQUEST_TYPES, bestRun, holdoutFor, latestCalibration, seriesFor, type EvalLedger, type EvalRun, type EvalSeriesEntry, type RequestType } from "./ledger.ts";

const DECISIONS = { baseline: "Baseline", accepted: "übernommen", provisional: "vorläufig", rejected: "verworfen", holdout: "Rückhalt" } as const;
const number = (value: number) => value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = (share: number) => `${number(share * 100)} %`;
const interval = (run: EvalRun) => `${percent(run.main)} (${number(run.low * 100)}–${number(run.high * 100)})`;
const points = (share: number) => `${share > 0 ? "+" : share < 0 ? "−" : "±"}${number(Math.abs(share) * 100)} Pkt.`;
const usd = (value: number) => `${value.toLocaleString("de-DE", { maximumSignificantDigits: 2 })} USD`;
const seconds = (milliseconds: number) => `${number(milliseconds / 1000)} s`;
const critical = (type: RequestType, run: EvalRun) => type.critical.map((id) => `${id} ${percent(run.criteria[id])}`).join(" · ") || "–";
const code = (value: string) => `<code>${escapeHtml(value)}</code>`;
const table = (label: string, head: string[], rows: string[][]) => `<div class="docs-table-scroll" tabindex="0" role="region" aria-label="${label}"><table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows.map(([first, ...cells]) => `<tr><th scope="row">${first}</th>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

function standing(type: RequestType, best: EvalRun | null) {
  if (!best) return "Noch kein Lauf";
  return best.promptVersion === type.promptVersion && best.model === OPENROUTER_MODEL ? "Gemessen" : "Prompt im Code nicht gemessen";
}

const traps = (run: EvalRun) => run.traps.answers ? `${run.traps.errors} Fehler in ${run.traps.answers}` : "–";
const noise = (run: EvalRun) => {
  const shares = Object.values(run.judge.noise);
  return shares.length ? `Rauschen bis ${percent(Math.max(...shares))}` : "ohne Doppelurteile";
};

export function bestTable(ledger: EvalLedger) {
  const rows = REQUEST_TYPES.map((type) => {
    const best = bestRun(ledger, type.id);
    const held = best && holdoutFor(ledger, best);
    const calibration = latestCalibration(ledger, type.id);
    const measured = best ? [code(best.promptVersion), interval(best), held ? interval(held) : "–", critical(type, best), traps(best), usd(best.costUsd), seconds(best.latencyP90Ms), best.date] : ["–", "–", "–", "–", "–", "–", "–", "–"];
    const judge = calibration ? `${percent(calibration.agreement)} · ${calibration.entries} Einträge · ${calibration.falsePasses} falsch bestanden` : best ? `nicht kalibriert · ${noise(best)}` : "nicht kalibriert";
    return [type.label, code(type.promptVersion), standing(type, best), ...measured.slice(0, 3), type.target === null ? "–" : percent(type.target), ...measured.slice(3), judge];
  });
  const head = ["Anfragetyp", "Im Code", "Stand", "Bester Prompt", "Hauptwert (95 %-Intervall)", "Rückhalt", "Ziel", "Kritisch", "Fallen", "Kosten je Antwort", "Latenz p90", "Lauf vom", "Richter"];
  return `<div class="docs-eval">${table("Bestand je Anfragetyp", head, rows)}</div><p class="docs-source">Modell im Code: ${code(OPENROUTER_MODEL)}. „Im Code“ liest die Versionskonstante des Vertragsmoduls beim Erzeugen.</p>`;
}

export function progressPlot(type: RequestType, series: EvalSeriesEntry[]) {
  const left = 48, right = 84, top = 28, bottom = 40, height = 260;
  const plotWidth = Math.max(640 - left - right, series.length * 44);
  const lowest = Math.min(...series.map(({ run }) => run.low), type.target ?? 1) * 100;
  const step = lowest < 50 ? 20 : lowest < 80 ? 10 : 5;
  const min = Math.max(0, Math.floor((lowest - 1) / step) * step);
  const px = (value: number) => Math.round(value * 10) / 10;
  const column = plotWidth / series.length;
  const x = (index: number) => px(left + column * (index + 0.5));
  const y = (share: number, offset = 0) => px(top + (height - top - bottom) * (100 - share * 100) / (100 - min) + offset);
  const ticks = Array.from({ length: (100 - min) / step + 1 }, (_, index) => min + index * step);
  const grid = ticks.map((tick) => `<line class="grid" x1="${left}" x2="${left + plotWidth}" y1="${y(tick / 100)}" y2="${y(tick / 100)}"/><text x="${left - 8}" y="${y(tick / 100, 4)}" text-anchor="end">${tick} %</text>`).join("");
  const target = type.target === null ? "" : `<line class="target" x1="${left}" x2="${left + plotWidth}" y1="${y(type.target)}" y2="${y(type.target)}"/><text x="${left + plotWidth + 8}" y="${y(type.target, 4)}">Ziel ${percent(type.target)}</text>`;
  let path = "";
  let last = 0;
  let standing = series[0].run;
  series.forEach(({ run, confirmed }, index) => {
    const best = run.decision !== "rejected" ? run : run.confirmation ? confirmed : null;
    if (!best) return;
    path += path ? `H${x(index)}V${y(best.main)}` : `M${x(index)} ${y(best.main)}`;
    last = index;
    standing = best;
  });
  const marks = series.map(({ number: runNumber, run }, index) => {
    const title = `Lauf ${runNumber} · ${run.promptVersion} · ${interval(run)} · ${DECISIONS[run.decision]}`;
    return `<g data-decision="${run.decision}"><title>${escapeHtml(title)}</title><rect x="${px(left + column * index)}" y="${top}" width="${px(column)}" height="${height - top - bottom}" fill="transparent"/><line class="interval" x1="${x(index)}" x2="${x(index)}" y1="${y(run.high)}" y2="${y(run.low)}"/><circle cx="${x(index)}" cy="${y(run.main)}" r="5"/></g><text x="${x(index)}" y="${height - bottom + 18}" text-anchor="middle">${runNumber}</text>`;
  }).join("");
  const value = `<text class="value" x="${x(last)}" y="${y(standing.high, -8)}" text-anchor="middle">${percent(standing.main)}</text>`;
  const label = `Verlauf des Hauptwerts: ${type.label}`;
  return `<div class="docs-table-scroll" tabindex="0" role="region" aria-label="${label}"><svg class="docs-eval-plot" role="img" aria-label="${label}" width="${left + plotWidth + right}" height="${height}" viewBox="0 0 ${left + plotWidth + right} ${height}">${grid}${target}<path class="best" d="${path}H${x(series.length - 1)}"/>${marks}${value}<text x="${left - 8}" y="${height - bottom + 18}" text-anchor="end">Lauf</text></svg></div>`;
}

const LEGEND = `<ul class="docs-eval-legend"><li><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5"/></svg>Baseline oder übernommen</li><li><svg width="12" height="12" aria-hidden="true"><g data-decision="rejected"><circle cx="6" cy="6" r="5"/></g></svg>verworfen</li><li><svg width="24" height="12" aria-hidden="true"><path class="best" d="M0 6H24"/></svg>Bestand</li><li><svg width="24" height="12" aria-hidden="true"><line class="target" x1="0" x2="24" y1="6" y2="6"/></svg>Ziel</li><li><svg width="12" height="12" aria-hidden="true"><line class="interval" x1="6" x2="6" y1="0" y2="12"/></svg>95 %-Intervall</li></ul>`;

/** Eine Baseline mit anderer Fallzahl beginnt einen neuen Fallsatz; ältere Läufe sind damit nicht vergleichbar. */
function fallsatzStarts(series: EvalSeriesEntry[]) {
  let start = series[0].run;
  return series.map(({ run }) => {
    if (run.decision === "baseline" && run.cases !== start.cases) start = run;
    return start;
  });
}

function runsTable(type: RequestType, series: EvalSeriesEntry[]) {
  const starts = fallsatzStarts(series);
  const rows = series.map(({ number: runNumber, run, reference }, index) => [
    String(runNumber), run.date, code(run.promptVersion), `<span class="docs-eval-change">${escapeHtml(run.change)}</span>`, interval(run), points(run.main - starts[index].main),
    ...(run.comparison && reference ? [points(run.main - reference.main), `±${number(run.comparison.noise * 100)} Pkt.${run.comparison.better === undefined ? "" : ` · besser in ${number(run.comparison.better * 100)} %`}`, `+${run.comparison.gained} / −${run.comparison.lost}`] : ["–", "–", "–"]),
    critical(type, run), usd(run.costUsd), seconds(run.latencyP90Ms), `${run.cases} × ${run.repetitions}`, DECISIONS[run.decision],
  ]);
  const head = ["Lauf", "Datum", "Prompt", "Änderung", "Hauptwert (95 %-Intervall)", "Δ seit Start des Fallsatzes", "Δ zum Bestand", "Rauschen", "Fälle gewonnen / verloren", "Kritisch", "Kosten je Antwort", "Latenz p90", "Fälle × Läufe", "Entscheidung"];
  return table(`Läufe: ${type.label}`, head, rows);
}

export function progressSections(ledger: EvalLedger) {
  const sections = REQUEST_TYPES.flatMap((type) => {
    const series = seriesFor(ledger, type.id);
    return series.length ? [`<h3 id="ai-eval--verlauf-${type.id}" class="core-heading-3" tabindex="-1">${type.label}</h3><div class="docs-eval">${progressPlot(type, series)}${LEGEND}${runsTable(type, series)}</div>`] : [];
  });
  return sections.join("") || "<p>Noch kein Lauf im Ledger.</p>";
}

export function balanceSection(ledger: EvalLedger) {
  if (!ledger.runs.length) return "<p>Noch kein Lauf im Ledger.</p>";
  const sum = (runs: readonly EvalRun[], value: (run: EvalRun) => number) => runs.reduce((total, run) => total + value(run), 0);
  const cachedShare = (runs: readonly EvalRun[]) => {
    const all = sum(runs, (run) => run.judge.entries + run.judge.cached);
    return all ? percent(sum(runs, (run) => run.judge.cached) / all) : "–";
  };
  const rows = REQUEST_TYPES.flatMap((type) => {
    const runs = ledger.runs.filter((run) => run.requestType === type.id);
    if (!runs.length) return [];
    const series = seriesFor(ledger, type.id);
    const baseline = series.filter(({ run }) => run.decision === "baseline").at(-1)?.run;
    const best = bestRun(ledger, type.id);
    return [[type.label, String(runs.length), String(sum(runs, (run) => run.cases * run.repetitions)), usd(sum(runs, (run) => run.costTotalUsd)),
      String(sum(runs, (run) => run.judge.entries)), cachedShare(runs), baseline ? percent(baseline.main) : "–", best ? percent(best.main) : "–", type.target === null ? "–" : percent(type.target)]];
  });
  const total = ["alle", String(ledger.runs.length), String(sum(ledger.runs, (run) => run.cases * run.repetitions)), usd(sum(ledger.runs, (run) => run.costTotalUsd)),
    String(sum(ledger.runs, (run) => run.judge.entries)), cachedShare(ledger.runs), "–", "–", "–"];
  const head = ["Anfragetyp", "Läufe", "Antworten", "Kosten gesamt", "Neu bewertet", "Aus dem Urteilscache", "Baseline", "Bester Stand", "Ziel"];
  return `<div class="docs-eval">${table("Bilanz je Anfragetyp", head, [...rows, total])}</div>`;
}

export function aiEvalDocument(markdown: string, ledger: EvalLedger) {
  const withBest = appendToSection(renderMarkdown(markdown, "ai-eval.md"), "ai-eval--bestand", bestTable(ledger), "ai-eval.md");
  const withProgress = appendToSection(withBest, "ai-eval--verlauf", progressSections(ledger), "ai-eval.md");
  const html = appendToSection(withProgress, "ai-eval--bilanz", balanceSection(ledger), "ai-eval.md");
  return `<article id="ai-eval--document" class="docs-document"><p class="docs-source">Verbindliche Quellen: <a href="ai-eval.md">ai-eval.md</a> und <a href="../${LEDGER_FILE}">${LEDGER_FILE}</a></p>${html}</article>`;
}
