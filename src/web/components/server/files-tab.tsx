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
import { ArrowLeft, ChevronRight, File, Folder, Save, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

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

  const navigateUp = () => {
    const parent = currentDir.replace(PARENT_DIR_RE, "") || "/";
    setCurrentDir(parent);
    setEditingFile(null);
  };

  const navigateDir = (dir: string) => {
    setCurrentDir(dir);
    setEditingFile(null);
  };

  const openFile = async (fileName: string) => {
    const filePath =
      currentDir === "/" ? `/${fileName}` : `${currentDir}/${fileName}`;
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

  if (editingFile) {
    const fileName = editingFile.split("/").pop() || editingFile;
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={closeEditor} size="sm" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
              <File className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{fileName}</CardTitle>
              <Badge className="font-mono text-xs" variant="secondary">
                {editingFile}
              </Badge>
              {fileContent !== originalContent && (
                <Badge className="text-xs" variant="default">
                  Modified
                </Badge>
              )}
              {saveStatus === "saved" && (
                <Badge className="text-xs" variant="secondary">
                  Saved
                </Badge>
              )}
              {saveStatus === "error" && (
                <Badge className="text-xs" variant="destructive">
                  Save failed
                </Badge>
              )}
            </div>
            <Button
              disabled={
                saveMutation.isPending || fileContent === originalContent
              }
              onClick={() =>
                saveMutation.mutate({ file: editingFile, content: fileContent })
              }
              size="sm"
            >
              <Save className="mr-1 h-4 w-4" />{" "}
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFile ? (
            <Skeleton className="h-80" />
          ) : (
            <CodeMirror
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                bracketMatching: true,
                autocompletion: false,
              }}
              className="overflow-hidden rounded-md border"
              extensions={[saveKeymap, ...getLanguageExtension(editingFile)]}
              height="384px"
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Files</CardTitle>
          <Badge className="font-mono text-xs" variant="secondary">
            {currentDir}
          </Badge>
          {currentDir !== "/" && (
            <Button onClick={navigateUp} size="sm" variant="ghost">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton className="h-10" key={i} />
            ))}
          </div>
        ) : (
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
              {files?.map((f) => (
                <TableRow
                  className={
                    f.directory || isTextFile(f.name)
                      ? "cursor-pointer hover:bg-accent"
                      : ""
                  }
                  key={f.name}
                  onClick={() => {
                    if (f.directory) {
                      navigateDir(
                        currentDir === "/"
                          ? `/${f.name}`
                          : `${currentDir}/${f.name}`
                      );
                    } else if (isTextFile(f.name)) {
                      openFile(f.name);
                    }
                  }}
                >
                  <TableCell className="flex items-center gap-2">
                    {f.directory ? (
                      <Folder className="h-4 w-4 text-primary" />
                    ) : (
                      <File className="h-4 w-4 text-muted-foreground" />
                    )}
                    {f.name}
                    {f.directory && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                    {f.directory ? "-" : formatBytes(f.size)}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground text-xs sm:table-cell">
                    {new Date(f.modified).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {files?.length === 0 && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={3}
                  >
                    Empty directory
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
