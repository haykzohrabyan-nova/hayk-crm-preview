"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  formatShipToAddress,
  formatShipToAddressInline,
  hasShipToAddress,
  normalizeShipToKey,
  resolveRequiresShipping,
  sanitizeZip,
  type ShipToAddress,
  type ShipToFields,
} from "@/lib/utils/address";
import { formatCurrency } from "@/lib/utils/ticket-math";
import {
  emptyShippingDestination,
  resolveTicketShippingDestinationsForDisplay,
  sumShippingAmounts,
  type ShippingDestinationDisplayRow,
  type ShippingDestinationDraft,
  type TicketShippingDestinationRow,
} from "@/lib/utils/ticket-shipping-destinations";

export interface ShippingFulfillmentDraft extends ShipToFields {
  requires_shipping: boolean;
}

interface ShippingFulfillmentSectionProps {
  editing?: boolean;
  customerId?: string | null;
  requiresShipping: boolean;
  onRequiresShippingChange: (v: boolean) => void;
  destinations: ShippingDestinationDraft[];
  onDestinationsChange: (rows: ShippingDestinationDraft[]) => void;
  /** @deprecated Single-zip error — use zipErrors */
  zipError?: string;
  zipErrors?: Record<number, string>;
  /** Read-only ticket values */
  ticket?: ShippingFulfillmentDraft & {
    quote_shipping?: number | null;
    shipping_destinations?: TicketShippingDestinationRow[];
  };
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label
      className="block text-[11px] font-medium uppercase tracking-[0.06em] mb-1.5"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
      {required ? <span style={{ color: "var(--color-danger)" }}> *</span> : null}
    </label>
  );
}

function fieldStyle(hasError?: boolean) {
  return {
    background: "var(--color-surface)",
    border: `1px solid ${hasError ? "var(--color-danger)" : "var(--color-border)"}`,
    color: "var(--color-text-primary)",
  };
}

/** Read-only list for quote/order Overview (Fulfillment section). */
export function ShippingDestinationsOverviewList({
  rows,
  totalShipping,
}: {
  rows: ShippingDestinationDisplayRow[];
  totalShipping: number;
}) {
  if (!rows.length) return null;

  const rowTextCls = "text-sm md:text-[15px] leading-snug";

  return (
    <div className="space-y-2.5">
      {rows.length > 1 && totalShipping > 0 ? (
        <p className={`${rowTextCls} tabular-nums`} style={{ color: "var(--color-text-muted)" }}>
          Total shipping: {formatCurrency(totalShipping)}
        </p>
      ) : null}
      {rows.map((row, i) => {
        const addr = formatShipToAddress(row);
        const amount = Number(row.shipping_amount) || 0;
        const label = rows.length > 1 ? `Destination ${i + 1}` : "Ship To";

        return (
          <div
            key={i}
            className="rounded-md border px-3 py-2.5 space-y-1.5"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
              {label}
            </p>
            {amount > 0 ? (
              <p className={`${rowTextCls} tabular-nums`} style={{ color: "var(--color-text-primary)" }}>
                Shipping: {formatCurrency(amount)}
              </p>
            ) : null}
            {addr ? (
              <p className={`${rowTextCls} whitespace-pre-line`} style={{ color: "var(--color-text-primary)" }}>
                {addr}
              </p>
            ) : (
              <p className={rowTextCls} style={{ color: "var(--color-text-muted)" }}>
                No address entered
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShippingAmountInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [raw, setRaw] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    setRaw(value === 0 ? "" : String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={0}
      step={0.01}
      placeholder="0.00"
      value={raw}
      onKeyDown={(e) => {
        if (/^[0-9]$/.test(e.key) && e.currentTarget.value === "0") {
          e.preventDefault();
          if (e.key !== "0") {
            setRaw(e.key);
            onChange(parseFloat(e.key));
          }
        }
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/^0+([1-9])/, "$1");
        setRaw(v);
        onChange(parseFloat(v) || 0);
      }}
      onBlur={() => {
        const n = parseFloat(raw);
        setRaw(isNaN(n) ? "" : String(n));
      }}
      className="w-full px-3 py-2 rounded-md text-sm border outline-none"
      style={fieldStyle()}
    />
  );
}

function resolveAddressPickerValue(
  dest: ShippingDestinationDraft,
  pastAddresses: ShipToAddress[],
): string {
  const currentKey = normalizeShipToKey(dest);
  if (!currentKey) return "new";
  const matchIdx = pastAddresses.findIndex((a) => normalizeShipToKey(a) === currentKey);
  return matchIdx >= 0 ? String(matchIdx) : "new";
}

function PreviousAddressSelect({
  dest,
  pastAddresses,
  onPick,
}: {
  dest: ShippingDestinationDraft;
  pastAddresses: ShipToAddress[];
  onPick: (addressIndex: number | "new") => void;
}) {
  const fieldStyleBase = fieldStyle();
  const value = resolveAddressPickerValue(dest, pastAddresses);

  return (
    <div>
      <FieldLabel>Previous addresses</FieldLabel>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => {
            const picked = e.target.value;
            onPick(picked === "new" ? "new" : Number(picked));
          }}
          className="w-full appearance-none px-3 py-2 pr-8 rounded-md text-sm border outline-none"
          style={fieldStyleBase}
        >
          <option value="new">Enter new address</option>
          {pastAddresses.map((addr, i) => (
            <option key={i} value={String(i)}>
              {formatShipToAddressInline(addr) ?? "Previous address"}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--color-text-muted)" }}
        />
      </div>
    </div>
  );
}

export function ShippingFulfillmentSection({
  editing = true,
  customerId,
  requiresShipping,
  onRequiresShippingChange,
  destinations,
  onDestinationsChange,
  zipError,
  zipErrors,
  ticket,
}: ShippingFulfillmentSectionProps) {
  const fieldStyleBase = fieldStyle();
  const [pastAddresses, setPastAddresses] = useState<ShipToAddress[]>([]);

  useEffect(() => {
    if (!editing || !requiresShipping || !customerId) {
      setPastAddresses([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/customers/${customerId}/shipping-addresses`)
      .then((r) => r.json())
      .then((d: { addresses?: ShipToAddress[] }) => {
        if (!cancelled) setPastAddresses(d.addresses ?? []);
      })
      .catch(() => {
        if (!cancelled) setPastAddresses([]);
      });
    return () => { cancelled = true; };
  }, [editing, requiresShipping, customerId]);

  if (!editing && ticket) {
    const displayRows = resolveTicketShippingDestinationsForDisplay(ticket, destinations);
    const requiresShippingResolved = resolveRequiresShipping(ticket);
    const totalShipping = displayRows.length
      ? sumShippingAmounts(displayRows)
      : (ticket.quote_shipping ?? 0);
    const hasShippingContent =
      requiresShippingResolved &&
      (displayRows.length > 0 || totalShipping > 0);

    return (
      <div className="rounded-lg p-4 space-y-3 border" style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          Fulfillment
        </h4>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Method</dt>
            <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>
              {requiresShippingResolved ? "Ship to customer" : "Pickup"}
            </dd>
          </div>
          {requiresShippingResolved && displayRows.length === 1 && totalShipping > 0 ? (
            <div>
              <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Shipping charge</dt>
              <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                {formatCurrency(totalShipping)}
              </dd>
            </div>
          ) : null}
          {hasShippingContent ? (
            <div>
              <dt className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>
                {displayRows.length > 1 ? "Shipping destinations" : "Ship To"}
              </dt>
              <dd>
                <ShippingDestinationsOverviewList rows={displayRows} totalShipping={totalShipping} />
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  function updateDestination(idx: number, patch: Partial<ShippingDestinationDraft>) {
    onDestinationsChange(destinations.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function setDestinationField(idx: number, key: keyof ShipToFields, value: string) {
    updateDestination(idx, { [key]: value });
  }

  function addDestination() {
    onDestinationsChange([...destinations, emptyShippingDestination()]);
  }

  function removeDestination(idx: number) {
    if (destinations.length <= 1) return;
    onDestinationsChange(destinations.filter((_, i) => i !== idx));
  }

  function handlePickup() {
    onRequiresShippingChange(false);
    onDestinationsChange([emptyShippingDestination()]);
  }

  function handleShip() {
    onRequiresShippingChange(true);
    if (!destinations.length) {
      onDestinationsChange([emptyShippingDestination()]);
    }
  }

  function handleAddressPickerChange(destIdx: number, picked: number | "new") {
    if (picked === "new") {
      updateDestination(destIdx, {
        ship_to_line1: "",
        ship_to_line2: "",
        ship_to_city: "",
        ship_to_state: "",
        ship_to_zip: "",
      });
      return;
    }
    const addr = pastAddresses[picked];
    if (!addr) return;
    updateDestination(destIdx, {
      ship_to_line1: addr.ship_to_line1 ?? "",
      ship_to_line2: addr.ship_to_line2 ?? "",
      ship_to_city: addr.ship_to_city ?? "",
      ship_to_state: addr.ship_to_state ?? "",
      ship_to_zip: addr.ship_to_zip ?? "",
    });
  }

  return (
    <div className="rounded-lg p-4 space-y-4 border" style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
      <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        Fulfillment
      </h4>

      <div className="grid grid-cols-2 rounded-md overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
        <button
          type="button"
          onClick={handlePickup}
          className="py-2 text-sm font-medium transition-all border-r"
          style={{
            background: !requiresShipping ? "var(--color-accent)" : "var(--color-surface)",
            color: !requiresShipping ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
            borderColor: "var(--color-border)",
          }}
        >
          Pickup
        </button>
        <button
          type="button"
          onClick={handleShip}
          className="py-2 text-sm font-medium transition-all"
          style={{
            background: requiresShipping ? "var(--color-accent)" : "var(--color-surface)",
            color: requiresShipping ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
          }}
        >
          Ship to customer
        </button>
      </div>

      {requiresShipping ? (
        <div className="space-y-6 pt-1">
          {destinations.map((dest, destIdx) => {
            const zipErr = zipErrors?.[destIdx] ?? (destIdx === 0 ? zipError : undefined);
            const showRemove = destinations.length > 1;

            return (
              <div
                key={dest.id}
                className="space-y-4 rounded-lg border p-3"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                {destinations.length > 1 ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                      Shipping destination {destIdx + 1}
                    </p>
                    {showRemove ? (
                      <button
                        type="button"
                        onClick={() => removeDestination(destIdx)}
                        className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-70"
                        style={{ color: "var(--color-danger)" }}
                        aria-label={`Remove shipping destination ${destIdx + 1}`}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {customerId && pastAddresses.length > 0 ? (
                  <PreviousAddressSelect
                    dest={dest}
                    pastAddresses={pastAddresses}
                    onPick={(picked) => handleAddressPickerChange(destIdx, picked)}
                  />
                ) : null}

                <div>
                  <FieldLabel>Shipping ($)</FieldLabel>
                  <ShippingAmountInput
                    value={dest.shipping_amount}
                    onChange={(n) => updateDestination(destIdx, { shipping_amount: n })}
                  />
                </div>

                <div>
                  <FieldLabel>Delivery address (optional)</FieldLabel>
                  <div className="space-y-3">
                    <input
                      value={dest.ship_to_line1 ?? ""}
                      onChange={(e) => setDestinationField(destIdx, "ship_to_line1", e.target.value)}
                      placeholder="Address line 1"
                      className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                      style={fieldStyleBase}
                    />
                    <input
                      value={dest.ship_to_line2 ?? ""}
                      onChange={(e) => setDestinationField(destIdx, "ship_to_line2", e.target.value)}
                      placeholder="Address line 2 (optional)"
                      className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                      style={fieldStyleBase}
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        value={dest.ship_to_city ?? ""}
                        onChange={(e) => setDestinationField(destIdx, "ship_to_city", e.target.value)}
                        placeholder="City"
                        className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                        style={fieldStyleBase}
                      />
                      <input
                        value={dest.ship_to_state ?? ""}
                        onChange={(e) => setDestinationField(destIdx, "ship_to_state", e.target.value)}
                        placeholder="State"
                        className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                        style={fieldStyleBase}
                      />
                      <div>
                        <input
                          value={dest.ship_to_zip ?? ""}
                          onChange={(e) => setDestinationField(destIdx, "ship_to_zip", sanitizeZip(e.target.value))}
                          placeholder="ZIP"
                          className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                          style={fieldStyle(!!zipErr)}
                          aria-invalid={!!zipErr}
                        />
                        {zipErr ? (
                          <p className="mt-1 text-[11px]" style={{ color: "var(--color-danger)" }} role="alert">
                            {zipErr}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={addDestination}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-opacity hover:opacity-85"
                        style={{
                          borderColor: "var(--color-border)",
                          background: "var(--color-btn-primary-bg)",
                          color: "var(--color-btn-primary-text)",
                        }}
                      >
                        <Plus size={14} />
                        Add shipping address
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { hasShipToAddress, formatShipToAddress, formatShipToAddressInline };
