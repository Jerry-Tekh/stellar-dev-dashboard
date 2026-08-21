import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        schemaVersion: 1,
        pseudonymousId: 'visitor_recommendation-e2e',
        consent: {
          status: 'denied',
          usage: false,
          personalization: false,
          updatedAt: new Date().toISOString(),
          policyVersion: 1,
        },
        events: [],
        assignments: [],
      })
    );
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }));
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(style);
    });
  });
  await page.goto('/recommendations', { waitUntil: 'domcontentloaded' });
});

test('supports cold-start discovery without connecting an account', async ({ page }) => {
  await expect(page).toHaveURL(/\/recommendations$/);
  await expect(page.getByRole('heading', { name: 'Recommendations for you' })).toBeVisible();
  await expect(page.getByText('Getting started')).toBeVisible();
  await expect(page.getByTestId(/^recommendation-/).first()).toBeVisible();
  await page
    .getByRole('group', { name: 'Filter recommendations' })
    .getByRole('button', { name: 'Contracts' })
    .click({ force: true });
  await expect(page.getByRole('heading', { name: 'Soroban Token Example' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'USDC on Stellar' })).not.toBeVisible();
});

test('explains rankings and learns from feedback', async ({ page }) => {
  await page.getByRole('button', { name: 'preferences' }).click({ force: true });
  await page.getByRole('checkbox').check({ force: true });
  await page.getByRole('button', { name: 'discover' }).click({ force: true });
  const first = page.getByRole('article').first();
  const title = await first.getByRole('heading').textContent();
  await first.getByRole('button', { name: /Why this ranking/ }).click({ force: true });
  await expect(first.getByText('Interest match')).toBeVisible();
  await page
    .getByRole('button', { name: `Not interested in ${title}` })
    .click({ force: true, timeout: 30_000 });
  await expect(page.getByRole('heading', { name: title!, exact: true })).not.toBeVisible();
});

test('provides preference and privacy controls', async ({ page }) => {
  await page.getByRole('button', { name: 'preferences' }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Personalization' })).toBeVisible();
  await page.getByRole('button', { name: /^DeFi/ }).click({ force: true, timeout: 30_000 });
  await page.getByLabel(/Discovery/).fill('0.8');
  await expect(
    page.getByText(/public key and transaction history are never stored/i)
  ).toBeVisible();
  await page.getByRole('button', { name: /Clear data/ }).click({ force: true });
  await expect(page.getByText('0 feedback signals stored on this device.')).toBeVisible();
});

test('documents transparent methodology and experiment assignment', async ({ page }) => {
  await page.getByRole('button', { name: 'methodology' }).click({ force: true, timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Collaborative signals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Diversity re-ranking' })).toBeVisible();
  await expect(page.getByText(/not financial, legal, or security advice/i)).toBeVisible();
});
