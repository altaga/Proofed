import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { approvalLink, firstAuthorization, getPaypalOrder, type PaypalOrder } from "../../lib/paypal";

export const ARTIFACTS_DIR = path.join(process.cwd(), "test-artifacts");

export function redactSecrets(text: string): string {
  let out = text ?? "";
  const email = process.env.PAYPAL_BUYER_EMAIL;
  const password = process.env.PAYPAL_BUYER_PASSWORD;
  if (email) out = out.split(email).join("[REDACTED_EMAIL]");
  if (password) out = out.split(password).join("[REDACTED_PASSWORD]");
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  return out;
}

export function ensureArtifactsDir() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

export async function safeScreenshot(page: Page, name: string): Promise<string> {
  ensureArtifactsDir();
  for (const frame of page.frames()) {
    await frame
      .evaluate(() => {
        const nodes = document.querySelectorAll("input, textarea");
        for (const node of Array.from(nodes)) {
          const el = node as HTMLInputElement;
          const type = (el.type || "").toLowerCase();
          const id = (el.id || "").toLowerCase();
          const nameAttr = (el.name || "").toLowerCase();
          const autocomplete = (el.autocomplete || "").toLowerCase();
          const sensitive =
            type === "password" ||
            type === "email" ||
            id === "email" ||
            id === "password" ||
            nameAttr.includes("email") ||
            nameAttr.includes("pass") ||
            autocomplete.includes("email") ||
            autocomplete.includes("current-password");
          if (sensitive) {
            el.value = "";
            el.setAttribute("value", "");
          }
        }
      })
      .catch(() => undefined);
  }
  const file = path.join(ARTIFACTS_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

export async function pageDiagnostics(page: Page) {
  const title = redactSecrets(await page.title().catch(() => ""));
  let host = "";
  let pathname = "";
  try {
    const parsed = new URL(page.url());
    host = parsed.host;
    pathname = parsed.pathname;
  } catch {
    host = "unparseable";
  }
  const text = redactSecrets((await page.locator("body").innerText().catch(() => "")).slice(0, 900));
  return { title, host, pathname, text };
}

async function visibleInFrames(page: Page, selector: string, timeout = 350): Promise<Locator | null> {
  for (const frame of page.frames()) {
    const loc = frame.locator(selector).first();
    try {
      if (await loc.isVisible({ timeout })) return loc;
    } catch {
      // keep looking
    }
  }
  return null;
}

async function waitForOverlays(page: Page) {
  for (const frame of page.frames()) {
    const spinner = frame.locator(
      '[data-testid="exit-loader-spinner"], .SpinnerOverlay_SpinnerOverlay_3KudG, [aria-busy="true"]',
    );
    if (await spinner.first().isVisible().catch(() => false)) {
      await spinner.first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
    }
  }
}

async function clickFirstVisible(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const loc = await visibleInFrames(page, selector, 200);
    if (!loc) continue;
    const enabled = await loc.isEnabled().catch(() => false);
    if (!enabled) continue;
    await waitForOverlays(page);
    try {
      await loc.click({ timeout: 12_000 });
      return selector;
    } catch {
      // The control may have been covered by PayPal's submit spinner or replaced
      // after a successful submit. Treat it as an attempt so the caller can poll.
      return selector;
    }
  }
  return null;
}

export async function assertNotBlocked(page: Page) {
  for (const frame of page.frames()) {
    const recaptcha = frame.locator(
      'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA" i], #px-captcha, .g-recaptcha',
    );
    if (await recaptcha.first().isVisible().catch(() => false)) {
      await safeScreenshot(page, "blocked-captcha");
      const info = await pageDiagnostics(page);
      throw new Error(
        `PayPal showed a captcha/challenge at ${info.host}${info.pathname} (title: ${info.title}). Not bypassing.`,
      );
    }
  }

  const raw = await page.locator("body").innerText().catch(() => "");
  const lower = raw.toLowerCase();
  const captchaPhrases = [
    "confirm you're human",
    "confirm you are human",
    "verify you are human",
    "security challenge",
    "are you a robot",
    "prove you are human",
  ];
  if (captchaPhrases.some((phrase) => lower.includes(phrase))) {
    await safeScreenshot(page, "blocked-captcha-text");
    const info = await pageDiagnostics(page);
    throw new Error(
      `PayPal showed a human-verification challenge at ${info.host}${info.pathname} (title: ${info.title}). Not bypassing.`,
    );
  }

  const twoFaPhrases = [
    "two-step verification",
    "two-factor",
    "authentication app",
    "enter the 6-digit",
    "enter your security code",
    "we sent you a code",
    "texted you a code",
    "one-time code",
  ];
  if (twoFaPhrases.some((phrase) => lower.includes(phrase))) {
    await safeScreenshot(page, "blocked-2fa");
    const info = await pageDiagnostics(page);
    throw new Error(
      `PayPal asked for 2FA/OTP at ${info.host}${info.pathname} (title: ${info.title}). Not bypassing.`,
    );
  }

  if (
    lower.includes("some of your info isn't correct") ||
    lower.includes("some of your information doesn't match") ||
    lower.includes("check your email address")
  ) {
    await safeScreenshot(page, "login-rejected");
    throw new Error("PayPal rejected the sandbox buyer login. Credentials were not logged.");
  }
}

function isApproved(order: PaypalOrder): boolean {
  if (order.status === "APPROVED" || order.status === "COMPLETED") return true;
  return Boolean(firstAuthorization(order)?.id);
}

export async function resolveApprovalLink(paypalOrderId: string): Promise<string> {
  const paypalOrder = await getPaypalOrder(paypalOrderId);
  const link = approvalLink(paypalOrder);
  if (!link) {
    throw new Error(`PayPal order ${paypalOrderId} has no approve/payer-action link`);
  }
  return link;
}

export async function approveOnPaypal(page: Page, approvalUrl: string, paypalOrderId: string): Promise<PaypalOrder> {
  const email = process.env.PAYPAL_BUYER_EMAIL;
  const password = process.env.PAYPAL_BUYER_PASSWORD;
  if (!email || !password) {
    throw new Error("PAYPAL_BUYER_EMAIL and PAYPAL_BUYER_PASSWORD must be set");
  }

  await page.goto(approvalUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const deadline = Date.now() + 150_000;
  let lastPoll = 0;
  let lastAction = "";
  let lastActionAt = 0;
  const cooldown = (name: string, ms = 2_800) => {
    if (lastAction === name && Date.now() - lastActionAt < ms) return false;
    lastAction = name;
    lastActionAt = Date.now();
    return true;
  };

  while (Date.now() < deadline) {
    if (Date.now() - lastPoll >= 3_000) {
      lastPoll = Date.now();
      try {
        const remote = await getPaypalOrder(paypalOrderId);
        if (isApproved(remote)) return remote;
      } catch {
        // keep driving the page; GET failures should not hide UI progress
      }
    }

    const url = page.url();
    if (url.includes("example.com/cancel")) {
      await safeScreenshot(page, "buyer-cancelled");
      throw new Error("PayPal redirected to the cancel URL; the buyer did not approve the order.");
    }
    if (url.includes("example.com/return")) {
      const remote = await getPaypalOrder(paypalOrderId);
      if (isApproved(remote)) return remote;
      await page.waitForTimeout(1_500);
      continue;
    }

    const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (
      url.includes("/checkoutweb/genericError") ||
      bodyText.includes("you've been inactive") ||
      bodyText.includes("logged you out") ||
      bodyText.includes("restart the payment process")
    ) {
      if (cooldown("reopen-after-timeout", 10_000)) {
        await page.goto(approvalUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        continue;
      }
    }

    await assertNotBlocked(page);

    const cookieClicked = await clickFirstVisible(page, [
      "#acceptAllButton",
      "#acceptAll",
      "#cookieBannerAccept",
      'button:has-text("Accept Cookies")',
      'button:has-text("Accept All Cookies")',
      'button:has-text("Accept All")',
      'button[id*="accept" i]',
    ]);
    if (cookieClicked && cooldown("cookie")) {
      await page.waitForTimeout(600);
      continue;
    }

    const emailInput = await visibleInFrames(
      page,
      '#email, input[name="login_email"], input[type="email"], input[autocomplete="username"]',
    );
    const passwordInput = await visibleInFrames(
      page,
      '#password, input[name="login_password"], input[type="password"]',
    );

    if (emailInput && cooldown("fill-email", 4_000)) {
      const current = await emailInput.inputValue().catch(() => "");
      if (!current) {
        await emailInput.click();
        await emailInput.fill(email);
      }
    }

    if (emailInput && !passwordInput) {
      const nextClicked = await clickFirstVisible(page, [
        "#btnNext",
        'button#btnNext',
        'button[type="submit"]:has-text("Next")',
        'button:has-text("Next")',
        'button:has-text("Continue")',
      ]);
      if (nextClicked && cooldown("next")) {
        await page.waitForTimeout(900);
        continue;
      }
    }

    if (passwordInput && cooldown("fill-password", 4_000)) {
      const current = await passwordInput.inputValue().catch(() => "");
      if (!current) {
        await passwordInput.click();
        await passwordInput.fill(password);
      }
      const loginClicked = await clickFirstVisible(page, [
        "#btnLogin",
        "button#btnLogin",
        'button[name="btnLogin"]',
        'button[type="submit"]:has-text("Log In")',
        'button[type="submit"]:has-text("Log in")',
        'button:has-text("Log In")',
        'button:has-text("Log in")',
        'button:has-text("Login")',
      ]);
      if (loginClicked && cooldown("login")) {
        await page.waitForTimeout(1_200);
        continue;
      }
    }

    const interstitial = await clickFirstVisible(page, [
      'button:has-text("Use password instead")',
      'a:has-text("Use password instead")',
      'button:has-text("Not now")',
      'a:has-text("Not now")',
      'button:has-text("Skip")',
      'a:has-text("Skip")',
      'button:has-text("Maybe later")',
    ]);
    if (interstitial && cooldown("interstitial")) {
      await page.waitForTimeout(800);
      continue;
    }

    if (!emailInput && !passwordInput) {
      const loginLink = await clickFirstVisible(page, [
        'a:has-text("Log In")',
        'a:has-text("Log in")',
        'button:has-text("Log In")',
        'button:has-text("Log in")',
        '#loginSection a',
      ]);
      if (loginLink && cooldown("open-login")) {
        await page.waitForTimeout(800);
        continue;
      }
    }

    const purchaseClicked = await clickFirstVisible(page, [
      "#payment-submit-btn",
      "#confirmButtonTop",
      '[data-testid="submit-button-initial"]',
      'button[data-id="payment-submit-btn"]',
      'button:has-text("Continue to Review Order")',
      'button:has-text("Continue to review order")',
      'button:has-text("Complete Purchase")',
      'button:has-text("Agree & Pay")',
      'button:has-text("Agree and Pay")',
      'button:has-text("Pay Now")',
      'input[type="submit"][id="confirmButtonTop"]',
      'button[type="submit"]:has-text("Continue")',
      'button:has-text("Save and Continue")',
      'button:has-text("Agree & Continue")',
      'button:has-text("Continue")',
    ]);
    if (purchaseClicked && cooldown("purchase", 4_000)) {
      await page.waitForTimeout(1_500);
      continue;
    }

    await page.waitForTimeout(900);
  }

  const shot = await safeScreenshot(page, "approval-timeout");
  const info = await pageDiagnostics(page);
  throw new Error(
    `Timed out waiting for PayPal buyer approval of ${paypalOrderId}. Page title="${info.title}" host=${info.host} path=${info.pathname} screenshot=${path.basename(shot)} text=${info.text}`,
  );
}
