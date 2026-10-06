"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import api from "../../../utils/axiosInstance";
import { getErrorMessage } from "../../../utils/apiError";
import { downloadFile } from "../../billing/_components/billing";
import FuelPassScanner from "./FuelPassScanner";
import { FuelPass, FuelPassSettings, QuotaBar, categoryName, litres } from "./fuelPass";
import { parseSaleSpeech } from "./saleSpeech";
import { useSaleVoice, VoiceProblem } from "./useSaleVoice";

// Pump number is optional here: an attendant's pump comes from their open
// shift on the server; only a supervisor covering a pump picks one.
const fuelSaleSchema = z.object({
  fuelType: z.string().min(1, "Select a fuel type."),
  pumpNumber: z.string().optional(),
  litersPumped: z.coerce.number().gt(0, "Liters must be greater than 0.").max(1000, "A single sale can't exceed 1000 L."),
  paymentMethod: z.enum(["CASH", "CARD", "QR"]),
  // Optional: links the sale to a registered customer so they get the receipt in their portal.
  vehicleRegNo: z.string().trim().regex(/^[A-Za-z0-9 -]{3,15}$/, "Use letters, digits and dashes, e.g. CAB-4521.").or(z.literal("")).optional(),
});

// z.coerce makes the raw input type differ from the parsed output type.
type FuelSaleFormInputs = z.input<typeof fuelSaleSchema>;
type FuelSaleFormValues = z.output<typeof fuelSaleSchema>;

interface FuelSale {
  saleId: number;
  fuelType: string;
  pumpNumber: number;
  litersPumped: number;
  totalCost: number;
  saleDate: string;
  attendantName?: string;
  recordedBy?: string;
  status?: string | null;
  voidReason?: string;
  voidedBy?: string;
  unitPrice?: number | null;
  paymentMethod?: string | null;
  vehicleRegNo?: string | null;
  quotaSource?: string | null;
  quotaReference?: string | null;
}

// The amounts drivers ask for most (they match the weekly quota steps).
const QUICK_LITRES = [5, 10, 15, 20, 25, 40];
// Drivers as often ask by money ("2000 of petrol").
const QUICK_RUPEES = [500, 1000, 1500, 2000, 3000, 5000];
// Litres worked out from a rupee amount keep 5 decimals, so litres x price rounds
// back to exactly the amount asked for (true for any price under Rs. 1000 / L).
const litresForRupees = (rupees: number, pricePerLiter: number) => Math.round((rupees / pricePerLiter) * 1e5) / 1e5;
const QUOTA_LABEL: Record<string, string> = { LOCAL_PASS: "Station pass", NATIONAL_FUEL_PASS: "National Fuel Pass" };

// A colour per fuel so the buttons are told apart at a glance. The buttons
// themselves come from the tanks; a tank with another name gets the fallback.
const FUEL_STYLES: Record<string, { on: string; icon: string }> = {
  "Petrol 92": { on: "bg-emerald-600 border-emerald-600", icon: "bg-emerald-100 text-emerald-700" },
  "Petrol 95": { on: "bg-red-600 border-red-600", icon: "bg-red-100 text-red-700" },
  "Auto Diesel": { on: "bg-amber-600 border-amber-600", icon: "bg-amber-100 text-amber-700" },
  "Super Diesel": { on: "bg-indigo-600 border-indigo-600", icon: "bg-indigo-100 text-indigo-700" },
};
const FUEL_STYLE_FALLBACK = { on: "bg-slate-900 border-slate-900", icon: "bg-slate-100 text-slate-700" };

// Marks a value that voice filled in, until the attendant taps or edits that field.
const VOICE_RING = "ring-4 ring-violet-400/70";
const VOICE_PROBLEMS: Record<VoiceProblem, string> = {
  unclear: "Didn't catch that clearly — please tap to enter",
  blocked: "The microphone is blocked for this site — please tap to enter",
  offline: "Voice needs an internet connection — please tap to enter",
};

// "amount" is the litres or the rupees, whichever the sale is entered by.
type VoiceField = "pump" | "fuel" | "amount" | "payment";

const VOICE_PREF = "fuelPos.voice";
const SINHALA_PREF = "fuelPos.sinhala";
// Storage can be unavailable (private mode, server render); the default then applies.
function readPref(key: string, fallback: boolean) {
  try {
    const saved = window.localStorage.getItem(key);
    return saved === null ? fallback : saved === "1";
  } catch {
    return fallback;
  }
}
function writePref(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {}
}

function VoiceTag() {
  return <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-100 text-[10px] font-black uppercase tracking-widest text-violet-700">Voice · check</span>;
}

function FuelIcon({ fuelType }: { fuelType: string }) {
  return /diesel/i.test(fuelType) ? (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3s6 6.5 6 11a6 6 0 11-12 0c0-4.5 6-11 6-11z" />
    </svg>
  );
}

interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

const PAGE_SIZE = 25;
const PAYMENT_LABELS: Record<string, string> = { CASH: "Cash", CARD: "Card", QR: "QR" };

interface FuelTank {
  tankId: number;
  fuelType: string;
  pricePerLiter: number;
}

interface PumpAssignment {
  id: number;
  pumpNumber: number;
  attendantUsername: string;
  shiftStartedAt: string;
}

// The pump sale form and the sales history. An attendant serving a queue gets the
// sale form alone (/fuel) and opens the history on its own page (/fuel/history);
// supervisors see both side by side, and read-only roles see just the history.
export default function FuelPosScreen({ historyOnly = false }: { historyOnly?: boolean }) {
  const { user } = useAuth();

  const role = user?.role;
  const isAttendant = role === "FUEL_ATTENDANT";
  // Only these roles can void, and they match the backend's @PreAuthorize.
  const isSupervisor = role === "FUEL_STATION_SUPERVISOR" || role === "SUPER_ADMIN";
  // Owners and Finance may read the ledger but can't ring up or void sales.
  const canSell = isAttendant || isSupervisor;
  const showForm = canSell && !historyOnly;
  const showHistory = historyOnly || !isAttendant;

  const [sales, setSales] = useState<FuelSale[]>([]);
  // Sales are paged on the server; the list no longer downloads every sale.
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSales, setTotalSales] = useState(0);
  const [tanks, setTanks] = useState<FuelTank[]>([]);
  const [activeShifts, setActiveShifts] = useState<PumpAssignment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [serverMessage, setServerMessage] = useState({ type: "", text: "" });
  const [isMounted, setIsMounted] = useState(false);

  // The sale just recorded, kept on the clean pump screen so its receipt is one tap away.
  const [lastSale, setLastSale] = useState<FuelSale | null>(null);

  const [voidModal, setVoidModal] = useState<{ isOpen: boolean; saleId: number | null; reason: string; isSubmitting: boolean }>({
    isOpen: false, saleId: null, reason: "", isSubmitting: false,
  });

  // Fuel pass: the QR the driver shows. Its remaining weekly quota caps the sale.
  const [passSettings, setPassSettings] = useState<FuelPassSettings | null>(null);
  const [pass, setPass] = useState<FuelPass | null>(null);
  const [scanner, setScanner] = useState({ open: false, busy: false, error: "" });
  const [quotaChoice, setQuotaChoice] = useState<"LOCAL" | "NATIONAL">("LOCAL");

  // For the spoken "confirm": the sale as it stood when the mic was opened, and
  // whether anything was tapped or typed since.
  const saleAtMicTap = useRef("");
  const editedSinceMicTap = useRef(false);

  const { register, handleSubmit, reset, watch, setValue, getValues, setFocus, formState: { errors, isSubmitting } } = useForm<FuelSaleFormInputs, unknown, FuelSaleFormValues>({
    resolver: zodResolver(fuelSaleSchema),
    defaultValues: { fuelType: "", pumpNumber: "", paymentMethod: "CASH", vehicleRegNo: "" },
  });

  // Voice only pre-fills the form below; it never records a sale. On by default
  // where the browser can do it, and an attendant who prefers tapping turns it off.
  // Both choices are remembered on the device, since a phone reloads the page often.
  const [voiceOn, setVoiceOn] = useState(() => readPref(VOICE_PREF, true));
  const [sinhala, setSinhala] = useState(() => readPref(SINHALA_PREF, false));
  const [voiceFilled, setVoiceFilled] = useState<Partial<Record<VoiceField, boolean>>>({});
  const [voiceNote, setVoiceNote] = useState<{ text: string; heard?: string } | null>(null);

  // The sale can be keyed by litres or by rupees: there is a box for each, and the
  // one typed in last drives the other. Rupees are turned into litres here, because
  // litres are what the sale records and what the server prices.
  const [amountMode, setAmountMode] = useState<"LITRES" | "RUPEES">("LITRES");
  const [rupees, setRupees] = useState("");
  // What the driver handed over, to show the change. Never sent to the server.
  const [tendered, setTendered] = useState("");

  const selectedFuel = watch("fuelType");
  const selectedPump = watch("pumpNumber");
  const selectedPayment = watch("paymentMethod");
  const pumpedVolume = parseFloat(String(watch("litersPumped") ?? "")) || 0;

  const activeTank = tanks.find((t) => t.fuelType === selectedFuel);
  const livePricePerLiter = activeTank ? activeTank.pricePerLiter : 0;
  const estimatedTotal = pumpedVolume * livePricePerLiter;
  const changeDue = Math.round(((Number(tendered) || 0) - estimatedTotal) * 100) / 100;
  const rupeeAmount = Number(rupees) || 0;
  const rupeeLitres = amountMode === "RUPEES" && rupeeAmount > 0 && livePricePerLiter > 0 ? litresForRupees(rupeeAmount, livePricePerLiter) : null;

  // Follows the amount, the fuel picked and any price change while the form is open.
  useEffect(() => {
    if (amountMode !== "RUPEES") return;
    setValue("litersPumped", rupeeLitres ?? "", { shouldValidate: rupeeLitres !== null });
  }, [amountMode, rupeeLitres, setValue]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // Sales are already filtered and sorted server-side (attendants only
      // receive their own).
      if (showHistory) {
        const salesRes = await api.get<PageResponse<FuelSale>>("/fuel", { params: { page, size: PAGE_SIZE } });
        setSales(salesRes.data.content);
        setTotalPages(Math.max(1, salesRes.data.totalPages));
        setTotalSales(salesRes.data.totalElements);
      }
      if (showForm) {
        const [tanksRes, shiftsRes] = await Promise.all([
          api.get<FuelTank[]>("/tanks"),
          api.get<PumpAssignment[]>("/pumps/active"),
        ]);
        setTanks(tanksRes.data);
        setActiveShifts(shiftsRes.data);
      }
      setLoadError("");
    } catch (err) {
      setLoadError(getErrorMessage(err, "Couldn't load pump data. Check that the server is running."));
    }
  }, [user, showForm, showHistory, page]);

  useEffect(() => {
    setIsMounted(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!canSell) return;
    api.get<FuelPassSettings>("/fuel-pass/settings").then(res => setPassSettings(res.data)).catch(() => setPassSettings(null));
  }, [canSell]);

  const passRequired = passSettings?.required ?? false;
  const localOn = passSettings?.localEnabled ?? true;
  const nationalOn = passSettings?.nationalEnabled ?? false;
  // Which quota authority this sale goes through. Our own pass is the default when both are on.
  const via: "LOCAL" | "NATIONAL" = nationalOn && (!localOn || quotaChoice === "NATIONAL") ? "NATIONAL" : "LOCAL";
  const passBlocked = via === "LOCAL" && !!pass && (pass.status !== "ACTIVE" || pass.remaining <= 0);

  // National Fuel Pass: the quota is checked and deducted in the official app. Here the
  // attendant only notes what was pumped — recording the sale is their confirmation that
  // it was deducted there, so nothing extra is typed or ticked while a queue waits.
  const quotaMissing = passRequired && via === "LOCAL" && !pass;

  const onScanned = useCallback(async (text: string) => {
    setScanner({ open: true, busy: true, error: "" });
    try {
      const res = await api.get<FuelPass>("/fuel-pass/lookup", { params: { code: text } });
      setPass(res.data);
      setServerMessage({ type: "", text: "" });
      setScanner({ open: false, busy: false, error: "" });
    } catch (err) {
      setScanner({ open: true, busy: false, error: getErrorMessage(err, "Couldn't check that fuel pass.") });
    }
  }, []);

  const closeScanner = useCallback(() => setScanner({ open: false, busy: false, error: "" }), []);

  const myShift = activeShifts.find((a) => a.attendantUsername === user?.username);
  const sellableTanks = tanks.filter((t) => t.pricePerLiter > 0);
  const salesLocked = isAttendant ? !myShift : activeShifts.length === 0;

  const flash = (type: "success" | "error", text: string) => {
    setServerMessage({ type, text });
    if (type === "success") setTimeout(() => setServerMessage({ type: "", text: "" }), 3000);
  };

  // Tapping a value is also how a misheard one is corrected, so it drops the voice mark.
  const touched = (field: VoiceField) => {
    editedSinceMicTap.current = true;
    setVoiceFilled((v) => (v[field] ? { ...v, [field]: false } : v));
  };
  const choosePump = (pumpNumber: number) => { setValue("pumpNumber", String(pumpNumber)); touched("pump"); };
  const chooseFuel = (fuelType: string) => { setValue("fuelType", fuelType, { shouldValidate: true }); touched("fuel"); };
  // Entering one of the two amounts makes it the one the other is worked out from.
  const litresEdited = () => { setAmountMode("LITRES"); setRupees(""); touched("amount"); };
  const chooseLitres = (amount: number) => { setValue("litersPumped", amount, { shouldValidate: true }); litresEdited(); };
  const chooseRupees = (amount: string) => { setAmountMode("RUPEES"); setRupees(amount); touched("amount"); };

  const voice = useSaleVoice({
    sinhala,
    onHeard: (transcript) => {
      const parsed = parseSaleSpeech(transcript, {
        // An attendant's pump is fixed by their shift, so a spoken pump is ignored.
        pumps: isSupervisor ? activeShifts.map((s) => s.pumpNumber) : [],
        fuelTypes: sellableTanks.map((t) => t.fuelType),
      });

      // "Confirm", said on its own after the form is filled, records the sale — the
      // spoken stand-in for the record button. It goes through the same checks as
      // the button, and is refused if anything changed while the mic was open.
      if (parsed.confirm) {
        const sale = getValues();
        const ready = !!sale.fuelType && Number(sale.litersPumped) > 0 && (!isSupervisor || !!sale.pumpNumber) && !passBlocked && !quotaMissing && !isSubmitting;
        if (!ready) setVoiceNote({ text: "Nothing to confirm yet — the fuel and the amount are needed first.", heard: transcript });
        else if (editedSinceMicTap.current || JSON.stringify(sale) !== saleAtMicTap.current) setVoiceNote({ text: "The sale changed while listening — check it and tap the record button.", heard: transcript });
        else {
          setVoiceNote({ text: "Confirmed by voice — recording the sale.", heard: transcript });
          handleSubmit(onSubmit)();
        }
        return;
      }

      // Saying it again replaces the first attempt: whatever voice filled in and nobody
      // has since corrected by hand is dropped, so a misheard number can't linger.
      if (voiceFilled.pump) setValue("pumpNumber", "");
      if (voiceFilled.fuel) setValue("fuelType", "");
      if (voiceFilled.payment) setValue("paymentMethod", "CASH");
      if (voiceFilled.amount) {
        setRupees("");
        setValue("litersPumped", "");
      }
      setVoiceFilled({});

      const filled = {
        pump: parsed.pumpNumber !== undefined,
        fuel: parsed.fuelType !== undefined,
        amount: parsed.liters !== undefined || parsed.rupees !== undefined,
        payment: parsed.paymentMethod !== undefined,
      };
      if (!filled.pump && !filled.fuel && !filled.amount && !filled.payment) {
        setVoiceNote({ text: VOICE_PROBLEMS.unclear, heard: transcript });
        return;
      }
      // Only what was heard is written; values tapped in by hand are left alone.
      if (parsed.pumpNumber !== undefined) setValue("pumpNumber", String(parsed.pumpNumber));
      if (parsed.fuelType !== undefined) setValue("fuelType", parsed.fuelType, { shouldValidate: true });
      if (parsed.paymentMethod !== undefined) setValue("paymentMethod", parsed.paymentMethod);
      if (parsed.liters !== undefined) {
        setAmountMode("LITRES");
        setRupees("");
        setValue("litersPumped", parsed.liters, { shouldValidate: true });
      } else if (parsed.rupees !== undefined) {
        setAmountMode("RUPEES");
        setRupees(String(parsed.rupees));
      }
      setVoiceFilled(filled);
      const missed = [isSupervisor && !filled.pump && "pump", !filled.fuel && "fuel", !filled.amount && "amount"].filter(Boolean);
      // A number said without its unit was read by its size; say which way, so it gets checked.
      const assumed = parsed.amountAssumed ? `Took ${parsed.liters ?? parsed.rupees} as ${parsed.liters !== undefined ? "litres" : "rupees"}. ` : "";
      setVoiceNote({
        text: assumed + (missed.length ? `Not heard: ${missed.join(", ")} — check and tap to enter.` : "Check the highlighted values, then tap record — or tap the mic and say “confirm”."),
        heard: transcript,
      });
    },
    onProblem: (problem) => setVoiceNote({ text: VOICE_PROBLEMS[problem] }),
  });
  const voiceReady = voice.supported && voiceOn;

  const startVoice = () => {
    // What the attendant is looking at as the mic opens; "confirm" records only this.
    saleAtMicTap.current = JSON.stringify(getValues());
    editedSinceMicTap.current = false;
    setVoiceNote(null);
    voice.start();
  };

  const onSubmit = async (data: FuelSaleFormValues) => {
    setServerMessage({ type: "", text: "" });
    // The chosen pump's shift may have been closed since it was picked.
    if (isSupervisor && !activeShifts.some((s) => String(s.pumpNumber) === data.pumpNumber)) {
      flash("error", "Select the pump this sale was made on.");
      return;
    }
    if (quotaMissing) {
      flash("error", "Scan the vehicle's fuel pass before selling fuel.");
      return;
    }
    const usePass = via === "LOCAL" ? pass : null;
    if (usePass && data.litersPumped > usePass.remaining) {
      flash("error", `${usePass.vehicleRegNo} has only ${litres(usePass.remaining)} left this week.`);
      return;
    }
    try {
      const response = await api.post<FuelSale>("/fuel/sell", {
        fuelType: data.fuelType,
        litersPumped: data.litersPumped,
        pumpNumber: isSupervisor ? Number(data.pumpNumber) : undefined,
        paymentMethod: data.paymentMethod,
        vehicleRegNo: usePass ? undefined : data.vehicleRegNo || undefined,
        fuelPassCode: usePass?.code,
        nationalConfirmed: via === "NATIONAL" || undefined,
      });
      setLastSale(response.data);
      flash("success", `Transaction #${response.data.saleId} recorded — Rs. ${response.data.totalCost.toFixed(2)}.${showHistory ? ' Use "Receipt" in the list to print it.' : ""}`);
      // Keep pump and fuel selected for the next customer; clear the liters.
      reset({ fuelType: data.fuelType, pumpNumber: data.pumpNumber, litersPumped: "", paymentMethod: "CASH", vehicleRegNo: "" });
      // The next vehicle scans its own pass / is confirmed afresh.
      setPass(null);
      setAmountMode("LITRES");
      setRupees("");
      setTendered("");
      setVoiceFilled({});
      setVoiceNote(null);
      // Ready for the next vehicle's litres straight away — with a keyboard only;
      // on a phone the focus would open the keypad over the quick buttons.
      if (window.matchMedia("(pointer: fine)").matches) setTimeout(() => setFocus("litersPumped"), 0);
      // Show the new sale at the top.
      setPage(0);
      fetchData();
    } catch (err) {
      flash("error", getErrorMessage(err, "Transaction failed."));
      // The quota may have moved since the scan (another pump, a voided sale): show the current figure.
      if (usePass) api.get<FuelPass>("/fuel-pass/lookup", { params: { code: usePass.code } }).then(res => setPass(res.data)).catch(() => {});
    }
  };

  const printReceipt = async (saleId: number) => {
    try {
      await downloadFile(`/fuel/${saleId}/receipt`, `fuel-receipt-${saleId}.pdf`);
    } catch (err) {
      flash("error", getErrorMessage(err, "Couldn't download the receipt."));
    }
  };

  const executeVoid = async () => {
    if (!voidModal.saleId || voidModal.reason.trim().length < 5) return;
    setVoidModal((m) => ({ ...m, isSubmitting: true }));
    try {
      await api.post(`/fuel/${voidModal.saleId}/void`, { reason: voidModal.reason.trim() });
      flash("success", "Transaction voided and logged to the audit trail.");
      fetchData();
    } catch (err) {
      flash("error", getErrorMessage(err, "Failed to void transaction."));
    } finally {
      setVoidModal({ isOpen: false, saleId: null, reason: "", isSubmitting: false });
    }
  };

  if (!isMounted) return null;

  const messageBanner = serverMessage.text ? (
    <div role="status" className={`p-2.5 rounded-xl text-sm font-bold text-center ${serverMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {serverMessage.text}
    </div>
  ) : null;

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] relative animate-fade-in-up">
      {scanner.open && <FuelPassScanner onDetected={onScanned} onClose={closeScanner} busy={scanner.busy} error={scanner.error} />}

      {/* The attendant's pump screen keeps its heading to one short row, so the form starts near the top of a phone. */}
      <div className={`flex justify-between gap-4 ${showForm && !showHistory ? "mb-4 md:mb-8 flex-row items-center" : "mb-8 flex-col md:flex-row md:items-end"}`}>
        <div>
          <h1 className={`font-black text-slate-900 tracking-tight ${showForm && !showHistory ? "text-xl md:text-3xl" : "text-3xl"}`}>{historyOnly ? "Pump Sales History" : "Fuel Station POS"}</h1>
          <p className={`text-slate-500 font-medium mt-1 ${showForm && !showHistory ? "hidden md:block" : ""}`}>
            {historyOnly
              ? isAttendant ? "Every sale you recorded, with its receipt." : "The pump sales ledger."
              : !showHistory ? "Record pump sales." : canSell ? "Process live pump sales and maintain ledger." : "Read-only view of the pump sales ledger."}
          </p>
        </div>
        {/* The history lives on its own page for attendants, opened in a new tab so the pump screen stays put. */}
        {showForm && !showHistory && (
          <Link href="/fuel/history" target="_blank"
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 rounded-xl bg-white border-2 border-slate-900 text-xs font-black uppercase tracking-widest text-slate-900 hover:bg-slate-900 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span><span className="hidden sm:inline">My sales </span>history</span>
          </Link>
        )}
        {historyOnly && canSell && (
          <Link href="/fuel"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-700 transition-colors">
            ← Back to POS
          </Link>
        )}
        <div className={`${showForm && !showHistory ? "hidden" : ""} px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${isSupervisor ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-200 text-slate-600 border-slate-300'}`}>
          {isSupervisor ? 'Manager Mode Active' : isAttendant ? 'Attendant POS Mode' : 'Ledger View'}
        </div>
      </div>

      {loadError && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-bold text-red-700 flex justify-between items-center gap-4">
          <span>{loadError}</span>
          <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-black uppercase tracking-widest">Retry</button>
        </div>
      )}

      {/* Without the sale form (history page, closed shift) there is no footer to carry the message. */}
      {(!showForm || salesLocked) && messageBanner && <div className="mb-6">{messageBanner}</div>}

      <div className={`grid grid-cols-1 ${showForm && showHistory ? 'xl:grid-cols-3' : ''} gap-8`}>
        {/* --- LEFT: LOG SALE FORM --- */}
        {showForm && (
        <div className={showHistory ? "xl:col-span-1" : "w-full max-w-xl mx-auto"}>
          <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-200 xl:sticky xl:top-6">
            <div className="flex items-center justify-between gap-3 min-h-11 mb-2 md:mb-3 border-b border-slate-100 pb-2 md:pb-3">
              <h2 className="flex items-center gap-2 text-lg md:text-xl font-bold text-slate-800">
                Record Sale
                {/* Locked to the attendant's shift; the server enforces this too. */}
                {isAttendant && myShift && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-black uppercase tracking-widest">Pump {myShift.pumpNumber}</span>
                )}
              </h2>
              {/* --- VOICE PRE-FILL (optional) --- No mic and no message where the browser
                  can't do it — tapping is the whole form there. */}
              {voiceReady && !salesLocked && (
                <button type="button" onClick={voice.listening ? voice.stop : startVoice}
                  aria-label={voice.listening ? "Stop listening" : "Speak the sale"} aria-pressed={voice.listening}
                  title="Hands busy? Say the sale — it only fills the form, you still check it and record."
                  className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white transition-colors ${voice.listening ? "bg-red-600 animate-pulse" : "bg-slate-900 hover:bg-slate-700"}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
            </div>

            {salesLocked ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-bold text-amber-800">
                {isAttendant
                  ? "You don't have an open shift. Ask your supervisor to assign you to a pump before recording sales."
                  : "No pump has an open shift. Assign an attendant from the dashboard first."}
              </div>
            ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              {/* --- FUEL QUOTA --- */}
              {localOn && nationalOn && (
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100" role="tablist" aria-label="Quota check">
                  {([["LOCAL", "Station pass"], ["NATIONAL", "National Fuel Pass"]] as const).map(([key, label]) => (
                    <button key={key} type="button" role="tab" aria-selected={via === key} onClick={() => setQuotaChoice(key)}
                      className={`py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors ${via === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {via === "NATIONAL" ? (
                <div className="flex items-center gap-3 rounded-xl px-3 py-2 border border-indigo-200 bg-indigo-50">
                  <p className="min-w-0 flex-1 text-[11px] font-medium text-slate-700">
                    <span className="font-black text-indigo-700">National Fuel Pass.</span> Deduct the litres in the official app first — the quota is checked there, not here.
                  </p>
                  <a href={passSettings?.nationalStationUrl || "https://fuelpass.gov.lk/"} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-black uppercase tracking-widest">
                    Open app
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              ) : pass ? (
                <div className={`rounded-2xl p-4 border-2 ${passBlocked ? "border-red-300 bg-red-50" : "border-emerald-300 bg-emerald-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-[10px] font-black uppercase tracking-widest ${passBlocked ? "text-red-700" : "text-emerald-700"}`}>
                        {pass.status !== "ACTIVE" ? "Pass suspended" : pass.remaining <= 0 ? "Weekly quota used up" : "Fuel pass verified"}
                      </p>
                      <p className="text-2xl font-black font-mono text-slate-900 truncate">{pass.vehicleRegNo}</p>
                      <p className="text-xs font-bold text-slate-600 truncate">
                        {categoryName(pass.vehicleCategory)}{pass.ownerName ? ` · ${pass.ownerName}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-2xl font-black ${passBlocked ? "text-red-700" : "text-emerald-700"}`}>{litres(pass.remaining)}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">left this week</p>
                    </div>
                  </div>
                  <div className="mt-3"><QuotaBar pass={pass} /></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!passBlocked && (
                      <button type="button" onClick={() => chooseLitres(pass.remaining)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-[11px] font-black uppercase tracking-widest text-emerald-800 hover:bg-emerald-100">
                        Fill remaining {litres(pass.remaining)}
                      </button>
                    )}
                    <button type="button" onClick={() => setScanner({ open: true, busy: false, error: "" })}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-100">
                      Scan another
                    </button>
                    <button type="button" onClick={() => setPass(null)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800">
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setScanner({ open: true, busy: false, error: "" })}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V5a1 1 0 011-1h3M4 16v3a1 1 0 001 1h3m8-16h3a1 1 0 011 1v3m0 8v3a1 1 0 01-1 1h-3M8 8h3v3H8V8zm5 5h3v3h-3v-3zm-5 1h2m4-6h2" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">Scan fuel pass QR</span>
                    <span className="block text-xs font-medium text-slate-500">
                      {passRequired ? "Required before fuel can be sold." : "Optional — checks the vehicle's weekly quota."}
                    </span>
                  </span>
                </button>
              )}

              {/* What the mic is doing or heard; takes no room until it is used. */}
              {voiceReady && (voice.listening || voiceNote) && (
                <p role="status" className="px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 text-[11px] font-bold text-violet-800">
                  {voice.listening
                    ? <>Listening… say &ldquo;{isSupervisor ? "pump 2, " : ""}petrol 92, 2000&rdquo; for rupees or &ldquo;petrol 92, 20 litres&rdquo;. It only fills the form; &ldquo;confirm&rdquo; on its own records what is shown.</>
                    : voiceNote?.text}
                  {!voice.listening && voiceNote?.heard && <span className="font-medium text-slate-500"> · Heard: &ldquo;{voiceNote.heard}&rdquo;</span>}
                </p>
              )}

              {!isAttendant && (
                <div>
                  <p className="block text-xs font-bold text-slate-700 mb-1">Pump{voiceFilled.pump && <VoiceTag />}</p>
                  <input type="hidden" {...register("pumpNumber")} />
                  <div className="grid grid-cols-3 gap-2">
                    {activeShifts
                      .slice()
                      .sort((a, b) => a.pumpNumber - b.pumpNumber)
                      .map((s) => {
                        const on = selectedPump === String(s.pumpNumber);
                        return (
                          <button key={s.id} type="button" aria-pressed={on} onClick={() => choosePump(s.pumpNumber)}
                            className={`min-h-12 px-2 py-1 rounded-xl border-2 text-center transition-colors ${on ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-800 hover:border-slate-400"} ${on && voiceFilled.pump ? VOICE_RING : ""}`}>
                            <span className="block text-xl font-black leading-tight">{s.pumpNumber}</span>
                            <span className="block text-[10px] font-bold truncate opacity-70">{s.attendantUsername}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              <div>
                {/* The buttons name themselves; a voice-filled one carries the violet ring. */}
                <input type="hidden" {...register("fuelType")} />
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Fuel Type">
                  {/* Built from the real tanks; unpriced tanks can't be sold. */}
                  {sellableTanks.map((t) => {
                    const on = selectedFuel === t.fuelType;
                    const style = FUEL_STYLES[t.fuelType] ?? FUEL_STYLE_FALLBACK;
                    return (
                      <button key={t.tankId} type="button" aria-pressed={on} onClick={() => chooseFuel(t.fuelType)}
                        className={`min-h-11 flex items-center gap-2.5 px-2.5 max-[400px]:gap-1.5 max-[400px]:px-2 py-1 rounded-xl border-2 text-left transition-colors ${on ? `${style.on} text-white` : `bg-white text-slate-800 hover:border-slate-400 ${errors.fuelType ? "border-red-300" : "border-slate-200"}`} ${on && voiceFilled.fuel ? VOICE_RING : ""}`}>
                        <span className={`w-8 h-8 max-[400px]:w-6 max-[400px]:h-6 shrink-0 rounded-lg flex items-center justify-center ${on ? "bg-white/20 text-white" : style.icon}`}>
                          <FuelIcon fuelType={t.fuelType} />
                        </span>
                        <span className="min-w-0">
                          {/* Narrow phones: smaller, so "Super Diesel" is never cut short. */}
                          <span className="block text-sm max-[400px]:text-xs font-black truncate">{t.fuelType}</span>
                          <span className="block text-[11px] font-bold opacity-70">Rs. {t.pricePerLiter.toLocaleString(undefined, { minimumFractionDigits: 2 })} / L</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {errors.fuelType && <p className="mt-1 text-xs font-bold text-red-500">{errors.fuelType.message}</p>}
              {tanks.length > 0 && sellableTanks.length === 0 && (
                <p className="text-xs font-bold text-amber-600">No tank has a pump price set yet — a supervisor must set one first.</p>
              )}

              {/* --- AMOUNT: by litres or by rupees, no switch between them. One tap on either
                  row of usual amounts, or type in either box; the other box follows. */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Usual litres">
                  {QUICK_LITRES.map(n => {
                    const over = via === "LOCAL" && !!pass && n > pass.remaining;
                    const on = amountMode === "LITRES" && pumpedVolume === n;
                    return (
                      <button key={n} type="button" disabled={over} onClick={() => chooseLitres(n)} aria-pressed={on}
                        className={`py-2 rounded-lg border-2 text-sm font-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-blue-500 hover:text-blue-700"}`}>
                        {n}<span className="text-[10px] font-bold opacity-70"> L</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Usual rupee amounts">
                  {QUICK_RUPEES.map(n => {
                    const on = amountMode === "RUPEES" && rupeeAmount === n;
                    return (
                      <button key={n} type="button" onClick={() => chooseRupees(String(n))} aria-pressed={on}
                        className={`py-2 rounded-lg border-2 text-xs font-black transition-colors ${on ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700"}`}>
                        <span className="text-[9px] font-bold opacity-70">Rs </span>{n}
                      </button>
                    );
                  })}
                </div>
                {/* inputMode brings up the phone's own number pad for an exact amount. The box
                    typed in last is the bold one; the other shows what it works out to. */}
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 px-3 rounded-xl border bg-slate-50 focus-within:bg-white transition-all ${errors.litersPumped ? "border-red-500" : amountMode === "LITRES" ? "border-blue-400" : "border-slate-200"} ${voiceFilled.amount && amountMode === "LITRES" ? VOICE_RING : ""}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Litres</span>
                    <input
                      id="litersPumped"
                      {...register("litersPumped", { onChange: litresEdited })}
                      onFocus={(e) => e.target.select()}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0.01"
                      max={via === "LOCAL" && pass ? Math.min(1000, pass.remaining) : 1000}
                      placeholder="20.5"
                      aria-label="Liters Pumped"
                      className={`w-full min-w-0 py-2 bg-transparent outline-none text-right text-lg font-black placeholder:font-bold placeholder:text-slate-300 ${amountMode === "LITRES" ? "text-blue-700" : "text-slate-500"}`}
                    />
                  </label>
                  <label className={`flex items-center gap-2 px-3 rounded-xl border bg-slate-50 focus-within:bg-white transition-all ${errors.litersPumped && amountMode === "RUPEES" ? "border-red-500" : amountMode === "RUPEES" ? "border-emerald-500" : "border-slate-200"} ${voiceFilled.amount && amountMode === "RUPEES" ? VOICE_RING : ""}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rs.</span>
                    <input
                      id="saleRupees"
                      value={amountMode === "RUPEES" ? rupees : estimatedTotal > 0 ? String(Math.round(estimatedTotal * 100) / 100) : ""}
                      onChange={(e) => chooseRupees(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="1"
                      placeholder="2000"
                      aria-label="Amount in Rupees"
                      className={`w-full min-w-0 py-2 bg-transparent outline-none text-right text-lg font-black placeholder:font-bold placeholder:text-slate-300 ${amountMode === "RUPEES" ? "text-emerald-700" : "text-slate-500"}`}
                    />
                  </label>
                </div>
                {amountMode === "RUPEES" && rupeeAmount > 0 && rupeeLitres === null && (
                  <p className="text-[11px] font-bold text-amber-600">Pick the fuel to work out the litres.</p>
                )}
                {via === "LOCAL" && pass && pumpedVolume > pass.remaining && (
                  <p className="text-[11px] font-bold text-red-500">Over the {litres(pass.remaining)} left on this pass.</p>
                )}
                {errors.litersPumped && (
                  <p className="text-xs font-bold text-red-500">
                    {amountMode === "LITRES" ? errors.litersPumped.message : rupeeLitres === null ? "Enter the rupee amount and pick the fuel." : "That amount is more than 1000 L — a single sale can't exceed it."}
                  </p>
                )}
              </div>

              {/* Below the amount: cash is the usual case, so this row is touched least.
                  Only cash counts toward the drawer at shift close. */}
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment">
                {(["CASH", "CARD", "QR"] as const).map((m) => (
                  <label key={m} className="cursor-pointer">
                    <input type="radio" value={m} {...register("paymentMethod", { onChange: () => touched("payment") })} className="peer sr-only" />
                    <span className={`block text-center px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-600 peer-checked:bg-slate-900 peer-checked:text-white peer-checked:border-slate-900 ${voiceFilled.payment && selectedPayment === m ? VOICE_RING : ""}`}>
                      {PAYMENT_LABELS[m]}
                    </span>
                  </label>
                ))}
              </div>

              {/* Optional help with the change; it is not recorded with the sale. */}
              {selectedPayment === "CASH" && (
                <div className="flex items-center gap-3">
                  <label className="w-1/2 flex items-center gap-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-blue-500">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400">Cash given</span>
                    <input
                      id="cashTendered"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      placeholder="5000"
                      className="w-full min-w-0 py-2 bg-transparent outline-none text-right text-sm font-black text-slate-800 placeholder:font-bold placeholder:text-slate-300"
                    />
                  </label>
                  <p className="flex-1 text-right text-sm font-black" aria-live="polite">
                    {!(Number(tendered) > 0 && estimatedTotal > 0)
                      ? <span className="text-xs font-medium text-slate-400">Change shows here</span>
                      : changeDue >= 0
                        ? <span className="text-emerald-700">Change Rs. {changeDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        : <span className="text-red-600">Short by Rs. {(-changeDue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                  </p>
                </div>
              )}

              {(via === "NATIONAL" || (!pass && !passRequired)) && (
              <div>
                <input
                  id="vehicleRegNo"
                  {...register("vehicleRegNo")}
                  aria-label="Vehicle number (optional)"
                  title="Registered customers see this purchase and its receipt in their portal."
                  placeholder="Vehicle no. (optional) — CAB-4521"
                  maxLength={15}
                  className={`w-full px-4 py-2 rounded-xl border bg-slate-50 focus:bg-white outline-none text-sm uppercase font-mono font-bold text-slate-800 placeholder:normal-case placeholder:font-sans placeholder:font-medium ${errors.vehicleRegNo ? "border-red-500" : "border-slate-200 focus:border-blue-500"}`}
                />
                {errors.vehicleRegNo && <p className="mt-1 text-xs font-bold text-red-500">{errors.vehicleRegNo.message}</p>}
              </div>
              )}

              {/* Stays at the bottom of the screen: the charge, the result of the last
                  attempt and the record button are reachable without scrolling on a phone. */}
              <div className="sticky bottom-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 pt-2 pb-2 bg-white/95 backdrop-blur border-t border-slate-100 space-y-2">
                {messageBanner}
                <div className="flex items-end justify-between gap-3 bg-slate-900 text-white rounded-xl px-4 py-2">
                  <div>
                    <p className="text-[10px] font-medium text-slate-400">Current Unit Price</p>
                    <p className="text-xs font-bold">Rs. {livePricePerLiter.toLocaleString(undefined, { minimumFractionDigits: 2 })} / L</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-medium text-slate-400">Charge Customer</p>
                    <p className="text-xl leading-tight font-black text-emerald-400">
                      Rs. {estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <button type="submit" disabled={isSubmitting || passBlocked || quotaMissing} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-xs">
                  {isSubmitting ? "Processing..." : passBlocked ? "No quota left" : quotaMissing ? "Scan fuel pass to continue" : via === "NATIONAL" ? "Deducted in app · Record sale" : "Process Transaction"}
                </button>
              </div>
            </form>
            )}

            {/* Clean pump screen: the last sale and its receipt, instead of the whole list. */}
            {!showHistory && lastSale && (
              <div className="mt-4 flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Last sale</p>
                  <p className="text-sm font-black text-slate-900 truncate">
                    TXN-{String(lastSale.saleId).padStart(5, "0")} · {lastSale.litersPumped.toLocaleString(undefined, { maximumFractionDigits: 2 })} L {lastSale.fuelType} · Rs. {lastSale.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <button type="button" onClick={() => printReceipt(lastSale.saleId)}
                  className="shrink-0 px-3 py-2 rounded-lg bg-white border border-slate-300 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-100">
                  Receipt
                </button>
              </div>
            )}

            {/* Rarely changed, so kept out of the way below the form. */}
            {voice.supported && !salesLocked && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={voiceOn} className="w-4 h-4 accent-slate-900"
                    onChange={(e) => { setVoiceOn(e.target.checked); writePref(VOICE_PREF, e.target.checked); voice.stop(); setVoiceNote(null); setVoiceFilled({}); }} />
                  Voice input (mic button)
                </label>
                {voiceOn && (
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Listen for Sinhala instead of English (experimental)">
                    <input type="checkbox" checked={sinhala} onChange={(e) => { setSinhala(e.target.checked); writePref(SINHALA_PREF, e.target.checked); }} className="w-4 h-4 accent-slate-900" />
                    සිංහල (experimental)
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* --- RIGHT: RECENT TRANSACTIONS TABLE --- */}
        {showHistory && (
        <div className={showForm ? "xl:col-span-2" : ""}>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden h-full">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-bold text-slate-800">{isAttendant ? "My Pump Activity" : "Recent Pump Activity"}</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="pb-4 pr-4">ID / Date & Time</th>
                    <th className="pb-4 pr-4">Fuel & Pump</th>
                    <th className="pb-4 pr-4">Attendant</th>
                    <th className="pb-4 pr-4 text-right">Liters</th>
                    <th className="pb-4 pr-4 text-right">Revenue</th>
                    <th className="pb-4 pr-4 text-right">Receipt</th>
                    {isSupervisor && <th className="pb-4 text-right">Manager Actions</th>}
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-500 font-medium">
                        <div className="text-4xl mb-4">⛽</div>
                        <p className="text-slate-500 font-medium">No sales recorded yet.</p>
                      </td>
                    </tr>
                  ) : (
                    sales.map((s) => {
                      const voided = s.status === "VOIDED";
                      return (
                      <tr key={s.saleId} className={`border-b border-slate-50 transition-colors ${voided ? "bg-slate-50/70 text-slate-400" : "hover:bg-slate-50/50"}`}>
                        <td className="py-4 pr-4">
                          <p className={`font-bold font-mono ${voided ? "line-through" : "text-slate-900"}`}>TXN-{s.saleId.toString().padStart(5, '0')}</p>
                          <p className="text-[10px] font-black text-slate-400 mt-0.5 tracking-wider uppercase">
                            {s.saleDate ? new Date(s.saleDate).toLocaleString() : 'N/A'}
                          </p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className={`font-bold ${voided ? "" : "text-slate-800"}`}>Pump {s.pumpNumber}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-slate-100 text-slate-500 mt-1">
                            {s.fuelType}
                          </span>
                        </td>
                        <td className="py-4 pr-4">
                           <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                             {s.attendantName || 'System'}
                           </span>
                           {s.recordedBy && s.recordedBy !== s.attendantName && (
                             <p className="text-[10px] font-bold text-slate-400 mt-1">keyed by {s.recordedBy}</p>
                           )}
                        </td>
                        <td className={`py-4 pr-4 text-right font-medium ${voided ? "line-through" : ""}`}>
                          {s.litersPumped.toFixed(2)} L
                        </td>
                        <td className={`py-4 pr-4 text-right font-black ${voided ? "line-through" : "text-emerald-600"}`}>
                          Rs. {s.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            {PAYMENT_LABELS[s.paymentMethod ?? "CASH"] ?? s.paymentMethod}
                            {s.unitPrice != null && ` · @ Rs. ${s.unitPrice.toFixed(2)}/L`}
                          </p>
                          {s.vehicleRegNo && <p className="text-[10px] font-bold font-mono text-slate-400 mt-0.5">{s.vehicleRegNo}</p>}
                          {s.quotaSource && (
                            <p className="text-[10px] font-bold text-slate-400" title={s.quotaReference ? `Reference ${s.quotaReference}` : undefined}>
                              {QUOTA_LABEL[s.quotaSource] ?? s.quotaSource}
                            </p>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-right">
                          <button onClick={() => printReceipt(s.saleId)}
                            className="text-[9px] font-black tracking-widest uppercase text-blue-700 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-100 px-3 py-1.5 rounded-md transition-colors">
                            Receipt
                          </button>
                        </td>

                        {isSupervisor && (
                          <td className="py-4 text-right">
                            {voided ? (
                              <span title={`${s.voidReason ?? ""}${s.voidedBy ? ` — ${s.voidedBy}` : ""}`} className="text-[9px] font-black tracking-widest uppercase text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-md">
                                Voided
                              </span>
                            ) : (
                              <button
                                onClick={() => setVoidModal({ isOpen: true, saleId: s.saleId, reason: "", isSubmitting: false })}
                                className="text-[9px] font-black tracking-widest uppercase text-red-500 hover:text-white bg-red-50 hover:bg-red-500 border border-red-100 px-3 py-1.5 rounded-md transition-colors"
                              >
                                Void
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100 text-xs font-bold text-slate-500">
                <span>Page {page + 1} of {totalPages} · {totalSales.toLocaleString()} sales</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Newer</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Older</button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* --- SECURE VOID MODAL --- */}
      {voidModal.isOpen && isSupervisor && (
        <div className="fixed inset-0 z-[100] flex items-center-safe justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-2xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-center text-slate-900 mb-2 tracking-tight">Void Transaction</h3>
            <p className="text-slate-500 text-xs text-center mb-6 font-medium">
              The sale stays on record marked as voided, and its fuel is returned to the tank. Only sales from a shift that is still open can be voided.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Reason for Void</label>
              <input
                type="text"
                placeholder="e.g., Pump malfunction, Typo by attendant"
                value={voidModal.reason}
                onChange={(e) => setVoidModal({ ...voidModal, reason: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-red-500 font-medium text-sm"
              />
              <p className="text-[10px] font-bold text-slate-400 mt-1">At least 5 characters.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setVoidModal({ isOpen: false, saleId: null, reason: "", isSubmitting: false })} className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button
                onClick={executeVoid}
                disabled={voidModal.reason.trim().length < 5 || voidModal.isSubmitting}
                className="flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 shadow-md shadow-red-600/20 transition-all active:scale-95"
              >
                {voidModal.isSubmitting ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
