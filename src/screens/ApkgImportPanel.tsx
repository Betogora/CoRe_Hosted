import React from "react";
import { AlertCircle, ChevronDown, Database } from "lucide-react";
import type { ApkgCreationPreview, CreationWorkflow, InterruptedImport } from "../creationWorkflow.ts";
import type { ApkgImportJob, ApkgImportSession, ApkgProgressPhase, ImportCompletion } from "../apkgImportSession.ts";
import { ANKI_PACKAGE_MAX_BYTES, type ApkgTranslationReport, type ImportMediaFile, type ImportSample } from "../apkgImport.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { NoteCardContent } from "../ui/NoteCardContent.tsx";
import { NoteLayoutContext, type NoteLayoutSource } from "../ui/noteLayoutContext.ts";
import { CoreTag, SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { FileDropField } from "../ui/FileDropField.tsx";
import { useSuccessToast } from "../ui/feedbackUi.tsx";
import { isTextImportFile } from "../textImport.ts";
import { formatBytes } from "./screenConstants.ts";

type ApkgWorkflow = Pick<CreationWorkflow, "commitApkgPreview" | "parseApkgFile">;

export interface ApkgImportPanelProps {
  workflow: ApkgWorkflow;
  session: ApkgImportSession;
  onSessionChange: React.Dispatch<React.SetStateAction<ApkgImportSession>>;
  isSessionCurrent: (version: number) => boolean;
  onResetSession: (disposeWorker?: boolean) => void;
  onCompleted: (completion: ImportCompletion) => unknown;
  /** A text or table file goes to the text import instead. */
  onTextFile: (file: File) => unknown;
  /** An earlier takeover on this device that did not finish. */
  interruptedImport?: InterruptedImport | null;
}

type ImportUiStatus = "idle" | "analyzing" | "preview" | "committing" | "failed" | "cancelled";

const ANALYSIS_PROGRESS_BY_STEP: Record<string, number> = {
  validate: 5,
  collection: 25,
  cards: 50,
  translate: 70,
  preview: 85,
};

const APKG_SAMPLE_CARD_LIMIT = 3;
const IMPORT_FILE_ACCEPT = ".apkg,.colpkg,.txt,.csv,.tsv";

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

function ApkgPreviewBadge({ children }: { children: React.ReactNode }) {
  return <CoreTag tone="info">{children}</CoreTag>;
}

/** Object URLs for the sample media of the preview; they are revoked with the preview. */
export function useSampleMediaUrls(files: ImportMediaFile[]) {
  const [urlsBySha1, setUrlsBySha1] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return undefined;
    const urls = Object.fromEntries(files.map((file) => [file.sha1, URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.mimeType }))]));
    setUrlsBySha1(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urlsBySha1;
}

export function ApkgCardSample({ note, card, notetypeName, noteTypeSource, urlsBySha1 }: ImportSample & { urlsBySha1: Record<string, string> }) {
  const mediaUrls = React.useMemo(
    () => Object.fromEntries(Object.entries(note.media).flatMap(([name, sha1]) => urlsBySha1[sha1] ? [[name, urlsBySha1[sha1]]] : [])),
    [note.media, urlsBySha1],
  );
  // The package is not saved yet, so the preview reads its template from the translation.
  const layout = React.useMemo<NoteLayoutSource>(() => ({ loadNoteTypeSource: async () => noteTypeSource, deckName: () => "" }), [noteTypeSource]);
  return (
    <article className="core-surface-raised rounded-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <ApkgPreviewBadge>Originalkarte</ApkgPreviewBadge>
        <span className="core-caption text-core-muted">{notetypeName}</span>
      </div>
      <NoteLayoutContext.Provider value={layout}>
        <NoteCardContent note={note} card={card} surface="preview" revealed onReveal={() => undefined} mediaUrls={mediaUrls} />
      </NoteLayoutContext.Provider>
    </article>
  );
}

function studyLabel(study: ApkgTranslationReport["notetypes"][number]["study"]) {
  const migrated = study["fsrs-memory-state"] + study["revlog-replay"] + study["classic-state"];
  return migrated === 0 ? "kein Lernstand" : `${migrated} mit Lernstand`;
}

function NotetypeReport({ report }: { report: ApkgTranslationReport }) {
  return (
    <section aria-labelledby="apkg-notetypes-heading">
      <h4 id="apkg-notetypes-heading" className="border-b border-core-border pb-2 core-caption font-semibold text-core-muted">Notiztypen</h4>
      <ul className="grid core-body text-core-secondary">
        {report.notetypes.map((notetype) => (
          <li key={notetype.ankiNotetypeId} data-testid="apkg-notetype-report" className="grid gap-1 border-b border-core-border py-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-core-text">{notetype.name}</span>
              <CoreTag tone="neutral">{TRANSLATOR_LABELS[notetype.translator.id] ?? notetype.translator.id}</CoreTag>
            </div>
            <p>
              {notetype.notes} {notetype.notes === 1 ? "Inhalt" : "Inhalte"} · {notetype.cards} {notetype.cards === 1 ? "Karte" : "Karten"} · {studyLabel(notetype.study)} · {notetype.layout === "original" ? "Originallayout" : "CoRe-Design"}
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

export function ApkgImportPanel({ workflow, session, onSessionChange, isSessionCurrent, onResetSession, onCompleted, onTextFile, interruptedImport = null }: ApkgImportPanelProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const setSuccessToast = useSuccessToast();
  const { selectedFile, job, preview, isParsing, completion, phaseProgress } = session;
  const sessionVersion = session.version;
  const sampleUrlsBySha1 = useSampleMediaUrls(preview?.sampleMedia ?? EMPTY_MEDIA);

  function updateSession(update: (current: ApkgImportSession) => ApkgImportSession) {
    onSessionChange((current) => current.version === sessionVersion ? update(current) : current);
  }

  function setJob(update: React.SetStateAction<ApkgImportJob | null>) {
    updateSession((current) => ({ ...current, job: typeof update === "function" ? update(current.job) : update }));
  }

  function setIsParsing(value: boolean) { updateSession((current) => ({ ...current, isParsing: value })); }
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

  // A takeover that finished while the screen was left is shown on return; it never navigates on its own.
  React.useEffect(() => {
    if (!completion || !isSessionCurrent(sessionVersion)) return;
    onCompleted(completion);
    onResetSession();
  }, [completion, isSessionCurrent, onCompleted, onResetSession, sessionVersion]);

  function reportProgress(phase: ApkgProgressPhase, percent: number) {
    const next = normalizeProgress(percent);
    setPhaseProgress((current) => {
      if (current?.phase !== phase) return { phase, percent: next };
      return next > current.percent ? { phase, percent: next } : current;
    });
  }

  async function parseFile(file: File) {
    preview?.commitGraph.dispose();
    updateSession((current) => ({ ...current, selectedFile: file, preview: null, completion: null, phaseProgress: { phase: "analyzing", percent: 0 } }));
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
    const analysisAbort = new AbortController();
    updateSession((current) => ({ ...current, analysisAbort }));

    try {
      const result = await workflow.parseApkgFile(file, {
        onStep: (step) => reportProgress("analyzing", ANALYSIS_PROGRESS_BY_STEP[step] ?? 0),
        signal: analysisAbort.signal,
      });
      if (!isSessionCurrent(sessionVersion) || analysisAbort.signal.aborted) {
        result.preview?.commitGraph.dispose();
        if (analysisAbort.signal.aborted) {
          setPhaseProgress(null);
          setJob({ fileName: file.name, fileSize: file.size, status: "cancelled", warnings: [], errors: [] });
        }
        return;
      }
      setPhaseProgress(null);
      setJob(result.job);
      updateSession((current) => ({ ...current, preview: result.preview }));
    } catch (error) {
      setPhaseProgress(null);
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: [error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
      });
    } finally {
      setIsParsing(false);
      updateSession((current) => current.analysisAbort === analysisAbort ? { ...current, analysisAbort: null } : current);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setPhaseProgress({ phase: "committing", percent: 0 });
    setJob((current) => ({ ...(current ?? { warnings: [], errors: [] }), status: "committing" }));
    setIsParsing(true);
    try {
      const result = await workflow.commitApkgPreview(preview, {
        onProgress: (percent) => reportProgress("committing", percent),
      });
      if (!result.rootDeck) throw new Error("Der Import hat keinen Stapel angelegt.");
      const { rootDeck, createdCount, keptLocalEdits, missingInPackage, cloudTask, mediaTask } = result;
      // The cards are learnable now; cloud confirmation and media upload continue in the background, and a failure
      // there still reaches the learner after the screen moved on.
      cloudTask.subscribe((cloudResult) => { if (cloudResult.status === "blocked") setSuccessToast(cloudResult.message, { appearance: "neutral" }); });
      void mediaTask?.result.then(
        (mediaResult) => { if (mediaResult.status !== "cloud-ready") setSuccessToast(mediaResult.message, { appearance: "neutral" }); },
        () => { if (cloudTask.status !== "blocked") setSuccessToast("Die Medien sind auf diesem Gerät gespeichert; ihr Upload wird später wiederholt.", { appearance: "neutral" }); },
      );
      updateSession((current) => ({
        ...current,
        phaseProgress: null,
        job: { ...(current.job ?? { warnings: [], errors: [] }), status: "done" },
        completion: {
          deck: rootDeck,
          createdCount,
          reimport: keptLocalEdits > 0 || missingInPackage > 0 ? { keptLocalEdits, missingInPackage } : null,
          samples: preview.samples.slice(0, APKG_SAMPLE_CARD_LIMIT),
          sampleMedia: preview.sampleMedia,
        },
      }));
    } catch (error) {
      setPhaseProgress(null);
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
  const uiStatus: ImportUiStatus = job?.status === "error" ? "failed"
    : job?.status === "cancelled" ? "cancelled"
    : job?.status === "committing" ? "committing"
    : preview && !isParsing ? "preview"
    : isParsing || job?.status === "parsing" ? "analyzing"
    : "idle";
  const activeProgressPhase: ApkgProgressPhase | null = uiStatus === "analyzing" || uiStatus === "committing" ? uiStatus : null;
  const activeProgressPercent = activeProgressPhase && phaseProgress?.phase === activeProgressPhase ? phaseProgress.percent : 0;
  const previewVisible = Boolean(preview) && (uiStatus === "preview" || uiStatus === "committing");

  React.useEffect(() => {
    if (!activeProgressPhase || prefersReducedMotion) return undefined;
    const interval = window.setInterval(() => {
      setPhaseProgress((current) => {
        if (!current || current.phase !== activeProgressPhase || current.percent >= 95) return current;
        const increment = Math.max(1, Math.ceil((95 - current.percent) * 0.08));
        return { ...current, percent: Math.min(95, current.percent + increment) };
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [activeProgressPhase, prefersReducedMotion]);

  return (
    <div className="grid gap-4">
      <SoftPanel className="p-6">
        {interruptedImport && uiStatus === "idle" ? (
          <div className="core-status-warning mb-4 core-body" role="status" data-testid="apkg-interrupted-import">
            <p>Der Import von „{interruptedImport.fileName}“ wurde unterbrochen: {interruptedImport.committedCards.toLocaleString("de-DE")} von {interruptedImport.cardCount.toLocaleString("de-DE")} Karten sind übernommen. Wähle dieselbe Datei erneut, um ihn zu vervollständigen.</p>
          </div>
        ) : null}
        <FileDropField
          accept={IMPORT_FILE_ACCEPT}
          ariaLabel="Anki-Paket, Text- oder CSV-Datei auswählen oder ablegen"
          prompt="APKG-, COLPKG-, TXT-, CSV- oder TSV-Datei hier ablegen"
          actionLabel={selectedFile ? "Andere Datei auswählen" : "Datei auswählen"}
          onFile={(file) => {
            if (!isTextImportFile(file.name)) return parseFile(file);
            onResetSession();
            onTextFile(file);
          }}
          disabled={activeProgressPhase !== null}
          busy={activeProgressPhase !== null}
        />
        <p className="mt-3 core-body text-core-muted">Tabellen aus Excel, Numbers oder Quizlet vorher als CSV oder Text speichern.</p>

        {selectedFile ? (
          <div
            className="relative mt-4 overflow-hidden rounded-inset bg-core-subtle px-4 py-3"
            data-testid="apkg-file-progress"
            role={activeProgressPhase ? "progressbar" : undefined}
            aria-label={activeProgressPhase ? `${activeProgressPhase === "analyzing" ? "Analyse" : "Übernahme"} von ${selectedFile.name}` : undefined}
            aria-valuemin={activeProgressPhase ? 0 : undefined}
            aria-valuemax={activeProgressPhase ? 100 : undefined}
            aria-valuenow={activeProgressPhase ? activeProgressPercent : undefined}
            aria-busy={activeProgressPhase ? true : undefined}
          >
            {activeProgressPhase ? (
              <span
                data-testid="apkg-progress-fill"
                className="core-creation-progress-fill pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${activeProgressPercent}%` }}
                aria-hidden="true"
              />
            ) : null}
            <div className="relative grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <p className="col-span-2 min-w-0 truncate core-body font-semibold text-core-text sm:col-span-1">{selectedFile.name}</p>
              <p className={`core-body font-semibold tabular-nums ${activeProgressPhase ? "text-core-action" : "text-core-secondary"}`}>
                {activeProgressPhase ? `${activeProgressPercent} %` : uiStatus === "failed" ? "Fehlgeschlagen" : uiStatus === "cancelled" ? "Abgebrochen" : ""}
              </p>
              <p className="justify-self-end whitespace-nowrap core-body text-core-muted">{formatBytes(selectedFile.size)}</p>
            </div>
          </div>
        ) : null}
        {uiStatus === "analyzing" && session.analysisAbort ? (
          <ActionButton type="button" variant="secondary" className="mt-3" onClick={() => session.analysisAbort?.abort()}>Analyse abbrechen</ActionButton>
        ) : null}

        {uiStatus === "failed" ? (
          <div className="core-status-error mt-6 core-body" role="alert">
            {(job?.errors.length ? job.errors : ["Die APKG-Datei konnte nicht verarbeitet werden."]).map((error, index) => (
              <p key={`${error}-${index}`}>{error}</p>
            ))}
          </div>
        ) : null}
        {uiStatus === "cancelled" ? (
          <div className="core-status-info mt-6 core-body" role="status">
            <p>Analyse abgebrochen. Es wurden keine Karten übernommen; wähle die Datei erneut, um neu zu beginnen.</p>
          </div>
        ) : null}
      </SoftPanel>

      <section className="grid gap-4">
        {previewVisible && preview ? (
          <>
            <SoftPanel className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h3 className="core-heading-2 text-core-text">{preview.rootDeckName}</h3>
                <ActionButton type="button" variant="primary" icon={Database} loading={uiStatus === "committing"} disabled={previewErrors.length > 0 || uiStatus === "committing"} onClick={() => void handleCommit()}>Import übernehmen</ActionButton>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Erkannte Stapel", value: report?.imported.decks ?? 0 },
                  { label: "Karten", value: report?.imported.cards ?? 0 },
                  { label: "Medien vorhanden", value: report?.imported.mediaFiles ?? 0 },
                  { label: "Medien fehlen", value: report?.missingMedia.length ?? 0 },
                ].map(({ label, value }) => (
                  <StatTile key={label} data-testid="apkg-stat-tile" label={label} value={value} />
                ))}
              </div>
              {report ? (
                <div className="mt-6 grid gap-4">
                  <NotetypeReport report={report} />
                  {report.missingMedia.length > 0 ? (
                    <div className="core-status-warning flex gap-3">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{report.missingMedia.length === 1 ? "1 referenziertes Medium fehlt" : `${report.missingMedia.length} referenzierte Medien fehlen`} im Paket. Betroffene Karten können ohne Bild oder Ton erscheinen.</span>
                    </div>
                  ) : null}
                  {previewWarnings.length > 0 ? (
                    <section className="core-status-warning !py-1" aria-labelledby="apkg-warnings-heading">
                      <details>
                        <summary id="apkg-warnings-heading" className="flex min-h-control cursor-pointer items-center gap-2 font-semibold">
                          <AlertCircle className="shrink-0" size={16} aria-hidden="true" />
                          {previewWarnings.length} {previewWarnings.length === 1 ? "Warnung" : "Warnungen"}
                          <ChevronDown className="ml-auto shrink-0" size={16} aria-hidden="true" />
                        </summary>
                        <ul className="mt-2 list-disc space-y-1 pl-6">
                          {previewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      </details>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </SoftPanel>

            {preview.samples.length > 0 ? (
              <section className="core-surface-raised rounded-panel p-6" aria-labelledby="apkg-card-examples-heading">
                <h3 id="apkg-card-examples-heading" className="core-heading-2 text-core-text">Kartenbeispiele</h3>
                <div className="mt-4 grid gap-4">
                  {preview.samples.slice(0, APKG_SAMPLE_CARD_LIMIT).map((sample) => <ApkgCardSample key={sample.card.id} {...sample} urlsBySha1={sampleUrlsBySha1} />)}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
