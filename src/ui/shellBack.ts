import React, { type ReactNode } from "react";
import { useStableCallback } from "./useStableCallback.ts";

export interface ShellBack {
  title: string;
  label: string;
  onSelect: () => void;
  /** Keep it memoized: a new element registers the page again. */
  icon?: ReactNode;
}

export const ShellBackContext = React.createContext<React.Dispatch<React.SetStateAction<ShellBack | null>> | null>(null);

export const SHELL_REVEAL_EVENT = "core-shell-reveal";

/** Brings back a navigation head hidden by scrolling, e.g. because a deck drag needs it as drop zone. */
export function revealShellHeader() {
  window.dispatchEvent(new Event(SHELL_REVEAL_EVENT));
}

/** Registers before paint, so the bar switches together with the subpage; returns whether the shell shows the back link. */
export function useShellBack(back: ShellBack | undefined) {
  const setShellBack = React.useContext(ShellBackContext);
  const onSelect = useStableCallback(() => back?.onSelect());
  const title = back?.title;
  const label = back?.label;
  const icon = back?.icon;
  React.useLayoutEffect(() => {
    if (!setShellBack || title === undefined || label === undefined) return undefined;
    const entry = { title, label, icon, onSelect };
    setShellBack(entry);
    // Unregisters by identity, so a replaced page never removes the next page's entry.
    return () => setShellBack((current) => current === entry ? null : current);
  }, [setShellBack, title, label, icon, onSelect]);
  return Boolean(setShellBack && back);
}
