import { AuthProvider, useAuth } from "@web/lib/auth";
import { Layout } from "@web/components/layout";
import { LoginPage } from "@web/pages/login";
import { Dashboard } from "@web/pages/dashboard";
import { ServerPage } from "@web/pages/server";

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
