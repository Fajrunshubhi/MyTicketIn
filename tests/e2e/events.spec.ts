import { expect, test } from "@playwright/test";

test("workspace event tanpa sesi diarahkan ke masuk", async ({ page }) => {
  await page.goto("/organizer/events");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
});

test("halaman draf event tidak overflow di 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/organizer/events/new");
  await expect(page).toHaveURL(/\/login/);
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX).toBeLessThanOrEqual(1);
});
