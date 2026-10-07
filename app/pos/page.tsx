"use client";

import { useState, useEffect, useRef } from "react";
import api from "../../utils/axiosInstance";
import { getErrorMessage } from "../../utils/apiError";
import { downloadReceipt } from "../billing/_components/billing";

interface SparePart {
  partID: number;
  partCode: string;
  name: string;
  category?: string;
  currentStock: number;
  unitPrice: number;
  active?: boolean;
}

interface CartItem extends SparePart {
  quantity: number;
}

interface TransactionHistory {
  transactionId: number;
  customerName: string;
  itemsSummary: string;
  totalRevenue: number;
  transactionDate: string;
}

interface PricingRule {
  id: number;
  ruleName: string;
  ruleType: string;
  percentage: number;
  active?: boolean;
  isActive?: boolean;
}

export default function PointOfSale() {
  const [inventory, setInventory] = useState<SparePart[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<TransactionHistory[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [search, setSearch] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  // Counter payment: method, cash tendered (for change) or card/transfer reference.
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">("CASH");
  const [tendered, setTendered] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [lastSale, setLastSale] = useState<{ invoiceId: number; invoiceNumber: string; receiptNumber: string; change: number } | null>(null);

  const [toast, setToast] = useState<{ show: boolean; type: "success" | "error" | "warning"; title: string; message: string }>({
    show: false, type: "success", title: "", message: ""
  });
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const showToast = (type: "success" | "error" | "warning", title: string, message: string) => {
    setToast({ show: true, type, title, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4500);
  };

  const loadData = () => Promise.all([
    api.get<SparePart[]>("/parts"),
    api.get<TransactionHistory[]>("/pos/history"),
    api.get<PricingRule[]>("/pricing-rules/active").catch(() => ({ data: [] as PricingRule[] })),
  ]);
  const applyData = ([invRes, histRes, rulesRes]: Awaited<ReturnType<typeof loadData>>) => {
    setInventory(invRes.data);
    setHistory([...histRes.data].reverse());
    setPricingRules(rulesRes.data);
  };
  const fetchData = async () => {
    try {
      applyData(await loadData());
    } catch (err) {
      showToast("error", "Couldn't load", getErrorMessage(err, "The parts list couldn't be loaded. Refresh to try again."));
    }
  };

  useEffect(() => {
    let alive = true;
    loadData()
      .then(r => { if (alive) applyData(r); })
      .catch(err => { if (alive) showToast("error", "Couldn't load", getErrorMessage(err, "The parts list couldn't be loaded. Refresh to try again.")); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  const addToCart = (part: SparePart) => {
    setCart(prev => {
      const existing = prev.find(item => item.partCode === part.partCode);
      if (existing) {
        if (existing.quantity >= part.currentStock) {
          showToast("warning", "Stock Limit", `Only ${part.currentStock} unit(s) of ${part.name} available.`);
          return prev;
        }
        return prev.map(item => item.partCode === part.partCode ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...part, quantity: 1 }];
    });
  };

  const updateQuantity = (targetPart: CartItem, newQty: number | string) => {
    if (newQty === "") return;
    let parsedQty = typeof newQty === 'string' ? parseInt(newQty) : newQty;

    if (isNaN(parsedQty) || parsedQty < 1) parsedQty = 1;

    if (parsedQty > targetPart.currentStock) {
      showToast("warning", "Inventory Shortage", `Cannot exceed maximum stock of ${targetPart.currentStock}.`);
      parsedQty = targetPart.currentStock;
    }

    setCart(prev => prev.map(item => item.partCode === targetPart.partCode ? { ...item, quantity: parsedQty } : item));
  };

  const removeFromCart = (targetPart: CartItem) => {
    setCart(prev => prev.filter(item => item.partCode !== targetPart.partCode));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      const formattedCartItems = cart.map(item => ({ partId: item.partID, quantity: item.quantity }));

      const payload = {
        customerName: customerName.trim() || "Walk-in Customer",
        cartItems: formattedCartItems,
        paymentMethod,
        amountTendered: paymentMethod === "CASH" && tendered ? Number(tendered) : null,
        paymentReference: paymentRef || null,
      };

      const res = await api.post("/pos/checkout", payload);
      const { invoice, payment } = res.data;
      const change = payment?.changeGiven ?? 0;

      setLastSale({ invoiceId: invoice.invoiceId, invoiceNumber: invoice.invoiceNumber, receiptNumber: payment.receiptNumber, change });
      showToast("success", "Transaction Complete", `Receipt ${payment.receiptNumber}${change > 0 ? ` — give change Rs. ${change.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}.`);
      setCart([]);
      setCustomerName("");
      setTendered("");
      setPaymentRef("");
      fetchData();
    } catch (err) {
      showToast("error", "Sale not completed", getErrorMessage(err, "The sale couldn't be completed. Nothing was charged."));
    } finally {
      setIsProcessing(false);
    }
  };

  // --- LIVE FINANCIAL CALCULATOR ---
  const subTotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  let totalDiscountPercent = 0;
  let totalTaxPercent = 0;

  pricingRules.forEach(rule => {
    if (rule.ruleType === "DISCOUNT") totalDiscountPercent += rule.percentage;
    if (rule.ruleType === "TAX") totalTaxPercent += rule.percentage;
  });

  const discountAmount = subTotal * (totalDiscountPercent / 100);
  const taxableAmount = subTotal - discountAmount;
  const taxAmount = taxableAmount * (totalTaxPercent / 100);
  const netTotal = taxableAmount + taxAmount;

  // Discontinued parts are kept for history only and can't be sold.
  const q = search.trim().toLowerCase();
  const filteredInventory = inventory.filter(p => p.active !== false && (p.name.toLowerCase().includes(q) || p.partCode.toLowerCase().includes(q)));

  return (
    // Fills the screen below the two-row header on desktop (72px + 56px); on
    // mobile the three panels stack and the page scrolls.
    <div className="min-h-[calc(100vh-128px)] lg:h-[calc(100vh-128px)] bg-slate-100 p-4 relative lg:overflow-hidden animate-fade-in-up">

      <div className={`fixed top-6 right-6 z-[9999] flex items-start gap-4 p-4 min-w-[340px] max-w-md bg-white rounded-xl shadow-2xl border transition-all duration-300 ease-out ${
        toast.show ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'
      } ${
        toast.type === 'success' ? 'border-emerald-500' :
        toast.type === 'error' ? 'border-red-500' : 'border-amber-500'
      }`}>
        <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${
          toast.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
          toast.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
        }`}>
          {toast.type === 'success' && <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>}
          {toast.type === 'error' && <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>}
          {toast.type === 'warning' && <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        </div>
        <div className="pt-0.5">
          <h4 className={`text-sm font-black uppercase tracking-wider ${toast.type === 'success' ? 'text-emerald-700' : toast.type === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{toast.title}</h4>
          <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">{toast.message}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full w-full">

        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h1 className="text-xl font-black text-slate-900 mb-4 tracking-tight">Point of Sale</h1>
            <input type="text" placeholder="Search by SKU or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-sm font-bold text-slate-800 transition-all shadow-sm" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3 content-start">
            {filteredInventory.map(part => (
              <div key={part.partCode} onClick={() => part.currentStock > 0 && addToCart(part)} className={`relative p-4 rounded-xl border transition-all duration-200 select-none flex flex-col justify-between min-h-[130px] ${part.currentStock > 0 ? 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-1 cursor-pointer' : 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'}`}>
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{part.partCode}</span>
                    {part.currentStock > 0 && part.currentStock <= 5 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Low Stock"></span>}
                  </div>
                  <div className="font-bold text-slate-800 leading-tight line-clamp-2 text-sm">{part.name}</div>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <div className="text-sm font-black text-blue-600 tracking-tight">Rs. {part.unitPrice.toLocaleString()}</div>
                  <div className={`text-[10px] font-bold px-2 py-1 rounded-md ${part.currentStock > 10 ? 'bg-emerald-50 text-emerald-600' : part.currentStock > 0 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                    {part.currentStock > 0 ? `${part.currentStock} stock` : 'Out'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-1 bg-slate-900 rounded-2xl shadow-xl flex flex-col h-full overflow-hidden border border-slate-800">
          <div className="p-5 border-b border-slate-800 bg-slate-950">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black text-white">Cart</h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">{cart.length} items</span>
            </div>

            {/* NEW: VISIBLE ACTIVE RULES BANNER */}
            <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">Active Rules:</span>
                {pricingRules.length === 0 ? (
                    <span className="text-[10px] font-bold text-slate-700">None Applied</span>
                ) : (
                    pricingRules.map(rule => (
                        <span key={rule.id} className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${rule.ruleType === 'TAX' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {rule.ruleName} ({rule.percentage}%)
                        </span>
                    ))
                )}
            </div>

            <input type="text" placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none placeholder-slate-500 text-sm font-medium focus:border-blue-500 transition-all" />
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
                <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                <p className="text-xs font-bold">Cart is empty</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.partCode} className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="pr-2">
                      <div className="text-sm font-bold text-slate-100 leading-tight">{item.name}</div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1 uppercase">{item.partCode}</div>
                    </div>
                    <button onClick={() => removeFromCart(item)} className="text-slate-500 hover:text-red-400 p-1 transition-colors">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/50 p-1.5 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-1 bg-slate-800 rounded-md p-1">
                      <button onClick={() => updateQuantity(item, item.quantity - 1)} disabled={item.quantity <= 1} className="w-6 h-6 flex items-center justify-center rounded bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-30 text-xs font-bold">-</button>
                      <input type="number" value={item.quantity} onChange={(e) => updateQuantity(item, e.target.value)} className="w-8 h-6 bg-transparent text-center text-xs font-bold text-white outline-none appearance-none" min="1" max={item.currentStock} />
                      <button onClick={() => updateQuantity(item, item.quantity + 1)} disabled={item.quantity >= item.currentStock} className="w-6 h-6 flex items-center justify-center rounded bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-30 text-xs font-bold">+</button>
                    </div>
                    <div className="text-xs font-black text-blue-400">Rs. {(item.quantity * item.unitPrice).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-slate-950 border-t border-slate-800 text-white">

            {/* FIX: PERMANENTLY VISIBLE TAX & DISCOUNT LINES */}
            <div className="space-y-2 mb-4 border-b border-slate-800 pb-4">
              <div className="flex justify-between text-xs font-medium text-slate-400">
                <span>Subtotal</span>
                <span>Rs. {subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className={`flex justify-between text-xs font-bold ${totalDiscountPercent > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                <span>Discount ({totalDiscountPercent}%)</span>
                <span>- Rs. {discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className={`flex justify-between text-xs font-bold ${totalTaxPercent > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                <span>Tax ({totalTaxPercent}%)</span>
                <span>+ Rs. {taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="flex justify-between items-end mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase">Net Total</span>
              <span className="text-2xl font-black text-white">Rs. {netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {/* PAYMENT */}
            <div className="mb-4 space-y-2">
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Payment method">
                {([["CASH", "Cash"], ["CARD", "Card"], ["BANK_TRANSFER", "Transfer"]] as const).map(([key, label]) => (
                  <button key={key} type="button" role="radio" aria-checked={paymentMethod === key} onClick={() => setPaymentMethod(key)}
                    className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider border ${paymentMethod === key ? "bg-white text-slate-900 border-white" : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {paymentMethod === "CASH" && (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step="0.01" value={tendered} onChange={e => setTendered(e.target.value)} placeholder="Cash tendered" aria-label="Cash tendered"
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none placeholder-slate-500 text-sm font-bold focus:border-blue-500" />
                  {tendered && Number(tendered) >= netTotal && cart.length > 0 && (
                    <span className="text-xs font-black text-emerald-400 whitespace-nowrap">Change Rs. {(Number(tendered) - netTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  )}
                  {tendered && Number(tendered) < netTotal && cart.length > 0 && <span className="text-xs font-black text-red-400">Short</span>}
                </div>
              )}
              {paymentMethod !== "CASH" && (
                <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} maxLength={paymentMethod === "CARD" ? 20 : 60}
                  placeholder={paymentMethod === "CARD" ? "Terminal slip / approval no." : "Transfer reference"} aria-label="Payment reference"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg outline-none placeholder-slate-500 text-sm font-bold focus:border-blue-500" />
              )}
            </div>

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing || (paymentMethod === "CASH" && (!tendered || Number(tendered) < netTotal)) || (paymentMethod !== "CASH" && paymentRef.trim().length < 4)}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-black uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:shadow-none"
            >
              {isProcessing ? "Processing..." : "Checkout"}
            </button>

            {lastSale && (
              <div className="mt-3 p-3 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between gap-2">
                <div className="text-xs">
                  <p className="font-black text-white">Last sale · {lastSale.receiptNumber}</p>
                  {lastSale.change > 0 && <p className="font-bold text-emerald-400">Change: Rs. {lastSale.change.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}
                </div>
                <button onClick={() => downloadReceipt(lastSale.invoiceId, lastSale.invoiceNumber).catch(() => showToast("error", "Receipt", "Couldn't download the receipt."))}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider bg-white text-slate-900 hover:bg-slate-200">
                  Receipt PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-black text-slate-900">Ledger</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {history.length === 0 ? (
              <div className="text-center text-slate-400 text-xs font-bold mt-10">No recent sales.</div>
            ) : (
              history.map(txn => (
                <div key={txn.transactionId} className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:border-blue-200 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-slate-900 text-xs truncate pr-2">{txn.customerName}</div>
                    <div className="text-[10px] font-black text-emerald-600 shrink-0">
                      Rs. {txn.totalRevenue.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 whitespace-pre-line mb-2 leading-relaxed bg-white p-2 rounded border border-slate-100">
                    {txn.itemsSummary}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    {new Date(txn.transactionDate).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}