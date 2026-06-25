"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportApiError } from "@/lib/utils/report-api-error";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileJson,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import type {
  BulkCustomerImportRowResult,
  BulkCustomerImportSummary,
  BulkCustomerLookupsReference,
  LookupOption,
} from "@/lib/utils/bulk-import-customers";
import { ImportProgressModal, type ImportProgress } from "@/components/admin/import-progress-modal";
import { LookupOptionsTable, IMPORT_CHUNK_SIZE } from "@/components/admin/bulk-import-shared";


type Step = "upload" | "preview" | "done";


function statusStyle(status: BulkCustomerImportRowResult["status"]) {
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

export function CustomersImportSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [createMissingLookups, setCreateMissingLookups] = useState(false);
  const [lookups, setLookups] = useState<BulkCustomerLookupsReference | null>(null);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [summary, setSummary] = useState<BulkCustomerImportSummary | null>(null);
  const [loading, setLoading] = useState<"validate" | "import" | "sample" | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/customers/import/template");
        const data = (await res.json()) as { lookups?: BulkCustomerLookupsReference };
        if (!cancelled && res.ok && data.lookups) setLookups(data.lookups);
      } catch {
        /* reference tables optional */
      } finally {
        if (!cancelled) setLookupsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.customers)) {
        setError('JSON must include a "customers" array.');
        return;
      }
      setFileName(file.name);
      setPayload(parsed);
    } catch {
      setError("Could not read file — ensure it is valid JSON.");
    }
  }

  function buildBody(): Record<string, unknown> {
    const { _lookups: _a, _documentation: _b, ...rest } = payload ?? {};
    return {
      ...rest,
      skip_duplicate_phones: skipDuplicates,
      create_missing_lookups: createMissingLookups,
    };
  }

  async function downloadSample() {
    setLoading("sample");
    setError(null);
    try {
      const res = await fetch("/api/admin/customers/import/template");
      const data = (await res.json()) as { template?: Record<string, unknown>; error?: string };
      if (!res.ok || !data.template) {
        const msg = data.error ?? "Could not load sample file.";
        setError(msg);
        reportApiError(msg, res, "CustomersImport/sample");
        setLoading(null);
        return;
      }
      const blob = new Blob([JSON.stringify(data.template, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bazaar-customers-import-sample.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = "Network error — could not download sample.";
      setError(msg);
      reportApiError(msg, { status: 0, url: "/api/admin/customers/import/template" }, "CustomersImport/sample", { originalError: String(err) });
    }
    setLoading(null);
  }

  async function runValidate() {
    if (!payload) return;
    setLoading("validate");
    setError(null);
    try {
      const res = await fetch("/api/admin/customers/import?dry_run=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = (await res.json().catch(() => ({}))) as BulkCustomerImportSummary & { error?: string };
      if (!res.ok) {
        const msg = data.error ?? "Validation failed.";
        setError(msg);
        reportApiError(msg, res, "CustomersImport/validate");
        setLoading(null);
        return;
      }
      setSummary(data);
      setStep("preview");
    } catch (err) {
      const msg = "Network error — please try again.";
      setError(msg);
      reportApiError(msg, { status: 0, url: "/api/admin/customers/import" }, "CustomersImport/validate", { originalError: String(err) });
    }
    setLoading(null);
  }

  async function runImport() {
    if (!payload || !summary || summary.valid_count === 0) return;
    setLoading("import");
    setError(null);

    const body = buildBody();
    const allCustomers = Array.isArray(body.customers) ? (body.customers as unknown[]) : [];
    const total = allCustomers.length;
    const prog: ImportProgress = { total, processed: 0, created: 0, errors: 0, skipped: 0 };
    setProgress({ ...prog });

    const accRows: BulkCustomerImportSummary["rows"] = [];
    let accCreated = 0;

    try {
      for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
        const chunk = allCustomers.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await fetch("/api/admin/customers/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, customers: chunk }),
        });
        const data = (await res.json().catch(() => ({}))) as BulkCustomerImportSummary & { error?: string };
        if (!res.ok) {
          const msg = data.error ?? "Import failed.";
          setError(msg);
          reportApiError(msg, res, "CustomersImport/import");
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
      window.dispatchEvent(new Event("bazaar:customers-changed"));
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
    } catch (err) {
      const msg = "Network error — please try again.";
      setError(msg);
      reportApiError(msg, { status: 0, url: "/api/admin/customers/import" }, "CustomersImport/import", { originalError: String(err) });
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
    a.download = `customers-import-results-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Customer import
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--color-text-muted)" }}>
          JSON only — use the <span className="font-mono text-xs">value</span> column from industry below (not the
          label). Rows are validated before anything is saved.
        </p>
      </div>

      <div
        className="rounded-[10px] border p-5 space-y-4"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
            Allowed dropdown values
          </h2>
          <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
            Each customer&apos;s <span className="font-mono">industry</span> must match a{" "}
            <span className="font-mono">value</span> here — or enable auto-add below.
          </p>
          {lookupsLoading ? (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Loading options…
            </p>
          ) : lookups ? (
            <div className="max-w-sm">
              <LookupOptionsTable title="Industries (industry)" options={lookups.industry} />
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-warning-text-deep)" }}>
              Could not load dropdown options — download the sample JSON for the full list.
            </p>
          )}
        </div>
      </div>

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
            {loading === "sample" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            Download AI import template (JSON)
          </button>
          <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="rounded"
            />
            Skip duplicate phones (existing customers)
          </label>
          <label className="inline-flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            <input
              type="checkbox"
              checked={createMissingLookups}
              onChange={(e) => setCreateMissingLookups(e.target.checked)}
              className="rounded"
            />
            Add missing industry to Dropdown Options on import
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
                Max 500 customers per file · invalid industry values are rejected unless auto-add is enabled
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
                  {loading === "validate" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileJson size={14} />
                  )}
                  Validate file
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

        {summary && (step === "preview" || step === "done") && (
          <div className="space-y-4">
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

            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
                    <th
                      className="px-3 py-2 font-semibold text-xs uppercase tracking-wide"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      #
                    </th>
                    <th
                      className="px-3 py-2 font-semibold text-xs uppercase tracking-wide"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Name
                    </th>
                    <th
                      className="px-3 py-2 font-semibold text-xs uppercase tracking-wide"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Phone
                    </th>
                    <th
                      className="px-3 py-2 font-semibold text-xs uppercase tracking-wide"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Industry
                    </th>
                    <th
                      className="px-3 py-2 font-semibold text-xs uppercase tracking-wide"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Status
                    </th>
                    <th
                      className="px-3 py-2 font-semibold text-xs uppercase tracking-wide"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => {
                    const st = statusStyle(row.status);
                    const preview = row.preview;
                    return (
                      <tr key={row.row_index} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                          {row.row_index}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--color-text-primary)" }}>
                          {preview
                            ? [preview.first_name, preview.last_name].filter(Boolean).join(" ")
                            : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
                          {preview?.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {preview?.industry ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: st.background, color: st.color, border: st.border }}
                          >
                            {step === "done" && row.customer_id ? "Created" : st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[280px]" style={{ color: "var(--color-text-muted)" }}>
                          {row.errors.length > 0 && (
                            <span style={{ color: "var(--color-danger)" }}>{row.errors.join(" ")}</span>
                          )}
                          {row.errors.length === 0 && row.warnings.length > 0 && row.warnings.join(" ")}
                          {row.errors.length === 0 && row.warnings.length === 0 && row.customer_id && (
                            <span style={{ color: "var(--color-success)" }}>
                              Customer {row.customer_id.slice(0, 8)}…
                            </span>
                          )}
                          {row.errors.length === 0 &&
                            row.warnings.length === 0 &&
                            !row.customer_id &&
                            row.status === "valid" &&
                            "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
                    Import {summary.valid_count} customer{summary.valid_count === 1 ? "" : "s"}
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
                    href="/crm"
                    className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium"
                    style={{
                      background: "var(--color-btn-verify-bg)",
                      color: "var(--color-btn-verify-text)",
                      textDecoration: "none",
                    }}
                  >
                    View customers
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

      <div
        className="rounded-[10px] border p-5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
          JSON only — no CSV
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          The downloaded template includes <span className="font-mono">_documentation</span> for AI tools — paste it
          into ChatGPT or your export script so output matches CRM rules. One example customer is included; replace
          with your full list. Unknown <span className="font-mono">industry</span> values are rejected unless auto-add
          is enabled. This import creates customer records only — no leads are created.
        </p>
      </div>

      {progress && <ImportProgressModal label="customers" progress={progress} />}
    </div>
  );
}
