"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";

export type ApprovedOrder = {
  id: string;
  status: string;
  [key: string]: unknown;
};

export function PayPalApprove({
  clientId,
  orderId,
  paypalOrderId,
  orderSnapshot,
  onAuthorized,
  onError,
}: {
  clientId: string;
  orderId: string;
  paypalOrderId: string;
  orderSnapshot?: unknown;
  onAuthorized: (order: ApprovedOrder) => void;
  onError: (message: string) => void;
}) {
  return (
    <PayPalScriptProvider
      options={{
        clientId,
        intent: "authorize",
        currency: "USD",
        components: "buttons",
      }}
    >
      <PayPalButtons
        style={{ layout: "vertical", shape: "rect", label: "paypal", color: "gold" }}
        createOrder={() => Promise.resolve(paypalOrderId)}
        onApprove={async () => {
          const response = await fetch("/api/paypal/authorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, orderSnapshot }),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Authorize failed");
          }
          onAuthorized(payload.order);
        }}
        onError={(error) => onError(error instanceof Error ? error.message : "PayPal button error")}
      />
    </PayPalScriptProvider>
  );
}
