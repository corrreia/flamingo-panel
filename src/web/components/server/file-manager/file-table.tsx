import { Checkbox } from "@web/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import type { FileEntry } from "@web/hooks/use-file-manager";
import { isTextFile, joinPath } from "@web/hooks/use-file-manager";
import { formatBytes } from "@web/lib/format";
import { ChevronRight, File, Folder } from "lucide-react";
import type React from "react";

interface FileTableProps {
  currentDir: string;
  files: FileEntry[];
  isAllSelected: boolean;
  onContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onNavigate: (dir: string) => void;
  onOpen: (name: string) => void;
  onSelectAll: () => void;
  onToggleSelect: (name: string) => void;
  selection: Set<string>;
}

function FileTableRow({
  currentDir,
  file,
  isSelected,
  onContextMenu,
  onNavigate,
  onOpen,
  onToggleSelect,
}: {
  currentDir: string;
  file: FileEntry;
  isSelected: boolean;
  onContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onNavigate: (dir: string) => void;
  onOpen: (name: string) => void;
  onToggleSelect: (name: string) => void;
}) {
  const isClickable = file.directory || isTextFile(file.name);

  const handleActivate = () => {
    if (file.directory) {
      onNavigate(joinPath(currentDir, file.name));
    } else if (isTextFile(file.name)) {
      onOpen(file.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isClickable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      handleActivate();
    }
  };

  return (
    <TableRow
      data-state={isSelected ? "selected" : undefined}
      onContextMenu={(e) => onContextMenu(e, file)}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${file.name}`}
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(file.name)}
        />
      </TableCell>
      <TableCell
        className={`flex items-center gap-2 ${isClickable ? "cursor-pointer" : ""}`}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
      >
        {file.directory ? (
          <Folder className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{file.name}</span>
        {file.directory && (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
      </TableCell>
      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
        {file.directory ? "\u2014" : formatBytes(file.size)}
      </TableCell>
      <TableCell className="hidden text-right text-muted-foreground text-xs sm:table-cell">
        {new Date(file.modified).toLocaleString()}
      </TableCell>
    </TableRow>
  );
}

export function FileTable({
  currentDir,
  files,
  isAllSelected,
  onContextMenu,
  onNavigate,
  onOpen,
  onSelectAll,
  onToggleSelect,
  selection,
}: FileTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all files"
              checked={isAllSelected}
              onCheckedChange={onSelectAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="hidden w-24 text-right sm:table-cell">
            Size
          </TableHead>
          <TableHead className="hidden w-40 text-right sm:table-cell">
            Modified
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <FileTableRow
            currentDir={currentDir}
            file={file}
            isSelected={selection.has(file.name)}
            key={file.name}
            onContextMenu={onContextMenu}
            onNavigate={onNavigate}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </TableBody>
    </Table>
  );
}
