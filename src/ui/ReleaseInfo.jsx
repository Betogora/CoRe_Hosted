import React from "react";
import { APP_RUNTIME_INFO, formatAppRuntimeInfo } from "../appRuntime.js";

export function ReleaseInfo({ info = APP_RUNTIME_INFO, className = "" }) {
  return (
    <p className={`text-xs font-medium text-[#66709a] ${className}`.trim()} role="note" aria-label="Release-Information">
      {formatAppRuntimeInfo(info)}
    </p>
  );
}
