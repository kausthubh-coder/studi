import type { ReactNode } from "react";
import {
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Terminal,
} from "lucide-react";

type FileEntry = { name: string; isDir: boolean };

const EXT_MAP: Record<string, { icon: typeof File; color: string }> = {
  ".ts": { icon: FileCode2, color: "#3178c6" },
  ".tsx": { icon: FileCode2, color: "#3178c6" },
  ".js": { icon: FileCode2, color: "#f0db4f" },
  ".jsx": { icon: FileCode2, color: "#f0db4f" },
  ".py": { icon: FileCode2, color: "#3776ab" },
  ".json": { icon: FileJson, color: "var(--accent3)" },
  ".css": { icon: FileCode2, color: "#264de4" },
  ".html": { icon: FileCode2, color: "var(--accent)" },
  ".md": { icon: FileText, color: "var(--fg-muted)" },
  ".sh": { icon: Terminal, color: "var(--accent2)" },
  ".png": { icon: FileImage, color: "var(--accent4)" },
  ".jpg": { icon: FileImage, color: "var(--accent4)" },
  ".jpeg": { icon: FileImage, color: "var(--accent4)" },
  ".svg": { icon: FileImage, color: "var(--accent4)" },
  ".gif": { icon: FileImage, color: "var(--accent4)" },
  ".webp": { icon: FileImage, color: "var(--accent4)" },
};

export function getFileIcon(
  entry: FileEntry,
  isOpen?: boolean,
  size = 15,
): ReactNode {
  if (entry.isDir) {
    const Icon = isOpen ? FolderOpen : Folder;
    return <Icon size={size} color="var(--accent3)" strokeWidth={1.8} />;
  }

  const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
  const match = EXT_MAP[ext];
  if (match) {
    const Icon = match.icon;
    return <Icon size={size} color={match.color} strokeWidth={1.8} />;
  }

  return <File size={size} color="var(--fg-faint)" strokeWidth={1.8} />;
}
