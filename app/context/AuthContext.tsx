"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearStoredSession } from "../../utils/axiosInstance";

// Enforce strict architecture roles in the frontend
export type AppRole =
  | "SUPER_ADMIN"
  | "EXECUTIVE_OWNER"
  | "SYSTEM_ADMIN"
  | "CUSTOMER_RELATIONS_OFFICER"
  | "INVENTORY_MANAGER"
  | "SERVICE_CENTER_MANAGER"
  | "FUEL_STATION_SUPERVISOR"
  | "FUEL_ATTENDANT"
  | "ACCOUNTS_FINANCE_OFFICER"
  | "TECHNICIAN"
  | "SUPPLIER"
  | "CUSTOMER";

interface User {
  token: string;
  username: string;
  role: AppRole;
  fullName: string;
  // True after a temporary password was issued (new supplier login or a
  // reset). The app sends the user to /change-password until it's changed.
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  // True until the saved session has been read from localStorage.
  isLoading: boolean;
  login: (userData: User) => void;
  logout: () => void;
  markPasswordChanged: () => void;
  // Keep the stored session in step after the user edits their own details.
  updateUser: (changes: Partial<Pick<User, "fullName">>) => void;
}

// True when the JWT's own expiry time (exp, in seconds) has passed, or it can't be read.
function tokenExpired(token: string): boolean {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(part)) as { exp?: number };
    return typeof exp === "number" && exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

// The saved session, or null when there is none, it is unreadable or its token has expired.
function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem("authUser");
    if (!raw) return null;
    const stored = JSON.parse(raw) as User;
    if (!stored?.token || tokenExpired(stored.token)) {
      clearStoredSession();
      return null;
    }
    return stored;
  } catch {
    clearStoredSession();
    return null;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // localStorage only exists in the browser, so the session is read after the first
  // render (reading it during render would make the server and browser HTML differ).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of browser storage after hydration */
    setUser(readStoredUser());
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem("authUser", JSON.stringify(userData));
    localStorage.setItem("jwtToken", userData.token);

    document.cookie = `jwtToken=${userData.token}; path=/; max-age=86400; SameSite=Strict`;
    document.cookie = `userRole=${userData.role}; path=/; max-age=86400; SameSite=Strict`;
  };

  const markPasswordChanged = () => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, mustChangePassword: false };
      localStorage.setItem("authUser", JSON.stringify(next));
      return next;
    });
  };

  const updateUser = (changes: Partial<Pick<User, "fullName">>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...changes };
      localStorage.setItem("authUser", JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setUser(null);
    clearStoredSession();

    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, markPasswordChanged, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};