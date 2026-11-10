import { DeviceKiosk } from "@/components/DeviceKiosk";

export default function DevicePage() {
  return (
    <main data-testid="page-pickup">
      <section className="page-head">
        <h2>Pickup</h2>
        <p className="lede">
          Enter the pickup code. Confirming captures the hold. Reporting a failure leaves it in place.
        </p>
      </section>
      <DeviceKiosk />
    </main>
  );
}
