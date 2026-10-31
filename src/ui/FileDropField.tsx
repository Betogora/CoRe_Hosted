import React from "react";
import { FileText, ImagePlus, Upload } from "lucide-react";
import { READABLE_SOURCE_DOCUMENT_ACCEPT, READABLE_SOURCE_DOCUMENT_LABEL } from "../documentModel.ts";
import { AI_SOURCE_ACCEPT, AI_SOURCE_FORMAT_LABEL } from "../aiSourceCreation.ts";
import { ActionButton } from "./actionUi.tsx";

const variants = {
  apkg: {
    icon: Upload, accept: ".apkg,.colpkg", aria: "Anki-Datei (APKG oder COLPKG) auswählen oder ablegen",
    prompt: "APKG- oder COLPKG-Datei hier ablegen (Max. 2 GiB)", action: ["APKG-Datei auswählen", "Andere Datei auswählen"],
  },
  image: {
    icon: ImagePlus, accept: "image/*", aria: "Bild einfügen oder ablegen", paste: true,
    prompt: "Bild mit Strg+V einfügen oder hier ablegen", action: ["Bild auswählen", "Bild ersetzen"],
  },
  document: {
    icon: FileText, accept: READABLE_SOURCE_DOCUMENT_ACCEPT, aria: "Quelldatei auswählen oder ablegen",
    label: `Quelle (${READABLE_SOURCE_DOCUMENT_LABEL})`, prompt: "PDF-, Text-, Markdown-, CSV- oder TSV-Datei hier ablegen", action: ["Datei auswählen", "Andere Datei auswählen"],
  },
  "ai-source": {
    icon: FileText, accept: AI_SOURCE_ACCEPT, aria: "Quelle für automatische Karten auswählen oder ablegen",
    label: "Quelle", prompt: "Quelldatei hier ablegen", formats: AI_SOURCE_FORMAT_LABEL, action: ["Datei auswählen", "Ersetzen"],
  },
} as const;

export interface FileDropFieldProps {
  kind: keyof typeof variants;
  onFile: (file: File) => void | Promise<void>;
  label?: string;
  selected: boolean;
  disabled?: boolean;
  busy?: boolean;
  children?: React.ReactNode;
}

export function FileDropField({ kind, onFile, label, selected, disabled, busy, children }: FileDropFieldProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inactive = Boolean(disabled || busy);
  const variant = variants[kind];
  const Icon = variant.icon;
  const fieldLabel = label ?? ("label" in variant ? variant.label : "");

  function take(files: FileList | null | undefined) {
    if (files?.[0] && !inactive) void onFile(files[0]);
  }

  function paste(event: React.ClipboardEvent<HTMLDivElement>) {
    const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"))
      ?? [...event.clipboardData.items].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
    if (file && !inactive) {
      event.preventDefault();
      void onFile(file);
    }
  }

  return (
    <div className="grid gap-2">
      {fieldLabel ? <span className="core-field-label">{fieldLabel}</span> : null}
      <div
        role="group"
        aria-label={kind === "image" && label ? `${label}: ${variant.aria}` : variant.aria}
        aria-disabled={inactive || undefined}
        aria-busy={busy || undefined}
        tabIndex={"paste" in variant && !inactive ? 0 : undefined}
        onPaste={"paste" in variant ? paste : undefined}
        onDragEnter={(event) => { event.preventDefault(); if (!inactive) setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = inactive ? "none" : "copy"; if (!inactive) setDragging(true); }}
        onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); take(event.dataTransfer.files); }}
        data-file-drop-field="true"
        data-drop-state={inactive ? "inactive" : dragging ? "dragging" : "idle"}
        className="core-file-drop min-h-32 rounded-panel border border-dashed border-core-border-strong bg-core-subtle p-5 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--core-focus-ring)] focus-visible:ring-offset-2"
      >
        <input ref={inputRef} className="sr-only" type="file" accept={variant.accept} disabled={inactive} tabIndex={-1} onChange={(event) => { take(event.currentTarget.files); event.currentTarget.value = ""; }} />
        <div className="grid min-h-24 place-items-center">
          <div className="min-w-0">
            <span className="mx-auto grid size-10 place-items-center rounded-control border border-core-border bg-core-surface text-core-action shadow-soft">
              <Icon size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 core-body font-semibold text-core-text">{variant.prompt}</p>
            {"formats" in variant ? <p className="mt-1 core-caption text-core-muted">{variant.formats}</p> : null}
            <ActionButton type="button" variant="secondary" icon={Upload} className="mt-4" disabled={inactive} onClick={() => inputRef.current?.click()}>
              {variant.action[selected ? 1 : 0]}
            </ActionButton>
          </div>
        </div>
        {children ? <div className="mt-4 min-w-0 text-left">{children}</div> : null}
      </div>
    </div>
  );
}
