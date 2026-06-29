import React from "react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Database,
  FileArchive,
  FileText,
  Home,
  Image,
  Layers,
  Loader2,
  PenLine,
  PlusSquare,
  RotateCcw,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { commitImport, createApkgImportPreview } from "./apkgImport.js";
import { acceptAiDraftDeck, createAiDraftDeck, createManualCoreDeck } from "./coreModel.js";
import { createCoreRepository } from "./coreRepository.js";
import { createMenuModel } from "./menuModel.js";

const iconByKey = {
  chart: BarChart3,
  home: Home,
  learn: BookOpen,
  plus: PlusSquare,
};

const importSteps = [
  { id: "validate", label: "Datei pruefen" },
  { id: "collection", label: "Anki-Collection lesen" },
  { id: "cards", label: "Karten extrahieren" },
  { id: "preview", label: "Importvorschau erstellen" },
];

const menu = createMenuModel();

function getIcon(iconKey) {
  return iconByKey[iconKey] ?? Home;
}

function formatBytes(size) {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function CardHtml({ html }) {
  return (
    <div
      className="prose prose-slate max-w-none text-sm leading-6 prose-img:max-h-36 prose-img:rounded"
      dangerouslySetInnerHTML={{ __html: html || "<span></span>" }}
    />
  );
}

function SoftPanel({ children, className = "" }) {
  return (
    <section className={`rounded-[18px] border border-[#dde3f4] bg-white/70 shadow-[0_18px_55px_rgba(91,105,154,0.12)] backdrop-blur ${className}`}>
      {children}
    </section>
  );
}

function OrbIcon({ icon: Icon, className = "bg-[#eceefd] text-[#6672bf]" }) {
  return (
    <div className={`grid size-14 place-items-center rounded-full ${className}`}>
      <Icon size={24} aria-hidden="true" />
    </div>
  );
}

function MiniProgress({ value = 0 }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-[#e8ecf8]">
      <div className="h-full rounded-full bg-gradient-to-r from-[#7d89d9] to-[#596bc4]" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

function DonutValue({ value }) {
  return (
    <div
      className="grid size-10 place-items-center rounded-full"
      style={{ background: `conic-gradient(#6c78cf ${value * 3.6}deg, #e9edf8 0deg)` }}
      aria-label={`${value} Prozent`}
    >
      <span className="block size-7 rounded-full bg-white" />
    </div>
  );
}

function getDeckCards(deck) {
  return Array.isArray(deck.cards) ? deck.cards : [];
}

function getTotalCards(decks) {
  return decks.reduce((sum, deck) => sum + (deck.cardCount ?? getDeckCards(deck).length), 0);
}

const cardTypeOptions = [
  { value: "basic", label: "Basic front/back" },
  { value: "basic-reversed", label: "Basic reversed" },
  { value: "cloze", label: "Cloze deletion" },
  { value: "image-occlusion", label: "Image occlusion" },
  { value: "multiple-choice", label: "Multiple choice" },
  { value: "free-text", label: "Free text" },
];

function MethodPrinciples() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: FileArchive, title: "Anki APKG", body: "Importierte Karten werden als Originalanker gespeichert." },
          { icon: PenLine, title: "Manuell", body: "Eigene Karten nutzen dieselben Typen und dasselbe CoreCard-Modell." },
          { icon: Bot, title: "KI-assistiert", body: "KI-Ergebnisse bleiben Entwuerfe, bis du sie annimmst." },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-teal-700 text-white">
                <Icon size={17} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ManualCreationPanel({ onCreated }) {
  const [deckName, setDeckName] = React.useState("Manueller Kartenstapel");
  const [cardType, setCardType] = React.useState("basic");
  const [front, setFront] = React.useState("");
  const [back, setBack] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [documentName, setDocumentName] = React.useState("");
  const [documentText, setDocumentText] = React.useState("");
  const [selection, setSelection] = React.useState("");
  const [status, setStatus] = React.useState("");

  async function handleDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setDocumentName(file.name);

    if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
      setDocumentText(await file.text());
      setStatus("Textdokument geladen. Markiere Text im Dokumentfeld und uebernimm ihn in eine Karte.");
      return;
    }

    setDocumentText("");
    setStatus("PDF, DOCX und Bilder sind als Dokumentkontext erfasst; Textextraktion folgt spaeter serverseitig.");
  }

  function captureSelection() {
    const selectedText = window.getSelection?.().toString().trim();
    const nextSelection = selectedText || documentText.slice(0, 400);
    setSelection(nextSelection);
    if (!front) setFront(nextSelection);
  }

  function createManualDeck() {
    const deck = createManualCoreDeck({
      deckName,
      card: {
        cardType,
        front,
        back,
        tags,
        answerOptions: cardType === "multiple-choice" ? back.split("\n").filter(Boolean) : [],
        mediaRefs: documentName && cardType === "image-occlusion" ? [documentName] : [],
      },
      documentContext: {
        fileName: documentName,
        selection,
      },
    });

    createCoreRepository().saveDeck(deck);
    onCreated(deck);
    setStatus("Karte als unveraenderliches Original gespeichert.");
  }

  const canCreate = front.trim() && (back.trim() || cardType === "image-occlusion");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-md bg-sky-700 text-white">
          <PenLine size={21} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Manuelle Erstellung</p>
          <h2 className="text-2xl font-semibold text-slate-950">Karte mit Dokumentkontext anlegen</h2>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Kartenstapel
            <input className="min-h-11 rounded-md border border-slate-300 px-3" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Kartentyp
            <select className="min-h-11 rounded-md border border-slate-300 px-3" value={cardType} onChange={(event) => setCardType(event.target.value)}>
              {cardTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Dokument
            <span className="flex min-h-11 items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-slate-600">
              <FileText size={17} aria-hidden="true" />
              <input type="file" accept=".txt,.pdf,.docx,image/*" onChange={handleDocument} />
            </span>
          </label>
          {documentName && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              {cardType === "image-occlusion" ? <Image className="mb-2 text-sky-700" size={18} aria-hidden="true" /> : null}
              {documentName}
            </div>
          )}
        </div>

        <div className="grid gap-4">
          <textarea
            className="min-h-32 rounded-md border border-slate-300 p-3 text-sm leading-6"
            value={documentText}
            onChange={(event) => setDocumentText(event.target.value)}
            placeholder="Textdokument anzeigen, Text markieren und uebernehmen"
          />
          <button type="button" onClick={captureSelection} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <ClipboardCheck size={16} aria-hidden="true" />
            Auswahl in Front uebernehmen
          </button>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Front
              <textarea className="min-h-28 rounded-md border border-slate-300 p-3" value={front} onChange={(event) => setFront(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Back
              <textarea className="min-h-28 rounded-md border border-slate-300 p-3" value={back} onChange={(event) => setBack(event.target.value)} />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Tags
            <input className="min-h-11 rounded-md border border-slate-300 px-3" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="z.B. biologie zelle pruefung" />
          </label>
          <button
            type="button"
            disabled={!canCreate}
            onClick={createManualDeck}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Database size={17} aria-hidden="true" />
            Originalkarte speichern
          </button>
          {status && <p className="text-sm text-slate-600">{status}</p>}
        </div>
      </div>
    </section>
  );
}

function AiCreationPanel({ onCreated }) {
  const [config, setConfig] = React.useState({
    language: "Deutsch",
    cardCount: 8,
    detailLevel: "mittel",
    closeness: "nah an der Quelle",
    cardTypes: ["basic", "cloze"],
    difficulty: "mittel",
    subject: "",
    style: "praezise und ruhig",
  });
  const [draftDeck, setDraftDeck] = React.useState(null);

  function updateConfig(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function toggleCardType(cardType) {
    setConfig((current) => {
      const cardTypes = current.cardTypes.includes(cardType)
        ? current.cardTypes.filter((value) => value !== cardType)
        : [...current.cardTypes, cardType];
      return { ...current, cardTypes };
    });
  }

  function prepareReviewTray() {
    const deck = createAiDraftDeck({
      deckName: config.subject || "KI-Entwuerfe",
      config,
      drafts: [],
    });
    setDraftDeck(deck);
  }

  function acceptDrafts() {
    if (!draftDeck || draftDeck.cards.length === 0) return;
    const acceptedDeck = acceptAiDraftDeck(draftDeck);
    createCoreRepository().saveDeck(acceptedDeck);
    onCreated(acceptedDeck);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-md bg-indigo-700 text-white">
          <WandSparkles size={21} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">KI-assistierte Erstellung</p>
          <h2 className="text-2xl font-semibold text-slate-950">Konfigurieren, pruefen, erst dann speichern</h2>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["language", "Sprache"],
            ["detailLevel", "Detailgrad"],
            ["closeness", "Quellennaehe"],
            ["difficulty", "Schwierigkeit"],
            ["style", "Stil"],
            ["subject", "Fach/Kontext"],
          ].map(([key, label]) => (
            <label key={key} className="grid gap-2 text-sm font-medium text-slate-700">
              {label}
              <input className="min-h-11 rounded-md border border-slate-300 px-3" value={config[key]} onChange={(event) => updateConfig(key, event.target.value)} />
            </label>
          ))}
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Kartenanzahl
            <input className="min-h-11 rounded-md border border-slate-300 px-3" type="number" min="1" max="50" value={config.cardCount} onChange={(event) => updateConfig("cardCount", Number(event.target.value))} />
          </label>
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium text-slate-700">Kartentypen</p>
            <div className="flex flex-wrap gap-2">
              {cardTypeOptions.map((option) => (
                <label key={option.value} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700">
                  <input type="checkbox" checked={config.cardTypes.includes(option.value)} onChange={() => toggleCardType(option.value)} />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <button type="button" onClick={prepareReviewTray} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md bg-indigo-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800">
            <Bot size={17} aria-hidden="true" />
            Review-Bereich vorbereiten
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Draft Review</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Entwuerfe muessen angenommen werden</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            In diesem MVP wird noch keine KI-API aufgerufen. Sobald die Generation angebunden ist, landen Karten hier als Drafts und werden erst nach deiner Annahme zu unveraenderlichen Originalkarten.
          </p>
          <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            {draftDeck ? "Review-Bereich bereit. Aktuell liegen 0 KI-Drafts vor." : "Noch nicht vorbereitet."}
          </div>
          <button
            type="button"
            disabled={!draftDeck || draftDeck.cards.length === 0}
            onClick={acceptDrafts}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            Ausgewaehlte Drafts annehmen
          </button>
        </div>
      </div>
    </section>
  );
}

function ApkgImportPanel({ onImported }) {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [job, setJob] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [activeStep, setActiveStep] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);

  async function parseFile(file) {
    setSelectedFile(file);
    setPreview(null);
    setJob({
      fileName: file.name,
      fileSize: file.size,
      status: "parsing",
      warnings: [],
      errors: [],
      detectedDecks: [],
      detectedCards: 0,
      detectedNotes: 0,
    });
    setIsParsing(true);

    try {
      const result = await createApkgImportPreview(file, setActiveStep);
      setJob(result.job);
      setPreview(result.preview);
    } catch (error) {
      setJob({
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        warnings: [],
        errors: [error instanceof Error ? error.message : "Der Import ist fehlgeschlagen."],
        detectedDecks: [],
        detectedCards: 0,
        detectedNotes: 0,
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

  function handleCommit() {
    if (!preview) return;
    const deck = commitImport(preview);
    setJob((currentJob) => ({ ...currentJob, status: "done" }));
    onImported(deck);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-teal-600 text-white">
            <FileArchive size={21} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Anki-Import</p>
            <h2 className="text-2xl font-semibold text-slate-950">APKG als Originalanker importieren</h2>
          </div>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
            isDragging ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-teal-400"
          }`}
        >
          <Upload className="mb-4 text-teal-700" size={32} aria-hidden="true" />
          <span className="text-base font-semibold text-slate-950">.apkg-Datei hier ablegen oder auswaehlen</span>
          <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">
            CoRe liest die Collection lokal im Browser. Die Originalkarten bleiben unveraendert erhalten.
          </span>
          <input className="sr-only" type="file" accept=".apkg" onChange={handleFileInput} />
        </label>

        {selectedFile && (
          <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">{selectedFile.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {formatBytes(selectedFile.size)} - Status: {job?.status ?? "idle"}
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {importSteps.map((step) => {
            const isActive = activeStep === step.id && isParsing;
            const isDone =
              importSteps.findIndex((item) => item.id === step.id) <
                importSteps.findIndex((item) => item.id === activeStep) || job?.status === "preview" || job?.status === "done";

            return (
              <div key={step.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-4 py-3">
                {isActive ? (
                  <Loader2 className="animate-spin text-teal-700" size={18} aria-hidden="true" />
                ) : isDone ? (
                  <CheckCircle2 className="text-teal-700" size={18} aria-hidden="true" />
                ) : (
                  <span className="size-[18px] rounded-full border border-slate-300" />
                )}
                <span className="text-sm font-medium text-slate-700">{step.label}</span>
              </div>
            );
          })}
        </div>

        {job?.errors?.length > 0 && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {job.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-5">
        {preview ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Importvorschau</p>
                  <h3 className="mt-1 text-2xl font-semibold text-slate-950">{preview.deck.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={handleCommit}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
                >
                  <Database size={17} aria-hidden="true" />
                  Deck importieren
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Decks" value={preview.deck.importMeta.detectedDecks.length} />
                <StatTile label="Notes" value={preview.deck.importMeta.detectedNotes} />
                <StatTile label="Cards" value={preview.deck.importMeta.detectedCards} />
                <StatTile label="Tags" value={preview.deck.tags.length} />
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Medien erkannt: {preview.deck.importMeta.hasMedia ? "ja" : "nein"} - Originalkarten: {preview.deck.cardCount}
              </p>

              {preview.warnings.length > 0 && (
                <div className="mt-5 grid gap-2">
                  {preview.warnings.map((warning) => (
                    <div key={warning} className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              {preview.sampleCards.map((card) => (
                <article key={card.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">Originalkarte</span>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{card.kind}</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Front</p>
                      <CardHtml html={card.originalFront} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Back</p>
                      <CardHtml html={card.originalBack} />
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-500">
                    CoRe-Varianten werden spaeter auf Basis dieses Originals erzeugt.
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Noch keine Vorschau</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-950">Bereit fuer echte Anki-Daten</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Nach dem Upload zeigt CoRe erkannte Decks, Notes, Cards, Tags, Medienreferenzen und Beispielkarten an.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

const creationMethods = [
  {
    id: "anki",
    title: "Anki APKG importieren",
    eyebrow: "Bestehender Kartenstapel",
    body: "Lade ein Anki-Deck hoch und uebernimm Originalkarten, Tags, Fields und Medienreferenzen.",
    icon: FileArchive,
    color: "teal",
  },
  {
    id: "manual",
    title: "Karte manuell erstellen",
    eyebrow: "Eigene Originalkarte",
    body: "Erstelle Basic, Reversed, Cloze, Image Occlusion, Multiple Choice oder Free Text Karten.",
    icon: PenLine,
    color: "sky",
  },
  {
    id: "ai",
    title: "KI-assistiert vorbereiten",
    eyebrow: "Review-first Drafts",
    body: "Konfiguriere KI-Entwuerfe. Gespeichert wird erst nach deiner Annahme.",
    icon: WandSparkles,
    color: "indigo",
  },
];

function CreationMethodButton({ method, isSelected, onSelect }) {
  const Icon = method.icon;

  return (
    <SoftPanel className={`p-8 transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(91,105,154,0.16)] ${isSelected ? "ring-2 ring-[#8790d8]" : ""}`}>
      <div className="flex min-h-[25rem] flex-col items-center text-center">
        <div className="relative mb-8 mt-4 grid h-36 w-full place-items-center">
          <div className="absolute h-28 w-40 rounded-[22px] bg-[#eef1fb] shadow-[0_16px_40px_rgba(91,105,154,0.14)]" />
          <div className="absolute left-1/2 top-4 h-16 w-28 -translate-x-[58%] rotate-[-2deg] rounded-lg bg-white/90 shadow-md" />
          <div className="absolute left-1/2 top-9 h-16 w-28 -translate-x-[20%] rotate-[3deg] rounded-lg bg-white/90 shadow-md" />
          <div
            className={`relative z-10 grid size-20 place-items-center rounded-full text-white shadow-[0_18px_35px_rgba(91,105,154,0.22)] ${
              method.color === "sky" ? "bg-[#7381d6]" : method.color === "indigo" ? "bg-[#7b72d1]" : "bg-[#6d7ed2]"
            }`}
          >
            <Icon size={34} aria-hidden="true" />
          </div>
        </div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#6b74ad]">{method.eyebrow}</p>
        <h3 className="mt-3 text-2xl font-semibold text-[#17214f]">{method.title}</h3>
        <p className="mt-4 max-w-[17rem] flex-1 text-base leading-7 text-[#596489]">{method.body}</p>
        <button
          type="button"
          onClick={onSelect}
          className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] px-4 text-base font-semibold text-[#4f5eb1] transition hover:bg-white"
        >
          Auswaehlen
          <ChevronRight size={19} aria-hidden="true" />
        </button>
      </div>
    </SoftPanel>
  );
}

function CreationScreen({ onCreated }) {
  const [selectedMethod, setSelectedMethod] = React.useState(null);

  function renderSelectedMethod() {
    if (selectedMethod === "anki") {
      return <ApkgImportPanel onImported={onCreated} />;
    }

    if (selectedMethod === "manual") {
      return <ManualCreationPanel onCreated={onCreated} />;
    }

    if (selectedMethod === "ai") {
      return <AiCreationPanel onCreated={onCreated} />;
    }

    return null;
  }

  return (
    <div className="grid gap-8">
      {!selectedMethod && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-4xl font-semibold tracking-normal text-[#17214f]">Wie moechtest du neue Karten erstellen?</h2>
            <p className="mt-4 text-lg text-[#66709a]">Waehle die Methode, die am besten zu deinem Material und deinem Workflow passt.</p>
          </div>
          <Bell className="mt-2 text-[#5361aa]" size={22} aria-hidden="true" />
        </div>
      )}
      {!selectedMethod && (
        <section className="grid gap-7 lg:grid-cols-3">
          {creationMethods.map((method) => (
            <CreationMethodButton
              key={method.id}
              method={method}
              isSelected={selectedMethod === method.id}
              onSelect={() => setSelectedMethod(method.id)}
            />
          ))}
        </section>
      )}
      {selectedMethod && (
        <button
          type="button"
          onClick={() => setSelectedMethod(null)}
          className="inline-flex min-h-10 w-fit items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          Andere Methode waehlen
        </button>
      )}
      {!selectedMethod && (
        <SoftPanel className="flex items-center gap-4 p-5 text-[#4f5eb1]">
          <AlertCircle size={22} aria-hidden="true" />
          <p className="text-base">
            Tipp: Nach der Auswahl oeffnet sich der entsprechende Erstellungs-Workflow. Du kannst den Vorgang jederzeit unterbrechen und spaeter fortsetzen.
          </p>
        </SoftPanel>
      )}
      {renderSelectedMethod()}
    </div>
  );
}

function OverviewScreen({ decks }) {
  const cardCount = getTotalCards(decks);
  const tagCount = new Set(decks.flatMap((deck) => deck.tags)).size;
  const dueCards = Math.min(cardCount, Math.max(0, Math.ceil(cardCount * 0.35)));

  return (
    <div className="grid gap-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-semibold tracking-normal text-[#17214f]">Guten Morgen, Noemi!</h2>
          <p className="mt-3 text-lg text-[#66709a]">Bereit fuer eine weitere produktive Lerneinheit?</p>
        </div>
        <Bell className="mt-2 text-[#5361aa]" size={22} aria-hidden="true" />
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {[
          { icon: CalendarDays, label: "Heute faellig", value: dueCards, hint: "Karten", action: "Jetzt lernen" },
          { icon: TrendingUp, label: "Lernfortschritt", value: `${cardCount ? 68 : 0} %`, hint: "+12 % vs. letzte Woche", progress: cardCount ? 68 : 0 },
          { icon: Target, label: "Streak", value: decks.length ? 14 : 0, hint: "Tage in Folge", dots: true },
          { icon: Clock, label: "Letzte Aktivitaet", value: decks.length ? "Heute" : "-", hint: decks.length ? "09:42 Uhr" : "Noch offen", action: "Weiter machen" },
        ].map((stat) => (
          <SoftPanel key={stat.label} className="p-7">
            <OrbIcon icon={stat.icon} />
            <p className="mt-5 text-base font-medium text-[#4e5b8c]">{stat.label}</p>
            <p className="mt-2 text-4xl font-semibold text-[#17214f]">{stat.value}</p>
            <p className="mt-1 text-sm text-[#66709a]">{stat.hint}</p>
            {stat.progress ? <div className="mt-8"><MiniProgress value={stat.progress} /></div> : null}
            {stat.dots ? (
              <div className="mt-8 flex gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((dot) => (
                  <span key={dot} className={`size-3 rounded-full ${dot < 6 ? "bg-[#7d89d9]" : "border border-[#a8b0df]"}`} />
                ))}
              </div>
            ) : null}
            {stat.action ? (
              <button type="button" className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-[#f8f9fe] px-4 text-sm font-semibold text-[#4f5eb1]">
                {stat.action}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : null}
          </SoftPanel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
        <SoftPanel className="p-7">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#17214f]">Lernfortschritt</h3>
            <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-4 text-sm font-semibold text-[#4f5eb1]">
              Letzte 7 Tage <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="relative h-64 rounded-2xl bg-gradient-to-b from-white to-[#f4f6ff] p-5">
            <div className="absolute inset-x-5 top-10 h-px bg-[#dfe4f2]" />
            <div className="absolute inset-x-5 top-24 h-px bg-[#dfe4f2]" />
            <div className="absolute inset-x-5 top-[9.5rem] h-px bg-[#dfe4f2]" />
            <svg viewBox="0 0 600 180" className="relative z-10 h-full w-full overflow-visible" aria-hidden="true">
              <polyline fill="none" stroke="#7886d8" strokeWidth="4" points="20,145 110,120 200,78 290,72 380,48 480,32 580,18" />
              {[["20", "145"], ["110", "120"], ["200", "78"], ["290", "72"], ["380", "48"], ["480", "32"], ["580", "18"]].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="white" stroke="#7886d8" strokeWidth="3" />
              ))}
            </svg>
            <div className="mt-2 flex justify-between text-sm text-[#66709a]">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => <span key={day}>{day}</span>)}
            </div>
          </div>
        </SoftPanel>

        <SoftPanel className="p-7">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#17214f]">Deine Kartenstapel</h3>
            <button type="button" className="text-sm font-semibold text-[#4f5eb1]">Alle anzeigen</button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#dfe4f5]">
            {(decks.length ? decks.slice(0, 4) : [{ id: "empty", name: "Noch kein Kartenstapel", cardCount: 0, tags: [] }]).map((deck, index) => (
              <div key={deck.id} className="flex items-center gap-4 border-b border-[#e8ecf8] bg-white/60 px-5 py-4 last:border-b-0">
                <OrbIcon icon={Layers} className="size-10 bg-[#eef1fb] text-[#6672bf]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-[#17214f]">{deck.name}</p>
                  <p className="text-sm text-[#66709a]">{deck.cardCount ?? 0} Karten</p>
                </div>
                <DonutValue value={[72, 58, 41, 35][index] ?? 20} />
                <span className="w-10 text-right text-sm font-semibold text-[#66709a]">{[72, 58, 41, 35][index] ?? 20} %</span>
              </div>
            ))}
          </div>
          <button type="button" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#eef1fb] text-sm font-semibold text-[#4f5eb1]">
            <SlidersHorizontal size={17} aria-hidden="true" />
            Stapel verwalten
          </button>
        </SoftPanel>
      </div>

      <div>
        <p className="mb-3 text-base font-semibold text-[#66709a]">Schnelle Aktionen</p>
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            { icon: BookOpen, title: "Lernen", body: "Karten wiederholen und Wissen festigen" },
            { icon: PlusSquare, title: "Neue Karten", body: "Eigene Karten erstellen und organisieren" },
            { icon: BarChart3, title: "Analyse", body: "Fortschritte einsehen und verstehen" },
          ].map((action) => (
            <SoftPanel key={action.title} className="flex items-center gap-5 p-6">
              <OrbIcon icon={action.icon} />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#17214f]">{action.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#66709a]">{action.body}</p>
              </div>
              <ChevronRight className="text-[#6672bf]" size={24} aria-hidden="true" />
            </SoftPanel>
          ))}
        </div>
      </div>
    </div>
  );
}

function LearnScreen({ decks, onStartDeck, onCreateDeck }) {
  const totalCards = getTotalCards(decks);

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-semibold tracking-normal text-[#17214f]">Lernen</h2>
          <p className="mt-3 text-lg text-[#66709a]">Waehle einen Kartenstapel, um mit dem Lernen zu beginnen.</p>
        </div>
        <button type="button" onClick={onCreateDeck} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
          <PlusSquare size={17} aria-hidden="true" />
          Neuen Stapel erstellen
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] bg-white/80 px-5 text-sm font-semibold text-[#4f5eb1]">
          Alle Stapel <ChevronDown size={15} aria-hidden="true" />
        </button>
        <p className="text-sm text-[#66709a]">
          Sortieren: <span className="font-semibold text-[#17214f]">Faellig aufsteigend</span>
        </p>
      </div>

      {decks.length === 0 ? (
        <SoftPanel className="p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <OrbIcon icon={Layers} />
              <div>
                <h3 className="text-xl font-semibold text-[#17214f]">Noch keine Kartenstapel</h3>
                <p className="mt-1 text-[#66709a]">Erstelle oder importiere zuerst einen Stapel und beginne danach mit dem Lernen.</p>
              </div>
            </div>
            <button type="button" onClick={onCreateDeck} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#eef1fb] px-5 text-sm font-semibold text-[#4f5eb1]">
              Neuen Stapel erstellen <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </SoftPanel>
      ) : (
        decks.map((deck, index) => {
          const cards = getDeckCards(deck);
          const due = Math.max(1, Math.ceil((deck.cardCount ?? cards.length) * 0.28));
          const progress = [72, 54, 47, 61][index % 4];

          return (
            <SoftPanel key={deck.id} className="p-6">
              <div className="flex flex-wrap items-center gap-5">
                <OrbIcon icon={Layers} />
                <div className="min-w-[12rem] flex-1">
                  <h3 className="text-xl font-semibold text-[#17214f]">{deck.name}</h3>
                  <p className="mt-1 text-sm text-[#66709a]">{deck.cardCount ?? cards.length} Karten</p>
                </div>
                <div className="grid min-w-20 gap-1">
                  <span className="text-xs font-semibold text-[#66709a]">Faellig</span>
                  <span className="text-2xl font-semibold text-[#17214f]">{due}</span>
                </div>
                <div className="grid min-w-24 gap-1">
                  <span className="text-xs font-semibold text-[#66709a]">Fortschritt</span>
                  <span className="text-2xl font-semibold text-[#17214f]">{progress} %</span>
                </div>
                <DonutValue value={progress} />
                <button
                  type="button"
                  onClick={() => onStartDeck(deck)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f2f4fd] px-5 text-sm font-semibold text-[#4f5eb1] hover:bg-white"
                >
                  Jetzt lernen <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </SoftPanel>
          );
        })
      )}

      <SoftPanel className="border-dashed p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm font-semibold text-[#66709a]">
            Insgesamt bereit: <span className="text-[#17214f]">{totalCards} Originalkarten</span>
          </p>
          <button type="button" onClick={onCreateDeck} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#eef1fb] px-4 text-sm font-semibold text-[#4f5eb1]">
            Neuen Stapel erstellen <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </SoftPanel>
    </div>
  );
}

function DecksScreen({ decks }) {
  const cardCount = getTotalCards(decks);
  return (
    <div className="grid gap-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-semibold tracking-normal text-[#17214f]">Analyse</h2>
          <p className="mt-3 text-lg text-[#66709a]">Detaillierte Einblicke in deinen Lernfortschritt.</p>
        </div>
        <Bell className="mt-2 text-[#5361aa]" size={22} aria-hidden="true" />
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {[
          { icon: TrendingUp, label: "Gesamtfortschritt", value: `${cardCount ? 68 : 0} %`, hint: "+12 % vs. letzte Woche", progress: 68 },
          { icon: Layers, label: "Gelernte Karten", value: cardCount, hint: `${Math.min(cardCount, 186)} vs. letzte Woche`, progress: 72 },
          { icon: Clock, label: "Lernzeit", value: cardCount ? "14 h 32 m" : "0 h", hint: "+2 h 18 m vs. letzte Woche", progress: 64 },
          { icon: Target, label: "Trefferquote", value: cardCount ? "82 %" : "0 %", hint: "+6 % vs. letzte Woche", progress: 82 },
        ].map((stat) => (
          <SoftPanel key={stat.label} className="p-6">
            <OrbIcon icon={stat.icon} />
            <p className="mt-5 text-base font-medium text-[#4e5b8c]">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-[#17214f]">{stat.value}</p>
            <p className="mt-1 text-sm text-[#66709a]">{stat.hint}</p>
            <div className="mt-6"><MiniProgress value={stat.progress} /></div>
          </SoftPanel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <SoftPanel className="p-7">
          <h3 className="text-xl font-semibold text-[#17214f]">Lernfortschritt ueber Zeit</h3>
          <div className="mt-5 h-64 rounded-2xl bg-gradient-to-b from-white to-[#f4f6ff] p-5">
            <svg viewBox="0 0 600 180" className="h-full w-full overflow-visible" aria-hidden="true">
              <polyline fill="rgba(120,134,216,0.12)" stroke="#7886d8" strokeWidth="4" points="20,150 110,125 200,82 290,75 380,45 480,28 580,8 580,180 20,180" />
              {[["20", "150"], ["110", "125"], ["200", "82"], ["290", "75"], ["380", "45"], ["480", "28"], ["580", "8"]].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="white" stroke="#7886d8" strokeWidth="3" />
              ))}
            </svg>
          </div>
        </SoftPanel>

        <SoftPanel className="p-7">
          <h3 className="text-xl font-semibold text-[#17214f]">Karten pro Fach</h3>
          <div className="mt-8 flex h-64 items-end justify-around gap-5 border-b border-[#dfe4f5] pb-4">
            {(decks.length ? decks.slice(0, 5) : [{ name: "Noch offen", cardCount: 0 }]).map((deck, index) => {
              const height = Math.max(18, Math.min(170, (deck.cardCount ?? 0) * 2 + 40));
              return (
                <div key={deck.id ?? deck.name} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-sm font-semibold text-[#17214f]">{deck.cardCount ?? 0}</span>
                  <div className="w-12 rounded-t-lg bg-gradient-to-t from-[#7d89d9] to-[#a8b0ef]" style={{ height }} />
                  <span className="max-w-24 truncate text-xs text-[#66709a]">{deck.name}</span>
                </div>
              );
            })}
          </div>
        </SoftPanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {[
          { title: "Antwortqualitaet", value: cardCount || 0, body: "Sehr gut 32 %, Gut 38 %, Mehr Uebung noetig 20 %, Schwierig 10 %" },
          { title: "Verteilung nach Decks", value: decks.length, body: "Deine aktiven Kartenstapel und ihr Anteil am Lernvolumen." },
          { title: "Insights", value: "4", body: "Beste Lernzeit, schwaechste Kategorie, konstante Verbesserung und Empfehlung." },
        ].map((item) => (
          <SoftPanel key={item.title} className="p-7">
            <h3 className="text-xl font-semibold text-[#17214f]">{item.title}</h3>
            <div className="mt-6 grid place-items-center">
              <div className="grid size-36 place-items-center rounded-full bg-[conic-gradient(#7d89d9_0_240deg,#dfe4f8_240deg_360deg)]">
                <div className="grid size-24 place-items-center rounded-full bg-white text-center">
                  <span className="text-2xl font-semibold text-[#17214f]">{item.value}</span>
                </div>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-[#66709a]">{item.body}</p>
          </SoftPanel>
        ))}
      </div>
    </div>
  );
}

function StudyMode({ deck, onExit }) {
  const cards = getDeckCards(deck);
  const [cardIndex, setCardIndex] = React.useState(0);
  const [showBack, setShowBack] = React.useState(false);
  const card = cards[cardIndex] ?? null;
  const progress = cards.length ? ((cardIndex + 1) / cards.length) * 100 : 0;

  function gradeCard() {
    if (cardIndex < cards.length - 1) {
      setCardIndex((index) => index + 1);
      setShowBack(false);
      return;
    }

    onExit();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#eef2fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <header className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onExit}
              className="grid size-11 place-items-center rounded-full bg-white/75 text-[#4f5eb1] shadow-[0_14px_40px_rgba(91,105,154,0.12)]"
              aria-label="Lernmodus verlassen"
            >
              <X size={22} aria-hidden="true" />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-[#66709a]">{deck.name}</p>
              <p className="mt-1 text-sm text-[#66709a]">{cards.length ? `${cardIndex + 1} / ${cards.length}` : "0 / 0"}</p>
            </div>
            <button type="button" className="grid size-11 place-items-center rounded-full bg-white/75 text-[#4f5eb1] shadow-[0_14px_40px_rgba(91,105,154,0.12)]" aria-label="Lerneinstellungen">
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
          <MiniProgress value={progress} />
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="flex min-h-[56vh] w-full max-w-3xl flex-col justify-center rounded-[28px] border border-[#dfe4f5] bg-white/82 p-8 text-center shadow-[0_30px_90px_rgba(91,105,154,0.18)] sm:p-14">
            {card ? (
              <>
                <p className="mb-8 text-sm font-semibold uppercase tracking-[0.18em] text-[#7a84c7]">{showBack ? "Rueckseite" : "Vorderseite"}</p>
                <div className="mx-auto max-w-2xl text-2xl font-semibold leading-relaxed text-[#17214f] sm:text-4xl">
                  <CardHtml html={showBack ? card.originalBack : card.originalFront} />
                </div>
                <button
                  type="button"
                  onClick={() => setShowBack((value) => !value)}
                  className="mx-auto mt-12 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-[#4f5eb1] hover:bg-[#f3f5fd]"
                >
                  <RotateCcw size={17} aria-hidden="true" />
                  Karte umdrehen
                </button>
              </>
            ) : (
              <div>
                <h1 className="text-3xl font-semibold">Keine Karten in diesem Stapel</h1>
                <p className="mt-3 text-[#66709a]">Fuege zuerst Karten hinzu und starte den Lernmodus danach erneut.</p>
              </div>
            )}
          </div>
        </section>

        <footer className="grid gap-3 sm:grid-cols-4">
          {[
            { key: "again", number: "1", label: "Nochmal", className: "border-red-200 bg-red-50 text-red-600" },
            { key: "hard", number: "2", label: "Schwer", className: "border-orange-200 bg-orange-50 text-orange-600" },
            { key: "good", number: "3", label: "Gut", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
            { key: "easy", number: "4", label: "Einfach", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
          ].map((grade) => (
            <button
              key={grade.key}
              type="button"
              onClick={gradeCard}
              disabled={!card}
              className={`min-h-20 rounded-2xl border text-center shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${grade.className}`}
            >
              <span className="block text-2xl font-semibold">{grade.number}</span>
              <span className="mt-1 block text-sm font-semibold">{grade.label}</span>
            </button>
          ))}
        </footer>
      </div>
    </main>
  );
}

export function App() {
  const [activeView, setActiveView] = React.useState(menu.defaultViewId);
  const [studyDeck, setStudyDeck] = React.useState(null);
  const repository = React.useMemo(() => createCoreRepository(), []);
  const [decks, setDecks] = React.useState(() => repository.listDecks());
  const navigationItems = menu.listNavigationItems();

  function refreshDecks() {
    setDecks(repository.listDecks());
    setActiveView("uebersicht");
  }

  function goToCreation() {
    setActiveView("neue-karten");
  }

  function renderActiveView() {
    if (activeView === "neue-karten") {
      return <CreationScreen onCreated={refreshDecks} />;
    }
    if (activeView === "lernen") {
      return <LearnScreen decks={decks} onStartDeck={setStudyDeck} onCreateDeck={goToCreation} />;
    }
    if (activeView === "analyse") {
      return <DecksScreen decks={decks} />;
    }
    return <OverviewScreen decks={decks} />;
  }

  if (studyDeck) {
    return <StudyMode deck={studyDeck} onExit={() => setStudyDeck(null)} />;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eef1ff,transparent_34%),linear-gradient(135deg,#f8f9ff_0%,#edf1fb_100%)] p-4 text-[#17214f] sm:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[92rem] overflow-hidden rounded-[22px] border border-[#dce2f4] bg-white/52 shadow-[0_30px_90px_rgba(91,105,154,0.18)] backdrop-blur-xl lg:grid-cols-[17.5rem_1fr]">
        <aside className="border-b border-[#dce2f4] bg-white/42 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col px-5 py-7 sm:px-8 lg:py-10">
            <div>
              <h1 className="text-5xl font-semibold tracking-[-0.02em] text-[#17214f]">CoRe</h1>
              <p className="mt-2 text-base text-[#66709a]">Study & Flashcards</p>
            </div>

            <nav aria-label="Hauptmenue" className="mt-14 grid gap-4">
              {navigationItems.map((view) => {
                const NavIcon = getIcon(view.iconKey);
                const isActive = view.id === activeView;

                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    className={`flex min-h-14 items-center gap-4 rounded-xl px-5 text-left text-lg font-medium transition ${
                      isActive ? "bg-[#e9ecfb] text-[#24327a] shadow-sm" : "text-[#4f5a86] hover:bg-white/70 hover:text-[#17214f]"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <NavIcon size={23} aria-hidden="true" />
                    <span>{view.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-[#dce2f4] pt-6">
              <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[#24327a] hover:bg-white/70">
                <span className="grid size-10 place-items-center rounded-full bg-[#dfe4fb] text-sm font-semibold">NC</span>
                <span className="flex-1 text-sm font-semibold">Noemi C.</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          {renderActiveView()}
        </section>
      </div>
    </main>
  );
}
