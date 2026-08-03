import React from "react";
import { Database, FileSpreadsheet } from "lucide-react";
import type { CreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import type { ImportUiState } from "../importUiState.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";

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
        <OrbIcon icon={FileSpreadsheet} className="bg-core-success-soft text-core-text" />
        <div>
          <p className="core-body font-semibold uppercase tracking-wide text-core-text">Text / CSV / Excel</p>
          <h2 className="core-heading-2 font-semibold text-[var(--core-text)]">Strukturierte Karten importieren</h2>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Stapelname
            <input className="min-h-11 rounded-xl border border-[var(--core-border)] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <ActionButton type="button" variant="secondary" icon={Database} loading={uiState.status === "analyzing"} disabled={!content.trim() || uiState.status === "committing"} onClick={() => void runImport(true)}>Import prüfen</ActionButton>
            <ActionButton type="button" variant="primary" icon={Database} loading={uiState.status === "committing"} disabled={!content.trim() || uiState.status !== "preview" || Boolean(report?.errors.length)} onClick={() => void runImport(false)}>Import übernehmen</ActionButton>
          </div>
          {report ? (
            <StatusMessage tone={report.errors.length ? "error" : "success"} announce={report.errors.length ? "assertive" : "polite"}>
              <p className="font-semibold text-[var(--core-text)]">
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
              {report.errors.length ? <p className="mt-2 text-core-text">{report.errors.slice(0, 2).join(" ")}</p> : null}
            </StatusMessage>
          ) : null}
          {uiState.status === "succeeded" && completedDeck ? (
            <StatusMessage tone="success" announce="polite">
              <p className="font-semibold">Import erfolgreich abgeschlossen.</p>
              <ActionButton type="button" variant="primary" onClick={() => onCompleted(completedDeck)} className="mt-3">Import abschließen</ActionButton>
            </StatusMessage>
          ) : null}
        </div>
        <textarea
          className="min-h-72 rounded-xl border border-[var(--core-border)] p-4 core-body leading-6"
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
