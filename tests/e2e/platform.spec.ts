import { expect, test } from "@playwright/test";

test("F54-E2E-001 shell 360 tanpa overflow dan aksi keyboard", async ({ page }) => {
  await page.goto("/");
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX).toBeLessThanOrEqual(1);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Loncat ke konten utama" })).toBeFocused();

  const login = page.getByRole("link", { name: "Masuk", exact: true });
  let reached = false;
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press("Tab");
    if (await login.evaluate((el) => el === document.activeElement).catch(() => false)) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
});

test("F54-E2E-002 smoke judul dan label lingkungan", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MyTicketIn" })).toBeVisible();
  await expect(page.getByText("UJI / SANDBOX")).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk", exact: true })).toBeVisible();
});
