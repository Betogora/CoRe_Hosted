import React from "react";
import { CheckCircle2, FileText, Trash2, WandSparkles } from "lucide-react";
import type { CreationWorkflow } from "../creationWorkflow.ts";
import type { CardType, Deck, LearningItem } from "../coreTypes.ts";
import type { ProductSurface } from "../productSurfaces.ts";
import { LabsNotice, OrbIcon, SoftPanel } from "../ui/coreUi.tsx";

type AiDraftWorkflow = Pick<
  CreationWorkflow,
  | "acceptAiDrafts"
  | "createInitialAiDocument"
  | "generateAiDrafts"
  | "readableSourceDocumentAccept"
  | "readableSourceDocumentLabel"
  | "readSourceDocument"
  | "toggleAiCardType"
  | "updateAiDocumentText"
  | "updateDraftCard"
>;

interface AiDraftConfig {
  language: string;
  cardCount: number;
  detailLevel: string;
  cardTypes: CardType[];
  focus: string;
  subject: string;
}

export interface AiDraftLabPanelProps {
  workflow: AiDraftWorkflow;
  onCreated: (deck: Deck) => unknown;
  onJob: (job: unknown) => unknown;
  surface: ProductSurface;
}

const configFields = [
  { key: "language", label: "Sprache" },
  { key: "detailLevel", label: "Detailgrad" },
  { key: "focus", label: "Fokus" },
  { key: "subject", label: "Fach" },
] as const;

const initialConfig: AiDraftConfig = {
  language: "Deutsch",
  cardCount: 6,
  detailLevel: "normal",
  cardTypes: ["basic", "cloze"],
  focus: "Prüfungswissen",
  subject: "",
};

export function AiDraftLabPanel({ workflow, onCreated, onJob, surface }: AiDraftLabPanelProps) {
  const [config, setConfig] = React.useState<AiDraftConfig>(initialConfig);
  const [document, setDocument] = React.useState(() => workflow.createInitialAiDocument());
  const [draftDeck, setDraftDeck] = React.useState<Deck | null>(null);
  const [draftCards, setDraftCards] = React.useState<LearningItem[]>([]);
  const [status, setStatus] = React.useState("");

  function updateConfig<Key extends keyof AiDraftConfig>(key: Key, value: AiDraftConfig[Key]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function toggleCardType(cardType: CardType) {
    setConfig((current) => ({
      ...current,
      cardTypes: (workflow.toggleAiCardType({ ...current }, cardType).cardTypes ?? current.cardTypes) as CardType[],
    }));
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocument(await workflow.readSourceDocument(file as unknown as Parameters<AiDraftWorkflow["readSourceDocument"]>[0]));
  }

  function updateDocumentText(text: string) {
    setDocument((current) => workflow.updateAiDocumentText(current, text));
  }

  function generateDrafts(nextConfig: AiDraftConfig = config) {
    const result = workflow.generateAiDrafts({
      document,
      config: { ...nextConfig },
      deckName: nextConfig.subject || "Lokale Entwürfe",
    });
    onJob(result.job);
    setStatus(result.statusMessage);
    setDraftDeck(result.draftDeck);
    setDraftCards(result.draftDeck?.cards ?? []);
  }

  function updateDraft(cardId: string, key: "originalFront" | "originalBack", value: string) {
    setDraftCards((cards) => workflow.updateDraftCard(cards, cardId, { [key]: value }));
  }

  function acceptDrafts() {
    if (!draftDeck || draftCards.length === 0) return;
    const acceptedDeck = workflow.acceptAiDrafts(draftDeck, draftCards);
    if (!acceptedDeck) return;
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
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Labs · lokal und deterministisch</p>
            <h2 className="text-2xl font-semibold text-[#17214f]">Lokaler Entwurfsassistent</h2>
            <p className="mt-1 text-sm text-[#66709a]">Es wird kein externes Modell aufgerufen.</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
              Datei
              <span className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[#cfd6ed] px-3 text-[#66709a]">
                <FileText size={17} aria-hidden="true" />
                <input type="file" accept={workflow.readableSourceDocumentAccept} onChange={handleFile} />
              </span>
              <span className="font-normal text-[#66709a]">{workflow.readableSourceDocumentLabel}</span>
            </label>
            <textarea className="min-h-48 rounded-xl border border-[#dfe4f5] p-3 text-sm leading-6" value={document.text} onChange={(event) => updateDocumentText(event.target.value)} placeholder="Quellentext" aria-label="Quellentext für lokale Entwürfe" />
            <div className="grid gap-3 md:grid-cols-2">
              {configFields.map(({ key, label }) => (
                <label key={key} className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                  {label}
                  <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" value={config[key]} onChange={(event) => updateConfig(key, event.target.value)} />
                </label>
              ))}
              <label className="grid gap-2 text-sm font-semibold text-[#4e5b8c]">
                Kartenanzahl
                <input className="min-h-11 rounded-xl border border-[#dfe4f5] px-3" type="number" min="1" max="30" value={config.cardCount} onChange={(event) => updateConfig("cardCount", Number(event.target.value))} />
              </label>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-[#4e5b8c]">Kartentypen</p>
              <div className="flex flex-wrap gap-2">
                {(["basic", "cloze"] as const).map((cardType) => (
                  <label key={cardType} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe4f5] px-3 text-sm text-[#4e5b8c]">
                    <input type="checkbox" checked={config.cardTypes.includes(cardType)} onChange={() => toggleCardType(cardType)} />
                    {cardType}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => generateDrafts()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white">
                <WandSparkles size={17} aria-hidden="true" />
                Entwürfe erstellen
              </button>
              <button type="button" onClick={() => generateDrafts({ ...config, cardCount: Math.min(30, config.cardCount + 2) })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
                Mehr Details
              </button>
              <button type="button" onClick={() => generateDrafts({ ...config, cardCount: Math.max(1, config.cardCount - 2) })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dfe4f5] px-4 text-sm font-semibold text-[#4f5eb1]">
                Weniger
              </button>
            </div>
            {status ? <p className="core-status-info text-sm" role="status">{status}</p> : null}
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
                {draftCards.map((card) => {
                  const confidence = typeof card.meta.confidence === "number" ? card.meta.confidence : 0.75;
                  return (
                    <article key={card.id} className="rounded-xl border border-[#e3e7f5] bg-white/80 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-xl bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{card.kind}</span>
                        <span className="text-xs font-semibold text-[#66709a]">Confidence {Math.round(confidence * 100)} %</span>
                      </div>
                      <textarea className="min-h-20 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalFront} onChange={(event) => updateDraft(card.id, "originalFront", event.target.value)} aria-label="Entwurf Vorderseite" />
                      <textarea className="mt-3 min-h-24 w-full rounded-xl border border-[#dfe4f5] p-3 text-sm" value={card.originalBack} onChange={(event) => updateDraft(card.id, "originalBack", event.target.value)} aria-label="Entwurf Rückseite" />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#66709a]">
                        <span>{card.sourceAnchors[0]?.textQuote.slice(0, 120) || "Quelle fehlt"}</span>
                        <button type="button" onClick={() => setDraftCards((cards) => cards.filter((item) => item.id !== card.id))} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-red-50 px-2 font-semibold text-red-700">
                          <Trash2 size={14} aria-hidden="true" />
                          Verwerfen
                        </button>
                      </div>
                    </article>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </SoftPanel>
    </div>
  );
}
