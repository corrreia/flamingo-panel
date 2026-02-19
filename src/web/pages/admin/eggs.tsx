import { useEffect, useState } from "react";
import { api } from "@web/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Textarea } from "@web/components/ui/textarea";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@web/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@web/components/ui/table";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import { Egg, Plus, Upload, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";

interface EggItem {
  id: string;
  name: string;
  description: string | null;
  dockerImage: string;
  startup: string;
  createdAt: string;
}

interface EggVariable {
  id: string;
  name: string;
  description: string | null;
  envVariable: string;
  defaultValue: string | null;
  userViewable: number;
  userEditable: number;
  rules: string;
}

interface EggDetail extends EggItem {
  variables: EggVariable[];
}

export function EggsPage() {
  const [eggs, setEggs] = useState<EggItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dockerImage, setDockerImage] = useState("");
  const [startup, setStartup] = useState("");
  const [stopCommand, setStopCommand] = useState("stop");

  // Import form
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<EggItem[]>("/eggs").then(setEggs).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      await api.post("/eggs", { name, description, dockerImage, startup, stopCommand });
      setCreateOpen(false);
      setName(""); setDescription(""); setDockerImage(""); setStartup(""); setStopCommand("stop");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setImporting(true);
    try {
      const parsed = JSON.parse(importJson);
      await api.post("/eggs/import", parsed);
      setImportOpen(false);
      setImportJson("");
      load();
    } catch (err: any) {
      setError(err.message === "Unexpected token" ? "Invalid JSON" : err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportJson(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <a href="/"><ArrowLeft className="h-4 w-4" /></a>
          </Button>
          <h1 className="text-2xl font-bold">Eggs</h1>
        </div>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary"><Upload className="h-4 w-4 mr-2" /> Import Egg</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Pelican Egg</DialogTitle>
                <DialogDescription>
                  Paste the JSON contents of a Pelican/Pterodactyl egg file, or upload the .json file.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleImport} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="egg-file">Upload JSON file</Label>
                  <Input id="egg-file" type="file" accept=".json" onChange={handleFileUpload} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="egg-json">Or paste JSON</Label>
                  <Textarea
                    id="egg-json"
                    value={importJson}
                    onChange={(e) => setImportJson(e.target.value)}
                    placeholder='{"name": "Minecraft", "docker_images": {...}, ...}'
                    className="font-mono text-xs h-64"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={importing || !importJson.trim()}>
                    {importing ? "Importing..." : "Import Egg"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Create Egg</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Egg</DialogTitle>
                <DialogDescription>
                  Define a new game server egg configuration.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="egg-name">Name</Label>
                  <Input id="egg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Minecraft Java" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="egg-desc">Description</Label>
                  <Input id="egg-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Vanilla Minecraft server" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="egg-image">Docker Image</Label>
                  <Input id="egg-image" value={dockerImage} onChange={(e) => setDockerImage(e.target.value)} placeholder="ghcr.io/pelican-eggs/games/minecraft:java" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="egg-startup">Startup Command</Label>
                  <Input id="egg-startup" value={startup} onChange={(e) => setStartup(e.target.value)} placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar" required className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="egg-stop">Stop Command</Label>
                  <Input id="egg-stop" value={stopCommand} onChange={(e) => setStopCommand(e.target.value)} placeholder="stop" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating..." : "Create Egg"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : eggs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Egg className="h-12 w-12 mb-4 text-primary/30" />
            <p>No eggs configured yet.</p>
            <p className="text-sm">Import a Pelican egg or create one manually.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {eggs.map((egg) => (
            <EggRow key={egg.id} egg={egg} />
          ))}
        </div>
      )}
    </div>
  );
}

function EggRow({ egg }: { egg: EggItem }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EggDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    if (!expanded && !detail) {
      setLoading(true);
      api.get<EggDetail>(`/eggs/${egg.id}`)
        .then(setDetail)
        .finally(() => setLoading(false));
    }
    setExpanded(!expanded);
  };

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={toggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Egg className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{egg.name}</CardTitle>
            {egg.description && (
              <span className="text-sm text-muted-foreground">{egg.description}</span>
            )}
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {egg.dockerImage.split("/").pop() || egg.dockerImage}
          </Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {loading ? (
            <Skeleton className="h-20" />
          ) : detail ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Docker Image</div>
                <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{detail.dockerImage}</code>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Startup Command</div>
                <code className="text-sm font-mono bg-muted px-2 py-1 rounded block whitespace-pre-wrap">{detail.startup}</code>
              </div>
              {detail.variables.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Variables ({detail.variables.length})</div>
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
                          <TableCell className="font-mono text-xs">{v.envVariable}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{v.defaultValue || "-"}</TableCell>
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
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
