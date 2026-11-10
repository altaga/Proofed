import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import { getProjectConfig } from "@/lib/config";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif" });
const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono" });

export function generateMetadata(): Metadata {
  const cfg = getProjectConfig();
  return {
    title: `${cfg.name} — ${cfg.tagline}`,
    description: cfg.tagline,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const cfg = getProjectConfig();
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
        <AppShell name={cfg.name} tagline={cfg.tagline}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
