import React from "react";
import { Database, FileSpreadsheet } from "lucide-react";
import type { CreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";

export type TextTableImportMode = "text" | "csv" | "spreadsheet";
type TextTableWorkflow = Pick<CreationWorkflow, "importPastedDeck">;
type TextTableImportReport = ReturnType<TextTableWorkflow["importPastedDeck"]>["report"];

export interface TextTableImportPanelProps {
  initialMode?: TextTableImportMode;
  workflow: TextTableWorkflow;
  onImported: (deck: Deck) => unknown;
}

export function TextTableImportPanel({ initialMode = "text", workflow, onImported }: TextTableImportPanelProps) {
  const [mode, setMode] = React.useState<TextTableImportMode>(initialMode);
  const [deckName, setDeckName] = React.useState("Importierter Stapel");
  const [content, setContent] = React.useState("");
  const [report, setReport] = React.useState<TextTableImportReport | null>(null);

  React.useEffect(() => {
    setMode(initialMode);
    setReport(null);
  }, [initialMode]);

  function runImport(dryRun = false) {
    const result = workflow.importPastedDeck({ mode, deckName, content, dryRun });
    setReport(result.report);
    if (!dryRun && result.deck) onImported(result.deck);
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
          <div className="grid grid-cols-3 gap-2" aria-label="Importformat">
            <button type="button" onClick={() => setMode("text")} className={`min-h-10 rounded-xl text-sm font-semibold ${mode === "text" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Text
            </button>
            <button type="button" onClick={() => setMode("csv")} className={`min-h-10 rounded-xl text-sm font-semibold ${mode === "csv" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              CSV
            </button>
            <button type="button" onClick={() => setMode("spreadsheet")} className={`min-h-10 rounded-xl text-sm font-semibold ${mode === "spreadsheet" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Excel
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!content.trim()} onClick={() => runImport(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1] disabled:text-slate-400">
              <Database size={17} aria-hidden="true" />
              Import prüfen
            </button>
            <button type="button" disabled={!content.trim() || Boolean(report?.errors.length)} onClick={() => runImport(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <Database size={17} aria-hidden="true" />
              Import übernehmen
            </button>
          </div>
          {report ? (
            <div className={`text-sm ${report.errors.length ? "core-status-error" : "core-status-success"}`} role={report.errors.length ? "alert" : "status"}>
              <p className="font-semibold text-[#17214f]">
                {report.createdLearningItems} Karten · {report.createdVariants} Varianten · {report.duplicates.length} Dubletten
              </p>
              {report.warnings.length ? <p className="mt-2">{report.warnings.slice(0, 2).join(" ")}</p> : null}
              {report.errors.length ? <p className="mt-2 text-red-700">{report.errors.slice(0, 2).join(" ")}</p> : null}
            </div>
          ) : null}
        </div>
        <textarea
          className="min-h-72 rounded-xl border border-[#dfe4f5] p-4 text-sm leading-6"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setReport(null);
          }}
          placeholder={mode === "text" ? "Front\n---\nBack" : mode === "csv" ? "front,back,tags" : "front\tback\ttags"}
          aria-label="Importinhalt"
        />
      </div>
    </SoftPanel>
  );
}
