"use client";

import { formatShipToAddress } from "@/lib/utils/address";
import { formatCurrency } from "@/lib/utils/format";
import {
  resolveTicketShippingDestinationsForDisplay,
  type ShippingDestinationDisplayRow,
} from "@/lib/utils/ticket-shipping-destinations";

const BORDER = "#E5E7EB";
const NAVY = "#1B2B4B";
const MUTED = "#6B7280";
const TEXT = "#1F2937";

const fmtUsd = (n: number) => formatCurrency(n);

function AddressLines({ row }: { row: ShippingDestinationDisplayRow }) {
  const formatted = formatShipToAddress(row);
  if (!formatted) {
    return (
      <p style={{ margin: "6px 0 0", fontSize: 13, color: MUTED, fontStyle: "italic" }}>
        No address entered
      </p>
    );
  }
  return (
    <>
      {formatted.split("\n").map((line, i) => (
        <div key={i} style={{ fontSize: 13, color: TEXT, marginBottom: 2, lineHeight: 1.45 }}>
          {line}
        </div>
      ))}
    </>
  );
}

/** Multiple destinations — 2-column card list (matches additional SKU grid). */
export function PublicShippingAddressesList({ rows }: { rows: ShippingDestinationDisplayRow[] }) {
  const withContent = rows.filter(
    (r) => formatShipToAddress(r) || (Number(r.shipping_amount) || 0) > 0,
  );
  if (withContent.length <= 1) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {withContent.map((row, i) => (
          <div
            key={i}
            style={{
              padding: 12,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              background: "#FAFAFA",
              minWidth: 0,
            }}
          >
            {(Number(row.shipping_amount) || 0) > 0 ? (
              <p style={{ margin: "0 0 6px", fontSize: 11, color: MUTED }}>
                Shipping: <span style={{ fontWeight: 600, color: TEXT }}>{fmtUsd(row.shipping_amount)}</span>
              </p>
            ) : null}
            <AddressLines row={row} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Single destination — column in Bill To / Ship To / Quote Details row. */
export function PublicShippingAddressSingle({
  row,
}: {
  row: ShippingDestinationDisplayRow;
}) {
  if (!formatShipToAddress(row) && (Number(row.shipping_amount) || 0) <= 0) return null;

  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: MUTED,
          marginBottom: 8,
        }}
      >
        Ship To
      </div>
      {(Number(row.shipping_amount) || 0) > 0 ? (
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>
          Shipping: <span style={{ color: TEXT, fontWeight: 600 }}>{fmtUsd(row.shipping_amount)}</span>
        </div>
      ) : null}
      <AddressLines row={row} />
    </div>
  );
}

export type PublicShippingTicketFields = Parameters<typeof resolveTicketShippingDestinationsForDisplay>[0];

export function publicShippingDestinationRows(
  ticket: PublicShippingTicketFields,
): ShippingDestinationDisplayRow[] {
  const rows = resolveTicketShippingDestinationsForDisplay(ticket);
  return rows.filter((r) => formatShipToAddress(r) || (Number(r.shipping_amount) || 0) > 0);
}
