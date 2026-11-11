import { centsToValue } from "./money";
import { requireEnv } from "./config";

export type PaypalIssue = {
  issue?: string;
  description?: string;
  field?: string;
};

export class PaypalHttpError extends Error {
  status: number;
  paypalName?: string;
  issues: PaypalIssue[];
  debugId?: string;

  constructor(
    message: string,
    opts: { status: number; paypalName?: string; issues?: PaypalIssue[]; debugId?: string },
  ) {
    super(message);
    this.name = "PaypalHttpError";
    this.status = opts.status;
    this.paypalName = opts.paypalName;
    this.issues = opts.issues ?? [];
    this.debugId = opts.debugId;
  }

  hasIssue(issue: string): boolean {
    return this.issues.some((item) => item.issue === issue);
  }
}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function paypalApiBase(): string {
  return process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
}

export function isPaypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 10_000) {
    return tokenCache.token;
  }
  const clientId = requireEnv("PAYPAL_CLIENT_ID");
  const secret = requireEnv("PAYPAL_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new PaypalHttpError("PayPal authentication failed", {
      status: response.status,
      paypalName: body.error,
      issues: [{ description: body.error_description || "invalid_client" }],
    });
  }
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 300) * 1000,
  };
  return body.access_token;
}

export function resetPaypalTokenCache() {
  tokenCache = null;
}

function parseError(status: number, payload: unknown): PaypalHttpError {
  const body = (payload ?? {}) as {
    name?: string;
    message?: string;
    debug_id?: string;
    details?: PaypalIssue[];
  };
  const issues = Array.isArray(body.details) ? body.details : [];
  const issueSummary = issues
    .map((item) => item.issue)
    .filter(Boolean)
    .join(", ");
  return new PaypalHttpError(
    body.message || issueSummary || `PayPal request failed (${status})`,
    { status, paypalName: body.name, issues, debugId: body.debug_id },
  );
}

export async function paypalFetch<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    requestId?: string;
    preferRepresentation?: boolean;
  } = {},
): Promise<{ status: number; data: T }> {
  const method = init.method ?? "GET";
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
    if (init.preferRepresentation) headers.Prefer = "return=representation";

    let response: Response;
    try {
      response = await fetch(`${paypalApiBase()}${path}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (error) {
      lastError = error;
      await sleep(400 * 2 ** attempt);
      continue;
    }

    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);

    if (response.status === 429 || response.status >= 500) {
      lastError = parseError(response.status, data);
      await sleep(400 * 2 ** attempt);
      continue;
    }
    if (!response.ok) {
      throw parseError(response.status, data);
    }
    return { status: response.status, data };
  }
  if (lastError instanceof PaypalHttpError) throw lastError;
  throw new PaypalHttpError("PayPal is unreachable after retries", {
    status: 503,
    issues: [{ description: lastError instanceof Error ? lastError.message : "network_error" }],
  });
}

export type PaypalOrder = {
  id: string;
  intent?: string;
  status?: string;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: {
      authorizations?: Array<{
        id: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
        expiration_time?: string;
      }>;
      captures?: Array<{
        id: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
      }>;
    };
  }>;
  links?: Array<{ href: string; rel: string; method?: string }>;
};

export type PaypalAuthorization = {
  id: string;
  status?: string;
  amount?: { currency_code?: string; value?: string };
  expiration_time?: string;
};

export type PaypalCapture = {
  id: string;
  status?: string;
  amount?: { currency_code?: string; value?: string };
};

export type PaypalRefund = {
  id: string;
  status?: string;
};

export type PaypalOrderItem = {
  name: string;
  unitPriceCents: number;
  qty: number;
  sku?: string;
  description?: string;
  category?: "PHYSICAL_GOODS" | "DIGITAL_GOODS" | "DONATION";
};

export type PaypalShippingAddress = {
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  adminArea2?: string;
  adminArea1?: string;
  postalCode?: string;
  countryCode?: string;
};

export async function createPaypalOrder(input: {
  amountCents: number;
  currency: string;
  description: string;
  invoiceId: string;
  customId: string;
  brandName: string;
  requestId: string;
  items?: PaypalOrderItem[];
  shippingAddress?: PaypalShippingAddress;
}): Promise<PaypalOrder> {
  const items =
    input.items && input.items.length > 0
      ? input.items.map((item) => ({
          name: item.name.slice(0, 127),
          description: (item.description || item.name).slice(0, 127),
          sku: item.sku ? item.sku.slice(0, 127) : undefined,
          unit_amount: {
            currency_code: input.currency,
            value: centsToValue(item.unitPriceCents),
          },
          quantity: String(item.qty),
          category: item.category || "PHYSICAL_GOODS",
        }))
      : undefined;

  const itemTotalCents =
    input.items && input.items.length > 0
      ? input.items.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0)
      : input.amountCents;

  const breakdown = {
    item_total: {
      currency_code: input.currency,
      value: centsToValue(itemTotalCents),
    },
    shipping: {
      currency_code: input.currency,
      value: centsToValue(Math.max(0, input.amountCents - itemTotalCents)),
    },
    handling: {
      currency_code: input.currency,
      value: "0.00",
    },
    tax_total: {
      currency_code: input.currency,
      value: "0.00",
    },
    discount: {
      currency_code: input.currency,
      value: "0.00",
    },
  };

  const shipping = {
    type: "SHIPPING",
    name: {
      full_name: input.shippingAddress?.fullName || "Doorstep Delivery Recipient",
    },
    address: {
      address_line_1: input.shippingAddress?.addressLine1 || "744 North Capitol Ave",
      admin_area_2: input.shippingAddress?.adminArea2 || "San Jose",
      admin_area_1: input.shippingAddress?.adminArea1 || "CA",
      postal_code: input.shippingAddress?.postalCode || "95133",
      country_code: input.shippingAddress?.countryCode || "US",
    },
  };

  const { data } = await paypalFetch<PaypalOrder>("/v2/checkout/orders", {
    method: "POST",
    requestId: input.requestId,
    preferRepresentation: true,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: "doorstep-handover",
          description: input.description,
          custom_id: input.customId,
          invoice_id: input.invoiceId,
          soft_descriptor: "PROOFED*HOLD",
          amount: {
            currency_code: input.currency,
            value: centsToValue(input.amountCents),
            breakdown,
          },
          items,
          shipping,
        },
      ],
      application_context: {
        brand_name: input.brandName.slice(0, 127),
        shipping_preference: "SET_PROVIDED_ADDRESS",
        user_action: "PAY_NOW",
        return_url: "https://example.com/return",
        cancel_url: "https://example.com/cancel",
      },
    },
  });
  return data;
}

export async function getPaypalOrder(orderId: string): Promise<PaypalOrder> {
  const { data } = await paypalFetch<PaypalOrder>(`/v2/checkout/orders/${orderId}`);
  return data;
}

export async function authorizePaypalOrder(orderId: string, requestId: string): Promise<PaypalOrder> {
  const { data } = await paypalFetch<PaypalOrder>(`/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    requestId,
    preferRepresentation: true,
    body: {},
  });
  return data;
}

export async function getPaypalAuthorization(authorizationId: string): Promise<PaypalAuthorization> {
  const { data } = await paypalFetch<PaypalAuthorization>(
    `/v2/payments/authorizations/${authorizationId}`,
  );
  return data;
}

export async function capturePaypalAuthorization(
  authorizationId: string,
  requestId: string,
  amountCents?: number,
  currency?: string,
): Promise<PaypalCapture> {
  const body =
    amountCents !== undefined && currency
      ? { amount: { currency_code: currency, value: centsToValue(amountCents) } }
      : {};
  const { data } = await paypalFetch<PaypalCapture>(
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { method: "POST", requestId, preferRepresentation: true, body },
  );
  return data;
}

export async function voidPaypalAuthorization(
  authorizationId: string,
  requestId: string,
): Promise<{ id?: string; status?: string }> {
  const { data } = await paypalFetch<{ id?: string; status?: string }>(
    `/v2/payments/authorizations/${authorizationId}/void`,
    { method: "POST", requestId, preferRepresentation: true, body: {} },
  );
  return data;
}

export async function refundPaypalCapture(
  captureId: string,
  requestId: string,
  amountCents?: number,
  currency?: string,
): Promise<PaypalRefund> {
  const body =
    amountCents !== undefined && currency
      ? { amount: { currency_code: currency, value: centsToValue(amountCents) } }
      : {};
  const { data } = await paypalFetch<PaypalRefund>(`/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    requestId,
    preferRepresentation: true,
    body,
  });
  return data;
}

export async function getPaypalCapture(captureId: string): Promise<PaypalCapture> {
  const { data } = await paypalFetch<PaypalCapture>(`/v2/payments/captures/${captureId}`);
  return data;
}

export async function getPaypalRefund(refundId: string): Promise<PaypalRefund> {
  const { data } = await paypalFetch<PaypalRefund>(`/v2/payments/refunds/${refundId}`);
  return data;
}

export function approvalLink(order: PaypalOrder): string | null {
  const links = order.links ?? [];
  const found = links.find((item) => item.rel === "approve" || item.rel === "payer-action");
  if (found?.href) return found.href;
  if (order.id) return `https://www.sandbox.paypal.com/checkoutnow?token=${order.id}`;
  return null;
}

export function firstAuthorization(order: PaypalOrder) {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0];
}

export function firstCapture(order: PaypalOrder) {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}

export async function verifyWebhookSignature(input: {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  webhookEvent: unknown;
}): Promise<"SUCCESS" | "FAILURE"> {
  const { data } = await paypalFetch<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        auth_algo: input.authAlgo,
        cert_url: input.certUrl,
        transmission_id: input.transmissionId,
        transmission_sig: input.transmissionSig,
        transmission_time: input.transmissionTime,
        webhook_id: input.webhookId,
        webhook_event: input.webhookEvent,
      },
    },
  );
  return data.verification_status === "SUCCESS" ? "SUCCESS" : "FAILURE";
}
