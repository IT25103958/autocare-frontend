"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { publicApi } from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import {
  AuthBanner, AuthBox, AuthButton, AuthField, AuthFrame, AuthTitle, Stagger, authLinkCls, shake,
  type FieldNote, type FieldStatus,
} from "../_components/AuthUI";

// Sign-in only checks that something sensible was typed; older accounts were
// created before the stricter sign-up rules, so their usernames aren't re-judged here.
const loginSchema = z.object({
  username: z.string().min(1, "Please enter your username.").max(50, "Username is too long."),
  password: z.string().min(1, "Please enter your password.").max(72, "Password is too long."),
});

type LoginFormInputs = z.infer<typeof loginSchema>;

function LoginForm() {
  // Sign-up sends people here with their new username already filled in.
  const params = useSearchParams();
  const { login } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [serverError, setServerError] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const {
    register, handleSubmit, watch, setValue, setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    defaultValues: { username: params.get("username") ?? "", password: "" },
  });

  const username = watch("username");

  useEffect(() => { setFocus(params.get("username") ? "password" : "username"); }, [params, setFocus]);

  // A wrong-credentials message stays until the user changes something.
  useEffect(() => {
    const sub = watch((_, { type }) => { if (type === "change") setServerError(""); });
    return () => sub.unsubscribe();
  }, [watch]);

  const badCredentials = serverError.startsWith("Invalid");
  const statusOf = (name: keyof LoginFormInputs): FieldStatus => (errors[name] || badCredentials ? "error" : "idle");

  // Not an error — some older usernames do have spaces — but usually a typo.
  const usernameNote: FieldNote = errors.username
    ? { tone: "error", text: errors.username.message }
    : username !== username.trim() ? { tone: "warn", text: "There's a space at the start or end — check your typing." }
    : /\s/.test(username) ? { tone: "warn", text: "Your username contains a space. Is that right?" }
    : null;

  const onSubmit = async (data: LoginFormInputs) => {
    setServerError("");
    try {
      const response = await publicApi.post("/auth/login", {
        username: data.username,
        password: data.password,
      });

      login({
        token: response.data.token,
        username: response.data.username,
        role: response.data.role,
        fullName: response.data.fullName,
        mustChangePassword: response.data.mustChangePassword === true,
      });

      // First sign-in with a temporary password goes straight to choosing a
      // new one; the backend refuses every other request until then.
      setSignedIn(true);
      setTimeout(() => {
        // Back to the page the user was sent here from (middleware adds ?redirect=).
        // Only internal paths, so a crafted link can't send them to another site.
        const back = params.get("redirect");
        const safeBack = back && back.startsWith("/") && !back.startsWith("//") && !back.includes("\\") ? back : "/";
        window.location.href = response.data.mustChangePassword ? "/change-password" : safeBack;
      }, 450);
    } catch (e) {
      const err = e as { response?: { status?: number; data?: unknown } };
      if (err.response?.status === 401) {
        setServerError("Invalid username or password. Please try again.");
        setValue("password", "");
        setFocus("password");
      } else if ((err.response?.status === 403 || err.response?.status === 429) && typeof err.response.data === "string") {
        setServerError(err.response.data); // deactivated account, or too many attempts
      } else {
        setServerError("Can't reach the server right now. Please try again in a moment.");
      }
      shake(cardRef.current);
    }
  };

  return (
    <AuthBox boxRef={cardRef}>
      <Stagger i={0} className="mb-7">
        <AuthTitle sub="Sign in to your Lanka Auto Care account.">Welcome back</AuthTitle>
      </Stagger>

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit, () => shake(cardRef.current))} noValidate>
        <Stagger i={1}>
          <AuthField label="Username" icon="user" placeholder="Enter your username" autoComplete="username" maxLength={50}
            autoCapitalize="none" spellCheck={false}
            {...register("username")}
            status={statusOf("username")}
            note={usernameNote} />
        </Stagger>

        <Stagger i={2}>
          <AuthField label="Password" icon="lock" type="password" placeholder="Enter your password" autoComplete="current-password" reveal maxLength={72}
            {...register("password")}
            status={statusOf("password")}
            note={errors.password ? { tone: "error", text: errors.password.message } : null} />
          <div className="mt-2.5 text-right text-xs">
            <Link href="/forgot-password" className={authLinkCls}>Forgot password?</Link>
          </div>
        </Stagger>

        {serverError && <AuthBanner tone="error">{serverError}</AuthBanner>}

        <Stagger i={3} className="pt-1">
          <AuthButton busy={isSubmitting} done={signedIn} busyText="Signing in…" doneText="Signed in">Sign in</AuthButton>
        </Stagger>
      </form>

      <Stagger i={4} className="mt-6 text-center text-sm">
        <span className="text-zinc-500">New to Lanka Auto Care? </span>
        <Link href="/register" className={authLinkCls}>Create an account</Link>
      </Stagger>
    </AuthBox>
  );
}

export default function LoginPage() {
  return (
    <AuthFrame eyebrow="Service centre · Fuel station"
      title={<>Every service.<br /><span className="hero-shimmer">Every litre.</span></>}
      sub="Bookings, live repair updates, online bills and your full service history in one account.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
