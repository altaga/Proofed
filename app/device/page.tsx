import { getProjectConfig } from "@/lib/config";
import { DeviceKiosk } from "@/components/DeviceKiosk";

export default function DevicePage() {
  const cfg = getProjectConfig();
  return (
    <main>
      <section className="hero">
        <h2>Pickup station</h2>
        <p>
          This page is the software stand-in for a locker or handheld at {cfg.venueName}. It talks to the
          same backend as the shop: confirming a code captures the PayPal authorization; reporting a jam
          leaves the hold in place so the assistant can recover.
        </p>
      </section>
      <DeviceKiosk />
    </main>
  );
}
