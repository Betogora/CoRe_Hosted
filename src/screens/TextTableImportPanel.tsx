import React from "react";
import { Database, FileSpreadsheet } from "lucide-react";
import type { CreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import type { ImportUiState } from "../importUiState.ts";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";

export type TextTableImportMode = "text" | "csv" | "spreadsheet";
type TextTableWorkflow = Pick<CreationWorkflow, "importPastedDeck">;
type TextTableImportReport = ReturnType<TextTableWorkflow["importPastedDeck"]>["report"];

export interface TextTableImportPanelProps {
  initialMode?: TextTableImportMode;
  workflow: TextTableWorkflow;
  onImported: (deck: Deck) => unknown;
  onCompleted?: (deck: Deck) => unknown;
}

export function TextTableImportPanel({ initialMode = "text", workflow, onImported, onCompleted = () => undefined }: TextTableImportPanelProps) {
  const mode = initialMode;
  const [deckName, setDeckName] = React.useState("Importierter Stapel");
  const [content, setContent] = React.useState("");
  const [report, setReport] = React.useState<TextTableImportReport | null>(null);
  const [uiState, setUiState] = React.useState<ImportUiState>({ status: "idle" });
  const [completedDeck, setCompletedDeck] = React.useState<Deck | null>(null);

  async function runImport(dryRun = false) {
    setUiState({ status: dryRun ? "analyzing" : "committing" });
    const result = workflow.importPastedDeck({ mode, deckName, content, dryRun });
    setReport(result.report);
    if (result.report.errors.length > 0) {
      setUiState({ status: "failed_terminal" });
      return;
    }
    if (dryRun) {
      setUiState({ status: "preview" });
      return;
    }
    if (!result.deck) {
      setUiState({ status: "failed_terminal" });
      return;
    }
    await Promise.resolve(onImported(result.deck));
    setCompletedDeck(result.deck);
    setUiState({ status: "succeeded" });
  }

  return (
    <SoftPanel className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <OrbIcon icon={FileSpreadsheet} className="bg-emerald-50 text-emerald-700" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Text / CSV / Excel</p>
          <h2 className="text-2xl font-semibold text-[#17214f]">Strukturierte Karten importieren</h2>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Stapelname
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!content.trim() || uiState.status === "analyzing" || uiState.status === "committing"} onClick={() => void runImport(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
              <Database size={17} aria-hidden="true" />
              Import prüfen
            </button>
            <button type="button" disabled={!content.trim() || uiState.status !== "preview" || Boolean(report?.errors.length)} onClick={() => void runImport(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <Database size={17} aria-hidden="true" />
              Import übernehmen
            </button>
          </div>
          {report ? (
            <div className={`text-sm ${report.errors.length ? "core-status-error" : "core-status-success"}`} role={report.errors.length ? "alert" : "status"}>
              <p className="font-semibold text-[#17214f]">
                {report.createdLearningItems} Karten · {report.createdVariants} Varianten · {report.duplicates.length} Dubletten
              </p>
              {report.warnings.length ? (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">{report.warnings.length} Warnungen anzeigen</summary>
                  <ul className="mt-2 list-disc pl-5">
                    {report.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}
                  </ul>
                </details>
              ) : null}
              {report.errors.length ? <p className="mt-2 text-red-700">{report.errors.slice(0, 2).join(" ")}</p> : null}
            </div>
          ) : null}
          {uiState.status === "succeeded" && completedDeck ? (
            <div className="core-status-success text-sm" role="status" aria-live="polite">
              <p className="font-semibold">Import erfolgreich abgeschlossen.</p>
              <button type="button" onClick={() => onCompleted(completedDeck)} className="mt-3 min-h-10 rounded-xl bg-emerald-700 px-4 font-semibold text-white">
                Import abschließen
              </button>
            </div>
          ) : null}
        </div>
        <textarea
          className="min-h-72 rounded-xl border border-[#dfe4f5] p-4 text-sm leading-6"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setReport(null);
            setCompletedDeck(null);
            setUiState({ status: "idle" });
          }}
          placeholder={mode === "text" ? "Front\n---\nBack" : mode === "csv" ? "front,back,tags" : "front\tback\ttags"}
          aria-label="Importinhalt"
        />
      </div>
    </SoftPanel>
  );
}
