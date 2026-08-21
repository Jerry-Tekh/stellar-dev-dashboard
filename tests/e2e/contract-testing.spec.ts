import { expect, test } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

async function clickButton(page, name: string | RegExp) {
  await page.getByRole('button', { name }).evaluate((button: HTMLButtonElement) => button.click());
}

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
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(style);
    });
  });
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.goto('/contractTesting', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/contractTesting(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Contract Testing & Verification' })).toBeVisible();
}

test('analyzes a sample contract and surfaces findings, tests, and verification', async ({ page }) => {
  await open(page);
  await expect(page.getByText(/No analysis yet/i)).toBeVisible();

  await clickButton(page, 'Escrow (deliberately flawed)');
  await expect(page.locator('#contract-testing-source')).not.toHaveValue('');
  await clickButton(page, 'Analyze contract');

  await expect(page.getByRole('heading', { name: 'Detected functions' })).toBeVisible();
  const findingsTab = page.getByRole('button', { name: /^Findings/ });
  await expect(findingsTab).toBeVisible();
  await findingsTab.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('heading', { name: /Static findings/ })).toBeVisible();
  await expect(page.getByText(/access-control/i).first()).toBeVisible();

  await clickButton(page, 'Generated Tests');
  await expect(page.getByRole('heading', { name: /Generated test suite/ })).toBeVisible();

  await clickButton(page, 'Formal Verification');
  await expect(page.getByRole('heading', { name: 'Formal verification report' })).toBeVisible();
  await expect(page.getByText(/not symbolic execution/i)).toBeVisible();
});

test('downloads the generated test suite and CI workflow', async ({ page }) => {
  await open(page);
  await clickButton(page, 'Simple counter');
  await expect(page.locator('#contract-testing-source')).not.toHaveValue('');
  await clickButton(page, 'Analyze contract');
  await expect(page.getByRole('heading', { name: 'Detected functions' })).toBeVisible();

  await clickButton(page, 'Generated Tests');
  const testsDownload = page.waitForEvent('download');
  await clickButton(page, 'Download .rs');
  expect((await testsDownload).suggestedFilename()).toMatch(/_generated_tests\.rs$/);

  await clickButton(page, 'CI Integration');
  const ciDownload = page.waitForEvent('download');
  await clickButton(page, 'Download workflow');
  expect((await ciDownload).suggestedFilename()).toMatch(/-contract-tests\.yml$/);
});

test('rejects empty source with an actionable error', async ({ page }) => {
  await open(page);
  await clickButton(page, 'Analyze contract');
  await expect(page.getByRole('alert').filter({ hasText: 'Analysis failed' })).toContainText(
    /Paste or upload a Soroban contract source/i
  );
});
