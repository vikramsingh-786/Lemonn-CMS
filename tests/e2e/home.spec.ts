import { expect, test } from "@playwright/test";

test.describe("dashboard", () => {
  test("lists all 10 research sources with external links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "News Research Dashboard" })).toBeVisible();

    const sources = page.locator("#sources ol > li");
    await expect(sources).toHaveCount(10);
    await expect(page.locator('#sources a[target="_blank"]')).toHaveCount(10);
    await expect(page.locator('a[href="https://www.bseindia.com/"]')).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  test("toggling a source updates its state and the enabled count", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("switch", { name: "Use Moneycontrol for research" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("9 enabled")).toBeVisible();
  });

  test("demo research runs once, then shows a labelled sample article", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No research results yet")).toBeVisible();

    await page.getByRole("button", { name: "Research News" }).click();
    const running = page.getByRole("button", { name: "Researching..." });
    await expect(running).toBeDisabled();

    await expect(page.getByText("Demo research completed.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Sample · Not real news")).toBeVisible();
    await expect(page.getByRole("button", { name: "Research News" })).toBeEnabled();
  });

  test("publish only opens a demo dialog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Research News" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click({ timeout: 5000 });

    const dialog = page.getByRole("dialog", { name: "Publishing is a demo" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("No article has been published");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("mobile layout has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
