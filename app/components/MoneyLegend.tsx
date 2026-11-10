export function MoneyLegend({ className = "" }: { className?: string }) {
  return (
    <ul className={`legend ${className}`.trim()} aria-label="Money states">
      <li><i className="swatch held" aria-hidden="true" /> Held</li>
      <li><i className="swatch captured" aria-hidden="true" /> Captured</li>
      <li><i className="swatch voided" aria-hidden="true" /> Voided</li>
      <li><i className="swatch refunded" aria-hidden="true" /> Refunded</li>
      <li><i className="swatch failed" aria-hidden="true" /> Failed</li>
    </ul>
  );
}
