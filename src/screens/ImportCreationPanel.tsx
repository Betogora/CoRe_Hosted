import React from "react";
import type { LucideIcon } from "lucide-react";
import { FileArchive, FileSpreadsheet, FileText } from "lucide-react";
import type { CreationWorkflow } from "../creationWorkflow.ts";
import type { Deck } from "../coreTypes.ts";
import type { AccountMediaStore } from "../mediaStore.ts";
import { ApkgImportPanel } from "./ApkgImportPanel.tsx";
import { TextTableImportPanel, type TextTableImportMode } from "./TextTableImportPanel.tsx";

type ImportMethod = "anki" | TextTableImportMode;

export interface ImportCreationPanelProps {
  decks: Deck[];
  workflow: CreationWorkflow;
  mediaStore: AccountMediaStore | null;
  serverApkgEnabled?: boolean;
  onCreated: (deck: Deck) => unknown;
  onImportCompleted: (deck: Deck) => unknown;
}

interface TabButtonProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const importMethods: Array<{ id: ImportMethod; label: string; icon: LucideIcon }> = [
  { id: "anki", label: "APKG", icon: FileArchive },
  { id: "text", label: "Text", icon: FileText },
  { id: "csv", label: "CSV", icon: FileSpreadsheet },
  { id: "spreadsheet", label: "Excel/Tabelle", icon: FileSpreadsheet },
];

function TabButton({ icon: Icon, label, isActive, onClick }: TabButtonProps) {
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

export function ImportCreationPanel({ decks, onCreated, onImportCompleted, workflow, mediaStore, serverApkgEnabled = false }: ImportCreationPanelProps) {
  const [selectedImport, setSelectedImport] = React.useState<ImportMethod>("anki");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2" aria-label="Importformat">
        {importMethods.map((method) => (
          <TabButton key={method.id} icon={method.icon} label={method.label} isActive={selectedImport === method.id} onClick={() => setSelectedImport(method.id)} />
        ))}
      </div>
      {selectedImport === "anki" ? (
        <ApkgImportPanel existingDecks={decks} workflow={workflow} mediaStore={mediaStore} serverApkgEnabled={serverApkgEnabled} onCompleted={onImportCompleted} />
      ) : (
        <TextTableImportPanel initialMode={selectedImport} workflow={workflow} onImported={onCreated} />
      )}
    </div>
  );
}
