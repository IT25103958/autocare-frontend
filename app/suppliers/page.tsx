"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";

// ---------------------------------------------------------------------------
// Types (mirror SupplierDtos on the backend)
// ---------------------------------------------------------------------------
interface DirectoryEntry {
  id: number;
  supplierCode: string;
  companyName: string;
  categories: string[];
  status: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  notes?: string | null;
  paymentTermsDays: number;
  bankDetailsOnFile: boolean;
  activeLogins: number;
  createdAt: string;
  createdBy?: string | null;
  canManage: boolean;
  canChangeStatus: boolean;
}

// Finance-only full record (bank details).
interface SupplierRecord {
  id: number;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  paymentTermsDays: number;
  paymentDetailsSetBy?: string | null;
  paymentDetailsSetAt?: string | null;
}

interface SupplierFinancials {
  supplierId: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
  overdueInvoices: number;
  openOrdersValue: number;
  openOrders: number;
  pendingRefundCredit: number;
  netPayable: number;
}

interface FinancialsResponse {
  suppliers: SupplierFinancials[];
  otherPayees: { invoices: number; invoiced: number; outstanding: number; overdue: number };
  totalOutstanding: number;
  totalOverdue: number;
  totalOpenOrders: number;
  totalPendingRefundCredit: number;
}

interface Statement {
  invoices: { invoiceId: number; supplyCategory: string; totalInvoiceAmount: number; amountPaid: number; dueDate: string }[];
  fuelOrders: { id: number; fuelType: string; litersOrdered: number; totalExpectedValue: number; status: string; payableId?: number | null }[];
  partOrders: { id: number; partName: string; quantityRequested: number; totalExpectedValue: number; status: string }[];
  returns: { id: number; partName: string; quantity: number; totalValue: number; status: string; financialStatus: string }[];
}

interface LoginView {
  id: number;
  username: string;
  fullName: string;
  email: string;
  active: boolean;
  awaitingFirstLogin: boolean;
  lastLoginAt?: string | null;
}

interface LoginCredentials {
  login: LoginView;
  temporaryPassword: string;
  loginUrl: string;
}

// The one-time credentials dialog, plus the state of its "send by email" button.
type CredentialsDialog = LoginCredentials & {
  isReset: boolean;
  companyName: string;
  sending: boolean;
  sentTo: string | null;
  sendError: string;
};

type ProfileForm = {
  id: number | null;
  companyName: string;
  categories: string[];
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  notes: string;
};

const formatLKR = (n: number) => new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(n || 0);
const catLabel = (c: string) => (c === "FUEL" ? "Fuel" : c === "SPARE_PARTS" ? "Spare parts" : c);
const inputCls = "mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500";
const labelCls = "text-xs font-black text-slate-500 uppercase tracking-widest";

export default function SuppliersPage() {
  const { user } = useAuth();
  const role = user?.role;

  // Who onboards which suppliers — mirrors SupplierService.managedCategories().
  const managed: string[] = role === "SUPER_ADMIN" || role === "SYSTEM_ADMIN" ? ["FUEL", "SPARE_PARTS"]
    : role === "FUEL_STATION_SUPERVISOR" ? ["FUEL"]
    : role === "INVENTORY_MANAGER" ? ["SPARE_PARTS"]
    : [];
  const canOnboard = managed.length > 0;
  const isFinance = role === "ACCOUNTS_FINANCE_OFFICER" || role === "SUPER_ADMIN";
  const seesMoney = isFinance || role === "EXECUTIVE_OWNER";

  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [records, setRecords] = useState<Map<number, SupplierRecord>>(new Map());
  const [financials, setFinancials] = useState<FinancialsResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(
    role === "FUEL_STATION_SUPERVISOR" ? "FUEL" : role === "INVENTORY_MANAGER" ? "SPARE_PARTS" : "ALL");
  const [showSuspended, setShowSuspended] = useState(true);

  const [profile, setProfile] = useState<ProfileForm | null>(null);
  const [profileError, setProfileError] = useState("");
  const [saving, setSaving] = useState(false);

  const [statusModal, setStatusModal] = useState<{ supplier: DirectoryEntry; reason: string } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [logins, setLogins] = useState<LoginView[]>([]);
  const [loginForm, setLoginForm] = useState({ fullName: "", username: "", email: "" });
  const [loginError, setLoginError] = useState("");
  const [credentials, setCredentials] = useState<CredentialsDialog | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [payment, setPayment] = useState({ bankName: "", bankAccountNumber: "", paymentTermsDays: "30" });
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const flash = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4000);
  };

  const fetchAll = useCallback(async () => {
    if (!user) return;
    try {
      const dirRes = await api.get<DirectoryEntry[]>("/suppliers/directory");
      setDirectory(dirRes.data);
      setLoadError("");
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't load suppliers."));
      return;
    }
    if (seesMoney) {
      try {
        const [finRes, recRes] = await Promise.all([
          api.get<FinancialsResponse>("/suppliers/financials"),
          api.get<SupplierRecord[]>("/suppliers"),
        ]);
        setFinancials(finRes.data);
        setRecords(new Map(recRes.data.map((r) => [r.id, r])));
      } catch {
        setFinancials(null);
      }
    }
  }, [user, seesMoney]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const finById = useMemo(() => {
    const m = new Map<number, SupplierFinancials>();
    financials?.suppliers.forEach((f) => m.set(f.supplierId, f));
    return m;
  }, [financials]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return directory.filter((s) =>
      (!q || s.companyName.toLowerCase().includes(q) || (s.supplierCode ?? "").toLowerCase().includes(q))
      && (categoryFilter === "ALL" || s.categories.includes(categoryFilter))
      && (showSuspended || s.status === "ACTIVE"));
  }, [directory, search, categoryFilter, showSuspended]);

  const open = directory.find((s) => s.id === openId) ?? null;

  // ------------------------------------------------------------ profile form
  const openCreate = () => {
    setProfile({ id: null, companyName: "", categories: managed.length === 1 ? [...managed] : [], contactPerson: "", phone: "", email: "", address: "", taxId: "", notes: "" });
    setProfileError("");
  };
  const openEdit = (s: DirectoryEntry, addCategory?: string) => {
    const cats = addCategory && !s.categories.includes(addCategory) ? [...s.categories, addCategory] : [...s.categories];
    setProfile({
      id: s.id, companyName: s.companyName, categories: cats, contactPerson: s.contactPerson ?? "", phone: s.phone ?? "",
      email: s.email ?? "", address: s.address ?? "", taxId: s.taxId ?? "", notes: s.notes ?? "",
    });
    setProfileError("");
  };

  const saveProfile = async () => {
    if (!profile) return;
    if (!profile.companyName.trim()) { setProfileError("Company name is required."); return; }
    if (profile.categories.length === 0) { setProfileError("Select what the supplier is approved to supply."); return; }
    const body = { ...profile, id: undefined };
    setSaving(true);
    try {
      if (profile.id) await api.put(`/suppliers/${profile.id}`, body);
      else await api.post("/suppliers", body);
      flash("success", profile.id ? "Supplier updated." : "Supplier added. Next, create a portal login for them.");
      setProfile(null);
      fetchAll();
    } catch (err) {
      setProfileError(getErrorMessage(err, "Couldn't save the supplier."));
    } finally {
      setSaving(false);
    }
  };

  const saveStatus = async () => {
    if (!statusModal) return;
    const next = statusModal.supplier.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await api.put(`/suppliers/${statusModal.supplier.id}/status`, { status: next, reason: statusModal.reason });
      flash("success", `${statusModal.supplier.companyName} is now ${next.toLowerCase()}.`);
      setStatusModal(null);
      fetchAll();
    } catch (err) {
      flash("error", getErrorMessage(err, "Couldn't change the status."));
    }
  };

  // ------------------------------------------------------------ detail drawer
  const loadDetail = useCallback(async (s: DirectoryEntry) => {
    try {
      const [loginRes, stRes] = await Promise.all([
        api.get<LoginView[]>(`/suppliers/${s.id}/logins`),
        seesMoney ? api.get<Statement>(`/suppliers/${s.id}/statement`) : Promise.resolve(null),
      ]);
      setLogins(loginRes.data);
      setStatement(stRes ? stRes.data : null);
    } catch (err) {
      flash("error", getErrorMessage(err, "Couldn't load supplier details."));
    }
  }, [seesMoney]);

  const openDetail = (s: DirectoryEntry) => {
    setOpenId(s.id);
    setLogins([]);
    setStatement(null);
    setLoginForm({ fullName: s.contactPerson ?? "", username: "", email: s.email ?? "" });
    setLoginError("");
    const rec = records.get(s.id);
    setPayment({ bankName: rec?.bankName ?? "", bankAccountNumber: rec?.bankAccountNumber ?? "", paymentTermsDays: String(rec?.paymentTermsDays ?? s.paymentTermsDays ?? 30) });
    loadDetail(s);
  };

  const createLogin = async () => {
    if (!open) return;
    setLoginError("");
    try {
      const res = await api.post<LoginCredentials>(`/suppliers/${open.id}/logins`, loginForm);
      setCredentials({ ...res.data, isReset: false, companyName: open.companyName, sending: false, sentTo: null, sendError: "" });
      setShowPreview(false);
      setLoginForm({ fullName: "", username: "", email: "" });
      loadDetail(open);
      fetchAll();
    } catch (err) {
      setLoginError(getErrorMessage(err, "Couldn't create the login."));
    }
  };

  const resetPassword = async (l: LoginView) => {
    if (!open) return;
    try {
      const res = await api.post<LoginCredentials>(`/suppliers/logins/${l.id}/reset-password`);
      setCredentials({ ...res.data, isReset: true, companyName: open.companyName, sending: false, sentTo: null, sendError: "" });
      setShowPreview(false);
      loadDetail(open);
    } catch (err) {
      flash("error", getErrorMessage(err, "Couldn't reset the password."));
    }
  };

  // "Send login details by email": the server re-checks the temporary
  // password against the account before emailing it.
  const emailCredentials = async () => {
    if (!credentials) return;
    setCredentials({ ...credentials, sending: true, sendError: "" });
    try {
      const res = await api.post<{ sentTo: string }>(`/suppliers/logins/${credentials.login.id}/email-credentials`, {
        temporaryPassword: credentials.temporaryPassword, isReset: credentials.isReset,
      });
      setCredentials((c) => (c ? { ...c, sending: false, sentTo: res.data.sentTo } : c));
    } catch (err) {
      setCredentials((c) => (c ? { ...c, sending: false, sendError: getErrorMessage(err, "The email could not be sent.") } : c));
    }
  };

  const toggleLogin = async (l: LoginView) => {
    if (!open) return;
    try {
      await api.put(`/suppliers/logins/${l.id}/active`, { active: !l.active });
      flash("success", `${l.username} ${l.active ? "deactivated" : "reactivated"}.`);
      loadDetail(open);
      fetchAll();
    } catch (err) {
      flash("error", getErrorMessage(err, "Couldn't update the login."));
    }
  };

  const savePayment = async () => {
    if (!open) return;
    try {
      await api.put(`/suppliers/${open.id}/payment-details`, {
        bankName: payment.bankName, bankAccountNumber: payment.bankAccountNumber, paymentTermsDays: Number(payment.paymentTermsDays) || 0,
      });
      flash("success", "Payment details saved.");
      fetchAll();
    } catch (err) {
      flash("error", getErrorMessage(err, "Couldn't save payment details."));
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const pageTitle = role === "FUEL_STATION_SUPERVISOR" ? "Fuel Suppliers" : role === "INVENTORY_MANAGER" ? "Parts Suppliers" : "Suppliers";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">{pageTitle}</h1>
            <p className="text-slate-500 font-medium mt-2">
              {canOnboard && !isFinance && "Add suppliers you order from, keep their details current, and give their staff portal logins."}
              {isFinance && "Every supplier's balance and payment details. Suppliers are added by the fuel supervisor (fuel) and inventory manager (parts)."}
              {role === "EXECUTIVE_OWNER" && "Read-only view of suppliers and what we owe them."}
            </p>
          </div>
          {canOnboard && (
            <button onClick={openCreate} className="px-6 py-3 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg">
              + Add Supplier
            </button>
          )}
        </div>

        {loadError && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-700">{loadError}</div>}

        {/* KPI ROW (Finance / owner) */}
        {financials && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 text-white p-5 rounded-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Payable</p>
              <p className="text-2xl font-black mt-1">{formatLKR(financials.totalOutstanding)}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">Suppliers + other payees</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-red-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Overdue</p>
              <p className="text-2xl font-black text-red-700 mt-1">{formatLKR(financials.totalOverdue)}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Open Orders</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{formatLKR(financials.totalOpenOrders)}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">Ordered, not yet billed</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-amber-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Refund Credit Due to Us</p>
              <p className="text-2xl font-black text-amber-700 mt-1">{formatLKR(financials.totalPendingRefundCredit)}</p>
            </div>
          </div>
        )}

        {/* FILTERS */}
        <div className="flex flex-wrap items-center gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code..."
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold outline-none focus:border-blue-500 w-64" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold">
            <option value="ALL">All categories</option>
            <option value="FUEL">Fuel</option>
            <option value="SPARE_PARTS">Spare parts</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <input type="checkbox" checked={showSuspended} onChange={(e) => setShowSuspended(e.target.checked)} /> Show suspended
          </label>
          {canOnboard && categoryFilter !== "ALL" && (
            <span className="text-[11px] font-bold text-slate-400">Company already supplies another area? Switch to &quot;All categories&quot; and add yours to it.</span>
          )}
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-4">Supplier</th>
                  <th className="px-6 py-4">Supplies</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4 text-center">Portal Logins</th>
                  {financials && <>
                    <th className="px-6 py-4 text-right">Outstanding</th>
                    <th className="px-6 py-4 text-right">Overdue</th>
                    <th className="px-6 py-4 text-right">Open Orders</th>
                    <th className="px-6 py-4 text-right">Net Payable</th>
                  </>}
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                {rows.map((s) => {
                  const f = finById.get(s.id);
                  const addable = managed.filter((c) => !s.categories.includes(c));
                  return (
                    <tr key={s.id} className={s.status !== "ACTIVE" ? "bg-slate-50/70" : "hover:bg-slate-50/50"}>
                      <td className="px-6 py-4">
                        <p className="font-black text-slate-900">{s.companyName}</p>
                        <p className="text-[10px] font-mono text-slate-400">
                          {s.supplierCode}
                          {s.status !== "ACTIVE" && <span className="ml-1 font-sans font-black text-red-600 uppercase">Suspended</span>}
                          {seesMoney && !s.bankDetailsOnFile && <span className="ml-1 font-sans font-black text-amber-600 uppercase">No bank details</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {s.categories.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600">{catLabel(c)}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <p className="font-bold text-slate-700">{s.contactPerson || "—"}</p>
                        <p className="text-slate-400">{s.phone || s.email || ""}</p>
                      </td>
                      <td className="px-6 py-4 text-center font-black">{s.activeLogins}</td>
                      {financials && <>
                        <td className="px-6 py-4 text-right font-black text-slate-900">{f ? formatLKR(f.outstanding) : "—"}</td>
                        <td className={`px-6 py-4 text-right font-bold ${f && f.overdue > 0 ? "text-red-600" : "text-slate-400"}`}>{f ? formatLKR(f.overdue) : "—"}</td>
                        <td className="px-6 py-4 text-right text-slate-600">{f ? formatLKR(f.openOrdersValue) : "—"}</td>
                        <td className="px-6 py-4 text-right font-black">
                          {f ? formatLKR(f.netPayable) : "—"}
                          {f && f.pendingRefundCredit > 0 && <span className="block text-[10px] font-bold text-amber-600">after {formatLKR(f.pendingRefundCredit)} credit</span>}
                        </td>
                      </>}
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openDetail(s)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">Open</button>
                          {s.canManage && (
                            <button onClick={() => openEdit(s)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest">Edit</button>
                          )}
                          {!s.canManage && addable.length > 0 && (
                            <button onClick={() => openEdit(s, addable[0])} className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 text-[10px] font-black uppercase tracking-widest">
                              + {catLabel(addable[0])}
                            </button>
                          )}
                          {s.canChangeStatus && (
                            <button onClick={() => setStatusModal({ supplier: s, reason: "" })} className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest ${s.status === "ACTIVE" ? "border-red-200 text-red-600" : "border-emerald-200 text-emerald-700"}`}>
                              {s.status === "ACTIVE" ? "Suspend" : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {financials && financials.otherPayees.invoices > 0 && categoryFilter === "ALL" && !search && (
                  <tr className="bg-slate-50">
                    <td className="px-6 py-4" colSpan={4}>
                      <p className="font-black text-slate-700">Other payees</p>
                      <p className="text-[10px] font-bold text-slate-400">{financials.otherPayees.invoices} bills from payees that aren&apos;t registered suppliers (utilities etc.)</p>
                    </td>
                    <td className="px-6 py-4 text-right font-black">{formatLKR(financials.otherPayees.outstanding)}</td>
                    <td className={`px-6 py-4 text-right font-bold ${financials.otherPayees.overdue > 0 ? "text-red-600" : "text-slate-400"}`}>{formatLKR(financials.otherPayees.overdue)}</td>
                    <td colSpan={3}></td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr><td colSpan={financials ? 9 : 5} className="px-6 py-12 text-center text-slate-400">No suppliers match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[130] px-5 py-3 rounded-xl shadow-xl text-sm font-bold ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.text}
        </div>
      )}

      {/* ADD / EDIT PROFILE */}
      {profile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-slate-900 mb-6">{profile.id ? "Edit Supplier" : "Add Supplier"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className={`md:col-span-2 ${labelCls}`}>
                Company name
                <input value={profile.companyName} onChange={(e) => setProfile({ ...profile, companyName: e.target.value })} className={inputCls} />
              </label>
              <div className="md:col-span-2">
                <p className={`${labelCls} mb-2`}>Approved to supply</p>
                <div className="flex gap-4">
                  {["FUEL", "SPARE_PARTS"].map((c) => {
                    const mine = managed.includes(c);
                    return (
                      <label key={c} className={`flex items-center gap-2 text-sm font-bold ${mine ? "" : "text-slate-400"}`}>
                        <input type="checkbox" disabled={!mine} checked={profile.categories.includes(c)}
                          onChange={(e) => setProfile({ ...profile, categories: e.target.checked ? [...profile.categories, c] : profile.categories.filter((x) => x !== c) })} />
                        {catLabel(c)}{!mine && " (managed by another team)"}
                      </label>
                    );
                  })}
                </div>
              </div>
              {([["contactPerson", "Contact person"], ["phone", "Phone"], ["email", "Email"], ["taxId", "VAT / TIN number"]] as [keyof ProfileForm, string][]).map(([key, label]) => (
                <label key={key} className={labelCls}>
                  {label}
                  <input value={String(profile[key] ?? "")} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} className={inputCls} />
                </label>
              ))}
              <label className={`md:col-span-2 ${labelCls}`}>
                Address
                <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className={inputCls} />
              </label>
              <label className={`md:col-span-2 ${labelCls}`}>
                Notes (internal)
                <textarea rows={2} value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} className={inputCls} />
              </label>
            </div>
            <p className="text-[11px] font-bold text-slate-400 mt-4">Bank details and payment terms are set by Finance.</p>
            {profileError && <p className="text-xs font-bold text-red-600 mt-3">{profileError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setProfile(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100">Cancel</button>
              <button onClick={saveProfile} disabled={saving} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-slate-900 hover:bg-blue-600 disabled:opacity-60">
                {saving ? "Saving..." : "Save Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUSPEND / ACTIVATE */}
      {statusModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-black text-slate-900 mb-2">
              {statusModal.supplier.status === "ACTIVE" ? "Suspend" : "Re-activate"} {statusModal.supplier.companyName}?
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {statusModal.supplier.status === "ACTIVE"
                ? "A suspended supplier can't receive new orders. Existing orders, bills, returns and portal logins are unaffected."
                : "The supplier will appear again in ordering screens."}
            </p>
            <label className={`block ${labelCls} mb-1`}>Reason</label>
            <textarea rows={2} value={statusModal.reason} onChange={(e) => setStatusModal({ ...statusModal, reason: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm mb-6" />
            <div className="flex gap-3">
              <button onClick={() => setStatusModal(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100">Back</button>
              <button onClick={saveStatus} disabled={statusModal.reason.trim().length < 5} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-slate-900 disabled:opacity-50">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* CREDENTIALS — shown once, with an optional email to the supplier */}
      {credentials && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto">
            <h3 className="text-xl font-black text-slate-900 mb-1">{credentials.isReset ? "Password Reset" : "Portal Login Created"}</h3>
            <p className="text-sm text-slate-500 mb-5">
              {credentials.login.fullName} · {credentials.companyName}
            </p>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-sm font-mono">
              <p><span className="text-slate-400">Sign in at:</span> {credentials.loginUrl}</p>
              <p><span className="text-slate-400">Username:</span> {credentials.login.username}</p>
              <p><span className="text-slate-400">Temporary password:</span> <span className="font-black text-slate-900">{credentials.temporaryPassword}</span></p>
            </div>
            <p className="text-[11px] font-bold text-amber-700 mt-3">
              Shown only once. The supplier must choose their own password when they first sign in.
            </p>

            {/* SEND BY EMAIL */}
            <div className="mt-6 p-4 rounded-2xl border border-blue-100 bg-blue-50/50">
              {credentials.sentTo ? (
                <p className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                  Login details emailed to {credentials.sentTo}
                </p>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-800">Send these details to {credentials.login.email}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    A branded {credentials.isReset ? "password-reset" : "welcome"} email from Lanka Auto Care with the sign-in link, username and temporary password.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={emailCredentials} disabled={credentials.sending}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      {credentials.sending ? "Sending..." : "Send Login Details by Email"}
                    </button>
                    <button onClick={() => setShowPreview((v) => !v)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600">
                      {showPreview ? "Hide preview" : "Preview email"}
                    </button>
                  </div>
                  {credentials.sendError && <p className="text-xs font-bold text-red-600 mt-2">{credentials.sendError}</p>}
                </>
              )}

              {showPreview && !credentials.sentTo && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white overflow-hidden text-[13px] leading-relaxed">
                  <div className="bg-slate-900 text-white px-4 py-2.5">
                    <p className="font-bold">Lanka Auto Care</p>
                    <p className="text-[10px] text-slate-400">Vehicle Service &amp; Fuel Station</p>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-slate-700">
                    <p className="text-[11px] text-slate-400">
                      Subject: {credentials.isReset ? "Lanka Auto Care supplier portal: your password has been reset" : "Welcome to the Lanka Auto Care supplier portal"}
                    </p>
                    <p>Dear {credentials.login.fullName},</p>
                    <p>
                      {credentials.isReset
                        ? "Your Lanka Auto Care supplier portal password has been reset at your request. Use the temporary password below to sign in."
                        : <>A supplier portal account has been created for you on behalf of <strong>{credentials.companyName}</strong>. Through the portal you can view purchase orders, confirm dispatches and prices, handle warranty returns and see the status of payments due to your company.</>}
                    </p>
                    <p className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg p-2">
                      Username: {credentials.login.username}<br />Temporary password: {credentials.temporaryPassword}
                    </p>
                    <p>For your security, you will be asked to choose your own password the first time you sign in.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => navigator.clipboard?.writeText(`Sign in: ${credentials.loginUrl}\nUsername: ${credentials.login.username}\nTemporary password: ${credentials.temporaryPassword}`)}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-700 bg-slate-100">Copy</button>
              <button onClick={() => { setCredentials(null); setShowPreview(false); }} className="flex-1 px-4 py-3 rounded-xl font-black text-white bg-slate-900">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL DRAWER */}
      {open && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpenId(null)}>
          <div className="bg-white w-full max-w-3xl h-full overflow-y-auto p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900">{open.companyName}</h3>
                <p className="text-xs font-mono text-slate-400">
                  {open.supplierCode} · {open.categories.map(catLabel).join(", ")} · added by {open.createdBy ?? "—"}
                </p>
              </div>
              <button onClick={() => setOpenId(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-black uppercase">Close</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p><span className="text-slate-400 font-bold">Contact:</span> {open.contactPerson || "—"}</p>
              <p><span className="text-slate-400 font-bold">Phone:</span> {open.phone || "—"}</p>
              <p><span className="text-slate-400 font-bold">Email:</span> {open.email || "—"}</p>
              <p><span className="text-slate-400 font-bold">VAT/TIN:</span> {open.taxId || "—"}</p>
              <p className="col-span-2"><span className="text-slate-400 font-bold">Address:</span> {open.address || "—"}</p>
              {open.notes && <p className="col-span-2"><span className="text-slate-400 font-bold">Notes:</span> {open.notes}</p>}
            </div>

            {/* PAYMENT DETAILS */}
            <div className="mb-8">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Payment Details</h4>
              {isFinance ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <label className={labelCls}>Bank<input value={payment.bankName} onChange={(e) => setPayment({ ...payment, bankName: e.target.value })} className={inputCls} /></label>
                  <label className={labelCls}>Account number<input value={payment.bankAccountNumber} onChange={(e) => setPayment({ ...payment, bankAccountNumber: e.target.value })} className={inputCls} /></label>
                  <label className={labelCls}>Terms (days)<input type="number" value={payment.paymentTermsDays} onChange={(e) => setPayment({ ...payment, paymentTermsDays: e.target.value })} className={inputCls} /></label>
                  <div className="md:col-span-3 flex justify-between items-center">
                    <p className="text-[11px] font-bold text-slate-400">
                      {records.get(open.id)?.paymentDetailsSetBy
                        ? `Last set by ${records.get(open.id)?.paymentDetailsSetBy} on ${new Date(records.get(open.id)!.paymentDetailsSetAt!).toLocaleDateString()}. Changes are audit-logged.`
                        : "Not set yet. Changes are audit-logged."}
                    </p>
                    <button onClick={savePayment} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-black uppercase">Save</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  {open.paymentTermsDays}-day terms · {open.bankDetailsOnFile ? "bank details on file" : "no bank details yet"}
                  <span className="block text-[11px] text-slate-400">Managed by Finance.</span>
                </p>
              )}
            </div>

            {/* PORTAL LOGINS */}
            <div className="mb-8">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Portal Logins</h4>
              {logins.map((l) => (
                <div key={l.id} className="flex flex-wrap justify-between items-center gap-2 py-2.5 border-b border-slate-100 text-sm">
                  <div>
                    <span className="font-bold">{l.fullName}</span> <span className="text-slate-400">@{l.username} · {l.email}</span>
                    <span className="block text-[10px] font-bold">
                      {!l.active ? <span className="text-red-600">DEACTIVATED</span>
                        : l.awaitingFirstLogin ? <span className="text-amber-600">Hasn&apos;t signed in yet (temporary password)</span>
                        : <span className="text-slate-400">Last sign-in {l.lastLoginAt ? new Date(l.lastLoginAt).toLocaleString() : "—"}</span>}
                    </span>
                  </div>
                  {open.canManage && (
                    <div className="flex gap-2">
                      {l.active && <button onClick={() => resetPassword(l)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase">Reset password</button>}
                      <button onClick={() => toggleLogin(l)} className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase ${l.active ? "border-red-200 text-red-600" : "border-emerald-200 text-emerald-700"}`}>
                        {l.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {logins.length === 0 && <p className="text-xs font-bold text-slate-400">No logins yet. This supplier can&apos;t use the portal.</p>}

              {open.canManage && (
                <div className="mt-4 p-4 rounded-2xl border border-slate-200">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Create a login for someone at {open.companyName}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className={labelCls}>Full name<input value={loginForm.fullName} onChange={(e) => setLoginForm({ ...loginForm, fullName: e.target.value })} className={inputCls} /></label>
                    <label className={labelCls}>Username<input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} className={inputCls} /></label>
                    <label className={labelCls}>Email<input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className={inputCls} /></label>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">A temporary password is generated. You can then email it to them from the next screen. They must replace it when they first sign in.</p>
                  {loginError && <p className="text-xs font-bold text-red-600 mt-2">{loginError}</p>}
                  <button onClick={createLogin} className="mt-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-black uppercase">Create Login</button>
                </div>
              )}
            </div>

            {/* STATEMENT (Finance / owner) */}
            {statement && (
              <>
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Bills</h4>
                <table className="w-full text-sm mb-6">
                  <tbody className="divide-y divide-slate-100">
                    {statement.invoices.map((i) => {
                      const bal = i.totalInvoiceAmount - i.amountPaid;
                      return (
                        <tr key={i.invoiceId}>
                          <td className="py-2 font-bold">#{i.invoiceId} <span className="text-[10px] text-slate-400">{i.supplyCategory.replace("_", " ")}</span></td>
                          <td className={`py-2 text-xs font-bold ${bal > 0.005 && i.dueDate < today ? "text-red-600" : "text-slate-500"}`}>Due {i.dueDate}</td>
                          <td className="py-2 text-right">{formatLKR(i.totalInvoiceAmount)}</td>
                          <td className="py-2 text-right font-black">{bal > 0.005 ? formatLKR(bal) : <span className="text-emerald-600 text-xs">PAID</span>}</td>
                        </tr>
                      );
                    })}
                    {statement.invoices.length === 0 && <tr><td className="py-3 text-slate-400 text-xs">No bills.</td></tr>}
                  </tbody>
                </table>

                <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Orders</h4>
                <table className="w-full text-sm mb-6">
                  <tbody className="divide-y divide-slate-100">
                    {statement.fuelOrders.map((o) => (
                      <tr key={`f${o.id}`}>
                        <td className="py-2 font-mono text-xs">FD-{String(o.id).padStart(5, "0")}</td>
                        <td className="py-2">{o.fuelType} x{o.litersOrdered}L</td>
                        <td className="py-2 text-right">{formatLKR(o.totalExpectedValue)}</td>
                        <td className="py-2 text-right text-[10px] font-black uppercase">{o.status}{o.payableId ? ` · bill #${o.payableId}` : ""}</td>
                      </tr>
                    ))}
                    {statement.partOrders.map((o) => (
                      <tr key={`p${o.id}`}>
                        <td className="py-2 font-mono text-xs">PO-{String(o.id).padStart(4, "0")}</td>
                        <td className="py-2">{o.partName} x{o.quantityRequested}</td>
                        <td className="py-2 text-right">{formatLKR(o.totalExpectedValue)}</td>
                        <td className="py-2 text-right text-[10px] font-black uppercase">{o.status.replace("_", " ")}</td>
                      </tr>
                    ))}
                    {statement.fuelOrders.length + statement.partOrders.length === 0 && <tr><td className="py-3 text-slate-400 text-xs">No orders.</td></tr>}
                  </tbody>
                </table>

                <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">Returns (RMA)</h4>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {statement.returns.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-mono text-xs">RMA-{String(r.id).padStart(4, "0")}</td>
                        <td className="py-2">{r.partName} x{r.quantity}</td>
                        <td className="py-2 text-right">{formatLKR(r.totalValue)}</td>
                        <td className="py-2 text-right text-[10px] font-black uppercase">{r.status.replace(/_/g, " ")} · {r.financialStatus}</td>
                      </tr>
                    ))}
                    {statement.returns.length === 0 && <tr><td className="py-3 text-slate-400 text-xs">No returns.</td></tr>}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
