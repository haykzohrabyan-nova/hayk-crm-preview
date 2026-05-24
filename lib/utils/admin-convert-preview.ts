import { computeCheckout } from "@/lib/utils/compute-checkout";
import type { PaymentConfig } from "@/lib/types";

/** Warnings shown before an admin manually converts a quote to an order. */
export function buildAdminConvertPreview(input: {
  missingSendFields: string[];
  requireClientConfirm: boolean;
  clientConfirmed: boolean;
  quoteFinalTotal: number;
  clientConfirmedFlag: boolean;
  paymentAmountReceived: number | null;
  paymentPaidAt: string | null;
  depositAmount: number | null;
  depositPaidAt: string | null;
  balancePaidAt: string | null;
  productionReleasedAt: string | null;
  ticketPaymentStrategy: string | null;
  ticketDepositType: string | null;
  ticketDepositValue: number | null;
  ticketDepHandling: string | null;
  ticketFullChannels: string[] | null;
  ticketPartialChannels: string[] | null;
}): {
  missingSendFields: string[];
  confirmRequiredMissing: boolean;
  wouldReleaseProduction: boolean;
} {
  const requireClientConfirm = input.requireClientConfirm;
  const confirmRequiredMissing =
    requireClientConfirm && !input.clientConfirmed && !input.clientConfirmedFlag;

  const strategy = input.ticketPaymentStrategy ?? "full";
  const channels =
    strategy === "partial"
      ? (input.ticketPartialChannels ?? [])
      : (input.ticketFullChannels ?? []);

  const cfg = {
    paymentStrategy: strategy as PaymentConfig["paymentStrategy"],
    depositType: (input.ticketDepositType as "percent" | "fixed") ?? "percent",
    depositValue: input.ticketDepositValue ?? 0,
    depHandling: (input.ticketDepHandling as "cash" | "gateway") ?? "gateway",
    paymentChannels: channels,
    requireClientConfirm,
  } as PaymentConfig;

  const checkout = computeCheckout(cfg, {
    quote_final_total: input.quoteFinalTotal,
    client_confirmed: input.clientConfirmedFlag,
    payment_amount_received: input.paymentAmountReceived,
    payment_paid_at: input.paymentPaidAt,
    deposit_amount: input.depositAmount,
    deposit_paid_at: input.depositPaidAt,
    balance_paid_at: input.balancePaidAt,
    production_released_at: input.productionReleasedAt,
    ticket_payment_strategy: input.ticketPaymentStrategy as "full" | "partial" | "net" | null,
    ticket_deposit_type: input.ticketDepositType as "percent" | "fixed" | null,
    ticket_deposit_value: input.ticketDepositValue,
  });

  return {
    missingSendFields: input.missingSendFields,
    confirmRequiredMissing,
    wouldReleaseProduction: checkout.canReleaseProduction,
  };
}
