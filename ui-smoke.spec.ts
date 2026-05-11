import { test, expect } from '@playwright/test';

test('Side Quest app core UI flows', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  const email = `codex-ui-${Date.now()}@example.com`;
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Testpass123');
  await page.getByLabel('Name').fill('Codex UI Tester');
  await page.getByLabel('Work experience').selectOption({ label: '0-1 years' });
  await page.getByLabel('Highest level of education').selectOption({ label: 'Undergraduate' });
  await page.getByLabel('Course or job title').fill('Computer Science');
  await page.getByLabel('Career interest').fill('AI product, student events');
  await page.getByLabel('Skills').fill('coding, design, data');
  await page.getByLabel('Goals').fill('Find teammates and ship a portfolio project');
  await page.getByLabel('Hobbies').fill('Gaming, writing, volunteering');
  await page.getByRole('button', { name: 'Create Profile' }).click();

  await expect(page.getByRole('heading', { name: 'Discover events fast' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await expect(page.locator('.quest-card').first()).toBeVisible({ timeout: 20000 });

  await page.getByLabel('Search events').fill('AI');
  await page.getByLabel('Search events').press('Enter');
  await expect(page.getByLabel('Clear search')).toBeVisible();

  await page.getByRole('button', { name: 'Map' }).click();
  await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle filters' }).click();
  await expect(page.getByText('Difficulty')).toBeVisible();

  await page.getByRole('button', { name: 'Saved' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();

  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Submit a Side Quest' })).toBeVisible();
  await expect(page.getByText('Import ready')).toBeVisible();
  await expect(page.getByText('Discord ready')).toBeVisible();
  await page.getByRole('button', { name: /Paste a Link/ }).click();
  await expect(page.getByPlaceholder('https://...')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Side Quest Parties' }).click();
  await expect(page.getByRole('heading', { name: 'Side Quest Parties' })).toBeVisible();
  await page.getByRole('button', { name: 'Find a Party' }).click();
  await expect(page.getByText('Side quests looking for parties')).toBeVisible();

  await page.getByRole('button', { name: 'Discover' }).click();
  await expect(page.locator('.quest-card').first()).toBeVisible();
  await page.locator('.quest-card .quest-title-button').first().click();
  await expect(page.locator('.detail-shell')).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('heading', { name: 'Discover events fast' })).toBeVisible();

  expect(consoleErrors.filter((text) => !text.includes('favicon'))).toEqual([]);
});
