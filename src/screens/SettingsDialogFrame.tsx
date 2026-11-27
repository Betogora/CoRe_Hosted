import React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { CloseButton, IconButton } from "../ui/actionUi.tsx";
import { useModalDialog } from "../ui/useModalDialog.ts";

export interface SettingsDialogArea<S extends string> {
  section: S;
  label: string;
  icon: LucideIcon;
}

export interface SettingsDialogFrameProps<S extends string> {
  title: React.ReactNode;
  closeLabel: string;
  navigationLabel: string;
  testId: string;
  groups: ReadonlyArray<{ label?: string; items: ReadonlyArray<SettingsDialogArea<S>> }>;
  activeSection: S;
  showAreaList: boolean;
  onSelectSection: (section: S) => unknown;
  onShowAreaList?: () => unknown;
  onClose: () => unknown;
  /** The dialog this one belongs to; shown before the title, narrow as `icon` instead of the label. */
  back?: { label: string; icon: LucideIcon; onSelect: () => unknown };
  navigationHeader?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function SettingsDialogFrame<S extends string>({ title, closeLabel, navigationLabel, testId, groups, activeSection, showAreaList, onSelectSection, onShowAreaList, onClose, back, navigationHeader, footer, children }: SettingsDialogFrameProps<S>) {
  const titleId = React.useId();
  // Escape belongs to the dialog; otherwise a study session underneath would also read it as "exit".
  const { dialogRef, initialFocusRef } = useModalDialog({ open: true, onClose, stopEscapePropagation: true });
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeSection]);

  const dialog = (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-[var(--core-backdrop)] md:items-center md:p-4"
      data-testid={`${testId}-backdrop`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        data-settings-view={showAreaList ? "areas" : "area"}
        className="core-overlay flex h-dvh w-full flex-col overflow-hidden md:h-[min(48rem,88dvh)] md:max-w-5xl md:rounded-overlay"
      >
        <header className={`core-dialog-header ${back || (!showAreaList && onShowAreaList) ? "pl-[var(--core-dialog-corner-inset)] md:pl-6" : "pl-6"}`}>
          {showAreaList || !onShowAreaList ? null : <IconButton label="Zurück zu den Bereichen" icon={ChevronLeft} variant="ghost" className="md:hidden" onClick={onShowAreaList} />}
          {back ? (
            <>
              <button
                type="button"
                aria-label={`Zurück zu ${back.label}`}
                data-settings-back="true"
                onClick={back.onSelect}
                className={`flex h-button min-w-button shrink-0 items-center justify-center gap-1.5 rounded-control text-core-text transition-colors hover:bg-core-hover md:-ml-2 md:pl-1.5 md:pr-2 md:text-core-secondary md:hover:text-core-text md:[&>svg]:text-core-muted md:hover:[&>svg]:text-core-action ${showAreaList || !onShowAreaList ? "" : "max-md:-ml-2"}`}
              >
                <back.icon className="shrink-0 md:hidden" size={18} aria-hidden="true" />
                <ChevronLeft className="hidden shrink-0 md:block" size={20} aria-hidden="true" />
                <span className="hidden core-heading-3 md:inline">{back.label}</span>
              </button>
              <ChevronRight className="-ml-3 shrink-0 text-core-muted md:-ml-1 md:mr-1" size={16} aria-hidden="true" />
            </>
          ) : null}
          <h2 id={titleId} className="flex min-w-0 flex-1 items-center gap-3 core-heading-2 text-core-text">{title}</h2>
          <CloseButton ref={initialFocusRef} label={closeLabel} onClick={onClose} />
        </header>
        <div className="flex min-h-0 flex-1">
          <nav aria-label={navigationLabel} className={`${showAreaList ? "flex" : "hidden"} min-h-0 w-full flex-col gap-4 overflow-y-auto overscroll-contain p-3 empty:hidden md:flex md:w-56 md:shrink-0 md:border-r md:border-core-border lg:w-max`}>
            {/* Takes the column width without widening it, so a long deck name truncates. */}
            {navigationHeader ? <div className="grid gap-2 md:w-0 md:min-w-full">{navigationHeader}</div> : null}
            {groups.map((group, index) => (
              <div key={group.label ?? index} className="grid gap-1">
                {group.label ? <p className="px-3 pt-1 core-caption font-medium text-core-muted">{group.label}</p> : null}
                <ul className="grid gap-0.5">
                  {group.items.map(({ section: itemSection, label, icon: Icon }) => {
                    const highlighted = itemSection === activeSection;
                    return (
                      <li key={itemSection}>
                        <button
                          type="button"
                          aria-current={!showAreaList && highlighted ? "page" : undefined}
                          data-settings-section={itemSection}
                          onClick={() => onSelectSection(itemSection)}
                          className={`flex min-h-button w-full min-w-0 items-center gap-3 rounded-control px-3 text-left core-body transition-colors ${highlighted ? "md:bg-core-subtle md:font-semibold md:text-core-action" : ""} text-core-text hover:bg-core-subtle`}
                        >
                          <Icon className="shrink-0" size={18} aria-hidden="true" />
                          {/* The hidden bold copy reserves the active width, so the column never changes with the selection. */}
                          <span data-label={label} className="grid min-w-0 flex-1 break-words after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]">{label}</span>
                          <ChevronRight className="shrink-0 text-core-muted md:hidden" size={16} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div ref={contentRef} className={`${showAreaList ? "hidden" : "block"} min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 md:block`}>
            {children}
          </div>
        </div>
        {footer ? <div className="shrink-0 border-t border-core-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
