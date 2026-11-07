'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const TOKEN_KEY = 'hustlehub.token';
const EVIDENCE_DIR = path.resolve(__dirname, '../../evidence/part3/e2e/screenshots');

// Intl output differs in its space characters between runtimes, so compare words only.
const normalise = (text) => String(text).replace(/[\s  ]+/g, ' ').trim();
const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const formatZar = (amount) => normalise(zar.format(amount));

async function signIn(page, account) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The header shows the verified account once /api/auth/me succeeds.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.locator('.account-summary')).toContainText(account.fullName);
}

const sessionToken = (page) => page.evaluate((key) => window.sessionStorage.getItem(key), TOKEN_KEY);

async function metricValue(page, label) {
  const metric = page.locator('.fd-metric').filter({ has: page.getByText(label, { exact: true }) });
  await expect(metric).toHaveCount(1);
  return normalise(await metric.locator('.fd-metric-value').innerText());
}

// Screenshots are written to the evidence folder only when explicitly requested.
async function evidenceShot(page, name) {
  if (process.env.E2E_EVIDENCE !== '1') return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true });
}

module.exports = { signIn, sessionToken, metricValue, evidenceShot, normalise, formatZar };
