import React from "react";
import { Database, FileSpreadsheet } from "lucide-react";
import type { CreationWorkflow, ImportCompletion } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import {
  analyzeCsvFieldMapping,
  projectCsvFieldMapping,
  type CsvFieldMappingColumn,
  type CsvFieldMappingTarget,
} from "../csvFieldMapping.ts";
import type { ImportUiState } from "../importUiState.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { StatusMessage } from "../ui/feedbackUi.tsx";
import { CoreSelect } from "../ui/selectUi.tsx";

export type TextTableImportMode = "text" | "csv" | "spreadsheet";
type TextTableWorkflow = Pick<CreationWorkflow, "importPastedDeck" | "importMappedCsvDeck">;
type TextTableImportReport = ReturnType<TextTableWorkflow["importPastedDeck"]>["report"];

export interface TextTableImportPanelProps {
  initialMode?: TextTableImportMode;
  workflow: TextTableWorkflow;
  onImported: (deck: Deck) => unknown;
  onCompleted?: (completion: ImportCompletion) => unknown;
}

const MAPPING_OPTIONS: Array<{ value: CsvFieldMappingTarget; label: string }> = [
  { value: "front", label: "Vorderseite" },
  { value: "back", label: "Rückseite" },
  { value: "field", label: "Neues Feld" },
  { value: "tags", label: "Tags" },
  { value: "deck", label: "Stapel" },
  { value: "guid", label: "Import-ID / GUID" },
  { value: "ignore", label: "Ignorieren" },
];

export function TextTableImportPanel({ initialMode = "text", workflow, onImported, onCompleted = () => undefined }: TextTableImportPanelProps) {
  const mode = initialMode;
  const mappedMode = mode !== "text";
  const [deckName, setDeckName] = React.useState("Importierter Stapel");
  const [content, setContent] = React.useState("");
  const [report, setReport] = React.useState<TextTableImportReport | null>(null);
  const [uiState, setUiState] = React.useState<ImportUiState>({ status: "idle" });
  const [completedDeck, setCompletedDeck] = React.useState<Deck | null>(null);
  const analysis = React.useMemo(() => mappedMode && content.trim() ? analyzeCsvFieldMapping(content) : null, [content, mappedMode]);
  const [mapping, setMapping] = React.useState<CsvFieldMappingColumn[]>([]);

  React.useEffect(() => setMapping(analysis?.suggestedMapping ?? []), [analysis]);
  const projection = React.useMemo(() => analysis ? projectCsvFieldMapping(analysis, mapping) : null, [analysis, mapping]);

  function resetResult() {
    setReport(null);
    setCompletedDeck(null);
    setUiState({ status: "idle" });
  }

  function updateMapping(columnId: string, patch: Partial<CsvFieldMappingColumn>) {
    setMapping((current) => current.map((entry) => entry.columnId === columnId ? { ...entry, ...patch } : entry));
    resetResult();
  }

  async function runImport(dryRun = false) {
    setUiState({ status: dryRun ? "analyzing" : "committing" });
    if (mappedMode && (!projection || !projection.ok)) {
      setUiState({ status: "failed_terminal" });
      return;
    }
    const result = mappedMode
      ? workflow.importMappedCsvDeck({ deckName, records: projection!.records, dryRun })
      : workflow.importPastedDeck({ mode, deckName, content, dryRun });
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
    <SoftPanel className="core-responsive-panel-padding p-6">
      <div className="mb-5 flex items-center gap-3">
        <OrbIcon icon={FileSpreadsheet} className="bg-core-success-soft text-core-text" />
        <div>
          <p className="core-body font-semibold uppercase tracking-wide text-core-text">Text / CSV / Excel</p>
          <h2 className="core-heading-2 font-semibold text-[var(--core-text)]">Strukturierte Karten importieren</h2>
        </div>
      </div>
      <div className="grid gap-4 2xl:grid-cols-[0.7fr_1.3fr]">
        <div className="grid content-start gap-4">
          <label className="grid gap-2 core-body font-semibold text-[var(--core-text-secondary)]">
            Stapelname
            <input className="min-h-11 rounded-xl border border-[var(--core-border)] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <ActionButton type="button" variant="secondary" icon={Database} loading={uiState.status === "analyzing"} disabled={!content.trim() || uiState.status === "committing" || Boolean(mappedMode && !projection?.ok)} onClick={() => void runImport(true)}>Import prüfen</ActionButton>
            <ActionButton type="button" variant="primary" icon={Database} loading={uiState.status === "committing"} disabled={!content.trim() || uiState.status !== "preview" || Boolean(report?.errors.length) || Boolean(mappedMode && !projection?.ok)} onClick={() => void runImport(false)}>Import übernehmen</ActionButton>
          </div>
          {report ? (
            <StatusMessage tone={report.errors.length ? "error" : "success"} announce={report.errors.length ? "assertive" : "polite"}>
              <p className="font-semibold text-[var(--core-text)]">{report.createdLearningItems} Karten · {report.createdVariants} Varianten · {report.duplicates.length} Dubletten</p>
              {report.warnings.length ? (
                <section className="mt-2" aria-labelledby="text-import-warnings-heading">
                  <h3 id="text-import-warnings-heading" className="font-semibold">{report.warnings.length} Warnungen</h3>
                  <ul className="mt-2 list-disc pl-5">{report.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}</ul>
                </section>
              ) : null}
              {report.errors.length ? <p className="mt-2 text-core-text">{report.errors.slice(0, 2).join(" ")}</p> : null}
            </StatusMessage>
          ) : null}
          {uiState.status === "succeeded" && completedDeck ? (
            <StatusMessage tone="success" announce="polite">
              <p className="font-semibold">Import erfolgreich abgeschlossen.</p>
              <ActionButton type="button" variant="primary" onClick={() => onCompleted({ deck: completedDeck, createdCount: completedDeck.cards.filter((card) => card.status !== "deleted").length })} className="mt-3">Import abschließen</ActionButton>
            </StatusMessage>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-4">
          <textarea
            className="min-h-48 rounded-xl border border-[var(--core-border)] p-4 core-body leading-6"
            value={content}
            onChange={(event) => { setContent(event.target.value); resetResult(); }}
            placeholder={mode === "text" ? "Front\n---\nBack" : mode === "csv" ? "front,back,tags" : "front\tback\ttags"}
            aria-label="Importinhalt"
          />
          {mappedMode && analysis ? (
            <div className="grid min-w-0 gap-3" aria-label="CSV-Spalten zuordnen">
              <div>
                <h3 className="core-heading-3 font-semibold text-[var(--core-text)]">Spalten zuordnen</h3>
                <p className="core-body text-[var(--core-text-muted)]">Die Vorschläge sind regelbasiert. Prüfe jede Spalte vor dem Import.</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--core-border)]">
                <table className="block w-full border-collapse text-left core-body xl:table xl:table-fixed">
                  <thead className="hidden bg-[var(--core-surface-muted)] text-[var(--core-text-secondary)] xl:table-header-group">
                    <tr><th className="p-3">Quellspalte</th><th className="p-3">Ziel</th><th className="p-3">Feldname</th><th className="p-3">Beispiel</th></tr>
                  </thead>
                  <tbody className="block xl:table-row-group">
                    {analysis.columns.map((column) => {
                      const entry = mapping.find((candidate) => candidate.columnId === column.columnId);
                      return (
                        <tr key={column.columnId} className="grid min-w-0 gap-3 border-t border-[var(--core-border)] p-3 align-top xl:table-row xl:p-0">
                          <th scope="row" className="min-w-0 break-words font-semibold text-[var(--core-text)] xl:p-3">{column.name}</th>
                          <td className="grid min-w-0 gap-1 xl:table-cell xl:p-3">
                            <span className="core-caption font-semibold text-[var(--core-text-secondary)] xl:hidden">Ziel</span>
                            <CoreSelect ariaLabel={`Ziel für ${column.name}`} className="w-full min-w-0" value={entry?.target ?? "ignore"} options={MAPPING_OPTIONS} onValueChange={(target) => updateMapping(column.columnId, { target: target as CsvFieldMappingTarget, fieldName: target === "field" ? entry?.fieldName ?? column.name : undefined })} />
                          </td>
                          <td className="grid min-w-0 gap-1 xl:table-cell xl:p-3">
                            <span className="core-caption font-semibold text-[var(--core-text-secondary)] xl:hidden">Feldname</span>
                            {entry?.target === "field" ? <input className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--core-border)] px-3" value={entry.fieldName ?? ""} aria-label={`Feldname für ${column.name}`} onChange={(event) => updateMapping(column.columnId, { fieldName: event.target.value })} /> : <span className="text-[var(--core-text-muted)]">—</span>}
                          </td>
                          <td className="grid min-w-0 gap-1 break-words text-[var(--core-text-muted)] xl:table-cell xl:max-w-72 xl:p-3">
                            <span className="core-caption font-semibold text-[var(--core-text-secondary)] xl:hidden">Beispiel</span>
                            <span className="min-w-0 break-words">{analysis.sampleRows[0]?.values[column.index] || "—"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {projection && !projection.ok ? (
                <StatusMessage tone="error" announce="polite"><ul className="list-disc pl-5">{projection.errors.slice(0, 5).map((error, index) => <li key={`${error.code}:${error.columnId ?? index}`}>{error.message}</li>)}</ul></StatusMessage>
              ) : projection ? <StatusMessage tone="success" announce="polite">{projection.records.length} Datenzeilen sind eindeutig zugeordnet.</StatusMessage> : null}
            </div>
          ) : null}
        </div>
      </div>
    </SoftPanel>
  );
}
