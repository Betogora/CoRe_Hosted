import React from "react";
import { AlertCircle, CheckCircle2, Database, FileArchive, Loader2 } from "lucide-react";
import type { ApkgCreationPreview, CreationWorkflow } from "../creationWorkflow.ts";
import type { ApkgCloudProgress, ApkgImportJob, ApkgImportSession, ApkgProgressPhase } from "../apkgImportSession.ts";
import type { Card, Deck, Note } from "../coreTypes.ts";
import { projectImportUiState, type ImportUiState } from "../importUiState.ts";
import type { MediaSyncProgress, MediaSyncResult, MediaSyncStatus, MediaSyncTask } from "../mediaStore.ts";
import { ANKI_PACKAGE_MAX_BYTES, type ApkgTranslationReport, type ImportMediaFile } from "../apkgImport.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { NoteCardContent } from "../ui/NoteCardContent.tsx";
import { OrbIcon, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { FileDropField } from "../ui/FileDropField.tsx";
import { formatBytes, importSteps } from "./screenConstants.ts";

type ApkgWorkflow = Pick<CreationWorkflow, "commitApkgPreview" | "parseApkgFile">;

export interface ImportCompletion {
  deck: Deck;
  createdCount: number;
}

export interface ApkgImportPanelProps {
  workflow: ApkgWorkflow;
  session: ApkgImportSession;
  onSessionChange: React.Dispatch<React.SetStateAction<ApkgImportSession>>;
  isSessionCurrent: (version: number) => boolean;
  onResetSession: (disposeWorker?: boolean) => void;
  onCompleted: (completion: ImportCompletion) => unknown;
}

const ANALYSIS_PROGRESS_BY_STEP: Record<string, number> = {
  validate: 5,
  collection: 25,
  cards: 50,
  translate: 70,
  preview: 85,
};

const APKG_SAMPLE_CARD_LIMIT = 3;

const TRANSLATOR_LABELS: Record<string, string> = {
  "anki-basic": "Frage und Antwort",
  "anki-cloze": "Lückentext",
  "anki-image-occlusion": "Bildverdeckung",
  "image-occlusion-enhanced": "Image Occlusion Enhanced",
  "multiple-choice-for-anki": "Multiple Choice",
  anking: "AnKing",
  generic: "Generisch",
  "field-list": "Feldliste",
};

const EMPTY_MEDIA: ImportMediaFile[] = [];

function normalizeProgress(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function mediaProgressPercent(progress: MediaSyncProgress, status: MediaSyncStatus): number {
  if (status === "cloud-ready") return 100;
  if (progress.total <= 0) return 0;
  return Math.min(99, normalizeProgress((progress.completed / progress.total) * 100));
}

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
    syncing_cloud: "Cloud-Daten werden synchronisiert",
    syncing_media: "Medien werden synchronisiert",
    succeeded: "Erfolgreich",
    partial: "Teilweise fertig",
    failed_retryable: "Fehlgeschlagen, erneut versuchbar",
    failed_terminal: "Fehlgeschlagen",
    cancelled: "Abgebrochen",
  }[status];
}

function ApkgPreviewBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-control bg-core-success-soft px-3 py-1 core-caption !font-semibold text-core-text">{children}</span>;
}

/** Object URLs for the sample media of the preview; they are revoked with the preview. */
function useSampleMediaUrls(files: ImportMediaFile[]) {
  const [urlsBySha1, setUrlsBySha1] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return undefined;
    const urls = Object.fromEntries(files.map((file) => [file.sha1, URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.mimeType }))]));
    setUrlsBySha1(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urlsBySha1;
}

function ApkgCardSample({ note, card, notetypeName, urlsBySha1 }: { note: Note; card: Card; notetypeName: string; urlsBySha1: Record<string, string> }) {
  const mediaUrls = React.useMemo(
    () => Object.fromEntries(Object.entries(note.media).flatMap(([name, sha1]) => urlsBySha1[sha1] ? [[name, urlsBySha1[sha1]]] : [])),
    [note.media, urlsBySha1],
  );
  return (
    <article className="core-surface-raised rounded-panel p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <ApkgPreviewBadge>Originalkarte</ApkgPreviewBadge>
        <span className="core-caption font-medium uppercase tracking-wide text-core-muted">{notetypeName}</span>
      </div>
      <NoteCardContent note={note} card={card} surface="preview" revealed onReveal={() => undefined} mediaUrls={mediaUrls} />
    </article>
  );
}

function studyLabel(study: ApkgTranslationReport["notetypes"][number]["study"]) {
  const migrated = study["fsrs-memory-state"] + study["revlog-replay"] + study["classic-state"];
  return migrated === 0 ? "kein Lernstand" : `${migrated} mit Lernstand`;
}

function NotetypeReport({ report }: { report: ApkgTranslationReport }) {
  return (
    <section className="rounded-control border border-core-border bg-core-surface p-4" aria-labelledby="apkg-notetypes-heading">
      <h4 id="apkg-notetypes-heading" className="font-semibold text-core-text">Notiztypen</h4>
      <ul className="mt-3 grid gap-3 core-body text-core-muted">
        {report.notetypes.map((notetype) => (
          <li key={notetype.ankiNotetypeId} data-testid="apkg-notetype-report" className="grid gap-1 border-b border-core-subtle pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-core-secondary">{notetype.name}</span>
              <span>{TRANSLATOR_LABELS[notetype.translator.id] ?? notetype.translator.id}</span>
            </div>
            <p>
              {notetype.notes} {notetype.notes === 1 ? "Inhalt" : "Inhalte"} · {notetype.cards} {notetype.cards === 1 ? "Karte" : "Karten"} · {studyLabel(notetype.study)}
            </p>
            {notetype.fallbackNotes > 0 ? <p className="text-core-text">{notetype.fallbackNotes} {notetype.fallbackNotes === 1 ? "Inhalt wird" : "Inhalte werden"} generisch als Feldliste übernommen.</p> : null}
            {notetype.untranslatableNotes > 0 ? <p className="text-core-text">{notetype.untranslatableNotes} {notetype.untranslatableNotes === 1 ? "Inhalt ohne darstellbares Feld wird" : "Inhalte ohne darstellbares Feld werden"} übersprungen.</p> : null}
            {notetype.unmappedFields.length > 0 ? <p>Nur im Editor sichtbar: {notetype.unmappedFields.join(", ")}</p> : null}
            {notetype.missingMedia.length > 0 ? <p className="text-core-text">{notetype.missingMedia.length} {notetype.missingMedia.length === 1 ? "Medium fehlt" : "Medien fehlen"} im Paket.</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ApkgImportPanel({ workflow, session, onSessionChange, isSessionCurrent, onResetSession, onCompleted }: ApkgImportPanelProps) {
  const completionDeliveredRef = React.useRef(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const { selectedFile, job, preview, mediaStatus, isParsing, mediaTask, cloudTask, cloudProgress, completedDeck, completedCount, reimport, phaseProgress } = session;
  const sessionVersion = session.version;
  const completedMediaSyncStatus = mediaStatus?.status ?? null;
  const sampleUrlsBySha1 = useSampleMediaUrls(preview?.sampleMedia ?? EMPTY_MEDIA);

  function updateSession(update: (current: ApkgImportSession) => ApkgImportSession) {
    onSessionChange((current) => current.version === sessionVersion ? update(current) : current);
  }

  function setJob(update: React.SetStateAction<ApkgImportJob | null>) {
    updateSession((current) => ({ ...current, job: typeof update === "function" ? update(current.job) : update }));
  }

  function setPreview(update: React.SetStateAction<ApkgCreationPreview | null>) {
    updateSession((current) => ({ ...current, preview: typeof update === "function" ? update(current.preview) : update }));
  }

  function setMediaStatus(value: MediaSyncResult | null) { updateSession((current) => ({ ...current, mediaStatus: value })); }
  function setIsParsing(value: boolean) { updateSession((current) => ({ ...current, isParsing: value })); }
  function setMediaTask(value: MediaSyncTask | null) { updateSession((current) => ({ ...current, mediaTask: value })); }
  function setCloudTask(value: ApkgImportSession["cloudTask"]) { updateSession((current) => ({ ...current, cloudTask: value })); }
  function setCloudProgress(value: ApkgCloudProgress | null) { updateSession((current) => ({ ...current, cloudProgress: value })); }
  function setCompletedDeck(value: Deck | null) { updateSession((current) => ({ ...current, completedDeck: value })); }
  function setCompletedCount(value: number) { updateSession((current) => ({ ...current, completedCount: value })); }
  function setSelectedFile(value: File | null) { updateSession((current) => ({ ...current, selectedFile: value })); }
  function setPhaseProgress(update: React.SetStateAction<{ phase: ApkgProgressPhase; percent: number } | null>) {
    updateSession((current) => ({ ...current, phaseProgress: typeof update === "function" ? update(current.phaseProgress) : update }));
  }

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  React.useEffect(() => {
    if (job?.status !== "done" || (mediaTask && completedMediaSyncStatus !== "cloud-ready") || !completedDeck) return;
    if (completionDeliveredRef.current || !isSessionCurrent(sessionVersion)) return;
    completionDeliveredRef.current = true;
    onCompleted({ deck: completedDeck, createdCount: completedCount });
    onResetSession();
  }, [completedCount, completedDeck, completedMediaSyncStatus, isSessionCurrent, job?.status, mediaTask, onCompleted, onResetSession, sessionVersion]);

  function beginProgress(phase: ApkgProgressPhase) {
    setPhaseProgress({ phase, percent: 0 });
  }

  function reportProgress(phase: ApkgProgressPhase, percent: number) {
    const next = normalizeProgress(percent);
    setPhaseProgress((current) => {
      if (current?.phase !== phase) return { phase, percent: next };
      return next > current.percent ? { phase, percent: next } : current;
    });
  }

  async function parseFile(file: File) {
    preview?.commitGraph.dispose();
    setSelectedFile(file);
    setPreview(null);
    setMediaStatus(null);
    setMediaTask(null);
    setCloudTask(null);
    setCloudProgress(null);
    setCompletedDeck(null);
    setCompletedCount(0);
    updateSession((current) => ({ ...current, reimport: null }));
    completionDeliveredRef.current = false;
    beginProgress("analyzing");
    if (file.size > ANKI_PACKAGE_MAX_BYTES) {
      setPhaseProgress(null);
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: ["Die Anki-Datei ist größer als 2 GiB. Bitte wähle eine kleinere Datei aus."],
      });
      return;
    }
    setJob({ fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] });
    setIsParsing(true);

    try {
      const result = await workflow.parseApkgFile(file, {
        onStep: (step) => reportProgress("analyzing", ANALYSIS_PROGRESS_BY_STEP[step] ?? 0),
      });
      if (!isSessionCurrent(sessionVersion)) {
        result.preview?.commitGraph.dispose();
        return;
      }
      reportProgress("analyzing", 100);
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

  async function handleCommit() {
    if (!preview) return;
    beginProgress("committing");
    setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "committing" }));
    setIsParsing(true);
    try {
      const result = await workflow.commitApkgPreview(preview, {
        onProgress: (percent) => reportProgress("committing", percent),
      });
      if (!result.rootDeck) throw new Error("Der Import hat keinen Stapel angelegt.");
      setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "syncing_cloud" }));
      setCompletedDeck(result.rootDeck);
      setCompletedCount(result.createdCount);
      updateSession((current) => ({
        ...current,
        reimport: result.keptLocalEdits > 0 || result.missingInPackage > 0 ? { keptLocalEdits: result.keptLocalEdits, missingInPackage: result.missingInPackage } : null,
      }));
      const importCloudTask = result.cloudTask;
      const importMediaTask = result.mediaTask;
      let mediaStarted = false;
      setCloudTask(importCloudTask);
      setMediaTask(importMediaTask);
      beginProgress("syncing_cloud");
      importCloudTask.subscribe((cloudResult) => {
        if (cloudResult.status === "local-pending") {
          setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "syncing_cloud" }));
          return;
        }
        if (cloudResult.status === "blocked") {
          setJob((current) => ({
            ...(current ?? { warnings: [], errors: [] }),
            status: "error",
            errors: [...new Set([...(current?.errors ?? []), cloudResult.message])],
          }));
          return;
        }
        if (cloudResult.status !== "cloud-ready" || mediaStarted) return;
        mediaStarted = true;
        reportProgress("syncing_cloud", 100);
        if (!importMediaTask) {
          setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "done" }));
          return;
        }
        beginProgress("syncing_media");
        setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "syncing_media" }));
        importMediaTask.subscribe((progress: MediaSyncProgress, status: MediaSyncStatus) => {
          setCloudProgress({ ...progress, status });
          reportProgress("syncing_media", mediaProgressPercent(progress, status));
        });
        void importMediaTask.result
          .then((mediaResult: MediaSyncResult) => {
            setMediaStatus(mediaResult);
            setCloudProgress({ ...mediaResult.progress, status: mediaResult.status });
            reportProgress("syncing_media", mediaProgressPercent(mediaResult.progress, mediaResult.status));
            setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: mediaResult.status === "cloud-ready" ? "done" : "partial" }));
          })
          .catch((error) => {
            setJob((current) => ({
              ...(current ?? { warnings: [], errors: [] }),
              status: "error",
              errors: [...(current?.errors ?? []), error instanceof Error ? error.message : "Die Mediensynchronisierung ist fehlgeschlagen."],
            }));
          });
      });
    } catch (error) {
      setJob((current) => ({
        ...(current ?? { warnings: [], errors: [] }),
        status: "error",
        errors: [...(current?.errors ?? []), error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      }));
    } finally {
      setIsParsing(false);
      preview.commitGraph.dispose();
    }
  }

  const report = preview?.report ?? null;
  const previewWarnings = [...new Set(report?.warnings ?? [])];
  const previewErrors = [...new Set([...(job?.errors ?? []), ...(report?.errors ?? [])])];
  const uiState = projectImportUiState({
    jobStatus: job?.status,
    cloudStatus: cloudTask?.status,
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
    : uiState.status === "syncing_cloud"
    ? 3
    : uiState.status === "syncing_media"
    ? 4
    : 5;
  const activeProgressPhase: ApkgProgressPhase | null = uiState.status === "analyzing" || uiState.status === "committing" || uiState.status === "syncing_cloud" || uiState.status === "syncing_media"
    ? uiState.status
    : null;
  const progressPaused = activeProgressPhase === "syncing_cloud"
    ? cloudTask?.status === "local-pending"
    : activeProgressPhase === "syncing_media" && cloudProgress?.status === "paused";
  const activeProgressPercent = activeProgressPhase && phaseProgress?.phase === activeProgressPhase ? phaseProgress.percent : 0;
  const fileInteractionLocked = activeProgressPhase !== null;
  const progressRunning = fileInteractionLocked && !progressPaused;
  const previewVisible = Boolean(preview) && !["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);

  React.useEffect(() => {
    if (!activeProgressPhase || progressPaused || prefersReducedMotion) return undefined;
    const interval = window.setInterval(() => {
      setPhaseProgress((current) => {
        if (!current || current.phase !== activeProgressPhase || current.percent >= 95) return current;
        const increment = Math.max(1, Math.ceil((95 - current.percent) * 0.08));
        return { ...current, percent: Math.min(95, current.percent + increment) };
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [activeProgressPhase, prefersReducedMotion, progressPaused]);

  return (
    <div className="grid gap-4">
      <SoftPanel className="p-6">
        <div className="mb-6 flex items-center gap-3">
          <OrbIcon icon={FileArchive} className="bg-core-success-soft text-core-text" />
          <h2 className="core-heading-2 font-semibold text-core-text">Anki-Dateien importieren</h2>
        </div>

        <FileDropField
          kind="apkg"
          selected={Boolean(selectedFile)}
          onFile={parseFile}
          disabled={fileInteractionLocked}
          busy={progressRunning}
        />

        {selectedFile ? (
          <div
            className="relative mt-4 overflow-hidden rounded-control border border-core-border bg-core-surface p-4"
            data-testid="apkg-file-progress"
            role={activeProgressPhase ? "progressbar" : undefined}
            aria-label={activeProgressPhase ? `Importfortschritt für ${selectedFile.name}` : undefined}
            aria-valuemin={activeProgressPhase ? 0 : undefined}
            aria-valuemax={activeProgressPhase ? 100 : undefined}
            aria-valuenow={activeProgressPhase ? activeProgressPercent : undefined}
            aria-valuetext={activeProgressPhase ? `${importStatusLabel(uiState.status)}: ${activeProgressPercent} Prozent${progressPaused ? ", pausiert" : ""}` : undefined}
            aria-busy={activeProgressPhase ? progressRunning : undefined}
          >
            {activeProgressPhase ? (
              <span
                data-testid="apkg-progress-fill"
                className="pointer-events-none absolute inset-y-0 left-0 bg-core-subtle transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${activeProgressPercent}%` }}
                aria-hidden="true"
              />
            ) : null}
            <div className="relative grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <p className="col-span-2 min-w-0 truncate core-body font-semibold text-core-text sm:col-span-1">{selectedFile.name}</p>
              <p className={`core-body font-semibold ${activeProgressPhase ? "text-core-text" : "text-core-muted"}`}>
                {activeProgressPhase ? `${activeProgressPercent} %` : importStatusLabel(uiState.status)}
              </p>
              <p className="justify-self-end whitespace-nowrap core-body text-core-muted">{formatBytes(selectedFile.size)}</p>
            </div>
          </div>
        ) : null}

        <ol className="mt-6 grid gap-2 md:grid-cols-6" aria-label="Importstatus">
          {importSteps.map((step) => {
            const stepIndex = importSteps.findIndex((item) => item.id === step.id);
            const isActive = stepIndex === currentStepIndex;
            const isDone = stepIndex < currentStepIndex || uiState.status === "succeeded";
            const isFailure = ["failed_retryable", "failed_terminal", "cancelled"].includes(uiState.status);
            const label = step.id === "complete" && currentStepIndex === 5 ? importStatusLabel(uiState.status) : step.label;
            return (
              <li key={step.id} className={`flex items-center gap-2 rounded-control border px-3 py-2 ${isActive ? isFailure ? "border-core-danger bg-core-danger-soft" : uiState.status === "partial" ? "border-core-warning bg-core-warning-soft" : "border-core-success bg-core-success-soft" : "border-core-border"}`}>
                {isActive && progressRunning ? <Loader2 className="shrink-0 animate-spin text-core-text motion-reduce:animate-none" size={16} aria-hidden="true" /> : isDone ? <CheckCircle2 className="shrink-0 text-core-text" size={16} aria-hidden="true" /> : isActive && isFailure ? <AlertCircle className="shrink-0 text-core-text" size={16} aria-hidden="true" /> : <span className="size-4 shrink-0 rounded-round border border-core-border" />}
                <span className="core-caption font-semibold text-core-secondary">{label}</span>
              </li>
            );
          })}
        </ol>

        {uiState.status === "syncing_cloud" && cloudTask?.status === "local-pending" ? (
          <div className="core-status-warning mt-4 core-body" role="status">
            <p>Die Karten sind lokal gespeichert; die Synchronisierung steht noch aus.</p>
            <ActionButton type="button" variant="primary" onClick={() => void cloudTask.retry()} className="mt-3">Cloud-Sync erneut versuchen</ActionButton>
          </div>
        ) : null}

        {reimport ? (
          <div className="core-status-info mt-4 core-body" role="status" data-testid="apkg-reimport-summary">
            {reimport.keptLocalEdits > 0 ? <p>{reimport.keptLocalEdits} lokal {reimport.keptLocalEdits === 1 ? "bearbeiteter Inhalt bleibt" : "bearbeitete Inhalte bleiben"} unverändert.</p> : null}
            {reimport.missingInPackage > 0 ? <p>{reimport.missingInPackage} {reimport.missingInPackage === 1 ? "Karte fehlt" : "Karten fehlen"} im Paket und {reimport.missingInPackage === 1 ? "bleibt" : "bleiben"} erhalten.</p> : null}
          </div>
        ) : null}

        {uiState.status === "partial" ? (
          <div className="core-status-warning mt-4 core-body" role="status">
            <p className="font-semibold">Import teilweise abgeschlossen.</p>
            <p>Die Karten sind lokal gespeichert; die Cloud- oder Mediensynchronisierung steht noch aus.</p>
            {mediaStatus && "message" in mediaStatus && mediaStatus.message ? <p className="mt-2">{mediaStatus.message}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {cloudTask?.status === "local-pending" ? <ActionButton type="button" variant="primary" onClick={() => void cloudTask.retry()}>Cloud-Sync erneut versuchen</ActionButton> : null}
              {mediaTask && cloudProgress?.status === "paused" ? <ActionButton type="button" variant="primary" onClick={() => mediaTask.resume()}>Medien-Sync fortsetzen</ActionButton> : null}
              {completedDeck ? <ActionButton type="button" variant="secondary" onClick={() => {
                completionDeliveredRef.current = true;
                onCompleted({ deck: completedDeck, createdCount: completedCount });
                onResetSession();
              }}>Karten jetzt verwenden</ActionButton> : null}
            </div>
          </div>
        ) : null}

        {uiState.status === "failed_retryable" || uiState.status === "failed_terminal" ? (
          <div className="core-status-error mt-6 core-body" role="alert">
            {(job?.errors.length ? job.errors : ["Die APKG-Datei konnte nicht verarbeitet werden."]).map((error, index) => (
              <p key={`${error}-${index}`}>{error}</p>
            ))}
          </div>
        ) : null}
        {uiState.status === "cancelled" ? (
          <div className="core-status-info mt-6 core-body" role="status">
            <p>Import abgebrochen. Es wurden aus diesem Vorgang keine weiteren Karten übernommen.</p>
          </div>
        ) : null}
      </SoftPanel>

      <section className="grid gap-4">
        {previewVisible && preview ? (
          <>
            <SoftPanel className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="core-body font-semibold uppercase tracking-wide text-core-text">Importvorschau</p>
                  <h3 className="mt-1 core-heading-2 font-semibold text-core-text">{preview.rootDeckName}</h3>
                </div>
                {uiState.status === "preview" ? (
                  <ActionButton type="button" variant="primary" icon={Database} loading={isParsing} disabled={previewErrors.length > 0} onClick={() => void handleCommit()}>Import übernehmen</ActionButton>
                ) : null}
              </div>
              <div className="mt-4 rounded-control border border-core-border bg-core-surface px-4 py-3 core-body text-core-muted">
                <span className="font-semibold text-core-text">{job?.fileName ?? selectedFile?.name ?? "APKG-Datei"}</span>
                <span> · {formatBytes(job?.fileSize ?? selectedFile?.size ?? 0)}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Erkannte Stapel", value: report?.imported.decks ?? 0 },
                  { label: "Karten", value: report?.imported.cards ?? 0 },
                  { label: "Medien vorhanden", value: report?.imported.mediaFiles ?? 0 },
                  { label: "Medien fehlen", value: report?.missingMedia.length ?? 0 },
                ].map(({ label, value }) => (
                  <StatTile key={label} data-testid="apkg-stat-tile" size="compact" label={label} value={value} />
                ))}
              </div>
              {report ? (
                <div className="mt-6 grid gap-4">
                  <NotetypeReport report={report} />
                  {report.missingMedia.length > 0 ? (
                    <div className="flex gap-2 rounded-control bg-core-warning-soft px-3 py-2 core-body text-core-text">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{report.missingMedia.length === 1 ? "1 referenziertes Medium fehlt" : `${report.missingMedia.length} referenzierte Medien fehlen`} im Paket. Betroffene Karten können ohne Bild oder Ton erscheinen.</span>
                    </div>
                  ) : null}
                  {previewWarnings.length > 0 ? (
                    <section className="rounded-control bg-core-warning-soft px-3 py-2 core-body text-core-text" aria-labelledby="apkg-warnings-heading">
                      <h4 id="apkg-warnings-heading" className="flex items-center gap-2 font-semibold">
                        <AlertCircle className="shrink-0" size={16} aria-hidden="true" />
                        {previewWarnings.length} {previewWarnings.length === 1 ? "Warnung" : "Warnungen"}
                      </h4>
                      <ul className="mt-3 list-disc space-y-1 pl-6">
                        {previewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </section>
                  ) : null}
                </div>
              ) : null}
              {mediaTask && uiState.status === "syncing_media" && cloudProgress?.status !== "cloud-ready" && cloudProgress?.status !== "cancelled" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {cloudProgress?.status === "paused" ? <ActionButton type="button" variant="secondary" onClick={() => mediaTask.resume()}>Fortsetzen</ActionButton> : <ActionButton type="button" variant="secondary" onClick={() => void mediaTask.pause()}>Pausieren</ActionButton>}
                  <ActionButton type="button" variant="destructive" onClick={() => void mediaTask.cancel()}>Upload abbrechen</ActionButton>
                </div>
              ) : null}
            </SoftPanel>

            {preview.samples.length > 0 ? (
              <section className="core-surface-raised rounded-panel p-6" aria-labelledby="apkg-card-examples-heading">
                <h3 id="apkg-card-examples-heading" className="font-semibold text-core-text">Kartenbeispiele</h3>
                <div className="mt-4 grid gap-4">
                  {preview.samples.slice(0, APKG_SAMPLE_CARD_LIMIT).map(({ note, card, notetypeName }) => <ApkgCardSample key={card.id} note={note} card={card} notetypeName={notetypeName} urlsBySha1={sampleUrlsBySha1} />)}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
