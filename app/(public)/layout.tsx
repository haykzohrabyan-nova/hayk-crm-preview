import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BazaarPrinting — Quote",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
