"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { EmailInput } from "@/components/ui/email-input";

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-7">
      <div
        className="h-2 w-2 rounded-full transition-colors"
        style={{ backgroundColor: step >= 1 ? "var(--color-accent)" : "var(--color-border)" }}
      />
      <div
        className="h-2 w-2 rounded-full transition-colors"
        style={{ backgroundColor: step === 2 ? "var(--color-accent)" : "var(--color-border)" }}
      />
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    const next = safeReturnPath(searchParams.get("next")) ?? "/dashboard";
    router.push(next);
  }

  return (
    <div
      className="w-full rounded-[10px] border px-10 py-9"
      style={{
        maxWidth: 420,
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}
    >
      <StepDots step={1} />

      {/* Header */}
      <div className="mb-7 flex flex-col items-center text-center">
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: "var(--color-topbar)" }}
        >
          <Lock className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        </div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Sign in to your account
        </h1>
        <p className="mt-1.5 text-[13px] italic" style={{ color: "var(--color-text-muted)" }}>
          BazaarPrinting CRM — Internal Tools
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          id="login-error"
          role="alert"
          className="mb-4 rounded-md border px-3.5 py-2.5 text-xs font-medium"
          style={{
            backgroundColor: "var(--color-danger-bg)",
            borderColor: "var(--color-danger-border)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-[12px] font-medium uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Email address
          </label>
          <EmailInput
            id="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@bazaarprinting.com"
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-[12px] font-medium uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              className="h-10 w-full rounded-md border px-3 pr-10 text-[13px] outline-none transition-all"
              style={{
                borderColor: error ? "var(--color-danger)" : "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = error ? "var(--color-danger)" : "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center p-1"
              style={{ color: "var(--color-text-muted)" }}
              tabIndex={-1}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="mt-1 h-10 w-full rounded-md text-[13px] font-medium transition-all active:scale-[0.97] disabled:opacity-60"
          style={{
            backgroundColor: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
          onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = "0.9"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      {/* Security badge */}
      <div className="mt-5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3 w-3" style={{ color: "var(--color-success)" }} />
        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          Secured with 256-bit encryption
        </span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
