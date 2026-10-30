import React from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { normalizeTags } from "../coreModel.ts";
import { canonicalTagSpelling, suggestTags, type TagDirectoryEntry } from "../tagDirectory.ts";
import { CoreTooltip } from "./tooltipUi.tsx";

const tagKey = (tag: string) => tag.toLocaleLowerCase("und");

/** Last `::` part of a tag, as the chip shows it; the full path stays in the tooltip. */
export function tagLeaf(tag: string): string {
  return tag.split("::").at(-1) || tag;
}

export interface TagInputProps {
  tags: readonly string[];
  /** Tags of the last import; those still present form the collapsed imported group (V4). */
  importedTags?: readonly string[];
  directory?: readonly TagDirectoryEntry[];
  onChange: (tags: string[], change: { added: string[]; removed: string[] }) => void;
  label?: string;
  /** The label stays for assistive technology while a surrounding heading names the field. */
  labelHidden?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Tag chips with suggestions from the account's directory. Space, Enter and Tab finish a tag, pasting splits only at
 * whitespace; `#`, `,` and `;` stay part of a tag (W10). A chip's text goes back into the field for editing.
 */
export function TagInput({ tags, importedTags = [], directory = [], onChange, label = "Tags", labelHidden = false, placeholder = "Tag hinzufügen", disabled = false }: TagInputProps) {
  const [text, setText] = React.useState("");
  const [importedOpen, setImportedOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();
  const listId = React.useId();
  const importedKeys = React.useMemo(() => new Set(importedTags.map(tagKey)), [importedTags]);
  const imported = tags.filter((tag) => importedKeys.has(tagKey(tag)));
  const own = tags.filter((tag) => !importedKeys.has(tagKey(tag)));
  const suggestions = React.useMemo(() => suggestTags(directory, text, tags), [directory, tags, text]);
  const listOpen = suggestions.length > 0 && Boolean(text.trim());

  function commit(next: string[], removed: string[] = []) {
    const added = next.filter((tag) => !tags.some((current) => tagKey(current) === tagKey(tag)));
    if (!added.length && !removed.length) return;
    onChange(next, { added, removed });
  }

  function add(raw: string) {
    const typed = normalizeTags(raw).map((tag) => canonicalTagSpelling(directory, tag));
    setText("");
    setActiveIndex(-1);
    if (typed.length) commit(normalizeTags([...tags, ...typed]));
  }

  function remove(tag: string) {
    commit(tags.filter((candidate) => candidate !== tag), [tag]);
  }

  function edit(tag: string) {
    remove(tag);
    setText(tag);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (listOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const last = suggestions.length - 1;
      setActiveIndex((index) => event.key === "ArrowDown" ? (index < last ? index + 1 : 0) : (index > 0 ? index - 1 : last));
      return;
    }
    if (event.key === "Escape" && text) {
      event.stopPropagation();
      setText("");
      setActiveIndex(-1);
      return;
    }
    if ((event.key === "Enter" || event.key === " " || event.key === "Tab") && (text.trim() || (event.key === "Enter" && activeIndex >= 0))) {
      if (event.key !== "Tab" || text.trim()) event.preventDefault();
      add(activeIndex >= 0 && suggestions[activeIndex] ? suggestions[activeIndex].tag : text);
      return;
    }
    if (event.key === "Backspace" && !text && own.length) {
      event.preventDefault();
      edit(own.at(-1)!);
    }
  }

  function chip(tag: string) {
    return (
      <li key={tag} className="flex min-w-0 max-w-full items-center rounded-inset bg-core-subtle core-body text-core-text">
        <CoreTooltip label={tag}>
          <button type="button" disabled={disabled} className="min-h-11 min-w-0 truncate pl-2.5 pr-1 text-left font-semibold md:min-h-8" aria-label={`Tag ${tag} bearbeiten`} onClick={() => edit(tag)}>
            {tagLeaf(tag)}
          </button>
        </CoreTooltip>
        <button type="button" disabled={disabled} className="grid size-11 shrink-0 place-items-center rounded-inset text-core-muted hover:text-core-text md:size-8" aria-label={`Tag ${tag} entfernen`} onClick={() => remove(tag)}>
          <X size={14} aria-hidden="true" />
        </button>
      </li>
    );
  }

  return (
    <div className="grid min-w-0 gap-2" data-tag-input="true">
      <label htmlFor={inputId} className={labelHidden ? "sr-only" : "core-body font-semibold text-core-secondary"}>{label}</label>
      <div className="relative min-w-0">
        <div className="flex min-h-control min-w-0 flex-wrap items-center gap-1.5 rounded-control border border-core-border bg-core-surface px-1.5 py-1" onClick={(event) => { if (event.target === event.currentTarget) inputRef.current?.focus(); }}>
          {own.length ? <ul className="contents" aria-label="Eigene Tags">{own.map(chip)}</ul> : null}
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            disabled={disabled}
            value={text}
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 min-w-24 flex-1 bg-transparent px-1.5 core-body text-core-text outline-none focus-visible:outline-none md:min-h-8"
            placeholder={tags.length ? "" : placeholder}
            onChange={(event) => {
              const value = event.target.value;
              if (/\s/.test(value.trimStart())) add(value);
              else {
                setText(value.trimStart());
                setActiveIndex(-1);
              }
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text/plain");
              if (!/\s/.test(pasted.trim())) return;
              event.preventDefault();
              add(`${text} ${pasted}`);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (text.trim()) add(text); }}
          />
        </div>
        {listOpen ? (
          <ul id={listId} role="listbox" aria-label="Vorschläge" className="core-overlay absolute inset-x-0 top-full z-20 mt-1 grid max-h-64 overflow-y-auto rounded-control border border-core-border p-1 shadow-floating">
            {suggestions.map((entry, index) => (
              <li
                key={entry.tag}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex min-h-control cursor-pointer items-center justify-between gap-3 rounded-inset px-3 core-body text-core-text ${index === activeIndex ? "bg-core-subtle" : "hover:bg-core-subtle"}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(entry.tag);
                }}
              >
                <span className="min-w-0 truncate">{entry.tag.split("::").join(" › ")}</span>
                <span className="shrink-0 core-caption text-core-muted">{entry.noteCount}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {imported.length ? (
        <div className="grid min-w-0 gap-1.5">
          <button type="button" aria-expanded={importedOpen} onClick={() => setImportedOpen((open) => !open)} className="flex min-h-control w-fit items-center gap-1.5 rounded-control px-1 core-body font-semibold text-core-secondary hover:text-core-text">
            {importedOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            Importiert ({imported.length})
          </button>
          {importedOpen ? <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Importierte Tags">{imported.map(chip)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}
