"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@web/components/empty-state";
import { Layout } from "@web/components/layout";
import { Badge } from "@web/components/ui/badge";
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
import { ChevronDown, ChevronRight, Egg } from "lucide-react";
import { useState } from "react";

interface EggItem {
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

export default function EggsPage() {
  const { data: eggs, isLoading } = useQuery({
    queryKey: ["eggs"],
    queryFn: () => api.get<EggItem[]>("/eggs"),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="font-bold text-2xl tracking-tight">Eggs</h1>

        <EggsList eggs={eggs} isLoading={isLoading} />
      </div>
    </Layout>
  );
}

function EggsList({
  eggs,
  isLoading,
}: {
  eggs: EggItem[] | undefined;
  isLoading: boolean;
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

  if (!eggs?.length) {
    return <EmptyState icon={Egg} title="No eggs available yet." />;
  }

  return (
    <div className="space-y-3">
      {eggs.map((egg) => (
        <EggRow egg={egg} key={egg.id} />
      ))}
    </div>
  );
}

function EggDetailContent({
  detail,
  isLoading,
}: {
  detail: EggDetail | undefined;
  isLoading: boolean;
}) {
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
      {detail.variables.filter((v) => v.userViewable).length > 0 && (
        <div>
          <div className="mb-2 text-muted-foreground text-xs">Variables</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Env Variable</TableHead>
                <TableHead>Default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.variables
                .filter((v) => v.userViewable)
                .map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {v.envVariable}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {v.defaultValue || "-"}
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

function EggRow({ egg }: { egg: EggItem }) {
  const [expanded, setExpanded] = useState(false);

  const tags = (() => {
    try {
      return JSON.parse(egg.tags || "[]");
    } catch {
      return [];
    }
  })();

  const { data: detail, isLoading } = useQuery({
    queryKey: ["egg", egg.id],
    queryFn: () => api.get<EggDetail>(`/eggs/${egg.id}`),
    enabled: expanded,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          className="flex flex-wrap items-center gap-2 border-none bg-transparent p-0 text-left sm:gap-3"
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Egg className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{egg.name}</CardTitle>
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
          <Badge className="font-mono text-xs" variant="secondary">
            {egg.dockerImage.split("/").pop() || egg.dockerImage}
          </Badge>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          <EggDetailContent detail={detail} isLoading={isLoading} />
        </CardContent>
      )}
    </Card>
  );
}
