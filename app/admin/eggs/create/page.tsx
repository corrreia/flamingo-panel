"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Layout } from "@web/components/layout";
import { PageHeader } from "@web/components/page-header";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import { Button } from "@web/components/ui/button";
import { Card, CardContent } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@web/components/ui/tabs";
import { Textarea } from "@web/components/ui/textarea";
import { api } from "@web/lib/api";
import { Plus, X } from "lucide-react";
import { useState } from "react";

interface DockerImage {
  id: string;
  imageUri: string;
  label: string;
}

interface EggVariable {
  defaultValue: string;
  description: string;
  envVariable: string;
  id: string;
  name: string;
  rules: string;
  userEditable: boolean;
  userViewable: boolean;
}

export default function CreateEggPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  // Tab 1: Configuration
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [dockerImages, setDockerImages] = useState<DockerImage[]>([
    { id: crypto.randomUUID(), label: "Default", imageUri: "" },
  ]);
  const [fileDenylist, setFileDenylist] = useState("");

  // Tab 2: Process Management
  const [startup, setStartup] = useState("");
  const [stopCommand, setStopCommand] = useState("stop");
  const [configStartup, setConfigStartup] = useState("{}");
  const [configFiles, setConfigFiles] = useState("[]");
  const [configLogs, setConfigLogs] = useState("{}");

  // Tab 3: Variables
  const [variables, setVariables] = useState<EggVariable[]>([]);

  // Tab 4: Install Script
  const [scriptContainer, setScriptContainer] = useState(
    "ghcr.io/pelican-dev/installer:latest"
  );
  const [scriptEntry, setScriptEntry] = useState("bash");
  const [scriptInstall, setScriptInstall] = useState("");

  // Docker images helpers
  const addDockerImage = () => {
    setDockerImages([
      ...dockerImages,
      { id: crypto.randomUUID(), label: "", imageUri: "" },
    ]);
  };

  const removeDockerImage = (id: string) => {
    if (dockerImages.length <= 1) {
      return;
    }
    setDockerImages(dockerImages.filter((img) => img.id !== id));
  };

  const updateDockerImage = (
    id: string,
    field: "label" | "imageUri",
    value: string
  ) => {
    setDockerImages(
      dockerImages.map((img) =>
        img.id === id ? { ...img, [field]: value } : img
      )
    );
  };

  // Variable helpers
  const addVariable = () => {
    setVariables([
      ...variables,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        envVariable: "",
        defaultValue: "",
        userViewable: false,
        userEditable: false,
        rules: "required|string",
      },
    ]);
  };

  const removeVariable = (id: string) => {
    setVariables(variables.filter((v) => v.id !== id));
  };

  const updateVariable = (
    id: string,
    field: keyof EggVariable,
    value: string | boolean
  ) => {
    setVariables(
      variables.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  // Submit
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/eggs", data),
    onSuccess: () => router.push("/admin/eggs"),
    onError: (err: Error) => setError(err.message),
  });

  const validateForm = (): string | null => {
    if (!name.trim()) {
      return "Name is required.";
    }
    if (!dockerImages[0]?.imageUri.trim()) {
      return "At least one Docker image is required.";
    }
    if (!startup.trim()) {
      return "Startup command is required.";
    }
    return null;
  };

  const handleSubmit = () => {
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Build dockerImages record
    const dockerImagesRecord: Record<string, string> = {};
    for (const img of dockerImages) {
      if (img.imageUri.trim()) {
        const key = img.label.trim() || img.imageUri.trim();
        dockerImagesRecord[key] = img.imageUri.trim();
      }
    }

    const payload = {
      name: name.trim(),
      author: author.trim() || undefined,
      description: description.trim() || undefined,
      dockerImage: dockerImages[0].imageUri.trim(),
      dockerImages: dockerImagesRecord,
      startup: startup.trim(),
      stopCommand: stopCommand.trim() || undefined,
      configStartup: configStartup.trim() || "{}",
      configFiles: configFiles.trim() || "[]",
      configLogs: configLogs.trim() || "{}",
      scriptInstall: scriptInstall.trim() || undefined,
      scriptContainer: scriptContainer.trim() || undefined,
      scriptEntry: scriptEntry.trim() || undefined,
      fileDenylist: fileDenylist
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      features: [] as string[],
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      variables: variables.map((v) => ({
        name: v.name,
        description: v.description,
        envVariable: v.envVariable,
        defaultValue: v.defaultValue,
        userViewable: v.userViewable,
        userEditable: v.userEditable,
        rules: v.rules,
      })),
    };

    createMutation.mutate(payload);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader backTo="/admin/eggs" title="Create Egg" />

        {/* Tabbed Form */}
        <Tabs defaultValue="configuration">
          <TabsList>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="process">Process Management</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
            <TabsTrigger value="install">Install Script</TabsTrigger>
          </TabsList>

          {/* Tab 1: Configuration */}
          <TabsContent value="configuration">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="egg-name">
                    Name <span className="text-destructive">*</span>
                  </Label>
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
                    placeholder="email@example.com"
                    value={author}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="egg-description">Description</Label>
                  <Textarea
                    id="egg-description"
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A brief description of this egg..."
                    rows={3}
                    value={description}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="egg-tags">Tags</Label>
                  <Input
                    id="egg-tags"
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="minecraft, java, game"
                    value={tags}
                  />
                  <p className="text-muted-foreground text-xs">
                    Comma-separated tags
                  </p>
                </div>

                {/* Docker Images Repeater */}
                <div className="space-y-3">
                  <Label>
                    Docker Images <span className="text-destructive">*</span>
                  </Label>
                  {dockerImages.map((img, index) => (
                    <div className="flex items-center gap-2" key={img.id}>
                      <Input
                        className="w-1/3"
                        onChange={(e) =>
                          updateDockerImage(img.id, "label", e.target.value)
                        }
                        placeholder={index === 0 ? "Default" : "Label"}
                        value={img.label}
                      />
                      <Input
                        className="flex-1"
                        onChange={(e) =>
                          updateDockerImage(img.id, "imageUri", e.target.value)
                        }
                        placeholder="ghcr.io/pelican-eggs/games/minecraft:java"
                        value={img.imageUri}
                      />
                      <Button
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={dockerImages.length <= 1}
                        onClick={() => removeDockerImage(img.id)}
                        size="sm"
                        variant="ghost"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button onClick={addDockerImage} size="sm" variant="outline">
                    <Plus className="mr-1 h-4 w-4" /> Add Image
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="egg-denylist">File Denylist</Label>
                  <Input
                    id="egg-denylist"
                    onChange={(e) => setFileDenylist(e.target.value)}
                    placeholder=".env, secrets.json"
                    value={fileDenylist}
                  />
                  <p className="text-muted-foreground text-xs">
                    Comma-separated file paths
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Process Management */}
          <TabsContent value="process">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="egg-startup">
                    Startup Command <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="font-mono text-sm"
                    id="egg-startup"
                    onChange={(e) => setStartup(e.target.value)}
                    placeholder="java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar"
                    required
                    value={startup}
                  />
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
                  <Label htmlFor="egg-config-startup">Config -- Startup</Label>
                  <Textarea
                    className="h-24 font-mono text-xs"
                    id="egg-config-startup"
                    onChange={(e) => setConfigStartup(e.target.value)}
                    placeholder="{}"
                    value={configStartup}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="egg-config-files">Config -- Files</Label>
                  <Textarea
                    className="h-24 font-mono text-xs"
                    id="egg-config-files"
                    onChange={(e) => setConfigFiles(e.target.value)}
                    placeholder="[]"
                    value={configFiles}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="egg-config-logs">Config -- Logs</Label>
                  <Textarea
                    className="h-24 font-mono text-xs"
                    id="egg-config-logs"
                    onChange={(e) => setConfigLogs(e.target.value)}
                    placeholder="{}"
                    value={configLogs}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Variables */}
          <TabsContent value="variables">
            <Card>
              <CardContent className="space-y-4 pt-6">
                {variables.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No variables yet. Click "Add Variable" to create one.
                  </p>
                ) : (
                  variables.map((v, index) => (
                    <div
                      className="space-y-3 rounded-lg border border-border p-4"
                      key={v.id}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-muted-foreground text-sm">
                          Variable {index + 1}
                        </span>
                        <Button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeVariable(v.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Name</Label>
                          <Input
                            onChange={(e) =>
                              updateVariable(v.id, "name", e.target.value)
                            }
                            placeholder="Server Version"
                            value={v.name}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Env Variable</Label>
                          <Input
                            className="font-mono text-sm"
                            onChange={(e) =>
                              updateVariable(
                                v.id,
                                "envVariable",
                                e.target.value.toUpperCase()
                              )
                            }
                            placeholder="SERVER_VERSION"
                            value={v.envVariable}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Default Value</Label>
                          <Input
                            onChange={(e) =>
                              updateVariable(
                                v.id,
                                "defaultValue",
                                e.target.value
                              )
                            }
                            placeholder="latest"
                            value={v.defaultValue}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Description</Label>
                          <Input
                            onChange={(e) =>
                              updateVariable(
                                v.id,
                                "description",
                                e.target.value
                              )
                            }
                            placeholder="The version of the server to install"
                            value={v.description}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={v.userViewable}
                            className="rounded border-border"
                            onChange={(e) =>
                              updateVariable(
                                v.id,
                                "userViewable",
                                e.target.checked
                              )
                            }
                            type="checkbox"
                          />
                          User Viewable
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={v.userEditable}
                            className="rounded border-border"
                            onChange={(e) =>
                              updateVariable(
                                v.id,
                                "userEditable",
                                e.target.checked
                              )
                            }
                            type="checkbox"
                          />
                          User Editable
                        </label>
                      </div>

                      <div className="space-y-1">
                        <Label>Rules</Label>
                        <Input
                          className="font-mono text-sm"
                          onChange={(e) =>
                            updateVariable(v.id, "rules", e.target.value)
                          }
                          placeholder="required|string"
                          value={v.rules}
                        />
                      </div>
                    </div>
                  ))
                )}

                <Button onClick={addVariable} size="sm" variant="outline">
                  <Plus className="mr-1 h-4 w-4" /> Add Variable
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Install Script */}
          <TabsContent value="install">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="egg-script-container">Script Container</Label>
                  <Input
                    id="egg-script-container"
                    onChange={(e) => setScriptContainer(e.target.value)}
                    placeholder="ghcr.io/pelican-dev/installer:latest"
                    value={scriptContainer}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="egg-script-entry">Script Entry</Label>
                  <Input
                    id="egg-script-entry"
                    onChange={(e) => setScriptEntry(e.target.value)}
                    placeholder="bash"
                    value={scriptEntry}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="egg-script-install">Install Script</Label>
                  <Textarea
                    className="h-80 font-mono text-xs"
                    id="egg-script-install"
                    onChange={(e) => setScriptInstall(e.target.value)}
                    placeholder={"#!/bin/bash\n..."}
                    value={scriptInstall}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Error + Submit */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button disabled={createMutation.isPending} onClick={handleSubmit}>
            {createMutation.isPending ? "Creating..." : "Create Egg"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
