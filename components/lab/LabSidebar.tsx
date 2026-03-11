import { memo, useMemo } from "react";
import { ChevronRight, FileX, Folder, RefreshCw } from "lucide-react";
import { getFileIcon } from "./labFileIcons";

const SKELETON_WIDTHS = [62, 75, 68, 58, 72] as const;

type FileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
};

type LabSidebarProps = {
  currentPath: string;
  entries: FileEntry[];
  selectedFilePath: string | null;
  isLoadingFiles: boolean;
  onNavigate: (path: string) => void;
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const LabSidebar = memo(function LabSidebar({
  currentPath,
  entries,
  selectedFilePath,
  isLoadingFiles,
  onNavigate,
  onOpenFile,
  onRefresh,
}: LabSidebarProps) {
  const segments = useMemo(() => {
    const trimmed = currentPath.trim();
    const normalized =
      !trimmed || trimmed === "." || trimmed === "/"
        ? ""
        : trimmed
            .replace(/\\/g, "/")
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");
    const parts = normalized ? normalized.split("/").filter(Boolean) : [];
    return [
      {
        label: "root",
        path: ".",
        isCurrent: parts.length === 0,
      },
      ...parts.map((part, i) => ({
        label: part,
        path: parts.slice(0, i + 1).join("/"),
        isCurrent: i === parts.length - 1,
      })),
    ];
  }, [currentPath]);

  return (
    <aside className="lab-sidebar">
      {/* Header */}
      <div className="lab-sidebar-header">
        <p className="lab-sidebar-title">
          <Folder size={13} color="var(--accent3)" strokeWidth={2} />
          Files
        </p>
        <button
          type="button"
          className="lab-sidebar-refresh"
          onClick={onRefresh}
          title="Refresh files"
        >
          <RefreshCw size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Breadcrumbs */}
      <nav className="lab-breadcrumb">
        {segments.map((seg, i) => (
          <span
            key={`${seg.path}:${i}`}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            {i > 0 && (
              <ChevronRight
                size={11}
                className="lab-breadcrumb-sep"
                strokeWidth={2}
              />
            )}
            <button
              type="button"
              className="lab-breadcrumb-segment"
              data-current={seg.isCurrent}
              onClick={() => {
                if (!seg.isCurrent) onNavigate(seg.path);
              }}
            >
              {seg.label}
            </button>
          </span>
        ))}
      </nav>

      {/* File list */}
      <div
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.3rem 0.4rem" }}
      >
        {isLoadingFiles ? (
          <div>
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="lab-file-skeleton"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="lab-file-skeleton-icon" />
                <div
                  className="lab-file-skeleton-text"
                  style={{ width: `${SKELETON_WIDTHS[i] ?? 65}%` }}
                />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="lab-empty-state">
            <FileX size={28} strokeWidth={1.5} />
            <p>No files</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {entries.map((entry, i) => (
              <button
                key={entry.path}
                type="button"
                className="lab-file-entry"
                data-selected={selectedFilePath === entry.path}
                data-kind={entry.isDir ? "dir" : "file"}
                style={{ animationDelay: `${i * 30}ms` }}
                title={entry.path}
                onClick={() => {
                  if (entry.isDir) {
                    onNavigate(entry.path);
                  } else {
                    onOpenFile(entry.path);
                  }
                }}
              >
                <span className="lab-file-icon">
                  {getFileIcon(entry, false)}
                </span>
                <span className="lab-file-name">{entry.name}</span>
                {!entry.isDir && entry.size > 0 && (
                  <span className="lab-file-size">
                    {formatFileSize(entry.size)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
});
