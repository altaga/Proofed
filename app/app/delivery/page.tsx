import { DeliveryApp } from "@/components/DeliveryApp";

export const metadata = {
  title: "Proofed",
  description: "Courier package scanning, doorstep photo capture, and physical handover verification.",
};

export default function DeliveryPage() {
  return (
    <main data-testid="page-delivery">
      <DeliveryApp />
    </main>
  );
}
