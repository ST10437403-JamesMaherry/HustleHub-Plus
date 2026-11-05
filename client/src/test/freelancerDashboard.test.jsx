import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { callsTo, renderApp, signInAs } from './helpers';

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR'
});

function displayedMoney(value) {
  return currencyFormatter.format(value).replace(/\s+/g, ' ');
}

function createMonths(amounts = {}) {
  return Array.from({ length: 12 }, (_, index) => {
    const year = index < 10 ? 2026 : 2027;
    const monthNumber = ((index + 2) % 12) + 1;
    const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat('en-ZA', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${month}-01T12:00:00Z`));
    const totalIncome = amounts[month] ?? 0;

    return {
      month,
      label,
      totalIncome,
      transactionCount: totalIncome > 0 ? 1 : 0
    };
  });
}

function createReport(overrides = {}) {
  return {
    totalIncome: 138000,
    transactionCount: 9,
    taxYear: {
      year: 2027,
      label: '2026/27',
      startDate: '2026-03-01',
      endDate: '2027-02-28',
      asOfDate: '2026-11-05'
    },
    yearToDateIncome: 120000,
    yearToDateTransactionCount: 7,
    monthlyIncome: createMonths({
      '2026-03': 30000,
      '2026-04': 10000,
      '2026-06': 20000,
      '2026-08': 10000,
      '2026-09': 10000,
      '2026-10': 30000,
      '2026-11': 10000
    }),
    taxEstimate: {
      taxYear: 2027,
      asOfDate: '2026-11-05',
      ageBand: 'under65',
      projectedAnnualPlatformIncome: 175200,
      illustrativeAnnualTax: 13716,
      annualRebate: 17820
    },
    ...overrides
  };
}

const BOOKING = {
  id: 'b'.repeat(24),
  amount: 1200.5,
  status: 'confirmed',
  createdAt: '2026-11-04T12:00:00Z'
};

describe('freelancer finance dashboard', () => {
  it('shows lifetime income, tax-year totals and a clearly qualified annual tax projection', async () => {
    const fetchMock = signInAs('freelancer', {
      'GET /api/income/me': { body: createReport() },
      'GET /api/bookings/freelancer': { body: { bookings: [BOOKING] } }
    });
    renderApp('/freelancer/dashboard');

    // Wait for authenticated routing to show the dashboard before reading its metrics.
    const incomeCard = (await screen.findByText('Total income')).closest('article');
    expect(await within(incomeCard).findByText(displayedMoney(138000))).toBeInTheDocument();

    const transactions = screen.getByText('Transaction count').closest('article');
    expect(within(transactions).getByText('9')).toBeInTheDocument();

    const yearToDate = screen.getByText('Income this tax year').closest('article');
    expect(within(yearToDate).getByText(displayedMoney(120000))).toBeInTheDocument();
    expect(yearToDate).toHaveTextContent('7 confirmed transactions');

    const estimatedTax = screen.getByText('Illustrative annual tax').closest('article');
    expect(within(estimatedTax).getByText(displayedMoney(13716))).toBeInTheDocument();
    expect(estimatedTax).toHaveTextContent('not tax currently due');

    const assumptions = screen.getByRole('heading', { name: 'How this estimate works' }).closest('section');
    expect(assumptions).toHaveTextContent(displayedMoney(175200));
    expect(assumptions).toHaveTextContent(displayedMoney(17820));
    expect(assumptions).toHaveTextContent('not a SARS assessment');
    expect(assumptions).toHaveTextContent('not necessarily taxable profit');

    expect(await screen.findByText('Booking #BBBBBB')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET /api/income/me')[0].init.headers.Authorization)
      .toBe('Bearer test-token');
  });

  it('renders all 12 months with accurate labels, scaled bars and upcoming months', async () => {
    signInAs('freelancer', {
      'GET /api/income/me': { body: createReport() },
      'GET /api/bookings/freelancer': { body: { bookings: [] } }
    });
    renderApp('/freelancer/dashboard');

    const chart = await screen.findByRole('list', {
      name: 'Monthly confirmed income for 2026/27'
    });
    expect(within(chart).getAllByRole('listitem')).toHaveLength(12);

    const march = within(chart).getByText('Mar 2026').closest('li');
    const april = within(chart).getByText('Apr 2026').closest('li');
    const february = within(chart).getByText('Feb 2027').closest('li');
    expect(march).toHaveTextContent(displayedMoney(30000));
    expect(march.querySelector('.fd-month-fill')).toHaveStyle({ width: '100%' });
    expect(april).toHaveTextContent(displayedMoney(10000));
    expect(parseFloat(april.querySelector('.fd-month-fill').style.width)).toBeCloseTo(33.33, 2);
    expect(february).toHaveTextContent('Upcoming');
    expect(february.querySelector('.fd-month-fill')).toHaveStyle({ width: '0%' });
  });

  it('keeps zero-income and no-bookings states useful without inventing tax due', async () => {
    const report = createReport({
      totalIncome: 0,
      transactionCount: 0,
      yearToDateIncome: 0,
      yearToDateTransactionCount: 0,
      monthlyIncome: createMonths(),
      taxEstimate: {
        taxYear: 2027,
        asOfDate: '2026-11-05',
        ageBand: 'under65',
        projectedAnnualPlatformIncome: 0,
        illustrativeAnnualTax: 0,
        annualRebate: 17820
      }
    });
    signInAs('freelancer', {
      'GET /api/income/me': { body: report },
      'GET /api/bookings/freelancer': { body: { bookings: [] } }
    });
    renderApp('/freelancer/dashboard');

    expect(await screen.findByText('No confirmed income in this tax year yet.')).toBeInTheDocument();
    expect(await screen.findByText('No bookings yet.')).toBeInTheDocument();
    const annualTax = screen.getByText('Illustrative annual tax').closest('article');
    expect(annualTax).toHaveTextContent(displayedMoney(0));
    expect(screen.getByRole('list', { name: 'Monthly confirmed income for 2026/27' }))
      .toBeInTheDocument();
  });

  it('keeps recent bookings visible when the income service is unavailable', async () => {
    signInAs('freelancer', {
      'GET /api/income/me': { status: 503, body: { error: 'Unavailable' } },
      'GET /api/bookings/freelancer': { body: { bookings: [BOOKING] } }
    });
    renderApp('/freelancer/dashboard');

    expect(await screen.findByText('Booking #BBBBBB')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Income could not be loaded.');
    expect(screen.getByText('Monthly income is unavailable.')).toBeInTheDocument();
  });

  it('keeps income visible when booking history fails', async () => {
    signInAs('freelancer', {
      'GET /api/income/me': { body: createReport() },
      'GET /api/bookings/freelancer': { status: 503, body: { error: 'Unavailable' } }
    });
    renderApp('/freelancer/dashboard');

    expect(await screen.findByText(displayedMoney(13716))).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bookings could not be loaded.');
  });

  it('fails safely when analytics fields are missing rather than showing partial amounts', async () => {
    signInAs('freelancer', {
      'GET /api/income/me': { body: createReport({ monthlyIncome: [] }) },
      'GET /api/bookings/freelancer': { body: { bookings: [] } }
    });
    renderApp('/freelancer/dashboard');

    expect(await screen.findByRole('alert')).toHaveTextContent('The API returned invalid income data.');
    expect(screen.queryByText(displayedMoney(13716))).not.toBeInTheDocument();
  });

  it('refreshes both independent endpoints without creating a new booking', async () => {
    let totalIncome = 138000;
    const user = userEvent.setup();
    const fetchMock = signInAs('freelancer', {
      'GET /api/income/me': () => {
        const value = totalIncome;
        totalIncome = 140000;
        return { body: createReport({ totalIncome: value }) };
      },
      'GET /api/bookings/freelancer': { body: { bookings: [BOOKING] } }
    });
    renderApp('/freelancer/dashboard');

    expect(await screen.findByText(displayedMoney(138000))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh data' }));

    expect(await screen.findByText(displayedMoney(140000))).toBeInTheDocument();
    await waitFor(() => {
      expect(callsTo(fetchMock, 'GET /api/income/me')).toHaveLength(2);
      expect(callsTo(fetchMock, 'GET /api/bookings/freelancer')).toHaveLength(2);
    });
    expect(callsTo(fetchMock, 'POST /api/bookings')).toHaveLength(0);
  });

  it('restricts the finance dashboard to the freelancer role', async () => {
    const fetchMock = signInAs('client');
    renderApp('/freelancer/dashboard');

    expect(await screen.findByRole('heading', { name: 'Access denied.' }))
      .toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET /api/income/me')).toHaveLength(0);
  });
});
