import React from "react";
import { Upload } from "lucide-react";
import { ActionButton } from "./actionUi.tsx";

export interface FileDropFieldProps {
  accept: string;
  ariaLabel: string;
  prompt: string;
  actionLabel: string;
  onFile: (file: File) => void | Promise<void>;
  label?: string;
  /** Also takes an image pasted with Ctrl+V while the field is focused. */
  pasteImages?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** Replaces the prompt, e.g. with the selected file. */
  children?: React.ReactNode;
}

export function FileDropField({ accept, ariaLabel, prompt, actionLabel, onFile, label, pasteImages = false, disabled, busy, children }: FileDropFieldProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inactive = Boolean(disabled || busy);

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
      {label ? <span className="core-field-label">{label}</span> : null}
      <div
        role="group"
        aria-label={ariaLabel}
        aria-disabled={inactive || undefined}
        aria-busy={busy || undefined}
        tabIndex={pasteImages && !inactive ? 0 : undefined}
        onPaste={pasteImages ? paste : undefined}
        onDragEnter={(event) => { event.preventDefault(); if (!inactive) setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = inactive ? "none" : "copy"; if (!inactive) setDragging(true); }}
        onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); take(event.dataTransfer.files); }}
        data-file-drop-field="true"
        data-drop-state={inactive ? "inactive" : dragging ? "dragging" : "idle"}
        className="core-file-drop grid min-h-32 content-center justify-items-center gap-4 rounded-panel border border-dashed border-core-border-strong bg-core-subtle p-5 text-center outline-none transition"
      >
        <input ref={inputRef} className="sr-only" type="file" accept={accept} disabled={inactive} tabIndex={-1} onChange={(event) => { take(event.currentTarget.files); event.currentTarget.value = ""; }} />
        {children ? <div className="w-full min-w-0 text-left">{children}</div> : <p className="core-body font-semibold text-core-text">{prompt}</p>}
        <ActionButton type="button" variant="secondary" icon={Upload} disabled={inactive} onClick={() => inputRef.current?.click()}>
          {actionLabel}
        </ActionButton>
      </div>
    </div>
  );
}
