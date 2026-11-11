"use client";

import Link from "next/link";

export function SiteHeader({ name }: { name: string; tagline?: string }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/" title="Proofed Protocol Command Hub">
        <span className="mark" aria-hidden="true">
          <span className="mark-notch" />
        </span>
        <h1>{name}</h1>
      </Link>
    </header>
  );
}
