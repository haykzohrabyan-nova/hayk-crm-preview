"use client";

import { useState, useEffect } from "react";
import { X, UserCheck, Info } from "lucide-react";

interface SalesUser {
  id: string;
  full_name: string | null;
}

interface KeyAccount {
  id: string;
  full_name: string | null;
}

interface RouteToSalesModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (salesOwnerId: string | null) => void;
  saving: boolean;
  customerId?: string | null;
}

const QUEUE_VALUE = "__queue__";

export function RouteToSalesModal({
  open,
  onClose,
  onConfirm,
  saving,
  customerId,
}: RouteToSalesModalProps) {
  const [users, setUsers] = useState<SalesUser[]>([]);
  const [keyAccount, setKeyAccount] = useState<KeyAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>(QUEUE_VALUE);

  useEffect(() => {
    if (!open) return;
    setSelected(QUEUE_VALUE);
    setKeyAccount(null);
    setLoading(true);

    const url = customerId
      ? `/api/leads/sales-users?customer_id=${encodeURIComponent(customerId)}`
      : "/api/leads/sales-users";

    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const list: SalesUser[] = d.users ?? [];
        setUsers(list);
        const ka: KeyAccount | null = d.key_account ?? null;
        setKeyAccount(ka);
        if (ka && list.some((u) => u.id === ka.id)) {
          setSelected(ka.id);
        }
      })
      .catch(() => {
        setUsers([]);
        setKeyAccount(null);
      })
      .finally(() => setLoading(false));
  }, [open, customerId]);

  if (!open) return null;

  function handleConfirm() {
    onConfirm(selected === QUEUE_VALUE ? null : selected);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] p-6 shadow-2xl"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
        role="dialog"
        aria-labelledby="route-to-sales-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2
            id="route-to-sales-title"
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Route to Sales
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ color: "var(--color-text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {keyAccount && (
          <div
            className="mb-4 flex gap-2.5 rounded-[8px] border px-3.5 py-2.5 text-[12px]"
            style={{
              background: "var(--color-info-bg)",
              borderColor: "var(--color-info-border)",
              color: "var(--color-info-text-deep)",
            }}
          >
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-info-text)" }} />
            <p>
              This customer&apos;s Key Account rep is{" "}
              <strong>{keyAccount.full_name ?? "Unnamed"}</strong>. They are pre-selected for this route.
            </p>
          </div>
        )}

        {/* Subtitle */}
        <p className="mb-4 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          Assign this lead to a sales rep, or add it to the shared queue to be claimed.
        </p>

        {/* Radio list */}
        <div className="flex flex-col gap-2">
          {/* Queue option — always shown first */}
          <label
            className="flex items-center gap-3 cursor-pointer rounded-[8px] border px-3.5 py-2.5 text-[13px] transition-all"
            style={{
              borderColor: selected === QUEUE_VALUE ? "var(--color-accent)" : "var(--color-border)",
              background: selected === QUEUE_VALUE ? "var(--color-badge-bg)" : "transparent",
              color: "var(--color-text-primary)",
            }}
          >
            <input
              type="radio"
              name="sales-assignee"
              value={QUEUE_VALUE}
              checked={selected === QUEUE_VALUE}
              onChange={() => setSelected(QUEUE_VALUE)}
              className="shrink-0"
              style={{ accentColor: "var(--color-accent)" }}
            />
            <span className="font-medium">Add to queue — don&apos;t assign yet</span>
          </label>

          {/* Sales rep options */}
          {loading ? (
            <div className="flex flex-col gap-2 mt-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-[8px]"
                  style={{ background: "var(--color-border)" }}
                />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-2 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              No active sales reps found.
            </p>
          ) : (
            users.map((user) => (
              <label
                key={user.id}
                className="flex items-center gap-3 cursor-pointer rounded-[8px] border px-3.5 py-2.5 text-[13px] transition-all"
                style={{
                  borderColor: selected === user.id ? "var(--color-accent)" : "var(--color-border)",
                  background: selected === user.id ? "var(--color-badge-bg)" : "transparent",
                  color: "var(--color-text-primary)",
                }}
              >
                <input
                  type="radio"
                  name="sales-assignee"
                  value={user.id}
                  checked={selected === user.id}
                  onChange={() => setSelected(user.id)}
                  className="shrink-0"
                  style={{ accentColor: "var(--color-accent)" }}
                />
                <UserCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-text-muted)" }} />
                <span>{user.full_name ?? "Unnamed"}</span>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || loading}
            className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            {saving ? "Routing…" : "Route to Sales"}
          </button>
        </div>
      </div>
    </>
  );
}
