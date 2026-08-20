import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('privacy-first behavior analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/connect');
    await page.evaluate(() => localStorage.removeItem('stellar:behavior-analytics:v1'));
    await page.reload();
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

  test('honors essential-only choice and has no critical accessibility issues', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Analytics privacy choices' });
    const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(accessibility.violations).toEqual([]);

    await dialog.getByRole('button', { name: 'Essential only' }).click();
    await expect(dialog).toBeHidden();

    const state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('stellar:behavior-analytics:v1') || '{}')
    );
    expect(state.consent).toMatchObject({ status: 'denied', usage: false, personalization: false });
    expect(state.events).toEqual([]);
  });
});
