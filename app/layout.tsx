import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalEventHandlers } from "@/components/global-event-handlers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BazaarPrinting CRM",
  description: "BazaarPrinting CRM — internal tools",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <TooltipProvider>
            <GlobalEventHandlers />
            <NextTopLoader color="var(--color-accent)" showSpinner={false} />
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
