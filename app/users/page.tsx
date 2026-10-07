"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";

interface UserAccount {
  id: number;
  username: string;
  email: string;
  role: string;
  fullName: string;
  supplierId?: number | null;
  active?: boolean | null;
  mustChangePassword?: boolean | null;
  lastLoginAt?: string | null;
}

interface SupplierEntry { id: number; supplierCode: string; companyName: string }

// What an admin is about to do, waiting for confirmation.
type Pending =
  | { kind: "role"; user: UserAccount; role: string }
  | { kind: "active"; user: UserAccount }
  | { kind: "delete"; user: UserAccount };

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "SYSTEM_ADMIN", label: "System Admin" },
  { value: "EXECUTIVE_OWNER", label: "Owner" },
  { value: "ACCOUNTS_FINANCE_OFFICER", label: "Finance Officer" },
  { value: "SERVICE_CENTER_MANAGER", label: "Service Center Manager" },
  { value: "TECHNICIAN", label: "Technician" },
  { value: "FUEL_STATION_SUPERVISOR", label: "Fuel Supervisor" },
  { value: "FUEL_ATTENDANT", label: "Fuel Attendant" },
  { value: "INVENTORY_MANAGER", label: "Inventory Manager" },
  { value: "CUSTOMER_RELATIONS_OFFICER", label: "Customer Relations Officer" },
  { value: "CUSTOMER", label: "Customer" },
];
const SUPPLIER_LABEL = "Supplier";
// Only a Super Admin may grant these (the backend enforces it too).
const TOP_ROLES = new Set(["SUPER_ADMIN", "SYSTEM_ADMIN", "EXECUTIVE_OWNER"]);

const roleLabel = (role: string) => role === "SUPPLIER" ? SUPPLIER_LABEL : ROLES.find(r => r.value === role)?.label ?? `Unknown (${role})`;
const isKnownRole = (role: string) => role === "SUPPLIER" || ROLES.some(r => r.value === role);

function lastSeen(iso?: string | null) {
  if (!iso) return "Not recorded";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [suppliers, setSuppliers] = useState<Map<number, SupplierEntry>>(new Map());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [showInactive, setShowInactive] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Accounts plus the supplier companies (to name supplier portal logins).
  const load = () => Promise.allSettled([api.get<UserAccount[]>("/auth/all"), api.get<SupplierEntry[]>("/suppliers/directory")]);

  const apply = useCallback(([acc, sup]: Awaited<ReturnType<typeof load>>) => {
    if (acc.status === "fulfilled") {
      setUsers(acc.value.data);
      setLoadError("");
    } else {
      setLoadError(getErrorMessage(acc.reason, "Couldn't load the accounts."));
    }
    setSuppliers(sup.status === "fulfilled" ? new Map(sup.value.data.map((x) => [x.id, x])) : new Map());
  }, []);

  const fetchUsers = async () => apply(await load());

  useEffect(() => {
    let alive = true;
    load().then(r => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [apply]);

  const myRole = currentUser?.role ?? "";
  const isReadOnly = myRole === "EXECUTIVE_OWNER";
  const isSuperAdmin = myRole === "SUPER_ADMIN";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? [])
      .filter(u => roleFilter === "ALL" || u.role === roleFilter)
      .filter(u => showInactive || u.active !== false)
      .filter(u => !q || [u.fullName, u.username, u.email].some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName));
  }, [users, search, roleFilter, showInactive]);

  const roleCounts = useMemo(() => {
    const m = new Map<string, number>();
    (users ?? []).forEach(u => m.set(u.role, (m.get(u.role) ?? 0) + 1));
    return m;
  }, [users]);

  const confirm = async () => {
    if (!pending) return;
    setWorking(true);
    const u = pending.user;
    try {
      if (pending.kind === "role") {
        await api.put(`/auth/${u.id}/role`, {}, { params: { role: pending.role } });
        setNotice({ type: "ok", text: `${u.fullName} is now ${roleLabel(pending.role)}.` });
      } else if (pending.kind === "active") {
        const next = u.active === false;
        await api.put(`/auth/${u.id}/active`, {}, { params: { active: next } });
        setNotice({ type: "ok", text: next ? `${u.username} can sign in again.` : `${u.username} can no longer sign in, and any open session has ended.` });
      } else {
        await api.delete(`/auth/${u.id}`);
        setNotice({ type: "ok", text: `The account ${u.username} was deleted.` });
      }
      await fetchUsers();
    } catch (err) {
      setNotice({ type: "error", text: getErrorMessage(err, "That change couldn't be made.") });
    } finally {
      setWorking(false);
      setPending(null);
    }
  };

  // Staff pages are guarded by middleware too; this covers a role that reached the page some other way.
  if (currentUser && !["SUPER_ADMIN", "SYSTEM_ADMIN", "EXECUTIVE_OWNER"].includes(myRole)) {
    return <div className="p-12 text-center text-red-600 font-bold">Only administrators can open this page.</div>;
  }

  const inputClass = "px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:border-blue-500";

  return (
    <div className="p-4 md:p-8 min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">User accounts</h1>
          <p className="text-slate-500 font-medium mt-1">
            {isReadOnly ? "Everyone who can sign in, and their role (view only)." : "Change roles, block sign-in, or remove accounts that were never used."}
          </p>
        </div>

        {notice && (
          <div role="status" className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl text-sm font-bold border ${notice.type === "ok" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, username or email" aria-label="Search accounts"
            className={`${inputClass} flex-1 min-w-[220px]`} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role" className={inputClass}>
            <option value="ALL">All roles ({users?.length ?? 0})</option>
            {[...roleCounts.keys()].sort().map(r => <option key={r} value={r}>{roleLabel(r)} ({roleCounts.get(r)})</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 pb-2 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-4 h-4" /> Show deactivated
          </label>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          {loadError ? (
            <div className="p-10 text-center">
              <p className="text-sm font-bold text-red-600">{loadError}</p>
              <button onClick={fetchUsers} className="mt-3 px-4 py-2 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800">Try again</button>
            </div>
          ) : users === null ? (
            <div className="p-6 space-y-3" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="px-5 py-3">Person</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Last sign-in</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const isSelf = u.username === currentUser?.username;
                    const isTopLevel = u.role === "SUPER_ADMIN" || u.role === "EXECUTIVE_OWNER";
                    const isSupplierLogin = u.role === "SUPPLIER";
                    // A System Admin can't change another admin or grant top roles.
                    const outranked = !isSuperAdmin && TOP_ROLES.has(u.role);
                    const locked = isReadOnly || isSelf || isTopLevel || outranked;
                    const isDeactivated = u.active === false;
                    const company = u.supplierId != null ? suppliers.get(u.supplierId) : undefined;
                    const choices = ROLES.filter(r => isSuperAdmin || !TOP_ROLES.has(r.value));

                    return (
                      <tr key={u.id} className={`border-b border-slate-50 align-top ${isDeactivated ? "bg-slate-50/70 text-slate-500" : "hover:bg-slate-50/50"}`}>
                        <td className="px-5 py-3">
                          <Link href={isSelf ? "/profile" : `/profile/${encodeURIComponent(u.username)}`} className="font-bold text-slate-900 hover:text-blue-700 hover:underline">
                            {u.fullName}
                          </Link>
                          {isSelf && <span className="ml-1.5 text-xs font-bold text-blue-600">(you)</span>}
                          <div className="text-xs text-slate-500 font-mono">@{u.username}</div>
                          {isDeactivated && <div className="mt-0.5 text-[10px] font-black text-red-600 uppercase">Deactivated</div>}
                          {!isDeactivated && u.mustChangePassword && <div className="mt-0.5 text-[10px] font-black text-amber-700 uppercase">Temporary password, not changed yet</div>}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-600">{u.email}</td>
                        <td className="px-5 py-3">
                          {isSupplierLogin || locked ? (
                            <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${
                              !isKnownRole(u.role) ? "bg-red-50 text-red-700 border-red-200"
                              : isTopLevel || u.role === "SYSTEM_ADMIN" ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                              {roleLabel(u.role)}
                            </span>
                          ) : (
                            <select
                              aria-label={`Role for ${u.username}`}
                              value={isKnownRole(u.role) ? u.role : ""}
                              onChange={(e) => setPending({ kind: "role", user: u, role: e.target.value })}
                              className={`px-3 py-2 border rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer ${isKnownRole(u.role) ? "border-slate-200 bg-slate-50" : "border-red-300 bg-red-50 text-red-700"}`}>
                              {!isKnownRole(u.role) && <option value="" disabled>{roleLabel(u.role)}: choose a role</option>}
                              {choices.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          )}
                          {isSupplierLogin && (
                            <div className="mt-1 text-[11px] font-bold text-slate-500">
                              {company ? `${company.companyName} (${company.supplierCode})` : "No supplier company"} · managed on the Suppliers page
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">{lastSeen(u.lastLoginAt)}</td>
                        <td className="px-5 py-3">
                          {!isSupplierLogin && (
                            <div className="flex justify-end items-center gap-2">
                              <button onClick={() => setPending({ kind: "active", user: u })} disabled={locked}
                                title={locked ? "You can't change this account" : isDeactivated ? "Allow sign-in again" : "Block sign-in, keep the account and its history"}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed ${isDeactivated ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 text-slate-700 hover:border-red-200 hover:text-red-700"}`}>
                                {isDeactivated ? "Reactivate" : "Deactivate"}
                              </button>
                              <button onClick={() => setPending({ kind: "delete", user: u })} disabled={locked}
                                title={locked ? "You can't delete this account" : "Delete (only accounts with no records)"} aria-label={`Delete ${u.username}`}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">No accounts match.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="confirm-title"
          onKeyDown={e => { if (e.key === "Escape" && !working) setPending(null); }}>
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <h3 id="confirm-title" className="text-xl font-black text-slate-900 mb-2">
              {pending.kind === "role" ? "Change role?" : pending.kind === "delete" ? "Delete this account?" : pending.user.active === false ? "Reactivate account?" : "Deactivate account?"}
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              {pending.kind === "role" && <>
                <b>{pending.user.fullName}</b> (@{pending.user.username}) will change from <b>{roleLabel(pending.user.role)}</b> to <b>{roleLabel(pending.role)}</b>.
                Their pages and permissions change on their next request.
              </>}
              {pending.kind === "active" && (pending.user.active === false
                ? <><b>@{pending.user.username}</b> will be able to sign in again.</>
                : <><b>@{pending.user.username}</b> will be signed out and blocked from signing in. Their records are kept and you can reactivate them later.</>)}
              {pending.kind === "delete" && <>
                <b>@{pending.user.username}</b> will be removed permanently. This only works for accounts with no bookings, bills, shifts or other records -
                for anyone who has used the system, deactivate instead.
              </>}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPending(null)} disabled={working} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={confirm} disabled={working} autoFocus
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-60 ${pending.kind === "delete" || (pending.kind === "active" && pending.user.active !== false) ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-blue-700"}`}>
                {working ? "Saving..." : pending.kind === "role" ? "Change role" : pending.kind === "delete" ? "Delete" : pending.user.active === false ? "Reactivate" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
