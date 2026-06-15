"use client";

import type { LookupOption } from "@/lib/utils/bulk-import-shared";

/** How many rows to push per chunk during a bulk import. */
export const IMPORT_CHUNK_SIZE = 25;

/** Wizard step for bulk import flows. */
export type ImportStep = "upload" | "preview" | "done";

/** Table showing valid lookup values for a given field (used in preview step). */
export function LookupOptionsTable({
  title,
  options,
}: {
  title: string;
  options: LookupOption[];
}) {
  return (
    <div className="min-w-0">
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </h3>
      <div
        className="overflow-x-auto rounded-lg border max-h-[220px] overflow-y-auto"
        style={{ borderColor: "var(--color-border)" }}
      >
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0" style={{ background: "var(--color-bg)" }}>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <th className="px-2.5 py-1.5 font-semibold" style={{ color: "var(--color-text-muted)" }}>
                value
              </th>
              <th className="px-2.5 py-1.5 font-semibold" style={{ color: "var(--color-text-muted)" }}>
                label
              </th>
            </tr>
          </thead>
          <tbody>
            {options.map((opt) => (
              <tr key={opt.value} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td className="px-2.5 py-1.5 font-mono" style={{ color: "var(--color-text-primary)" }}>
                  {opt.value}
                </td>
                <td className="px-2.5 py-1.5" style={{ color: "var(--color-text-muted)" }}>
                  {opt.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
