// Shared inventory types and helpers.

export interface InventoryPart {
  partID: number;
  partCode: string;
  name: string;
  category: string;
  unitPrice: number;
  costPrice?: number | null;
  currentStock: number;
  minimumStockLevel: number;
  reorderQuantity?: number | null;
  suggestedReorderQuantity?: number;
  active?: boolean;
  lowStock?: boolean;
}

export interface StockMovement {
  movementId: number;
  partId: number;
  partCode: string;
  partName: string;
  type: string;
  quantityChange: number;
  stockAfter: number;
  reference: string | null;
  reason: string | null;
  performedBy: string;
  createdAt: string;
}

export interface LowStockRow {
  part: InventoryPart;
  onOrder: number;
  suggestedOrder: number;
  outOfStock: boolean;
}

export interface InventorySummary {
  activeParts: number;
  discontinuedParts: number;
  totalUnits: number;
  lowStock: number;
  outOfStock: number;
  stockValueAtCost: number;
  stockValueAtRetail: number;
  partsMissingCost: number;
  movementsLast30Days: Record<string, number>;
  topUsedLast30Days: { partId: number; partCode: string; partName: string; quantity: number }[];
}

export const MOVEMENT_LABEL: Record<string, string> = {
  INITIAL: "Opening stock",
  PURCHASE: "Purchase received",
  JOB_USAGE: "Used on job",
  POS_SALE: "Counter sale",
  RMA_OUT: "Returned (defective)",
  RMA_REPLACEMENT: "Replacement received",
  ADJUSTMENT: "Stock count adjustment",
};

export const lkr = (n: number | null | undefined) =>
  `Rs. ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const errText = (err: unknown, fallback: string) => {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  return typeof data === "string" && data.length < 300 ? data : fallback;
};

export function ChangeBadge({ change }: { change: number }) {
  return (
    <span className={`font-black tabular-nums ${change > 0 ? "text-emerald-700" : "text-red-700"}`}>
      {change > 0 ? `+${change}` : `−${Math.abs(change)}`}
    </span>
  );
}
