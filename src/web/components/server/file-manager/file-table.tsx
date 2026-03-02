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
import { ChevronRight, File, Folder, FolderUp } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Module-level drag state – only one drag operation at a time
// ---------------------------------------------------------------------------

let activeDrag: { files: string[]; sourceDir: string } | null = null;

/** MIME type used for the dataTransfer payload. */
export const DRAG_MIME = "application/x-flamingo-files";

// ---------------------------------------------------------------------------
// Drop-zone hook (handles counter + visual state)
// ---------------------------------------------------------------------------

function useDropZone(
  targetDir: string,
  onMove: FileTableProps["onMoveToDir"],
  isValid: () => boolean
) {
  const [over, setOver] = useState(false);
  const counter = useRef(0);

  const handlers = {
    onDragEnter(e: React.DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      counter.current += 1;
      if (counter.current === 1 && isValid()) {
        setOver(true);
      }
    },
    onDragLeave(e: React.DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      counter.current -= 1;
      if (counter.current === 0) {
        setOver(false);
      }
    },
    onDragOver(e: React.DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (isValid()) {
        e.dataTransfer.dropEffect = "move";
      }
    },
    onDrop(e: React.DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      counter.current = 0;
      setOver(false);
      if (activeDrag && isValid()) {
        onMove(activeDrag.files, activeDrag.sourceDir, targetDir);
      }
    },
  };

  return { over, handlers };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileTableProps {
  currentDir: string;
  files: FileEntry[];
  isAllSelected: boolean;
  onContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onMoveToDir: (
    fileNames: string[],
    sourceDir: string,
    targetDir: string
  ) => void;
  onNavigate: (dir: string) => void;
  onOpen: (name: string) => void;
  onSelectAll: () => void;
  onToggleSelect: (name: string) => void;
  parentDir: string | null;
  selection: Set<string>;
}

// ---------------------------------------------------------------------------
// Parent directory row  ("..")
// ---------------------------------------------------------------------------

function ParentDirRow({
  onMoveToDir,
  onNavigate,
  parentDir,
}: {
  onMoveToDir: FileTableProps["onMoveToDir"];
  onNavigate: (dir: string) => void;
  parentDir: string;
}) {
  const { over, handlers } = useDropZone(
    parentDir,
    onMoveToDir,
    () => activeDrag !== null
  );

  return (
    <TableRow
      className={over ? "bg-primary/5 ring-2 ring-primary ring-inset" : ""}
      {...handlers}
    >
      <TableCell />
      <TableCell
        className="flex cursor-pointer items-center gap-2"
        onClick={() => onNavigate(parentDir)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onNavigate(parentDir);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <FolderUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">..</span>
      </TableCell>
      <TableCell className="hidden sm:table-cell" />
      <TableCell className="hidden sm:table-cell" />
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// File row (draggable source + drop target for directories)
// ---------------------------------------------------------------------------

function FileTableRow({
  currentDir,
  file,
  isSelected,
  onContextMenu,
  onMoveToDir,
  onNavigate,
  onOpen,
  onToggleSelect,
  selection,
}: {
  currentDir: string;
  file: FileEntry;
  isSelected: boolean;
  onContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onMoveToDir: FileTableProps["onMoveToDir"];
  onNavigate: (dir: string) => void;
  onOpen: (name: string) => void;
  onToggleSelect: (name: string) => void;
  selection: Set<string>;
}) {
  const isClickable = file.directory || isTextFile(file.name);
  const targetDir = file.directory ? joinPath(currentDir, file.name) : "";

  const { over, handlers: dropHandlers } = useDropZone(
    targetDir,
    onMoveToDir,
    () =>
      file.directory && !!activeDrag && !activeDrag.files.includes(file.name)
  );

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

  const handleDragStart = (e: React.DragEvent) => {
    const files = selection.has(file.name) ? [...selection] : [file.name];
    activeDrag = { files, sourceDir: currentDir };
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(activeDrag));
    e.dataTransfer.effectAllowed = "move";
  };

  const dropClass = over ? "bg-primary/5 ring-2 ring-primary ring-inset" : "";

  return (
    <TableRow
      className={dropClass}
      data-state={isSelected ? "selected" : undefined}
      draggable
      onContextMenu={(e) => onContextMenu(e, file)}
      onDragEnd={() => {
        activeDrag = null;
      }}
      onDragStart={handleDragStart}
      {...dropHandlers}
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

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function FileTable({
  currentDir,
  files,
  isAllSelected,
  onContextMenu,
  onMoveToDir,
  onNavigate,
  onOpen,
  onSelectAll,
  onToggleSelect,
  parentDir,
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
        {parentDir !== null && (
          <ParentDirRow
            onMoveToDir={onMoveToDir}
            onNavigate={onNavigate}
            parentDir={parentDir}
          />
        )}
        {files.map((file) => (
          <FileTableRow
            currentDir={currentDir}
            file={file}
            isSelected={selection.has(file.name)}
            key={file.name}
            onContextMenu={onContextMenu}
            onMoveToDir={onMoveToDir}
            onNavigate={onNavigate}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
            selection={selection}
          />
        ))}
      </TableBody>
    </Table>
  );
}
