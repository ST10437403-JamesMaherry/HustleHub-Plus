// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { api, newRunId, testAccount } = require('../support/api');
const { signIn, sessionToken, evidenceShot } = require('../support/ui');

const client = testAccount('client', newRunId());

test.beforeAll(async () => {
  await api.register(client);
});

test('a wrong password is rejected without creating a session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(client.email);
  await page.getByLabel('Password', { exact: true }).fill(`${client.password}-wrong`);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
  await expect(page).toHaveURL(/\/login$/);
  // The password is cleared and no JWT is stored after a failed attempt.
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect(await sessionToken(page)).toBeNull();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await evidenceShot(page, '06-login-rejected');
});

test('a client cannot open freelancer pages', async ({ page }) => {
  await signIn(page, client);

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'My bookings' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);

  await page.goto('/freelancer/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Access denied.', exact: true })).toBeVisible();
  await expect(page.locator('.fd-metric')).toHaveCount(0);
  await evidenceShot(page, '07-client-access-denied');
});

test('visitors are sent to sign in before protected pages', async ({ page }) => {
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in.', exact: true })).toBeVisible();
});
