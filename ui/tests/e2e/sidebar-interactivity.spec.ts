import { test, expect } from "@playwright/test";

// Regression coverage for a real bug found in this app: AppSidebar has
// multiple top-level elements, and `transition:persist` silently failed to
// persist any of them across Astro view transitions (confirmed empirically --
// zero elements ever carried data-astro-transition-persist). Every
// client-side navigation replaced the sidebar's DOM, but its interactive
// wiring (collapse button, theme switch, account menu, subnav toggles) only
// ran once on the very first page load -- so every button silently stopped
// responding after the first navigation. Fixed by re-wiring on
// `astro:page-load`. These tests click through a real navigation first,
// specifically to catch that class of regression coming back.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("cc-sidebar-collapsed");
    localStorage.removeItem("cc-theme");
  });
});

test("sidebar collapse button still works after a client-side navigation", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/docs/);

  const collapseBtn = page.locator("#sidebarCollapse");
  await expect(page.locator("html")).not.toHaveClass(/sidebar-collapsed/);

  await collapseBtn.click();
  await expect(page.locator("html")).toHaveClass(/sidebar-collapsed/);

  await collapseBtn.click();
  await expect(page.locator("html")).not.toHaveClass(/sidebar-collapsed/);
});

test("theme switch still works after a client-side navigation", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/docs/);

  // The theme switch lives in the account menu, which opens on hover.
  await page.locator(".sidebar__account").hover();
  await page.locator('[data-theme-option="light"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.locator(".sidebar__account").hover();
  await page.locator('[data-theme-option="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Projects submenu toggle still works after a client-side navigation", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/docs/);
  await page.getByRole("link", { name: "Projects" }).first().click();
  await expect(page).toHaveURL("/");

  const subnavToggle = page.locator("[data-sidebar-subnav-toggle]");
  const navGroup = page.locator("[data-nav-group]");
  await expect(navGroup).toHaveAttribute("data-expanded", "true");

  await subnavToggle.click();
  await expect(navGroup).toHaveAttribute("data-expanded", "false");

  await subnavToggle.click();
  await expect(navGroup).toHaveAttribute("data-expanded", "true");
});

test("active nav link updates correctly across several navigations", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-sidebar-link][href="/"]')).toHaveClass(/sidebar__item--active/);

  await page.getByRole("link", { name: "Docs" }).click();
  await expect(page.locator('[data-sidebar-link][href="/docs"]')).toHaveClass(
    /sidebar__item--active/,
  );
  await expect(page.locator('[data-sidebar-link][href="/"]')).not.toHaveClass(
    /sidebar__item--active/,
  );

  await page.getByRole("link", { name: "Projects" }).first().click();
  await expect(page.locator('[data-sidebar-link][href="/"]')).toHaveClass(/sidebar__item--active/);
  await expect(page.locator('[data-sidebar-link][href="/docs"]')).not.toHaveClass(
    /sidebar__item--active/,
  );
});
