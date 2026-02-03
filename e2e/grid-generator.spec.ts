/**
 * E2E: Grid Generator – standalone grid generation (no image).
 *
 * Requires: backend on :8000, frontend on :3000, default user user/123.
 */
import { expect, test } from "@playwright/test";

test.describe("Grid Generator", () => {
  test("login then navigate to Generator siatki and see form", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Login").click();
    await page.getByLabel("Login").pressSequentially("user", { delay: 50 });
    await page.getByLabel("Hasło").click();
    await page.getByLabel("Hasło").pressSequentially("123", { delay: 50 });
    await expect(page.getByRole("button", { name: "Zaloguj" })).toBeEnabled();
    await page.getByRole("button", { name: "Zaloguj" }).click();

    await expect(page).toHaveURL(/\/images/);

    await page.getByRole("link", { name: "Generator siatki" }).click();
    await expect(page).toHaveURL(/\/grid-generator/);

    await expect(page.getByText("Generator siatki")).toBeVisible();
    await expect(page.getByText("Prosty – 12×12 mm")).toBeVisible();
    await expect(page.getByText("Zaawansowany – 25 mm średnicy")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generuj" })).toBeVisible();
  });

  test("generate simple grid, see result and export CSV", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Login").click();
    await page.getByLabel("Login").pressSequentially("user", { delay: 50 });
    await page.getByLabel("Hasło").click();
    await page.getByLabel("Hasło").pressSequentially("123", { delay: 50 });
    await expect(page.getByRole("button", { name: "Zaloguj" })).toBeEnabled();
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).toHaveURL(/\/images/);

    await page.getByRole("link", { name: "Generator siatki" }).click();
    await expect(page).toHaveURL(/\/grid-generator/);

    await page.getByRole("radio", { name: /Prosty – 12×12 mm/ }).check();
    await page.getByRole("button", { name: "Generuj" }).click();

    await expect(page.getByRole("button", { name: "Generuj" })).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/Wygenerowano \d+ punktów/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Eksportuj CSV" })).toBeVisible();
  });

  test("generate advanced grid, see result", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Login").click();
    await page.getByLabel("Login").pressSequentially("user", { delay: 50 });
    await page.getByLabel("Hasło").click();
    await page.getByLabel("Hasło").pressSequentially("123", { delay: 50 });
    await expect(page.getByRole("button", { name: "Zaloguj" })).toBeEnabled();
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).toHaveURL(/\/images/);

    await page.getByRole("link", { name: "Generator siatki" }).click();
    await expect(page).toHaveURL(/\/grid-generator/);

    await page.getByRole("radio", { name: /Zaawansowany – 25 mm średnicy/ }).check();
    await page.getByRole("button", { name: "Generuj" }).click();

    await expect(page.getByRole("button", { name: "Generuj" })).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/Wygenerowano \d+ punktów/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Odtwórz" })).toBeVisible();
  });
});
