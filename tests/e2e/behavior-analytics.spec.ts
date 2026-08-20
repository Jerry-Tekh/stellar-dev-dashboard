import { expect, test } from '@playwright/test';

test.describe('privacy-first behavior analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('stellar:behavior-analytics:v1'));
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
  });

  test('asks for consent without recording an event first', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Analytics privacy choices' });
    await expect(dialog).toBeVisible();

    const beforeConsent = await page.evaluate(() =>
      localStorage.getItem('stellar:behavior-analytics:v1')
    );
    expect(beforeConsent).toBeNull();

    await dialog.getByRole('button', { name: 'Allow & personalize' }).click();
    await expect(dialog).toBeHidden();

    const state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('stellar:behavior-analytics:v1') || '{}')
    );
    expect(state.consent).toMatchObject({ status: 'granted', usage: true, personalization: true });
  });

  test('honors essential-only choice and exposes accessible dialog semantics', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Analytics privacy choices' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-describedby', 'analytics-consent-description');
    await expect(page.locator('#analytics-consent-description')).toBeVisible();
    await expect(dialog.getByRole('button')).toHaveCount(4);

    await dialog.getByRole('button', { name: 'Essential only' }).click();
    await expect(dialog).toBeHidden();

    const state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('stellar:behavior-analytics:v1') || '{}')
    );
    expect(state.consent).toMatchObject({ status: 'denied', usage: false, personalization: false });
    expect(state.events).toEqual([]);
  });
});
