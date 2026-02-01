/**
 * E2E: Plan tab algorithm selector (Prosty vs Zaawansowany beta).
 *
 * Requires: backend on :8000, frontend on :4321, default user user/123.
 * At least one image in the list (or test will skip after login).
 */
import { expect, test } from "@playwright/test";

test.describe("Plan tab algorithm selector", () => {
  test("login then open Plan tab and see algorithm options and Generuj plan", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Login").fill("user");
    await page.getByLabel("Hasło").fill("123");
    await page.getByRole("button", { name: "Zaloguj" }).click();

    await expect(page).toHaveURL(/\/images/);

    const firstImageLink = page.getByRole("link", { name: "Otwórz" }).first();
    const hasImages = await firstImageLink.isVisible().catch(() => false);
    if (!hasImages) {
      test.skip();
      return;
    }
    await firstImageLink.click();
    await expect(page).toHaveURL(/\/images\/\d+/);

    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(page).toHaveURL(/tab=plan/);

    await expect(page.getByText("Prosty – siatka XY 800 µm")).toBeVisible();
    await expect(page.getByText("Zaawansowany (beta)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generuj plan" })).toBeVisible();
  });

  test("select Prosty, click Generuj plan, then see metrics (iteration created)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Login").fill("user");
    await page.getByLabel("Hasło").fill("123");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).toHaveURL(/\/images/);

    const firstImageLink = page.getByRole("link", { name: "Otwórz" }).first();
    const hasImages = await firstImageLink.isVisible().catch(() => false);
    if (!hasImages) {
      test.skip();
      return;
    }
    await firstImageLink.click();
    await expect(page).toHaveURL(/\/images\/\d+/);

    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(page).toHaveURL(/tab=plan/);

    await page.getByRole("radio", { name: /Prosty – siatka XY 800 µm/ }).check();
    await page.getByRole("button", { name: "Generuj plan" }).click();

    await expect(page.getByRole("button", { name: "Generuj plan" })).toBeVisible({ timeout: 20000 });

    await expect(page.getByText("Liczba punktów")).toBeVisible();
  });

  test("select Zaawansowany (beta), click Generuj plan, then see metrics (iteration created)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Login").fill("user");
    await page.getByLabel("Hasło").fill("123");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).toHaveURL(/\/images/);

    const firstImageLink = page.getByRole("link", { name: "Otwórz" }).first();
    const hasImages = await firstImageLink.isVisible().catch(() => false);
    if (!hasImages) {
      test.skip();
      return;
    }
    await firstImageLink.click();
    await expect(page).toHaveURL(/\/images\/\d+/);

    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(page).toHaveURL(/tab=plan/);

    await page.getByRole("radio", { name: /Zaawansowany \(beta\)/ }).check();
    await page.getByRole("button", { name: "Generuj plan" }).click();

    await expect(page.getByRole("button", { name: "Generuj plan" })).toBeVisible({ timeout: 20000 });

    await expect(page.getByText("Liczba punktów")).toBeVisible();
  });

  test("select Prosty, set Odstęp siatki to 1 mm, generate plan, then see Odstęp siatki 1 mm in metrics", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Login").fill("user");
    await page.getByLabel("Hasło").fill("123");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).toHaveURL(/\/images/);

    const firstImageLink = page.getByRole("link", { name: "Otwórz" }).first();
    const hasImages = await firstImageLink.isVisible().catch(() => false);
    if (!hasImages) {
      test.skip();
      return;
    }
    await firstImageLink.click();
    await expect(page).toHaveURL(/\/images\/\d+/);

    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(page).toHaveURL(/tab=plan/);

    await page.getByRole("radio", { name: /Prosty – siatka XY 800 µm/ }).check();
    await page.getByLabel("Odstęp siatki (mm)").fill("1");
    await page.getByRole("button", { name: "Generuj plan" }).click();

    await expect(page.getByRole("button", { name: "Generuj plan" })).toBeVisible({ timeout: 20000 });

    await expect(page.getByText("Odstęp siatki")).toBeVisible();
    await expect(page.getByText("1 mm")).toBeVisible();
  });
});
