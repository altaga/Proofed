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
  const presenter = pathname === "/demo";
  return (
    <div className={`shell${kiosk ? " kiosk-shell" : ""}${presenter ? " presenter-shell" : ""}`}>
      <SiteHeader name={name} tagline={tagline} />
      <div className="shell-main">{children}</div>
      {!kiosk && !presenter && (
        <footer className="site-footer">Sandbox · PayPal Orders v2 AUTHORIZE · MiniMax-M3</footer>
      )}
    </div>
  );
}
