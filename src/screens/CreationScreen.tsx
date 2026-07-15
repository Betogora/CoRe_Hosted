import React from "react";
import { AlertCircle, ArrowLeft, Bot, CheckCircle2, Database, FileArchive, FileSpreadsheet, FileText, Loader2, PenLine, Pin, PinOff, Trash2, Upload, WandSparkles } from "lucide-react";
import { createCreationWorkflow, type ApkgCreationPreview } from "../creationWorkflow.ts";
import { createServerApkgImportClient } from "../serverApkgImport.ts";
import { LOCAL_APKG_MAX_BYTES, type ApkgImportProgress } from "../serverApkgImportContract.ts";
import type { ApkgImportReportV1 } from "../apkgImport.ts";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.tsx";
import { LabsNotice, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { PdfDocumentViewer } from "../ui/PdfDocumentViewer.tsx";
import { RichTextEditor } from "../ui/RichTextEditor.tsx";
import { cardTypeOptions, formatBytes, importSteps } from "./screenConstants.ts";
import type { SourceDocument } from "../coreTypes.ts";
import type { ProductSurface } from "../productSurfaces.ts";

const creationWorkflow = createCreationWorkflow();
const manualCardTypeOptions = cardTypeOptions;

const notetypeLabels: Record<ApkgImportReportV1["notetypes"][number]["classification"], string> = {
  basic: "Einfach",
  reverse: "Einfach + umgekehrt",
  optional_reverse: "Optional umgekehrt",
  cloze: "Lückentext",
  custom: "Sicherer Fallback",
};

const serverPhaseLabels: Record<ApkgImportProgress["phase"], string> = {
  upload: "Hochladen",
  download: "Datei laden",
  validate: "Sicherheitsprüfung",
  parse: "Anki-Daten lesen",
  preview: "Vorschau erstellen",
  commit: "Import übernehmen",
  media: "Medien synchronisieren",
  cleanup: "Aufräumen",
  done: "Abgeschlossen",
};

function formatServerProgress(progress: ApkgImportProgress) {
  if (progress.phase === "media" || progress.phase === "done") return `${progress.completed} / ${progress.total} Medien`;
  return `${formatBytes(progress.completed)} / ${formatBytes(progress.total)}`;
}

function documentStatusMessage(document: SourceDocument | null): string {
  if (!document) return "";
  if (document.textExtractionStatus === "success") return "Text ist bereit.";
  if (document.textExtractionStatus === "empty") return "Kein Textlayer gefunden.";
  if (document.textExtractionStatus === "unsupported" && document.metadata?.userMessage) return String(document.metadata.userMessage);
  if (document.textExtractionStatus === "unsupported") return "Dieses Dateiformat kann in diesem Schritt noch nicht ausgelesen werden.";
  if (document.textExtractionStatus === "error") return String(document.metadata?.extractionError || "Dokument konnte nicht ausgelesen werden.");
  return "Dokument als Quelle gespeichert; Textextraktion steht aus.";
}

function splitAnswerOptions(value: string) {
  return String(value ?? "")
    .split(/\n+/)
    .map((option) => option.trim())
    .filter(Boolean);
}

function isPdfDocument(document: SourceDocument|null) {
  return document?.mimeType === "application/pdf";
}

function TabButton({ icon: Icon, label, isActive, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
        isActive ? "bg-[#4f5eb1] text-white shadow-sm" : "border border-[#dfe4f5] bg-white/76 text-[#4f5eb1] hover:bg-white"
      }`}
    >
      <Icon className="shrink-0" size={17} aria-hidden="true" />
      <span className="min-w-0 whitespace-normal text-left leading-snug">{label}</span>
    </button>
  );
}

function ApkgImportPanel({ existingDecks = [], workflow = creationWorkflow, mediaStore, serverApkgEnabled = false }: any) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [job, setJob] = React.useState<any>(null);
  const [preview, setPreview] = React.useState<ApkgCreationPreview | null>(null);
  const [mediaStatus, setMediaStatus] = React.useState<any>(null);
  const [activeStep, setActiveStep] = React.useState<any>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);
  const [mediaTask, setMediaTask] = React.useState<any>(null);
  const [cloudProgress, setCloudProgress] = React.useState<any>(null);
  const [serverProgress, setServerProgress] = React.useState<ApkgImportProgress | null>(null);
  const resumedRef = React.useRef(false);
  const localPreviewDeck = preview?.kind === "local" ? preview.deck : null;
  const { urls: previewMediaUrls, missing: previewMissingMedia } = useDeckMediaUrls(localPreviewDeck, mediaStore);

  function handleServerProgress(next: ApkgImportProgress) {
    setServerProgress(next);
    setPreview((current) => current?.kind === "server" ? { ...current, progress: next } : current);
  }

  React.useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    void workflow.resumeApkgPreview?.({ existingDecks, onProgress: handleServerProgress }).then((result: any) => {
      if (!result?.preview) return;
      setPreview(result.preview);
      setJob(result.job);
      setServerProgress(result.preview.progress);
    }).catch(() => undefined);
  }, [existingDecks, workflow]);

  async function parseFile(file: File) {
    setSelectedFile(file);
    setPreview(null);
    setServerProgress(null);
    setMediaStatus(null);
    if (file.size > LOCAL_APKG_MAX_BYTES && !serverApkgEnabled) {
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: ["In dieser Umgebung sind APKG-Dateien bis 250 MiB freigegeben."],
      });
      return;
    }
    setJob({ fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] });
    setIsParsing(true);

    try {
      const result = await workflow.parseApkgFile(file, { onStep: setActiveStep as () => void, onProgress: handleServerProgress, existingDecks });
      setMediaStatus(result.mediaStatus);
      setJob(result.job);
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
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  }

  async function handleCommit() {
    if (!preview) return;
    setIsParsing(true);
    try {
      const result = await workflow.commitApkgPreview(preview, { existingDecks, onProgress: handleServerProgress });
      if (result.report.errors.length > 0 || !result.deck) {
        setJob((currentJob: any) => ({
          ...currentJob,
          status: "error",
          warnings: [...new Set([...(currentJob?.warnings ?? []), ...(result.report.warnings ?? [])])],
          errors: [...new Set([...(currentJob?.errors ?? []), ...(result.report.errors ?? [])])],
        }));
        setPreview((currentPreview: any) => (currentPreview ? { ...currentPreview, importReport: result.report } : currentPreview));
        return;
      }
      if (result.serverProgress) handleServerProgress(result.serverProgress);
      setJob((currentJob: any) => ({ ...currentJob, status: result.serverProgress?.status ?? "done", progress: result.serverProgress ?? currentJob?.progress, warnings: [...new Set([...(currentJob?.warnings ?? []), ...(result.report.warnings ?? [])])] }));
      setPreview((currentPreview: any) => (currentPreview ? { ...currentPreview, importReport: result.report } : currentPreview));
      if (result.mediaTask) {
        setMediaTask(result.mediaTask);
        result.mediaTask.subscribe((progress: any, status: any) => setCloudProgress({ ...progress, status }));
        void result.mediaTask.result.then((mediaResult: any) => {
          setMediaStatus(mediaResult);
          setCloudProgress({ ...mediaResult.progress, status: mediaResult.status });
          setJob((currentJob: any) => ({ ...currentJob, status: mediaResult.status === "cloud-ready" ? "done" : mediaResult.status }));
        });
      }
    } catch (error) {
      setJob((currentJob: any) => ({ ...currentJob, status: "error", errors: [...(currentJob?.errors ?? []), error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."] }));
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCancelServerImport() {
    if (!serverProgress) return;
    const cancelled = await workflow.cancelApkgProgress(serverProgress);
    if (!cancelled) return;
    setServerProgress(cancelled);
    setJob((current: any) => ({ ...current, status: "cancelled", progress: cancelled }));
    setIsParsing(false);
  }

  async function handleRetryServerImport() {
    if (!preview || preview.kind !== "server") return;
    setIsParsing(true);
    try {
      const next = await workflow.retryApkgPreview(preview, handleServerProgress);
      if (next) {
        setPreview(next);
        const status = next.progress.status === "ready" ? "preview" : next.progress.status === "succeeded" ? "done" : "error";
        setJob((current: any) => ({ ...current, status, progress: next.progress, errors: ["ready", "succeeded"].includes(next.progress.status) ? [] : current?.errors }));
      }
    } finally { setIsParsing(false); }
  }

  const report = preview?.importReport ?? null;
  const apkgReport = report?.apkg?.contractVersion === 1 ? report.apkg : null;
  const previewWarnings = [...new Set([...(preview?.warnings ?? []), ...(report?.warnings ?? [])])];
  const previewErrors = [...new Set([...(job?.errors ?? []), ...(report?.errors ?? [])])];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <SoftPanel className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <OrbIcon icon={FileArchive} className="bg-teal-50 text-teal-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Anki-Import</p>
            <h2 className="text-2xl font-semibold text-[#17214f]">APKG als Originalanker importieren</h2>
          </div>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
            isDragging ? "border-teal-500 bg-teal-50" : "border-[#dfe4f5] bg-[#f8f9fe] hover:border-teal-400"
          }`}
        >
          <Upload className="mb-4 text-teal-700" size={32} aria-hidden="true" />
          <span className="text-base font-semibold text-[#17214f]">.apkg-Datei ablegen oder auswählen</span>
          <span className="mt-2 max-w-md text-sm leading-6 text-[#66709a]">Decks, Notes, Karten, Tags, Medienreferenzen und Raw-Fallbacks.</span>
          <span className="mt-1 max-w-md text-xs leading-5 text-[#66709a]">{serverApkgEnabled ? "Explizit freigegeben bis 1 GiB." : "Freigegebene Dateigröße: bis 250 MiB."}</span>
          <input className="sr-only" type="file" accept=".apkg" onChange={handleFileInput} />
        </label>

        {selectedFile ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3e7f5] bg-white p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#17214f]">{selectedFile.name}</p>
            </div>
            <p className="mt-1 text-sm text-[#66709a]">{formatBytes(selectedFile.size)} · Status: {job?.status ?? "idle"}</p>
          </div>
        ) : null}

        {serverProgress ? (
          <div className="mt-4 rounded-xl border border-[#e3e7f5] bg-white p-4" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[#4e5b8c]">Serverimport: {serverPhaseLabels[serverProgress.phase]}</span>
              <span className="text-[#66709a]">{formatServerProgress(serverProgress)}</span>
            </div>
            <progress className="mt-3 h-2 w-full accent-teal-700" max={Math.max(1, serverProgress.total)} value={serverProgress.completed} />
            <div className="mt-3 flex flex-wrap gap-2">
              {!["ready", "succeeded", "failed", "cancelled"].includes(serverProgress.status) ? (
                <button type="button" onClick={() => void handleCancelServerImport()} className="min-h-10 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700">Import abbrechen</button>
              ) : null}
              {serverProgress.status === "failed" && serverProgress.retryable ? (
                <button type="button" onClick={() => void handleRetryServerImport()} className="min-h-10 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-teal-700">Erneut versuchen</button>
              ) : null}
            </div>
          </div>
        ) : null}

        {selectedFile ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={isParsing} onClick={() => void parseFile(selectedFile)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-teal-700 disabled:text-slate-400">
              <Database size={16} aria-hidden="true" />
              Import prüfen
            </button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {importSteps.map((step) => {
            const currentIndex = importSteps.findIndex((item) => item.id === activeStep);
            const stepIndex = importSteps.findIndex((item) => item.id === step.id);
            const isActive = activeStep === step.id && isParsing;
            const isDone = stepIndex < currentIndex || job?.status === "preview" || job?.status === "done";

            return (
              <div key={step.id} className="flex items-center gap-3 rounded-xl border border-[#e3e7f5] px-4 py-3">
                {isActive ? <Loader2 className="animate-spin text-teal-700" size={18} aria-hidden="true" /> : isDone ? <CheckCircle2 className="text-teal-700" size={18} aria-hidden="true" /> : <span className="size-[18px] rounded-full border border-[#cfd6ed]" />}
                <span className="text-sm font-medium text-[#4e5b8c]">{step.label}</span>
              </div>
            );
          })}
        </div>

        {job?.errors?.length > 0 ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            {job.errors.map((error: unknown, index: number) => (
              <p key={`${String(error)}-${index}`}>{String(error)}</p>
            ))}
          </div>
        ) : null}
      </SoftPanel>

      <section className="grid gap-5">
        {preview ? (
          <>
            <SoftPanel className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Importvorschau</p>
                  <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">{preview.kind === "local" ? preview.deck.name : preview.deckSummary.name}</h3>
                </div>
                <button type="button" disabled={previewErrors.length > 0 || isParsing} onClick={() => void handleCommit()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                  <Database size={17} aria-hidden="true" />
                  Import übernehmen
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Stapel" value={apkgReport?.decks.length ?? 0} />
                <StatTile label="Notes" value={apkgReport?.detectedNotes ?? 0} />
                <StatTile label="Varianten" value={apkgReport?.detectedVariants ?? 0} />
                <StatTile label="Dubletten" value={report?.duplicates?.length ?? 0} />
              </div>
              {apkgReport ? (
                <div className="mt-5 grid gap-4">
                  <section className="rounded-xl border border-[#e3e7f5] bg-white/70 p-4" aria-labelledby="apkg-decks-heading">
                    <h4 id="apkg-decks-heading" className="font-semibold text-[#17214f]">Erkannte Stapel</h4>
                    <div className="mt-3 grid gap-2 text-sm text-[#66709a]">
                      {apkgReport.decks.map((deck) => (
                        <div key={deck.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf0f8] pb-2 last:border-0 last:pb-0">
                          <span className="font-medium text-[#4e5b8c]">{deck.path}</span>
                          <span>{deck.noteCount} Notes · {deck.cardCount} Karten</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-[#e3e7f5] bg-white/70 p-4" aria-labelledby="apkg-notetypes-heading">
                    <h4 id="apkg-notetypes-heading" className="font-semibold text-[#17214f]">Kartentypen und Felder</h4>
                    <div className="mt-3 grid gap-3">
                      {apkgReport.notetypes.map((notetype) => (
                        <article key={notetype.id} className="rounded-lg bg-[#f8f9fe] p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-[#4e5b8c]">{notetype.name}</span>
                            <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">{notetypeLabels[notetype.classification]}</span>
                          </div>
                          <p className="mt-2 text-[#66709a]">Templates: {notetype.templates.map((template) => `${template.ordinal + 1}. ${template.name}`).join(", ") || "keine"}</p>
                          <p className="mt-1 text-[#66709a]">Zugeordnet: {notetype.mappedFields.join(", ") || "keine"}</p>
                          {notetype.unmappedFields.length > 0 ? <p className="mt-1 font-medium text-amber-800">Nicht zugeordnet: {notetype.unmappedFields.join(", ")}</p> : null}
                        </article>
                      ))}
                    </div>
                  </section>

                  <div className="grid gap-4 md:grid-cols-2">
                    <section className="rounded-xl border border-[#e3e7f5] bg-white/70 p-4" aria-labelledby="apkg-media-heading">
                      <h4 id="apkg-media-heading" className="font-semibold text-[#17214f]">Medien</h4>
                      <div className="mt-3 grid gap-2 text-sm text-[#66709a]">
                        <p>Medien: {apkgReport.media.detected} erkannt · {apkgReport.media.referenced.length} referenziert · {apkgReport.media.missing.length} fehlend</p>
                        <p>Format: {apkgReport.mediaFormat} · Paket: {apkgReport.packageFormat}</p>
                        {mediaStatus?.count != null ? <p>Lokaler Cache: {mediaStatus.persisted ? `${mediaStatus.count} Dateien persistent` : `${mediaStatus.count} Dateien nur temporär`}</p> : null}
                        {cloudProgress ? <p>Cloud: {cloudProgress.completed}/{cloudProgress.total} · {cloudProgress.uploaded} hochgeladen · {cloudProgress.reused} wiederverwendet · Status: {cloudProgress.status}</p> : null}
                        {mediaStatus?.message ? <p>{mediaStatus.message}</p> : null}
                        {previewMissingMedia.length > 0 ? <p>{previewMissingMedia.length} Medien sind nur lokal verfügbar oder fehlen.</p> : null}
                        {apkgReport.media.missing.length > 0 ? <p className="font-medium text-amber-800">Fehlend: {apkgReport.media.missing.join(", ")}</p> : null}
                      </div>
                    </section>

                    <section className="rounded-xl border border-[#e3e7f5] bg-white/70 p-4" aria-labelledby="apkg-reimport-heading">
                      <h4 id="apkg-reimport-heading" className="font-semibold text-[#17214f]">Reimport</h4>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div><dt className="text-[#66709a]">Neu</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.newItems}</dd></div>
                        <div><dt className="text-[#66709a]">Wiedererkannt</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.matchedItems}</dd></div>
                        <div><dt className="text-[#66709a]">Übersprungen</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.skippedItems}</dd></div>
                        <div><dt className="text-[#66709a]">Lokale Änderungen geschützt</dt><dd className="font-semibold text-[#17214f]">{apkgReport.reimport.protectedLocalEdits}</dd></div>
                      </dl>
                      <p className="mt-3 text-sm text-[#66709a]">Lernfortschritt: {apkgReport.hasAnkiScheduling ? "Anki-Daten erkannt, nicht übernommen" : "neuer CoRe-FSRS-State"}</p>
                    </section>
                  </div>
                </div>
              ) : null}
              {mediaTask && cloudProgress?.status !== "cloud-ready" && cloudProgress?.status !== "cancelled" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {cloudProgress?.status === "paused" ? <button type="button" onClick={() => mediaTask.resume()} className="min-h-10 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]">Fortsetzen</button> : <button type="button" onClick={() => void mediaTask.pause()} className="min-h-10 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1]">Pausieren</button>}
                  <button type="button" onClick={() => void mediaTask.cancel()} className="min-h-10 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700">Upload abbrechen</button>
                </div>
              ) : null}
              {previewErrors.length > 0 ? (
                <div className="mt-5 grid gap-2">
                  {previewErrors.map((error) => (
                    <div key={error} className="flex gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {previewWarnings.length > 0 ? (
                <div className="mt-5 grid gap-2">
                  {previewWarnings.map((warning) => (
                    <div key={warning} className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </SoftPanel>

            <div className="grid gap-4">
              {preview.sampleCards.map((card) => (
                <article key={card.id} className="core-surface-raised rounded-[18px] p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="rounded-xl bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Originalkarte</span>
                    <span className="text-xs font-medium uppercase tracking-wide text-[#66709a]">{card.kind}</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Front</p>
                      <CardHtml html={String(card.originalFront ?? "")} mediaUrls={previewMediaUrls} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Back</p>
                      <CardHtml html={String(card.originalBack ?? "")} mediaUrls={previewMediaUrls} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <SoftPanel className="p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Bereit</p>
            <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">Importbericht erscheint nach dem Upload</h3>
          </SoftPanel>
        )}
      </section>
    </div>
  );
}

function TextCsvImportPanel({ initialMode = "text", onImported }: any) {
  const [mode, setMode] = React.useState(initialMode);
  const [deckName, setDeckName] = React.useState("Importierter Stapel");
  const [content, setContent] = React.useState("");
  const [report, setReport] = React.useState<any>(null);

  React.useEffect(() => {
    setMode(initialMode);
    setReport(null);
  }, [initialMode]);

  function runImport(dryRun = false) {
    const result = creationWorkflow.importPastedDeck({ mode, deckName, content, dryRun });
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
            <button type="button" disabled={!content.trim() || report?.errors?.length > 0} onClick={() => runImport(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
              <Database size={17} aria-hidden="true" />
              Import übernehmen
            </button>
          </div>
          {report ? (
          <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4 text-sm text-[#66709a]" role={report.errors.length ? "alert" : "status"} aria-live={report.errors.length ? "assertive" : "polite"}>
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

function PinFieldButton({ isPinned, label, onToggle }: any) {
  const Icon = isPinned ? Pin : PinOff;
  const title = isPinned ? `${label} nach dem Speichern leeren` : `${label} nach dem Speichern behalten`;

  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={isPinned}
      title={title}
      onClick={onToggle}
      className={`grid size-8 shrink-0 place-items-center rounded-lg border transition ${
        isPinned
          ? "border-[#8c96dc] bg-[#eef1fb] text-[#4f5eb1] shadow-[0_0_0_2px_rgba(79,94,177,0.10)]"
          : "border-[#dfe4f5] bg-white text-[#8a94bd] hover:border-[#8c96dc] hover:text-[#4f5eb1]"
      }`}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function ManualCreationPanelV2({ decks = [], onCreated, onAppendManualCard, documentMode = false }: any) {
  const sourceInputRef = React.useRef<any>(null);
  const [useNewDeck, setUseNewDeck] = React.useState(decks.length === 0);
  const [selectedDeckId, setSelectedDeckId] = React.useState(decks[0]?.id ?? "");
  const [deckName, setDeckName] = React.useState("Manueller Kartenstapel");
  const [cardType, setCardType] = React.useState("basic");
  const [front, setFront] = React.useState("");
  const [back, setBack] = React.useState("");
  const [answerOptions, setAnswerOptions] = React.useState("");
  const [correctAnswer, setCorrectAnswer] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [pinnedFields, setPinnedFields] = React.useState<Record<string, boolean>>({ front: false, back: false });
  const [activeField, setActiveField] = React.useState("front");
  const [showDocumentMode, setShowDocumentMode] = React.useState(documentMode);
  const [document, setDocument] = React.useState<any>(null);
  const [documentObjectUrl, setDocumentObjectUrl] = React.useState("");
  const [documentText, setDocumentText] = React.useState("");
  const [selection, setSelection] = React.useState("");
  const [sourceAnchor, setSourceAnchor] = React.useState<any>(null);
  const [status, setStatus] = React.useState("");
  const parsedOptions = splitAnswerOptions(answerOptions);

  React.useEffect(() => {
    if (!selectedDeckId && decks[0]?.id) setSelectedDeckId(decks[0].id);
    if (selectedDeckId && !decks.some((deck: any) => deck.id === selectedDeckId)) setSelectedDeckId(decks[0]?.id ?? "");
    if (decks.length === 0) setUseNewDeck(true);
  }, [decks, selectedDeckId]);

  React.useEffect(() => {
    setShowDocumentMode(documentMode);
  }, [documentMode]);

  React.useEffect(() => {
    if (cardType === "multiple-choice" && !correctAnswer && parsedOptions[0]) {
      setCorrectAnswer(parsedOptions[0]);
    }
  }, [cardType, correctAnswer, parsedOptions]);

  React.useEffect(
    () => () => {
      if (documentObjectUrl) URL.revokeObjectURL(documentObjectUrl);
    },
    [documentObjectUrl],
  );

  async function handleDocument(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextDocument = await creationWorkflow.readSourceDocument(file as any);
    setDocument(nextDocument);
    setDocumentObjectUrl(isPdfDocument(nextDocument) ? URL.createObjectURL(file) : "");
    setDocumentText(String(nextDocument.text ?? ""));
    setShowDocumentMode(true);
    setStatus(documentStatusMessage(nextDocument));
    event.target.value = "";
  }

  function openSourcePicker() {
    setShowDocumentMode(true);
    window.setTimeout(() => sourceInputRef.current?.click(), 0);
  }

  function applySelection(selectedText: string, sourceAnchorOptions = {}) {
    const next = creationWorkflow.captureManualSelection({
      activeField,
      front,
      back,
      document,
      documentText,
      selectedText,
      sourceAnchorOptions,
    });
    if (!next.changed) return;
    setSelection(next.selection);
    setSourceAnchor(next.sourceAnchor);
    setFront(next.front);
    setBack(next.back);
    setStatus(`${activeField === "front" ? "Vorderseite" : "Rückseite"} ergänzt.`);
  }

  function captureSelection() {
    const selectedText = window.getSelection?.()?.toString().trim() || "";
    applySelection(selectedText);
  }

  function manualInput(): any {
    const selectedDeck = decks.find((deck: any) => deck.id === selectedDeckId);
    return {
      deckName: useNewDeck ? deckName : selectedDeck?.name ?? deckName,
      cardType,
      front,
      back,
      answerOptions,
      correctAnswer,
      expectedAnswer: back,
      tags,
      document,
      documentText,
      selection,
      sourceAnchor,
      activeField,
    };
  }

  function togglePinnedField(field: string) {
    setPinnedFields((current) => ({ ...current, [field]: !current[field] }));
  }

  function resetCardFields() {
    const keepSourceAnchor = sourceAnchor?.targetField ? pinnedFields[sourceAnchor.targetField] : false;
    setFront((current) => (pinnedFields.front ? current : ""));
    setBack((current) => (pinnedFields.back ? current : ""));
    setAnswerOptions("");
    setCorrectAnswer("");
    if (!keepSourceAnchor) {
      setSelection("");
      setSourceAnchor(null);
    }
    setActiveField(pinnedFields.front && !pinnedFields.back ? "back" : "front");
  }

  function saveManualCard() {
    const input = manualInput();
    if (!useNewDeck && selectedDeckId && onAppendManualCard) {
      const updatedDeck = onAppendManualCard(selectedDeckId, creationWorkflow.createManualDeckInput(input));
      if (updatedDeck) {
        setStatus("Karte im ausgewählten Stapel gespeichert.");
        resetCardFields();
      }
      return;
    }

    const deck = creationWorkflow.createManualDeck(input);
    onCreated(deck);
    setUseNewDeck(false);
    setSelectedDeckId(deck.id);
    setStatus("Neuer Stapel mit Originalkarte gespeichert.");
    resetCardFields();
  }

  const canCreate = creationWorkflow.canCreateManualCard({ front, back, cardType: cardType as any, answerOptions, correctAnswer });
  const answerLabel = cardType === "cloze" ? "Zusatzinfo" : cardType === "multiple-choice" ? "Erklärung / Musterantwort" : "Rückseite";
  const frontFieldActive = activeField === "front";
  const backFieldActive = activeField === "back";
  const shouldShowPdfViewer = showDocumentMode && isPdfDocument(document) && documentObjectUrl;
  const panelEyebrow = showDocumentMode ? "Manuelle Erstellung mit Quelle" : "Manuelle Erstellung";
  const panelTitle = "Karten manuell erstellen";
  const sourceFileName = document?.fileName ?? "Keine Datei ausgewählt";

  const editor = (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {!useNewDeck && decks.length > 0 ? (
              <label className="grid min-w-[16rem] flex-1 gap-2 text-sm font-semibold text-[#4e5b8c]">
                Kartenstapel
                <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={selectedDeckId} onChange={(event) => setSelectedDeckId(event.target.value)}>
                  {decks.map((deck: any) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="grid min-w-[16rem] flex-1 gap-2 text-sm font-semibold text-[#4e5b8c]">
                Neuer Kartenstapel
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
              </label>
            )}
            <button type="button" onClick={() => setUseNewDeck((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              <Database size={16} aria-hidden="true" />
              {useNewDeck && decks.length > 0 ? "Stapel auswählen" : "Neuen Stapel erstellen"}
            </button>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Kartentyp
          <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={cardType} onChange={(event) => setCardType(event.target.value)}>
            {manualCardTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <span>{cardType === "cloze" ? "Cloze-Text" : "Vorderseite"}</span>
            <PinFieldButton isPinned={pinnedFields.front} label={cardType === "cloze" ? "Cloze-Text" : "Vorderseite"} onToggle={() => togglePinnedField("front")} />
          </div>
          <RichTextEditor
            value={front}
            onFocus={() => setActiveField("front")}
            onChange={setFront}
            isActive={frontFieldActive}
            minHeightClass="min-h-32"
            ariaLabel={cardType === "cloze" ? "Cloze-Text" : "Vorderseite"}
          />
        </div>
        <div className="grid min-w-0 gap-2 text-sm font-semibold text-[#4e5b8c]">
          <div className="flex min-h-9 items-center justify-between gap-2">
            <span>{answerLabel}</span>
            <PinFieldButton isPinned={pinnedFields.back} label={answerLabel} onToggle={() => togglePinnedField("back")} />
          </div>
          <RichTextEditor
            value={back}
            onFocus={() => setActiveField("back")}
            onChange={setBack}
            isActive={backFieldActive}
            minHeightClass="min-h-32"
            ariaLabel={answerLabel}
          />
        </div>
      </div>

      {cardType === "multiple-choice" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Antwortoptionen
            <textarea className="min-h-32 rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6" value={answerOptions} onChange={(event) => setAnswerOptions(event.target.value)} placeholder={"Option A\nOption B\nOption C"} aria-label="Antwortoptionen" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Richtige Antwort
            {parsedOptions.length > 0 ? (
              <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={correctAnswer} onChange={(event) => setCorrectAnswer(event.target.value)}>
                {parsedOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={correctAnswer} onChange={(event) => setCorrectAnswer(event.target.value)} />
            )}
          </label>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
          Tags
          <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="biologie zelle prüfung" />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" disabled={!canCreate} onClick={saveManualCard} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            <Database size={17} aria-hidden="true" />
            Originalkarte speichern
          </button>
        </div>
      </div>
      {status ? <p className="text-sm text-[#66709a]" role="status" aria-live="polite">{status}</p> : null}
    </div>
  );

  return (
    <SoftPanel className="min-h-[calc(100vh-15rem)] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrbIcon icon={PenLine} className="bg-sky-50 text-sky-700" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">{panelEyebrow}</p>
            <h2 className="text-2xl font-semibold text-[#17214f]">{panelTitle}</h2>
          </div>
        </div>
        <button type="button" onClick={openSourcePicker} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-4 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
          <FileText size={17} aria-hidden="true" />
          {document ? "Quelle wechseln" : "PDF/Text anfügen"}
        </button>
        <input ref={sourceInputRef} className="sr-only" type="file" accept=".txt,.md,.markdown,.pdf,.docx" onChange={handleDocument} />
      </div>

      {showDocumentMode ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="grid content-start gap-4">
            <div className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              <span>Quelle</span>
              <button type="button" onClick={openSourcePicker} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#cfd6ed] px-3 text-left text-[#66709a] hover:border-[#8c96dc] hover:bg-white">
                <FileText className="shrink-0" size={17} aria-hidden="true" />
                <span className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#4f5eb1] shadow-sm">Datei auswählen</span>
                <span className="min-w-0 truncate text-sm font-medium">{sourceFileName}</span>
              </button>
            </div>
            {document && !shouldShowPdfViewer ? (
              <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-3 text-sm text-[#66709a]">
                <p className="font-semibold text-[#17214f]">{document.fileName}</p>
                <p>{documentStatusMessage(document)}</p>
              </div>
            ) : null}
            {shouldShowPdfViewer ? (
              <PdfDocumentViewer document={document} src={documentObjectUrl} onSelection={applySelection} />
            ) : (
              <div
                className="max-h-[40rem] min-h-[40rem] overflow-auto rounded-xl border border-[#dfe4f5] bg-white p-4 text-sm leading-6 text-[#17214f]"
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
                tabIndex={0}
              >
                {documentText ? <pre className="whitespace-pre-wrap break-words font-sans">{documentText}</pre> : <p className="text-[#66709a]">Keine Textquelle geöffnet.</p>}
              </div>
            )}
          </div>
          {editor}
        </div>
      ) : (
        editor
      )}
    </SoftPanel>
  );
}

function AiCreationPanel({ onCreated, onJob, surface }: { onCreated: any; onJob: any; surface: ProductSurface }) {
  const [config, setConfig] = React.useState<any>({
    language: "Deutsch",
    cardCount: 6,
    detailLevel: "normal",
    cardTypes: ["basic", "cloze"],
    focus: "Prüfungswissen",
    subject: "",
    costTier: "balanced",
  });
  const [document, setDocument] = React.useState(() => creationWorkflow.createInitialAiDocument());
  const [draftDeck, setDraftDeck] = React.useState<any>(null);
  const [draftCards, setDraftCards] = React.useState<any[]>([]);
  const [status, setStatus] = React.useState("");

  function updateConfig(key: string, value: string|number) {
    setConfig((current: any) => ({ ...current, [key]: value }));
  }

  function toggleCardType(cardType: string) {
    setConfig((current: any) => creationWorkflow.toggleAiCardType(current, cardType as any));
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocument(await creationWorkflow.readSourceDocument(file as any));
  }

  function updateDocumentText(text: string) {
    setDocument((current) => creationWorkflow.updateAiDocumentText(current, text));
  }

  function generateDrafts(nextConfig = config) {
    const result = creationWorkflow.generateAiDrafts({
      document,
      config: nextConfig,
      deckName: nextConfig.subject || "KI-Entwürfe",
    });
    onJob(result.job);
    setStatus(result.statusMessage);
    setDraftDeck(result.draftDeck);
    setDraftCards(result.draftDeck?.cards ?? []);
  }

  function updateDraft(cardId: string, key: string, value: string) {
    setDraftCards((cards) => creationWorkflow.updateDraftCard(cards, cardId, { [key]: value }));
  }

  function acceptDrafts() {
    if (!draftDeck || draftCards.length === 0) return;
    const acceptedDeck = creationWorkflow.acceptAiDrafts(draftDeck, draftCards);
    onCreated(acceptedDeck);
    setStatus("Entwürfe übernommen.");
  }

  return (
    <div className="grid gap-5">
      <LabsNotice surfaces={surface} />
      <SoftPanel className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <OrbIcon icon={WandSparkles} className="bg-indigo-50 text-indigo-700" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">KI-assistierte Erstellung</p>
          <h2 className="text-2xl font-semibold text-[#17214f]">Datei zu Kartenentwürfen</h2>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Datei
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[#cfd6ed] px-3 text-[#66709a]">
              <FileText size={17} aria-hidden="true" />
              <input type="file" accept=".txt,.md,.markdown,.pdf,.docx" onChange={handleFile} />
            </span>
          </label>
          <textarea className="min-h-48 rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6" value={document.text} onChange={(event) => updateDocumentText(event.target.value)} placeholder="Quellentext" aria-label="Quellentext für KI-Drafts" />
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["language", "Sprache"],
              ["detailLevel", "Detailgrad"],
              ["focus", "Fokus"],
              ["subject", "Fach"],
            ].map(([key, label]: any) => (
              <label key={key} className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                {label}
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={config[key]} onChange={(event) => updateConfig(key, event.target.value)} />
              </label>
            ))}
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kartenanzahl
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="number" min="1" max="30" value={config.cardCount} onChange={(event) => updateConfig("cardCount", Number(event.target.value))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kostenprofil
              <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={config.costTier} onChange={(event) => updateConfig("costTier", event.target.value)}>
                <option value="low">Low</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality-ready</option>
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-[#4e5b8c]">Kartentypen</p>
            <div className="flex flex-wrap gap-2">
              {["basic", "cloze"].map((cardType) => (
                <label key={cardType} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm text-[#4e5b8c]">
                  <input type="checkbox" checked={config.cardTypes.includes(cardType)} onChange={() => toggleCardType(cardType)} />
                  {cardType}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => generateDrafts()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white">
              <Bot size={17} aria-hidden="true" />
              Generieren
            </button>
            <button type="button" onClick={() => generateDrafts({ ...config, cardCount: Math.min(30, Number(config.cardCount) + 2) })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              Mehr Details
            </button>
            <button type="button" onClick={() => generateDrafts({ ...config, cardCount: Math.max(1, Number(config.cardCount) - 2) })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
              Weniger
            </button>
          </div>
          {status ? <p className="text-sm text-[#66709a]" role="status" aria-live="polite">{status}</p> : null}
        </div>

        <div className="grid gap-4">
          {draftCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#cfd6ed] bg-[#f8f9fe] p-6 text-sm text-[#66709a]">Keine Entwürfe.</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-[#17214f]">Entwürfe</h3>
                <button type="button" onClick={acceptDrafts} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Übernehmen
                </button>
              </div>
              {draftCards.map((card) => (
                <article key={card.id} className="rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-xl bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{card.kind}</span>
                    <span className="text-xs font-semibold text-[#66709a]">Confidence {Math.round((card.meta?.confidence ?? 0.75) * 100)} %</span>
                  </div>
                  <textarea className="min-h-20 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalFront} onChange={(event) => updateDraft(card.id, "originalFront", event.target.value)} aria-label="Entwurf Vorderseite" />
                  <textarea className="mt-3 min-h-24 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalBack} onChange={(event) => updateDraft(card.id, "originalBack", event.target.value)} aria-label="Entwurf Rückseite" />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#66709a]">
                    <span>{card.sourceAnchors?.[0]?.textQuote?.slice(0, 120) || "Quelle fehlt"}</span>
                    <button type="button" onClick={() => setDraftCards((cards) => cards.filter((item) => item.id !== card.id))} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-red-50 px-2 font-semibold text-red-700">
                      <Trash2 size={14} aria-hidden="true" />
                      Verwerfen
                    </button>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </div>
      </SoftPanel>
    </div>
  );
}

const importMethods = [
  { id: "anki", label: "APKG", icon: FileArchive },
  { id: "text", label: "Text", icon: FileText },
  { id: "csv", label: "CSV", icon: FileSpreadsheet },
  { id: "spreadsheet", label: "Excel/Tabelle", icon: FileSpreadsheet },
];

function ImportCreationPanel({ decks = [], onCreated, workflow, mediaStore, serverApkgEnabled = false }: any) {
  const [selectedImport, setSelectedImport] = React.useState("anki");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2" aria-label="Importformat">
        {importMethods.map((method) => (
          <TabButton key={method.id} icon={method.icon} label={method.label} isActive={selectedImport === method.id} onClick={() => setSelectedImport(method.id)} />
        ))}
      </div>
      {selectedImport === "anki" ? <ApkgImportPanel existingDecks={decks} workflow={workflow} mediaStore={mediaStore} serverApkgEnabled={serverApkgEnabled} /> : <TextCsvImportPanel initialMode={selectedImport} onImported={onCreated} />}
    </div>
  );
}

const creationMethods = [
  {
    id: "manual",
    title: "Karten manuell erstellen",
    eyebrow: "Manuell + PDF/Text",
    body: "Schreibe Karten selbst und füge bei Bedarf eine PDF- oder Textquelle an.",
    icon: PenLine,
    color: "sky",
  },
  {
    id: "import",
    title: "Import",
    eyebrow: "APKG, Text, Tabellen",
    body: "Übernimm bestehende Stapel oder Front/Back-Listen aus Dateien und Tabellen.",
    icon: FileSpreadsheet,
    color: "teal",
  },
  {
    id: "ai",
    title: "KI-gestützte Erstellung",
    eyebrow: "Drafts prüfen",
    body: "Erzeuge strukturierte Entwürfe aus Quellentext und übernimm sie nach Prüfung.",
    icon: WandSparkles,
    color: "indigo",
  },
];

const methodThemes: Record<string, { eyebrow: string; icon: string; hover: string }> = {
  sky: {
    eyebrow: "text-sky-700",
    icon: "bg-sky-50 text-sky-700 shadow-[inset_0_-18px_42px_rgba(14,165,233,0.08)]",
    hover: "hover:border-sky-200 hover:shadow-[0_18px_42px_rgba(14,116,144,0.12)]",
  },
  teal: {
    eyebrow: "text-teal-700",
    icon: "bg-teal-50 text-teal-700 shadow-[inset_0_-18px_42px_rgba(20,184,166,0.09)]",
    hover: "hover:border-teal-200 hover:shadow-[0_18px_42px_rgba(13,148,136,0.12)]",
  },
  indigo: {
    eyebrow: "text-indigo-700",
    icon: "bg-indigo-50 text-indigo-700 shadow-[inset_0_-18px_42px_rgba(79,70,229,0.08)]",
    hover: "hover:border-indigo-200 hover:shadow-[0_18px_42px_rgba(79,70,229,0.12)]",
  },
};

function CreationMethodButton({ method, isSelected, onSelect }: any) {
  const Icon = method.icon;
  const theme = methodThemes[method.color] ?? methodThemes.indigo;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`group grid min-h-[28rem] content-start rounded-[20px] border border-[#dde3f4] bg-white/82 px-7 py-10 text-center shadow-[0_8px_22px_rgba(91,105,154,0.08)] transition duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8790d8] sm:px-8 lg:px-9 ${theme.hover} ${isSelected ? "ring-2 ring-[#8790d8]" : ""}`}
    >
      <span className={`mx-auto grid size-44 place-items-center rounded-full ${theme.icon}`}>
        <Icon size={70} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className={`mt-10 text-sm font-semibold uppercase ${theme.eyebrow}`}>{method.eyebrow}</span>
      <span className="mx-auto mt-5 block max-w-[17rem] text-[2rem] font-semibold leading-tight text-[#17214f]">{method.title}</span>
      <span className="mx-auto mt-7 block h-px w-full max-w-[17rem] bg-[#dfe4f5]" aria-hidden="true" />
      <span className="mx-auto mt-6 block max-w-[18rem] text-left text-base leading-7 text-[#66709a]">{method.body}</span>
    </button>
  );
}

export function CreationScreen({ decks = [], mediaStore, persistImportedDecks, supabase, supabaseUrl = "", onCreated, onAppendManualCard, onJob, showAiDrafts = false, aiDraftSurface, enableServerApkgImport = false }: any) {
  const [selectedMethod, setSelectedMethod] = React.useState<any>(null);
  const availableCreationMethods = showAiDrafts ? creationMethods : creationMethods.filter((method) => method.id !== "ai");
  const selectedMethodMeta = availableCreationMethods.find((method) => method.id === selectedMethod);
  const serverApkgImport = React.useMemo(() => enableServerApkgImport && supabase && supabaseUrl ? createServerApkgImportClient({ client: supabase, supabaseUrl }) : null, [enableServerApkgImport, supabase, supabaseUrl]);
  const accountWorkflow = React.useMemo(() => createCreationWorkflow({ mediaStore, persistImportedDecks, serverApkgImport }), [mediaStore, persistImportedDecks, serverApkgImport]);

  function renderSelectedMethod() {
    if (selectedMethod === "import") return <ImportCreationPanel decks={decks} onCreated={onCreated} workflow={accountWorkflow} mediaStore={mediaStore} serverApkgEnabled={enableServerApkgImport} />;
    if (selectedMethod === "manual") return <ManualCreationPanelV2 decks={decks} onCreated={onCreated} onAppendManualCard={onAppendManualCard} />;
    if (selectedMethod === "ai" && showAiDrafts) return <AiCreationPanel onCreated={onCreated} onJob={onJob} surface={aiDraftSurface} />;
    return null;
  }

  return (
    <div className="grid min-h-[calc(100vh-10rem)] content-start gap-7">
      <PageHeader eyebrow="Erstellen" title="Neue Karten" />
      {selectedMethod ? (
        <section className="grid min-h-[calc(100vh-16rem)] content-start gap-5" aria-label={selectedMethodMeta?.title ?? "Kartenerstellung"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setSelectedMethod(null)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/78 px-3 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
              <ArrowLeft size={16} aria-hidden="true" />
              Auswahl
            </button>
            {selectedMethodMeta ? <p className="text-sm font-semibold uppercase tracking-wide text-[#66709a]">{selectedMethodMeta.eyebrow}</p> : null}
          </div>
          {renderSelectedMethod()}
        </section>
      ) : (
        <section className="grid min-h-[calc(100vh-18rem)] items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6" aria-label="Erstellungsart">
          {availableCreationMethods.map((method) => (
            <CreationMethodButton key={method.id} method={method} isSelected={false} onSelect={() => setSelectedMethod(method.id)} />
          ))}
        </section>
      )}
    </div>
  );
}
