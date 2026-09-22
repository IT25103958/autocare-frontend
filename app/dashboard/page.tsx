"use client";

import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Import all the completed department dashboards
import ExecutiveDashboard from "./components/ExecutiveDashboard";
import FinanceDashboard from "./components/FinanceDashboard";
import InventoryDashboard from "./components/InventoryDashboard";
import WorkshopDashboard from "./components/WorkshopDashboard";
import FuelDashboard from "./components/FuelDashboard";
import CrmDashboard from "./components/CrmDashboard";
import TechnicianDashboard from "./components/TechnicianDashboard";
import SupplierDashboard from "./components/SupplierDashboard";

export default function MasterDashboard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Protect the route
  useEffect(() => {
    if (mounted && !isLoading && !user) {
      router.push("/login");
    }
  }, [mounted, isLoading, user, router]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-slate-400 font-bold text-sm tracking-widest uppercase">Authenticating Identity...</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">

      {/* 1. EXECUTIVE DASHBOARD */}
      {(user.role === "EXECUTIVE_OWNER" || user.role === "SUPER_ADMIN" || user.role === "SYSTEM_ADMIN") && (
        <ExecutiveDashboard userName={user.username} />
      )}

      {/* 2. FINANCE DASHBOARD */}
      {user.role === "ACCOUNTS_FINANCE_OFFICER" && (
        <FinanceDashboard userName={user.username} />
      )}

      {/* 3. INVENTORY DASHBOARD */}
      {user.role === "INVENTORY_MANAGER" && (
        <InventoryDashboard userName={user.username} />
      )}

      {/* 4. WORKSHOP DASHBOARD */}
      {user.role === "SERVICE_CENTER_MANAGER" && (
        <WorkshopDashboard userName={user.username} />
      )}

      {/* 5. FUEL DASHBOARD */}
      {user.role === "FUEL_STATION_SUPERVISOR" && (
        <FuelDashboard userName={user.username} />
      )}

      {/* 6. CRM DASHBOARD */}
      {user.role === "CUSTOMER_RELATIONS_OFFICER" && (
        <CrmDashboard userName={user.username} />
      )}

      {/* 7. TECHNICIAN DASHBOARD */}
      {user.role === "TECHNICIAN" && (
        <TechnicianDashboard />
      )}

      {/* 8. SUPPLIER DASHBOARD (NEW FIX) */}
      {user.role === "SUPPLIER" && (
        <SupplierDashboard />
      )}
    </div>
  );
}