"use client";

import { useState, useEffect } from "react";
import { X, AlertTriangle, Check } from "lucide-react";

export interface MergeSourceCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone?: string | null;
}

interface MergeCandidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  industry: string | null;
  heat_tag: string | null;
  created_at: string | null;
}

type Step = "pick" | "fields" | "confirm";

const FIELD_DEFS: { key: keyof MergeCandidate; label: string }[] = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "industry", label: "Industry" },
  { key: "heat_tag", label: "Heat tag" },
];

function displayVal(val: string | null | undefined): string {
  return val?.trim() || "—";
}

function fmtCustomerSince(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function candidateName(c: MergeCandidate): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
}

export function MergeCustomerModal({
  source,
  onClose,
  onMerged,
}: {
  source: MergeSourceCustomer;
  onClose: () => void;
  onMerged: (survivingId: string) => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [keeper, setKeeper] = useState<MergeCandidate | null>(null);

  // fieldOverrides: for each field key, the id of the candidate whose value to use (defaults to keeper's id)
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");

  // Load all customers with the same phone on open
  useEffect(() => {
    if (!source.phone) { setLoading(false); return; }
    fetch(`/api/customers?search=${encodeURIComponent(source.phone)}`)
      .then((r) => r.json())
      .then((data) => {
        const all = (data.customers ?? []) as MergeCandidate[];
        setCandidates(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [source.id, source.phone]);

  // When keeper is chosen, initialise fieldOverrides so every field defaults to keeper's value
  function pickKeeper(c: MergeCandidate) {
    setKeeper(c);
    const defaults: Record<string, string> = {};
    for (const { key } of FIELD_DEFS) defaults[key] = c.id;
    setFieldOverrides(defaults);
  }

  // Fields where at least two candidates have different non-empty values
  const conflictingFields = keeper
    ? FIELD_DEFS.filter(({ key }) => {
        const values = candidates.map((c) => (c[key] ?? "").trim()).filter(Boolean);
        return new Set(values).size > 1;
      })
    : [];

  async function executeMerge() {
    if (!keeper) return;
    setMerging(true);
    setError("");

    // Build overrides: for each conflicting field where user chose a non-keeper candidate
    const overrides: Record<string, unknown> = {};
    for (const { key } of conflictingFields) {
      const chosenId = fieldOverrides[key];
      if (chosenId && chosenId !== keeper.id) {
        const donor = candidates.find((c) => c.id === chosenId);
        if (donor) overrides[key] = donor[key];
      }
    }

    // Merge each non-keeper into keeper sequentially
    const victims = candidates.filter((c) => c.id !== keeper.id);
    for (const victim of victims) {
      const res = await fetch(`/api/customers/${victim.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: keeper.id, overrides }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMerging(false);
        setError(data.error ?? "Merge failed.");
        return;
      }
      // Only send overrides once (first merge applies them to keeper)
      Object.keys(overrides).forEach((k) => delete overrides[k]);
    }

    setMerging(false);
    onMerged(keeper.id);
  }

  const victims = keeper ? candidates.filter((c) => c.id !== keeper.id) : [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] p-6 shadow-2xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Merge Duplicate Customers
          </h2>
          <button onClick={onClose} style={{ color: "var(--color-text-muted)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          {(["pick", "fields", "confirm"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: step === s ? "var(--color-btn-verify-bg)" : "var(--color-border)",
                  color: step === s ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                }}
              >
                {i + 1}. {s === "pick" ? "Select keeper" : s === "fields" ? "Choose info" : "Confirm"}
              </span>
              {i < 2 && <span style={{ color: "var(--color-border)" }}>›</span>}
            </div>
          ))}
        </div>

        {/* ── Step 1: Pick keeper ── */}
        {step === "pick" && (
          <>
            <p className="text-[13px] mb-4" style={{ color: "var(--color-text-muted)" }}>
              All {candidates.length} customers share the same phone number. Select the record you want to <strong style={{ color: "var(--color-text-primary)" }}>keep</strong> — the others will be merged into it and deleted.
            </p>

            {loading ? (
              <div className="space-y-2 mb-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-[8px] animate-pulse" style={{ background: "var(--color-border)" }} />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-[13px] mb-4" style={{ color: "var(--color-text-muted)" }}>No duplicates found for this phone number.</p>
            ) : (
              <div className="rounded-[8px] border overflow-hidden mb-4" style={{ borderColor: "var(--color-border)" }}>
                {candidates.map((c, idx) => {
                  const isKeeper = keeper?.id === c.id;
                  const isSource = c.id === source.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickKeeper(c)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                      style={{
                        background: isKeeper ? "var(--color-row-hover)" : idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                    >
                      {/* Selection circle */}
                      <div
                        className="shrink-0 h-4 w-4 rounded-full border-2 flex items-center justify-center"
                        style={{
                          borderColor: isKeeper ? "var(--color-tab-active)" : "var(--color-border)",
                          background: isKeeper ? "var(--color-tab-active)" : "transparent",
                        }}
                      >
                        {isKeeper && <Check className="h-2.5 w-2.5" style={{ color: "white" }} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                            {candidateName(c)}
                          </p>
                          {isSource && (
                            <span className="shrink-0 text-[10px] font-medium rounded-full px-1.5 py-0.5" style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}>
                              This record
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
                          {[c.company, c.phone, c.email].filter(Boolean).join(" · ")}
                        </p>
                        {fmtCustomerSince(c.created_at) && (
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                            Customer since {fmtCustomerSince(c.created_at)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("fields")}
                disabled={!keeper}
                className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-40"
                style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Choose field values ── */}
        {step === "fields" && keeper && (
          <>
            <p className="text-[13px] mb-4" style={{ color: "var(--color-text-muted)" }}>
              For fields where records differ, choose which value to keep on <strong style={{ color: "var(--color-text-primary)" }}>{candidateName(keeper)}</strong>.
            </p>

            {conflictingFields.length === 0 ? (
              <div
                className="rounded-[8px] border p-4 mb-4 text-[13px]"
                style={{ background: "var(--color-success-bg)", borderColor: "var(--color-success-border)", color: "var(--color-success)" }}
              >
                All records have the same information — no conflicts to resolve.
              </div>
            ) : (
              <div className="space-y-4 mb-4 max-h-[320px] overflow-y-auto pr-1">
                {conflictingFields.map(({ key, label }) => {
                  const uniqueOptions = candidates
                    .map((c) => ({ id: c.id, value: c[key] ?? "", name: candidateName(c), isKeeper: c.id === keeper.id }))
                    .filter((o, i, arr) => o.value.trim() && arr.findIndex((x) => x.value === o.value) === i);

                  return (
                    <div key={key}>
                      <p className="text-[11px] font-medium uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                        {label}
                      </p>
                      <div className="rounded-[8px] border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                        {uniqueOptions.map((opt, idx) => {
                          const chosen = (fieldOverrides[key] ?? keeper.id) === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setFieldOverrides((prev) => ({ ...prev, [key]: opt.id }))}
                              className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors"
                              style={{
                                background: chosen ? "var(--color-row-hover)" : idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                                borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                              }}
                            >
                              <div
                                className="shrink-0 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center"
                                style={{
                                  borderColor: chosen ? "var(--color-tab-active)" : "var(--color-border)",
                                  background: chosen ? "var(--color-tab-active)" : "transparent",
                                }}
                              >
                                {chosen && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] truncate" style={{ color: "var(--color-text-primary)" }}>
                                  {displayVal(opt.value)}
                                </p>
                                <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                                  from {opt.name}{opt.isKeeper ? " (keeper)" : ""}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between gap-2">
              <button
                onClick={() => setStep("pick")}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                ← Back
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium"
                style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === "confirm" && keeper && (
          <>
            <div
              className="flex items-start gap-3 rounded-[8px] border p-4 mb-4"
              style={{ background: "var(--color-warning-bg)", borderColor: "var(--color-warning-border)" }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--color-warning-text-deep)" }} />
              <div className="text-[13px]" style={{ color: "var(--color-warning-text-deep)" }}>
                <p className="font-medium mb-1">This cannot be undone.</p>
                <p>
                  Keeping <strong>{candidateName(keeper)}</strong>.{" "}
                  {victims.length === 1
                    ? <>Deleting <strong>{candidateName(victims[0])}</strong> — all their leads and orders will be moved to the kept record.</>
                    : <>Deleting <strong>{victims.map(candidateName).join(", ")}</strong> — all their leads and orders will be moved to the kept record.</>
                  }
                </p>
              </div>
            </div>

            {error && (
              <p className="text-[12px] font-medium mb-3" style={{ color: "var(--color-danger)" }}>{error}</p>
            )}

            <div className="flex justify-between gap-2">
              <button
                onClick={() => setStep("fields")}
                className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                ← Back
              </button>
              <button
                onClick={executeMerge}
                disabled={merging}
                className="rounded-[6px] px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
                style={{ background: "var(--color-danger)", color: "white" }}
              >
                {merging ? "Merging…" : `Merge & Delete ${victims.length} record${victims.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
