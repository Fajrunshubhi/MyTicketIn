import { expect, test } from "@playwright/test";

test("halaman audit tanpa sesi diarahkan ke masuk", async ({ page }) => {
  await page.goto("/admin/audit");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
});

test("daftar audit dapat digulir pada 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/admin/audit");
  await expect(page).toHaveURL(/\/login/);
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX).toBeLessThanOrEqual(1);
});
