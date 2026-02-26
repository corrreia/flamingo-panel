import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@web/components/ui/avatar";
import { Button } from "@web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@web/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@web/components/ui/sheet";
import { useAuth } from "@web/lib/auth";
import {
  ClipboardList,
  Egg,
  LogOut,
  Menu,
  Network,
  Plus,
  Server,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Root application layout that renders the top navigation, user menu, responsive mobile sheet, and main content area.
 *
 * Renders primary navigation links, conditionally shows admin controls when the current user has the "admin" role, and automatically closes the mobile menu when the route changes.
 *
 * @param children - Content to render inside the main content area of the layout
 * @returns The composed layout element containing navigation, the mobile sheet, and the provided main content
 */
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="relative flex items-center justify-between overflow-hidden border-border border-b px-3 py-3 md:px-6">
        <div className="flex items-center gap-1 pl-16">
          <Button
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            size="icon"
            variant="ghost"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
          <Link
            className="mr-4 flex items-center gap-2 font-bold text-primary text-xl"
            href="/"
          >
            Flamingo
          </Link>
          <div className="hidden md:flex md:items-center md:gap-1">
            <Button asChild size="sm" variant="ghost">
              <Link href="/">
                <Server className="mr-2 h-4 w-4" /> Servers
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/eggs">
                <Egg className="mr-2 h-4 w-4" /> Eggs
              </Link>
            </Button>
            {user?.role === "admin" && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />
                <span className="mr-1 text-muted-foreground text-xs">
                  Admin
                </span>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/nodes">
                    <Network className="mr-2 h-4 w-4" /> Nodes
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/eggs">
                    <Egg className="mr-2 h-4 w-4" /> Eggs
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/activity">
                    <ClipboardList className="mr-2 h-4 w-4" /> Activity
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && (
            <Button asChild className="hidden md:inline-flex" size="sm">
              <Link href="/admin/create-server">
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
        <button
          aria-label="Open menu"
          className="absolute top-0 left-4 -translate-y-3 md:pointer-events-none"
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          <img
            alt=""
            aria-hidden="true"
            height={100}
            src="/flamingo-head.svg"
            width={75}
          />
        </button>
      </nav>
      <Sheet onOpenChange={setMobileOpen} open={mobileOpen}>
        <SheetContent className="w-64" side="left">
          <SheetHeader>
            <SheetTitle className="text-primary">Flamingo</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            <Button asChild className="justify-start" size="sm" variant="ghost">
              <Link href="/">
                <Server className="mr-2 h-4 w-4" /> Servers
              </Link>
            </Button>
            <Button asChild className="justify-start" size="sm" variant="ghost">
              <Link href="/eggs">
                <Egg className="mr-2 h-4 w-4" /> Eggs
              </Link>
            </Button>
            {user?.role === "admin" && (
              <>
                <div className="my-2 border-border border-t" />
                <span className="mb-1 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Admin
                </span>
                <Button
                  asChild
                  className="justify-start"
                  size="sm"
                  variant="ghost"
                >
                  <Link href="/admin/nodes">
                    <Network className="mr-2 h-4 w-4" /> Nodes
                  </Link>
                </Button>
                <Button
                  asChild
                  className="justify-start"
                  size="sm"
                  variant="ghost"
                >
                  <Link href="/admin/eggs">
                    <Egg className="mr-2 h-4 w-4" /> Eggs
                  </Link>
                </Button>
                <Button
                  asChild
                  className="justify-start"
                  size="sm"
                  variant="ghost"
                >
                  <Link href="/admin/activity">
                    <ClipboardList className="mr-2 h-4 w-4" /> Activity
                  </Link>
                </Button>
                <Button asChild className="mt-2 justify-start" size="sm">
                  <Link href="/admin/create-server">
                    <Plus className="mr-2 h-4 w-4" /> Create Server
                  </Link>
                </Button>
              </>
            )}
          </nav>
          <div className="mt-auto flex justify-center p-4">
            <img
              alt="Flamingo"
              className="h-48 w-auto"
              height={192}
              src="/flamingo.svg"
              width={144}
            />
          </div>
        </SheetContent>
      </Sheet>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
