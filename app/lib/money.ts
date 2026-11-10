export function centsToValue(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("Amount must be a non-negative integer number of cents");
  }
  return (cents / 100).toFixed(2);
}

export function valueToCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  const [dollars, cents = ""] = value.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
