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
import { api } from "@web/lib/api";
import { Cpu, HardDrive, MemoryStick, Server } from "lucide-react";
import Link from "next/link";

interface ServerItem {
	containerStatus: string | null;
	cpu: number;
	disk: number;
	id: string;
	memory: number;
	name: string;
	role: "admin" | "owner" | "subuser";
	status: string | null;
	uuid: string;
}

/**
 * Selects the visual variant for a server status badge.
 *
 * @param s - The server item whose status determines the badge variant
 * @returns `default` when the server's container is running, `destructive` when installation failed, `secondary` otherwise
 */
function getStatusVariant(
	s: ServerItem,
): "default" | "destructive" | "secondary" {
	if (s.containerStatus === "running") {
		return "default";
	}
	if (s.status === "install_failed") {
		return "destructive";
	}
	return "secondary";
}

/**
 * Determine the human-facing status label for a server.
 *
 * @param s - The server object to derive the label from
 * @returns `Installing` if the server is installing, `Install Failed` if installation failed, otherwise the server's container status string or `offline` if none is available
 */
function getStatusLabel(s: ServerItem): string {
	if (s.status === "installing") {
		return "Installing";
	}
	if (s.status === "install_failed") {
		return "Install Failed";
	}
	return s.containerStatus || "offline";
}

/**
 * Render the client-side dashboard page that displays the user's servers.
 *
 * Fetches server data from the API (refetching every 15 seconds), shows loading
 * skeletons while fetching, renders a responsive grid of server cards linking
 * to each server's detail page, and displays an empty state when no servers
 * exist.
 *
 * @returns The dashboard page as a JSX element
 */
export default function DashboardPage() {
	const { data: servers, isLoading } = useQuery({
		queryKey: ["servers"],
		queryFn: () => api.get<ServerItem[]>("/servers"),
		refetchInterval: 15_000,
	});

	return (
		<Layout>
			<div className="space-y-6">
				<h1 className="font-bold text-2xl tracking-tight">Your Servers</h1>
				{isLoading ? (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{[1, 2, 3].map((i) => (
							<Card key={i}>
								<CardContent className="p-6">
									<Skeleton className="h-20" />
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{servers?.map((s) => (
							<Link key={s.id} href={`/server/${s.id}`}>
								<Card className="cursor-pointer transition-colors hover:border-primary/50">
									<CardHeader className="pb-2">
										<div className="flex items-center justify-between">
											<CardTitle className="flex items-center gap-2 text-base">
												<Server className="h-4 w-4 text-primary" />
												{s.name}
											</CardTitle>
											<div className="flex gap-2">
												{s.role === "subuser" && (
													<Badge className="text-xs" variant="outline">
														Shared
													</Badge>
												)}
												<Badge variant={getStatusVariant(s)}>
													{getStatusLabel(s)}
												</Badge>
											</div>
										</div>
									</CardHeader>
									<CardContent>
										<div className="flex gap-4 text-muted-foreground text-sm">
											<span className="flex items-center gap-1">
												<MemoryStick className="h-3 w-3" /> {s.memory} MB
											</span>
											<span className="flex items-center gap-1">
												<Cpu className="h-3 w-3" /> {s.cpu}%
											</span>
											<span className="flex items-center gap-1">
												<HardDrive className="h-3 w-3" /> {s.disk} MB
											</span>
										</div>
									</CardContent>
								</Card>
							</Link>
						))}
						{servers?.length === 0 && (
							<EmptyState
								className="col-span-full"
								icon={Server}
								title="No servers yet."
							/>
						)}
					</div>
				)}
			</div>
		</Layout>
	);
}
