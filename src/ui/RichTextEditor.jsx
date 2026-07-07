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
  const normalizedValue = React.useMemo(() => normalizeRichTextForEditor(value), [value]);

  React.useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== normalizedValue) {
      editor.innerHTML = normalizedValue;
    }
  }, [normalizedValue]);

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
    saveSelection();
    onChange?.(sanitizeCardHtml(editor.innerHTML));
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
        onBlur={emitChange}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={handlePaste}
      />
    </div>
  );
}
