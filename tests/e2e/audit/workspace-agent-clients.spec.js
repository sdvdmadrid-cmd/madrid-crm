/**
 * Workspace agent + clients integration smoke.
 */
const { test, expect } = require("@playwright/test");
const { devLogin } = require("../helpers/auth");

test.describe("Workspace agent clients integration", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: "admin", redirect: "/clients" });
    await expect(page.getByRole("heading", { name: /^Clients$/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("agent mode search clients does not throw clientSummaries error", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.getByRole("button", { name: /AI Assistant|Asistente/i }).click();
    await page.locator("textarea").last().fill("Search clients named test");
    await page.getByRole("button", { name: /Send|Enviar|Wyślij/i }).click();

    await expect(page.getByText(/clientSummaries is not iterable/i)).toHaveCount(0, {
      timeout: 30_000,
    });

    const clientSummaryError = errors.find((m) =>
      /clientSummaries is not iterable/i.test(m),
    );
    expect(clientSummaryError).toBeUndefined();
  });
});
