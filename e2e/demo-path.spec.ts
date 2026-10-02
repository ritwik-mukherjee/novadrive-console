import { expect, test } from "@playwright/test";

// PRD 11.4 usability paths + section 12 demo script.
test("1. Overview → IonPeak: why Critical and DOC-078 in one click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/sits behind 100% of revenue/).first()).toBeVisible();
  await page.getByRole("button", { name: /IonPeak Semiconductor/ }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Why this score")).toBeVisible();
  await expect(drawer.getByText("Critical").first()).toBeVisible();
  await expect(drawer.getByText("DOC-078").first()).toBeVisible();
});

test("2. Overview → EV-001 alert card with next action", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /EV-001 East Delta flood watch/ }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Next action (24-72h)")).toBeVisible();
  await expect(drawer.getByText(/42\.1/).first()).toBeVisible();
});

test("3. IonPeak → alternates shortlist with sources", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /IonPeak Semiconductor/ }).first().click();
  await page.getByRole("link", { name: "Find alternates →" }).click();
  await expect(page).toHaveURL(/alternates\?node=ORG-439/);
  await expect(page.getByRole("link", { name: "infineon.com" })).toBeVisible();
  await expect(page.getByText("SHORTLIST – issue RFI").first()).toBeVisible();
});

test("4. Typed-in events: typhoon matches Z04, Delta asks which one", async ({ page }) => {
  await page.goto("/alerts");
  await page.getByRole("button", { name: "Typhoon warning for Z04" }).click();
  const card = page.locator("article");
  await expect(card.getByText(/Zone-level match to 5 mapped nodes/)).toBeVisible();
  await expect(card.getByRole("button", { name: /Cobalt Control Electronics/ })).toBeVisible();
  await page.getByRole("button", { name: "Delta announces layoffs" }).click();
  await expect(card.getByText(/could mean 2 different things/)).toBeVisible();
});

test("5. Scorecard credit lens moves Meridian to #1", async ({ page }) => {
  await page.goto("/scorecard");
  await page.getByRole("button", { name: /Credit-risk lens/ }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Meridian");
});

test("6. Live search without a key falls back to the curated list", async ({ page }) => {
  await page.goto("/alternates?node=ORG-439");
  await page.getByRole("button", { name: "Run live search" }).click();
  await expect(page.getByText(/not configured|Showing the curated shortlist/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Infineon Technologies AG")).toBeVisible();
});
