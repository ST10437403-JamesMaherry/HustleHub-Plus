// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { api, newRunId, testAccount } = require('../support/api');
const { illustrativeTax } = require('../support/sars-oracle');
const { signIn, sessionToken, metricValue, evidenceShot, normalise, formatZar } = require('../support/ui');

// One freelancer and one client per run, isolated from any assessment account.
const runId = newRunId();
const freelancer = testAccount('freelancer', runId);
const client = testAccount('client', runId);

// A price high enough for the projected income to reach a taxable bracket.
const gig = {
  title: `E2E Brand Strategy ${runId}`,
  category: 'Consulting',
  price: 250000,
  priceInput: '250000.00',
  description: 'Isolated Playwright fixture: brand strategy workshop and written report.'
};

const state = { gigId: null, bookingId: null };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Registration through the UI is covered by the freelancer journey below.
  await api.register(client);
});

test.afterAll(async () => {
  // Remove the fixture gig from the public marketplace. The booking and its
  // transaction remain, as the application preserves financial history.
  if (!state.gigId) return;
  const token = await api.login(freelancer);
  await api.deleteGig(token, state.gigId);
});

test('freelancer registers, signs in and publishes a gig', async ({ page }) => {
  await page.goto('/register');
  // The native radio is visually hidden behind a styled card, so click the card as a user would.
  await page.locator('label.role-option').filter({ hasText: 'Freelancer' }).click();
  await expect(page.getByRole('radio', { name: /Freelancer/ })).toBeChecked();
  await page.getByLabel('Full name').fill(freelancer.fullName);
  await page.getByLabel('Email').fill(freelancer.email);
  await page.getByLabel('Password', { exact: true }).fill(freelancer.password);
  await page.getByLabel('Confirm password').fill(freelancer.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status').filter({ hasText: 'Account created' }))
    .toHaveText(/Account created\. Sign in to continue\./);
  await expect(page.getByLabel('Email')).toHaveValue(freelancer.email);

  await page.getByLabel('Password', { exact: true }).fill(freelancer.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Freelancers land on their gig management page.
  await expect(page).toHaveURL(/\/freelancer\/gigs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Your gigs.', exact: true })).toBeVisible();

  await page.getByLabel('Title').fill(gig.title);
  await page.getByLabel('Category').fill(gig.category);
  await page.getByLabel('Price (ZAR)').fill(gig.priceInput);
  await page.getByLabel('Description').fill(gig.description);
  await page.getByRole('button', { name: 'Publish gig' }).click();

  await expect(page.getByText(`Published "${gig.title}".`)).toBeVisible();
  const card = page.locator('.gig-card').filter({ hasText: gig.title });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.gig-price')).toHaveText(new RegExp(formatZar(gig.price).replace(/ /g, '\\s')));
  await evidenceShot(page, '01-freelancer-gig-published');

  const token = await sessionToken(page);
  expect(token, 'JWT kept in sessionStorage').toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
});

test('client finds the gig, confirms a booking and sees it in history', async ({ page }) => {
  await signIn(page, client);
  await expect(page).toHaveURL(/\/gigs$/);

  await page.getByLabel('Search services').fill(runId);
  const card = page.locator('.gig-card').filter({ hasText: gig.title });
  await expect(card).toHaveCount(1);

  await card.getByRole('button', { name: 'Book this gig' }).click();
  const confirm = card.getByRole('group', { name: `Confirm booking ${gig.title}` });
  await expect(confirm).toContainText('Payment is simulated');
  await expect(normalise(await confirm.innerText())).toContain(formatZar(gig.price));
  await evidenceShot(page, '02-client-booking-confirm');

  await confirm.getByRole('button', { name: 'Confirm booking' }).click();
  const done = card.getByRole('status');
  await expect(done).toContainText('Booking confirmed.');
  expect(normalise(await done.innerText())).toContain(`A simulated payment of ${formatZar(gig.price)} has been recorded.`);
  const reference = normalise(await done.locator('.booking-ref').innerText());
  expect(reference).toMatch(/^HH-[0-9A-F]{8}$/);
  await evidenceShot(page, '03-client-booking-confirmed');

  await done.getByRole('link', { name: 'View my bookings' }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  const row = page.locator('.bookings-table tbody tr').filter({ hasText: reference });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(gig.title);
  await expect(row).toContainText('Confirmed');
  expect(normalise(await row.locator('td[data-label="Amount"]').innerText())).toBe(formatZar(gig.price));
  await evidenceShot(page, '04-client-booking-history');

  // The browser flow must have produced exactly one persisted booking.
  const history = await api.clientBookings(await sessionToken(page));
  expect(history.bookings).toHaveLength(1);
  expect(history.bookings[0].amount).toBe(gig.price);
  expect(`HH-${history.bookings[0].id.slice(-8).toUpperCase()}`).toBe(reference);
  state.gigId = history.bookings[0].gig;
  state.bookingId = history.bookings[0].id;
});

test('freelancer dashboard shows the income and illustrative tax', async ({ page }) => {
  expect(state.bookingId, 'booking from the previous step').toBeTruthy();
  await signIn(page, freelancer);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/freelancer\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings and income.', exact: true })).toBeVisible();
  await expect(page.locator('.fd-tax-note')).toBeVisible();

  const report = await api.income(await sessionToken(page));
  const expected = illustrativeTax({
    yearToDateIncome: gig.price,
    asOfDate: report.taxYear.asOfDate,
    taxYear: report.taxYear.year
  });

  // The API figures match the booking and an independent SARS calculation...
  expect(report.totalIncome).toBe(gig.price);
  expect(report.yearToDateIncome).toBe(gig.price);
  expect(report.taxEstimate.projectedAnnualPlatformIncome).toBe(expected.projectedAnnualIncome);
  expect(report.taxEstimate.illustrativeAnnualTax).toBe(expected.illustrativeAnnualTax);
  expect(expected.illustrativeAnnualTax).toBeGreaterThan(0);

  // ...and the dashboard renders exactly those figures.
  expect(await metricValue(page, 'Total income')).toBe(formatZar(gig.price));
  expect(await metricValue(page, 'Transaction count')).toBe('1');
  expect(await metricValue(page, 'Income this tax year')).toBe(formatZar(gig.price));
  expect(await metricValue(page, 'Illustrative annual tax')).toBe(formatZar(expected.illustrativeAnnualTax));

  const taxNote = normalise(await page.locator('.fd-tax-note').innerText());
  expect(taxNote).toContain(`annualised to ${formatZar(expected.projectedAnnualIncome)}`);
  expect(taxNote).toContain(report.taxYear.label);

  // The booking's month carries the income; the bar list covers the whole tax year.
  const months = page.locator('.fd-month-row');
  await expect(months).toHaveCount(12);
  const current = report.monthlyIncome.find((month) => month.totalIncome > 0);
  const currentRow = months.filter({ hasText: current.label });
  expect(normalise(await currentRow.locator('.fd-month-amount').innerText())).toBe(formatZar(gig.price));

  const recent = page.locator('.fd-booking').filter({
    hasText: `Booking #${state.bookingId.slice(-6).toUpperCase()}`
  });
  await expect(recent).toHaveCount(1);
  await evidenceShot(page, '05-freelancer-income-tax-dashboard');
});

test('sign-out revokes the session and protected pages require sign-in again', async ({ page }) => {
  await signIn(page, freelancer);
  await page.goto('/freelancer/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Bookings and income.', exact: true })).toBeVisible();

  const oldToken = await sessionToken(page);
  expect((await api.me(oldToken)).status, 'token works before sign-out').toBe(200);

  const revocation = page.waitForResponse((response) => (
    response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Sign out' }).click();
  expect((await revocation).ok(), 'server-side session revocation').toBe(true);
  await expect(page).toHaveURL(/\/login$/);
  expect(await sessionToken(page)).toBeNull();

  // A copied JWT from the ended session is rejected by the API, not just forgotten by the browser.
  const replay = await api.me(oldToken);
  expect(replay.status).toBe(401);
  expect(replay.data).toEqual({ error: expect.any(String) });
  await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible();

  for (const path of ['/freelancer/dashboard', '/freelancer/gigs']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in.', exact: true })).toBeVisible();
  }
});
