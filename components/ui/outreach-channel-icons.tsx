import { Mail, Smartphone } from "lucide-react";
import type { OutreachChannelKind } from "@/lib/utils/outreach-channel-display";

export function OutreachChannelIcons({
  kind,
  size = 14,
  className,
}: {
  kind: OutreachChannelKind;
  size?: number;
  className?: string;
}) {
  if (kind === "both") {
    return (
      <span className={`inline-flex items-center gap-0.5 ${className ?? ""}`}>
        <Mail size={size} aria-hidden />
        <Smartphone size={size} aria-hidden />
      </span>
    );
  }

  if (kind === "sms" || kind === "whatsapp") {
    return <Smartphone size={size} className={className} aria-hidden />;
  }

  return <Mail size={size} className={className} aria-hidden />;
}
