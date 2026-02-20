import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "./api";

interface User {
  email: string;
  id: string;
  role: "admin" | "user";
  username: string;
}

interface AuthResponse {
  expires_at: number;
  refresh_token: string;
  session_token: string;
  user: User;
}

interface AuthContextType {
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string
  ) => Promise<void>;
  user: User | null;
}

const AuthContext = createContext<AuthContextType>(
  null as unknown as AuthContextType
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const tryRefresh = useCallback(async () => {
    const sessionToken = localStorage.getItem("session_token");
    const refreshToken = localStorage.getItem("refresh_token");
    if (!(sessionToken && refreshToken)) {
      return;
    }

    try {
      const res = await api.post<{
        session_token: string;
        refresh_token: string;
        expires_at: number;
      }>("/auth/refresh", {
        session_token: sessionToken,
        refresh_token: refreshToken,
      });
      localStorage.setItem("session_token", res.session_token);
      localStorage.setItem("refresh_token", res.refresh_token);
      const stored = localStorage.getItem("session");
      if (stored) {
        const session = JSON.parse(stored);
        session.expiresAt = res.expires_at;
        localStorage.setItem("session", JSON.stringify(session));
      }
    } catch {
      localStorage.clear();
      setUser(null);
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem("session");
    if (stored) {
      try {
        const { user: storedUser, expiresAt } = JSON.parse(stored);
        if (expiresAt > Date.now()) {
          setUser(storedUser);
        } else {
          tryRefresh();
        }
      } catch {
        localStorage.removeItem("session");
      }
    }
    setLoading(false);
  }, [tryRefresh]);

  // Auto-refresh before expiry
  useEffect(() => {
    const stored = localStorage.getItem("session");
    if (!stored) {
      return;
    }
    const { expiresAt } = JSON.parse(stored);
    const refreshIn = expiresAt - Date.now() - 5 * 60 * 1000;
    if (refreshIn <= 0) {
      return;
    }
    const timer = setTimeout(tryRefresh, refreshIn);
    return () => clearTimeout(timer);
  }, [tryRefresh]);

  const saveSession = (res: AuthResponse) => {
    localStorage.setItem("session_token", res.session_token);
    localStorage.setItem("refresh_token", res.refresh_token);
    localStorage.setItem(
      "session",
      JSON.stringify({ user: res.user, expiresAt: res.expires_at })
    );
    setUser(res.user);
  };

  const login = async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    saveSession(res);
  };

  const register = async (
    email: string,
    username: string,
    password: string
  ) => {
    const res = await api.post<AuthResponse>("/auth/register", {
      email,
      username,
      password,
    });
    saveSession(res);
  };

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Logout API call may fail if session is already expired; ignore
    }
    localStorage.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
