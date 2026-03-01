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
import { keymap } from "@codemirror/view";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import { api } from "@web/lib/api";
import { flamingoDark } from "@web/lib/codemirror-theme";
import { formatBytes } from "@web/lib/format";
import {
  ArrowLeft,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Save,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

interface FileEntry {
  directory: boolean;
  mime: string;
  modified: string;
  name: string;
  size: number;
}

const PARENT_DIR_RE = /\/[^/]+\/?$/;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".log",
  ".cfg",
  ".conf",
  ".ini",
  ".yml",
  ".yaml",
  ".json",
  ".xml",
  ".properties",
  ".toml",
  ".env",
  ".sh",
  ".bash",
  ".bat",
  ".cmd",
  ".ps1",
  ".py",
  ".js",
  ".ts",
  ".lua",
  ".java",
  ".md",
  ".csv",
]);

function isTextFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

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

const MAC_RE = /Mac|iPod|iPhone|iPad/;

function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

function getAriaLabel(f: FileEntry): string {
  if (f.directory) {
    return `Open folder ${f.name}`;
  }
  if (isTextFile(f.name)) {
    return `Edit file ${f.name}`;
  }
  return f.name;
}

function FileRow({
  currentDir,
  file,
  onNavigate,
  onOpen,
}: {
  currentDir: string;
  file: FileEntry;
  onNavigate: (dir: string) => void;
  onOpen: (name: string) => void;
}) {
  const isClickable = file.directory || isTextFile(file.name);
  const handleActivate = () => {
    if (file.directory) {
      onNavigate(joinPath(currentDir, file.name));
    } else if (isTextFile(file.name)) {
      onOpen(file.name);
    }
  };

  return (
    <TableRow
      aria-label={getAriaLabel(file)}
      className={isClickable ? "cursor-pointer hover:bg-accent" : ""}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleActivate();
        }
      }}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <TableCell className="flex items-center gap-2">
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

export function FilesTab({ serverId }: { serverId: string }) {
  const [currentDir, setCurrentDir] = useState("/");
  const queryClient = useQueryClient();

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
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");

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
          headers: {
            "Content-Type": "text/plain",
          },
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
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["server-files", serverId] });
    },
    onError: () => setSaveStatus("error"),
  });

  // biome-ignore lint/suspicious/noEmptyBlockStatements: initial no-op ref; overwritten immediately below
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    if (editingFile && fileContent !== originalContent) {
      saveMutation.mutate({ file: editingFile, content: fileContent });
    }
  };

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

  const navigateDir = useCallback((dir: string) => {
    setCurrentDir(dir);
    setEditingFile(null);
  }, []);

  const openFile = async (fileName: string) => {
    const filePath = joinPath(currentDir, fileName);
    setLoadingFile(true);
    setSaveStatus("");
    try {
      const res = await fetch(
        `/api/servers/${serverId}/files/contents?file=${encodeURIComponent(filePath)}`,
        {
          credentials: "include",
        }
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
  };

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
  const saveShortcut = isMac ? "\u2318S" : "Ctrl+S";

  // ── File editor view ──────────────────────────────────────────────
  if (editingFile) {
    const fileName = editingFile.split("/").pop() || editingFile;
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                aria-label="Close editor"
                onClick={closeEditor}
                size="sm"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="truncate text-base">{fileName}</CardTitle>
              {fileContent !== originalContent && (
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
                disabled={
                  saveMutation.isPending || fileContent === originalContent
                }
                onClick={() =>
                  saveMutation.mutate({
                    file: editingFile,
                    content: fileContent,
                  })
                }
                size="sm"
              >
                <Save className="mr-1.5 h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
          <p className="font-mono text-muted-foreground text-xs">
            {editingFile}
          </p>
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
                setFileContent(value);
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

  // ── File browser view ─────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-base">Files</CardTitle>
          </div>
          <p className="hidden text-muted-foreground text-xs sm:block">
            Click a file to edit
          </p>
        </div>
        {/* Breadcrumb navigation */}
        <nav aria-label="File path" className="flex items-center gap-1 text-sm">
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
            className="font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
            onClick={() => navigateDir("/")}
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
                  className="font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
                  onClick={() => navigateDir(crumb.path)}
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
          <Table>
            <TableHeader>
              <TableRow>
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
              {files.map((f) => (
                <FileRow
                  currentDir={currentDir}
                  file={f}
                  key={f.name}
                  onNavigate={navigateDir}
                  onOpen={openFile}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
