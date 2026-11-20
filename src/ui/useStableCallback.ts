import React from "react";

export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = React.useRef(callback);
  latest.current = callback;
  return React.useCallback((...args: Args) => latest.current(...args), []);
}
