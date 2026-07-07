import React from "react";
import { AlertCircle, Bot, CheckCircle2, ClipboardCheck, Database, FileArchive, FileSpreadsheet, FileText, Image, Loader2, PenLine, Trash2, Upload, WandSparkles } from "lucide-react";
import { createCreationWorkflow } from "../creationWorkflow.js";
import { CardHtml, useDeckMediaUrls } from "../ui/cardMedia.jsx";
import { CoreModeControl, OrbIcon, PageHeader, SoftPanel, StatTile } from "../ui/coreUi.jsx";
import { cardTypeOptions, formatBytes, importSteps } from "./screenConstants.js";

const creationWorkflow = createCreationWorkflow();

function ApkgImportPanel({ existingDecks = [], onImported }) {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [job, setJob] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [mediaStatus, setMediaStatus] = React.useState(null);
  const [activeStep, setActiveStep] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);
  const { urls: previewMediaUrls, missing: previewMissingMedia } = useDeckMediaUrls(preview?.deck);

  async function parseFile(file) {
    setSelectedFile(file);
    setPreview(null);
    setMediaStatus(null);
    setJob({ fileName: file.name, fileSize: file.size, status: "parsing", warnings: [], errors: [] });
    setIsParsing(true);

    try {
      const result = await creationWorkflow.parseApkgFile(file, { onStep: setActiveStep, existingDecks });
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

  function handleFileInput(event) {
    const file = event.target.files?.[0];
    if (file) void parseFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  }

  async function handleCommit() {
    if (!preview) return;
    const result = await creationWorkflow.commitApkgPreview(preview, { existingDecks });
    if (result.report.errors.length > 0 || !result.deck) {
      setJob((currentJob) => ({
        ...currentJob,
        status: "error",
        warnings: [...new Set([...(currentJob?.warnings ?? []), ...(result.report.warnings ?? [])])],
        errors: [...new Set([...(currentJob?.errors ?? []), ...(result.report.errors ?? [])])],
      }));
      setPreview((currentPreview) => (currentPreview ? { ...currentPreview, importReport: result.report } : currentPreview));
      return;
    }
    setJob((currentJob) => ({ ...currentJob, status: "done", warnings: [...new Set([...(currentJob?.warnings ?? []), ...(result.report.warnings ?? [])])] }));
    setPreview((currentPreview) => (currentPreview ? { ...currentPreview, importReport: result.report } : currentPreview));
    onImported(result.decks?.length ? result.decks : result.deck);
  }

  const report = preview?.importReport ?? null;
  const apkgReport = report?.apkg ?? {};
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

        {selectedFile ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={isParsing} onClick={() => void parseFile(selectedFile)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-teal-700 disabled:text-slate-400">
              <Database size={16} aria-hidden="true" />
              Import pruefen
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
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {job.errors.map((error) => (
              <p key={error}>{error}</p>
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
                  <h3 className="mt-1 text-2xl font-semibold text-[#17214f]">{preview.deck.name}</h3>
                </div>
                <button type="button" disabled={previewErrors.length > 0 || isParsing} onClick={() => void handleCommit()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
                  <Database size={17} aria-hidden="true" />
                  Import uebernehmen
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Decks" value={apkgReport.detectedDecks?.length ?? preview.deck.importMeta.detectedDecks.length} />
                <StatTile label="Notes" value={apkgReport.detectedNotes ?? preview.deck.importMeta.detectedNotes} />
                <StatTile label="Varianten" value={apkgReport.detectedVariants ?? preview.deck.importMeta.detectedCards} />
                <StatTile label="Dubletten" value={report?.duplicates?.length ?? 0} />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[#66709a]">
                <p>Medien: {preview.deck.importMeta.hasMedia ? `${preview.deck.importMeta.mediaCount} erkannt` : "keine"} · Hierarchie-Knoten: {preview.deck.importMeta.deckHierarchy?.length ?? 0}</p>
                {mediaStatus ? <p>Medienspeicher: {mediaStatus.persisted ? `${mediaStatus.count} Dateien persistent` : `${mediaStatus.count} Dateien nur temporär`}</p> : null}
                {previewMissingMedia.length > 0 ? <p>{previewMissingMedia.length} Mediendateien fehlen im lokalen Speicher.</p> : null}
                <p>Lernfortschritt: {report?.hasAnkiScheduling ? "Anki-Daten erkannt, nicht uebernommen" : "neuer CoRe-FSRS-State"}</p>
              </div>
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
                <article key={card.id} className="rounded-[18px] border border-[#dde3f4] bg-white/72 p-5 shadow-[0_18px_55px_rgba(91,105,154,0.10)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="rounded-xl bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Originalkarte</span>
                    <span className="text-xs font-medium uppercase tracking-wide text-[#66709a]">{card.kind}</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Front</p>
                      <CardHtml html={card.originalFront} mediaUrls={previewMediaUrls} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#66709a]">Back</p>
                      <CardHtml html={card.originalBack} mediaUrls={previewMediaUrls} />
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

function TextCsvImportPanel({ onImported }) {
  const [mode, setMode] = React.useState("text");
  const [deckName, setDeckName] = React.useState("Importierter Stapel");
  const [content, setContent] = React.useState("");
  const [report, setReport] = React.useState(null);

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
          <CoreModeControl value={mode === "text" ? "auto" : "manual"} onChange={(value) => setMode(value === "manual" ? "csv" : "text")} />
          <div className="grid grid-cols-3 gap-2">
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
            <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-4 text-sm text-[#66709a]">
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
        />
      </div>
    </SoftPanel>
  );
}

function ManualCreationPanel({ onCreated }) {
  const [deckName, setDeckName] = React.useState("Manueller Kartenstapel");
  const [cardType, setCardType] = React.useState("basic");
  const [front, setFront] = React.useState("");
  const [back, setBack] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [activeField, setActiveField] = React.useState("front");
  const [document, setDocument] = React.useState(null);
  const [documentText, setDocumentText] = React.useState("");
  const [selection, setSelection] = React.useState("");
  const [status, setStatus] = React.useState("");

  async function handleDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextDocument = await creationWorkflow.readSourceDocument(file);
    setDocument(nextDocument);
    setDocumentText(nextDocument.text);
    setStatus(nextDocument.textExtractionStatus === "success" ? "Textlayer geladen." : "Dokument als Quelle gespeichert; Textextraktion steht aus.");
  }

  function captureSelection() {
    const selectedText = window.getSelection?.().toString().trim() || "";
    const next = creationWorkflow.captureManualSelection({ activeField, front, back, documentText, selectedText });
    if (!next.changed) return;
    setSelection(next.selection);
    setFront(next.front);
    setBack(next.back);
  }

  function createManualDeck() {
    const deck = creationWorkflow.createManualDeck({
      deckName,
      cardType,
      front,
      back,
      tags,
      document,
      documentText,
      selection,
      activeField,
    });
    onCreated(deck);
    setStatus("Originalkarte gespeichert.");
  }

  const canCreate = creationWorkflow.canCreateManualCard({ front, back, cardType });

  return (
    <SoftPanel className="p-6">
      <div className="mb-5 flex items-center gap-3">
        <OrbIcon icon={PenLine} className="bg-sky-50 text-sky-700" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Manuelle Erstellung</p>
          <h2 className="text-2xl font-semibold text-[#17214f]">Karte mit Dokumentanker</h2>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Dokument
            <span className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[#cfd6ed] px-3 text-[#66709a]">
              <FileText size={17} aria-hidden="true" />
              <input type="file" accept=".txt,.md,.markdown,.pdf,.docx,image/*" onChange={handleDocument} />
            </span>
          </label>
          {document ? (
            <div className="rounded-xl border border-[#e3e7f5] bg-[#f8f9fe] p-3 text-sm text-[#66709a]">
              {cardType === "image-occlusion" ? <Image className="mb-2 text-sky-700" size={18} aria-hidden="true" /> : null}
              <p className="font-semibold text-[#17214f]">{document.fileName}</p>
              <p>{document.textExtractionStatus}</p>
            </div>
          ) : null}
          <textarea
            className="min-h-80 rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6"
            value={documentText}
            onChange={(event) => setDocumentText(event.target.value)}
            placeholder="Dokumenttext"
          />
          <button type="button" onClick={captureSelection} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm font-semibold text-[#4f5eb1] hover:bg-white">
            <ClipboardCheck size={16} aria-hidden="true" />
            Auswahl übernehmen
          </button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kartenstapel
              <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Kartentyp
              <select className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={cardType} onChange={(event) => setCardType(event.target.value)}>
                {cardTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setActiveField("front")} className={`min-h-10 rounded-xl text-sm font-semibold ${activeField === "front" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Vorderseite aktiv
            </button>
            <button type="button" onClick={() => setActiveField("back")} className={`min-h-10 rounded-xl text-sm font-semibold ${activeField === "back" ? "bg-[#4f5eb1] text-white" : "border border-[#dfe4f5] text-[#4f5eb1]"}`}>
              Rückseite aktiv
            </button>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Vorderseite
            <textarea className="min-h-28 rounded-xl border border-[#dfe4f5] p-3" value={front} onFocus={() => setActiveField("front")} onChange={(event) => setFront(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Rückseite
            <textarea className="min-h-28 rounded-xl border border-[#dfe4f5] p-3" value={back} onFocus={() => setActiveField("back")} onChange={(event) => setBack(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
            Tags
            <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="biologie zelle prüfung" />
          </label>
          <button type="button" disabled={!canCreate} onClick={createManualDeck} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            <Database size={17} aria-hidden="true" />
            Originalkarte speichern
          </button>
          {status ? <p className="text-sm text-[#66709a]">{status}</p> : null}
        </div>
      </div>
    </SoftPanel>
  );
}

function AiCreationPanel({ onCreated, onJob }) {
  const [config, setConfig] = React.useState({
    language: "Deutsch",
    cardCount: 6,
    detailLevel: "normal",
    cardTypes: ["basic", "cloze"],
    focus: "Prüfungswissen",
    subject: "",
    costTier: "balanced",
  });
  const [document, setDocument] = React.useState(() => creationWorkflow.createInitialAiDocument());
  const [draftDeck, setDraftDeck] = React.useState(null);
  const [draftCards, setDraftCards] = React.useState([]);
  const [status, setStatus] = React.useState("");

  function updateConfig(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function toggleCardType(cardType) {
    setConfig((current) => creationWorkflow.toggleAiCardType(current, cardType));
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocument(await creationWorkflow.readSourceDocument(file));
  }

  function updateDocumentText(text) {
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

  function updateDraft(cardId, key, value) {
    setDraftCards((cards) => creationWorkflow.updateDraftCard(cards, cardId, { [key]: value }));
  }

  function acceptDrafts() {
    if (!draftDeck || draftCards.length === 0) return;
    const acceptedDeck = creationWorkflow.acceptAiDrafts(draftDeck, draftCards);
    onCreated(acceptedDeck);
    setStatus("Entwürfe übernommen.");
  }

  return (
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
          <textarea className="min-h-48 rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6" value={document.text} onChange={(event) => updateDocumentText(event.target.value)} placeholder="Quellentext" />
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["language", "Sprache"],
              ["detailLevel", "Detailgrad"],
              ["focus", "Fokus"],
              ["subject", "Fach"],
            ].map(([key, label]) => (
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
          {status ? <p className="text-sm text-[#66709a]">{status}</p> : null}
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
                  <textarea className="min-h-20 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalFront} onChange={(event) => updateDraft(card.id, "originalFront", event.target.value)} />
                  <textarea className="mt-3 min-h-24 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalBack} onChange={(event) => updateDraft(card.id, "originalBack", event.target.value)} />
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
  );
}

const creationMethods = [
  { id: "anki", title: "Anki APKG", eyebrow: "Import", body: "Decks, Notes, Karten und Raw-Fallbacks.", icon: FileArchive, color: "teal" },
  { id: "text", title: "Text / CSV / Excel", eyebrow: "Import", body: "Front/Back-Daten schnell übernehmen.", icon: FileSpreadsheet, color: "emerald" },
  { id: "manual", title: "Manuell", eyebrow: "Dokumentanker", body: "Karten mit aktiver Front/Back-Auswahl.", icon: PenLine, color: "sky" },
  { id: "ai", title: "KI-Drafts", eyebrow: "Review-first", body: "Strukturierte Entwürfe aus Quellen.", icon: WandSparkles, color: "indigo" },
];

function CreationMethodButton({ method, isSelected, onSelect }) {
  const Icon = method.icon;
  const colorClass = method.color === "teal" ? "text-teal-700 bg-teal-50" : method.color === "emerald" ? "text-emerald-700 bg-emerald-50" : method.color === "sky" ? "text-sky-700 bg-sky-50" : "text-indigo-700 bg-indigo-50";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[18px] border border-[#dde3f4] bg-white/72 p-6 text-left shadow-[0_18px_55px_rgba(91,105,154,0.12)] transition hover:-translate-y-1 ${isSelected ? "ring-2 ring-[#8790d8]" : ""}`}
    >
      <OrbIcon icon={Icon} className={colorClass} />
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-[#66709a]">{method.eyebrow}</p>
      <h3 className="mt-2 text-2xl font-semibold text-[#17214f]">{method.title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#66709a]">{method.body}</p>
    </button>
  );
}

export function CreationScreen({ decks = [], onCreated, onJob }) {
  const [selectedMethod, setSelectedMethod] = React.useState("anki");

  function renderSelectedMethod() {
    if (selectedMethod === "anki") return <ApkgImportPanel existingDecks={decks} onImported={onCreated} />;
    if (selectedMethod === "text") return <TextCsvImportPanel onImported={onCreated} />;
    if (selectedMethod === "manual") return <ManualCreationPanel onCreated={onCreated} />;
    return <AiCreationPanel onCreated={onCreated} onJob={onJob} />;
  }

  return (
    <div className="grid gap-7">
      <PageHeader eyebrow="Erstellen" title="Neue Karten" body="Import, manuelle Erstellung und KI-Drafts." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {creationMethods.map((method) => (
          <CreationMethodButton key={method.id} method={method} isSelected={selectedMethod === method.id} onSelect={() => setSelectedMethod(method.id)} />
        ))}
      </section>
      {renderSelectedMethod()}
    </div>
  );
}
