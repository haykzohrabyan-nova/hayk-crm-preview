"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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

export interface ShippingFulfillmentDraft extends ShipToFields {
  requires_shipping: boolean;
}

interface ShippingFulfillmentSectionProps {
  editing?: boolean;
  customerId?: string | null;
  requiresShipping: boolean;
  onRequiresShippingChange: (v: boolean) => void;
  shipTo: ShipToFields;
  onShipToChange: (fields: ShipToFields) => void;
  shipping: number;
  onShippingChange: (v: number) => void;
  shippingError?: string;
  zipError?: string;
  /** Read-only ticket values */
  ticket?: ShippingFulfillmentDraft & { quote_shipping?: number | null };
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

export function ShippingFulfillmentSection({
  editing = true,
  customerId,
  requiresShipping,
  onRequiresShippingChange,
  shipTo,
  onShipToChange,
  shipping,
  onShippingChange,
  shippingError,
  zipError,
  ticket,
}: ShippingFulfillmentSectionProps) {
  const fieldStyleBase = fieldStyle();
  const [shippingRaw, setShippingRaw] = useState(shipping === 0 ? "" : String(shipping));
  const [pastAddresses, setPastAddresses] = useState<ShipToAddress[]>([]);
  const [addressPicker, setAddressPicker] = useState<string>("new");

  useEffect(() => {
    setShippingRaw(shipping === 0 ? "" : String(shipping));
  }, [shipping]);

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

  useEffect(() => {
    if (!requiresShipping) {
      setAddressPicker("new");
      return;
    }
    const currentKey = normalizeShipToKey(shipTo);
    if (!currentKey) {
      setAddressPicker("new");
      return;
    }
    const matchIdx = pastAddresses.findIndex((a) => normalizeShipToKey(a) === currentKey);
    setAddressPicker(matchIdx >= 0 ? String(matchIdx) : "new");
  }, [requiresShipping, shipTo, pastAddresses]);

  if (!editing && ticket) {
    const formattedAddress = formatShipToAddress(ticket);
    const requiresShipping = resolveRequiresShipping(ticket);
    return (
      <div className="rounded-lg p-4 space-y-3 border" style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          Fulfillment
        </h4>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Method</dt>
            <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>
              {requiresShipping ? "Ship to customer" : "Pickup"}
            </dd>
          </div>
          {requiresShipping && (ticket.quote_shipping ?? 0) > 0 ? (
            <div>
              <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Shipping charge</dt>
              <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                {formatCurrency(ticket.quote_shipping ?? 0)}
              </dd>
            </div>
          ) : null}
          {requiresShipping && formattedAddress ? (
            <div>
              <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Ship To</dt>
              <dd className="text-sm whitespace-pre-line" style={{ color: "var(--color-text-primary)" }}>
                {formattedAddress}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  function setField<K extends keyof ShipToFields>(key: K, value: ShipToFields[K]) {
    onShipToChange({ ...shipTo, [key]: value });
  }

  function handlePickup() {
    onRequiresShippingChange(false);
    onShippingChange(0);
    setShippingRaw("");
    onShipToChange({
      ship_to_line1: "",
      ship_to_line2: "",
      ship_to_city: "",
      ship_to_state: "",
      ship_to_zip: "",
    });
  }

  function handleShip() {
    onRequiresShippingChange(true);
  }

  function handleAddressPickerChange(value: string) {
    setAddressPicker(value);
    if (value === "new") return;
    const idx = Number(value);
    const picked = pastAddresses[idx];
    if (!picked) return;
    onShipToChange({
      ship_to_line1: picked.ship_to_line1 ?? "",
      ship_to_line2: picked.ship_to_line2 ?? "",
      ship_to_city: picked.ship_to_city ?? "",
      ship_to_state: picked.ship_to_state ?? "",
      ship_to_zip: picked.ship_to_zip ?? "",
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
        <div className="space-y-4 pt-1">
          <div>
            <FieldLabel required>Shipping ($)</FieldLabel>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={shippingRaw}
              onKeyDown={(e) => {
                if (/^[0-9]$/.test(e.key) && e.currentTarget.value === "0") {
                  e.preventDefault();
                  if (e.key !== "0") {
                    setShippingRaw(e.key);
                    onShippingChange(parseFloat(e.key));
                  }
                }
              }}
              onChange={(e) => {
                const v = e.target.value.replace(/^0+([1-9])/, "$1");
                setShippingRaw(v);
                onShippingChange(parseFloat(v) || 0);
              }}
              onBlur={() => {
                const n = parseFloat(shippingRaw);
                setShippingRaw(isNaN(n) ? "" : String(n));
              }}
              className="w-full px-3 py-2 rounded-md text-sm border outline-none"
              style={fieldStyle(!!shippingError)}
              aria-invalid={!!shippingError}
            />
            {shippingError ? (
              <p className="mt-1 text-[11px]" style={{ color: "var(--color-danger)" }} role="alert">
                {shippingError}
              </p>
            ) : null}
          </div>

          {customerId && pastAddresses.length > 0 ? (
            <div>
              <FieldLabel>Previous addresses</FieldLabel>
              <div className="relative">
                <select
                  value={addressPicker}
                  onChange={(e) => handleAddressPickerChange(e.target.value)}
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
          ) : null}

          <div>
            <FieldLabel>Delivery address (optional)</FieldLabel>
            <div className="space-y-3">
              <input
                value={shipTo.ship_to_line1 ?? ""}
                onChange={(e) => setField("ship_to_line1", e.target.value)}
                placeholder="Address line 1"
                className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                style={fieldStyleBase}
              />
              <input
                value={shipTo.ship_to_line2 ?? ""}
                onChange={(e) => setField("ship_to_line2", e.target.value)}
                placeholder="Address line 2 (optional)"
                className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                style={fieldStyleBase}
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  value={shipTo.ship_to_city ?? ""}
                  onChange={(e) => setField("ship_to_city", e.target.value)}
                  placeholder="City"
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                  style={fieldStyleBase}
                />
                <input
                  value={shipTo.ship_to_state ?? ""}
                  onChange={(e) => setField("ship_to_state", e.target.value)}
                  placeholder="State"
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                  style={fieldStyleBase}
                />
                <div>
                  <input
                    value={shipTo.ship_to_zip ?? ""}
                    onChange={(e) => setField("ship_to_zip", sanitizeZip(e.target.value))}
                    placeholder="ZIP"
                    className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                    style={fieldStyle(!!zipError)}
                    aria-invalid={!!zipError}
                  />
                  {zipError ? (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--color-danger)" }} role="alert">
                      {zipError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { hasShipToAddress, formatShipToAddress, formatShipToAddressInline };
