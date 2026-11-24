import React from "react";

/** `children` is usually one or more `EditorToolbarContext` rows below `modes` and `actions`. */
export function EditorToolbar({ modes, actions, children, className = "", ...props }: {
  modes: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  return <div {...props} className={`core-editor-toolbar core-surface-raised ${className}`.trim()}>
    {modes}
    {actions ? <div className="core-editor-toolbar-actions">{actions}</div> : null}
    {children}
  </div>;
}

/** `end` stays at the trailing edge while the tools wrap or scroll; `endLabel` names that group. */
export function EditorToolbarContext({ children, end, endLabel, toolsRef, className = "" }: {
  children?: React.ReactNode;
  end?: React.ReactNode;
  endLabel?: string;
  toolsRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  return <div className={`core-editor-toolbar-context ${className}`.trim()}>
    <div ref={toolsRef} className="core-editor-toolbar-tools">{children}</div>
    {end ? <div className="core-editor-toolbar-end" role="group" aria-label={endLabel}>{end}</div> : null}
  </div>;
}
