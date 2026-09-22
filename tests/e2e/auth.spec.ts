import { expect, test } from "@playwright/test";

test("F2 login form accessible on 360px", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
  await expect(page.getByText("Masuk sebagai")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Pembeli tiket/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Penyelenggara event/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Admin aplikasi/ })).toBeVisible();
  await expect(page.getByLabel("Username atau email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX).toBeLessThanOrEqual(1);
});
