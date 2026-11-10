"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/", label: "Shop" },
  { href: "/device", label: "Pickup" },
  { href: "/merchant", label: "Merchant" },
];

export function SiteHeader({ name, tagline }: { name: string; tagline: string }) {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <Link className="brand" href="/demo">
        <div className="seal" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
        <div>
          <h1>{name}</h1>
          <p>{tagline}</p>
        </div>
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
