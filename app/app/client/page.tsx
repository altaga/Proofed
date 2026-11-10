import { NearDeskChat } from "@/components/NearDeskChat";

export const metadata = {
  title: "Client Marketplace Chat · Proofed",
  description: "Natural language assistant with access to 60+ marketplace products, zero-trust pricing, and two-phase PayPal holds.",
};

export default function ClientPage() {
  return (
    <main data-testid="page-client" className="client-page-layout">
      <NearDeskChat />
    </main>
  );
}
