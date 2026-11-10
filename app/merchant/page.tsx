import { getProjectConfig } from "@/lib/config";
import { MerchantDesk } from "@/components/MerchantDesk";

export default function MerchantPage() {
  const cfg = getProjectConfig();
  return (
    <main>
      <section className="hero">
        <p className="kicker">{cfg.venueName}</p>
        <h2>Merchant desk</h2>
        <p>
          Live orders, PayPal identifiers, evidence hashes, and the append-only event log. KPIs are computed
          from the database. Manual capture, void, and refund ask for confirmation and call sandbox for real.
        </p>
      </section>
      <MerchantDesk />
    </main>
  );
}
