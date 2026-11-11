import { ShopperChat } from "@/components/ShopperChat";

export const metadata = {
  title: "Proofed",
  description: "Natural language assistant with access to 60+ marketplace products, zero-trust pricing, and two-phase PayPal holds.",
};

export default function ClientPage() {
  return (
    <main data-testid="page-client" className="client-page-layout">
      <ShopperChat />
    </main>
  );
}
