"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPassword }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to change password.");
      return;
    }

    // Full navigation so proxy.ts re-reads must_change_password = false
    window.location.assign("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div
        className="w-full max-w-sm rounded-[10px] bg-[var(--color-surface)] p-8"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <h1
          className="mb-1 text-[20px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Set your password
        </h1>
        <p className="mb-6 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Your account requires a new password before you can continue.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new_password"
              className="text-[13px] font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              New password
            </label>
            <input
              id="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-[6px] px-3 py-2 text-[13px] outline-none transition-colors"
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
              }}
              placeholder="Minimum 8 characters"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirm_password"
              className="text-[13px] font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Confirm password
            </label>
            <input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-[6px] px-3 py-2 text-[13px] outline-none transition-colors"
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
              }}
              placeholder="Re-enter password"
            />
          </div>

          {error && (
            <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-[6px] py-2 text-[13px] font-medium transition-opacity disabled:opacity-60"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            {loading ? "Saving…" : "Set password & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
