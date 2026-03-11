import { memo } from "react";
import { Save } from "lucide-react";
import { getFileIcon } from "./labFileIcons";

type LabEditorHeaderProps = {
  selectedFilePath: string | null;
  isDirty: boolean;
  isSaving: boolean;
  isBinary: boolean;
  isTruncated: boolean;
  onSave: () => void;
};

export const LabEditorHeader = memo(function LabEditorHeader({
  selectedFilePath,
  isDirty,
  isSaving,
  isBinary,
  isTruncated,
  onSave,
}: LabEditorHeaderProps) {
  const basename = selectedFilePath
    ? (selectedFilePath.split("/").pop() ?? selectedFilePath)
    : null;

  const dirPath = selectedFilePath?.includes("/")
    ? selectedFilePath.slice(0, selectedFilePath.lastIndexOf("/"))
    : null;

  return (
    <div className="lab-editor-header">
      <div className="lab-editor-file-info">
        <div className="lab-editor-file-title">
          {selectedFilePath ? (
            <>
              {getFileIcon({ name: basename!, isDir: false }, false, 14)}
              <p className="lab-editor-file-name">{basename}</p>
              {isDirty && <span className="lab-editor-dirty-dot" />}
            </>
          ) : (
            <p
              className="lab-editor-file-name"
              style={{ color: "var(--fg-faint)", fontWeight: 400 }}
            >
              No file open
            </p>
          )}
        </div>
        {dirPath && (
          <p className="lab-editor-file-path">{dirPath}/</p>
        )}
      </div>

      <div className="lab-editor-save-wrap">
        <button
          type="button"
          className="lab-editor-save-btn"
          disabled={
            !isDirty || isSaving || isBinary || isTruncated || !selectedFilePath
          }
          onClick={onSave}
        >
          <Save size={11} strokeWidth={2.2} />
          {isSaving ? "Saving…" : "Save"}
        </button>
        <span className="lab-editor-save-hint">
          {isTruncated ? "read-only" : "⌘S / Ctrl+S"}
        </span>
      </div>
    </div>
  );
});
