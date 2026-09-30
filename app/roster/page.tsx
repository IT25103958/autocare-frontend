"use client";

import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import WeekPlanner from "./_components/WeekPlanner";
import TodayBoard from "./_components/TodayBoard";
import LeaveReview from "./_components/LeaveReview";
import AttendanceLog from "./_components/AttendanceLog";
import MySchedule from "./_components/MySchedule";
import { Resources, StaffMember } from "./_components/roster";

// Roles that build the roster. The system admin controls every shift; the service
// center manager rosters technicians and the fuel supervisor fuel attendants —
// the backend scopes what each one can see and change.
const MANAGERS = ["SUPER_ADMIN", "SYSTEM_ADMIN", "SERVICE_CENTER_MANAGER", "FUEL_STATION_SUPERVISOR"];
// Finance (payroll) and the owner read the whole roster without changing it.
const READERS = [...MANAGERS, "ACCOUNTS_FINANCE_OFFICER", "EXECUTIVE_OWNER"];

const MANAGER_INTRO: Record<string, string> = {
  SERVICE_CENTER_MANAGER: "Plan workshop shifts, allocate service bays, track attendance and approve leave for your technicians.",
  FUEL_STATION_SUPERVISOR: "Plan forecourt shifts, allocate pumps, track attendance and approve leave for your fuel attendants.",
};
// Roles that work shifts themselves.
const ROSTERED = ["TECHNICIAN", "FUEL_ATTENDANT", "FUEL_STATION_SUPERVISOR", "SERVICE_CENTER_MANAGER",
  "ACCOUNTS_FINANCE_OFFICER", "INVENTORY_MANAGER", "CUSTOMER_RELATIONS_OFFICER"];

type Tab = "mine" | "today" | "week" | "leave" | "attendance";

export default function RosterPage() {
  const { user } = useAuth();
  const role = user?.role || "";
  const canManage = MANAGERS.includes(role);
  const canRead = READERS.includes(role);
  const hasOwnShifts = ROSTERED.includes(role);

  const tabs: { key: Tab; label: string }[] = [
    ...(canRead ? [{ key: "today" as Tab, label: "Today" }, { key: "week" as Tab, label: "Week Planner" }] : []),
    ...(canManage ? [{ key: "leave" as Tab, label: "Leave Requests" }] : []),
    ...(canRead ? [{ key: "attendance" as Tab, label: "Attendance" }] : []),
    ...(hasOwnShifts ? [{ key: "mine" as Tab, label: "My Shifts" }] : []),
  ];

  const [tab, setTab] = useState<Tab | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [resources, setResources] = useState<Resources | null>(null);

  useEffect(() => {
    if (!user) return;
    setTab(prev => prev ?? (canRead ? "today" : "mine"));
    api.get<Resources>("/roster/resources").then(res => setResources(res.data)).catch(() => setResources(null));
    if (canManage) api.get<StaffMember[]>("/roster/directory").then(res => setStaff(res.data)).catch(() => setStaff([]));
  }, [user]);

  if (!user || !tab) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {role === "SERVICE_CENTER_MANAGER" ? "Technician Roster" : role === "FUEL_STATION_SUPERVISOR" ? "Forecourt Roster" : canRead ? "Staff Roster" : "My Work Schedule"}
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            {canManage
              ? MANAGER_INTRO[role] ?? "Control every shift: plan the roster, allocate bays and pumps, track attendance and approve leave for all staff."
              : canRead
                ? "Read-only view of the roster and attendance for payroll."
                : `Welcome, ${user.fullName || user.username}. Acknowledge your shifts, clock in and out, and request leave.`}
          </p>
        </div>

        {tabs.length > 1 && (
          <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
            {tabs.map(t => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === "today" && <TodayBoard canManage={canManage} />}
        {tab === "week" && <WeekPlanner staff={staff} resources={resources} canManage={canManage} />}
        {tab === "leave" && <LeaveReview />}
        {tab === "attendance" && <AttendanceLog canManage={canManage} />}
        {tab === "mine" && <MySchedule username={user.username} />}
      </div>
    </div>
  );
}
