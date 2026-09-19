"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";

// Enforce strict architecture roles in the frontend
export type AppRole =
  | "SUPER_ADMIN"
  | "EXECUTIVE_OWNER"
  | "SYSTEM_ADMIN"
  | "CUSTOMER_RELATIONS_OFFICER"
  | "INVENTORY_MANAGER"
  | "SERVICE_CENTER_MANAGER"
  | "FUEL_STATION_SUPERVISOR"
  | "ACCOUNTS_FINANCE_OFFICER"
  | "TECHNICIAN"
  | "SUPPLIER"
  | "CUSTOMER";

interface User {
  token: string;
  username: string;
  role: AppRole;
  fullName: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem("authUser");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem("authUser", JSON.stringify(userData));
    localStorage.setItem("jwtToken", userData.token);

    document.cookie = `jwtToken=${userData.token}; path=/; max-age=86400; SameSite=Strict`;
    document.cookie = `userRole=${userData.role}; path=/; max-age=86400; SameSite=Strict`;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("authUser");
    localStorage.removeItem("jwtToken");

    document.cookie = "jwtToken=; path=/; max-age=0; SameSite=Strict";
    document.cookie = "userRole=; path=/; max-age=0; SameSite=Strict";

    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
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