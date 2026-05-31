/** Safe public-facing refund state for `/q/[token]`. */

export function hasPublicRefundNotice(
  refundStatus: string | null | undefined,
): boolean {
  return refundStatus === "partial" || refundStatus === "full";
}

export function publicRefundBannerMessage(
  refundStatus: string | null | undefined,
): string {
  if (refundStatus === "full") {
    return "This order has been fully refunded. Please contact your sales representative if you have any questions.";
  }
  if (refundStatus === "partial") {
    return "A partial refund has been issued on this order. Please contact your sales representative for further assistance.";
  }
  return "This order has a refund on file. Please contact your sales representative for further assistance.";
}
