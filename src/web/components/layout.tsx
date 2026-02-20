import { Link } from "@tanstack/react-router";
import { useAuth } from "@web/lib/auth";
import { Button } from "@web/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@web/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@web/components/ui/avatar";
import { Server, Network, Egg, LogOut, Settings, Plus } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link to="/" className="text-xl font-bold text-primary mr-4">Flamingo</Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/"><Server className="mr-2 h-4 w-4" /> Servers</Link>
          </Button>
          {user?.role === "admin" && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/nodes"><Network className="mr-2 h-4 w-4" /> Nodes</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/eggs"><Egg className="mr-2 h-4 w-4" /> Eggs</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/admin/create-server"><Plus className="mr-2 h-4 w-4" /> Create Server</Link>
              </Button>
            </>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/20 text-primary">
                  {user?.username?.[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="flex flex-col gap-1 p-2">
              <div className="text-sm font-medium">{user?.username}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
