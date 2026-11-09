import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { getProjectConfig } from "@/lib/config";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif" });
const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans" });

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
      <body className={`${serif.variable} ${sans.variable}`}>
        <div className="shell">
          <header className="topbar">
            <a className="brand" href="/">
              <div className="seal">{cfg.name.slice(0, 1)}</div>
              <div>
                <h1>{cfg.name}</h1>
                <p>{cfg.tagline}</p>
              </div>
            </a>
            <nav className="nav">
              <a href="/">Shop</a>
              <a href="/device">Pickup station</a>
              <a href="/merchant">Merchant desk</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
