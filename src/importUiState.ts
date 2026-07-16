export type ImportUiState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "preview" }
  | { status: "committing" }
  | { status: "syncing_media" }
  | { status: "succeeded" }
  | { status: "partial" }
  | { status: "failed_retryable" }
  | { status: "failed_terminal" }
  | { status: "cancelled" };

export interface ImportUiProjectionInput {
  jobStatus?: string | null;
  progressStatus?: string | null;
  retryable?: boolean;
  mediaStatus?: string | null;
  hasPreview?: boolean;
  hasMediaTask?: boolean;
  isBusy?: boolean;
}

export function projectImportUiState({
  jobStatus = null,
  progressStatus = null,
  retryable = false,
  mediaStatus = null,
  hasPreview = false,
  hasMediaTask = false,
  isBusy = false,
}: ImportUiProjectionInput): ImportUiState {
  if (jobStatus === "cancelled" || progressStatus === "cancelled") return { status: "cancelled" };
  if ((jobStatus === "failed" || progressStatus === "failed") && retryable) return { status: "failed_retryable" };
  if (jobStatus === "error" || jobStatus === "failed" || progressStatus === "failed") return { status: "failed_terminal" };
  if (mediaStatus && ["partial", "local-pending", "blocked", "cancelled"].includes(mediaStatus)) return { status: "partial" };
  if (jobStatus === "done" || jobStatus === "succeeded" || mediaStatus === "cloud-ready") return { status: "succeeded" };
  if (hasMediaTask || jobStatus === "syncing_media") return { status: "syncing_media" };
  if (jobStatus === "committing") return { status: "committing" };
  if (hasPreview && !isBusy) return { status: "preview" };
  if (isBusy || ["parsing", "analyzing", "queued", "running"].includes(jobStatus ?? "")) return { status: "analyzing" };
  return { status: "idle" };
}
