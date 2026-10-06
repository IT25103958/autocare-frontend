"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import api from "../../utils/axiosInstance";
import { getErrorMessage as extractErrorMessage } from "../../utils/apiError";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../context/AuthContext";
import Link from "next/link";
import InventoryOverview from "./_components/InventoryOverview";
import StockHistoryDrawer from "./_components/StockHistoryDrawer";
import AdjustStockDialog from "./_components/AdjustStockDialog";
import RunOutForecast, { Forecast } from "../_components/RunOutForecast";
import { InventoryPart } from "./_components/inventory";
import { downloadCsv as downloadCSV } from "../billing/_components/billing";

// =============================================================================
// VALIDATION
// =============================================================================
const PART_CODE_PATTERN = /^[A-Z]{2,6}-\d{2,5}$/;

const partSchema = z.object({
  partCode: z.string()
    .min(3, "Code must be at least 3 characters.")
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => PART_CODE_PATTERN.test(v), "Use a professional format like BP-001 — letters, a hyphen, then numbers."),
  name: z.string().trim().min(2, "Part name is required."),
  category: z.enum(["Engine", "Brakes", "Suspension", "Electrical", "Consumables"]),
  unitPrice: z.coerce.number().min(0.01, "Price must be greater than Rs. 0."),
  currentStock: z.coerce.number().int("Decimals are not allowed.").min(0, "Stock cannot be negative."),
  minimumStockLevel: z.coerce.number().int("Decimals are not allowed.").min(1, "Minimum stock level must be at least 1."),
  // Restock order size suggested on the low-stock list (0 = automatic: back up to 2x the minimum).
  reorderQuantity: z.coerce.number().int("Decimals are not allowed.").min(0, "Can't be negative.").optional(),
  // Customer warranty in months; blank = the shop default, 0 = no warranty.
  warrantyMonths: z.string().regex(/^\d{0,3}$/, "Enter whole months.").refine(v => !v || Number(v) <= 120, "At most 120 months.").optional(),
  // Optional only when currentStock is 0 — enforced by the object-level
  // refine below. Real stock needs a real source and cost; without that it's
  // invisible to Finance forever, with no way to add the invoice later.
  initialSupplierName: z.string().optional(),
  costPerUnit: z.coerce.number().min(0, "Cost cannot be negative.").optional(),
  // Set while editing an existing part: the initial-purchase rule only applies to new parts
  // (it used to block editing any part that had stock).
  isEdit: z.boolean().optional(),
}).refine(
  (data) => data.isEdit || data.currentStock === 0 || (!!data.initialSupplierName && !!data.costPerUnit && data.costPerUnit > 0),
  { message: "Stock above 0 needs a supplier and cost — otherwise this stock is invisible to Finance.", path: ["initialSupplierName"] }
);

// zod v4 + @hookform/resolvers v5: coerced number fields need the two-generic
// useForm pattern (input shape vs. parsed output shape), same fix already
// applied on the Payables and Salary pages.
type PartFormInput = z.input<typeof partSchema>;
type PartFormOutput = z.output<typeof partSchema>;

interface SparePart {
  id?: number;
  partId?: number;
  partID?: number;
  partCode: string;
  name: string;
  category: string;
  unitPrice: number;
  costPrice?: number;
  currentStock: number;
  minimumStockLevel: number;
  reorderQuantity?: number | null;
  warrantyMonths?: number | null;
  active?: boolean;
}

// A supplier company from the supplier master (active, approved for spare parts).
interface SupplierOption {
  id: number;
  supplierCode: string;
  companyName: string;
}

interface FetchErrors {
  parts?: boolean;
  suppliers?: boolean;
}

type ToastType = "success" | "error" | "info";
interface ToastItem { id: number; type: ToastType; message: string; }

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void | Promise<void>;
}
const CLOSED_CONFIRM: ConfirmState = { isOpen: false, title: "", message: "", confirmLabel: "Confirm", pending: false, onConfirm: () => {} };

// =============================================================================
// ICONS
// =============================================================================
const s = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 2 };
function IconCheckCircle({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M9 12.75l1.5 1.5 3.75-4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconAlertTriangle({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM10.29 3.86l-8.18 14.16A1.5 1.5 0 003.5 20.5h17a1.5 1.5 0 001.39-2.48L13.71 3.86a1.5 1.5 0 00-2.42 0z" /></svg>;
}
function IconXCircle({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconInfo({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M11.25 11.25h.75v4.5h.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 8.25h.008v.008H12V8.25z" /></svg>;
}
function IconSearch({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
function IconDownload({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 10.5L12 15m0 0l4.5-4.5M12 15V3" /></svg>;
}
function IconRefresh({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}
function IconChevronLeft({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>;
}
function IconChevronRight({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>;
}
function IconCart({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.969-4.716 2.517-7.22a1.125 1.125 0 00-1.11-1.03H5.25M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>;
}
function IconEdit({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
}
function IconTrash({ c = "w-4 h-4" }: { c?: string }) {
  return <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path {...s} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}

// =============================================================================
// UTILITIES
// =============================================================================
function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageItems = useMemo(() => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize), [items, clampedPage, pageSize]);
  return { page: clampedPage, setPage, totalPages, pageItems };
}

function PaginationBar<T>({ pagination, itemLabel }: { pagination: ReturnType<typeof usePagination<T>>; itemLabel: string }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
      <span className="text-xs font-bold text-slate-400">Page {pagination.page} of {pagination.totalPages} {itemLabel}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => pagination.setPage((p) => Math.max(1, p - 1))} disabled={pagination.page === 1} aria-label="Previous page"
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors">
          <IconChevronLeft />
        </button>
        <button onClick={() => pagination.setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page === pagination.totalPages} aria-label="Next page"
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors">
          <IconChevronRight />
        </button>
      </div>
    </div>
  );
}

function usePortalTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.body); }, []);
  return target;
}

function SearchInput({ value, onChange, placeholder, ariaLabel, className = "w-64" }: {
  value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string; className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 bg-slate-100 border border-transparent focus-within:border-blue-400 focus-within:bg-white rounded-xl px-3 py-2 transition-colors ${className}`}>
      <IconSearch c="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel}
        className="bg-transparent outline-none text-xs font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium w-full min-w-0" />
    </div>
  );
}

function exportPartsCSV(rows: SparePart[]) {
  const headers = ["Part Code", "Name", "Category", "Unit Price", "Cost Price", "Stock", "Min Level", "Status"];
  const body = rows.map((p) => [
    p.partCode, p.name, p.category, p.unitPrice, p.costPrice ?? "", p.currentStock, p.minimumStockLevel,
    p.currentStock <= p.minimumStockLevel ? "CRITICAL" : "OPTIMAL",
  ]);
  downloadCSV("parts-inventory", headers, body);
}

function formatLKR(amt: number) {
  return `Rs. ${(amt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PartsInventoryPage() {
  const { user } = useAuth();
  const [parts, setParts] = useState<SparePart[]>([]);
  const [supplierList, setSupplierList] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchErrors, setFetchErrors] = useState<FetchErrors>({});
  const [editingPartId, setEditingPartId] = useState<number | null>(null);

  const [rmaModal, setRmaModal] = useState<{ isOpen: boolean; part: SparePart | null }>({ isOpen: false, part: null });
  const [supplyModal, setSupplyModal] = useState<{ isOpen: boolean; part: SparePart | null }>({ isOpen: false, part: null });
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);

  const [rmaData, setRmaData] = useState({ quantity: 1, reason: "", supplierId: "" });
  const [supplyData, setSupplyData] = useState({ quantity: 10, supplierId: "", agreedUnitPrice: 0 });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const portalTarget = usePortalTarget();
  const [partSearch, setPartSearch] = useState("");
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  // Bumped after every save so the overview (value, low stock, ledger) reloads.
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyPart, setHistoryPart] = useState<InventoryPart | null>(null);
  const [adjustPart, setAdjustPart] = useState<InventoryPart | null>(null);

  const isManager = user?.role === "SUPER_ADMIN" || user?.role === "INVENTORY_MANAGER";

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<PartFormInput, any, PartFormOutput>({
    resolver: zodResolver(partSchema),
    mode: "onChange",
    defaultValues: { category: "Engine", currentStock: 0, minimumStockLevel: 5 },
  });

  const pushToast = useCallback((type: ToastType, message: string) => {
    setToasts((prev) => {
      if (prev.some((t) => t.type === type && t.message === message)) return prev;
      const id = Date.now() + Math.random();
      window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
      return [...prev, { id, type, message }];
    });
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const fetchAll = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true); else setLoading(true);

    const calls: Promise<any>[] = [api.get<SparePart[]>("/parts")];
    // Only active suppliers approved for spare parts can be ordered from.
    if (isManager) calls.push(api.get<SupplierOption[]>("/suppliers/options", { params: { category: "SPARE_PARTS" } }));

    const results = await Promise.allSettled(calls);
    const errors: FetchErrors = {};

    const partsRes = results[0];
    const partsData = partsRes.status === "fulfilled" ? partsRes.value.data : (errors.parts = true, []);

    let suppliersData: SupplierOption[] = [];
    if (isManager) {
      const suppliersRes = results[1];
      suppliersData = suppliersRes && suppliersRes.status === "fulfilled" ? suppliersRes.value.data : (errors.suppliers = true, []);
    }

    setParts(partsData);
    setSupplierList(suppliersData);
    setFetchErrors(errors);
    setLastUpdated(new Date());
    setRefreshKey((k) => k + 1);
    setLoading(false);
    setRefreshing(false);

    if (Object.keys(errors).length > 0) {
      pushToast("error", `Couldn't load: ${Object.keys(errors).join(", ")}. Figures below may be incomplete.`);
    } else if (isManualRefresh) {
      pushToast("success", "Inventory refreshed.");
    }
  }, [isManager, pushToast]);

  useEffect(() => {
    if (user) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isManager]);

  const onSubmit = async (form: PartFormOutput) => {
    const data = { ...form, warrantyMonths: form.warrantyMonths ? Number(form.warrantyMonths) : null };
    try {
      if (editingPartId) {
        await api.put(`/parts/${editingPartId}`, data);
        pushToast("success", "Component details updated.");
        setEditingPartId(null);
      } else if (data.initialSupplierName && data.costPerUnit) {
        // Registering a brand-new part together with who it was bought from
        // and at what cost — this is also how any part with real starting
        // stock generates its invoice to Finance (see the schema refine).
        const { initialSupplierName, costPerUnit, ...part } = data;
        await api.post("/parts/register-with-invoice", { part, supplierId: Number(initialSupplierName), costPerUnit });
        pushToast("success", `Part registered — an invoice for ${data.currentStock} units was sent to Finance.`);
      } else {
        await api.post("/parts", data);
        pushToast("success", "New spare part added.");
      }
      reset();
      fetchAll();
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Ensure Part Code is unique."));
    }
  };

  const handleEdit = (part: SparePart) => {
    const activeId = part.partID || part.partId || part.id;
    if (!activeId) return;
    setEditingPartId(activeId);
    setValue("partCode", part.partCode);
    setValue("name", part.name);
    setValue("category", part.category as any);
    setValue("unitPrice", part.unitPrice);
    setValue("currentStock", part.currentStock);
    setValue("minimumStockLevel", part.minimumStockLevel);
    setValue("reorderQuantity", part.reorderQuantity ?? 0);
    setValue("warrantyMonths", part.warrantyMonths == null ? "" : String(part.warrantyMonths));
    setValue("isEdit", true);
    // Clear any leftover values in the (now-hidden) initial-purchase fields
    // so they can't resurface unexpectedly if the user cancels this edit and
    // goes back to adding a new part.
    setValue("initialSupplierName", "");
    setValue("costPerUnit", undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const executeDelete = useCallback(async (targetId: number) => {
    setConfirmState((prev) => ({ ...prev, pending: true }));
    try {
      await api.delete(`/parts/${targetId}`);
      pushToast("success", "Component removed from inventory.");
      fetchAll();
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Couldn't delete — it may be tied to existing records."));
    } finally {
      setConfirmState(CLOSED_CONFIRM);
    }
  }, [fetchAll, pushToast]);

  const toggleActive = async (part: SparePart) => {
    const targetId = part.partID || part.partId || part.id;
    if (!targetId) return;
    const discontinue = part.active !== false;
    try {
      await api.put(`/parts/${targetId}/active`, null, { params: { value: !discontinue } });
      pushToast("success", discontinue ? `${part.name} discontinued — it can no longer be reordered.` : `${part.name} is active again.`);
      fetchAll();
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Couldn't update the part."));
    }
  };

  // "Reorder" from the run-out forecast: same dialog, with the forecast's suggested quantity.
  const reorderFromForecast = (row: Forecast) => {
    const full = parts.find((p) => p.partCode?.toUpperCase() === row.key);
    if (!full) return;
    setSupplyModal({ isOpen: true, part: full });
    setSupplyData({ quantity: Math.max(1, Math.round(row.suggestedOrder)), supplierId: "", agreedUnitPrice: full.costPrice || full.unitPrice });
  };

  // "Reorder" from the low-stock list: open the purchase-order dialog pre-filled.
  const openReorder = (part: InventoryPart, quantity: number) => {
    const full = parts.find((p) => (p.partID || p.partId || p.id) === part.partID) || (part as unknown as SparePart);
    setSupplyModal({ isOpen: true, part: full });
    setSupplyData({ quantity, supplierId: "", agreedUnitPrice: full.costPrice || full.unitPrice });
  };

  const asInventoryPart = (p: SparePart): InventoryPart => ({ ...p, partID: (p.partID || p.partId || p.id)! });

  const handleDeleteClick = (part: SparePart) => {
    const targetId = part.partID || part.partId || part.id;
    if (!targetId) return;
    setConfirmState({
      isOpen: true,
      title: "Delete this component?",
      message: `Permanently remove "${part.name}" (${part.partCode}). Parts with stock history (jobs, sales, orders) can't be deleted — discontinue them instead.`,
      confirmLabel: "Delete component",
      pending: false,
      onConfirm: () => executeDelete(targetId),
    });
  };

  const handleSubmitRma = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rmaModal.part) return;
    setIsSubmittingAction(true);
    try {
      // The server works out the part name and the credit value (at cost price).
      const payload = {
        partCode: rmaModal.part.partCode, quantity: rmaData.quantity,
        reason: rmaData.reason, supplierId: Number(rmaData.supplierId),
      };
      await api.post("/rma/add", payload);
      pushToast("success", "RMA logged — supplier notified of the return.");
      setRmaModal({ isOpen: false, part: null });
      setRmaData({ quantity: 1, reason: "", supplierId: "" });
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Failed to dispatch the RMA ticket."));
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleSubmitSupplyOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplyModal.part) return;
    setIsSubmittingAction(true);
    try {
      const payload = {
        supplierId: Number(supplyData.supplierId),
        partCode: supplyModal.part.partCode,
        quantityRequested: supplyData.quantity,
        agreedUnitPrice: supplyData.agreedUnitPrice,
      };
      await api.post("/supply/order", payload);
      pushToast("success", "Purchase order sent — awaiting supplier fulfillment.");
      setSupplyModal({ isOpen: false, part: null });
      setSupplyData({ quantity: 10, supplierId: "", agreedUnitPrice: 0 });
    } catch (err) {
      pushToast("error", extractErrorMessage(err, "Failed to generate the purchase order."));
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const filteredParts = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    const visible = showDiscontinued ? parts : parts.filter((p) => p.active !== false);
    if (!q) return visible;
    return visible.filter((p) => p.name.toLowerCase().includes(q) || p.partCode.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [parts, partSearch, showDiscontinued]);
  const partsPagination = usePagination(filteredParts, 8);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 md:p-12" aria-busy="true" aria-label="Loading inventory">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="h-14 bg-slate-200 rounded-2xl animate-pulse w-1/2" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="h-[500px] bg-slate-200 rounded-3xl animate-pulse" />
            <div className="lg:col-span-2 h-[500px] bg-slate-200 rounded-3xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 p-6 md:p-12 relative animate-fade-in-up">
      <div className="max-w-7xl mx-auto">

        {Object.keys(fetchErrors).length > 0 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 bg-red-50 border border-red-200 rounded-2xl mb-6">
            <div className="flex items-center gap-3">
              <IconAlertTriangle c="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm font-bold text-red-700">Couldn't load: {Object.keys(fetchErrors).join(", ")}. Figures below may be incomplete.</p>
            </div>
            <button onClick={() => fetchAll(true)} className="text-xs font-black uppercase tracking-widest text-red-700 hover:text-red-900 whitespace-nowrap">Retry now</button>
          </div>
        )}

        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Spare Parts Inventory</h1>
            <p className="text-slate-500 font-medium mt-1">{isManager ? "Manage automotive components, update details, and log defective RMA tickets." : "View authorized component catalog. Live storage data is restricted."}</p>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => fetchAll(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg text-xs font-bold text-slate-600 transition-colors">
                <IconRefresh c={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              {lastUpdated && <span className="text-[11px] text-slate-400 font-semibold">Updated {lastUpdated.toLocaleTimeString()}</span>}
            </div>
          </div>
        </div>

        {isManager && (
          <InventoryOverview refreshKey={refreshKey} onReorder={openReorder} onShowHistory={setHistoryPart} />
        )}

        {isManager && (
          <div className="mb-8">
            <RunOutForecast endpoint="/insights/parts-forecast" title="Run-out Forecast" refreshKey={refreshKey} onOrder={reorderFromForecast} orderLabel="Reorder" />
          </div>
        )}

        <div className={`grid grid-cols-1 ${isManager ? "lg:grid-cols-3" : "lg:grid-cols-1"} gap-8`}>
          {isManager && (
            <div className="lg:col-span-1">
              <div className={`bg-white p-8 rounded-3xl shadow-sm border sticky top-6 ${editingPartId ? "border-yellow-400 ring-4 ring-yellow-400/10" : "border-slate-200"}`}>
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <h2 className="text-xl font-bold text-slate-800">{editingPartId ? "Edit Component" : "Add Spare Part"}</h2>
                  {editingPartId && <button onClick={() => { setEditingPartId(null); reset(); }} className="text-xs font-bold text-slate-400 hover:text-slate-600">Cancel</button>}
                </div>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div>
                    <label htmlFor="partCode" className="block text-sm font-bold text-slate-700 mb-1.5">Part Code</label>
                    <input id="partCode" {...register("partCode")} disabled={!!editingPartId} type="text" placeholder="e.g. BP-001"
                      className={`w-full px-4 py-2.5 rounded-xl border font-mono uppercase outline-none ${editingPartId ? "bg-slate-100 cursor-not-allowed" : `bg-slate-50 focus:border-blue-500 ${errors.partCode ? "border-red-400" : "border-slate-200"}`}`} />
                    {errors.partCode && <p className="mt-1 text-xs font-bold text-red-500">{errors.partCode.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="name" className="block text-sm font-bold text-slate-700 mb-1.5">Part Name</label>
                    <input id="name" {...register("name")} type="text" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none focus:border-blue-500 ${errors.name ? "border-red-400" : "border-slate-200"}`} />
                    {errors.name && <p className="mt-1 text-xs font-bold text-red-500">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="category" className="block text-sm font-bold text-slate-700 mb-1.5">Category</label>
                    <select id="category" {...register("category")} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none cursor-pointer">
                      <option value="Engine">Engine</option>
                      <option value="Brakes">Brakes</option>
                      <option value="Suspension">Suspension</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Consumables">Consumables</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="currentStock" className="block text-sm font-bold text-slate-700 mb-1.5">{editingPartId ? "Stock (locked)" : "Opening Stock"}</label>
                      <input id="currentStock" {...register("currentStock")} type="number" readOnly={!!editingPartId}
                        className={`w-full px-4 py-2.5 rounded-xl border outline-none ${editingPartId ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200" : `bg-slate-50 ${errors.currentStock ? "border-red-400" : "border-slate-200"}`}`} />
                      {editingPartId && <p className="mt-1 text-[11px] font-bold text-slate-500">Use “Adjust stock” in the list so the change is recorded.</p>}
                      {errors.currentStock && <p className="mt-1 text-xs font-bold text-red-500">{errors.currentStock.message}</p>}
                    </div>
                    <div>
                      <label htmlFor="unitPrice" className="block text-sm font-bold text-slate-700 mb-1.5">Price (LKR)</label>
                      <input id="unitPrice" {...register("unitPrice")} type="number" step="0.01" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.unitPrice ? "border-red-400" : "border-slate-200"}`} />
                      {errors.unitPrice && <p className="mt-1 text-xs font-bold text-red-500">{errors.unitPrice.message}</p>}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="minimumStockLevel" className="block text-sm font-bold text-slate-700 mb-1.5">Safety Alert Level</label>
                    <input id="minimumStockLevel" {...register("minimumStockLevel")} type="number" className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.minimumStockLevel ? "border-red-400" : "border-slate-200"}`} />
                    {errors.minimumStockLevel && <p className="mt-1 text-xs font-bold text-red-500">{errors.minimumStockLevel.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="reorderQuantity" className="block text-sm font-bold text-slate-700 mb-1.5">Reorder Quantity <span className="font-medium text-slate-400">(optional)</span></label>
                    <input id="reorderQuantity" {...register("reorderQuantity")} type="number" min={0} placeholder="0 = automatic"
                      className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.reorderQuantity ? "border-red-400" : "border-slate-200"}`} />
                    <p className="mt-1 text-[11px] text-slate-400 font-medium">Suggested order size when stock runs low. Automatic tops up to twice the alert level.</p>
                    {errors.reorderQuantity && <p className="mt-1 text-xs font-bold text-red-500">{errors.reorderQuantity.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="warrantyMonths" className="block text-sm font-bold text-slate-700 mb-1.5">Warranty (months) <span className="font-medium text-slate-400">(optional)</span></label>
                    <input id="warrantyMonths" {...register("warrantyMonths")} inputMode="numeric" maxLength={3} placeholder="Blank = shop default"
                      className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 outline-none ${errors.warrantyMonths ? "border-red-400" : "border-slate-200"}`} />
                    <p className="mt-1 text-[11px] text-slate-400 font-medium">Customer warranty from the date of sale. 0 means sold without warranty.</p>
                    {errors.warrantyMonths && <p className="mt-1 text-xs font-bold text-red-500">{errors.warrantyMonths.message}</p>}
                  </div>

                  {!editingPartId && (
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <div>
                        <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Initial Supplier Purchase</p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Required whenever Stock above is greater than 0, so Finance has a record of what this stock cost.</p>
                      </div>
                      <div>
                        <label htmlFor="initialSupplierName" className="block text-sm font-bold text-slate-700 mb-1.5">Bought From</label>
                        <select id="initialSupplierName" {...register("initialSupplierName")} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none cursor-pointer">
                          <option value="">-- No supplier / zero stock only --</option>
                          {supplierList.map((sup) => (<option key={sup.id} value={sup.id}>{sup.companyName} ({sup.supplierCode})</option>))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="costPerUnit" className="block text-sm font-bold text-slate-700 mb-1.5">Cost Per Unit (LKR)</label>
                        <input id="costPerUnit" {...register("costPerUnit")} type="number" step="0.01" placeholder="What we paid, not the retail price above" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none" />
                      </div>
                      {errors.initialSupplierName && <p className="text-xs font-bold text-red-500">{errors.initialSupplierName.message}</p>}
                    </div>
                  )}

                  <button type="submit" disabled={isSubmitting} className="w-full text-white font-bold py-3.5 px-4 rounded-xl shadow-lg mt-2 bg-slate-900 hover:bg-blue-600 disabled:opacity-60 transition-colors">
                    {isSubmitting ? "Processing..." : editingPartId ? "Update Details" : "Register to Inventory"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {!isManager && (
            <div className="lg:col-span-3 mb-4 bg-blue-50 border border-blue-100 p-6 rounded-3xl flex items-center justify-between">
              <div><h4 className="text-blue-900 font-black text-lg">Awaiting Orders?</h4><p className="text-blue-700 text-sm mt-1">Navigate to the Deliveries portal to view pending Purchase Orders.</p></div>
              <Link href="/deliveries" className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md flex-shrink-0">Go to Deliveries</Link>
            </div>
          )}

          <div className={`${isManager ? "lg:col-span-2" : "lg:col-span-3"}`}>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-xl font-bold text-slate-800">{isManager ? "Master Inventory Ledger" : "Authorized Component Catalog"}</h3>
                <div className="flex items-center gap-2">
                  {isManager && (
                    <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={showDiscontinued} onChange={(e) => setShowDiscontinued(e.target.checked)} className="w-4 h-4" />
                      Discontinued
                    </label>
                  )}
                  <SearchInput value={partSearch} onChange={setPartSearch} placeholder="Search name, code, category..." ariaLabel="Search inventory" className="w-64" />
                  {isManager && (
                    <button onClick={() => exportPartsCSV(filteredParts)} disabled={filteredParts.length === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600 font-bold rounded-xl text-xs transition-colors flex-shrink-0">
                      <IconDownload c="w-3.5 h-3.5" /> CSV
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th scope="col" className="px-6 py-4">Component Details</th>
                      <th scope="col" className="px-6 py-4 text-right">Unit Price</th>
                      {isManager && <><th scope="col" className="px-6 py-4 text-right">Live Stock</th><th scope="col" className="px-6 py-4 text-center">System Status</th><th scope="col" className="px-6 py-4 text-right">Actions</th></>}
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700 divide-y divide-slate-50">
                    {partsPagination.pageItems.map((p, index) => {
                      const isLowStock = p.currentStock <= p.minimumStockLevel;
                      const uniqueId = p.partID || p.partId || p.id;
                      return (
                        <tr key={uniqueId || index} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-5">
                            <p className="text-slate-900 font-bold">{p.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{p.partCode}</span>
                              <span className="text-[10px] font-bold text-blue-600 uppercase">{p.category}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-right font-mono text-slate-600">{formatLKR(p.unitPrice || 0)}</td>
                          {isManager && (
                            <>
                              <td className="px-6 py-5 text-right"><span className={`font-black text-lg ${isLowStock ? "text-red-600" : "text-slate-900"}`}>{p.currentStock || 0}</span></td>
                              <td className="px-6 py-5 text-center">
                                {p.active === false
                                  ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200">DISCONTINUED</span>
                                  : p.currentStock === 0
                                  ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-red-50 text-red-700 border border-red-200"><span className="w-1.5 h-1.5 rounded-full bg-red-600" />OUT OF STOCK</span>
                                  : isLowStock
                                  ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-red-50 text-red-600 border border-red-100"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />CRITICAL</span>
                                  : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />OPTIMAL</span>}
                              </td>
                              <td className="px-6 py-5 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => {
                                    setSupplyModal({ isOpen: true, part: p });
                                    // Prefer the real cost paid on the last PO (costPrice) over the
                                    // customer-facing unitPrice.
                                    setSupplyData({ ...supplyData, agreedUnitPrice: p.costPrice || p.unitPrice });
                                  }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Request Restock (Purchase Order)" aria-label={`Request restock for ${p.name}`}>
                                    <IconCart />
                                  </button>
                                  <button onClick={() => setRmaModal({ isOpen: true, part: p })} className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Log Defective Part (RMA)" aria-label={`Log RMA for ${p.name}`}>
                                    <IconAlertTriangle />
                                  </button>
                                  <button onClick={() => setAdjustPart(asInventoryPart(p))} className="px-2 py-1.5 text-[11px] font-black text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors" title="Adjust stock (physical count)" aria-label={`Adjust stock for ${p.name}`}>
                                    ±
                                  </button>
                                  <button onClick={() => setHistoryPart(asInventoryPart(p))} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors" title="Stock history" aria-label={`Stock history for ${p.name}`}>
                                    <IconInfo />
                                  </button>
                                  <button onClick={() => handleEdit(p)} className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" title="Edit" aria-label={`Edit ${p.name}`}>
                                    <IconEdit />
                                  </button>
                                  <button onClick={() => toggleActive(p)} className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors"
                                    title={p.active === false ? "Reactivate part" : "Discontinue part (keeps history, stops reordering)"}>
                                    {p.active === false ? "Restore" : "Retire"}
                                  </button>
                                  <button onClick={() => handleDeleteClick(p)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete" aria-label={`Delete ${p.name}`}>
                                    <IconTrash />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {partsPagination.pageItems.length === 0 && (
                      <tr><td colSpan={isManager ? 5 : 2} className="px-6 py-16 text-center text-slate-400 font-medium">
                        {partSearch ? "No parts match your search." : "No components registered yet."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationBar pagination={partsPagination} itemLabel="components" />
            </div>
          </div>
        </div>
      </div>

      {portalTarget && createPortal(
        <>
          {historyPart && <StockHistoryDrawer part={historyPart} onClose={() => setHistoryPart(null)} />}
          {adjustPart && (
            <AdjustStockDialog part={adjustPart} onClose={() => setAdjustPart(null)}
              onSaved={(msg) => { setAdjustPart(null); pushToast("success", msg); fetchAll(); }} />
          )}

          {/* TOASTS */}
          <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold ${
                t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                t.type === "error" ? "bg-red-50 border-red-200 text-red-800" : "bg-slate-50 border-slate-200 text-slate-800"
              }`}>
                {t.type === "success" ? <IconCheckCircle c="w-5 h-5 flex-shrink-0 mt-0.5" /> : t.type === "error" ? <IconAlertTriangle c="w-5 h-5 flex-shrink-0 mt-0.5" /> : <IconInfo c="w-5 h-5 flex-shrink-0 mt-0.5" />}
                <span className="flex-1">{t.message}</span>
                <button onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" className="text-current opacity-60 hover:opacity-100"><IconXCircle c="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {/* CONFIRM DELETE MODAL */}
          {confirmState.isOpen && (
            <div className="fixed inset-0 z-[110] flex items-center-safe justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="confirm-title"
              onKeyDown={(e) => { if (e.key === "Escape" && !confirmState.pending) setConfirmState(CLOSED_CONFIRM); }}>
              <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-sm w-full border border-slate-200 text-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-full mb-4 mx-auto bg-red-100 text-red-600">
                  <IconAlertTriangle c="w-6 h-6" />
                </div>
                <h3 id="confirm-title" className="text-xl font-bold text-slate-900 mb-2">{confirmState.title}</h3>
                <p className="text-slate-500 text-sm mb-6 font-medium">{confirmState.message}</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmState(CLOSED_CONFIRM)} disabled={confirmState.pending} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60">Cancel</button>
                  <button onClick={confirmState.onConfirm} disabled={confirmState.pending} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-md disabled:opacity-60">
                    {confirmState.pending ? "Deleting..." : confirmState.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PURCHASE ORDER (SUPPLY REQUEST) MODAL */}
          {supplyModal.isOpen && supplyModal.part && (
            <div className="fixed inset-0 z-[100] flex items-center-safe justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="supply-modal-title">
              <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                  <div><h3 id="supply-modal-title" className="text-xl font-black text-slate-900">Request Stock Replenishment</h3><p className="text-xs font-bold text-blue-600 mt-1 uppercase tracking-widest">{supplyModal.part.partCode} • {supplyModal.part.name}</p></div>
                  <button onClick={() => setSupplyModal({ isOpen: false, part: null })} aria-label="Close" className="p-2 text-slate-400 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors"><IconXCircle c="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleSubmitSupplyOrder} className="space-y-5">
                  <div>
                    <label htmlFor="supplyTargetSupplier" className="block text-xs font-black text-slate-600 uppercase mb-2">Target Supplier</label>
                    <select id="supplyTargetSupplier" required value={supplyData.supplierId} onChange={(e) => setSupplyData({ ...supplyData, supplierId: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 font-bold text-slate-800">
                      <option value="">-- Select Supplier --</option>
                      {supplierList.map((sup) => (<option key={sup.id} value={sup.id}>{sup.companyName} ({sup.supplierCode})</option>))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="supplyQty" className="block text-xs font-black text-slate-600 uppercase mb-2">Order Qty</label>
                      <input id="supplyQty" type="number" min="1" required value={supplyData.quantity} onChange={(e) => setSupplyData({ ...supplyData, quantity: parseInt(e.target.value) || 1 })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-900" />
                    </div>
                    <div>
                      <label htmlFor="supplyPrice" className="block text-xs font-black text-slate-600 uppercase mb-2">Target Price (supplier confirms)</label>
                      <input id="supplyPrice" type="number" step="0.01" required value={supplyData.agreedUnitPrice} onChange={(e) => setSupplyData({ ...supplyData, agreedUnitPrice: parseFloat(e.target.value) || 0 })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-900" />
                      {!supplyModal.part.costPrice && (
                        <p className="text-[10px] font-bold text-amber-600 mt-1.5">No purchase history — defaulted from retail price. Confirm the real cost with the supplier.</p>
                      )}
                    </div>
                  </div>

                  {/* LIVE MARGIN CHECK — the retail price (unitPrice) and what we
                      pay the supplier are meant to be two different numbers;
                      the gap between them is the actual profit. This makes
                      that gap impossible to miss instead of only warning when
                      there's no purchase history to compare against. */}
                  {(() => {
                    const retailPrice = supplyModal.part!.unitPrice || 0;
                    const marginPerUnit = retailPrice - supplyData.agreedUnitPrice;
                    const marginPercent = retailPrice > 0 ? (marginPerUnit / retailPrice) * 100 : 0;
                    const noMargin = marginPerUnit <= 0;
                    return (
                      <div className={`p-4 rounded-xl border ${noMargin ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-[11px] font-black uppercase tracking-widest ${noMargin ? "text-red-700" : "text-emerald-700"}`}>
                            {noMargin ? "No Profit Margin" : "Margin vs. Retail Price"}
                          </span>
                          <span className={`font-black text-sm ${noMargin ? "text-red-700" : "text-emerald-700"}`}>
                            {noMargin
                              ? `${formatLKR(Math.abs(marginPerUnit))} loss / unit`
                              : `+${formatLKR(marginPerUnit)} / unit (${marginPercent.toFixed(0)}%)`}
                          </span>
                        </div>
                        {noMargin && (
                          <p className="text-[11px] text-red-600 font-semibold mt-1.5">
                            Buying at {formatLKR(supplyData.agreedUnitPrice)} but selling at {formatLKR(retailPrice)} — either negotiate a lower cost, or raise the retail price on this part after receiving the order.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <div className="p-4 bg-slate-900 rounded-xl text-white flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Expected PO Value</span>
                    <span className="font-black text-lg">{formatLKR(supplyData.quantity * supplyData.agreedUnitPrice)}</span>
                  </div>
                  <button type="submit" disabled={isSubmittingAction} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black py-4 rounded-xl mt-2 transition-colors">{isSubmittingAction ? "Generating PO..." : "Send Purchase Order"}</button>
                </form>
              </div>
            </div>
          )}

          {/* RMA INITIATION MODAL */}
          {rmaModal.isOpen && rmaModal.part && (
            <div className="fixed inset-0 z-[100] flex items-center-safe justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="rma-modal-title">
              <div className="bg-white rounded-3xl p-8 shadow-2xl max-w-md w-full border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                  <div><h3 id="rma-modal-title" className="text-xl font-black text-slate-900">Initiate RMA</h3><p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{rmaModal.part.partCode} • {rmaModal.part.name}</p></div>
                  <button onClick={() => setRmaModal({ isOpen: false, part: null })} aria-label="Close" className="p-2 text-slate-400 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors"><IconXCircle c="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleSubmitRma} className="space-y-5">
                  <div>
                    <label htmlFor="rmaSupplier" className="block text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Target Supplier Name</label>
                    <select id="rmaSupplier" required value={rmaData.supplierId} onChange={(e) => setRmaData({ ...rmaData, supplierId: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-orange-500 font-bold text-slate-800 cursor-pointer">
                      <option value="">-- Select Target Supplier --</option>
                      {supplierList.map((sup) => (<option key={sup.id} value={sup.id}>{sup.companyName} ({sup.supplierCode})</option>))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="rmaQty" className="block text-xs font-black text-slate-600 uppercase mb-2">Defective Qty</label>
                      <input id="rmaQty" type="number" min="1" max={rmaModal.part.currentStock > 0 ? rmaModal.part.currentStock : undefined} required value={rmaData.quantity} onChange={(e) => setRmaData({ ...rmaData, quantity: parseInt(e.target.value) || 1 })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-600 uppercase mb-2">Refund Value</label>
                      <div className="w-full px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 font-black text-orange-700">{formatLKR(rmaData.quantity * (rmaModal.part.unitPrice || 0))}</div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="rmaReason" className="block text-xs font-black text-slate-600 uppercase mb-2">Reason for Return</label>
                    <textarea id="rmaReason" required rows={3} value={rmaData.reason} onChange={(e) => setRmaData({ ...rmaData, reason: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-700 resize-none" />
                  </div>
                  <button type="submit" disabled={isSubmittingAction} className="w-full bg-slate-900 hover:bg-orange-600 disabled:opacity-60 text-white font-black py-4 rounded-xl transition-colors">{isSubmittingAction ? "Dispatching..." : "Submit RMA Request"}</button>
                </form>
              </div>
            </div>
          )}
        </>,
        portalTarget
      )}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }` }} />
    </div>
  );
}
