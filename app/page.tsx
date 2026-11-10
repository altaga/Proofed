import { getProjectConfig } from "@/lib/config";
import { ShopperApp } from "@/components/ShopperApp";

export default function Page() {
  const cfg = getProjectConfig();
  return (
    <main data-testid="page-shop">
      <section className="page-head">
        <h2>{cfg.venueName}</h2>
        <p className="lede">Ask for something you like. Pay when the price looks right.</p>
      </section>
      <ShopperApp />
    </main>
  );
}
