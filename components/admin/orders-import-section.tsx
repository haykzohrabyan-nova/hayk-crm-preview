"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileJson,
  Loader2,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  XCircle,
} from "lucide-react";
import type {
  BulkOrderImportRowResult,
  BulkOrderImportSummary,
} from "@/lib/utils/bulk-import-orders";
import { ImportProgressModal, type ImportProgress } from "@/components/admin/import-progress-modal";

const IMPORT_CHUNK_SIZE = 25;

type Step = "upload" | "preview" | "done";

// ─── Status styling ───────────────────────────────────────────────────────────

function rowStatusStyle(status: BulkOrderImportRowResult["status"]) {
  if (status === "valid") {
    return {
      background: "var(--color-success-bg)",
      color: "var(--color-success)",
      border: "1px solid var(--color-success-border)",
      label: "Ready",
    };
  }
  if (status === "skipped") {
    return {
      background: "var(--color-warning-bg)",
      color: "var(--color-warning-text-deep)",
      border: "1px solid var(--color-warning-border)",
      label: "Skipped",
    };
  }
  return {
    background: "var(--color-danger-bg)",
    color: "var(--color-danger)",
    border: "1px solid var(--color-danger-border)",
    label: "Error",
  };
}

function ticketStatusStyle(status: string) {
  const map: Record<string, { bg: string; text: string }> = {
    completed: { bg: "var(--color-success-bg)", text: "var(--color-success)" },
    in_production: { bg: "var(--color-info-bg)", text: "var(--color-info-text)" },
    order: { bg: "var(--color-badge-bg)", text: "var(--color-badge-text)" },
    cancelled: { bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)" },
  };
  return map[status] ?? { bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)" };
}

function CustomerBadge({ action, name }: { action: "found" | "create" | "none"; name: string | null }) {
  if (action === "found") {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-success)" }}>
        <UserCheck size={12} />
        {name ?? "Found"}
      </span>
    );
  }
  if (action === "create") {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-warning-text-deep)" }}>
        <UserPlus size={12} />
        {name ? `Create: ${name}` : "Will create"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-danger)" }}>
      <UserX size={12} />
      Not found
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrdersImportSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [createMissingCustomers, setCreateMissingCustomers] = useState(false);
  const [summary, setSummary] = useState<BulkOrderImportSummary | null>(null);
  const [loading, setLoading] = useState<"validate" | "import" | "sample" | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName(null);
    setPayload(null);
    setSummary(null);
    setError(null);
    setLoading(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  async function readFile(file: File) {
    setError(null);
    setSummary(null);
    setStep("upload");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.orders)) {
        setError('JSON must include an "orders" array.');
        return;
      }
      setFileName(file.name);
      setPayload(parsed);
    } catch {
      setError("Could not read file — ensure it is valid JSON.");
    }
  }

  function buildBody(): Record<string, unknown> {
    const { _documentation: _a, ...rest } = payload ?? {};
    return {
      ...rest,
      create_missing_customers: createMissingCustomers,
    };
  }

  async function downloadSample() {
    setLoading("sample");
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/import/template");
      const data = (await res.json()) as { template?: Record<string, unknown>; error?: string };
      if (!res.ok || !data.template) {
        setError(data.error ?? "Could not load sample file.");
        setLoading(null);
        return;
      }
      const blob = new Blob([JSON.stringify(data.template, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bazaar-orders-import-sample.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error — could not download sample.");
    }
    setLoading(null);
  }

  async function runValidate() {
    if (!payload) return;
    setLoading("validate");
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/import?dry_run=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = (await res.json().catch(() => ({}))) as BulkOrderImportSummary & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Validation failed.");
        setLoading(null);
        return;
      }
      setSummary(data);
      setStep("preview");
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(null);
  }

  async function runImport() {
    if (!payload || !summary || summary.valid_count === 0) return;
    setLoading("import");
    setError(null);

    const body = buildBody();
    const allOrders = Array.isArray(body.orders) ? (body.orders as unknown[]) : [];
    const total = allOrders.length;
    const prog: ImportProgress = { total, processed: 0, created: 0, errors: 0, skipped: 0 };
    setProgress({ ...prog });

    const accRows: BulkOrderImportSummary["rows"] = [];
    let accCreated = 0;

    try {
      for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
        const chunk = allOrders.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await fetch("/api/admin/orders/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, orders: chunk }),
        });
        const data = (await res.json().catch(() => ({}))) as BulkOrderImportSummary & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Import failed.");
          setLoading(null);
          setProgress(null);
          return;
        }
        accCreated += data.created_count ?? 0;
        accRows.push(...(data.rows ?? []).map((r, j) => ({ ...r, row_index: i + j + 1 })));
        prog.processed = Math.min(i + IMPORT_CHUNK_SIZE, total);
        prog.created = accCreated;
        prog.skipped = accRows.filter((r) => r.status === "skipped").length;
        prog.errors = accRows.filter((r) => r.status === "error").length;
        setProgress({ ...prog });
      }

      setSummary((prev) => prev ? { ...prev, created_count: accCreated, rows: accRows } : prev);
      setStep("done");
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(null);
    setProgress(null);
  }

  function downloadResults() {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-import-results-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Order import
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--color-text-muted)" }}>
          JSON only — each order is matched to a customer by phone number. Rows are validated and customer matches are
          shown before anything is saved.
        </p>
      </div>

      {/* Info card */}
      <div
        className="rounded-[10px] border p-5 space-y-3"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          How customer matching works
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
          <div className="flex items-start gap-2">
            <UserCheck size={14} className="shrink-0 mt-0.5" style={{ color: "var(--color-success)" }} />
            <span>
              <strong style={{ color: "var(--color-text-primary)" }}>Found</strong> — existing customer matched by
              phone. Order will be linked to them.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <UserPlus size={14} className="shrink-0 mt-0.5" style={{ color: "var(--color-warning)" }} />
            <span>
              <strong style={{ color: "var(--color-text-primary)" }}>Will create</strong> — no customer found. Requires{" "}
              <span className="font-mono">customer_first_name</span> and &quot;create missing&quot; option enabled.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <UserX size={14} className="shrink-0 mt-0.5" style={{ color: "var(--color-danger)" }} />
            <span>
              <strong style={{ color: "var(--color-text-primary)" }}>Not found</strong> — row fails. Import the
              customer first or enable &quot;create missing&quot;.
            </span>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Tip: run the <strong>Customer import</strong> first, then import orders — all customers will already be in the
          system.
        </p>
      </div>

      {/* Upload card */}
      <div
        className="rounded-[10px] border p-5 space-y-4"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading === "sample"}
            onClick={() => void downloadSample()}
            className="inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-[13px] font-medium disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
              background: "var(--color-bg)",
            }}
          >
            {loading === "sample" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Download AI import template (JSON)
          </button>
          <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            <input
              type="checkbox"
              checked={createMissingCustomers}
              onChange={(e) => setCreateMissingCustomers(e.target.checked)}
              className="rounded"
            />
            Create new customer if phone not found (requires customer_first_name in row)
          </label>
        </div>

        {step !== "done" && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
              }}
            />

            <button
              type="button"
              disabled={!!loading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed px-4 py-8 text-center transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
            >
              <Upload size={22} className="mx-auto mb-2" style={{ color: "var(--color-text-muted)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                {fileName ? fileName : "Drop a .json file or click to browse"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Max 200 orders per file · each order matched to a customer by phone number
              </p>
            </button>

            {payload && step === "upload" && (
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                  onClick={reset}
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={loading === "validate"}
                  onClick={() => void runValidate()}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
                  style={{
                    background: "var(--color-btn-primary-bg)",
                    color: "var(--color-btn-primary-text)",
                  }}
                >
                  {loading === "validate" ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
                  Validate &amp; match customers
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <div
            className="rounded-[6px] border px-3 py-2 text-sm flex items-start gap-2"
            style={{
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
            }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Preview / results */}
        {summary && (step === "preview" || step === "done") && (
          <div className="space-y-4">
            {/* Summary counts */}
            <div className="flex flex-wrap gap-3 text-sm">
              <span style={{ color: "var(--color-text-primary)" }}>
                <strong>{summary.total_rows}</strong> rows
              </span>
              <span style={{ color: "var(--color-success)" }}>
                <strong>{step === "done" ? summary.created_count : summary.valid_count}</strong>{" "}
                {step === "done" ? "created" : "ready"}
              </span>
              {summary.error_count > 0 && (
                <span style={{ color: "var(--color-danger)" }}>
                  <strong>{summary.error_count}</strong> errors
                </span>
              )}
              {summary.skipped_count > 0 && (
                <span style={{ color: "var(--color-warning-text-deep)" }}>
                  <strong>{summary.skipped_count}</strong> skipped
                </span>
              )}
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-left text-sm min-w-[780px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
                    {["#", "Phone", "Customer match", "Title", "Status", "Payment", "Items", "Row status", "Details"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 font-semibold text-xs uppercase tracking-wide whitespace-nowrap"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => {
                    const st = rowStatusStyle(row.status);
                    const preview = row.preview;
                    const tsSt = preview ? ticketStatusStyle(preview.ticket_status) : null;
                    return (
                      <tr key={row.row_index} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                          {row.row_index}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                          {preview?.customer_phone ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {preview ? (
                            <CustomerBadge action={preview.customer_action} name={preview.customer_name} />
                          ) : (
                            <span style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td
                          className="px-3 py-2.5 max-w-[180px] truncate text-xs"
                          style={{ color: "var(--color-text-primary)" }}
                          title={preview?.title ?? undefined}
                        >
                          {preview?.title ?? <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {preview && tsSt ? (
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: tsSt.bg, color: tsSt.text }}
                            >
                              {preview.ticket_status.replace("_", " ")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {preview ? (
                            <span>
                              <span
                                style={{
                                  color:
                                    preview.payment_status === "paid"
                                      ? "var(--color-success)"
                                      : preview.payment_status === "partial"
                                        ? "var(--color-warning)"
                                        : "var(--color-text-muted)",
                                  fontWeight: 500,
                                }}
                              >
                                {preview.payment_status}
                              </span>
                              {preview.total != null && (
                                <span className="ml-1">
                                  · ${preview.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {preview ? `${preview.line_item_count} item${preview.line_item_count === 1 ? "" : "s"}` : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: st.background, color: st.color, border: st.border }}
                          >
                            {step === "done" && row.ticket_id ? "Created" : st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs max-w-[220px]" style={{ color: "var(--color-text-muted)" }}>
                          {row.errors.length > 0 && (
                            <span style={{ color: "var(--color-danger)" }}>{row.errors.join(" ")}</span>
                          )}
                          {row.errors.length === 0 && row.warnings.length > 0 && (
                            <span style={{ color: "var(--color-warning-text-deep)" }}>{row.warnings.join(" ")}</span>
                          )}
                          {row.errors.length === 0 && row.warnings.length === 0 && row.ticket_id && (
                            <span style={{ color: "var(--color-success)" }}>Order {row.ticket_id.slice(0, 8)}…</span>
                          )}
                          {row.errors.length === 0 && row.warnings.length === 0 && !row.ticket_id && row.status === "valid" && "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 justify-end">
              {step === "preview" && (
                <>
                  <button
                    type="button"
                    className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                    onClick={reset}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loading === "import" || summary.valid_count === 0}
                    onClick={() => void runImport()}
                    className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
                    style={{
                      background: "var(--color-btn-primary-bg)",
                      color: "var(--color-btn-primary-text)",
                    }}
                  >
                    {loading === "import" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Import {summary.valid_count} order{summary.valid_count === 1 ? "" : "s"}
                  </button>
                </>
              )}
              {step === "done" && (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    onClick={downloadResults}
                  >
                    <Download size={14} />
                    Download results JSON
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                    onClick={reset}
                  >
                    Import another file
                  </button>
                  <Link
                    href="/orders"
                    className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium"
                    style={{
                      background: "var(--color-btn-verify-bg)",
                      color: "var(--color-btn-verify-text)",
                      textDecoration: "none",
                    }}
                  >
                    View orders
                  </Link>
                </>
              )}
            </div>

            {step === "preview" && summary.error_count > 0 && (
              <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--color-warning-text-deep)" }}>
                <XCircle size={14} className="shrink-0 mt-0.5" />
                Rows with errors are not imported. Fix the JSON file and validate again, or import only the{" "}
                {summary.valid_count} ready row{summary.valid_count === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Help card */}
      {progress && <ImportProgressModal label="orders" progress={progress} />}

      <div
        className="rounded-[10px] border p-5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
          JSON only — no CSV
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          The downloaded template includes <span className="font-mono">_documentation</span> for AI tools — paste it
          into ChatGPT or your export script so output matches CRM rules. Each order must have at least one{" "}
          <span className="font-mono">line_items</span> entry with <span className="font-mono">product_type</span> and{" "}
          <span className="font-mono">quantity</span>. Orders are created as historical records — no webhook is fired
          and no quote PDF is generated.
        </p>
      </div>
    </div>
  );
}
