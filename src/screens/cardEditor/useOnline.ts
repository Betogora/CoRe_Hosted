import React from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Whether the browser is online; cloud-only parts of the editor disappear offline (W19). */
export function useOnline(): boolean {
  return React.useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
