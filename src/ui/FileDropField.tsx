import React from "react";
import { FileText, ImagePlus, Upload } from "lucide-react";
import { READABLE_SOURCE_DOCUMENT_ACCEPT, READABLE_SOURCE_DOCUMENT_LABEL } from "../documentModel.ts";
import { ActionButton } from "./actionUi.tsx";

const variants = {
  apkg: {
    icon: Upload, accept: ".apkg", aria: "APKG-Datei auswählen oder ablegen",
    prompt: "APKG-Datei hier ablegen (Max. 250 MB)", action: ["APKG-Datei auswählen", "Andere Datei auswählen"],
  },
  image: {
    icon: ImagePlus, accept: "image/*", aria: "Bild einfügen oder ablegen", paste: true,
    prompt: "Bild mit Strg+V einfügen oder hier ablegen", action: ["Bild auswählen", "Bild ersetzen"],
  },
  document: {
    icon: FileText, accept: READABLE_SOURCE_DOCUMENT_ACCEPT, aria: "Quelldatei auswählen oder ablegen",
    label: `Quelle (${READABLE_SOURCE_DOCUMENT_LABEL})`, prompt: "PDF-, Text-, Markdown-, CSV- oder TSV-Datei hier ablegen", action: ["Datei auswählen", "Andere Datei auswählen"],
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
      {fieldLabel ? <span className="core-body font-semibold text-[var(--core-text-secondary)]">{fieldLabel}</span> : null}
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
        className={`min-h-32 rounded-xl border-2 border-dashed bg-[var(--core-surface-muted)] p-4 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--core-focus-ring)] focus-visible:ring-offset-2 ${inactive ? "cursor-not-allowed border-[var(--core-border)] opacity-70" : dragging ? "border-[var(--core-action-primary)] bg-[var(--core-info-surface)]" : "border-[var(--core-border-interactive)] hover:border-[var(--core-action-primary)]"}`}
      >
        <input ref={inputRef} className="sr-only" type="file" accept={variant.accept} disabled={inactive} tabIndex={-1} onChange={(event) => { take(event.currentTarget.files); event.currentTarget.value = ""; }} />
        <div className="grid min-h-24 place-items-center">
          <div className="min-w-0">
            <Icon className="mx-auto text-[var(--core-action-primary)]" size={26} aria-hidden="true" />
            <p className="mt-2 core-body font-semibold text-[var(--core-text)]">{variant.prompt}</p>
            <ActionButton type="button" variant="secondary" icon={Upload} className="mt-3" disabled={inactive} onClick={() => inputRef.current?.click()}>
              {variant.action[selected ? 1 : 0]}
            </ActionButton>
          </div>
        </div>
        {children ? <div className="mt-4 min-w-0 text-left">{children}</div> : null}
      </div>
    </div>
  );
}
