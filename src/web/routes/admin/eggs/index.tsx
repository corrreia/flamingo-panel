import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CodeEditor } from "@web/components/code-editor";
import { EmptyState } from "@web/components/empty-state";
import { Layout } from "@web/components/layout";
import { PageHeader } from "@web/components/page-header";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@web/components/ui/alert-dialog";
import { Button } from "@web/components/ui/button";
import { Card } from "@web/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
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
import { Download, Egg, Plus, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────

interface EggItem {
  createdAt: string;
  description: string | null;
  dockerImage: string;
  id: string;
  name: string;
  startup: string;
  tags: string | null;
  variableCount?: number;
}

// ── Route ───────────────────────────────────────────────────────────

export const Route = createFileRoute("/admin/eggs/")({
  component: EggsPage,
});

// ── Page ────────────────────────────────────────────────────────────

function EggsPage() {
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState("");
  const [importJson, setImportJson] = useState("");
  const [search, setSearch] = useState("");

  const { data: eggs, isLoading } = useQuery({
    queryKey: ["eggs"],
    queryFn: () => api.get<EggItem[]>("/eggs"),
  });

  const filtered = useMemo(() => {
    if (!eggs) {
      return [];
    }
    if (!search.trim()) {
      return eggs;
    }
    const q = search.toLowerCase();
    return eggs.filter((egg) => {
      const tags = parseTags(egg.tags);
      return (
        egg.name.toLowerCase().includes(q) ||
        (egg.description?.toLowerCase().includes(q) ?? false) ||
        egg.dockerImage.toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [eggs, search]);

  const importMutation = useMutation({
    mutationFn: (json: string) => {
      const parsed = JSON.parse(json);
      return api.post("/eggs/import", parsed);
    },
    onSuccess: () => {
      setImportOpen(false);
      setImportJson("");
      queryClient.invalidateQueries({ queryKey: ["eggs"] });
    },
    onError: (err: Error) =>
      setError(
        err.message === "Unexpected token" ? "Invalid JSON" : err.message
      ),
  });

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    importMutation.mutate(importJson);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setImportJson(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleExport = async (eggId: string, eggName: string) => {
    const data = await api.get(`/eggs/${eggId}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `egg-${eggName.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          actions={
            <>
              <Dialog onOpenChange={setImportOpen} open={importOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary">
                    <Upload className="mr-2 h-4 w-4" /> Import Egg
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Import Egg</DialogTitle>
                    <DialogDescription>
                      Supports Pelican (PLCN v1-v3) and Pterodactyl (PTDL v1-v2)
                      egg formats. Paste JSON or upload a file.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="min-w-0 space-y-4" onSubmit={handleImport}>
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="egg-file">Upload JSON file</Label>
                      <Input
                        accept=".json"
                        id="egg-file"
                        onChange={handleFileUpload}
                        type="file"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="egg-json">Or paste JSON</Label>
                      <CodeEditor
                        className="h-64"
                        language="json"
                        onChange={setImportJson}
                        placeholder='{"name": "Minecraft", ...}'
                        value={importJson}
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        disabled={
                          importMutation.isPending || !importJson.trim()
                        }
                        type="submit"
                      >
                        {importMutation.isPending
                          ? "Importing..."
                          : "Import Egg"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <Button asChild>
                <Link to="/admin/eggs/create">
                  <Plus className="mr-2 h-4 w-4" /> Create Egg
                </Link>
              </Button>
            </>
          }
          backTo="/"
          title="Eggs"
        />

        {/* Search */}
        {eggs && eggs.length > 0 && (
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search eggs..."
              value={search}
            />
          </div>
        )}

        {/* Table */}
        <EggsList
          eggs={filtered}
          isLoading={isLoading}
          onDelete={() => {
            queryClient.invalidateQueries({ queryKey: ["eggs"] });
          }}
          onExport={handleExport}
          search={search}
        />
      </div>
    </Layout>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseTags(raw: string | null): string[] {
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

// ── Eggs List ───────────────────────────────────────────────────────

function EggsList({
  eggs,
  isLoading,
  onExport,
  onDelete,
  search,
}: {
  eggs: EggItem[];
  isLoading: boolean;
  onExport: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  search: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton className="h-16" key={i} />
        ))}
      </div>
    );
  }

  if (eggs.length === 0 && !search) {
    return (
      <EmptyState
        description="Import a Pelican egg or create one manually."
        icon={Egg}
        title="No eggs configured yet."
      />
    );
  }

  if (eggs.length === 0 && search) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        No eggs match "{search}".
      </p>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Docker Image</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {eggs.map((egg) => (
            <EggRow
              egg={egg}
              key={egg.id}
              onDelete={onDelete}
              onExport={onExport}
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ── Egg Row ─────────────────────────────────────────────────────────

function EggRow({
  egg,
  onExport,
  onDelete,
}: {
  egg: EggItem;
  onExport: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/eggs/${egg.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eggs"] });
      onDelete(egg.id);
    },
  });

  return (
    <TableRow>
      <TableCell className="max-w-[200px] sm:max-w-[300px]">
        <div className="min-w-0">
          <Link
            className="font-medium hover:underline"
            params={{ eggId: egg.id }}
            to="/admin/eggs/$eggId"
          >
            {egg.name}
          </Link>
          {egg.description && (
            <p className="truncate text-muted-foreground text-xs">
              {egg.description}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="font-mono text-muted-foreground text-xs">
          {egg.dockerImage.split("/").pop() || egg.dockerImage}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            onClick={() => onExport(egg.id, egg.name)}
            size="sm"
            variant="ghost"
          >
            <Download className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="text-destructive hover:text-destructive"
                size="sm"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete egg "{egg.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this egg and all its variables.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete Egg"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
