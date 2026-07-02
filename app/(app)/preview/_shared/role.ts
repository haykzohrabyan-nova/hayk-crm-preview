"use client";

// Hayk 2026-07-02 — Preview role-view toggle.
// Persists chosen role in localStorage under bazaar.preview.role.
// Only affects /preview/* pages — real routes untouched.

import { useEffect, useState } from "react";

export type PreviewRole =
  | "admin"
  | "sales"
  | "sdr"
  | "designer"
  | "accountant"
  | "print-manager";

export const PREVIEW_ROLE_STORAGE_KEY = "bazaar.preview.role";

export const PREVIEW_ROLES: PreviewRole[] = [
  "admin",
  "sales",
  "sdr",
  "designer",
  "accountant",
  "print-manager",
];

export const PREVIEW_ROLE_LABELS: Record<PreviewRole, string> = {
  admin: "Admin",
  sales: "Sales Rep",
  sdr: "SDR",
  designer: "Designer",
  accountant: "Accountant",
  "print-manager": "Print Manager",
};

export const PREVIEW_ROLE_DESCRIPTIONS: Record<PreviewRole, string> = {
  admin: "Owner view — sees everything.",
  sales: "Sees own deals, no payments module.",
  sdr: "Lead-heavy view, no payments, no reports.",
  designer: "Files-only, no pricing, no contacts.",
  accountant: "Payments, money position, terms approval.",
  "print-manager": "Orders + workflow board only.",
};

export const PREVIEW_ROLE_HOME: Record<PreviewRole, string> = {
  admin: "/preview/dashboard-variants",
  sales: "/preview/sales-pipeline",
  sdr: "/preview/leads",
  designer: "/preview/designer-home",
  accountant: "/preview/payments",
  "print-manager": "/preview/orders",
};

// ─── Capability map ──────────────────────────────────
export type Capability =
  | "payments-module"
  | "money-position-dashboard"
  | "pricing-details"
  | "customer-contact-info"
  | "leads-module"
  | "sales-pipeline"
  | "terms-approval-queue"
  | "all-teams-filter"
  | "orders-module";

// yes / no / limited (limited handled per-page by caller reading role directly)
type CapValue = boolean;

const CAPS: Record<Capability, Record<PreviewRole, CapValue>> = {
  "payments-module": {
    admin: true,
    sales: false,
    sdr: false,
    designer: false,
    accountant: true,
    "print-manager": false,
  },
  "money-position-dashboard": {
    admin: true,
    sales: false,
    sdr: false,
    designer: false,
    accountant: true,
    "print-manager": false,
  },
  "pricing-details": {
    admin: true,
    sales: true,
    sdr: true,
    designer: false,
    accountant: true,
    "print-manager": true,
  },
  "customer-contact-info": {
    admin: true,
    sales: true,
    sdr: true,
    designer: false,
    accountant: true,
    "print-manager": true,
  },
  "leads-module": {
    admin: true,
    sales: true,
    sdr: true,
    designer: false,
    accountant: false,
    "print-manager": false,
  },
  "sales-pipeline": {
    admin: true,
    sales: true,
    sdr: true,
    designer: false,
    accountant: false,
    "print-manager": false,
  },
  "terms-approval-queue": {
    admin: true,
    sales: false,
    sdr: false,
    designer: false,
    accountant: true,
    "print-manager": false,
  },
  "all-teams-filter": {
    // sales/sdr can toggle but default to own
    admin: true,
    sales: true,
    sdr: true,
    designer: false,
    accountant: true,
    "print-manager": false,
  },
  "orders-module": {
    // designer = read-only-files-only-view — handled per page. Still true so nav shows.
    admin: true,
    sales: true,
    sdr: true,
    designer: true,
    accountant: true,
    "print-manager": true,
  },
};

export function canSee(role: PreviewRole, capability: Capability): boolean {
  return CAPS[capability]?.[role] ?? false;
}

// ─── Hook ────────────────────────────────────────────
function readRole(): PreviewRole {
  if (typeof window === "undefined") return "admin";
  const raw = window.localStorage.getItem(PREVIEW_ROLE_STORAGE_KEY);
  if (raw && (PREVIEW_ROLES as string[]).includes(raw)) {
    return raw as PreviewRole;
  }
  return "admin";
}

export function usePreviewRole(): [PreviewRole, (r: PreviewRole) => void] {
  const [role, setRoleState] = useState<PreviewRole>("admin");

  useEffect(() => {
    setRoleState(readRole());
    function onStorage(e: StorageEvent) {
      if (e.key === PREVIEW_ROLE_STORAGE_KEY && e.newValue) {
        if ((PREVIEW_ROLES as string[]).includes(e.newValue)) {
          setRoleState(e.newValue as PreviewRole);
        }
      }
    }
    function onCustom() {
      setRoleState(readRole());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("bazaar:preview-role-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("bazaar:preview-role-changed", onCustom);
    };
  }, []);

  function setRole(next: PreviewRole) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREVIEW_ROLE_STORAGE_KEY, next);
    window.dispatchEvent(new Event("bazaar:preview-role-changed"));
    setRoleState(next);
  }

  return [role, setRole];
}
