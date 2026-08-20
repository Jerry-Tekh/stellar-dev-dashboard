import { expect, test } from '@playwright/test';
const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
async function open(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        version: 1,
        consent: { status: 'denied', usage: false, personalization: false },
        events: [],
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
  await page.goto('/marketSentiment', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (account) => (window as any).__store?.getState().setConnectedAddress(account),
    ACCOUNT
  );
  await expect(page).toHaveURL(/\/marketSentiment(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Market Sentiment Intelligence' })).toBeVisible();
}
test('provides an accessible sentiment workflow', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Composite sentiment')).toBeVisible();
  const sources = page.getByRole('button', { name: 'sources' });
  await sources.focus();
  await expect(sources).toBeFocused();
  await sources.press('Enter');
  await expect(sources).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Global language coverage' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Credibility' })).toBeVisible();
});
test('simulates a shift and exposes alert guidance', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Simulate shift' }).click();
  await expect(page.getByText('DEMONSTRATION DATA')).toBeVisible();
  await page.getByRole('button', { name: /alerts/ }).click();
  await expect(page.getByText(/rolling baseline/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acknowledge' })).toBeVisible();
});
