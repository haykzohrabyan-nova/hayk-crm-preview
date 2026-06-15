import type { CompanyForSend } from "./send-quote";
import {
  buildSimpleAdminEmail,
  invoiceLinkEmailKey,
  orderReadyEmailKey,
  paymentConfirmedEmailKey,
  quoteDeliveryEmailKey,
  renderAdminEmailParts,
} from "./apply-admin-email";
import type { EmailTemplateKey } from "./email-template-catalog";
import type { EmailTemplateVars } from "./render-email-template";
import type { LoadedEmailTemplate } from "./load-email-templates";
import {
  invoiceLinkExtraHtml,
  invoiceRevisionBannerHtml,
  orderReadyLocationExtraHtml,
  orderReadyRefExtraHtml,
  paymentConfirmedExtraHtml,
  paymentMethodsExtraHtml,
  paymentReminderExtraHtml,
} from "./customer-email-extra-html";
import { buildQuoteEmail, type QuoteEmailData } from "./quote-email-template";

const PAYMENT_LABELS: Record<string, string> = {
  card_default: "Credit / Debit Card",
  zelle: "Zelle",
  offline: "Cash / Check / Bank Transfer",
};

function firstName(customerName: string): string {
  return customerName.split(" ")[0] || customerName;
}

function companyName(company: CompanyForSend): string {
  return company.company_name ?? "BazaarPrinting";
}

import { fmtEmailCurrency } from "@/lib/integrations/email-format";

export function buildQuoteDeliveryEmail(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  data: QuoteEmailData,
): { subject: string; html: string } {
  const isOrder = data.isOrder ?? false;
  const key = quoteDeliveryEmailKey(isOrder, data.revisionNotice);
  const ref = data.referenceCode ?? data.title ?? "—";
  const vars: EmailTemplateVars = {
    firstName: firstName(data.customerName),
    companyName: companyName(data.company),
    ref,
    link: data.confirmUrl,
  };
  const { subject, bodyText, ctaLabel } = renderAdminEmailParts(templates, key, vars);

  return buildQuoteEmail({
    ...data,
    adminCopy: {
      subject,
      introHtml: bodyText,
      ctaLabel,
    },
  });
}

export function buildPaymentReminderFromTemplates(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  data: {
    customerName: string;
    referenceCode: string;
    finalTotal: number;
    paymentTypes: string[];
    paymentUrl: string;
    company: CompanyForSend;
  },
): { subject: string; html: string } {
  const cn = companyName(data.company);
  const fn = firstName(data.customerName);
  const vars: EmailTemplateVars = {
    firstName: fn,
    ref: data.referenceCode,
    companyName: cn,
    total: fmtEmailCurrency(data.finalTotal),
    link: data.paymentUrl,
  };
  const paymentList = data.paymentTypes.map((k) => PAYMENT_LABELS[k] ?? k).join(", ");
  const extraHtml =
    paymentReminderExtraHtml(data.referenceCode, data.finalTotal) +
    paymentMethodsExtraHtml(paymentList);

  return buildSimpleAdminEmail(templates, "payment_reminder", vars, {
    companyName: cn,
    firstName: fn,
    ctaUrl: data.paymentUrl,
    extraHtml,
  });
}

export function buildInvoiceLinkFromTemplates(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  data: {
    customerName: string;
    referenceCode: string;
    finalTotal: number;
    orderUrl: string;
    statusLine: string;
    company: CompanyForSend;
    revisionNotice?: "admin";
    ticket: { ticket_status?: string | null; payment_status?: string | null };
  },
): { subject: string; html: string } {
  const cn = companyName(data.company);
  const fn = firstName(data.customerName);
  const key = invoiceLinkEmailKey(data.ticket, data.revisionNotice);
  const vars: EmailTemplateVars = {
    firstName: fn,
    ref: data.referenceCode,
    companyName: cn,
    total: fmtEmailCurrency(data.finalTotal),
    link: data.orderUrl,
    statusLine: data.revisionNotice ? "" : data.statusLine,
  };

  const revisionExtra = data.revisionNotice === "admin" ? invoiceRevisionBannerHtml() : "";
  const extraHtml = revisionExtra + invoiceLinkExtraHtml(data.referenceCode, data.finalTotal);

  return buildSimpleAdminEmail(templates, key, vars, {
    companyName: cn,
    firstName: fn,
    ctaUrl: data.orderUrl,
    extraHtml,
  });
}

export function buildOrderReadyFromTemplates(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  data: {
    customerName: string;
    referenceCode: string;
    orderUrl: string;
    company: CompanyForSend;
    requiresShipping?: boolean;
    shipToAddress?: string | null;
    pickupAddress?: string;
  },
): { subject: string; html: string } {
  const cn = companyName(data.company);
  const fn = firstName(data.customerName);
  const requiresShipping = Boolean(data.requiresShipping);
  const key = orderReadyEmailKey(requiresShipping);
  const vars: EmailTemplateVars = {
    firstName: fn,
    ref: data.referenceCode,
    companyName: cn,
    link: data.orderUrl,
  };

  const extraHtml =
    orderReadyRefExtraHtml(data.referenceCode) +
    orderReadyLocationExtraHtml({
      requiresShipping,
      shipToAddress: data.shipToAddress,
      pickupAddress: data.pickupAddress,
      companyPhone: data.company.phone,
    });

  return buildSimpleAdminEmail(templates, key, vars, {
    companyName: cn,
    firstName: fn,
    ctaUrl: data.orderUrl,
    extraHtml,
  });
}

export function buildPaymentConfirmedFromTemplates(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  data: {
    customerName: string;
    referenceCode: string;
    amountConfirmed: number;
    inProduction: boolean;
    fullyPaid: boolean;
    orderUrl: string;
    company: CompanyForSend;
  },
): { subject: string; html: string } {
  const cn = companyName(data.company);
  const fn = firstName(data.customerName);
  const key = paymentConfirmedEmailKey({
    fullyPaid: data.fullyPaid,
    inProduction: data.inProduction,
  });
  const vars: EmailTemplateVars = {
    firstName: fn,
    amount: fmtEmailCurrency(data.amountConfirmed),
    ref: data.referenceCode,
    companyName: cn,
    link: data.orderUrl,
  };

  return buildSimpleAdminEmail(templates, key, vars, {
    companyName: cn,
    firstName: fn,
    ctaUrl: data.orderUrl,
    extraHtml: paymentConfirmedExtraHtml(data.referenceCode, data.amountConfirmed),
  });
}

export function buildTaxExemptApprovedFromTemplates(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  data: {
    customerName: string;
    referenceCode: string;
    previousFinalTotal: number;
    newFinalTotal: number;
    totalChanged: boolean;
    orderUrl: string;
    company: CompanyForSend;
  },
): { subject: string; html: string } {
  const cn = companyName(data.company);
  const fn = firstName(data.customerName);
  const key: EmailTemplateKey = data.totalChanged
    ? "tax_exempt_approved"
    : "tax_exempt_approved_total_unchanged";
  const vars: EmailTemplateVars = {
    firstName: fn,
    amount: fmtEmailCurrency(data.newFinalTotal),
    ref: data.referenceCode,
    companyName: cn,
    link: data.orderUrl,
    previousTotal: fmtEmailCurrency(data.previousFinalTotal),
  };

  return buildSimpleAdminEmail(templates, key, vars, {
    companyName: cn,
    firstName: fn,
    ctaUrl: data.orderUrl,
  });
}

export function buildQuoteFollowUpFromTemplates(
  templates: Record<EmailTemplateKey, LoadedEmailTemplate>,
  data: {
    customerName: string;
    referenceCode: string;
    finalTotal: number;
    confirmUrl: string;
    company: CompanyForSend;
  },
): { subject: string; html: string } {
  const cn = companyName(data.company);
  const fn = firstName(data.customerName);
  const hasTotal = (data.finalTotal ?? 0) > 0;
  const key: EmailTemplateKey = hasTotal ? "quote_follow_up" : "quote_follow_up_no_total";
  const vars: EmailTemplateVars = {
    firstName: fn,
    ref: data.referenceCode,
    companyName: cn,
    total: hasTotal ? fmtEmailCurrency(data.finalTotal) : undefined,
    link: data.confirmUrl,
  };

  return buildSimpleAdminEmail(templates, key, vars, {
    companyName: cn,
    firstName: fn,
    ctaUrl: data.confirmUrl,
  });
}
