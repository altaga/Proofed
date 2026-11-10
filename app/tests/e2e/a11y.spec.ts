import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", testId: "page-shop" },
  { path: "/client", testId: "page-client" },
  { path: "/delivery", testId: "page-delivery" },
  { path: "/backend", testId: "page-backend" },
  { path: "/device", testId: "page-pickup" },
  { path: "/merchant", testId: "page-merchant" },
  { path: "/demo", testId: "page-presenter" },
  { path: "/gallery", testId: "page-gallery" },
];

for (const item of pages) {
  test(`color contrast on ${item.path}`, async ({ page }) => {
    await page.goto(item.path);
    await expect(page.getByTestId(item.testId)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .options({ runOnly: { type: "rule", values: ["color-contrast"] } })
      .analyze();
    const details = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html.slice(0, 180),
        failureSummary: node.failureSummary,
      })),
    }));
    expect(details, JSON.stringify(details, null, 2)).toEqual([]);
  });
}
