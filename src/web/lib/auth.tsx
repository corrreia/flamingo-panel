import { createContext, type ReactNode, useCallback, useContext } from "react";
import { authClient, useSession } from "./auth-client";

interface User {
  email: string;
  id: string;
  image?: string | null;
  name: string;
  role: "admin" | "user";
  username: string;
}

interface AuthContextType {
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  user: User | null;
}

const AuthContext = createContext<AuthContextType>(
  null as unknown as AuthContextType
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  const user: User | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        role:
          ((session.user as Record<string, unknown>).role as string) === "admin"
            ? "admin"
            : "user",
        username:
          ((session.user as Record<string, unknown>).username as string) || "",
      }
    : null;

  const login = useCallback(() => {
    authClient.signIn.oauth2({
      providerId: "pocket-id",
      callbackURL: "/",
    });
  }, []);

  const logout = useCallback(async () => {
    await authClient.signOut();
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading: isPending, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
