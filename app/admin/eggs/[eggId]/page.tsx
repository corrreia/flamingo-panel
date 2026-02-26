"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CodeEditor } from "@web/components/code-editor";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Skeleton } from "@web/components/ui/skeleton";
import { Switch } from "@web/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@web/components/ui/tabs";
import { Textarea } from "@web/components/ui/textarea";
import { api } from "@web/lib/api";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────

interface EggVariable {
  defaultValue: string | null;
  description: string | null;
  eggId: string;
  envVariable: string;
  id: string;
  name: string;
  rules: string;
  sortOrder: number;
  userEditable: number;
  userViewable: number;
}

interface EggDetail {
  author: string | null;
  configFiles: string | null;
  configLogs: string | null;
  configStartup: string | null;
  description: string | null;
  dockerImage: string;
  dockerImages: string;
  features: string | null;
  fileDenylist: string | null;
  id: string;
  name: string;
  scriptContainer: string | null;
  scriptEntry: string | null;
  scriptInstall: string | null;
  startup: string;
  stopCommand: string;
  tags: string | null;
  variables: EggVariable[];
}

interface DockerImageEntry {
  image: string;
  label: string;
}

interface VariableEntry {
  defaultValue: string;
  description: string;
  envVariable: string;
  name: string;
  rules: string;
  userEditable: boolean;
  userViewable: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

function parseDockerImages(raw: string | null): DockerImageEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const obj: Record<string, string> = JSON.parse(raw);
    return Object.entries(obj).map(([label, image]) => ({ label, image }));
  } catch {
    return [];
  }
}

function parseCsv(raw: string | null): string {
  if (!raw) {
    return "";
  }
  try {
    const arr: string[] = JSON.parse(raw);
    return arr.join(", ");
  } catch {
    return "";
  }
}

// ── Component ──────────────────────────────────────────────────────

export default function EditEggPage({ params }: { params: { eggId: string } }) {
  const { eggId } = params;
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── Fetch egg ────────────────────────────────────────────────────
  const {
    data: egg,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["egg", eggId],
    queryFn: () => api.get<EggDetail>(`/eggs/${eggId}`),
  });

  // ── Form state ───────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [dockerImage, setDockerImage] = useState("");
  const [dockerImages, setDockerImages] = useState<DockerImageEntry[]>([]);
  const [startup, setStartup] = useState("");
  const [stopCommand, setStopCommand] = useState("");
  const [configStartup, setConfigStartup] = useState("");
  const [configFiles, setConfigFiles] = useState("");
  const [configLogs, setConfigLogs] = useState("");
  const [scriptInstall, setScriptInstall] = useState("");
  const [scriptContainer, setScriptContainer] = useState("");
  const [scriptEntry, setScriptEntry] = useState("");
  const [fileDenylist, setFileDenylist] = useState("");
  const [tags, setTags] = useState("");
  const [variables, setVariables] = useState<VariableEntry[]>([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // ── Populate form when data loads ────────────────────────────────
  useEffect(() => {
    if (!egg) {
      return;
    }
    setName(egg.name);
    setAuthor(egg.author || "");
    setDescription(egg.description || "");
    setDockerImage(egg.dockerImage);
    setDockerImages(parseDockerImages(egg.dockerImages));
    setStartup(egg.startup);
    setStopCommand(egg.stopCommand);
    setConfigStartup(egg.configStartup || "");
    setConfigFiles(egg.configFiles || "");
    setConfigLogs(egg.configLogs || "");
    setScriptInstall(egg.scriptInstall || "");
    setScriptContainer(
      egg.scriptContainer || "ghcr.io/pelican-dev/installer:latest"
    );
    setScriptEntry(egg.scriptEntry || "bash");
    setFileDenylist(parseCsv(egg.fileDenylist));
    setTags(parseCsv(egg.tags));
    setVariables(
      egg.variables.map((v) => ({
        name: v.name,
        description: v.description || "",
        envVariable: v.envVariable,
        defaultValue: v.defaultValue || "",
        userViewable: v.userViewable === 1,
        userEditable: v.userEditable === 1,
        rules: v.rules,
      }))
    );
  }, [egg]);

  // ── Update mutation ──────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: () => {
      const dockerImagesObj: Record<string, string> = {};
      for (const di of dockerImages) {
        if (di.label.trim() && di.image.trim()) {
          dockerImagesObj[di.label.trim()] = di.image.trim();
        }
      }

      const tagsList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const denyList = fileDenylist
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      return api.put(`/eggs/${eggId}`, {
        name,
        author,
        description,
        dockerImage,
        dockerImages: dockerImagesObj,
        startup,
        stopCommand,
        configStartup,
        configFiles,
        configLogs,
        scriptInstall,
        scriptContainer,
        scriptEntry,
        fileDenylist: denyList,
        tags: tagsList,
        variables: variables.map((v) => ({
          name: v.name,
          description: v.description,
          envVariable: v.envVariable,
          defaultValue: v.defaultValue,
          userViewable: v.userViewable,
          userEditable: v.userEditable,
          rules: v.rules,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eggs"] });
      queryClient.invalidateQueries({ queryKey: ["egg", eggId] });
      router.push("/admin/eggs");
    },
    onError: (err: Error) => setError(err.message),
  });

  // ── Delete mutation ──────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/eggs/${eggId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eggs"] });
      router.push("/admin/eggs");
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  // ── Variable helpers ─────────────────────────────────────────────
  const addVariable = () =>
    setVariables([
      ...variables,
      {
        name: "",
        description: "",
        envVariable: "",
        defaultValue: "",
        userViewable: false,
        userEditable: false,
        rules: "required|string",
      },
    ]);

  const updateVariable = (idx: number, patch: Partial<VariableEntry>) =>
    setVariables(variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

  const removeVariable = (idx: number) =>
    setVariables(variables.filter((_, i) => i !== idx));

  // ── Docker image helpers ─────────────────────────────────────────
  const addDockerImage = () =>
    setDockerImages([...dockerImages, { label: "", image: "" }]);

  const updateDockerImage = (idx: number, patch: Partial<DockerImageEntry>) =>
    setDockerImages(
      dockerImages.map((d, i) => (i === idx ? { ...d, ...patch } : d))
    );

  const removeDockerImage = (idx: number) =>
    setDockerImages(dockerImages.filter((_, i) => i !== idx));

  // ── Submit handler ───────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    updateMutation.mutate();
  };

  // ── Loading / Not Found ──────────────────────────────────────────
  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }

  if (fetchError || !egg) {
    return (
      <Layout>
        <div className="space-y-4">
          <PageHeader backTo="/admin/eggs" title="Edit Egg" />
          <Alert variant="destructive">
            <AlertDescription>Egg not found.</AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          backTo="/admin/eggs"
          title={`Edit Egg \u2014 ${egg.name}`}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Tabbed Form */}
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="configuration">
            <TabsList>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="process">Process Management</TabsTrigger>
              <TabsTrigger value="variables">Variables</TabsTrigger>
              <TabsTrigger value="install">Install Script</TabsTrigger>
            </TabsList>

            {/* ── Tab: Configuration ──────────────────────────────── */}
            <TabsContent value="configuration">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="egg-name">Name</Label>
                      <Input
                        id="egg-name"
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Minecraft Java"
                        required
                        value={name}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="egg-author">Author</Label>
                      <Input
                        id="egg-author"
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="support@example.com"
                        value={author}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="egg-description">Description</Label>
                    <Textarea
                      className="h-20"
                      id="egg-description"
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A brief description of this egg..."
                      value={description}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="egg-docker-image">
                      Default Docker Image
                    </Label>
                    <Input
                      className="font-mono text-sm"
                      id="egg-docker-image"
                      onChange={(e) => setDockerImage(e.target.value)}
                      placeholder="ghcr.io/pelican-eggs/games/minecraft:java"
                      required
                      value={dockerImage}
                    />
                  </div>

                  {/* Docker Images (key-value pairs) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Docker Images</Label>
                      <Button
                        onClick={addDockerImage}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add Image
                      </Button>
                    </div>
                    {dockerImages.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        No additional docker images configured.
                      </p>
                    )}
                    {dockerImages.map((di, idx) => (
                      <div
                        className="flex items-center gap-2"
                        key={di.label || idx}
                      >
                        <Input
                          className="flex-1"
                          onChange={(e) =>
                            updateDockerImage(idx, { label: e.target.value })
                          }
                          placeholder="Label (e.g. Java 21)"
                          value={di.label}
                        />
                        <Input
                          className="flex-1 font-mono text-sm"
                          onChange={(e) =>
                            updateDockerImage(idx, { image: e.target.value })
                          }
                          placeholder="Image (e.g. ghcr.io/...)"
                          value={di.image}
                        />
                        <Button
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeDockerImage(idx)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="egg-tags">Tags</Label>
                      <Input
                        id="egg-tags"
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="minecraft, java, game"
                        value={tags}
                      />
                      <p className="text-muted-foreground text-xs">
                        Comma-separated list of tags.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="egg-denylist">File Denylist</Label>
                      <Input
                        id="egg-denylist"
                        onChange={(e) => setFileDenylist(e.target.value)}
                        placeholder="*.jar, server.properties"
                        value={fileDenylist}
                      />
                      <p className="text-muted-foreground text-xs">
                        Comma-separated file patterns users cannot edit.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab: Process Management ─────────────────────────── */}
            <TabsContent value="process">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Process Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="egg-startup">Startup Command</Label>
                    <Input
                      className="font-mono text-sm"
                      id="egg-startup"
                      onChange={(e) => setStartup(e.target.value)}
                      placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar"
                      required
                      value={startup}
                    />
                    <p className="text-muted-foreground text-xs">
                      Use {"{{VARIABLE}}"} syntax for variable substitution.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="egg-stop">Stop Command</Label>
                    <Input
                      id="egg-stop"
                      onChange={(e) => setStopCommand(e.target.value)}
                      placeholder="stop"
                      value={stopCommand}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Config: Startup</Label>
                    <CodeEditor
                      className="h-24"
                      language="json"
                      onChange={setConfigStartup}
                      placeholder="{}"
                      value={configStartup}
                    />
                    <p className="text-muted-foreground text-xs">
                      JSON object for startup detection configuration.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Config: Files</Label>
                    <CodeEditor
                      className="h-24"
                      language="json"
                      onChange={setConfigFiles}
                      placeholder="[]"
                      value={configFiles}
                    />
                    <p className="text-muted-foreground text-xs">
                      JSON describing configuration file modifications.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Config: Logs</Label>
                    <CodeEditor
                      className="h-24"
                      language="json"
                      onChange={setConfigLogs}
                      placeholder="{}"
                      value={configLogs}
                    />
                    <p className="text-muted-foreground text-xs">
                      JSON object for log configuration.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab: Variables ──────────────────────────────────── */}
            <TabsContent value="variables">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Variables</CardTitle>
                    <Button
                      onClick={addVariable}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add Variable
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {variables.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      No variables defined for this egg.
                    </p>
                  )}
                  {variables.map((v, idx) => (
                    <div
                      className="relative space-y-3 rounded-lg border p-4"
                      key={v.envVariable || idx}
                    >
                      <Button
                        className="absolute top-2 right-2 text-destructive hover:text-destructive"
                        onClick={() => removeVariable(idx)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Name</Label>
                          <Input
                            onChange={(e) =>
                              updateVariable(idx, { name: e.target.value })
                            }
                            placeholder="Server Version"
                            required
                            value={v.name}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Environment Variable</Label>
                          <Input
                            className="font-mono text-sm"
                            onChange={(e) =>
                              updateVariable(idx, {
                                envVariable: e.target.value,
                              })
                            }
                            placeholder="SERVER_VERSION"
                            required
                            value={v.envVariable}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label>Description</Label>
                        <Input
                          onChange={(e) =>
                            updateVariable(idx, { description: e.target.value })
                          }
                          placeholder="A brief description of this variable..."
                          value={v.description}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Default Value</Label>
                          <Input
                            className="font-mono text-sm"
                            onChange={(e) =>
                              updateVariable(idx, {
                                defaultValue: e.target.value,
                              })
                            }
                            placeholder="latest"
                            value={v.defaultValue}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Validation Rules</Label>
                          <Input
                            className="font-mono text-sm"
                            onChange={(e) =>
                              updateVariable(idx, { rules: e.target.value })
                            }
                            placeholder="required|string"
                            value={v.rules}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={v.userViewable}
                            onCheckedChange={(checked) =>
                              updateVariable(idx, { userViewable: !!checked })
                            }
                          />
                          <Label className="font-normal text-sm">
                            User Viewable
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={v.userEditable}
                            onCheckedChange={(checked) =>
                              updateVariable(idx, { userEditable: !!checked })
                            }
                          />
                          <Label className="font-normal text-sm">
                            User Editable
                          </Label>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab: Install Script ─────────────────────────────── */}
            <TabsContent value="install">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Install Script</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="egg-script-container">
                        Container Image
                      </Label>
                      <Input
                        className="font-mono text-sm"
                        id="egg-script-container"
                        onChange={(e) => setScriptContainer(e.target.value)}
                        placeholder="ghcr.io/pelican-dev/installer:latest"
                        value={scriptContainer}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="egg-script-entry">Entrypoint</Label>
                      <Input
                        className="font-mono text-sm"
                        id="egg-script-entry"
                        onChange={(e) => setScriptEntry(e.target.value)}
                        placeholder="bash"
                        value={scriptEntry}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Install Script</Label>
                    <CodeEditor
                      className="h-64"
                      language="bash"
                      onChange={setScriptInstall}
                      placeholder="#!/bin/bash\n# Installation commands..."
                      value={scriptInstall}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              disabled={
                updateMutation.isPending || !name || !dockerImage || !startup
              }
              type="submit"
            >
              <Save className="mr-2 h-4 w-4" />
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>

        {/* ── Danger Zone ─────────────────────────────────────────── */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deleteError && (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Delete this egg</p>
                <p className="text-muted-foreground text-sm">
                  Permanently remove this egg and all its variables. This cannot
                  be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Egg
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete egg "{egg.name}"?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this egg and all its
                      variables. Servers using this egg will no longer function
                      correctly.
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
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
