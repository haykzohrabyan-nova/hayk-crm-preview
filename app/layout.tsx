import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { GlobalLoadingProvider } from "@/components/layout/global-loading-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalEventHandlers } from "@/components/layout/global-event-handlers";
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
          <GlobalLoadingProvider>
          <TooltipProvider>
            <GlobalEventHandlers />
            <NextTopLoader color="var(--color-accent)" showSpinner={false} />
            {children}
            <SpeedInsights />
          </TooltipProvider>
          </GlobalLoadingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
