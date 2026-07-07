import React from "react";
import { Bold, Eraser, Highlighter, Italic, List, ListOrdered, Palette, Underline } from "lucide-react";
import { sanitizeCardHtml } from "../htmlSafety.js";
import { normalizeRichTextForEditor, textToCardHtml } from "../richText.js";

const textColors = ["#17214f", "#2563eb", "#047857", "#b42318", "#b54708"];
const highlightColors = ["#fef08a", "#bbf7d0", "#bae6fd", "#fecdd3", "#e9d5ff"];

function ToolbarButton({ label, icon: Icon, onRun }) {
  return (
    <button
      type="button"
      className="grid size-9 place-items-center rounded-lg border border-[#dfe4f5] bg-white text-[#4f5eb1] transition hover:bg-[#f8f9fe]"
      title={label}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

function ColorSwatch({ label, color, onRun }) {
  return (
    <button
      type="button"
      className="grid size-8 place-items-center rounded-lg border border-[#dfe4f5] bg-white transition hover:bg-[#f8f9fe]"
      title={label}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun(color);
      }}
    >
      <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />
    </button>
  );
}

export function RichTextEditor({ value = "", onChange, onFocus, isActive = false, minHeightClass = "min-h-48", ariaLabel }) {
  const editorRef = React.useRef(null);
  const selectionRef = React.useRef(null);
  const isFocusedRef = React.useRef(false);
  const lastEmittedNormalizedHtmlRef = React.useRef("");
  const normalizedValue = React.useMemo(() => normalizeRichTextForEditor(value), [value]);

  React.useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const isLocalEditorUpdate = normalizedValue === lastEmittedNormalizedHtmlRef.current && (isFocusedRef.current || hasEditorSelection());
    if (isLocalEditorUpdate) return;

    if (editor.innerHTML !== normalizedValue) {
      const selection = isFocusedRef.current ? captureTextSelection() : null;
      editor.innerHTML = normalizedValue;
      restoreTextSelection(selection);
    }
    lastEmittedNormalizedHtmlRef.current = normalizedValue;
  }, [normalizedValue]);

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

  function findTextPosition(node, offset) {
    let remaining = Math.max(0, offset);
    let fallback = { node, offset: node.childNodes.length };

    function visit(currentNode) {
      if (currentNode.nodeType === 3) {
        const textLength = currentNode.textContent?.length ?? 0;
        if (remaining <= textLength) return { node: currentNode, offset: remaining };
        remaining -= textLength;
        fallback = { node: currentNode, offset: textLength };
        return null;
      }

      for (const child of currentNode.childNodes) {
        const found = visit(child);
        if (found) return found;
      }

      fallback = { node: currentNode, offset: currentNode.childNodes.length };
      return null;
    }

    return visit(node) ?? fallback;
  }

  function restoreTextSelection(selectionOffsets) {
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
    const sanitizedHtml = sanitizeCardHtml(editor.innerHTML);
    lastEmittedNormalizedHtmlRef.current = normalizeRichTextForEditor(sanitizedHtml);
    onChange?.(lastEmittedNormalizedHtmlRef.current);
  }

  function handleBlur() {
    const editor = editorRef.current;
    if (!editor) return;

    isFocusedRef.current = false;
    const normalizedHtml = normalizeRichTextForEditor(editor.innerHTML);
    lastEmittedNormalizedHtmlRef.current = normalizedHtml;
    if (editor.innerHTML !== normalizedHtml) {
      editor.innerHTML = normalizedHtml;
    }
    onChange?.(normalizedHtml);
  }

  function runCommand(command, commandValue = null) {
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined") return;

    restoreSelection();
    document.execCommand("styleWithCSS", false, command === "foreColor" || command === "backColor");
    document.execCommand(command, false, commandValue);
    saveSelection();
    emitChange();
  }

  function handlePaste(event) {
    const editor = editorRef.current;
    if (!editor || typeof document === "undefined") return;

    event.preventDefault();
    const html = event.clipboardData?.getData("text/html");
    const text = event.clipboardData?.getData("text/plain");
    const pastedContent = html ? sanitizeCardHtml(html) : textToCardHtml(text);
    document.execCommand("insertHTML", false, pastedContent);
    emitChange();
  }

  const fieldClass = `${minHeightClass} rich-text-field min-w-0 rounded-b-xl border border-t-0 p-4 text-base font-normal leading-7 text-[#17214f] outline-none transition ${
    isActive ? "border-[#4f5eb1] bg-white shadow-[0_0_0_3px_rgba(79,94,177,0.13)]" : "border-[#dfe4f5] bg-white"
  }`;

  return (
    <div className="min-w-0">
      <div className={`flex max-w-full min-w-0 flex-wrap items-center gap-1 rounded-t-xl border bg-[#f8f9fe] p-2 ${isActive ? "border-[#4f5eb1]" : "border-[#dfe4f5]"}`}>
        <ToolbarButton label="Fett" icon={Bold} onRun={() => runCommand("bold")} />
        <ToolbarButton label="Kursiv" icon={Italic} onRun={() => runCommand("italic")} />
        <ToolbarButton label="Unterstrichen" icon={Underline} onRun={() => runCommand("underline")} />
        <span className="mx-1 h-7 w-px bg-[#dfe4f5]" aria-hidden="true" />
        <ToolbarButton label="Stichpunkte" icon={List} onRun={() => runCommand("insertUnorderedList")} />
        <ToolbarButton label="Nummerierte Liste" icon={ListOrdered} onRun={() => runCommand("insertOrderedList")} />
        <span className="mx-1 h-7 w-px bg-[#dfe4f5]" aria-hidden="true" />
        <span className="grid size-8 place-items-center text-[#66709a]" title="Textfarbe" aria-hidden="true">
          <Palette size={16} />
        </span>
        {textColors.map((color) => (
          <ColorSwatch key={color} label={`Textfarbe ${color}`} color={color} onRun={(nextColor) => runCommand("foreColor", nextColor)} />
        ))}
        <span className="mx-1 h-7 w-px bg-[#dfe4f5]" aria-hidden="true" />
        <span className="grid size-8 place-items-center text-[#66709a]" title="Highlight" aria-hidden="true">
          <Highlighter size={16} />
        </span>
        {highlightColors.map((color) => (
          <ColorSwatch key={color} label={`Highlight ${color}`} color={color} onRun={(nextColor) => runCommand("backColor", nextColor)} />
        ))}
        <span className="mx-1 h-7 w-px bg-[#dfe4f5]" aria-hidden="true" />
        <ToolbarButton label="Formatierung löschen" icon={Eraser} onRun={() => runCommand("removeFormat")} />
      </div>
      <div
        ref={editorRef}
        className={fieldClass}
        contentEditable
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        suppressContentEditableWarning
        onFocus={(event) => {
          isFocusedRef.current = true;
          onFocus?.(event);
          saveSelection();
        }}
        onInput={emitChange}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            selectEditorContents();
          }
        }}
        onBlur={handleBlur}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={handlePaste}
      />
    </div>
  );
}
