"use client";

import { useState } from "react";

export function ProductThumbnail({
  sku,
  name,
  className = "quote-img",
}: {
  sku: string;
  name?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !sku) {
    const initial = (name || sku || "P").charAt(0).toUpperCase();
    return (
      <div
        className={`product-fallback-thumb ${className}`}
        aria-label={name || sku}
        title={name || sku}
      >
        <span className="product-fallback-initial mono">{initial}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/products/${sku}.svg`}
      alt={name || sku}
      className={className}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
}
