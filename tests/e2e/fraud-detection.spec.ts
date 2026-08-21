import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

async function openFraudDetection(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        version: 1,
        consent: { status: 'denied', usage: false, personalization: false },
        events: [],
      })
    )
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }))
    localStorage.setItem('stellar-dashboard-theme', 'dark')
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
      document.head.appendChild(style)
    })
  })
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') await route.continue()
    else await route.abort('blockedbyclient')
  })
  await page.goto('/connect', { waitUntil: 'domcontentloaded' })
  await page.evaluate((account) => {
    const dashboardWindow = window as typeof window & {
      __store?: { getState: () => { setConnectedAddress: (_value: string) => void } }
    }
    dashboardWindow.__store?.getState().setConnectedAddress(account)
  }, ACCOUNT)
  await page.getByRole('button', { name: 'Fraud Detection', exact: true }).click()
  await expect(page).toHaveURL(/\/fraudDetection(?:\?|$)/)
  await expect(page.getByRole('heading', { name: /Fraud detection & prevention/i })).toBeVisible()
  await expect(page.getByText(/Loading fraud intelligence/i)).toBeHidden({ timeout: 15_000 })
}

test.describe('fraud detection operator workflow', () => {
  test('investigates and acknowledges an explainable alert', async ({ page }) => {
    await openFraudDetection(page)
    await page.getByRole('button', { name: 'alerts', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Investigation queue' })).toBeVisible()

    await page.getByRole('button', { name: 'Acknowledge' }).first().click()
    await expect(page.getByRole('combobox', { name: /Status for/i }).first()).toHaveValue(
      'acknowledged'
    )

    await page.getByRole('button', { name: 'Evidence', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'Fraud assessment details' })).toBeVisible()
    await expect(page.getByText(/Signals contributing to this score/i)).toBeVisible()
    await page.getByRole('button', { name: 'Close details' }).click()
  })

  test('exposes prevention, education, methodology, and accessible navigation', async ({ page }) => {
    await openFraudDetection(page)
    await page.getByRole('button', { name: 'prevention' }).click()
    await expect(page.getByRole('heading', { name: 'Prevention workflows' })).toBeVisible()
    await page.getByRole('button', { name: 'education' }).click()
    await expect(page.getByText(/Never share a seed phrase/i)).toBeVisible()
    await page.getByRole('button', { name: 'methodology' }).click()
    await expect(page.getByRole('heading', { name: 'Known limitations' })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .include('[aria-labelledby="fraud-title"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    )
    expect(serious).toEqual([])
  })
})
