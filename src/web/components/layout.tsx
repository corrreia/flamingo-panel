import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@web/components/ui/avatar";
import { Button } from "@web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@web/components/ui/dropdown-menu";
import { useAuth } from "@web/lib/auth";
import {
  ClipboardList,
  Egg,
  LogOut,
  Network,
  Plus,
  Server,
  Settings,
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="relative flex items-center justify-between overflow-hidden border-border border-b px-6 py-3">
        <div className="flex items-center gap-1 pl-16">
          <Link
            className="mr-4 flex items-center gap-2 font-bold text-primary text-xl"
            to="/"
          >
            Flamingo
          </Link>
          <Button asChild size="sm" variant="ghost">
            <Link to="/">
              <Server className="mr-2 h-4 w-4" /> Servers
            </Link>
          </Button>
          {user?.role === "admin" && (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/admin/nodes">
                  <Network className="mr-2 h-4 w-4" /> Nodes
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/admin/eggs">
                  <Egg className="mr-2 h-4 w-4" /> Eggs
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/admin/activity">
                  <ClipboardList className="mr-2 h-4 w-4" /> Activity
                </Link>
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && (
            <Button asChild size="sm">
              <Link to="/admin/create-server">
                <Plus className="mr-2 h-4 w-4" /> Create Server
              </Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="relative h-8 w-8 rounded-full" variant="ghost">
                <Avatar className="h-8 w-8">
                  {user?.image && (
                    <AvatarImage alt={user.username} src={user.image} />
                  )}
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {user?.username?.[0]?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="flex flex-col gap-1 p-2">
                <div className="font-medium text-sm">{user?.username}</div>
                <div className="text-muted-foreground text-xs">
                  {user?.email}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-4 -translate-y-3"
          height={100}
          src="/flamingo-head.svg"
          width={75}
        />
      </nav>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
