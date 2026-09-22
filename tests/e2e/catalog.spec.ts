import { expect, test } from "@playwright/test";

test("katalog publik dapat dibuka tanpa sesi", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Katalog event" })).toBeVisible();
  await expect(page.getByRole("searchbox").or(page.getByPlaceholder("Contoh: konser musik di Bandung minggu ini"))).toBeVisible();
});
