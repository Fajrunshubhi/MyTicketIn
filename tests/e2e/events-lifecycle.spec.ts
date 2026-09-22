import { expect, test } from "@playwright/test";

test("antrean moderasi event tanpa sesi diarahkan ke masuk", async ({ page }) => {
  await page.goto("/admin/events");
  await expect(page).toHaveURL(/\/login/);
});

test("pratinjau event tanpa sesi diarahkan ke masuk", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/organizer/events/demo/preview");
  await expect(page).toHaveURL(/\/login/);
});
