import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getProjectConfig } from "@/lib/config";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: "Proofed",
    description: "Authorize now. Capture only after proof of handover.",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon.svg", type: "image/svg+xml" },
      ],
      shortcut: "/favicon.ico",
      apple: "/icon.svg",
    },
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
