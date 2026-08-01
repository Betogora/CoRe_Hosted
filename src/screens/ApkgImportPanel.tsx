import React from "react";
import { AlertCircle, CheckCircle2, Database, FileArchive, Loader2, Upload } from "lucide-react";
import type { ApkgCreationPreview, CreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import { projectImportUiState, type ImportUiState } from "../importUiState.ts";
import type { AccountMediaStore, MediaSyncProgress, MediaSyncResult, MediaSyncStatus, MediaSyncTask } from "../mediaStore.ts";
import { LOCAL_APKG_MAX_BYTES } from "../apkgImport.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.tsx";
import { OrbIcon, SoftPanel } from "../ui/coreUi.tsx";
import { formatBytes, importSteps } from "./screenConstants.ts";

type ApkgWorkflow = Pick<CreationWorkflow, "commitApkgPreview" | "parseApkgFile">;

interface ApkgImportJob {
  fileName?: string;
  fileSize?: number;
  status: string;
  warnings: string[];
  errors: string[];
}

export interface ApkgImportPanelProps {
  existingDecks: Deck[];
  workflow: ApkgWorkflow;
  mediaStore: AccountMediaStore | null;
  onCompleted: (deck: Deck) => unknown;
}

type CloudProgress = MediaSyncProgress & { status: MediaSyncStatus };
type PreviewMediaStatus = { persisted: boolean; count: number; errors: string[] };

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toImportJob(value: unknown): ApkgImportJob {
  const job = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    fileName: typeof job.fileName === "string" ? job.fileName : undefined,
    fileSize: typeof job.fileSize === "number" ? job.fileSize : undefined,
    status: typeof job.status === "string" ? job.status : "error",
    warnings: toStrings(job.warnings),
    errors: toStrings(job.errors),
  };
}

function importStatusLabel(status: ImportUiState["status"]): string {
  return {
    idle: "Bereit",
    analyzing: "Analysieren",
    preview: "Vorschau bereit",
    committing: "Übernehmen",
    syncing_media: "Medien werden synchronisiert",
    succeeded: "Erfolgreich",
    partial: "Teilweise fertig",
    failed_retryable: "Fehlgeschlagen, erneut versuchbar",
    failed_terminal: "Fehlgeschlagen",
    cancelled: "Abgebrochen",
  }[status];
}

export function ApkgImportPanel({ existingDecks, workflow, mediaStore, onCompleted }: ApkgImportPanelProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [job, setJob] = React.useState<ApkgImportJob | null>(null);
  const [preview, setPreview] = React.useState<ApkgCreationPreview | null>(null);
  const [mediaStatus, setMediaStatus] = React.useState<PreviewMediaStatus | MediaSyncResult | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);
  const [mediaTask, setMediaTask] = React.useState<MediaSyncTask | null>(null);
  const [cloudProgress, setCloudProgress] = React.useState<CloudProgress | null>(null);
  const [completedDeck, setCompletedDeck] = React.useState<Deck | null>(null);
  const { urls: previewMediaUrls } = useDeckMediaUrls(preview?.deck ?? null, mediaStore);

  async function parseFile(file: File) {
    setSelectedFile(file);
    setPreview(null);
    setMediaStatus(null);
    setMediaTask(null);
    setCloudProgress(null);
    setCompletedDeck(null);
    if (file.size > LOCAL_APKG_MAX_BYTES) {
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: ["Die APKG-Datei ist größer als 250 MiB. Bitte wähle eine kleinere Datei aus."],
      });
      return;
    }
    setJob({ fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] });
    setIsParsing(true);

    try {
      const result = await workflow.parseApkgFile(file as unknown as Parameters<ApkgWorkflow["parseApkgFile"]>[0], { existingDecks });
      setMediaStatus(result.mediaStatus);
      setJob(toImportJob(result.job));
      setPreview(result.preview);
    } catch (error) {
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: [error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      });
      setPreview(null);
    } finally {
      setIsParsing(false);
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void parseFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  }

  async function handleCommit() {
    if (!preview) return;
    setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "committing" }));
    setIsParsing(true);
    try {
      const result = await workflow.commitApkgPreview(preview, { existingDecks });
      if (result.report.errors.length > 0 || !result.deck) {
        setJob((current) => ({
          ...(current ?? { warnings: [], errors: [] }),
          status: "error",
          warnings: [...new Set([...(current?.warnings ?? []), ...(result.report.warnings ?? [])])],
          errors: [...new Set([...(current?.errors ?? []), ...(result.report.errors ?? [])])],
        }));
        setPreview((current) => current ? { ...current, importReport: result.report } as ApkgCreationPreview : current);
        return;
      }
      setJob((current) => ({
        ...(current ?? { warnings: [], errors: [] }),
        status: "done",
        warnings: [...new Set([...(current?.warnings ?? []), ...(result.report.warnings ?? [])])],
      }));
      setPreview((current) => current ? { ...current, importReport: result.report } as ApkgCreationPreview : current);
      setCompletedDeck(result.deck);
      if (result.mediaTask) {
        setMediaTask(result.mediaTask);
        setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "syncing_media" }));
        result.mediaTask.subscribe((progress: MediaSyncProgress, status: MediaSyncStatus) => setCloudProgress({ ...progress, status }));
        void result.mediaTask.result.then((mediaResult: MediaSyncResult) => {
          setMediaStatus(mediaResult);
          setCloudProgress({ ...mediaResult.progress, status: mediaResult.status });
          setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: mediaResult.status === "cloud-ready" ? "done" : "partial" }));
        });
      }
    } catch (error) {
      setJob((current) => ({
        ...(current ?? { warnings: [], errors: [] }),
        status: "error",
        errors: [...(current?.errors ?? []), error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      }));
    } finally {
      setIsParsing(false);
    }
  }

  const report = preview?.importReport ?? null;
  const apkgReport = report?.apkg?.contractVersion === 1 ? report.apkg : null;
  const previewWarnings = [...new Set([...(preview?.warnings ?? []), ...(report?.warnings ?? [])])];
  const previewErrors = [...new Set([...(job?.errors ?? []), ...(report?.errors ?? [])])];
  const uiState = projectImportUiState({
    jobStatus: job?.status,
    mediaStatus: cloudProgress?.status,
    hasPreview: Boolean(preview),
    hasMediaTask: Boolean(mediaTask),
    isBusy: isParsing,
  });
  const currentStepIndex = uiState.status === "idle" || uiState.status === "analyzing"
    ? 0
    : uiState.status === "preview"
    ? 1
    : uiState.status === "committing"
    ? 2
    : uiState.status === "syncing_media"
    ? 3
    : 4;
  const previewVisible = Boolean(preview) && !["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);
  const presentMediaCount = apkgReport?.media.detected ?? 0;

  return (
    <div className="grid gap-5">
      <SoftPanel className="p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrbIcon icon={FileArchive} className="bg-core-success-soft text-core-text" />
          <div>
            <p className="core-body font-semibold uppercase tracking-wide text-core-text">Anki-Import</p>
            <h2 className="core-heading-2 font-semibold text-[var(--core-text)]">APKG als Originalanker importieren</h2>
          </div>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-5 text-center transition ${
            isDragging ? "border-core-success bg-core-success-soft" : "border-[var(--core-border)] bg-[var(--core-surface-muted)] hover:border-core-success"
          }`}
        >
          <Upload className="mb-2 text-core-text" size={26} aria-hidden="true" />
          <span className="core-body-large font-semibold text-[var(--core-text)]">.apkg-Datei ablegen oder auswählen</span>
          <span className="mt-1 max-w-md core-body leading-6 text-[var(--core-text-muted)]">Stapel, Karten und Medien werden vor dem Import geprüft.</span>
          <span className="mt-1 max-w-md core-caption leading-5 text-[var(--core-text-muted)]">Freigegebene Dateigröße: bis 250 MiB.</span>
          <input ref={fileInputRef} className="sr-only" type="file" accept=".apkg" onChange={handleFileInput} />
        </label>

        {selectedFile ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--core-border)] bg-core-surface p-4">
            <div className="min-w-0">
              <p className="truncate core-body font-semibold text-[var(--core-text)]">{selectedFile.name}</p>
            </div>
            <p className="mt-1 core-body text-[var(--core-text-muted)]">{formatBytes(selectedFile.size)} · {importStatusLabel(uiState.status)}</p>
          </div>
        ) : null}

        <ol className="mt-5 grid gap-2 md:grid-cols-5" aria-label="Importstatus">
          {importSteps.map((step) => {
            const stepIndex = importSteps.findIndex((item) => item.id === step.id);
            const isActive = stepIndex === currentStepIndex;
            const isDone = stepIndex < currentStepIndex || uiState.status === "succeeded";
            const isFailure = ["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);
            const label = step.id === "complete" && currentStepIndex === 4 ? importStatusLabel(uiState.status) : step.label;
            return (
              <li key={step.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isActive ? isFailure ? "border-core-danger bg-core-danger-soft" : uiState.status === "partial" ? "border-core-warning bg-core-warning-soft" : "border-core-success bg-core-success-soft" : "border-[var(--core-border)]"}`}>
                {isActive && isParsing ? <Loader2 className="shrink-0 animate-spin text-core-text" size={16} aria-hidden="true" /> : isDone ? <CheckCircle2 className="shrink-0 text-core-text" size={16} aria-hidden="true" /> : isActive && isFailure ? <AlertCircle className="shrink-0 text-core-text" size={16} aria-hidden="true" /> : <span className="size-4 shrink-0 rounded-full border border-[var(--core-border)]" />}
                <span className="core-caption font-semibold text-[var(--core-text-secondary)]">{label}</span>
              </li>
            );
          })}
        </ol>

        {uiState.status === "succeeded" && completedDeck ? (
          <div className="core-status-success mt-4 core-body" role="status" aria-live="polite">
            <p className="font-semibold">Import erfolgreich abgeschlossen.</p>
            <ActionButton type="button" variant="primary" size="compact" onClick={() => onCompleted(completedDeck)} className="mt-3">Import abschließen</ActionButton>
          </div>
        ) : null}

        {uiState.status === "partial" ? (
          <div className="core-status-warning mt-4 core-body" role="status">
            <p>Import teilweise abgeschlossen. Die Karten sind übernommen; Medien sind noch nicht vollständig synchronisiert.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mediaTask ? <ActionButton type="button" variant="primary" size="compact" onClick={() => mediaTask.resume()}>Medien-Sync fortsetzen</ActionButton> : null}
              {completedDeck ? <ActionButton type="button" variant="secondary" size="compact" onClick={() => onCompleted(completedDeck)}>Karten jetzt verwenden</ActionButton> : null}
            </div>
          </div>
        ) : null}

        {uiState.status === "failed_retryable" || uiState.status === "failed_terminal" ? (
          <div className="core-status-error mt-5 core-body" role="alert">
            {(job?.errors.length ? job.errors : ["Die APKG-Datei konnte nicht verarbeitet werden."]).map((error, index) => (
              <p key={`${error}-${index}`}>{error}</p>
            ))}
            <ActionButton type="button" variant="primary" size="compact" onClick={() => fileInputRef.current?.click()} className="mt-3">Andere Datei auswählen</ActionButton>
          </div>
        ) : null}
        {uiState.status === "cancelled" ? (
          <div className="core-status-info mt-5 core-body" role="status">
            <p>Import abgebrochen. Es wurden aus diesem Vorgang keine weiteren Karten übernommen.</p>
            <ActionButton type="button" variant="secondary" size="compact" onClick={() => fileInputRef.current?.click()} className="mt-3">Andere Datei auswählen</ActionButton>
          </div>
        ) : null}
      </SoftPanel>

      <section className="grid gap-5">
        {previewVisible && preview ? (
          <>
            <SoftPanel className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="core-body font-semibold uppercase tracking-wide text-core-text">Importvorschau</p>
                  <h3 className="mt-1 core-heading-2 font-semibold text-[var(--core-text)]">{preview.deck.name}</h3>
                </div>
                {uiState.status === "preview" ? (
                  <ActionButton type="button" variant="primary" icon={Database} loading={isParsing} disabled={previewErrors.length > 0} onClick={() => void handleCommit()}>Import übernehmen</ActionButton>
                ) : null}
              </div>
              <div className="mt-4 rounded-xl border border-[var(--core-border)] bg-core-surface px-4 py-3 core-body text-[var(--core-text-muted)]">
                <span className="font-semibold text-[var(--core-text)]">{job?.fileName ?? selectedFile?.name ?? "APKG-Datei"}</span>
                <span> · {formatBytes(job?.fileSize ?? selectedFile?.size ?? 0)}</span>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Erkannte Stapel", value: apkgReport?.decks.length ?? 0 },
                  { label: "Karten", value: apkgReport?.detectedCards ?? 0 },
                  { label: "Medien vorhanden", value: presentMediaCount },
                  { label: "Medien fehlen", value: apkgReport?.media.missing.length ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-[var(--core-border)] bg-[var(--core-surface-muted)] p-3">
                    <dt className="core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">{label}</dt>
                    <dd className="mt-1 core-heading-2 font-semibold text-[var(--core-text)]">{value}</dd>
                  </div>
                ))}
              </dl>
              {apkgReport ? (
                <div className="mt-5 grid gap-4">
                  <section className="rounded-xl border border-[var(--core-border)] bg-core-surface p-4" aria-labelledby="apkg-decks-heading">
                    <h4 id="apkg-decks-heading" className="font-semibold text-[var(--core-text)]">Erkannte Stapel</h4>
                    <div className="mt-3 grid gap-2 core-body text-[var(--core-text-muted)]">
                      {apkgReport.decks.map((deck) => (
                        <div key={deck.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--core-surface-muted)] pb-2 last:border-0 last:pb-0">
                          <span className="font-medium text-[var(--core-text-secondary)]">{deck.path}</span>
                          <span>{deck.cardCount} Karten</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {apkgReport.media.missing.length > 0 ? (
                    <div className="flex gap-2 rounded-xl bg-core-warning-soft px-3 py-2 core-body text-core-text">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{apkgReport.media.missing.length} referenzierte Medien fehlen im Paket. Betroffene Karten können ohne Bild oder Ton erscheinen.</span>
                    </div>
                  ) : null}
                  {previewWarnings.length > 0 ? (
                    <details className="rounded-xl bg-core-warning-soft px-3 py-2 core-body text-core-text">
                      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                        <AlertCircle className="shrink-0" size={16} aria-hidden="true" />
                        {previewWarnings.length} {previewWarnings.length === 1 ? "Warnung" : "Warnungen"}
                      </summary>
                      <ul className="mt-3 list-disc space-y-1 pl-6">
                        {previewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </details>
                  ) : null}

                  <section className="rounded-xl border border-[var(--core-border)] bg-core-surface p-4" aria-labelledby="apkg-reimport-heading">
                    <h4 id="apkg-reimport-heading" className="font-semibold text-[var(--core-text)]">Reimport-Schutz</h4>
                    <dl className="mt-3 grid grid-cols-2 gap-3 core-body sm:grid-cols-4">
                      <div><dt className="text-[var(--core-text-muted)]">Neu</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.newItems}</dd></div>
                      <div><dt className="text-[var(--core-text-muted)]">Wiedererkannt</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.matchedItems}</dd></div>
                      <div><dt className="text-[var(--core-text-muted)]">Übersprungen</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.skippedItems}</dd></div>
                      <div><dt className="text-[var(--core-text-muted)]">Lokale Änderungen geschützt</dt><dd className="font-semibold text-[var(--core-text)]">{apkgReport.reimport.protectedLocalEdits}</dd></div>
                    </dl>
                  </section>
                </div>
              ) : null}
              {mediaTask && cloudProgress?.status !== "cloud-ready" && cloudProgress?.status !== "cancelled" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {cloudProgress?.status === "paused" ? <ActionButton type="button" variant="secondary" size="compact" onClick={() => mediaTask.resume()}>Fortsetzen</ActionButton> : <ActionButton type="button" variant="secondary" size="compact" onClick={() => void mediaTask.pause()}>Pausieren</ActionButton>}
                  <ActionButton type="button" variant="destructive" size="compact" onClick={() => void mediaTask.cancel()}>Upload abbrechen</ActionButton>
                </div>
              ) : null}
            </SoftPanel>

            {preview.sampleCards.length > 0 ? (
              <details className="core-surface-raised rounded-[18px] p-5">
                <summary className="cursor-pointer font-semibold text-[var(--core-text)]">Kartenbeispiele</summary>
                <div className="mt-4 grid gap-4">
                  {preview.sampleCards.map((card) => (
                    <article key={card.id} className="core-surface-raised rounded-[18px] p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="rounded-xl bg-core-success-soft px-3 py-1 core-caption font-semibold text-core-text">Originalkarte</span>
                        <span className="core-caption font-medium uppercase tracking-wide text-[var(--core-text-muted)]">{card.kind}</span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="mb-2 core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Front</p>
                          <CardHtml html={card.originalFront} mediaUrls={previewMediaUrls} />
                        </div>
                        <div>
                          <p className="mb-2 core-caption font-semibold uppercase tracking-wide text-[var(--core-text-muted)]">Back</p>
                          <CardHtml html={card.originalBack} mediaUrls={previewMediaUrls} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <SoftPanel className="p-6">
            <p className="core-body font-semibold uppercase tracking-wide text-core-text">Bereit</p>
            <h3 className="mt-1 core-heading-2 font-semibold text-[var(--core-text)]">Importbericht erscheint nach dem Upload</h3>
          </SoftPanel>
        )}
      </section>
    </div>
  );
}
