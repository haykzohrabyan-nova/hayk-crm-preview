"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { OtpInput } from "@/components/otp-input";

function Verify2FAForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    if (code.length === 6 && !loading) {
      verify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    await verify(code);
  }

  async function verify(currentCode: string) {
    if (loading) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError || !factors?.totp?.length) {
      setError("No MFA factors found. Please sign in again.");
      setCode("");
      setLoading(false);
      return;
    }

    const factorId = factors.totp[0].id;
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? "Challenge failed.");
      setCode("");
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: currentCode,
    });
    if (verifyError) {
      setError("Incorrect code — please try again.");
      setCode("");
      setLoading(false);
      return;
    }

    await supabase.auth.refreshSession();
    const next = safeReturnPath(searchParams.get("next")) ?? "/dashboard";
    window.location.assign(next);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
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
      {/* Step dots — step 1 done, step 2 active */}
      <div className="flex items-center justify-center gap-2 mb-7">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: "var(--color-topbar)" }}
        >
          <ShieldCheck className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        </div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Two-factor authentication
        </h1>
        <p className="mt-1.5 text-[13px] italic" style={{ color: "var(--color-text-muted)" }}>
          Enter the 6-digit code to continue
        </p>
      </div>

      {/* Info box */}
      <div
        className="mb-5 flex items-start gap-2.5 rounded-md border px-3.5 py-3"
        style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
      >
        <Smartphone className="mt-px h-4 w-4 shrink-0" style={{ color: "var(--color-accent-dark)" }} />
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          Open your authenticator app and enter the{" "}
          <strong style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>
            6-digit code
          </strong>{" "}
          for BazaarPrinting CRM.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 rounded-md border px-3.5 py-2.5 text-xs font-medium"
          style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "var(--color-danger)" }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleVerify} className="flex flex-col gap-6">
        <OtpInput value={code} onChange={setCode} autoFocus />

        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="h-10 w-full rounded-md text-[13px] font-medium transition-all active:scale-[0.97] disabled:opacity-60"
          style={{
            backgroundColor: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
          onMouseEnter={(e) => { if (code.length === 6 && !loading) (e.currentTarget as HTMLButtonElement).style.opacity = "0.9"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
        >
          {loading ? "Verifying…" : "Verify Code"}
        </button>
      </form>

      {/* Divider + sign out */}
      <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--color-border)" }}>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full text-center text-[12px] transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
        >
          Use a different account
        </button>
      </div>

      {/* Security badge */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3 w-3" style={{ color: "var(--color-success)" }} />
        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          2-factor verification active
        </span>
      </div>
    </div>
  );
}

export default function Verify2FAPage() {
  return (
    <Suspense>
      <Verify2FAForm />
    </Suspense>
  );
}
