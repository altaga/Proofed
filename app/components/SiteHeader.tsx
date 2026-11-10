"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/client", label: "Client" },
  { href: "/delivery", label: "Delivery" },
  { href: "/backend", label: "Backend" },
  { href: "/merchant", label: "Merchant" },
  { href: "/device", label: "Locker" },
];

export function SiteHeader({ name }: { name: string; tagline?: string }) {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <Link className="brand" href="/" title="Proofed Protocol Command Hub">
        <span className="mark" aria-hidden="true">
          <span className="mark-notch" />
        </span>
        <h1>{name}</h1>
      </Link>
      <nav className="nav" aria-label="Primary">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} className={`nav-link${active ? " active" : ""}`}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
