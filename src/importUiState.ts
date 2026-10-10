export type ImportUiState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "preview" }
  | { status: "committing" }
  | { status: "syncing_cloud" }
  | { status: "syncing_media" }
  | { status: "succeeded" }
  | { status: "partial" }
  | { status: "failed_retryable" }
  | { status: "failed_terminal" }
  | { status: "cancelled" };

export interface ImportUiProjectionInput {
  jobStatus?: string | null;
  mediaStatus?: string | null;
  cloudStatus?: string | null;
  hasPreview?: boolean;
  hasMediaTask?: boolean;
  isBusy?: boolean;
}

export function projectImportUiState({
  jobStatus = null,
  mediaStatus = null,
  cloudStatus = null,
  hasPreview = false,
  hasMediaTask = false,
  isBusy = false,
}: ImportUiProjectionInput): ImportUiState {
  if (jobStatus === "error") return { status: "failed_terminal" };
  if (jobStatus === "syncing_cloud" || cloudStatus === "syncing" || cloudStatus === "local-pending") return { status: "syncing_cloud" };
  if (jobStatus === "syncing_media" && hasMediaTask && (!mediaStatus || mediaStatus === "local-pending" || mediaStatus === "paused")) return { status: "syncing_media" };
  if (mediaStatus && ["partial", "local-pending", "blocked", "cancelled"].includes(mediaStatus)) return { status: "partial" };
  if (jobStatus === "done" || mediaStatus === "cloud-ready") return { status: "succeeded" };
  if (hasMediaTask || jobStatus === "syncing_media") return { status: "syncing_media" };
  if (jobStatus === "committing") return { status: "committing" };
  if (hasPreview && !isBusy) return { status: "preview" };
  if (isBusy || jobStatus === "parsing") return { status: "analyzing" };
  return { status: "idle" };
}
