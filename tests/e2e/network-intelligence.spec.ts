import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

function ledgers() {
  const now = Date.parse('2026-08-20T12:00:00.000Z')
  return Array.from({ length: 36 }, (_, index) => ({
    id: `ledger-${index}`,
    sequence: 56_000_000 + index,
    closed_at: new Date(now - index * 5_000).toISOString(),
    successful_transaction_count: 100 + index,
    failed_transaction_count: index % 10 === 0 ? 1 : 0,
    operation_count: 430 + index * 2,
    protocol_version: 22,
  }))
}

async function openNetworkIntelligence(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('stellar:behavior-analytics:v1', JSON.stringify({
      version: 1,
      consent: { status: 'denied', usage: false, personalization: false },
      events: [],
    }))
    localStorage.setItem('stellar-dashboard-theme', 'dark')
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }'
      document.head.appendChild(style)
    })
  })
  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue()
    if (url.pathname === '/ledgers') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ _embedded: { records: ledgers() } }) })
    }
    if (request.method() === 'POST' && url.hostname.includes('soroban')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { status: 'healthy' } }) })
    }
    if (url.hostname.includes('horizon')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ horizon_version: 'test' }) })
    }
    return route.abort('blockedbyclient')
  })
  await page.goto('/connect', { waitUntil: 'domcontentloaded' })
  await page.evaluate((account) => {
    const dashboardWindow = window as typeof window & {
      __store?: { getState: () => { setConnectedAddress: (_value: string) => void } }
    }
    dashboardWindow.__store?.getState().setConnectedAddress(account)
  }, ACCOUNT)
  await page.getByRole('button', { name: 'Intelligence', exact: true }).click()
  await expect(page).toHaveURL(/\/networkIntelligence$/)
  await expect(page.getByRole('heading', { name: 'Network Intelligence' })).toBeVisible()
  await expect(page.getByText('Collecting network telemetry')).toBeHidden({ timeout: 15_000 })
}

test.describe('network intelligence operator workflow', () => {
  test('shows live health, forecast, SLO, and accessible navigation', async ({ page }) => {
    await openNetworkIntelligence(page)
    await expect(page.getByText('Network health')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Historical performance' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Congestion forecast' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'SLA and error budgets' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Network intelligence views' })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .include('.network-intelligence')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = results.violations.filter((violation) =>
      violation.impact === 'critical' || violation.impact === 'serious')
    expect(serious).toEqual([])
  })

  test('runs an incident simulation and exposes root-cause guidance', async ({ page }) => {
    await openNetworkIntelligence(page)
    await page.getByRole('button', { name: /simulate incident/i }).click()
    await expect(page.getByText('SIMULATION')).toBeVisible()
    await page.getByRole('button', { name: /incidents/i }).click()
    await expect(page.getByText('Incident timeline')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Probable root cause' })).toBeVisible()
    await expect(page.getByText('Recommended response')).toBeVisible()
    await page.getByRole('button', { name: /return to live data/i }).click()
    await expect(page.getByText('SIMULATION')).toBeHidden()
  })

  test('recalculates capacity from an operator scenario', async ({ page }) => {
    await openNetworkIntelligence(page)
    await page.getByRole('button', { name: /capacity/i }).click()
    const growth = page.getByRole('slider', { name: 'Annual traffic growth' })
    await growth.fill('150')
    await expect(growth).toHaveValue('150')
    await expect(page.getByRole('heading', { name: 'Capacity projection' })).toBeVisible()
    await expect(page.getByText('Resource plan')).toBeVisible()
  })
})
