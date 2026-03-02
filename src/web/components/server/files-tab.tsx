import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { useMutation, useQuery } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import {
  CreateDirDialog,
  DeleteConfirmDialog,
  RenameDialog,
} from "@web/components/server/file-manager/file-dialogs";
import { FileTable } from "@web/components/server/file-manager/file-table";
import { FileToolbar } from "@web/components/server/file-manager/file-toolbar";
import { FileUpload } from "@web/components/server/file-manager/file-upload";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@web/components/ui/dropdown-menu";
import { Skeleton } from "@web/components/ui/skeleton";
import type { FileEntry } from "@web/hooks/use-file-manager";
import {
  isArchive,
  isTextFile,
  joinPath,
  useFileManager,
} from "@web/hooks/use-file-manager";
import { api } from "@web/lib/api";
import { flamingoDark } from "@web/lib/codemirror-theme";
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  File,
  FileEdit,
  FolderOpen,
  PackageOpen,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { DRAG_MIME } from "./file-manager/file-table";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLanguageExtension(filePath: string): Extension[] {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".json":
      return [json()];
    case ".js":
      return [javascript()];
    case ".ts":
      return [javascript({ typescript: true })];
    case ".py":
      return [python()];
    case ".java":
      return [java()];
    case ".xml":
      return [xml()];
    case ".yml":
    case ".yaml":
      return [yaml()];
    case ".md":
      return [markdown()];
    case ".css":
      return [css()];
    case ".html":
      return [html()];
    case ".sql":
      return [sql()];
    default:
      return [];
  }
}

const PARENT_DIR_RE = /\/[^/]+\/?$/;
const MAC_RE = /Mac|iPod|iPhone|iPad/;

/** Build clickable breadcrumb segments from a path like "/plugins/config". */
function buildBreadcrumbs(path: string): { label: string; path: string }[] {
  if (path === "/") {
    return [];
  }
  const parts = path.split("/").filter(Boolean);
  return parts.map((part, i) => ({
    label: part,
    path: `/${parts.slice(0, i + 1).join("/")}`,
  }));
}

// ---------------------------------------------------------------------------
// Context menu state type
// ---------------------------------------------------------------------------

interface ContextMenuState {
  file: FileEntry;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// File editor sub-component (extracted to keep complexity low)
// ---------------------------------------------------------------------------

function FileEditor({
  editingFile,
  fileContent,
  isMac,
  loadingFile,
  onClose,
  onContentChange,
  onSave,
  originalContent,
  savePending,
  onSaveClick,
}: {
  editingFile: string;
  fileContent: string;
  isMac: boolean;
  loadingFile: boolean;
  onClose: () => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
  originalContent: string;
  savePending: boolean;
  onSaveClick: () => void;
}) {
  const saveShortcut = isMac ? "\u2318S" : "Ctrl+S";
  const fileName = editingFile.split("/").pop() || editingFile;
  const isModified = fileContent !== originalContent;

  // biome-ignore lint/suspicious/noEmptyBlockStatements: initial no-op ref; overwritten immediately below
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = onSave;

  const saveKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            saveRef.current();
            return true;
          },
        },
      ]),
    []
  );

  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              aria-label="Close editor"
              onClick={onClose}
              size="sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
            <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="truncate text-base">{fileName}</CardTitle>
            {isModified && (
              <Badge className="shrink-0 text-xs" variant="default">
                Modified
              </Badge>
            )}
            {saveStatus === "saved" && (
              <Badge className="shrink-0 text-xs" variant="secondary">
                Saved
              </Badge>
            )}
            {saveStatus === "error" && (
              <Badge className="shrink-0 text-xs" variant="destructive">
                Save failed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-muted-foreground text-xs sm:inline">
              {saveShortcut}
            </span>
            <Button
              disabled={savePending || !isModified}
              onClick={onSaveClick}
              size="sm"
            >
              <Save className="mr-1.5 h-4 w-4" />
              {savePending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <p className="font-mono text-muted-foreground text-xs">{editingFile}</p>
      </CardHeader>
      <CardContent>
        {loadingFile ? (
          <Skeleton className="h-96" />
        ) : (
          <CodeMirror
            aria-label={`Editing ${fileName}`}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              bracketMatching: true,
              autocompletion: false,
            }}
            className="overflow-hidden rounded-lg border border-border/50"
            extensions={[saveKeymap, ...getLanguageExtension(editingFile)]}
            height="28rem"
            onChange={(value) => {
              onContentChange(value);
              setSaveStatus("");
            }}
            theme={flamingoDark}
            value={fileContent}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inline context menu (DropdownMenu positioned at mouse coordinates)
// ---------------------------------------------------------------------------

function FileRightClickMenu({
  contextMenu,
  currentDir,
  fm,
  onClose,
  onNavigate,
  onOpen,
  serverId,
  setDeleteTargets,
  setRenameTarget,
}: {
  contextMenu: ContextMenuState;
  currentDir: string;
  fm: ReturnType<typeof useFileManager>;
  onClose: () => void;
  onNavigate: (dir: string) => void;
  onOpen: (name: string) => void;
  serverId: string;
  setDeleteTargets: (targets: string[]) => void;
  setRenameTarget: (file: FileEntry | null) => void;
}) {
  const { file } = contextMenu;
  const showDownload = !file.directory;
  const showDecompress = !file.directory && isArchive(file.name);

  const handleOpen = () => {
    if (file.directory) {
      onNavigate(joinPath(currentDir, file.name));
    } else if (isTextFile(file.name)) {
      onOpen(file.name);
    }
    onClose();
  };

  const handleDownload = () => {
    const filePath = joinPath(currentDir, file.name);
    window.open(
      `/api/servers/${serverId}/files/download?file=${encodeURIComponent(filePath)}`,
      "_blank"
    );
    onClose();
  };

  return (
    <DropdownMenu onOpenChange={(open) => !open && onClose()} open>
      <DropdownMenuContent
        align="start"
        className="min-w-[180px]"
        style={{
          position: "fixed",
          left: contextMenu.x,
          top: contextMenu.y,
        }}
      >
        <DropdownMenuItem onSelect={handleOpen}>
          {file.directory ? (
            <FolderOpen className="size-4" />
          ) : (
            <FileEdit className="size-4" />
          )}
          Open
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setRenameTarget(file);
            onClose();
          }}
        >
          <Pencil className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            fm.copyMutation.mutate({
              location: joinPath(currentDir, file.name),
            });
            onClose();
          }}
        >
          <Copy className="size-4" />
          Copy
        </DropdownMenuItem>
        {showDownload && (
          <DropdownMenuItem onSelect={handleDownload}>
            <Download className="size-4" />
            Download
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            fm.compressMutation.mutate({
              root: currentDir,
              files: [file.name],
            });
            onClose();
          }}
        >
          <Archive className="size-4" />
          Compress
        </DropdownMenuItem>
        {showDecompress && (
          <DropdownMenuItem
            onSelect={() => {
              fm.decompressMutation.mutate({
                root: currentDir,
                file: file.name,
              });
              onClose();
            }}
          >
            <PackageOpen className="size-4" />
            Decompress
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setDeleteTargets([file.name]);
            onClose();
          }}
          variant="destructive"
        >
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FilesTab({ serverId }: { serverId: string }) {
  const [currentDir, setCurrentDir] = useState("/");
  const fm = useFileManager(serverId);

  const { data: files, isLoading } = useQuery({
    queryKey: ["server-files", serverId, currentDir],
    queryFn: () =>
      api.get<FileEntry[]>(
        `/servers/${serverId}/files/list?directory=${encodeURIComponent(currentDir)}`
      ),
  });

  // Editor state
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);

  // Dialog state
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [showCreateDir, setShowCreateDir] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Upload ref
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({
      file,
      content,
    }: {
      file: string;
      content: string;
    }) => {
      const res = await fetch(
        `/api/servers/${serverId}/files/write?file=${encodeURIComponent(file)}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          credentials: "include",
          body: content,
        }
      );
      if (!res.ok) {
        throw new Error("Failed to save");
      }
    },
    onSuccess: () => {
      setOriginalContent(fileContent);
      fm.invalidate();
    },
  });

  const navigateDir = useCallback(
    (dir: string) => {
      setCurrentDir(dir);
      setEditingFile(null);
      fm.clearSelection();
    },
    [fm.clearSelection]
  );

  const handleMoveToDir = useCallback(
    (fileNames: string[], sourceDir: string, targetDir: string) => {
      if (sourceDir === targetDir) {
        return;
      }
      fm.renameMutation.mutate({
        root: "/",
        files: fileNames.map((name) => ({
          from: joinPath(sourceDir, name).substring(1),
          to: joinPath(targetDir, name).substring(1),
        })),
      });
    },
    [fm.renameMutation]
  );

  // Breadcrumb drop-zone state
  const [dragOverCrumb, setDragOverCrumb] = useState<string | null>(null);
  const crumbCounters = useRef<Record<string, number>>({});

  const openFile = useCallback(
    async (fileName: string) => {
      const filePath = joinPath(currentDir, fileName);
      setLoadingFile(true);
      try {
        const res = await fetch(
          `/api/servers/${serverId}/files/contents?file=${encodeURIComponent(filePath)}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          throw new Error("Failed to load file");
        }
        const text = await res.text();
        setFileContent(text);
        setOriginalContent(text);
        setEditingFile(filePath);
      } catch {
        // biome-ignore lint/suspicious/noAlert: temporary until proper toast/dialog is implemented
        alert("Failed to open file");
      } finally {
        setLoadingFile(false);
      }
    },
    [currentDir, serverId]
  );

  const closeEditor = () => {
    if (
      fileContent !== originalContent &&
      // biome-ignore lint/suspicious/noAlert: temporary until proper toast/dialog is implemented
      !confirm("You have unsaved changes. Close anyway?")
    ) {
      return;
    }
    setEditingFile(null);
  };

  const breadcrumbs = buildBreadcrumbs(currentDir);
  const isMac =
    typeof navigator !== "undefined" && MAC_RE.test(navigator.userAgent);

  // ── File editor view ──────────────────────────────────────────────
  if (editingFile) {
    return (
      <FileEditor
        editingFile={editingFile}
        fileContent={fileContent}
        isMac={isMac}
        loadingFile={loadingFile}
        onClose={closeEditor}
        onContentChange={setFileContent}
        onSave={() => {
          if (editingFile && fileContent !== originalContent) {
            saveMutation.mutate({ file: editingFile, content: fileContent });
          }
        }}
        onSaveClick={() =>
          saveMutation.mutate({ file: editingFile, content: fileContent })
        }
        originalContent={originalContent}
        savePending={saveMutation.isPending}
      />
    );
  }

  // ── File browser view ─────────────────────────────────────────────
  const fileNames = files?.map((f) => f.name) ?? [];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Files</CardTitle>
            <FileToolbar
              isCompressing={fm.compressMutation.isPending}
              isDeleting={fm.deleteMutation.isPending}
              onCompress={() =>
                fm.compressMutation.mutate({
                  root: currentDir,
                  files: [...fm.selection],
                })
              }
              onCreateDir={() => setShowCreateDir(true)}
              onDelete={() => setDeleteTargets([...fm.selection])}
              onUploadClick={() => uploadRef.current?.click()}
              selectionCount={fm.selection.size}
            />
          </div>

          {/* Breadcrumb navigation */}
          <nav
            aria-label="File path"
            className="flex items-center gap-1 text-sm"
          >
            {currentDir !== "/" && (
              <Button
                aria-label="Navigate to parent directory"
                className="mr-1 h-7 w-7"
                onClick={() => {
                  const parent = currentDir.replace(PARENT_DIR_RE, "") || "/";
                  navigateDir(parent);
                }}
                size="icon"
                variant="ghost"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <button
              className={`rounded px-1 font-mono text-muted-foreground text-xs transition-colors hover:text-foreground ${dragOverCrumb === "/" ? "bg-primary/10 text-primary ring-2 ring-primary" : ""}`}
              onClick={() => navigateDir("/")}
              onDragEnter={(e) => {
                e.preventDefault();
                crumbCounters.current["/"] =
                  (crumbCounters.current["/"] ?? 0) + 1;
                if (crumbCounters.current["/"] === 1) {
                  setDragOverCrumb("/");
                }
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                crumbCounters.current["/"] =
                  (crumbCounters.current["/"] ?? 1) - 1;
                if (crumbCounters.current["/"] === 0) {
                  setDragOverCrumb(null);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                crumbCounters.current["/"] = 0;
                setDragOverCrumb(null);
                const raw = e.dataTransfer.getData(DRAG_MIME);
                if (raw) {
                  const data = JSON.parse(raw);
                  handleMoveToDir(data.files, data.sourceDir, "/");
                }
              }}
              type="button"
            >
              /
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span className="flex items-center gap-1" key={crumb.path}>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                {i === breadcrumbs.length - 1 ? (
                  <span className="font-mono text-foreground text-xs">
                    {crumb.label}
                  </span>
                ) : (
                  <button
                    className={`rounded px-1 font-mono text-muted-foreground text-xs transition-colors hover:text-foreground ${dragOverCrumb === crumb.path ? "bg-primary/10 text-primary ring-2 ring-primary" : ""}`}
                    onClick={() => navigateDir(crumb.path)}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      crumbCounters.current[crumb.path] =
                        (crumbCounters.current[crumb.path] ?? 0) + 1;
                      if (crumbCounters.current[crumb.path] === 1) {
                        setDragOverCrumb(crumb.path);
                      }
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      crumbCounters.current[crumb.path] =
                        (crumbCounters.current[crumb.path] ?? 1) - 1;
                      if (crumbCounters.current[crumb.path] === 0) {
                        setDragOverCrumb(null);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      crumbCounters.current[crumb.path] = 0;
                      setDragOverCrumb(null);
                      const raw = e.dataTransfer.getData(DRAG_MIME);
                      if (raw) {
                        const data = JSON.parse(raw);
                        handleMoveToDir(data.files, data.sourceDir, crumb.path);
                      }
                    }}
                    type="button"
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          <FileUpload
            currentDir={currentDir}
            onUploadComplete={fm.invalidate}
            serverId={serverId}
            uploadRef={uploadRef}
          >
            {isLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton className="h-10" key={i} />
                ))}
              </div>
            )}
            {!isLoading && files?.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <FolderOpen className="h-10 w-10" />
                <p className="text-sm">This directory is empty</p>
              </div>
            )}
            {!isLoading && files && files.length > 0 && (
              <FileTable
                currentDir={currentDir}
                files={files}
                isAllSelected={fm.isAllSelected(fileNames)}
                onContextMenu={(e, file) => {
                  e.preventDefault();
                  setContextMenu({ file, x: e.clientX, y: e.clientY });
                }}
                onMoveToDir={handleMoveToDir}
                onNavigate={navigateDir}
                onOpen={openFile}
                onSelectAll={() => {
                  if (fm.isAllSelected(fileNames)) {
                    fm.clearSelection();
                  } else {
                    fm.selectAll(fileNames);
                  }
                }}
                onToggleSelect={fm.toggleSelect}
                parentDir={
                  currentDir !== "/"
                    ? currentDir.replace(PARENT_DIR_RE, "") || "/"
                    : null
                }
                selection={fm.selection}
              />
            )}
          </FileUpload>
        </CardContent>
      </Card>

      {/* Context menu positioned at mouse coordinates */}
      {contextMenu && (
        <FileRightClickMenu
          contextMenu={contextMenu}
          currentDir={currentDir}
          fm={fm}
          onClose={() => setContextMenu(null)}
          onNavigate={navigateDir}
          onOpen={openFile}
          serverId={serverId}
          setDeleteTargets={setDeleteTargets}
          setRenameTarget={setRenameTarget}
        />
      )}

      {/* Dialogs */}
      <RenameDialog
        currentName={renameTarget?.name ?? ""}
        isPending={fm.renameMutation.isPending}
        onClose={() => setRenameTarget(null)}
        onRename={(newName) => {
          if (renameTarget) {
            fm.renameMutation.mutate(
              {
                root: currentDir,
                files: [{ from: renameTarget.name, to: newName }],
              },
              { onSuccess: () => setRenameTarget(null) }
            );
          }
        }}
        open={renameTarget !== null}
      />

      <CreateDirDialog
        isPending={fm.createDirMutation.isPending}
        onClose={() => setShowCreateDir(false)}
        onCreate={(dirName) => {
          fm.createDirMutation.mutate(
            { name: dirName, path: currentDir },
            { onSuccess: () => setShowCreateDir(false) }
          );
        }}
        open={showCreateDir}
      />

      <DeleteConfirmDialog
        fileNames={deleteTargets}
        isPending={fm.deleteMutation.isPending}
        onClose={() => setDeleteTargets([])}
        onConfirm={() => {
          fm.deleteMutation.mutate(
            { root: currentDir, files: deleteTargets },
            { onSuccess: () => setDeleteTargets([]) }
          );
        }}
        open={deleteTargets.length > 0}
      />
    </>
  );
}
