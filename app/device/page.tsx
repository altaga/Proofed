import { DeviceKiosk } from "@/components/DeviceKiosk";

export default function DevicePage() {
  return (
    <main className="kiosk-stage">
      <div className="kiosk-frame" style={{ marginBottom: 18 }}>
        <p className="kicker" style={{ color: "#fdba74" }}>Pickup station</p>
        <h2 className="display" style={{ color: "#fffaf2" }}>Prove handover before money moves.</h2>
        <p style={{ color: "rgba(246,239,227,0.75)", maxWidth: 640 }}>
          Enter the customer&apos;s pickup code. Confirming captures the PayPal authorization. Reporting a jam,
          damaged item, or stock miss leaves the hold in place so the assistant can retry, substitute, or void.
        </p>
      </div>
      <DeviceKiosk />
    </main>
  );
}
