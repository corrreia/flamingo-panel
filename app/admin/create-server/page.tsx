"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layout } from "@web/components/layout";
import { PageHeader } from "@web/components/page-header";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { Skeleton } from "@web/components/ui/skeleton";
import { Switch } from "@web/components/ui/switch";
import { api } from "@web/lib/api";
import { ChevronRight, Server } from "lucide-react";
import { useEffect, useState } from "react";

interface UserItem {
  email: string;
  id: string;
  role: string;
  username: string;
}
interface NodeItem {
  disk: number;
  id: number;
  memory: number;
  name: string;
  url: string;
}
interface EggItem {
  dockerImage: string;
  dockerImages: string;
  id: string;
  name: string;
  startup: string;
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

/**
 * Get CSS class names for a wizard step based on its index relative to the current step.
 *
 * @param i - The index of the step being rendered
 * @param step - The index of the current active step
 * @returns The CSS class string representing the step state: active ("bg-primary text-primary-foreground"), completed ("bg-primary/20 text-primary"), or pending ("bg-muted text-muted-foreground")
 */
function getStepClassName(i: number, step: number): string {
  if (i === step) {
    return "bg-primary text-primary-foreground";
  }
  if (i < step) {
    return "bg-primary/20 text-primary";
  }
  return "bg-muted text-muted-foreground";
}

/**
 * Renders a multi-step "Create Server" wizard page allowing admins to configure and create a server.
 *
 * The component fetches users, nodes, and eggs, manages form state across five steps (Basics, Node & Egg,
 * Resources, Variables, Review), validates required fields per step, and submits a create request to the API.
 * On successful creation the page navigates to the root ("/"); errors are displayed as an alert.
 *
 * @returns The rendered Create Server page UI
 */
export default function CreateServerPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [eggId, setEggId] = useState("");
  const [memory, setMemory] = useState("512");
  const [cpu, setCpu] = useState("100");
  const [disk, setDisk] = useState("1024");
  const [unlimitedMemory, setUnlimitedMemory] = useState(false);
  const [unlimitedCpu, setUnlimitedCpu] = useState(false);
  const [unlimitedDisk, setUnlimitedDisk] = useState(false);
  const [port, setPort] = useState("25565");
  const [selectedImage, setSelectedImage] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserItem[]>("/users"),
  });
  const { data: nodes } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => api.get<NodeItem[]>("/nodes"),
  });
  const { data: eggs } = useQuery({
    queryKey: ["eggs"],
    queryFn: () => api.get<EggItem[]>("/eggs"),
  });

  const { data: eggDetail } = useQuery({
    queryKey: ["egg", eggId],
    queryFn: () => api.get<EggDetail>(`/eggs/${eggId}`),
    enabled: !!eggId,
  });

  const isLoading = !(users && nodes && eggs);

  // Update variables and docker image when egg changes
  useEffect(() => {
    if (!eggDetail) {
      return;
    }
    const defaults: Record<string, string> = {};
    for (const v of eggDetail.variables) {
      defaults[v.envVariable] = v.defaultValue || "";
    }
    setVariables(defaults);

    // Parse docker images and select the first one by default
    try {
      const parsed = JSON.parse(eggDetail.dockerImages || "{}") as Record<
        string,
        string
      >;
      const values = Object.values(parsed);
      setSelectedImage(values.length > 0 ? values[0] : "");
    } catch {
      setSelectedImage("");
    }
  }, [eggDetail]);

  // Parse docker images map from egg detail
  const dockerImagesMap: Record<string, string> | null = (() => {
    if (!eggDetail?.dockerImages) {
      return null;
    }
    try {
      const parsed = JSON.parse(eggDetail.dockerImages) as Record<
        string,
        string
      >;
      return Object.keys(parsed).length > 0 ? parsed : null;
    } catch {
      return null;
    }
  })();

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/servers", {
        name,
        description: description || undefined,
        ownerId,
        nodeId: Number.parseInt(nodeId, 10),
        eggId,
        memory: unlimitedMemory ? 0 : Number.parseInt(memory, 10),
        cpu: unlimitedCpu ? 0 : Number.parseInt(cpu, 10),
        disk: unlimitedDisk ? 0 : Number.parseInt(disk, 10),
        defaultAllocationPort: Number.parseInt(port, 10),
        image: selectedImage || undefined,
        variables,
      }),
    onSuccess: () => router.push("/"),
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96" />
        </div>
      </Layout>
    );
  }

  const steps = [
    { label: "Basics", valid: !!name && !!ownerId },
    { label: "Node & Egg", valid: !!nodeId && !!eggId },
    { label: "Resources", valid: true },
    { label: "Variables", valid: true },
    { label: "Review", valid: true },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader backTo="/" title="Create Server" />

        <div className="flex flex-wrap items-center gap-2">
          {steps.map((s, i) => (
            <div className="flex items-center gap-2" key={s.label}>
              {i > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <button
                className={`rounded-full px-3 py-1 text-sm transition-colors ${getStepClassName(i, step)}`}
                onClick={() => setStep(i)}
                type="button"
              >
                {s.label}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="srv-name">Server Name</Label>
                <Input
                  id="srv-name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Minecraft Server"
                  required
                  value={name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="srv-desc">Description (optional)</Label>
                <Input
                  id="srv-desc"
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A survival server"
                  value={description}
                />
              </div>
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select onValueChange={setOwnerId} value={ownerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.username} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button disabled={!steps[0].valid} onClick={() => setStep(1)}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Node & Egg</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Node</Label>
                {nodes.length ? (
                  <Select onValueChange={setNodeId} value={nodeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a node..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nodes.map((n) => (
                        <SelectItem key={n.id} value={String(n.id)}>
                          {n.name} {n.url ? `(${n.url})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Alert>
                    <AlertDescription>
                      No nodes available.{" "}
                      <Link
                        className="text-primary underline"
                        href="/admin/nodes"
                      >
                        Add a node first.
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="space-y-2">
                <Label>Egg</Label>
                {eggs.length ? (
                  <Select onValueChange={setEggId} value={eggId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an egg..." />
                    </SelectTrigger>
                    <SelectContent>
                      {eggs.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Alert>
                    <AlertDescription>
                      No eggs available.{" "}
                      <Link className="text-primary underline" href="/admin/eggs">
                        Import an egg first.
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              {dockerImagesMap && Object.keys(dockerImagesMap).length > 1 && (
                <div className="space-y-2">
                  <Label>Docker Image</Label>
                  <Select
                    onValueChange={setSelectedImage}
                    value={selectedImage}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select docker image..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(dockerImagesMap).map(([label, uri]) => (
                        <SelectItem key={label} value={uri}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex justify-between">
                <Button onClick={() => setStep(0)} variant="secondary">
                  Back
                </Button>
                <Button disabled={!steps[1].valid} onClick={() => setStep(2)}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resource Limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="srv-memory">Memory (MB)</Label>
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      Unlimited
                      <Switch
                        checked={unlimitedMemory}
                        onCheckedChange={setUnlimitedMemory}
                        size="sm"
                      />
                    </div>
                  </div>
                  <Input
                    disabled={unlimitedMemory}
                    id="srv-memory"
                    min="64"
                    onChange={(e) => setMemory(e.target.value)}
                    placeholder={unlimitedMemory ? "Unlimited" : undefined}
                    type="number"
                    value={unlimitedMemory ? "" : memory}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="srv-cpu">CPU Limit (%)</Label>
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      Unlimited
                      <Switch
                        checked={unlimitedCpu}
                        onCheckedChange={setUnlimitedCpu}
                        size="sm"
                      />
                    </div>
                  </div>
                  <Input
                    disabled={unlimitedCpu}
                    id="srv-cpu"
                    min="10"
                    onChange={(e) => setCpu(e.target.value)}
                    placeholder={unlimitedCpu ? "Unlimited" : undefined}
                    type="number"
                    value={unlimitedCpu ? "" : cpu}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="srv-disk">Disk (MB)</Label>
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      Unlimited
                      <Switch
                        checked={unlimitedDisk}
                        onCheckedChange={setUnlimitedDisk}
                        size="sm"
                      />
                    </div>
                  </div>
                  <Input
                    disabled={unlimitedDisk}
                    id="srv-disk"
                    min="128"
                    onChange={(e) => setDisk(e.target.value)}
                    placeholder={unlimitedDisk ? "Unlimited" : undefined}
                    type="number"
                    value={unlimitedDisk ? "" : disk}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="srv-port">Primary Port</Label>
                  <Input
                    id="srv-port"
                    max="65535"
                    min="1"
                    onChange={(e) => setPort(e.target.value)}
                    type="number"
                    value={port}
                  />
                </div>
              </div>
              <div className="flex justify-between">
                <Button onClick={() => setStep(1)} variant="secondary">
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>Next</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Egg Variables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!eggDetail || eggDetail.variables.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No variables for this egg.
                </p>
              ) : (
                eggDetail.variables.map((v) => (
                  <div className="space-y-1" key={v.id}>
                    <Label htmlFor={`var-${v.envVariable}`}>{v.name}</Label>
                    {v.description && (
                      <p className="text-muted-foreground text-xs">
                        {v.description}
                      </p>
                    )}
                    <Input
                      className="font-mono text-sm"
                      id={`var-${v.envVariable}`}
                      onChange={(e) =>
                        setVariables({
                          ...variables,
                          [v.envVariable]: e.target.value,
                        })
                      }
                      placeholder={v.defaultValue || ""}
                      value={variables[v.envVariable] || ""}
                    />
                    <p className="font-mono text-muted-foreground text-xs">
                      {v.envVariable}
                    </p>
                  </div>
                ))
              )}
              <div className="flex justify-between">
                <Button onClick={() => setStep(2)} variant="secondary">
                  Back
                </Button>
                <Button onClick={() => setStep(4)}>Next</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review & Create</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:gap-4">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <span className="ml-2 font-medium">{name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Owner:</span>
                  <span className="ml-2 font-medium">
                    {users.find((u) => u.id === ownerId)?.username || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Node:</span>
                  <span className="ml-2 font-medium">
                    {nodes.find((n) => String(n.id) === nodeId)?.name || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Egg:</span>
                  <span className="ml-2 font-medium">
                    {eggs.find((e) => e.id === eggId)?.name || "-"}
                  </span>
                </div>
                {dockerImagesMap && Object.keys(dockerImagesMap).length > 1 && (
                  <div>
                    <span className="text-muted-foreground">Docker Image:</span>
                    <span className="ml-2 font-medium">
                      {Object.entries(dockerImagesMap).find(
                        ([, uri]) => uri === selectedImage
                      )?.[0] ||
                        selectedImage ||
                        "-"}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Memory:</span>
                  <span className="ml-2 font-medium">
                    {unlimitedMemory ? "Unlimited" : `${memory} MB`}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">CPU:</span>
                  <span className="ml-2 font-medium">
                    {unlimitedCpu ? "Unlimited" : `${cpu}%`}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Disk:</span>
                  <span className="ml-2 font-medium">
                    {unlimitedDisk ? "Unlimited" : `${disk} MB`}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Port:</span>
                  <span className="ml-2 font-medium">{port}</span>
                </div>
              </div>
              {eggDetail && eggDetail.variables.length > 0 && (
                <div>
                  <h3 className="mb-2 font-medium text-sm">Variables</h3>
                  <div className="space-y-1">
                    {eggDetail.variables.map((v) => (
                      <div className="flex font-mono text-xs" key={v.id}>
                        <span className="w-32 shrink-0 text-muted-foreground sm:w-48">
                          {v.envVariable}:
                        </span>
                        <span>
                          {variables[v.envVariable] ||
                            v.defaultValue ||
                            "(empty)"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between pt-4">
                <Button onClick={() => setStep(3)} variant="secondary">
                  Back
                </Button>
                <Button
                  disabled={
                    createMutation.isPending ||
                    !name ||
                    !ownerId ||
                    !nodeId ||
                    !eggId
                  }
                  onClick={() => createMutation.mutate()}
                >
                  <Server className="mr-2 h-4 w-4" />{" "}
                  {createMutation.isPending ? "Creating..." : "Create Server"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
