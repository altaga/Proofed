import { getProjectConfig } from "@/lib/config";
import { MerchantDesk } from "@/components/MerchantDesk";

export default function MerchantPage() {
  const cfg = getProjectConfig();
  return (
    <main>
      <section className="hero">
        <h2>{cfg.venueName} merchant desk</h2>
        <p>Live orders, PayPal identifiers, evidence hashes, and the append-only event log. Manual capture, void, and refund always ask for confirmation and call the real PayPal APIs.</p>
      </section>
      <MerchantDesk />
    </main>
  );
}
