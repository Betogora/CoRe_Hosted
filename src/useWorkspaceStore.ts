import React from "react";
import { createSelectionReader, createWorkspaceStore, type WorkspaceSnapshot, type WorkspaceStore } from "./workspaceStore.ts";

/** The open account's store; without a provider an empty one, so screens render on their own in tests and the catalog. */
export const WorkspaceStoreContext = React.createContext<WorkspaceStore>(createWorkspaceStore());

export function useWorkspaceStore(): WorkspaceStore {
  return React.useContext(WorkspaceStoreContext);
}

/** Reads one part of the store and renders again only when that part changes in content, not just in identity. */
export function useWorkspaceValue<T>(select: (snapshot: WorkspaceSnapshot) => T): T {
  const store = useWorkspaceStore();
  const [read] = React.useState(createSelectionReader<T>);
  const readSelection = () => read(store, select);
  return React.useSyncExternalStore(store.subscribe, readSelection, readSelection);
}
