import { expect, test } from "@playwright/test";

test("F53/F57 halaman punya lang id dan skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Loncat ke konten utama" })).toBeFocused();
});

test("F6 lupa kata sandi punya label dan recovery jujur", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Lupa kata sandi" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText(/tidak akan memberitahu/i)).toBeVisible();
});
