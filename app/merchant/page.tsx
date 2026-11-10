import { MerchantDesk } from "@/components/MerchantDesk";

export default function MerchantPage() {
  return (
    <main data-testid="page-merchant">
      <section className="page-head">
        <h2>Orders</h2>
        <p className="lede">Tap an order to see what happened.</p>
      </section>
      <MerchantDesk />
    </main>
  );
}
