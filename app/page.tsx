import { getProjectConfig } from "@/lib/config";
import { ShopperApp } from "@/components/ShopperApp";

export default function Page() {
  const cfg = getProjectConfig();
  return (
    <main>
      <section className="hero">
        <h2>Shop the {cfg.venueName} without paying until handover is proven.</h2>
        <p>
          Tell the assistant what you want and your budget. It checks live stock, places a PayPal
          authorization — not a capture — and the kiosk captures only after it records pickup evidence.
        </p>
      </section>
      <ShopperApp />
    </main>
  );
}
