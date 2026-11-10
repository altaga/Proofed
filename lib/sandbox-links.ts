export function sandboxOrderUrl(paypalOrderId: string) {
  return `https://www.sandbox.paypal.com/checkoutnow?token=${paypalOrderId}`;
}

export function sandboxPaymentUrl(id: string) {
  return `https://www.sandbox.paypal.com/activity/payment/${id}`;
}

export function sandboxDashboardUrl() {
  return "https://www.sandbox.paypal.com/activity";
}
