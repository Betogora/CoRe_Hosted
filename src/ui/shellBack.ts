import React from "react";
import { useStableCallback } from "./useStableCallback.ts";

export interface ShellBack {
  title: string;
  label: string;
  onSelect: () => void;
}

export const ShellBackContext = React.createContext<React.Dispatch<React.SetStateAction<ShellBack | null>> | null>(null);

/** Registers before the first paint, so a subpage never shows a frame of the floating card; returns whether the shell shows the back link. */
export function useShellBack(back: ShellBack | undefined) {
  const setShellBack = React.useContext(ShellBackContext);
  const onSelect = useStableCallback(() => back?.onSelect());
  const title = back?.title;
  const label = back?.label;
  React.useLayoutEffect(() => {
    if (!setShellBack || title === undefined || label === undefined) return undefined;
    const entry = { title, label, onSelect };
    setShellBack(entry);
    // Unregisters by identity, so a replaced page never removes the next page's entry.
    return () => setShellBack((current) => current === entry ? null : current);
  }, [setShellBack, title, label, onSelect]);
  return Boolean(setShellBack && back);
}
