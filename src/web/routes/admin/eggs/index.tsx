import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
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
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
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
import { Textarea } from "@web/components/ui/textarea";
import { api } from "@web/lib/api";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Egg,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";

interface EggItem {
  createdAt: string;
  description: string | null;
  dockerImage: string;
  id: string;
  name: string;
  startup: string;
  tags: string | null;
}

interface EggVariable {
  defaultValue: string | null;
  description: string | null;
  envVariable: string;
  id: string;
  name: string;
  rules: string;
  userEditable: number;
  userViewable: number;
}

interface EggDetail extends EggItem {
  variables: EggVariable[];
}

function renderEggsList(eggs: EggItem[] | undefined, isLoading: boolean) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton className="h-16" key={i} />
        ))}
      </div>
    );
  }

  if (eggs?.length) {
    return (
      <div className="space-y-3">
        {eggs.map((egg) => (
          <EggRow egg={egg} key={egg.id} />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Egg className="mb-4 h-12 w-12 text-primary/30" />
        <p>No eggs configured yet.</p>
        <p className="text-sm">Import a Pelican egg or create one manually.</p>
      </CardContent>
    </Card>
  );
}

function renderEggDetail(detail: EggDetail | undefined, isLoading: boolean) {
  if (isLoading) {
    return <Skeleton className="h-20" />;
  }

  if (!detail) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-muted-foreground text-xs">Docker Image</div>
        <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
          {detail.dockerImage}
        </code>
      </div>
      <div>
        <div className="mb-1 text-muted-foreground text-xs">
          Startup Command
        </div>
        <code className="block whitespace-pre-wrap rounded bg-muted px-2 py-1 font-mono text-sm">
          {detail.startup}
        </code>
      </div>
      {detail.variables.length > 0 && (
        <div>
          <div className="mb-2 text-muted-foreground text-xs">
            Variables ({detail.variables.length})
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Env Variable</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="w-20">Editable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.variables.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {v.envVariable}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {v.defaultValue || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={v.userEditable ? "default" : "secondary"}>
                      {v.userEditable ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/eggs/")({
  component: EggsPage,
});

function EggsPage() {
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState("");
  const [importJson, setImportJson] = useState("");

  const { data: eggs, isLoading } = useQuery({
    queryKey: ["eggs"],
    queryFn: () => api.get<EggItem[]>("/eggs"),
  });

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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="font-bold text-2xl">Eggs</h1>
          </div>
          <div className="flex gap-2">
            <Dialog onOpenChange={setImportOpen} open={importOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">
                  <Upload className="mr-2 h-4 w-4" /> Import Egg
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Import Egg</DialogTitle>
                  <DialogDescription>
                    Supports Pelican (PLCN v1-v3) and Pterodactyl (PTDL v1-v2)
                    egg formats. Paste JSON or upload a file.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleImport}>
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
                    <Textarea
                      className="h-64 font-mono text-xs"
                      id="egg-json"
                      onChange={(e) => setImportJson(e.target.value)}
                      placeholder='{"name": "Minecraft", ...}'
                      value={importJson}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      disabled={importMutation.isPending || !importJson.trim()}
                      type="submit"
                    >
                      {importMutation.isPending ? "Importing..." : "Import Egg"}
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
          </div>
        </div>

        {renderEggsList(eggs, isLoading)}
      </div>
    </Layout>
  );
}

function EggRow({ egg }: { egg: EggItem }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const tags = (() => {
    try {
      return JSON.parse(egg.tags || "[]");
    } catch {
      return [];
    }
  })();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/eggs/${egg.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["eggs"] }),
  });

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

  const { data: detail, isLoading } = useQuery({
    queryKey: ["egg", egg.id],
    queryFn: () => api.get<EggDetail>(`/eggs/${egg.id}`),
    enabled: expanded,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-3 border-none bg-transparent p-0"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Egg className="h-4 w-4 text-primary" />
            <Link
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
              params={{ eggId: egg.id }}
              to="/admin/eggs/$eggId"
            >
              <CardTitle className="text-base">{egg.name}</CardTitle>
            </Link>
            {egg.description && (
              <span className="text-muted-foreground text-sm">
                {egg.description}
              </span>
            )}
            {tags.length > 0 &&
              tags.map((tag: string) => (
                <Badge className="text-xs" key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
          </button>
          <div className="flex items-center gap-2">
            <Badge className="font-mono text-xs" variant="secondary">
              {egg.dockerImage.split("/").pop() || egg.dockerImage}
            </Badge>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleExport(egg.id, egg.name);
              }}
              size="sm"
              variant="ghost"
            >
              <Download className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
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
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>{renderEggDetail(detail, isLoading)}</CardContent>
      )}
    </Card>
  );
}
