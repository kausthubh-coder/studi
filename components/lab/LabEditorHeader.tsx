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

  return (
    <div className="lab-editor-header">
      <div className="lab-editor-file-info">
        <div className="lab-editor-file-title">
          {selectedFilePath ? (
            <>
              {getFileIcon({ name: basename!, isDir: false }, false, 16)}
              <p className="lab-editor-file-name">{basename}</p>
              {isDirty && <span className="lab-editor-dirty-dot" />}
            </>
          ) : (
            <p
              className="lab-editor-file-name"
              style={{ color: "var(--fg-faint)" }}
            >
              Select a file
            </p>
          )}
        </div>
        {selectedFilePath && (
          <p className="lab-editor-file-path">{selectedFilePath}</p>
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
          <Save size={12} strokeWidth={2} />
          {isSaving ? "Saving..." : "Save"}
        </button>
        <span className="lab-editor-save-hint">
          {isTruncated ? "Read-only (truncated)" : "Ctrl+S"}
        </span>
      </div>
    </div>
  );
});
