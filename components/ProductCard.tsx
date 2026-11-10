"use client";

export type CatalogProduct = {
  sku: string;
  name: string;
  description?: string;
  formatted_price: string;
  available: number;
  image?: string;
};

export function ProductCard({
  item,
  onSelect,
}: {
  item: CatalogProduct;
  onSelect?: (item: CatalogProduct) => void;
}) {
  const oos = item.available <= 0;
  return (
    <button
      type="button"
      className={`product-card${oos ? " oos" : ""}`}
      onClick={() => { if (!oos) onSelect?.(item); }}
      disabled={oos}
    >
      <img src={item.image || `/products/${item.sku}.svg`} alt="" />
      <div className="meta">
        <strong>{item.name}</strong>
        <div className="mono">{item.sku}</div>
        <div className="price">{item.formatted_price}</div>
        <div>{oos ? "Out of stock" : `${item.available} available`}</div>
      </div>
    </button>
  );
}
