import { AuthProvider, useAuth } from "@web/lib/auth";
import { Layout } from "@web/components/layout";
import { LoginPage } from "@web/pages/login";
import { Dashboard } from "@web/pages/dashboard";
import { ServerPage } from "@web/pages/server";
import { NodesPage } from "@web/pages/admin/nodes";
import { NodeDetailPage } from "@web/pages/admin/node-detail";
import { EggsPage } from "@web/pages/admin/eggs";
import { CreateServerPage } from "@web/pages/admin/create-server";

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary text-xl font-bold animate-pulse">Flamingo Panel</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Simple path-based routing
  const path = window.location.pathname;

  if (path.startsWith("/server/")) {
    const id = path.split("/server/")[1]?.split("/")[0] || "";
    return (
      <Layout>
        <ServerPage serverId={id} />
      </Layout>
    );
  }

  if (path.startsWith("/admin/nodes/")) {
    const nodeId = path.split("/admin/nodes/")[1]?.split("/")[0] || "";
    return (
      <Layout>
        <NodeDetailPage nodeId={nodeId} />
      </Layout>
    );
  }

  if (path === "/admin/nodes") {
    return (
      <Layout>
        <NodesPage />
      </Layout>
    );
  }

  if (path === "/admin/eggs") {
    return (
      <Layout>
        <EggsPage />
      </Layout>
    );
  }

  if (path === "/admin/create-server") {
    return (
      <Layout>
        <CreateServerPage />
      </Layout>
    );
  }

  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
