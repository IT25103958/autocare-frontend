"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { publicApi } from "../../utils/axiosInstance";
import {
  emailProblem, fullNameProblem, passwordProblem, passwordStrength, suggestUsername,
  tidyEmail, tidyName, usernameProblem,
} from "../../utils/signupRules";
import {
  AuthBanner, AuthBox, AuthButton, AuthField, AuthFrame, AuthIcon, AuthTitle, Stagger, authLinkCls, shake,
  type FieldNote, type FieldStatus,
} from "../_components/AuthUI";

// Wraps one of the shared rule functions as a Zod check.
const rule = (problem: (v: string) => string | null) =>
  z.string().superRefine((v, ctx) => {
    const p = problem(v);
    if (p) ctx.addIssue({ code: "custom", message: p });
  });

const registerSchema = z.object({
  fullName: rule(fullNameProblem),
  email: rule(emailProblem),
  username: rule(usernameProblem),
  password: rule(passwordProblem),
  confirmPassword: z.string().min(1, "Please confirm your password."),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
  // Compare as soon as both are filled, even while other fields still have mistakes.
  when: p => typeof (p.value as { confirmPassword?: unknown })?.confirmPassword === "string"
    && ((p.value as { confirmPassword: string }).confirmPassword.length > 0),
});

type RegisterFormInputs = z.infer<typeof registerSchema>;

type Availability = "idle" | "checking" | "free" | "taken" | "unknown";

// Asks the backend whether a username / email is free, a moment after typing stops.
function useAvailability(param: "username" | "email", value: string, valid: boolean): Availability {
  // The answer is kept with the value it was for, so a newer value reads as "checking".
  const [answer, setAnswer] = useState<{ value: string; state: Availability }>({ value: "", state: "idle" });
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let state: Availability;
      try {
        const res = await publicApi.get("/auth/availability", { params: { [param]: value } });
        state = res.data?.[param === "username" ? "usernameTaken" : "emailTaken"] ? "taken" : "free";
      } catch {
        state = "unknown"; // the backend checks again on submit
      }
      if (!cancelled) setAnswer({ value, state });
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [param, value, valid]);
  if (!valid) return "idle";
  return answer.value === value ? answer.state : "checking";
}

const STRENGTH = [
  { label: "Too weak", bar: "bg-red-500", text: "text-red-400" },
  { label: "Weak", bar: "bg-orange-500", text: "text-orange-400" },
  { label: "Fair", bar: "bg-amber-400", text: "text-amber-400" },
  { label: "Good", bar: "bg-cyan-400", text: "text-cyan-300" },
  { label: "Strong", bar: "bg-emerald-400", text: "text-emerald-400" },
];

// One line under the two password boxes: strength bars, then the three required rules.
function PasswordMeter({ value }: { value: string }) {
  const score = passwordStrength(value);
  const s = STRENGTH[score];
  const filled = value ? Math.max(score, 1) : 0; // "Too weak" still lights the first bar
  const checks = [
    { ok: value.length >= 8 && value.length <= 72, text: "8+ chars" },
    { ok: /\p{L}/u.test(value), text: "Letter" },
    { ok: /[0-9]/.test(value), text: "Number" },
  ];
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2 min-w-[9rem] flex-1">
        <div className="flex-1 grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map(i => (
            <span key={i} className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <span className={`block h-full rounded-full transition-all duration-500 ${s.bar} ${i <= filled ? "w-full" : "w-0"}`} />
            </span>
          ))}
        </div>
        <span key={value ? s.label : "none"} className={`auth-msg-in text-[11px] font-black w-14 ${value ? s.text : "text-zinc-600"}`}>
          {value ? s.label : "Strength"}
        </span>
      </div>
      <ul className="flex gap-3">
        {checks.map(c => (
          <li key={c.text} className={`flex items-center gap-1 text-[11px] font-bold transition-colors duration-300 ${c.ok ? "text-emerald-400" : "text-zinc-500"}`}>
            <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all duration-300 ${c.ok ? "bg-emerald-500 text-white scale-100" : "bg-white/10 text-transparent scale-90"}`}>
              <AuthIcon name="check" className="w-2.5 h-2.5" />
            </span>
            {c.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [serverError, setServerError] = useState("");
  const [created, setCreated] = useState<{ name: string; username: string } | null>(null);

  const {
    register, handleSubmit, watch, trigger, setValue, getValues,
    formState: { errors, dirtyFields, isSubmitting, isSubmitted },
  } = useForm<RegisterFormInputs>({
    resolver: zodResolver(registerSchema),
    mode: "onChange", // show each mistake while typing
    defaultValues: { fullName: "", email: "", username: "", password: "", confirmPassword: "" },
  });

  const [username, email, password, confirmPassword] = watch(["username", "email", "password", "confirmPassword"]);
  const usernameState = useAvailability("username", username, usernameProblem(username) === null);
  const emailState = useAvailability("email", tidyEmail(email), emailProblem(email) === null);

  // Changing the password re-checks the confirmation once it has been typed.
  useEffect(() => {
    if (getValues("confirmPassword")) trigger("confirmPassword");
  }, [password, getValues, trigger]);

  const statusOf = (name: keyof RegisterFormInputs, extra?: Availability): FieldStatus => {
    if (errors[name]) return "error";
    if (extra === "taken") return "error";
    if (extra === "checking") return "checking";
    return dirtyFields[name] && getValues(name) ? "valid" : "idle";
  };

  const availabilityNote = (state: Availability, what: string): FieldNote =>
    state === "taken" ? { tone: "error", text: `This ${what} is already ${what === "email" ? "registered" : "taken"}.` }
    : state === "checking" ? { tone: "hint", text: "Checking availability…" }
    : state === "free" ? { tone: "ok", text: what === "email" ? "Looks good." : "Username is available." }
    : null;

  const suggestion = errors.username ? suggestUsername(username) : null;
  const usernameNote: FieldNote = errors.username
    ? {
        tone: "error",
        text: (
          <>
            {errors.username.message}
            {suggestion && (
              <> Try{" "}
                <button type="button" className="underline decoration-2 underline-offset-2 text-cyan-300 hover:text-cyan-200"
                  onClick={() => setValue("username", suggestion, { shouldValidate: true, shouldDirty: true })}>
                  {suggestion}
                </button>
              </>
            )}
          </>
        ),
      }
    : availabilityNote(usernameState, "username");

  const onInvalid = () => shake(cardRef.current);

  const onSubmit = async (data: RegisterFormInputs) => {
    setServerError("");
    if (usernameState === "taken" || emailState === "taken") { shake(cardRef.current); return; }
    try {
      await publicApi.post("/auth/register", {
        fullName: tidyName(data.fullName),
        email: tidyEmail(data.email),
        username: data.username,
        password: data.password,
      });
      setCreated({ name: tidyName(data.fullName).split(" ")[0], username: data.username });
      setTimeout(() => router.push(`/login?username=${encodeURIComponent(data.username)}`), 2600);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } | string } };
      const data = err.response?.data;
      const body = typeof data === "object" ? data?.message : data;
      if (typeof body === "string" && body.length < 160) setServerError(body.replace(/^Error:\s*/, ""));
      else if (err.response) setServerError("Registration failed. Please check your details and try again.");
      else setServerError("Can't reach the server right now. Please try again in a moment.");
      shake(cardRef.current);
    }
  };

  return (
    <AuthFrame eyebrow="Join Lanka Auto Care"
      title={<>Your garage &amp;<br /><span className="hero-shimmer">fuel stop, online.</span></>}
      sub="Book services, follow every repair live, pay bills online and keep your full service history.">
      <AuthBox boxRef={cardRef}>
        {created ? (
          <div className="py-6 text-center">
            <div className="auth-pop mx-auto w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.5)]">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                <path className="auth-draw" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="hero-fade-up mt-6 text-3xl font-black tracking-tight text-zinc-50" style={{ animationDelay: "300ms" }}>
              Welcome aboard, {created.name}!
            </h2>
            <p className="hero-fade-up mt-2 text-zinc-400 font-medium" style={{ animationDelay: "400ms" }}>
              Your account <span className="font-bold text-zinc-100">{created.username}</span> is ready. Taking you to sign in…
            </p>
            <div className="mt-8 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="auth-bar h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-amber-400" style={{ animationDelay: "0ms", animationDuration: "2.6s" }} />
            </div>
          </div>
        ) : (
          <>
            <Stagger i={0} className="mb-6">
              <AuthTitle sub="A free account for your vehicle's services, bookings and bills.">Create account</AuthTitle>
            </Stagger>

            <form className="space-y-4" onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
              <div className="grid sm:grid-cols-2 gap-x-3 gap-y-4">
                <Stagger i={1}>
                  <AuthField label="Full name" icon="user" placeholder="Nimal Perera" autoComplete="name" maxLength={60}
                    {...register("fullName")}
                    status={statusOf("fullName")}
                    note={errors.fullName ? { tone: "error", text: errors.fullName.message } : null} />
                </Stagger>
                <Stagger i={2}>
                  <AuthField label="Username" icon="at" placeholder="nimal_perera" autoComplete="username" maxLength={20}
                    autoCapitalize="none" spellCheck={false} title="3–20 characters: letters, numbers, dots or underscores. No spaces."
                    {...register("username")}
                    status={statusOf("username", usernameState)}
                    labelExtra={<span className="text-[11px] font-bold tabular-nums text-zinc-500">{username.length}/20</span>}
                    note={usernameNote} />
                </Stagger>
              </div>

              <Stagger i={3}>
                <AuthField label="Email address" icon="mail" type="email" placeholder="name@example.com" autoComplete="email" maxLength={100}
                  {...register("email")}
                  status={statusOf("email", emailState)}
                  note={errors.email ? { tone: "error", text: errors.email.message } : availabilityNote(emailState, "email")} />
              </Stagger>

              <Stagger i={4}>
                <div className="grid sm:grid-cols-2 gap-x-3 gap-y-4">
                  <AuthField label="Password" icon="lock" type="password" placeholder="8+ characters" autoComplete="new-password" reveal maxLength={72}
                    {...register("password")}
                    status={statusOf("password")}
                    note={errors.password && isSubmitted ? { tone: "error", text: errors.password.message } : null} />
                  <AuthField label="Confirm password" icon="shield" type="password" placeholder="Type it again" autoComplete="new-password" reveal maxLength={72}
                    {...register("confirmPassword")}
                    status={statusOf("confirmPassword")}
                    note={errors.confirmPassword ? { tone: "error", text: errors.confirmPassword.message }
                      : confirmPassword && confirmPassword === password ? { tone: "ok", text: "Passwords match." } : null} />
                </div>
                <PasswordMeter value={password} />
              </Stagger>

              {serverError && <AuthBanner tone="error">{serverError}</AuthBanner>}

              <Stagger i={5} className="pt-1">
                <AuthButton busy={isSubmitting} busyText="Setting up your garage…">Create account</AuthButton>
              </Stagger>
            </form>

            <Stagger i={6} className="mt-5 text-center text-sm">
              <span className="text-zinc-500">Already have an account? </span>
              <Link href="/login" className={authLinkCls}>Sign in</Link>
            </Stagger>
          </>
        )}
      </AuthBox>
    </AuthFrame>
  );
}
