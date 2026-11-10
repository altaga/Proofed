import { getDb } from "./db";

export type SeedProduct = {
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  stock: number;
};

export const SEED_CATALOG: SeedProduct[] = [
  // --- ELECTRONICS & GADGETS ---
  {
    sku: "ELEC-GAN-100",
    name: "GaN 100W USB-C Fast Charger",
    description: "Compact 4-port gallium nitride wall charger with 2x USB-C PD and 2x USB-A.",
    price_cents: 3800,
    category: "electronics",
    stock: 24,
  },
  {
    sku: "ELEC-CBL-USBC",
    name: "Braided 240W USB-C Cable (2m)",
    description: "Ultra-durable nylon braided cable supporting 240W fast charging and 40Gbps data.",
    price_cents: 1600,
    category: "electronics",
    stock: 45,
  },
  {
    sku: "ELEC-HUB-8IN1",
    name: "Aluminum 8-in-1 USB-C Hub",
    description: "Multiport adapter with 4K HDMI 60Hz, 100W PD passthrough, SD/TF card reader, and Gigabit Ethernet.",
    price_cents: 4200,
    category: "electronics",
    stock: 18,
  },
  {
    sku: "ELEC-CAM-4K60",
    name: "Ultra-HD 4K Streaming Webcam",
    description: "Sony Starvis sensor webcam with dual stereo noise-canceling microphones and privacy cover.",
    price_cents: 7500,
    category: "electronics",
    stock: 12,
  },
  {
    sku: "ELEC-KB-MECH",
    name: "75% Wireless Mechanical Keyboard",
    description: "Hot-swappable mechanical keyboard with pre-lubed Gateron Brown switches and RGB backlighting.",
    price_cents: 8900,
    category: "electronics",
    stock: 15,
  },
  {
    sku: "ELEC-MS-ERGO",
    name: "Ergonomic Bluetooth Wireless Mouse",
    description: "Sculpted ergonomic vertical mouse with silent switches and hyper-fast scroll wheel.",
    price_cents: 4500,
    category: "electronics",
    stock: 20,
  },
  {
    sku: "ELEC-BNK-20K",
    name: "20,000mAh 65W Laptop Power Bank",
    description: "High-capacity portable battery pack able to charge MacBook Pro, iPhone, and accessories simultaneously.",
    price_cents: 5400,
    category: "electronics",
    stock: 14,
  },
  {
    sku: "ELEC-STAND-MAG",
    name: "3-in-1 MagSafe Charging Stand",
    description: "Weighted aluminum wireless dock charging iPhone, Apple Watch, and AirPods at peak speeds.",
    price_cents: 4900,
    category: "electronics",
    stock: 16,
  },
  {
    sku: "ELEC-SPK-MINI",
    name: "Waterproof Bluetooth 5.3 Speaker",
    description: "IPX7 rugged outdoor speaker with 360-degree sound, 14-hour battery, and punchy bass.",
    price_cents: 3900,
    category: "electronics",
    stock: 22,
  },
  {
    sku: "ELEC-EAR-ANC",
    name: "True Wireless ANC Earbuds",
    description: "Active noise-canceling wireless earbuds with transparency mode and spatial audio.",
    price_cents: 6900,
    category: "electronics",
    stock: 19,
  },
  {
    sku: "ELEC-PLUG-4PK",
    name: "Smart Wi-Fi Power Plugs (4-Pack)",
    description: "Energy monitoring smart sockets compatible with Apple Home, Alexa, and Google Assistant.",
    price_cents: 2800,
    category: "electronics",
    stock: 30,
  },
  {
    sku: "ELEC-HDMI-8K",
    name: "Braided 8K HDMI 2.1 Cable (3m)",
    description: "Ultra high speed 48Gbps HDMI cable supporting 8K 60Hz and 4K 120Hz for gaming and home theater.",
    price_cents: 1900,
    category: "electronics",
    stock: 40,
  },

  // --- SMART HOME & HOME SECURITY ---
  {
    sku: "SMART-DB-2K",
    name: "Smart Video Doorbell 2K HDR",
    description: "Wireless doorstep security camera with AI person/package detection, color night vision, and two-way talk.",
    price_cents: 12900,
    category: "smarthome",
    stock: 11,
  },
  {
    sku: "SMART-LCK-KEY",
    name: "Keyless Fingerprint Porch Lock",
    description: "Smart deadbolt with biometric fingerprint scanner, numeric keypad, and remote app unlock.",
    price_cents: 14900,
    category: "smarthome",
    stock: 9,
  },
  {
    sku: "SMART-CAM-OUT",
    name: "Weatherproof Outdoor Porch Cam",
    description: "Solar-powered 1080p security camera with integrated motion spotlight and 110dB siren.",
    price_cents: 8900,
    category: "smarthome",
    stock: 15,
  },
  {
    sku: "SMART-BOX-LOCK",
    name: "Smart Porch Delivery Box (Solenoid)",
    description: "Heavy-gauge steel parcel drop box with automated solenoid lock that latches upon courier delivery.",
    price_cents: 18900,
    category: "smarthome",
    stock: 6,
  },

  // --- HOME, KITCHEN & GOURMET COFFEE ---
  {
    sku: "HOME-MUG-CERAM",
    name: "Double-Walled Ceramic Pour-Over Mug",
    description: "14oz handcrafted matte ceramic mug with heat-insulating double wall and splash-proof lid.",
    price_cents: 2200,
    category: "kitchen",
    stock: 28,
  },
  {
    sku: "HOME-PRS-COF",
    name: "Stainless Steel French Press (1L)",
    description: "Double-wall insulated vacuum French press coffee maker that keeps coffee hot for 4 hours.",
    price_cents: 3400,
    category: "kitchen",
    stock: 17,
  },
  {
    sku: "HOME-KTL-GOOSE",
    name: "Electric Gooseneck Pour-Over Kettle",
    description: "Precision temperature control kettle with stopwatch and ergonomic counterbalanced handle.",
    price_cents: 6800,
    category: "kitchen",
    stock: 10,
  },
  {
    sku: "HOME-GRND-BURR",
    name: "Conical Burr Hand Coffee Grinder",
    description: "CNC stainless steel 38mm burr hand grinder with 40 micro-click grind settings.",
    price_cents: 5200,
    category: "kitchen",
    stock: 14,
  },
  {
    sku: "HOME-KNF-CHEF",
    name: "8-Inch Japanese Damascus Chef Knife",
    description: "VG-10 67-layer Damascus steel blade with ergonomic pakkawood handle and razor edge.",
    price_cents: 6400,
    category: "kitchen",
    stock: 13,
  },
  {
    sku: "HOME-TWL-WAF",
    name: "Organic Waffle Kitchen Towels (3-Pack)",
    description: "100% Turkish organic cotton honeycomb waffle towels with high absorbency and quick drying.",
    price_cents: 1800,
    category: "kitchen",
    stock: 35,
  },
  {
    sku: "HOME-HUMID-MIST",
    name: "Ultrasonic Cool Mist Humidifier (4L)",
    description: "Whisper-quiet top-fill room humidifier with essential oil diffuser tray and ambient night light.",
    price_cents: 4200,
    category: "kitchen",
    stock: 20,
  },
  {
    sku: "HOME-CNDL-SOY",
    name: "Botanical Soy Scented Candle (Amber & Moss)",
    description: "Hand-poured 100% soy wax candle with crackling wood wick and 55-hour clean burn time.",
    price_cents: 2400,
    category: "kitchen",
    stock: 32,
  },
  {
    sku: "HOME-BOWL-RAMEN",
    name: "Japanese Ceramic Ramen Bowls (Set of 2)",
    description: "Large 36oz glazed ceramic bowls with matching wooden ladles and chopstick rests.",
    price_cents: 3200,
    category: "kitchen",
    stock: 16,
  },
  {
    sku: "HOME-MAT-DOOR",
    name: "Natural Coconut Fiber Porch Mat",
    description: "Heavy-duty outdoor coir welcome mat with non-slip vinyl backing for doorstep entryways.",
    price_cents: 2600,
    category: "kitchen",
    stock: 25,
  },

  // --- PANTRY, SNACKS & GOURMET BEVERAGES ---
  {
    sku: "PAN-COF-ETH",
    name: "Ethiopian Yirgacheffe Whole Beans (12oz)",
    description: "Light roast single-origin specialty coffee with jasmine, bergamot, and lemon citrus notes.",
    price_cents: 1850,
    category: "pantry",
    stock: 40,
  },
  {
    sku: "PAN-MAT-CEREM",
    name: "Ceremonial Grade Uji Matcha (30g)",
    description: "First-harvest stone-ground Japanese green tea powder with vibrant green color and rich umami.",
    price_cents: 2800,
    category: "pantry",
    stock: 26,
  },
  {
    sku: "PAN-CHOC-SEA",
    name: "72% Dark Chocolate Sea Salt Bar (3-Pack)",
    description: "Single-origin fair-trade bean-to-bar dark chocolate with hand-harvested Maldon sea salt flakes.",
    price_cents: 1400,
    category: "pantry",
    stock: 50,
  },
  {
    sku: "PAN-ELEC-HYD",
    name: "Electrolyte Hydration Drink Mix (16 Sticks)",
    description: "Zero-sugar electrolyte powder formulated with optimal sodium, potassium, and magnesium ratios.",
    price_cents: 1950,
    category: "pantry",
    stock: 38,
  },
  {
    sku: "PAN-OIL-EVOO",
    name: "Cold-Pressed Single-Estate EVOO (500ml)",
    description: "Early-harvest extra virgin olive oil from ancient Greek groves with high polyphenol antioxidant count.",
    price_cents: 2400,
    category: "pantry",
    stock: 22,
  },
  {
    sku: "PAN-SNK-ALM",
    name: "Smoked Sea Salt Almonds & Pecans (10oz)",
    description: "Slow-roasted whole California almonds and Georgia pecans dusted with natural hickory smoke salt.",
    price_cents: 1250,
    category: "pantry",
    stock: 42,
  },
  {
    sku: "PAN-TEA-CHAM",
    name: "Organic Whole Flower Chamomile Tea (50g)",
    description: "Caffeine-free loose herbal tea with whole golden chamomile flowers and lavender buds for sleep.",
    price_cents: 1200,
    category: "pantry",
    stock: 35,
  },
  {
    sku: "PAN-HON-RAW",
    name: "Raw Wildflower Honeycomb Jar (16oz)",
    description: "Unfiltered, unpasteurized natural wildflower honey containing a raw hand-cut square of honeycomb.",
    price_cents: 1650,
    category: "pantry",
    stock: 28,
  },

  // --- APPAREL, BAGS & STREETWEAR ---
  {
    sku: "APP-WIND-BLK",
    name: "Waterproof Technical Shell Jacket",
    description: "3-layer breathable ripstop nylon shell with taped seams, YKK AquaGuard zippers, and storm hood.",
    price_cents: 11500,
    category: "apparel",
    stock: 12,
  },
  {
    sku: "APP-BEAN-MER",
    name: "100% Merino Wool Ribbed Beanie",
    description: "Soft, temperature-regulating extrafine merino wool watch cap knitted in a classic ribbed gauge.",
    price_cents: 3200,
    category: "apparel",
    stock: 30,
  },
  {
    sku: "APP-TEE-HVY",
    name: "Heavyweight 280GSM Cotton T-Shirt",
    description: "Vintage-washed relaxed fit crewneck made from combed organic cotton with reinforced collar.",
    price_cents: 3600,
    category: "apparel",
    stock: 25,
  },
  {
    sku: "APP-HOD-TERRY",
    name: "French Terry Raglan Hoodie (Onyx)",
    description: "450GSM loopback French terry pullover with custom metal aglets and kangaroo hand pocket.",
    price_cents: 7800,
    category: "apparel",
    stock: 14,
  },
  {
    sku: "APP-BPK-TECH",
    name: "Weatherproof 22L Commuter Backpack",
    description: "Cordura ballistic nylon pack with dedicated padded 16-inch laptop compartment and luggage pass-through.",
    price_cents: 9800,
    category: "apparel",
    stock: 16,
  },
  {
    sku: "APP-TOTE-CANV",
    name: "Heavy Duty 18oz Canvas Work Tote",
    description: "Structured utilitarian tote bag with brass rivets, interior zip pocket, and reinforced bottom.",
    price_cents: 3400,
    category: "apparel",
    stock: 24,
  },
  {
    sku: "APP-SUN-POLAR",
    name: "Polarized Handcrafted Acetate Sunglasses",
    description: "Classic square silhouette with scratch-resistant polarized CR-39 lenses and 100% UVA/UVB protection.",
    price_cents: 6800,
    category: "apparel",
    stock: 18,
  },
  {
    sku: "APP-SCK-WOOL",
    name: "Merino Trail Cushion Socks (3-Pack)",
    description: "Seamless toe anti-blister crew socks with arch compression band and high-impact heel cushioning.",
    price_cents: 2200,
    category: "apparel",
    stock: 36,
  },

  // --- FITNESS, SPORTS & OUTDOORS ---
  {
    sku: "FIT-BTL-32OZ",
    name: "Insulated 32oz Wide-Mouth Bottle",
    description: "Vacuum insulated pro-grade stainless steel bottle with leakproof straw cap that keeps ice cold 24h.",
    price_cents: 2900,
    category: "fitness",
    stock: 34,
  },
  {
    sku: "FIT-BAND-SET",
    name: "Heavy-Duty Resistance Loop Bands (5-Pack)",
    description: "Natural Malaysian latex resistance loop bands ranging from 5 lbs to 50 lbs with travel pouch.",
    price_cents: 2200,
    category: "fitness",
    stock: 40,
  },
  {
    sku: "FIT-MAT-YOGA",
    name: "Natural Tree Rubber Non-Slip Yoga Mat",
    description: "5mm dense cushioning mat with polyurethane top layer offering zero-slip grip even when wet.",
    price_cents: 5800,
    category: "fitness",
    stock: 15,
  },
  {
    sku: "FIT-ROLL-FOAM",
    name: "High-Density Deep Tissue Foam Roller",
    description: "Molded polypropylene trigger-point roller for myofascial release, back relief, and post-workout recovery.",
    price_cents: 2600,
    category: "fitness",
    stock: 22,
  },
  {
    sku: "FIT-LAMP-RUN",
    name: "Rechargeable 500-Lumen Trail Headlamp",
    description: "Ultralight IPX6 waterproof headlamp with red night-vision LED, tilt adjustment, and USB-C charging.",
    price_cents: 3400,
    category: "fitness",
    stock: 20,
  },
  {
    sku: "FIT-ROPE-SPEED",
    name: "Ball-Bearing Speed Jump Rope",
    description: "Tangle-free steel cable with 360-degree dual ball bearings and lightweight knurled aluminum handles.",
    price_cents: 1800,
    category: "fitness",
    stock: 30,
  },
  {
    sku: "FIT-PROT-WHEY",
    name: "Grass-Fed Whey Protein Isolate (2 lbs)",
    description: "Clean unflavored cold-filtered whey isolate delivering 27g protein and 0g sugar per serving.",
    price_cents: 4400,
    category: "fitness",
    stock: 25,
  },

  // --- DESK, OFFICE & STATIONERY ---
  {
    sku: "OFF-NOTE-DOT",
    name: "Hardcover Dot Grid Journal (160GSM)",
    description: "Lay-flat thread-bound journal with 160gsm bleed-proof bamboo paper and numbered index.",
    price_cents: 2100,
    category: "office",
    stock: 38,
  },
  {
    sku: "OFF-PEN-BRASS",
    name: "Solid Brass Heavyweight Rollerball Pen",
    description: "Machined solid brass EDC pen accepting Schmidt 5888 refills with natural patina over time.",
    price_cents: 3600,
    category: "office",
    stock: 25,
  },
  {
    sku: "OFF-MAT-DESK",
    name: "Merino Wool Felt & Leather Desk Pad",
    description: "Large 900x400mm water-resistant desk mat providing quiet keystrokes and smooth mouse gliding.",
    price_cents: 3400,
    category: "office",
    stock: 20,
  },
  {
    sku: "OFF-STAND-LAP",
    name: "Aluminum Ergonomic Laptop Riser",
    description: "Foldable CNC-machined laptop stand with silicone grip pads and open airflow cooling channel.",
    price_cents: 3900,
    category: "office",
    stock: 18,
  },
  {
    sku: "OFF-ORG-CBL",
    name: "Magnetic Desktop Cable Organizers (3-Pack)",
    description: "Weighted silicone bases with magnetic collar clips that keep charging cords organized on your desk.",
    price_cents: 1600,
    category: "office",
    stock: 45,
  },
  {
    sku: "OFF-NOTE-STICK",
    name: "Minimalist Muted Sticky Notes (6-Pack)",
    description: "Earthy palette self-adhesive note pads with repositionable clean-release adhesive.",
    price_cents: 1100,
    category: "office",
    stock: 60,
  },

  // --- GROOMING, SKINCARE & SELF-CARE ---
  {
    sku: "BEAU-SRM-HYAL",
    name: "Pure Hyaluronic Acid Serum (60ml)",
    description: "Multi-molecular weight hyaluronic acid serum with Vitamin B5 for intense cellular hydration.",
    price_cents: 2600,
    category: "beauty",
    stock: 35,
  },
  {
    sku: "BEAU-SUN-SPF50",
    name: "Daily Mineral Sunscreen Fluid SPF 50",
    description: "Non-greasy zinc oxide sheer sunscreen with matte finish and zero white cast.",
    price_cents: 2400,
    category: "beauty",
    stock: 28,
  },
  {
    sku: "BEAU-BALM-LIP",
    name: "Organic Beeswax Lip Balm Trio",
    description: "Ultra-hydrating lip balm pack with peppermint, vanilla bean, and unflavored shea butter.",
    price_cents: 950,
    category: "beauty",
    stock: 55,
  },
  {
    sku: "BEAU-SOAP-CHAR",
    name: "Activated Charcoal Bar Soap (2-Pack)",
    description: "Cold-process handmade cleansing soap with tea tree oil, coconut oil, and clarifying charcoal.",
    price_cents: 1400,
    category: "beauty",
    stock: 40,
  },

  // --- VENUE SOUVENIRS & SPECIAL ITEMS ---
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
    name: "Out of Stock Bottle (Test Item)",
    description: "Reusable bottle intentionally configured with 0 inventory to demonstrate stock-out recovery.",
    price_cents: 1400,
    category: "kitchen",
    stock: 0,
  },
];

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
  if (Number(row.c) === 0 || Number(row.c) < 20) {
    seedCatalog(true);
  }
}
