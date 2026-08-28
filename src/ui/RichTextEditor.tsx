import React from "react";
import { Bold, Braces, Eraser, Highlighter, ImagePlus, Italic, List, ListOrdered, Palette, PenLine, Underline, Unlink } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { sanitizeCardHtml } from "../htmlSafety.ts";
import { normalizeRichTextForEditor, textToCardHtml } from "../richText.ts";
import { CoreTooltip } from "./tooltipUi.tsx";
import {
  ColorPopover,
  ColorToolButton,
  defaultHighlightColors,
  defaultTextColors,
  highlightPaletteColors,
  normalizeColor,
  textPaletteColors,
  useStoredColorSlots,
} from "./colorPicker.tsx";

export const richTextColorStorageKeys = {
  text: "core.richText.textColors.v2",
  highlight: "core.richText.highlightColors.v2",
};

interface TextSelectionOffsets {
  start: number;
  end: number;
}

export interface RichTextClozeSpan {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
}

const clozePattern = /\{\{c(\d+)::((?:(?!::|\}\})[\s\S])*)(?:::((?:(?!\}\})[\s\S])*))?\}\}/g;
const inlineMediaReferenceAttribute = "data-core-media-ref";
const stableImageReferencePattern = /^[a-f0-9]{40}$/;

export interface PreparedRichTextImage {
  reference: string;
  previewUrl: string;
  alt: string;
}

export interface RichTextImageActions {
  mediaUrls: Record<string, string>;
  prepare: (file: File) => Promise<PreparedRichTextImage>;
}

function canonicalizeRichTextMedia(html: string, stripUnmanagedImages: boolean): string {
  const sanitized = sanitizeCardHtml(html);
  if (typeof document === "undefined" || !/<img\b/i.test(sanitized)) return sanitized;
  const root = document.createElement("div");
  root.innerHTML = sanitized;
  for (const image of Array.from(root.querySelectorAll("img"))) {
    const reference = String(image.getAttribute(inlineMediaReferenceAttribute) ?? image.getAttribute("src") ?? "").trim().toLowerCase();
    if (stableImageReferencePattern.test(reference)) {
      image.setAttribute("src", reference);
      image.removeAttribute(inlineMediaReferenceAttribute);
    } else if (stripUnmanagedImages) {
      image.remove();
    }
  }
  return sanitizeCardHtml(root.innerHTML);
}

function hydrateRichTextMedia(html: string, mediaUrls: Record<string, string>): string {
  const normalized = normalizeRichTextForEditor(html);
  if (typeof document === "undefined" || !/<img\b/i.test(normalized) || Object.keys(mediaUrls).length === 0) return normalized;
  const root = document.createElement("div");
  root.innerHTML = normalized;
  for (const image of Array.from(root.querySelectorAll("img"))) {
    const reference = String(image.getAttribute("src") ?? "").trim().toLowerCase();
    const previewUrl = mediaUrls[reference];
    if (!stableImageReferencePattern.test(reference) || !/^(?:blob:|data:image\/)/i.test(previewUrl ?? "")) continue;
    image.setAttribute(inlineMediaReferenceAttribute, reference);
    image.setAttribute("src", previewUrl);
  }
  return root.innerHTML;
}

function stripUnknownRichTextImages(html: string, mediaUrls: Record<string, string>): string {
  if (typeof document === "undefined" || !/<img\b/i.test(html)) return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  for (const image of Array.from(root.querySelectorAll("img"))) {
    const reference = String(image.getAttribute("src") ?? "").trim().toLowerCase();
    if (!stableImageReferencePattern.test(reference) || !mediaUrls[reference]) image.remove();
  }
  return root.innerHTML;
}

function normalizeClozeGroupId(groupId: number | undefined) {
  return Number.isFinite(groupId) ? Math.max(1, Math.floor(groupId ?? 1)) : 1;
}

function getRichTextClozeSpans(text: string): RichTextClozeSpan[] {
  return Array.from(text.matchAll(clozePattern), (match) => {
    const start = match.index;
    const contentStart = start + `{{c${match[1]}::`.length;
    const contentEnd = contentStart + match[2].length;
    return { start, end: start + match[0].length, contentStart, contentEnd };
  });
}

export function findRichTextClozeSpan(text: string, selection: TextSelectionOffsets): RichTextClozeSpan | null {
  const isCollapsed = selection.start === selection.end;
  const matches = getRichTextClozeSpans(text).filter((span) =>
    isCollapsed
      ? selection.start >= span.start && selection.start <= span.end
      : selection.start >= span.start && selection.end <= span.end,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function selectionOverlapsRichTextCloze(text: string, selection: TextSelectionOffsets): boolean {
  return getRichTextClozeSpans(text).some((span) =>
    selection.start === selection.end
      ? selection.start >= span.start && selection.start <= span.end
      : selection.start < span.end && selection.end > span.start,
  );
}

function ToolbarButton({ label, icon: Icon, onRun, disabled = false }: { label: string; icon: LucideIcon; onRun: () => void; disabled?: boolean }) {
  return (
    <CoreTooltip label={label}>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-lg border border-[var(--core-border)] bg-core-surface text-[var(--core-action-primary)] transition hover:bg-[var(--core-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={label}
        disabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={onRun}
      >
        <Icon size={17} aria-hidden="true" />
      </button>
    </CoreTooltip>
  );
}

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  onFocus?: (event: React.FocusEvent<HTMLDivElement>) => void;
  isActive?: boolean;
  minHeightClass?: string;
  ariaLabel: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  clozeActions?: {
    groupId: number;
  };
  imageActions?: RichTextImageActions;
}

export function RichTextEditor({ value = "", onChange, onFocus, isActive = false, minHeightClass = "min-h-48", ariaLabel, ariaInvalid = false, ariaDescribedBy, clozeActions, imageActions }: RichTextEditorProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const textColorButtonRef = React.useRef<HTMLButtonElement>(null);
  const highlightColorButtonRef = React.useRef<HTMLButtonElement>(null);
  const selectionRef = React.useRef<Range | null>(null);
  const isFocusedRef = React.useRef(false);
  const lastEmittedNormalizedHtmlRef = React.useRef("");
  const normalizedValue = React.useMemo(() => normalizeRichTextForEditor(value), [value]);
  const [textColors, updateTextColorSlot] = useStoredColorSlots(richTextColorStorageKeys.text, defaultTextColors);
  const [highlightColors, updateHighlightColorSlot] = useStoredColorSlots(richTextColorStorageKeys.highlight, defaultHighlightColors);
  const [openColorMenu, setOpenColorMenu] = React.useState<"text" | "highlight" | null>(null);
  const [selectedColorSlots, setSelectedColorSlots] = React.useState({ text: 0, highlight: 0 });
  const [clozeStatus, setClozeStatus] = React.useState("");
  const [imageStatus, setImageStatus] = React.useState("");
  const [imageError, setImageError] = React.useState("");
  const [isPreparingImages, setIsPreparingImages] = React.useState(false);
  const textColorMenuId = React.useId();
  const highlightColorMenuId = React.useId();
  const clozeStatusId = React.useId();
  const imageStatusId = React.useId();

  React.useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const isLocalEditorUpdate = normalizedValue === lastEmittedNormalizedHtmlRef.current && (isFocusedRef.current || hasEditorSelection());
    if (isLocalEditorUpdate) return;

    const hydratedValue = hydrateRichTextMedia(normalizedValue, imageActions?.mediaUrls ?? {});
    if (editor.innerHTML !== hydratedValue) {
      const selection = isFocusedRef.current ? captureTextSelection() : null;
      editor.innerHTML = hydratedValue;
      restoreTextSelection(selection);
    }
    lastEmittedNormalizedHtmlRef.current = normalizedValue;
  }, [imageActions?.mediaUrls, normalizedValue]);

  React.useEffect(() => {
    if (!openColorMenu || typeof document === "undefined") return undefined;

    function closeColorMenu(event: MouseEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenColorMenu(null);
      }
    }

    function closeColorMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const trigger = openColorMenu === "text" ? textColorButtonRef.current : highlightColorButtonRef.current;
      setOpenColorMenu(null);
      window.requestAnimationFrame(() => trigger?.focus());
    }

    const menuId = openColorMenu === "text" ? textColorMenuId : highlightColorMenuId;
    const frame = window.requestAnimationFrame(() => document.getElementById(menuId)?.querySelector<HTMLElement>("button, [tabindex], input")?.focus());

    document.addEventListener("mousedown", closeColorMenu);
    document.addEventListener("keydown", closeColorMenuWithKeyboard);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", closeColorMenu);
      document.removeEventListener("keydown", closeColorMenuWithKeyboard);
    };
  }, [highlightColorMenuId, openColorMenu, textColorMenuId]);

  function hasEditorSelection() {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return false;

    const selection = window.getSelection();
    if (!selection?.rangeCount) return false;
    return editor.contains(selection.anchorNode) && editor.contains(selection.focusNode);
  }

  function captureTextSelection() {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return null;

    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;

    const beforeRange = range.cloneRange();
    beforeRange.selectNodeContents(editor);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const start = beforeRange.toString().length;

    return {
      start,
      end: start + range.toString().length,
    };
  }

  function findTextPosition(node: Node, offset: number): { node: Node; offset: number } {
    let remaining = Math.max(0, offset);
    let fallback = { node, offset: node.childNodes.length };

    function visit(currentNode: Node): { node: Node; offset: number } | null {
      if (currentNode.nodeType === 3) {
        const textLength = currentNode.textContent?.length ?? 0;
        if (remaining <= textLength) return { node: currentNode, offset: remaining };
        remaining -= textLength;
        fallback = { node: currentNode, offset: textLength };
        return null;
      }

      for (const child of Array.from(currentNode.childNodes)) {
        const found = visit(child);
        if (found) return found;
      }

      fallback = { node: currentNode, offset: currentNode.childNodes.length };
      return null;
    }

    return visit(node) ?? fallback;
  }

  function restoreTextSelection(selectionOffsets: { start: number; end: number; }|null) {
    const editor = editorRef.current;
    if (!editor || !selectionOffsets || typeof document === "undefined" || typeof window === "undefined") return;

    const start = findTextPosition(editor, selectionOffsets.start);
    const end = findTextPosition(editor, selectionOffsets.end);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    selectionRef.current = range.cloneRange();
  }

  function saveSelection() {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    selectionRef.current = range.cloneRange();
  }

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return;

    editor.focus();
    const range = selectionRef.current;
    if (!range) return;

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function getRestoredEditorRange() {
    const editor = editorRef.current;
    if (!editor || typeof window === "undefined") return null;

    restoreSelection();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;

    const range = selection.getRangeAt(0);
    return editor.contains(range.startContainer) && editor.contains(range.endContainer) ? range : null;
  }

  function selectEditorContents() {
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined" || typeof window === "undefined") return;

    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    selectionRef.current = range.cloneRange();
  }

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    isFocusedRef.current = true;
    saveSelection();
    const sanitizedHtml = canonicalizeRichTextMedia(editor.innerHTML, Boolean(imageActions));
    lastEmittedNormalizedHtmlRef.current = normalizeRichTextForEditor(sanitizedHtml);
    onChange?.(lastEmittedNormalizedHtmlRef.current);
  }

  function rangeAtEditorEnd() {
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined") return null;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function rangeAtPoint(clientX: number, clientY: number) {
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined") return null;
    const caretDocument = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const directRange = caretDocument.caretRangeFromPoint?.(clientX, clientY) ?? null;
    if (directRange && editor.contains(directRange.startContainer)) return directRange;
    const position = caretDocument.caretPositionFromPoint?.(clientX, clientY) ?? null;
    if (!position || !editor.contains(position.offsetNode)) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }

  async function insertImageFiles(files: File[], preferredRange: Range | null = null) {
    const editor = editorRef.current;
    if (!editor || !imageActions || typeof document === "undefined" || typeof window === "undefined") return;
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      setImageStatus("");
      setImageError("Bitte füge eine Bilddatei ein.");
      return;
    }

    let range = preferredRange?.cloneRange() ?? getRestoredEditorRange()?.cloneRange() ?? rangeAtEditorEnd();
    if (!range || !editor.contains(range.startContainer)) range = rangeAtEditorEnd();
    if (!range) return;
    const replacesSelection = !range.collapsed;
    setImageError("");
    setImageStatus(images.length === 1 ? "Bild wird vorbereitet …" : `${images.length} Bilder werden vorbereitet …`);
    setIsPreparingImages(true);
    let insertedCount = 0;
    try {
      for (const file of images) {
        const prepared = await imageActions.prepare(file);
        const reference = prepared.reference.trim().toLowerCase();
        if (!stableImageReferencePattern.test(reference) || !/^(?:blob:|data:image\/)/i.test(prepared.previewUrl)) {
          throw new Error("Das Bild konnte nicht sicher in den Text eingefügt werden.");
        }
        if (!editor.isConnected || !editor.contains(range.startContainer)) throw new Error("Das Textfeld ist nicht mehr verfügbar.");
        if (insertedCount === 0 && replacesSelection) {
          range.deleteContents();
          range.collapse(true);
        }
        const image = document.createElement("img");
        image.setAttribute("src", prepared.previewUrl);
        image.setAttribute(inlineMediaReferenceAttribute, reference);
        image.setAttribute("alt", prepared.alt || file.name || "Eingefügtes Bild");
        image.setAttribute("decoding", "async");
        range.insertNode(image);
        range.setStartAfter(image);
        range.collapse(true);
        insertedCount += 1;
      }
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      selectionRef.current = range.cloneRange();
      emitChange();
      setImageStatus(insertedCount === 1 ? "Bild wurde eingefügt." : `${insertedCount} Bilder wurden eingefügt.`);
    } catch (error) {
      if (insertedCount > 0) emitChange();
      setImageStatus("");
      setImageError(error instanceof Error ? error.message : "Bild konnte nicht verarbeitet werden.");
    } finally {
      setIsPreparingImages(false);
    }
  }

  function addCloze() {
    const editor = editorRef.current;
    const range = getRestoredEditorRange();
    const selectionOffsets = captureTextSelection();
    if (!editor || !range || !selectionOffsets || range.collapsed || !range.toString().trim()) {
      setClozeStatus("Markiere zuerst Text, um eine Lücke zu erstellen.");
      return;
    }

    if (selectionOverlapsRichTextCloze(editor.textContent ?? "", selectionOffsets)) {
      setClozeStatus("Die Auswahl liegt bereits in einer Lücke.");
      return;
    }

    const groupId = normalizeClozeGroupId(clozeActions?.groupId);
    const prefix = `{{c${groupId}::`;
    const selectedContent = range.extractContents();
    const replacement = document.createDocumentFragment();
    replacement.append(document.createTextNode(prefix), selectedContent, document.createTextNode("}}"));
    range.insertNode(replacement);
    restoreTextSelection({
      start: selectionOffsets.start + prefix.length,
      end: selectionOffsets.end + prefix.length,
    });
    emitChange();
    setClozeStatus(`Lücke c${groupId} erstellt.`);
  }

  function deleteTextRange(startOffset: number, endOffset: number) {
    const editor = editorRef.current;
    if (!editor || startOffset >= endOffset || typeof document === "undefined") return;

    const start = findTextPosition(editor, startOffset);
    const end = findTextPosition(editor, endOffset);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    range.deleteContents();
  }

  function removeCloze() {
    const editor = editorRef.current;
    const range = getRestoredEditorRange();
    const selectionOffsets = captureTextSelection();
    if (!editor || !range || !selectionOffsets) {
      setClozeStatus("Markiere eine vorhandene Lücke oder setze den Cursor hinein.");
      return;
    }

    const span = findRichTextClozeSpan(editor.textContent ?? "", selectionOffsets);
    if (!span) {
      setClozeStatus("Markiere eine vorhandene Lücke oder setze den Cursor hinein.");
      return;
    }

    const contentLength = span.contentEnd - span.contentStart;
    const relativeStart = Math.min(contentLength, Math.max(0, selectionOffsets.start - span.contentStart));
    const relativeEnd = Math.min(contentLength, Math.max(relativeStart, selectionOffsets.end - span.contentStart));
    deleteTextRange(span.contentEnd, span.end);
    deleteTextRange(span.start, span.contentStart);
    restoreTextSelection({
      start: span.start + relativeStart,
      end: span.start + relativeEnd,
    });
    emitChange();
    setClozeStatus("Lücke entfernt.");
  }

  function handleBlur() {
    const editor = editorRef.current;
    if (!editor) return;

    const selectionOffsets = captureTextSelection();
    saveSelection();
    isFocusedRef.current = false;
    const normalizedHtml = normalizeRichTextForEditor(canonicalizeRichTextMedia(editor.innerHTML, Boolean(imageActions)));
    const hydratedHtml = hydrateRichTextMedia(normalizedHtml, imageActions?.mediaUrls ?? {});
    lastEmittedNormalizedHtmlRef.current = normalizedHtml;
    if (editor.innerHTML !== hydratedHtml) {
      editor.innerHTML = hydratedHtml;
      restoreTextSelection(selectionOffsets);
    }
    onChange?.(normalizedHtml);
  }

  function runCommand(command: string, commandValue: string | null = null) {
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined") return;

    restoreSelection();
    document.execCommand("styleWithCSS", false, command === "foreColor" || command === "backColor" ? "true" : "false");
    document.execCommand(command, false, commandValue ?? undefined);
    saveSelection();
    emitChange();
  }

  function selectColorSlot(kind: "text" | "highlight", slotIndex: number) {
    setSelectedColorSlots((currentSlots) => ({ ...currentSlots, [kind]: slotIndex }));
  }

  function applyStoredColor(kind: "text" | "highlight", color: unknown, shouldClose = false) {
    const fallback = kind === "text" ? defaultTextColors[0] : defaultHighlightColors[0];
    runCommand(kind === "text" ? "foreColor" : "backColor", normalizeColor(color, fallback));
    if (shouldClose) setOpenColorMenu(null);
  }

  function changeColorSlot(kind: "text" | "highlight", slotIndex: number, color: unknown) {
    const updateSlot = kind === "text" ? updateTextColorSlot : updateHighlightColorSlot;
    updateSlot(slotIndex, color);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined") return;

    if (imageActions) {
      const clipboardImages = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .flatMap((item) => {
          const file = item.getAsFile();
          return file ? [file] : [];
        });
      if (clipboardImages.length > 0) {
        event.preventDefault();
        saveSelection();
        void insertImageFiles(clipboardImages, selectionRef.current);
        return;
      }
    }

    event.preventDefault();
    const html = event.clipboardData?.getData("text/html");
    const text = event.clipboardData?.getData("text/plain");
    const rawPastedContent = html ? sanitizeCardHtml(html) : textToCardHtml(text);
    const canonicalPastedContent = imageActions
      ? stripUnknownRichTextImages(canonicalizeRichTextMedia(rawPastedContent, true), imageActions.mediaUrls)
      : rawPastedContent;
    const pastedContent = imageActions
      ? hydrateRichTextMedia(canonicalPastedContent, imageActions.mediaUrls)
      : canonicalPastedContent;
    document.execCommand("insertHTML", false, pastedContent);
    emitChange();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!imageActions || event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files);
    const dropRange = rangeAtPoint(event.clientX, event.clientY) ?? selectionRef.current;
    void insertImageFiles(files, dropRange);
  }

  const fieldClass = `${minHeightClass} rich-text-field min-w-0 rounded-b-xl border border-t-0 p-4 core-body-large font-normal leading-7 text-[var(--core-text)] outline-none transition ${
    isActive ? "border-[var(--core-action-primary)] bg-core-surface shadow-[0_0_0_3px_var(--core-focus-ring-soft)]" : "border-[var(--core-border)] bg-core-surface"
  }`;
  const editorDescribedBy = [ariaDescribedBy, clozeStatus ? clozeStatusId : null, imageStatus || imageError ? imageStatusId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="min-w-0" aria-busy={isPreparingImages || undefined}>
      <div ref={toolbarRef} role="toolbar" aria-label="Werkzeuge zur Textformatierung" className={`flex max-w-full min-w-0 flex-wrap items-center gap-1 rounded-t-xl border bg-[var(--core-surface-muted)] p-2 ${isActive ? "border-[var(--core-action-primary)]" : "border-[var(--core-border)]"}`}>
        <ToolbarButton label="Fett" icon={Bold} onRun={() => runCommand("bold")} />
        <ToolbarButton label="Kursiv" icon={Italic} onRun={() => runCommand("italic")} />
        <ToolbarButton label="Unterstrichen" icon={Underline} onRun={() => runCommand("underline")} />
        <span className="mx-1 h-7 w-px bg-[var(--core-border)]" aria-hidden="true" />
        <ToolbarButton label="Stichpunkte" icon={List} onRun={() => runCommand("insertUnorderedList")} />
        <ToolbarButton label="Nummerierte Liste" icon={ListOrdered} onRun={() => runCommand("insertOrderedList")} />
        <span className="mx-1 h-7 w-px bg-[var(--core-border)]" aria-hidden="true" />
        <div className="relative">
          <ColorToolButton
            buttonRef={textColorButtonRef}
            label="Stiftfarbe"
            icon={PenLine}
            color={textColors[selectedColorSlots.text] ?? textColors[0]}
            isOpen={openColorMenu === "text"}
            menuId={textColorMenuId}
            onToggle={() => {
              saveSelection();
              setOpenColorMenu((currentMenu) => (currentMenu === "text" ? null : "text"));
            }}
          />
          {openColorMenu === "text" ? (
            <ColorPopover
              id={textColorMenuId}
              label="Stiftfarbe"
              icon={Palette}
              colors={textColors}
              paletteColors={textPaletteColors}
              selectedSlot={selectedColorSlots.text}
              onSelectSlot={(slotIndex: any) => selectColorSlot("text", slotIndex)}
              onApply={(color: any, shouldClose: boolean|undefined) => applyStoredColor("text", color, shouldClose)}
              onChangeSlot={(slotIndex: any, color: any) => changeColorSlot("text", slotIndex, color)}
            />
          ) : null}
        </div>
        <div className="relative">
          <ColorToolButton
            buttonRef={highlightColorButtonRef}
            label="Markerfarbe"
            icon={Highlighter}
            color={highlightColors[selectedColorSlots.highlight] ?? highlightColors[0]}
            isOpen={openColorMenu === "highlight"}
            menuId={highlightColorMenuId}
            onToggle={() => {
              saveSelection();
              setOpenColorMenu((currentMenu) => (currentMenu === "highlight" ? null : "highlight"));
            }}
          />
          {openColorMenu === "highlight" ? (
            <ColorPopover
              id={highlightColorMenuId}
              label="Markerfarbe"
              icon={Highlighter}
              colors={highlightColors}
              paletteColors={highlightPaletteColors}
              selectedSlot={selectedColorSlots.highlight}
              onSelectSlot={(slotIndex: any) => selectColorSlot("highlight", slotIndex)}
              onApply={(color: any, shouldClose: boolean|undefined) => applyStoredColor("highlight", color, shouldClose)}
              onChangeSlot={(slotIndex: any, color: any) => changeColorSlot("highlight", slotIndex, color)}
            />
          ) : null}
        </div>
        <span className="mx-1 h-7 w-px bg-[var(--core-border)]" aria-hidden="true" />
        <ToolbarButton label="Formatierung löschen" icon={Eraser} onRun={() => runCommand("removeFormat")} />
        {imageActions ? (
          <>
            <span className="mx-1 h-7 w-px bg-[var(--core-border)]" aria-hidden="true" />
            <ToolbarButton
              label="Bild an Cursorposition einfügen"
              icon={ImagePlus}
              disabled={isPreparingImages}
              onRun={() => {
                saveSelection();
                imageInputRef.current?.click();
              }}
            />
            <input
              ref={imageInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void insertImageFiles(files, selectionRef.current);
              }}
            />
          </>
        ) : null}
        {clozeActions ? (
          <>
            <span className="mx-1 h-7 w-px bg-[var(--core-border)]" aria-hidden="true" />
            <ToolbarButton label={`Auswahl als Lücke c${normalizeClozeGroupId(clozeActions.groupId)} markieren`} icon={Braces} onRun={addCloze} />
            <ToolbarButton label="Lücke entfernen" icon={Unlink} onRun={removeCloze} />
          </>
        ) : null}
      </div>
      <div
        ref={editorRef}
        className={fieldClass}
        contentEditable
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={editorDescribedBy}
        suppressContentEditableWarning
        onFocus={(event) => {
          isFocusedRef.current = true;
          onFocus?.(event);
          saveSelection();
        }}
        onInput={() => {
          setClozeStatus("");
          emitChange();
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            selectEditorContents();
          }
        }}
        onBlur={handleBlur}
        onKeyUp={saveSelection}
        onMouseUp={() => {
          setClozeStatus("");
          saveSelection();
        }}
        onPaste={handlePaste}
        onDragOver={(event) => {
          if (imageActions && Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={handleDrop}
      />
      {clozeActions && clozeStatus ? (
        <p id={clozeStatusId} role="status" className="mt-2 core-caption font-medium text-[var(--core-text-muted)]">
          {clozeStatus}
        </p>
      ) : null}
      {imageStatus || imageError ? (
        <p id={imageStatusId} role={imageError ? "alert" : "status"} className={`mt-2 core-caption font-medium ${imageError ? "core-status-error" : "text-[var(--core-text-muted)]"}`}>
          {imageError || imageStatus}
        </p>
      ) : null}
    </div>
  );
}
