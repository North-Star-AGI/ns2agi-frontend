import { expect, test } from '@playwright/test';

type AnalyticsWindow = Window & {
  __ns2agiAnalyticsInitialized?: boolean;
  dataLayer?: unknown[];
};

test('analytics stays absent without a measurement ID and gated until consent when configured', async ({ page }) => {
  const analyticsRequests: string[] = [];

  await page.addInitScript(() => window.localStorage.clear());
  page.on('request', (request) => {
    if (request.url().includes('googletagmanager.com/gtag/js')) analyticsRequests.push(request.url());
  });
  await page.route('https://www.googletagmanager.com/**', (route) => route.abort());
  await page.goto('/');

  const consentBanner = page.locator('#ns2agi-analytics-consent');
  const hasMeasurementId = Boolean(process.env.PUBLIC_GA_MEASUREMENT_ID);

  if (!hasMeasurementId) {
    await expect(consentBanner).toHaveCount(0);
    await expect(page.locator('#ns2agi-analytics-settings')).toHaveCount(0);
    expect(analyticsRequests).toHaveLength(0);
    return;
  }

  await expect(consentBanner).toBeVisible();
  expect(analyticsRequests).toHaveLength(0);

  await page.getByRole('button', { name: 'No thanks' }).click();
  await expect(consentBanner).toBeHidden();
  await expect(page.getByRole('button', { name: 'Privacy settings' })).toBeVisible();
  expect(analyticsRequests).toHaveLength(0);

  await page.getByRole('button', { name: 'Privacy settings' }).click();
  await expect(consentBanner).toBeVisible();

  await page.getByRole('button', { name: 'Allow analytics' }).click();
  await expect(consentBanner).toBeHidden();
  await expect.poll(() => analyticsRequests.length).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as AnalyticsWindow).__ns2agiAnalyticsInitialized)).toBe(true);

  await page.evaluate(() => {
    const link = document.querySelector('a[href^="http"]');
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await expect.poll(() => page.evaluate(() => (window as AnalyticsWindow).dataLayer?.length ?? 0)).toBeGreaterThanOrEqual(3);
});
