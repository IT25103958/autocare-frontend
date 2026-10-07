"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";
import { getErrorMessage } from "../../../utils/apiError";
import { fullNameProblem, phoneProblem } from "../../../utils/signupRules";
import { useAuth } from "../../context/AuthContext";
import { downloadCsv, downloadReceipt, fmtDay, fmtWhen, inputClass, lkr } from "../../billing/_components/billing";

// ---------------------------------------------------------------------------
// One profile page for every kind of user. The header and contact details are
// the same for all; the rest depends on the role: a customer sees vehicles,
// spending and payment history, staff see shifts and pay, a supplier their
// company. Opened for yourself (editable) or, by an administrator, for anyone.
// ---------------------------------------------------------------------------

interface Account {
  username: string;
  fullName: string;
  email: string;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  role: string;
  active: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
}

interface PaymentRow {
  paymentId: number;
  receiptNumber: string;
  paidAt: string;
  invoiceId: number;
  invoiceNumber: string;
  description: string;
  method: string;
  amount: number;
}

interface Vehicle { regNo: string; primary: boolean; visits: number; lastService: string | null; lastServiceName: string | null }

interface CustomerSection {
  hasProfile: boolean;
  memberSince: string | null;
  contactNumber: string | null;
  membershipTier: string | null;
  loyaltyPoints: number;
  lifetimePoints: number;
  nextTier: string | null;
  pointsToNextTier: number | null;
  totalPaid: number;
  outstanding: number;
  unpaidInvoices: number;
  servicesCompleted: number;
  upcomingBookings: number;
  fuelPurchases: number;
  fuelSpend: number;
  vehicles: Vehicle[];
  payments: PaymentRow[];
}

interface StaffSection {
  payslipCount: number;
  totalPaid: number;
  payslips: { salaryId: number; month: string; paymentDate: string; hoursWorked: number; totalSalary: number }[];
  upcomingShifts: { shiftDate: string; shiftType: string; assignment: string | null; status: string }[];
  shiftsThisMonth: number;
  lateThisMonth: number;
  activeJobs?: number;
  completedJobs?: number;
}

interface SupplierSection {
  companyName?: string;
  supplierCode?: string;
  categories?: string[];
  status?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTermsDays?: number | null;
}

interface Profile {
  account: Account;
  customer?: CustomerSection;
  staff?: StaffSection;
  supplier?: SupplierSection;
  activity: { action: string; description: string; timestamp: string }[];
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Administrator",
  SYSTEM_ADMIN: "System Administrator",
  EXECUTIVE_OWNER: "Executive Owner",
  ACCOUNTS_FINANCE_OFFICER: "Accounts & Finance Officer",
  SERVICE_CENTER_MANAGER: "Service Center Manager",
  INVENTORY_MANAGER: "Inventory Manager",
  CUSTOMER_RELATIONS_OFFICER: "Customer Relations Officer",
  FUEL_STATION_SUPERVISOR: "Fuel Station Supervisor",
  FUEL_ATTENDANT: "Fuel Attendant",
  TECHNICIAN: "Service Technician",
  SUPPLIER: "Supplier",
  CUSTOMER: "Customer",
};

const TIER_STYLE: Record<string, string> = {
  BRONZE: "from-amber-700 to-orange-800",
  SILVER: "from-slate-400 to-slate-600",
  GOLD: "from-yellow-500 to-amber-600",
  PLATINUM: "from-indigo-500 to-sky-600",
};

const ICON = {
  mail: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  pin: "M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  key: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
  car: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
};

const Glyph = ({ d, className = "w-4 h-4" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

// Activity entries shown before "Show all".
const ACTIVITY_SHOWN = 4;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";
const titleCase = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-black text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Detail({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 flex items-center justify-center"><Glyph d={icon} /></span>
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <span className="block text-sm font-semibold text-slate-900 break-words">{value || <span className="font-medium text-slate-400">Not provided</span>}</span>
      </span>
    </li>
  );
}

function Stat({ label, value, sub, tone = "text-slate-900" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums tracking-tight ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>}
    </div>
  );
}

export default function ProfileView({ username }: { username?: string }) {
  const { user, isLoading, updateUser } = useAuth();
  const router = useRouter();
  const own = !username || username === user?.username;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", addressLine: "", city: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<Profile>(own ? "/profile/me" : `/profile/${encodeURIComponent(username!)}`)
      .then(res => { setProfile(res.data); setError(""); })
      .catch(err => setError(getErrorMessage(err, "Couldn't load this profile.")));
  }, [isLoading, user, own, username, router]);

  const startEdit = () => {
    if (!profile) return;
    const a = profile.account;
    setForm({ fullName: a.fullName, phone: a.phone ?? profile.customer?.contactNumber ?? "", addressLine: a.addressLine ?? "", city: a.city ?? "" });
    setFormError("");
    setEditing(true);
  };

  // Same rules as sign-up and the backend, shown while typing.
  const nameError = editing ? fullNameProblem(form.fullName) : null;
  const phoneError = editing ? phoneProblem(form.phone) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const res = await api.put<Profile>("/profile/me", form);
      setProfile(res.data);
      updateUser({ fullName: res.data.account.fullName });
      setEditing(false);
      setNotice("Your details have been updated.");
    } catch (err) {
      setFormError(getErrorMessage(err, "Couldn't save your details."));
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-xl font-black text-slate-900">Profile unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <Link href="/" className="mt-5 inline-block px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800">Back to home</Link>
        </div>
      </div>
    );
  }
  if (!profile) return <div className="max-w-6xl mx-auto p-6 lg:p-10"><div className="h-56 rounded-3xl bg-slate-100 animate-pulse" /></div>;

  const { account: a, customer, staff, supplier, activity } = profile;
  const phone = a.phone ?? customer?.contactNumber ?? null;
  const address = [a.addressLine, a.city].filter(Boolean).join(", ");
  const memberSince = customer?.memberSince ?? a.createdAt;
  const payments = customer ? (showAllPayments ? customer.payments : customer.payments.slice(0, 8)) : [];

  const exportPayments = () => customer && downloadCsv(`payments-${a.username}`,
    ["Receipt", "Date", "Invoice", "For", "Method", "Amount"],
    customer.payments.map(p => [p.receiptNumber, p.paidAt.slice(0, 16).replace("T", " "), p.invoiceNumber, p.description, p.method, p.amount]));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 pb-12">
      {/* Cover + identity */}
      <div className="relative bg-[#0a1430] overflow-hidden">
        <div className="absolute -top-32 -right-20 w-[32rem] h-[32rem] rounded-full bg-blue-600/30 blur-[110px]" aria-hidden="true" />
        <div className="absolute -bottom-40 -left-24 w-[28rem] h-[28rem] rounded-full bg-rose-600/20 blur-[110px]" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-4 lg:px-10 pt-10 pb-24">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-200">{own ? "My profile" : "User profile"}</p>
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 lg:px-10 -mt-16 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-lg shadow-slate-900/5 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
          <span className="w-24 h-24 shrink-0 rounded-3xl bg-gradient-to-br from-slate-800 to-[#0a1430] text-white flex items-center justify-center text-3xl font-black shadow-lg ring-4 ring-white">
            {initials(a.fullName || a.username)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight break-words">{a.fullName}</h1>
              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${a.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                {a.active ? "Active" : "Deactivated"}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">@{a.username}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{ROLE_LABEL[a.role] || titleCase(a.role)}</span>
              {customer?.membershipTier && (
                <span className={`px-3 py-1 rounded-full bg-gradient-to-r ${TIER_STYLE[customer.membershipTier] || "from-slate-500 to-slate-700"} text-white text-xs font-black tracking-wide`}>
                  {titleCase(customer.membershipTier)} member
                </span>
              )}
              {supplier?.companyName && <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">{supplier.companyName}</span>}
              {memberSince && <span className="text-xs font-semibold text-slate-500">· Member since {fmtDay(memberSince)}</span>}
            </div>
          </div>
          {own && !editing && (
            <button onClick={startEdit} className="self-start sm:self-center px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800">Edit details</button>
          )}
        </div>

        {notice && <div role="status" className="px-4 py-3 rounded-xl text-sm font-bold border bg-green-50 text-green-800 border-green-200">{notice}</div>}

        {/* Role-specific headline figures */}
        {customer && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total paid" value={lkr(customer.totalPaid)} sub={`${customer.payments.length} payment${customer.payments.length === 1 ? "" : "s"}`} />
            <Stat label="Outstanding" value={lkr(customer.outstanding)} tone={customer.outstanding > 0 ? "text-red-700" : "text-slate-900"}
              sub={customer.unpaidInvoices > 0 ? `${customer.unpaidInvoices} unpaid bill${customer.unpaidInvoices === 1 ? "" : "s"}` : "Nothing to pay"} />
            <Stat label="Services" value={String(customer.servicesCompleted)} sub={`${customer.upcomingBookings} upcoming booking${customer.upcomingBookings === 1 ? "" : "s"}`} />
            <Stat label="Reward points" value={customer.loyaltyPoints.toLocaleString()}
              sub={customer.nextTier && customer.pointsToNextTier != null ? `${customer.pointsToNextTier.toLocaleString()} to ${titleCase(customer.nextTier)}` : customer.hasProfile ? "Top tier reached" : "Complete your profile to earn"} />
          </div>
        )}
        {staff && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Shifts this month" value={String(staff.shiftsThisMonth)} sub={staff.lateThisMonth > 0 ? `${staff.lateThisMonth} late arrival${staff.lateThisMonth === 1 ? "" : "s"}` : "No late arrivals"} />
            <Stat label="Upcoming shifts" value={String(staff.upcomingShifts.length)} sub="In the next 14 days" />
            <Stat label="Pay slips" value={String(staff.payslipCount)} sub={staff.payslipCount > 0 ? `${lkr(staff.totalPaid)} paid in total` : "None issued yet"} />
            {staff.activeJobs !== undefined
              ? <Stat label="Workshop jobs" value={String(staff.activeJobs)} sub={`${staff.completedJobs ?? 0} completed`} />
              : <Stat label="Last sign-in" value={a.lastLoginAt ? fmtDay(a.lastLoginAt) : "—"} sub={a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Never signed in"} />}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT: contact + account */}
          <div className="space-y-6">
            <Card title="Contact details">
              {editing ? (
                <form onSubmit={save} className="space-y-3">
                  <div>
                    <label htmlFor="pf-name" className="block text-xs font-bold text-slate-700 mb-1">Full name</label>
                    <input id="pf-name" value={form.fullName} maxLength={60} aria-invalid={!!nameError} onChange={e => setForm({ ...form, fullName: e.target.value })} className={`${inputClass} ${nameError ? "border-red-400" : ""}`} />
                    {nameError && <p className="mt-1 text-xs font-bold text-red-600">{nameError}</p>}
                  </div>
                  <div>
                    <label htmlFor="pf-phone" className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                    <input id="pf-phone" value={form.phone} maxLength={20} inputMode="tel" placeholder="07X XXX XXXX" aria-invalid={!!phoneError} onChange={e => setForm({ ...form, phone: e.target.value })} className={`${inputClass} ${phoneError ? "border-red-400" : ""}`} />
                    {phoneError && <p className="mt-1 text-xs font-bold text-red-600">{phoneError}</p>}
                  </div>
                  <div>
                    <label htmlFor="pf-address" className="block text-xs font-bold text-slate-700 mb-1">Address</label>
                    <input id="pf-address" value={form.addressLine} maxLength={200} placeholder="House no. and street" onChange={e => setForm({ ...form, addressLine: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="pf-city" className="block text-xs font-bold text-slate-700 mb-1">City</label>
                    <input id="pf-city" value={form.city} maxLength={80} onChange={e => setForm({ ...form, city: e.target.value })} className={inputClass} />
                  </div>
                  <p className="text-xs text-slate-500">Your username and email are used to sign in and can only be changed by an administrator.</p>
                  {formError && <p role="alert" className="text-sm font-bold text-red-600">{formError}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
                    <button type="submit" disabled={saving || !!nameError || !!phoneError} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                  </div>
                </form>
              ) : (
                <ul className="space-y-4">
                  <Detail icon={ICON.user} label="Full name" value={a.fullName} />
                  <Detail icon={ICON.mail} label="Email" value={a.email} />
                  <Detail icon={ICON.phone} label="Phone" value={phone} />
                  <Detail icon={ICON.pin} label="Address" value={address} />
                </ul>
              )}
            </Card>

            <Card title="Account & security">
              <ul className="space-y-4">
                <Detail icon={ICON.user} label="Username" value={`@${a.username}`} />
                <Detail icon={ICON.shield} label="Role" value={ROLE_LABEL[a.role] || titleCase(a.role)} />
                <Detail icon={ICON.clock} label="Last sign-in" value={a.lastLoginAt ? fmtWhen(a.lastLoginAt) : "Never"} />
                <Detail icon={ICON.key} label="Password last changed" value={a.passwordChangedAt ? fmtWhen(a.passwordChangedAt) : "Not since the account was created"} />
              </ul>
              {own && <Link href="/change-password" className="mt-5 inline-flex px-4 py-2.5 rounded-xl text-sm font-bold text-slate-900 border-2 border-slate-200 hover:border-slate-900 transition-colors">Change password</Link>}
            </Card>

            {supplier?.companyName && (
              <Card title="Company">
                <ul className="space-y-4">
                  <Detail icon={ICON.shield} label="Supplier" value={`${supplier.companyName} (${supplier.supplierCode})`} />
                  <Detail icon={ICON.user} label="Contact person" value={supplier.contactPerson} />
                  <Detail icon={ICON.phone} label="Company phone" value={supplier.phone} />
                  <Detail icon={ICON.mail} label="Company email" value={supplier.email} />
                  <Detail icon={ICON.pin} label="Company address" value={supplier.address} />
                </ul>
                <p className="mt-4 text-xs font-semibold text-slate-500">
                  Supplies: {(supplier.categories ?? []).map(titleCase).join(", ") || "—"} · {supplier.paymentTermsDays ?? 30}-day payment terms · {titleCase(supplier.status ?? "ACTIVE")}
                </p>
              </Card>
            )}
          </div>

          {/* RIGHT: role-specific detail */}
          <div className="lg:col-span-2 space-y-6">
            {customer && (
              <>
                <Card title="Vehicles" action={own ? <Link href="/customers/book" className="text-xs font-bold text-blue-700 hover:underline">Book a service →</Link> : undefined}>
                  {customer.vehicles.length === 0 ? (
                    <p className="text-sm text-slate-500">No vehicle on file yet.{own && <> <Link href="/customers/profile" className="font-bold text-blue-700 hover:underline">Add your vehicle</Link> to start earning reward points.</>}</p>
                  ) : (
                    <ul className="grid sm:grid-cols-2 gap-3">
                      {customer.vehicles.map(v => (
                        <li key={v.regNo} className="rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                          <span className="w-11 h-11 shrink-0 rounded-xl bg-slate-900 text-white flex items-center justify-center"><Glyph d={ICON.car} className="w-5 h-5" /></span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 font-mono font-black text-slate-900">{v.regNo}{v.primary && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-black uppercase tracking-widest font-sans">Primary</span>}</span>
                            <span className="block text-xs text-slate-500">
                              {v.visits} visit{v.visits === 1 ? "" : "s"}{v.lastService ? ` · last: ${v.lastServiceName}, ${fmtDay(v.lastService)}` : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {customer.fuelPurchases > 0 && <p className="mt-4 text-xs font-semibold text-slate-500">{customer.fuelPurchases} fuel purchase{customer.fuelPurchases === 1 ? "" : "s"} recorded for this vehicle · {lkr(customer.fuelSpend)}</p>}
                </Card>

                <Card title="Payment history" action={customer.payments.length > 0
                  ? <button onClick={exportPayments} className="text-xs font-bold text-blue-700 hover:underline">Export CSV</button> : undefined}>
                  {customer.payments.length === 0 ? (
                    <p className="text-sm text-slate-500">No payments yet. Paid bills and their receipts will appear here.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                              <th className="text-left px-2 py-2">Receipt</th>
                              <th className="text-left px-2 py-2">Paid for</th>
                              <th className="text-left px-2 py-2">Method</th>
                              <th className="text-right px-2 py-2">Amount</th>
                              <th className="px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {payments.map(p => (
                              <tr key={p.paymentId} className="border-b border-slate-50 align-top">
                                <td className="px-2 py-3 whitespace-nowrap"><p className="font-mono text-xs font-bold text-slate-900">{p.receiptNumber}</p><p className="text-xs text-slate-500">{fmtWhen(p.paidAt)}</p></td>
                                <td className="px-2 py-3"><p className="text-slate-800">{p.description}</p><p className="font-mono text-xs text-blue-700">{p.invoiceNumber}</p></td>
                                <td className="px-2 py-3 text-slate-700">{p.method}</td>
                                <td className="px-2 py-3 text-right font-black tabular-nums whitespace-nowrap">{lkr(p.amount)}</td>
                                <td className="px-2 py-3 text-right">
                                  {own && <button onClick={() => downloadReceipt(p.invoiceId, p.invoiceNumber).catch(() => setNotice("Couldn't download that receipt."))} className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50 whitespace-nowrap">Receipt</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {customer.payments.length > 8 && (
                        <button onClick={() => setShowAllPayments(v => !v)} className="mt-3 text-xs font-bold text-blue-700 hover:underline">
                          {showAllPayments ? "Show fewer" : `Show all ${customer.payments.length} payments`}
                        </button>
                      )}
                    </>
                  )}
                  {own && customer.outstanding > 0 && (
                    <p className="mt-4 text-sm text-slate-700 bg-red-50/60 border border-red-200 rounded-xl p-3">
                      You have {lkr(customer.outstanding)} to pay. <Link href="/customers/dashboard" className="font-bold text-blue-700 hover:underline">Go to My Bills →</Link>
                    </p>
                  )}
                </Card>
              </>
            )}

            {staff && (
              <>
                <Card title="Upcoming shifts" action={own ? <Link href="/roster" className="text-xs font-bold text-blue-700 hover:underline">Open roster →</Link> : undefined}>
                  {staff.upcomingShifts.length === 0 ? <p className="text-sm text-slate-500">No shifts scheduled in the next 14 days.</p> : (
                    <ul className="divide-y divide-slate-100">
                      {staff.upcomingShifts.map((s, i) => (
                        <li key={`${s.shiftDate}-${i}`} className="py-3 flex items-center justify-between gap-3">
                          <span><span className="block font-bold text-slate-900">{fmtDay(s.shiftDate)}</span><span className="block text-xs text-slate-500">{titleCase(s.shiftType)} shift{s.assignment ? ` · ${s.assignment}` : ""}</span></span>
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border bg-slate-50 text-slate-600 border-slate-200">{titleCase(s.status)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Recent pay slips" action={own && staff.payslipCount > 0 ? <Link href="/salary/my-payslips" className="text-xs font-bold text-blue-700 hover:underline">All pay slips →</Link> : undefined}>
                  {staff.payslips.length === 0 ? <p className="text-sm text-slate-500">No pay slips have been issued yet.</p> : (
                    <ul className="divide-y divide-slate-100">
                      {staff.payslips.map(p => (
                        <li key={p.salaryId} className="py-3 flex items-center justify-between gap-3">
                          <span><span className="block font-bold text-slate-900">{p.month}</span><span className="block text-xs text-slate-500">Paid {fmtDay(p.paymentDate)} · {p.hoursWorked} hours</span></span>
                          <span className="font-black tabular-nums text-slate-900">{lkr(p.totalSalary)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}

            <Card title="Recent activity" action={activity.length > ACTIVITY_SHOWN
              ? <button onClick={() => setShowAllActivity(v => !v)} className="text-xs font-bold text-blue-700 hover:underline">{showAllActivity ? "Show fewer" : `Show all ${activity.length}`}</button> : undefined}>
              {activity.length === 0 ? <p className="text-sm text-slate-500">No recorded activity yet.</p> : (
                // The latest few by default; the full list scrolls inside the card instead of stretching the page.
                <ol className={`space-y-4 ${showAllActivity ? "max-h-96 overflow-y-auto pr-2" : ""}`}>
                  {(showAllActivity ? activity : activity.slice(0, ACTIVITY_SHOWN)).map((e, i) => (
                    <li key={`${e.timestamp}-${i}`} className="flex gap-3">
                      <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900">{titleCase(e.action)}</span>
                        <span className="block text-sm text-slate-600 break-words">{e.description}</span>
                        <span className="block text-xs text-slate-400 mt-0.5">{fmtWhen(e.timestamp)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
