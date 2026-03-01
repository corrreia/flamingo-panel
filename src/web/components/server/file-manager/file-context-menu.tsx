import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@web/components/ui/context-menu";
import { type FileEntry, isArchive } from "@web/hooks/use-file-manager";
import {
  Archive,
  Copy,
  Download,
  FileEdit,
  FolderOpen,
  PackageOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import type * as React from "react";

interface FileContextMenuProps {
  children: React.ReactNode;
  file: FileEntry;
  onCompress: () => void;
  onCopy: () => void;
  onDecompress: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onRename: () => void;
}

export function FileContextMenu({
  children,
  file,
  onCompress,
  onCopy,
  onDecompress,
  onDelete,
  onDownload,
  onOpen,
  onRename,
}: FileContextMenuProps) {
  const showDownload = !file.directory;
  const showDecompress = !file.directory && isArchive(file.name);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>
          {file.directory ? (
            <FolderOpen className="size-4" />
          ) : (
            <FileEdit className="size-4" />
          )}
          Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={onRename}>
          <Pencil className="size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCopy}>
          <Copy className="size-4" />
          Copy
        </ContextMenuItem>
        {showDownload && (
          <ContextMenuItem onSelect={onDownload}>
            <Download className="size-4" />
            Download
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onCompress}>
          <Archive className="size-4" />
          Compress
        </ContextMenuItem>
        {showDecompress && (
          <ContextMenuItem onSelect={onDecompress}>
            <PackageOpen className="size-4" />
            Decompress
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={onDelete}
        >
          <Trash2 className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
