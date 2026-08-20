import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Check, Download, LoaderCircle } from "lucide-react";
import { translate, useLanguage } from "../i18n";

type DownloadStatus = "idle" | "saving" | "saved" | "failed";

type ArtifactDownloadButtonProps = {
  filePath: string;
  workspacePath?: string;
  className?: string;
};

export function ArtifactDownloadButton({
  filePath,
  workspacePath,
  className = "",
}: ArtifactDownloadButtonProps) {
  useLanguage();
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const scheduleReset = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setStatus("idle");
      resetTimerRef.current = null;
    }, 1800);
  };

  const handleDownload = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!workspacePath || status === "saving") return;

    setStatus("saving");
    try {
      const result = await window.electronAPI.downloadFile(
        filePath,
        workspacePath,
      );
      if (result.success) {
        setStatus("saved");
        scheduleReset();
        return;
      }
      if (result.canceled) {
        setStatus("idle");
        return;
      }
      setStatus("failed");
      scheduleReset();
    } catch (error) {
      console.error("Failed to download generated file:", error);
      setStatus("failed");
      scheduleReset();
    }
  };

  const isSaving = status === "saving";
  const label =
    status === "saved"
      ? translate("common.saved", "Saved")
      : status === "failed"
        ? translate("common.downloadFailed", "Download failed")
        : translate("common.download", "Download");
  const Icon = status === "saved" ? Check : isSaving ? LoaderCircle : Download;

  return (
    <button
      type="button"
      className={`artifact-download-button ${className}`.trim()}
      onClick={handleDownload}
      disabled={!workspacePath || isSaving}
      title={label}
      aria-label={label}
    >
      <Icon
        size={17}
        strokeWidth={2}
        className={isSaving ? "artifact-download-button-spinner" : undefined}
      />
      <span>{label}</span>
    </button>
  );
}
