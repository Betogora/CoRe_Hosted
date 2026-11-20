import React from "react";
import { AlertCircle, ChevronDown, Database, Plus } from "lucide-react";
import type { CreationScreenProps } from "../appScreenProps.ts";
import type { ImportSample } from "../apkgImport.ts";
import { createNote } from "../coreModel.ts";
import type { Deck } from "../coreTypes.ts";
import {
  defaultTextImportOptions,
  planTextImport,
  readTextImportFile,
  type ExistingTextImportNote,
  type ParsedTextImport,
  type TextImportColumnRole,
  type TextImportDuplicateMode,
  type TextImportKind,
  type TextImportOptions,
} from "../textImport.ts";
import { ActionButton } from "../ui/actionUi.tsx";
import { SoftPanel, StatTile } from "../ui/coreUi.tsx";
import { CoreSelect, DeckSelect } from "../ui/selectUi.tsx";
import { ApkgCardSample } from "./ApkgImportPanel.tsx";
import { formatBytes } from "./screenConstants.ts";

export interface TextImportCompletion {
  deck: Deck;
  cardCount: number;
  samples: ImportSample[];
}

interface TextImportPreviewProps {
  parsed: ParsedTextImport;
  fileName: string;
  decks: Deck[];
  listDeckContents: CreationScreenProps["listDeckContents"];
  onImport: CreationScreenProps["onImportTextNotes"];
  onCompleted: (completion: TextImportCompletion) => unknown;
  onImportingChange: (importing: boolean) => void;
}

export interface TextImportPanelProps extends Omit<TextImportPreviewProps, "parsed" | "fileName" | "onImportingChange"> {
  file: File;
  onChooseOtherFile: () => unknown;
  onDraftStateChange: CreationScreenProps["onDraftStateChange"];
}

const SAMPLE_LIMIT = 3;
const ERROR_LIMIT = 100;
const NO_NOTES: ExistingTextImportNote[] = [];
const NO_SAMPLE_MEDIA: Record<string, string> = {};
const SEPARATOR_LABELS: Record<string, string> = { "\t": "Tab", ";": "Semikolon", ",": "Komma", " ": "Leerzeichen", "|": "Senkrechter Strich", ":": "Doppelpunkt" };
const KIND_OPTIONS: Array<{ value: TextImportKind; label: string }> = [
  { value: "basic", label: "Frage–Antwort" },
  { value: "basic-reversed", label: "Frage–Antwort mit Rückrichtung" },
  { value: "cloze", label: "Lückentext" },
];
const DUPLICATE_OPTIONS: Array<{ value: TextImportDuplicateMode; label: string }> = [
  { value: "update", label: "Aktualisieren" },
  { value: "skip", label: "Überspringen" },
  { value: "create", label: "Als neu anlegen" },
];

const deckPath = (deck: Deck) => deck.hierarchyPath.length ? deck.hierarchyPath : [deck.name];

function roleOptions(kind: TextImportKind): Array<{ value: TextImportColumnRole; label: string }> {
  return [
    { value: "front", label: kind === "cloze" ? "Text" : "Vorderseite" },
    { value: "back", label: kind === "cloze" ? "Zusatzinfo" : "Rückseite" },
    { value: "tags", label: "Tags" },
    { value: "ignore", label: "Ignorieren" },
  ];
}

export function TextImportPreview({ parsed, fileName, decks, listDeckContents, onImport, onCompleted, onImportingChange }: TextImportPreviewProps) {
  const [options, setOptions] = React.useState<TextImportOptions>(() => defaultTextImportOptions(parsed));
  const [deckId, setDeckId] = React.useState(() => decks.find((deck) => deckPath(deck).join("::") === parsed.deckName)?.id ?? "");
  const [deckName, setDeckName] = React.useState(() => parsed.deckName ?? fileName.replace(/\.[^.]+$/, ""));
  const [loaded, setLoaded] = React.useState<{ deckId: string; notes: ExistingTextImportNote[] } | { deckId: string; error: string } | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState("");

  React.useEffect(() => {
    if (!deckId) return undefined;
    let active = true;
    listDeckContents(deckId).then(
      (notes) => { if (active) setLoaded({ deckId, notes }); },
      (error) => { if (active) setLoaded({ deckId, error: error instanceof Error ? error.message : "Die Karten des Stapels konnten nicht geladen werden." }); },
    );
    return () => { active = false; };
  }, [deckId, listDeckContents]);

  const current = deckId ? loaded?.deckId === deckId ? loaded : null : { deckId, notes: NO_NOTES };
  const existing = current && "notes" in current ? current.notes : null;
  const plan = React.useMemo(() => existing ? planTextImport(parsed, options, existing) : null, [existing, options, parsed]);
  const samples = React.useMemo<ImportSample[]>(() => (plan ? [...plan.creates, ...plan.updates.map((update) => update.content)] : [])
    .slice(0, SAMPLE_LIMIT)
    .map((content) => {
      const { note, cards } = createNote({ content, deckId: "text-import-preview" });
      return { note, card: cards[0], notetypeName: KIND_OPTIONS.find((option) => option.value === options.kind)!.label, noteTypeSource: null };
    }), [options.kind, plan]);
  const canImport = Boolean(plan && plan.cardCount > 0 && (deckId || deckName.trim())) && !importing;

  function setColumnRole(index: number, role: TextImportColumnRole) {
    setOptions((currentOptions) => ({
      ...currentOptions,
      columns: currentOptions.columns.map((previous, column) => column === index ? role : (role === "front" || role === "back") && previous === role ? "ignore" : previous),
    }));
  }

  async function runImport() {
    if (!plan) return;
    setImporting(true);
    onImportingChange(true);
    setImportError("");
    try {
      const result = await onImport({ deckId: deckId || null, deckName: deckName.trim(), creates: plan.creates, updates: plan.updates });
      if (!result) throw new Error("Der Import ist fehlgeschlagen.");
      onCompleted({ deck: result.deck, cardCount: result.cardCount, samples });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Der Import ist fehlgeschlagen.");
      setImporting(false);
      onImportingChange(false);
    }
  }

  return (
    <>
      <SoftPanel className="p-6" aria-busy={importing || undefined}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid grid-cols-2 gap-6">
            <StatTile label="Trennzeichen" value={SEPARATOR_LABELS[parsed.separator] ?? `„${parsed.separator}“`} />
            <StatTile label="Zeilen" value={parsed.rows.length.toLocaleString("de-DE")} />
          </div>
          <ActionButton type="button" variant="primary" icon={Database} loading={importing} disabled={!canImport} onClick={() => void runImport()}>
            {plan ? `${plan.cardCount.toLocaleString("de-DE")} ${plan.cardCount === 1 ? "Karte" : "Karten"} importieren` : "Karten importieren"}
          </ActionButton>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="grid min-w-0 content-start gap-2">
            {decks.length > 0 ? (
              <label className="grid min-w-0 gap-2 core-field-label">
                Kartenstapel
                <DeckSelect ariaLabel="Kartenstapel" className="w-full" value={deckId} decks={decks} specialOption={{ value: "", label: "Neuer Stapel", icon: Plus }} onValueChange={setDeckId} />
              </label>
            ) : null}
            {!deckId ? (
              <label className="grid min-w-0 gap-2 core-field-label">
                Neuer Kartenstapel
                <input className="core-field min-w-0" value={deckName} onChange={(event) => setDeckName(event.target.value)} />
              </label>
            ) : null}
          </div>
          <label className="grid min-w-0 content-start gap-2 core-field-label">
            Inhaltsform
            <CoreSelect ariaLabel="Inhaltsform" className="w-full" value={options.kind} options={KIND_OPTIONS} onValueChange={(kind) => setOptions((currentOptions) => ({ ...currentOptions, kind: kind as TextImportKind }))} />
          </label>
          <label className="grid min-w-0 content-start gap-2 core-field-label">
            Duplikate
            <CoreSelect ariaLabel="Duplikate" className="w-full" value={options.duplicates} options={DUPLICATE_OPTIONS} onValueChange={(duplicates) => setOptions((currentOptions) => ({ ...currentOptions, duplicates: duplicates as TextImportDuplicateMode }))} />
          </label>
        </div>

        <section className="mt-6" aria-labelledby="text-import-columns-heading">
          <h4 id="text-import-columns-heading" className="border-b border-core-border pb-2 core-caption font-semibold text-core-muted">Spalten</h4>
          <ul className="grid">
            {options.columns.map((role, index) => (
              <li key={index} className="grid items-center gap-2 border-b border-core-border py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_16rem]">
                <p className="min-w-0 truncate core-body text-core-secondary">
                  <span className="font-semibold text-core-text">Spalte {index + 1}</span> · {parsed.columnNames?.[index] || parsed.rows[0]?.values[index] || "leer"}
                </p>
                <CoreSelect ariaLabel={`Spalte ${index + 1}`} className="w-full" value={role} options={roleOptions(options.kind)} onValueChange={(next) => setColumnRole(index, next as TextImportColumnRole)} />
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-6 grid gap-4">
          {current && "error" in current ? <p className="core-status-error core-body" role="alert">{current.error}</p> : null}
          {importError ? <p className="core-status-error core-body" role="alert">{importError}</p> : null}
          {plan?.errors.length ? (
            <section className="core-status-error !py-1" aria-labelledby="text-import-errors-heading">
              <details>
                <summary id="text-import-errors-heading" className="flex min-h-control cursor-pointer items-center gap-2 font-semibold">
                  <AlertCircle className="shrink-0" size={16} aria-hidden="true" />
                  {plan.errors.length.toLocaleString("de-DE")} {plan.errors.length === 1 ? "Zeile wird" : "Zeilen werden"} übersprungen
                  <ChevronDown className="ml-auto shrink-0" size={16} aria-hidden="true" />
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  {plan.errors.slice(0, ERROR_LIMIT).map((error) => <li key={error.line}>Zeile {error.line}: {error.message}</li>)}
                  {plan.errors.length > ERROR_LIMIT ? <li>… {(plan.errors.length - ERROR_LIMIT).toLocaleString("de-DE")} weitere</li> : null}
                </ul>
              </details>
            </section>
          ) : null}
          {parsed.warnings.length ? (
            <section className="core-status-warning !py-1" aria-labelledby="text-import-warnings-heading">
              <details>
                <summary id="text-import-warnings-heading" className="flex min-h-control cursor-pointer items-center gap-2 font-semibold">
                  <AlertCircle className="shrink-0" size={16} aria-hidden="true" />
                  {parsed.warnings.length} {parsed.warnings.length === 1 ? "Warnung" : "Warnungen"}
                  <ChevronDown className="ml-auto shrink-0" size={16} aria-hidden="true" />
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  {parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </details>
            </section>
          ) : null}
        </div>
      </SoftPanel>

      {samples.length > 0 ? (
        <section className="core-surface-raised rounded-panel p-6" aria-labelledby="text-import-examples-heading">
          <h3 id="text-import-examples-heading" className="core-heading-2 text-core-text">Kartenbeispiele</h3>
          <div className="mt-4 grid gap-4">
            {samples.map((sample) => <ApkgCardSample key={sample.card.id} {...sample} urlsBySha1={NO_SAMPLE_MEDIA} />)}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function TextImportPanel({ file, onChooseOtherFile, onDraftStateChange, ...previewProps }: TextImportPanelProps) {
  const [read, setRead] = React.useState<{ parsed: ParsedTextImport } | { error: string } | null>(null);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    onDraftStateChange(true, null, importing);
    return () => onDraftStateChange(false, null, false);
  }, [importing, onDraftStateChange]);

  React.useEffect(() => {
    if (!importing) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [importing]);

  React.useEffect(() => {
    let active = true;
    setRead(null);
    readTextImportFile(file).then(
      (parsed) => { if (active) setRead({ parsed }); },
      (error) => { if (active) setRead({ error: error instanceof Error ? error.message : "Die Datei konnte nicht gelesen werden." }); },
    );
    return () => { active = false; };
  }, [file]);

  return (
    <div className="grid gap-4">
      <SoftPanel className="p-6" aria-busy={!read || undefined}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-inset bg-core-subtle px-4 py-3" data-testid="text-import-file">
          <p className="min-w-0 basis-full truncate core-body font-semibold text-core-text sm:flex-1 sm:basis-0">{file.name}</p>
          <p className="mr-auto whitespace-nowrap core-body text-core-muted sm:mr-0">{formatBytes(file.size)}</p>
          <ActionButton type="button" variant="secondary" disabled={importing} onClick={onChooseOtherFile}>Andere Datei auswählen</ActionButton>
        </div>
        {read && "error" in read ? <p className="core-status-error mt-4 core-body" role="alert">{read.error}</p> : null}
      </SoftPanel>
      {read && "parsed" in read ? <TextImportPreview parsed={read.parsed} fileName={file.name} onImportingChange={setImporting} {...previewProps} /> : null}
    </div>
  );
}
