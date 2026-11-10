import { describe, expect, it } from "vitest";
import { hasRawMarkdownMarkers, renderSafeMarkdown } from "../lib/text";

describe("safe assistant markdown", () => {
  it("renders bold item names without leftover asterisks", () => {
    const html = renderSafeMarkdown("Yes — the **Pudgy Keychain** is **$12.00**, with **8 in stock**.");
    expect(html).toContain("<strong>Pudgy Keychain</strong>");
    expect(html).toContain("<strong>$12.00</strong>");
    expect(html).not.toContain("**");
    expect(hasRawMarkdownMarkers(html)).toBe(false);
  });

  it("renders lists and escapes HTML", () => {
    const html = renderSafeMarkdown("- One\n- Two\n<script>alert(1)</script>");
    expect(html).toContain("<li>One</li>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
