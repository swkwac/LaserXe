/**
 * E2E: Animation tab – select iteration, play, pause, frame counter.
 *
 * Requires: backend on :8000, frontend on :4321, default user user/123.
 * At least one image with at least one iteration (or test will skip after opening Animacja tab).
 */
import { expect, test } from "@playwright/test";

test.describe("Animation tab", () => {
  test("login then open Animacja tab and see iteration select and play controls", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Login").fill("user");
    await page.getByLabel("Hasło").fill("123");
    await page.getByRole("button", { name: "Zaloguj" }).click();

    await expect(page).toHaveURL(/\/images/);

    const firstImageLink = page.getByRole("link", { name: "Otwórz" }).first();
    const hasImages = await firstImageLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasImages) {
      test.skip();
      return;
    }
    await firstImageLink.click();
    await expect(page).toHaveURL(/\/images\/\d+/);

    await page.getByRole("tab", { name: "Animacja" }).click();
    await expect(page).toHaveURL(/tab=animacja/);

    await expect(page.getByText("Wizualizacja sekwencji emisji")).toBeVisible();
    await expect(page.getByRole("button", { name: "Odtwórz" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wstrzymaj" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  });

  test("select iteration, click Odtwórz then Wstrzymaj, see frame counter", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Login").fill("user");
    await page.getByLabel("Hasło").fill("123");
    await page.getByRole("button", { name: "Zaloguj" }).click();
    await expect(page).toHaveURL(/\/images/);

    const firstImageLink = page.getByRole("link", { name: "Otwórz" }).first();
    const hasImages = await firstImageLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasImages) {
      test.skip();
      return;
    }
    await firstImageLink.click();
    await expect(page).toHaveURL(/\/images\/\d+/);

    await page.getByRole("tab", { name: "Animacja" }).click();
    await expect(page).toHaveURL(/tab=animacja/);

    const combobox = page.getByRole("combobox");
    const hasOptions = await combobox
      .locator("option")
      .count()
      .then((n) => n > 1);
    if (!hasOptions) {
      test.skip();
      return;
    }

    await combobox.selectOption({ index: 1 });
    await expect(page.getByText(/Klatka \d+ \/ \d+/)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Odtwórz" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Wstrzymaj" }).click();

    await expect(page.getByText(/Klatka \d+ \/ \d+/)).toBeVisible();
  });
});
