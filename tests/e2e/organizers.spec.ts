import { expect, test } from "@playwright/test";

test("pengajuan organizer tanpa sesi diarahkan ke masuk", async ({ page }) => {
  await page.goto("/organizer/apply");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
});

test("antrean admin organizer tanpa sesi diarahkan ke masuk", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/admin/organizers");
  await expect(page).toHaveURL(/\/login/);
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX).toBeLessThanOrEqual(1);
});
