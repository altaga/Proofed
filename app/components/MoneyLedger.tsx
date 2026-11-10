"use client";

type LedgerOrder = {
  status: string;
  formatted_total: string;
};

const AFTER_AUTH = new Set([
  "AUTHORIZED",
  "DELIVERY_CONFIRMED",
  "DELIVERY_FAILED",
  "CAPTURED",
  "VOIDED",
  "REFUNDED",
  "CANCELLED",
]);

export function MoneyLedger({ order }: { order: LedgerOrder }) {
  const amount = order.formatted_total;
  const authorized = AFTER_AUTH.has(order.status);
  const captured = order.status === "CAPTURED" || order.status === "REFUNDED";
  const voided = order.status === "VOIDED" || order.status === "CANCELLED";
  const refunded = order.status === "REFUNDED";

  const rows = [
    { key: "held", label: "Held", value: authorized ? amount : "—", active: authorized && !captured && !voided && !refunded },
    { key: "captured", label: "Captured", value: captured ? amount : "—", active: order.status === "CAPTURED" },
    { key: "voided", label: "Voided", value: voided ? amount : "—", active: voided },
    { key: "refunded", label: "Refunded", value: refunded ? amount : "—", active: refunded },
  ];

  return (
    <div className="ledger" data-testid="money-ledger" aria-label="Money ledger">
      <h3>Money ledger</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className={`ledger-row ${row.key}${row.active ? " active" : ""}`}>
            <span>{row.label}</span>
            <span className="mono">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
