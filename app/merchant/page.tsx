import { getProjectConfig } from "@/lib/config";
import { MerchantDesk } from "@/components/MerchantDesk";

export default function MerchantPage() {
  const cfg = getProjectConfig();
  return (
    <main data-testid="page-merchant">
      <section className="page-head">
        <h2>Orders</h2>
        <p className="lede">
          {cfg.venueName}. Open a row for the receipt, stepper, and event log. Capture, void, and refund call the sandbox.
        </p>
      </section>
      <MerchantDesk />
    </main>
  );
}
