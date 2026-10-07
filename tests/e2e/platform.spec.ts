import { expect, test } from "@playwright/test";

test("F54-E2E-001 shell 360 tanpa overflow dan aksi keyboard", async ({ page }) => {
  await page.goto("/");
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflowX).toBeLessThanOrEqual(1);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Loncat ke konten utama" })).toBeFocused();

  // The header link is hidden behind the menu on narrow screens, so the footer link may be the first reachable one.
  let reached = false;
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    const href = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
    if (href === "/login") {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
});

test("F54-E2E-002 smoke judul dan label lingkungan", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MyTicketIn", level: 1 })).toBeVisible();
  await expect(page.getByText(/sandbox. Transaksi uji/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk", exact: true }).first()).toBeVisible();
});
