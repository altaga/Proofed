import { getProjectConfig } from "@/lib/config";
import { ShopperApp } from "@/components/ShopperApp";

export default function Page() {
  const cfg = getProjectConfig();
  return (
    <main data-testid="page-shop">
      <section className="page-head">
        <h2>{cfg.venueName}</h2>
        <p className="lede">
          Ask for an item and a budget. Checkout opens a PayPal hold; capture waits for pickup.
        </p>
      </section>
      <ShopperApp />
    </main>
  );
}
