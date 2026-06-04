const PROOF_METHOD_LABELS: Record<string, string> = {
  wire: "Wire transfer",
  ach: "ACH",
  zelle: "Zelle",
  check: "Check",
};

export function paymentEvidenceMethodLabel(method: string): string {
  return PROOF_METHOD_LABELS[method] ?? method;
}
