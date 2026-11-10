import { getDb } from "./db";

export const SEED_CATALOG = [
  {
    sku: "DC-KEY-01",
    name: "Pudgy Keychain",
    description: "A small enamel keychain from the venue shop.",
    price_cents: 1200,
    category: "souvenirs",
    stock: 8,
  },
  {
    sku: "DC-PIN-01",
    name: "Venue Enamel Pin",
    description: "Soft-enamel pin with the shop mark.",
    price_cents: 850,
    category: "souvenirs",
    stock: 15,
  },
  {
    sku: "DC-TWL-01",
    name: "Stadium Towel",
    description: "Cotton towel printed for the venue.",
    price_cents: 1800,
    category: "apparel",
    stock: 5,
  },
  {
    sku: "DC-PLU-01",
    name: "Limited Plush",
    description: "Small plush toy. Only a couple left on the shelf.",
    price_cents: 2400,
    category: "toys",
    stock: 2,
  },
  {
    sku: "DC-PST-01",
    name: "Postcard Set",
    description: "Set of five postcards of the grounds.",
    price_cents: 600,
    category: "stationery",
    stock: 20,
  },
  {
    sku: "DC-BTL-01",
    name: "Water Bottle",
    description: "Reusable bottle. Currently listed with zero on-hand stock so we can demo a genuine out-of-stock path.",
    price_cents: 1400,
    category: "drinkware",
    stock: 0,
  },
  {
    sku: "DC-SNK-01",
    name: "Snack Combo",
    description: "Packaged snack boxed for pickup at the kiosk.",
    price_cents: 950,
    category: "food",
    stock: 10,
  },
  {
    sku: "DC-CAP-01",
    name: "Kids Cap",
    description: "Adjustable cap in youth size.",
    price_cents: 1600,
    category: "apparel",
    stock: 4,
  },
  {
    sku: "DC-MUG-01",
    name: "Ceramic Mug",
    description: "16oz ceramic mug.",
    price_cents: 1100,
    category: "drinkware",
    stock: 7,
  },
] as const;

export function seedCatalog(reset = false) {
  const db = getDb();
  if (reset) {
    db.exec("DELETE FROM catalog_items");
  }
  const insert = db.prepare(
    `INSERT INTO catalog_items (sku, name, description, price_cents, category, stock, active)
     VALUES ($sku, $name, $description, $price_cents, $category, $stock, 1)
     ON CONFLICT(sku) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       price_cents = excluded.price_cents,
       category = excluded.category,
       stock = excluded.stock,
       active = 1`,
  );
  for (const item of SEED_CATALOG) {
    insert.run(item);
  }
}

export function seedCatalogIfEmpty() {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM catalog_items").get() as { c: number | bigint };
  if (Number(row.c) === 0) seedCatalog(false);
}
