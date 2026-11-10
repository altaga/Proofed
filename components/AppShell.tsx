"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SiteHeader } from "./SiteHeader";

export function AppShell({
  name,
  tagline,
  children,
}: {
  name: string;
  tagline: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const kiosk = pathname === "/device";
  return (
    <div className={`shell${kiosk ? " kiosk-shell" : ""}`}>
      <SiteHeader name={name} tagline={tagline} />
      {children}
      {!kiosk && (
        <footer className="site-footer">
          {name} never invents a PayPal amount. Catalog prices, stock, and payment states come from SQLite and live sandbox GETs.
        </footer>
      )}
    </div>
  );
}
