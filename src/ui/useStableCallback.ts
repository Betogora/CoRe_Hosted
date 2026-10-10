import React from "react";

/** Keeps a callback's identity across renders while always calling its latest version, so memoized rows can skip rendering. */
export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = React.useRef(callback);
  latest.current = callback;
  return React.useCallback((...args: Args) => latest.current(...args), []);
}
