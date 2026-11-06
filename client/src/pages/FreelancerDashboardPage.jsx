import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import '../styles/freelancerDashboard.css';

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR'
});

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Johannesburg'
});

const AGE_BAND_LABELS = {
  under65: 'under 65',
  age65to74: '65 to 74',
  age75plus: '75 or older'
};

function formatDate(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : dateFormatter.format(date);
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : 'Unable to load data. Please try again.';
}

function isMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// Reject incomplete finance responses rather than showing misleading values.
function isValidIncomeReport(data) {
  const taxYear = data?.taxYear;
  const taxEstimate = data?.taxEstimate;
  const months = data?.monthlyIncome;

  return (
    isMoney(data?.totalIncome) &&
    isCount(data?.transactionCount) &&
    isMoney(data?.yearToDateIncome) &&
    isCount(data?.yearToDateTransactionCount) &&
    Number.isInteger(taxYear?.year) &&
    typeof taxYear?.label === 'string' &&
    taxYear.label.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(taxYear?.asOfDate ?? '') &&
    Array.isArray(months) &&
    months.length === 12 &&
    months.every((month, index) => (
      month &&
      /^\d{4}-\d{2}$/.test(month.month ?? '') &&
      typeof month.label === 'string' &&
      month.label.length > 0 &&
      isMoney(month.totalIncome) &&
      isCount(month.transactionCount) &&
      (index === 0 || months[index - 1].month < month.month)
    )) &&
    taxEstimate?.taxYear === taxYear.year &&
    taxEstimate?.asOfDate === taxYear.asOfDate &&
    Object.hasOwn(AGE_BAND_LABELS, taxEstimate?.ageBand ?? '') &&
    isMoney(taxEstimate?.projectedAnnualPlatformIncome) &&
    isMoney(taxEstimate?.illustrativeAnnualTax) &&
    isMoney(taxEstimate?.annualRebate)
  );
}

function DashboardMetric({ label, value, description }) {
  return (
    <article className="fd-metric">
      <p className="fd-metric-label">{label}</p>
      <p className="fd-metric-value">{value}</p>
      <p className="fd-metric-description">{description}</p>
    </article>
  );
}

export default function FreelancerDashboardPage() {
  const { request } = useAuth();
  const [income, setIncome] = useState({ loading: true, data: null, error: '' });
  const [bookings, setBookings] = useState({ loading: true, data: [], error: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // Fetch each section separately so an error in one does not hide the other.
    async function loadIncome() {
      try {
        const data = await request('/api/income/me', { signal });

        if (!isValidIncomeReport(data)) {
          throw new Error('The API returned invalid income data.');
        }

        if (!signal.aborted) {
          setIncome({ loading: false, data, error: '' });
        }
      } catch (error) {
        if (!signal.aborted) {
          setIncome({ loading: false, data: null, error: getErrorMessage(error) });
        }
      }
    }

    async function loadBookings() {
      try {
        const data = await request('/api/bookings/freelancer', { signal });

        if (
          !Array.isArray(data?.bookings) ||
          !data.bookings.every((booking) => (
            booking &&
            typeof booking.id === 'string' &&
            isMoney(booking.amount) &&
            typeof booking.status === 'string'
          ))
        ) {
          throw new Error('The API returned invalid booking data.');
        }

        // Booking history is already ordered newest-first by the API.
        if (!signal.aborted) {
          setBookings({ loading: false, data: data.bookings.slice(0, 5), error: '' });
        }
      } catch (error) {
        if (!signal.aborted) {
          setBookings({ loading: false, data: [], error: getErrorMessage(error) });
        }
      }
    }

    // Both loaders handle their own errors.
    void loadIncome();
    void loadBookings();

    // Cancel obsolete requests when the page refreshes or unmounts.
    return () => controller.abort();
  }, [request, refreshKey]);

  function handleRefresh() {
    setIncome({ loading: true, data: null, error: '' });
    setBookings({ loading: true, data: [], error: '' });
    setRefreshKey((current) => current + 1);
  }

  const isLoading = income.loading || bookings.loading;
  const report = income.data;
  const taxEstimate = report?.taxEstimate;
  const unavailableValue = income.loading ? 'Loading...' : '—';
  const observedMonths = report?.monthlyIncome.filter(
    (month) => month.month <= report.taxYear.asOfDate.slice(0, 7)
  ) ?? [];
  const peakMonthIncome = Math.max(0, ...observedMonths.map((month) => month.totalIncome));

  return (
    <section className="page freelancer-dashboard">
      <header className="page-heading">
        <p className="eyebrow">Freelancer workspace</p>
        <h1>Bookings and income.</h1>
        <p className="page-description">
          Your confirmed HustleHub+ earnings, estimated annual tax and recent
          client bookings. Financial figures come from your own account.
        </p>
      </header>

      <div className="fd-toolbar">
        <p className="fd-caption">Your account overview</p>
        <button
          type="button"
          className="button-secondary"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh data'}
        </button>
      </div>

      <section className="fd-summary" aria-label="Freelancer income summary">
        <DashboardMetric
          label="Total income"
          value={report ? currencyFormatter.format(report.totalIncome) : unavailableValue}
          description="All-time confirmed simulated transactions"
        />
        <DashboardMetric
          label="Transaction count"
          value={report ? report.transactionCount : unavailableValue}
          description="All-time confirmed transactions"
        />
        <DashboardMetric
          label="Income this tax year"
          value={report ? currencyFormatter.format(report.yearToDateIncome) : unavailableValue}
          description={report
            ? `${report.taxYear.label} · ${report.yearToDateTransactionCount} confirmed transactions`
            : 'Year-to-date confirmed platform revenue'}
        />
        <DashboardMetric
          label="Illustrative annual tax"
          value={report ? currencyFormatter.format(taxEstimate.illustrativeAnnualTax) : unavailableValue}
          description="Full-year projection · not tax currently due"
        />
      </section>

      {income.error && (
        <p className="fd-error" role="alert">
          Income could not be loaded. {income.error}
        </p>
      )}

      {report && (
        <section className="fd-tax-note" aria-labelledby="fd-tax-note-title">
          <div className="fd-section-heading">
            <div>
              <p className="eyebrow">Tax estimate</p>
              <h2 id="fd-tax-note-title">How this estimate works</h2>
            </div>
            <p className="fd-caption">As of {formatDate(report.taxYear.asOfDate)}</p>
          </div>
          <p>
            Confirmed platform income for the {report.taxYear.label} tax year is
            annualised to {currencyFormatter.format(taxEstimate.projectedAnnualPlatformIncome)}.
            The illustration applies SARS individual tax brackets and an assumed
            {` ${AGE_BAND_LABELS[taxEstimate.ageBand]}`} rebate of
            {` ${currencyFormatter.format(taxEstimate.annualRebate)}`}.
          </p>
          <p className="fd-tax-disclaimer">
            This is an illustrative full-year estimate, not a SARS assessment or an
            amount currently due. Platform revenue is not necessarily taxable profit;
            expenses, other income, credits and tax already paid are not included.
          </p>
        </section>
      )}

      <section className="fd-monthly" aria-labelledby="fd-monthly-title">
        <div className="fd-section-heading">
          <div>
            <p className="eyebrow">Income activity</p>
            <h2 id="fd-monthly-title">Monthly confirmed income</h2>
          </div>
          {report && <p className="fd-caption">Tax year {report.taxYear.label}</p>}
        </div>

        {income.loading ? (
          <div className="fd-empty" role="status">Loading monthly income...</div>
        ) : income.error ? (
          <div className="fd-empty">Monthly income is unavailable.</div>
        ) : (
          <>
            {report.yearToDateTransactionCount === 0 && (
              <p className="fd-monthly-context">
                No confirmed income in this tax year yet.
              </p>
            )}
            <p className="fd-monthly-context" id="fd-monthly-context">
              Each bar is relative to the highest-income month. Future months
              are marked as upcoming rather than reported as earnings.
            </p>
            <ol
              className="fd-monthly-bars"
              aria-label={`Monthly confirmed income for ${report.taxYear.label}`}
              aria-describedby="fd-monthly-context"
            >
              {report.monthlyIncome.map((month) => {
                const upcoming = month.month > report.taxYear.asOfDate.slice(0, 7);
                const barWidth = upcoming || peakMonthIncome === 0 || month.totalIncome === 0
                  ? 0
                  : Math.max(2, (month.totalIncome / peakMonthIncome) * 100);

                return (
                  <li
                    className={`fd-month-row${upcoming ? ' fd-month-upcoming' : ''}`}
                    key={month.month}
                  >
                    <span className="fd-month-label">{month.label}</span>
                    <span className="fd-month-track" aria-hidden="true">
                      <span className="fd-month-fill" style={{ width: `${barWidth}%` }} />
                    </span>
                    <span className="fd-month-amount">
                      {upcoming ? 'Upcoming' : currencyFormatter.format(month.totalIncome)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      <section className="fd-bookings" aria-labelledby="fd-bookings-title">
        <div className="fd-section-heading">
          <div>
            <p className="eyebrow">Booking activity</p>
            <h2 id="fd-bookings-title">Recent bookings</h2>
          </div>
          <p className="fd-caption">Latest 5</p>
        </div>

        {bookings.loading ? (
          <div className="fd-empty" role="status">Loading your bookings...</div>
        ) : bookings.error ? (
          <div className="fd-error" role="alert">
            Bookings could not be loaded. {bookings.error}
          </div>
        ) : bookings.data.length === 0 ? (
          <div className="fd-empty">
            <p>No bookings yet.</p>
            <p>Bookings will appear here when clients book your gigs.</p>
          </div>
        ) : (
          <ul className="fd-booking-list">
            {bookings.data.map((booking) => (
              <li className="fd-booking" key={booking.id}>
                <div className="fd-booking-main">
                  <span className="fd-booking-reference">
                    Booking #{booking.id.slice(-6).toUpperCase()}
                  </span>
                  <span className="fd-booking-date">
                    {formatDate(booking.createdAt)}
                  </span>
                </div>
                <div className="fd-booking-meta">
                  <span className="fd-booking-status">{booking.status}</span>
                  <span className="fd-booking-amount">
                    {currencyFormatter.format(booking.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
