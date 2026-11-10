import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getProjectConfig } from "@/lib/config";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

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
      <body>
        <AppShell name={cfg.name} tagline={cfg.tagline}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
